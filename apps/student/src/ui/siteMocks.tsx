/** Small living previews of the real product for the public site (phone frame + panels). Data comes from the catalogue, not invented. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Pulse, Sequence, Swap, Traveller, useInView, useReduceMotion } from './motion';
import { PillTabs } from './pickers';

const native = Platform.OS !== 'web';

export function PhoneFrame({ children, height = 430 }: { children: React.ReactNode; height?: number }) {
  const { c } = useTheme();
  return (
    <View style={[styles.phone, { height, borderColor: c.primaryDeep, backgroundColor: c.ivory }]}>
      <View style={[styles.notch, { backgroundColor: c.primaryDeep }]} />
      <View style={{ flex: 1, padding: 12, paddingTop: 22, gap: 10 }}>{children}</View>
    </View>
  );
}

const Line = ({ w, c: col, h = 8 }: { w: number | `${number}%`; c: string; h?: number }) => <View style={{ height: h, width: w, borderRadius: h, backgroundColor: col }} />;

export function CourseSlide({ title, tutor, price, color }: { title: string; tutor: string; price: string; color: string }) {
  const { c } = useTheme();
  return (
    <>
      <View style={{ height: 130, borderRadius: 14, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="play-circle" size={46} color="#fff" /></View>
      <Txt variant="bodyStrong" numberOfLines={2}>{title}</Txt>
      <Txt variant="caption" color={c.muted}>by {tutor}</Txt>
      <View style={{ gap: 6 }}>{['Module 1 · Foundations', 'Module 2 · Practice', 'Module 3 · Project'].map((m, i) => <View key={m} style={[styles.row, { borderColor: c.border, backgroundColor: c.surface }]}><Ionicons name={i === 0 ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={i === 0 ? c.success : c.muted} /><Txt variant="caption" style={{ flex: 1 }}>{m}</Txt></View>)}</View>
      <View style={[styles.cta, { backgroundColor: c.primary }]}><Txt variant="label" color="#fff">Enrol · {price}</Txt></View>
    </>
  );
}

export function LiveSlide() {
  const { c } = useTheme();
  const bubble = (who: string, text: string, me = false) => (
    <View style={{ alignSelf: me ? 'flex-end' : 'flex-start', backgroundColor: me ? c.primarySoft : c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '88%', marginBottom: 6 }}>
      <Txt variant="caption" color={c.muted}>{who}</Txt><Txt variant="caption">{text}</Txt>
    </View>
  );
  return (
    <>
      <View style={{ height: 150, borderRadius: 14, backgroundColor: c.primaryDeep, padding: 10, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#00000055', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}><Pulse color={c.live} size={8} /><Txt variant="caption" color="#fff">LIVE · 128 watching</Txt></View>
        <Txt variant="label" color="#fff">Keyword research with AI tools</Txt>
      </View>
      <Sequence style={{ flex: 1 }}>
        {[bubble('Priya', 'Can we use this for local shops?'), bubble('Tutor', 'Yes — add the city name. Watch this.', true), bubble('Arun', '✋ raised hand'), bubble('Poll', 'Which tool do you use? 62% answered')]}
      </Sequence>
    </>
  );
}

export function PlaygroundSlide() {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const code = 'def total(prices):\n    return sum(prices)\n\nprint(total([799, 1499]))';
  const [n, setN] = useState(reduce ? code.length : 0);
  useEffect(() => {
    if (reduce) { setN(code.length); return; }
    const t = setTimeout(() => setN((x) => (x >= code.length + 26 ? 0 : x + 1)), n >= code.length ? 90 : 38);
    return () => clearTimeout(t);
  }, [n, reduce, code.length]);
  const done = n >= code.length;
  return (
    <>
      <Txt variant="label" color={c.muted}>PLAYGROUND · PYTHON</Txt>
      <View style={{ backgroundColor: '#0E1B33', borderRadius: 12, padding: 12, minHeight: 150 }}><Txt variant="caption" color="#E5E7EB" style={{ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), lineHeight: 20 }}>{code.slice(0, n)}{!done && '▍'}</Txt></View>
      <View style={[styles.cta, { backgroundColor: done ? c.success : c.primary }]}><Txt variant="label" color="#fff">{done ? '✓ Ran in the browser' : 'Run ▶'}</Txt></View>
      <View style={[styles.row, { borderColor: c.border, backgroundColor: c.surface, minHeight: 44 }]}><Txt variant="caption" color={c.muted}>Output</Txt><Txt variant="bodyStrong">{done ? '2298' : ''}</Txt></View>
      <Txt variant="caption" color={done ? c.success : c.muted}>{done ? 'All tests passed · +10 points' : '15 stacks · 27 challenges'}</Txt>
    </>
  );
}

export function CertSlide({ academy }: { academy: string }) {
  const { c } = useTheme();
  return (
    <>
      <Txt variant="label" color={c.muted}>YOUR CERTIFICATE</Txt>
      <View style={{ borderWidth: 4, borderColor: c.accent, borderRadius: 6, backgroundColor: '#FFFDF8', padding: 14, gap: 8, alignItems: 'center' }}>
        <Txt variant="caption" color={c.muted}>{academy}</Txt>
        <Txt variant="label" color={c.primary} style={{ letterSpacing: 1 }}>CERTIFICATE OF COMPLETION</Txt>
        <Txt style={{ fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }), fontSize: 22 }}>Arjun Kumar</Txt>
        <Line w={60} c={c.accent} h={3} />
        <Ionicons name="qr-code-outline" size={34} color={c.ink} />
      </View>
      <View style={[styles.row, { borderColor: c.border, backgroundColor: c.surface }]}><Ionicons name="shield-checkmark" size={16} color={c.success} /><Txt variant="caption" style={{ flex: 1 }}>Verified at thebodhin.com/cert</Txt></View>
      <View style={[styles.cta, { backgroundColor: c.primary }]}><Txt variant="label" color="#fff">Download PDF</Txt></View>
    </>
  );
}

/* ───────── panels for the educator / features pages ───────── */

/** A lead card walking through the pipeline: New → Contacted → Demo → Joined. */
export function PipelinePanel() {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const { ref, seen } = useInView(0.3);
  const stages = ['New', 'Contacted', 'Demo', 'Joined'];
  const [s, setS] = useState(reduce ? 3 : 0);
  useEffect(() => {
    if (!seen || reduce) return;
    const t = setTimeout(() => setS((x) => (x + 1) % 4), s === 3 ? 2600 : 1300);
    return () => clearTimeout(t);
  }, [seen, reduce, s]);
  return (
    <View ref={ref} style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`Lead pipeline demo. The lead is in stage ${stages[s]}`}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {stages.map((st, i) => (
          <View key={st} style={{ flex: 1, gap: 6 }}>
            <Txt variant="caption" color={i === s ? c.primary : c.muted} center>{st}</Txt>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= s ? (s === 3 ? c.success : c.primary) : c.surfaceMuted }} />
            <View style={{ minHeight: 64 }}>
              {i === s && <View style={{ borderWidth: 1, borderColor: s === 3 ? c.success : c.primary, borderRadius: 10, padding: 6, backgroundColor: s === 3 ? c.successBg : c.primarySoft }}><Txt variant="caption" numberOfLines={1}>Priya S</Txt><Txt variant="caption" color={c.muted} numberOfLines={1}>{s === 3 ? '₹8,999 paid' : 'SEO course'}</Txt></View>}
            </View>
          </View>
        ))}
      </View>
      <Txt variant="caption" color={c.muted}>{['Enquiry from your website form', 'Follow-up reminder: call at 6 pm', 'Demo class booked for Saturday', 'Enrolled — welcome message sent automatically'][s]}</Txt>
    </View>
  );
}

/** Revenue bars that grow in when seen. */
export function BarsPanel({ title, rows }: { title: string; rows: { label: string; pct: number; value: string }[] }) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const { ref, seen } = useInView(0.3);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!seen) return;
    if (reduce) { a.setValue(1); return; }
    Animated.timing(a, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [seen, reduce, a]);
  return (
    <View ref={ref} style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="caption">{r.label}</Txt><Txt variant="label">{r.value}</Txt></View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceMuted, overflow: 'hidden' }}>
            <Animated.View style={{ height: 8, borderRadius: 4, width: `${r.pct}%`, backgroundColor: c.primary, transformOrigin: 'left', transform: [{ scaleX: a }] } as never} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A checklist whose ticks arrive one by one. */
export function ChecklistPanel({ title, items }: { title: string; items: string[] }) {
  const { c } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt>
      <Sequence step={700} hold={3000} style={{ gap: 8 }}>
        {items.map((t) => <View key={t} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name="checkmark-circle" size={18} color={c.success} /><Txt variant="caption" style={{ flex: 1 }}>{t}</Txt></View>)}
      </Sequence>
    </View>
  );
}

/** Tutor's site assembling section by section. */
export function SitePanel({ host }: { host: string }) {
  const { c } = useTheme();
  const block = (h: number, col: string, label: string) => <View key={label} style={{ height: h, borderRadius: 8, backgroundColor: col, justifyContent: 'center', paddingHorizontal: 10, marginBottom: 6 }}><Txt variant="caption" color={col === c.primary ? '#fff' : c.inkSoft}>{label}</Txt></View>;
  return (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surfaceMuted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}><Ionicons name="lock-closed" size={12} color={c.success} /><Txt variant="caption" color={c.inkSoft}>{host}</Txt></View>
      <Sequence step={650} hold={2800}>
        {[block(54, c.primary, 'Hero · Learn with your academy'), block(34, c.primarySoft, 'Courses'), block(30, c.surfaceMuted, 'Student stories'), block(30, c.surfaceMuted, 'Book a 1:1'), block(34, c.warningBg, 'Enquiry form → your CRM')]}
      </Sequence>
    </View>
  );
}

/** Where a student's fee goes — animated, with the platform's real rates. Toggle between your own student and a marketplace sale. */
export function MoneyFlow({ data }: { data: { price: number; direct: { you: number; bodhin: number; gateway: number }; marketplace: { you: number; bodhin: number; gateway: number }; commissionPct: number; gatewayPct: number } }) {
  const { c } = useTheme();
  const [mode, setMode] = useState<'direct' | 'marketplace'>('direct');
  const [w, setW] = useState(0);
  const d = data[mode];
  const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const node = (icon: string, top: string, amount: string, tone: 'plain' | 'strong') => (
    <View style={{ alignItems: 'center', gap: 4, width: 96 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'strong' ? c.primaryDeep : c.primarySoft }}><Ionicons name={icon as never} size={26} color={tone === 'strong' ? c.accent : c.primary} /></View>
      <Txt variant="caption" color={c.muted} center>{top}</Txt>
      <Swap value={amount}><Txt variant="heading" center>{amount}</Txt></Swap>
    </View>
  );
  return (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border, gap: 16 }]} accessibilityLabel={mode === 'direct' ? `Your own student pays ${rupee(data.price)}. You receive ${rupee(d.you)}. Bodhin takes nothing.` : `A student who found you on Bodhin pays ${rupee(data.price)}. Bodhin keeps ${rupee(d.bodhin)}, gateway fee ${rupee(d.gateway)}, you receive ${rupee(d.you)}.`}>
      <PillTabs tabs={[{ id: 'direct', label: 'Your own student' }, { id: 'marketplace', label: 'Found you on Bodhin' }]} value={mode} onChange={setMode} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {node('person-outline', 'Student pays', rupee(data.price), 'plain')}
        <View style={{ flex: 1, height: 56, justifyContent: 'center' }}>
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 2, backgroundColor: c.borderStrong }}>
            <Traveller key={`${mode}a`} color={c.accent} width={w} />
            <Traveller key={`${mode}b`} color={c.accent} width={w} delay={550} />
            <Traveller key={`${mode}c`} color={c.accent} width={w} delay={1100} />
          </View>
        </View>
        {node('wallet-outline', 'You receive', rupee(d.you), 'strong')}
      </View>
      {mode === 'direct' ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.successBg, borderRadius: 12, padding: 10 }}><Ionicons name="checkmark-circle" size={18} color={c.success} /><Txt variant="caption" style={{ flex: 1 }}>Paid through your own gateway, straight to your bank. Bodhin takes ₹0. (Your gateway charges its usual fee.)</Txt></View>
      ) : (
        <Sequence key="mk" step={500} hold={60000} style={{ gap: 6 }}>
          {[
            <View key="a" style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.warningBg, borderRadius: 12, padding: 10 }}><Txt variant="caption">Bodhin marketplace commission ({data.commissionPct}%)</Txt><Txt variant="label">− {rupee(d.bodhin)}</Txt></View>,
            <View key="b" style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.surfaceMuted, borderRadius: 12, padding: 10 }}><Txt variant="caption">Payment gateway fee ({data.gatewayPct}%)</Txt><Txt variant="label">− {rupee(d.gateway)}</Txt></View>,
            <Txt key="c" variant="caption" color={c.muted}>Bodhin collects, then pays you weekly. Listing on the marketplace is your choice for each course.</Txt>,
          ]}
        </Sequence>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  phone: { width: 250, borderWidth: 8, borderRadius: 34, overflow: 'hidden', alignSelf: 'center' },
  notch: { position: 'absolute', top: 6, alignSelf: 'center', width: 70, height: 8, borderRadius: 4, zIndex: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  cta: { borderRadius: 12, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  panel: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
});
