/**
 * Smart board. Write by hand in any language → it becomes neat typed text where you wrote it.
 * Draw a wobbly box / circle / triangle / line / arrow → it snaps to a clean shape (Neat mode).
 * Learners see the same board live (read-only). Visibility of status: the top bar always says what
 * the board is doing (Neat on/off · language · engine · "Making it neat…").
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  INK_LANGS, applyOp, hitItem, joinsGroup, langOf, recogniseShape, scriptOf, shapePath, smooth, textPlacement,
  type BoardItem, type BoardOp, type InkItem, type Pt, type TPt, type TextItem, type TimedStroke,
} from '@/core/ink';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';
import { BottomSheet, Chip } from './kit';
import { useReduceMotion } from './motion';
import { getRecogniser, type Recogniser } from './ink/recognizer';

const COLORS = ['#111827', '#1D4ED8', '#B91C1C', '#047857', '#B45309'];
const uid = () => Math.random().toString(36).slice(2, 10);
const toD = (pts: Pt[], W: number, H: number) => pts.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * W).toFixed(1)} ${(p[1] * H).toFixed(1)}`).join(' ');
type Tool = 'pen' | 'eraser' | 'type';

/** Fades/scales an item in when it appears — the "it became neat" moment. */
function Pop({ children, style }: { children: React.ReactNode; style?: object }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => { if (!reduce) Animated.timing(a, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(1.6)), useNativeDriver: Platform.OS !== 'web' }).start(); }, [a, reduce]);
  return <Animated.View pointerEvents="box-none" style={[style, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>{children}</Animated.View>;
}

export function BoardCanvas({ items, live, pending, onLayoutSize, onTextPress, children, panHandlers }: {
  items: BoardItem[]; live?: { pts: Pt[]; color: string; w: number } | null; pending?: Set<string>;
  onLayoutSize?: (w: number, h: number) => void; onTextPress?: (t: TextItem) => void; children?: React.ReactNode; panHandlers?: object;
}) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const { w: W, h: H } = size;
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setSize({ w: width, h: height }); onLayoutSize?.(width, height); }} {...panHandlers}>
      <Svg width="100%" height="100%" pointerEvents="none">
        {items.map((it) => it.kind === 'ink'
          ? <Path key={it.id} d={toD(it.pts, W, H)} stroke={it.color} strokeOpacity={pending?.has(it.id) ? 0.55 : 1} strokeWidth={it.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          : it.kind === 'shape' ? <Path key={it.id} d={shapePath(it, W, H)} stroke={it.color} strokeWidth={it.w} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null)}
        {live && <Path d={toD(live.pts, W, H)} stroke={live.color} strokeWidth={live.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </Svg>
      {items.filter((i): i is TextItem => i.kind === 'text').map((t) => (
        <Pop key={t.id} style={{ position: 'absolute', left: t.x * W, top: t.y * H }}>
          <Pressable disabled={!onTextPress} onPress={() => onTextPress?.(t)} accessibilityRole={onTextPress ? 'button' : 'text'} accessibilityLabel={`${t.text}${onTextPress ? '. Tap for options' : ''}`} hitSlop={6}>
            <Txt style={{ fontSize: Math.max(12, t.h * H), lineHeight: Math.max(16, t.h * H * 1.25), fontFamily: Platform.select({ web: `"${langOf(scriptOf(t.text)).font}", system-ui, sans-serif`, default: undefined }), fontWeight: '600' }} color={t.color}>{t.text}</Txt>
          </Pressable>
        </Pop>
      ))}
      {children}
    </View>
  );
}

/** Read-only board for learners (items arrive over the live-class data channel). */
export function BoardView({ items }: { items: BoardItem[] }) {
  const { c } = useTheme();
  return (
    <View style={[styles.surface, { backgroundColor: '#FFFFFF' }]} accessibilityLabel={`Whiteboard. ${items.filter((i) => i.kind === 'text').map((i) => (i as TextItem).text).join(', ') || 'Empty'}`}>
      <BoardCanvas items={items} />
      {!items.length && <Txt variant="caption" color={c.muted} style={styles.hint} pointerEvents="none">The tutor’s board will appear here</Txt>}
    </View>
  );
}

/** Full smart board for the tutor. `onOp` receives every change (sent to learners in a live class). */
export function SmartBoard({ onOp, compact, initial = [] }: { onOp?: (op: BoardOp) => void; compact?: boolean; initial?: BoardItem[] }) {
  const { c } = useTheme();
  const [items, setItems] = useState<BoardItem[]>(initial);
  const [undo, setUndo] = useState<BoardItem[][]>([]);
  const [redo, setRedo] = useState<BoardItem[][]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [neat, setNeat] = useState(true);
  const [lang, setLang] = useState('en');
  const [langOpen, setLangOpen] = useState(false);
  const [engine, setEngine] = useState<Recogniser | null>(null);
  const [langReady, setLangReady] = useState<'checking' | 'ready' | 'unsupported'>('checking');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [live, setLive] = useState<{ pts: Pt[]; color: string; w: number } | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<TextItem | null>(null);
  const [typing, setTyping] = useState<{ x: number; y: number; text: string } | null>(null);

  const size = useRef({ w: 1, h: 1 });
  const cur = useRef<{ pts: TPt[]; t0: number } | null>(null);
  const typeAt = useRef<Pt | null>(null);
  const group = useRef<(TimedStroke & { tpts: TPt[] })[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const st = useRef({ tool, color, neat, lang, items, engine, langReady });
  st.current = { tool, color, neat, lang, items, engine, langReady };

  useEffect(() => { getRecogniser().then(setEngine); }, []);
  useEffect(() => {
    if (!engine) return;
    setLangReady('checking');
    engine.prepare(lang).then((ok) => setLangReady(ok ? 'ready' : 'unsupported')).catch(() => setLangReady('unsupported'));
  }, [engine, lang]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 2600); return () => clearTimeout(t); }, [note]);

  /** Apply + broadcast, with undo history. */
  const commit = (op: BoardOp, history = true) => {
    setItems((prev) => {
      if (history) { setUndo((u) => [...u.slice(-49), prev]); setRedo([]); }
      return applyOp(prev, op);
    });
    onOp?.(op);
  };

  const flushGroup = async (customGroup?: (TimedStroke & { tpts: TPt[] })[]) => {
    const g = customGroup ?? [...group.current];
    if (!customGroup) group.current = [];
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const s = st.current;
    if (!g.length || !s.engine || s.engine.engine === 'none' || s.langReady !== 'ready') { setPending(new Set()); return; }
    setBusy(true);
    try {
      const area = { w: size.current.w, h: size.current.h };
      const cands = (await s.engine.recognise(g.map((x) => x.tpts), s.lang, area)).map((x) => x.trim()).filter(Boolean);
      if (cands.length) {
        const ids = g.map((x) => x.id);
        const ink = st.current.items.filter((i): i is InkItem => i.kind === 'ink' && ids.includes(i.id));
        const place = textPlacement(g.map((x) => x.pts));
        const text: TextItem = { id: uid(), kind: 'text', text: cands[0].slice(0, 200), lang: s.lang, color: ink[0]?.color ?? s.color, ...place, alts: cands.slice(1, 5), ink };
        commit({ t: 'board_put', item: text, replaces: ids });
      }
    } catch {
      setNote('Couldn’t read that — kept your handwriting.');
    } finally {
      setBusy(false);
      setPending(new Set());
    }
  };

  const neatenAll = async () => {
    if (group.current.length) {
      await flushGroup();
      return;
    }
    const inkItems = st.current.items.filter((i): i is InkItem => i.kind === 'ink');
    if (!inkItems.length) return;
    const strokes = inkItems.map((it, idx) => ({
      id: it.id,
      pts: it.pts,
      t0: idx * 200,
      t1: idx * 200 + it.pts.length * 10,
      tpts: it.pts.map(([x, y], pIdx) => [x, y, pIdx * 10] as TPt),
    }));
    await flushGroup(strokes);
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      const p: Pt = [x / size.current.w, y / size.current.h];
      if (st.current.tool === 'type') { typeAt.current = p; return; }
      if (st.current.tool === 'eraser') { const id = hitItem(st.current.items, p, 0.025, size.current.w / size.current.h); if (id) commit({ t: 'board_del', ids: [id] }); return; }
      if (timer.current) clearTimeout(timer.current);
      cur.current = { pts: [[p[0], p[1], 0]], t0: Date.now() };
      setLive({ pts: [p], color: st.current.color, w: 3 });
    },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      const p: Pt = [x / size.current.w, y / size.current.h];
      if (st.current.tool === 'type') return;
      if (st.current.tool === 'eraser') { const id = hitItem(st.current.items, p, 0.025, size.current.w / size.current.h); if (id) commit({ t: 'board_del', ids: [id] }, false); return; }
      const s = cur.current;
      if (!s) return;
      s.pts.push([p[0], p[1], Date.now() - s.t0]);
      setLive((l) => (l ? { ...l, pts: [...l.pts, p] } : l));
    },
    onPanResponderRelease: () => {
      if (typeAt.current) { const p = typeAt.current; typeAt.current = null; setTimeout(() => setTyping({ x: p[0], y: p[1], text: '' }), 0); return; }
      const s = cur.current;
      cur.current = null;
      setLive(null);
      if (!s || !s.pts.length) return;
      // Single-point tap: expand into a small dot so dots on 'i', 'j', accents and pulli are captured
      let strokePts = s.pts;
      if (strokePts.length === 1) {
        const [px, py, pt] = strokePts[0];
        strokePts = [[px, py, pt], [px + 0.0015, py + 0.0015, pt + 10]];
      }
      const raw: Pt[] = strokePts.map((q) => [q[0], q[1]]);
      const { neat: isNeat, color: col } = st.current;
      // If we are already writing a word, do not snap individual letter strokes to geometric shapes!
      if (isNeat && group.current.length === 0) {
        const shape = recogniseShape(raw, size.current.w / size.current.h);
        if (shape) { commit({ t: 'board_put', item: { id: uid(), kind: 'shape', color: col, w: 3, ...shape } }); return; }
      }
      const item: InkItem = { id: uid(), kind: 'ink', color: col, w: 3, pts: smooth(raw).slice(0, 600) };
      commit({ t: 'board_put', item });
      if (!isNeat) return;
      const timed = { id: item.id, pts: raw, t0: s.t0, t1: s.t0 + (strokePts[strokePts.length - 1][2] ?? 0), tpts: strokePts };
      if (!joinsGroup(group.current, timed)) {
        const prev = [...group.current];
        group.current = [];
        if (prev.length) {
          flushGroup(prev);
        }
      }
      group.current.push(timed);
      setPending(new Set(group.current.map((g) => g.id)));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flushGroup(), 1500);
    },
    onPanResponderTerminate: () => { cur.current = null; setLive(null); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const placeTyped = () => {
    if (!typing?.text.trim()) { setTyping(null); return; }
    const text = typing.text.trim().slice(0, 200);
    commit({ t: 'board_put', item: { id: uid(), kind: 'text', text, lang: scriptOf(text), color, x: typing.x, y: typing.y, h: 0.07 } });
    setTyping(null);
  };

  const undoIt = () => { const prev = undo[undo.length - 1]; if (!prev) return; setRedo((r) => [...r, items]); setUndo((u) => u.slice(0, -1)); setItems(prev); onOp?.({ t: 'board_clear' }); prev.forEach((item) => onOp?.({ t: 'board_put', item })); };
  const redoIt = () => { const nxt = redo[redo.length - 1]; if (!nxt) return; setUndo((u) => [...u, items]); setRedo((r) => r.slice(0, -1)); setItems(nxt); onOp?.({ t: 'board_clear' }); nxt.forEach((item) => onOp?.({ t: 'board_put', item })); };

  const L = langOf(lang);
  const status = !neat ? { dot: c.muted, text: 'Free drawing — Neat mode off' }
    : busy ? { dot: c.accent, text: 'Making it neat…' }
    : !engine || langReady === 'checking' ? { dot: c.accent, text: `Getting ${L.native} ready…` }
    : engine.engine === 'none' ? { dot: c.warning, text: 'Shapes snap · handwriting stays as ink here (use T to type)' }
    : langReady === 'unsupported' ? { dot: c.warning, text: `${L.native} handwriting not available here · shapes still snap` }
    : { dot: c.success, text: `Neat on · ${L.native} · ${engine.label}` };

  const toolBtn = (k: Tool, icon: string, label: string) => (
    <Pressable key={k} onPress={() => setTool(k)} accessibilityRole="radio" accessibilityState={{ checked: tool === k }} accessibilityLabel={label} style={[styles.tbtn, { backgroundColor: tool === k ? c.primarySoft : 'transparent' }]}>
      <Ionicons name={icon as never} size={20} color={tool === k ? c.primary : c.inkSoft} />
    </Pressable>
  );
  const small = (icon: string, label: string, onPress: () => void, disabled?: boolean) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={[styles.tbtn, { opacity: disabled ? 0.35 : 1 }]}><Ionicons name={icon as never} size={20} color={c.inkSoft} /></Pressable>
  );

  return (
    <View style={{ flex: 1, gap: 8 }}>
      {/* status — always visible */}
      <View style={[styles.status, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLiveRegion="polite">
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: status.dot }} />
        <Txt variant="caption" color={c.inkSoft} style={{ flex: 1 }} numberOfLines={1}>{note ?? status.text}</Txt>
        <Pressable onPress={() => setLangOpen(true)} accessibilityRole="button" accessibilityLabel={`Writing language: ${L.label}. Change`} style={[styles.lang, { borderColor: c.border }]}>
          <Ionicons name="language-outline" size={16} color={c.primary} /><Txt variant="label" color={c.primary}>{L.native}</Txt>
        </Pressable>
        <Pressable onPress={() => { const nxt = !neat; setNeat(nxt); if (nxt) neatenAll(); }} accessibilityRole="switch" accessibilityState={{ checked: neat }} accessibilityLabel="Neat mode" style={[styles.lang, { borderColor: neat ? c.accent : c.border, backgroundColor: neat ? c.warningBg : 'transparent' }]}>
          <Ionicons name="sparkles" size={16} color={neat ? c.accent : c.muted} /><Txt variant="label" color={neat ? c.ink : c.muted}>Neat</Txt>
        </Pressable>
      </View>

      {/* board */}
      <View style={[styles.surface, { backgroundColor: '#FFFFFF', borderColor: c.border, minHeight: compact ? 220 : 320 }]} accessibilityLabel="Smart board. Write or draw.">
        <BoardCanvas items={items} live={live} pending={pending} onLayoutSize={(w, h) => { size.current = { w, h }; }} onTextPress={tool === 'type' ? undefined : setSel} panHandlers={typing ? undefined : pan.panHandlers}>
          {typing && (
            <View style={{ position: 'absolute', left: `${typing.x * 100}%`, top: `${typing.y * 100}%`, minWidth: 160 }}>
              <TextInput autoFocus value={typing.text} onChangeText={(v) => setTyping({ ...typing, text: v })} onSubmitEditing={placeTyped} onBlur={placeTyped} placeholder="Type in any language…" style={[styles.typeIn, { borderColor: c.primary, color }]} accessibilityLabel="Text for the board" />
            </View>
          )}
        </BoardCanvas>
        {!items.length && !live && !typing && <Txt variant="caption" color={c.muted} style={styles.hint} pointerEvents="none">{tool === 'type' ? 'Tap where you want to type' : 'Write a word or draw a box, circle or arrow…'}</Txt>}
      </View>

      {/* tools — bottom, in thumb reach */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, alignSelf: 'center', maxWidth: '100%' }} contentContainerStyle={[styles.bar, { backgroundColor: c.surface, borderColor: c.border }]}>
        {toolBtn('pen', 'create-outline', 'Pen')}
        {toolBtn('eraser', 'backspace-outline', 'Eraser — touch an item to remove it')}
        {toolBtn('type', 'text-outline', 'Type text')}
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        {COLORS.map((col) => <Pressable key={col} onPress={() => { setColor(col); if (tool === 'eraser') setTool('pen'); }} accessibilityRole="radio" accessibilityState={{ checked: color === col }} accessibilityLabel={`Colour ${col}`} style={[styles.swatch, { backgroundColor: col, borderColor: color === col ? c.accent : '#fff' }]} />)}
        <View style={[styles.sep, { backgroundColor: c.border }]} />
        {small('arrow-undo', 'Undo', undoIt, !undo.length)}
        {small('arrow-redo', 'Redo', redoIt, !redo.length)}
        {small('trash-outline', 'Clear board', () => commit({ t: 'board_clear' }), !items.length)}
      </ScrollView>

      <BottomSheet open={langOpen} onClose={() => setLangOpen(false)} title="Writing language">
        <Txt variant="caption" color={c.muted}>Pick the language you will write in. The first time, your phone downloads it once (about 20 MB), then it works offline.</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {INK_LANGS.map((l) => <Chip key={l.tag} label={`${l.native}${l.native !== l.label ? ` · ${l.label}` : ''}`} active={lang === l.tag} onPress={() => { setLang(l.tag); setLangOpen(false); }} />)}
        </View>
      </BottomSheet>

      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.text ?? ''}>
        {sel && (
          <View style={{ gap: 10 }}>
            {!!sel.alts?.length && <Txt variant="label">Did you mean</Txt>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {sel.alts?.map((a) => <Chip key={a} label={a} onPress={() => { commit({ t: 'board_put', item: { ...sel, text: a, alts: [sel.text, ...(sel.alts ?? []).filter((x) => x !== a)].slice(0, 4) } }); setSel(null); }} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!!sel.ink?.length && <Button title="Back to handwriting" variant="outline" size="md" style={{ flex: 1 }} onPress={() => { commit({ t: 'board_del', ids: [sel.id] }); sel.ink!.forEach((item) => commit({ t: 'board_put', item }, false)); setSel(null); }} />}
              <Button title="Delete" variant="outline" size="md" style={{ flex: 1 }} onPress={() => { commit({ t: 'board_del', ids: [sel.id] }); setSel(null); }} />
            </View>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  hint: { position: 'absolute', top: 12, left: 14 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, minHeight: 44 },
  lang: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, minHeight: 34 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 16, padding: 4 },
  tbtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, marginHorizontal: 3 },
  sep: { width: 1, height: 28, marginHorizontal: 4 },
  typeIn: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 22, backgroundColor: '#fff' },
});
