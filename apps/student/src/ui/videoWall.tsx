/** Floating wall of free videos from educators who opted in to promotion, plus the preview player sheet. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { showcaseApi } from '@/api/growth2';
import { clipLength } from '@/core/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';
import { BottomSheet } from './kit';
import { Marquee, useReduceMotion } from './motion';
import { inr } from './section';

type Row = ReturnType<typeof showcaseApi.wall>['rows'][number];
const native = Platform.OS !== 'web';

export function VideoTile({ x, onPlay, w = 220 }: { x: Row; onPlay: (x: Row) => void; w?: number }) {
  const { c } = useTheme();
  const a = useRef(new Animated.Value(0)).current;
  const to = (v: number) => Animated.timing(a, { toValue: v, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  return (
    <Pressable onPress={() => onPlay(x)} onHoverIn={() => to(1)} onHoverOut={() => to(0)} onPressIn={() => to(-1)} onPressOut={() => to(0)} accessibilityRole="button" accessibilityLabel={`Play free video: ${x.c.title}, by ${x.tutor?.name ?? 'educator'}, ${clipLength(x.c.durationSec)}`} style={{ marginRight: 12 }}>
      <Animated.View style={[styles.tile, { width: w, borderColor: c.border, backgroundColor: c.surface, transform: [{ scale: a.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.97, 1, 1.03] }) }] }]}>
        <View style={[styles.thumb, { backgroundColor: x.tutor?.color ?? c.primaryDeep }]}>
          <Txt variant="caption" color="#ffffffcc" numberOfLines={1} style={{ position: 'absolute', top: 8, left: 10, right: 10 }}>{x.category}</Txt>
          <View style={styles.play}><Ionicons name="play" size={18} color={c.primaryDeep} /></View>
          <View style={styles.len}><Txt variant="caption" color="#fff">{clipLength(x.c.durationSec)}</Txt></View>
        </View>
        <View style={{ padding: 10, gap: 2 }}>
          <Txt variant="label" numberOfLines={1}>{x.c.title}</Txt>
          <Txt variant="caption" color={c.muted} numberOfLines={1}>{x.tutor?.name} · {x.course.title}</Txt>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Several rows drifting in opposite directions. Hover/press a tile to lift it; tap to play. */
export function VideoWall({ rows, onPlay, lanes = 3 }: { rows: Row[]; onPlay: (x: Row) => void; lanes?: number }) {
  const per = Math.max(4, Math.ceil(rows.length / lanes));
  const L = Array.from({ length: lanes }, (_, i) => rows.slice(i * per, i * per + per)).filter((l) => l.length);
  return (
    <View style={{ gap: 12 }}>
      {L.map((lane, i) => (
        <View key={i} style={{ transform: [{ scaleX: i % 2 ? -1 : 1 }] }}>
          <Marquee speed={18 + i * 6}>
            {lane.map((x) => <View key={x.c.id} style={{ transform: [{ scaleX: i % 2 ? -1 : 1 }] }}><VideoTile x={x} onPlay={onPlay} /></View>)}
          </Marquee>
        </View>
      ))}
    </View>
  );
}

/** Preview player (POC: simulated playback clock like the lesson player; real: signed HLS stream of the clip). */
export function PreviewSheet({ x, onClose }: { x: Row | null; onClose: () => void }) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const total = Math.min(x?.c.durationSec ?? 60, 45); // demo clock caps at 45 s
  useEffect(() => { setT(0); setPlaying(!!x && !reduce); if (x) showcaseApi.played(x.c.id); }, [x, reduce]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((v) => { if (v + 1 >= total) { setPlaying(false); return total; } return v + 1; }), 1000);
    return () => clearInterval(id);
  }, [playing, total]);
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <BottomSheet open={!!x} onClose={onClose} title={x?.c.title ?? ''}>
      {x && (
        <View style={{ gap: 12 }}>
          <Pressable onPress={() => setPlaying(!playing)} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={[styles.screen, { backgroundColor: x.tutor?.color ?? c.primaryDeep }]}>
            <Ionicons name={playing ? 'pause-circle' : t >= total ? 'refresh-circle' : 'play-circle'} size={56} color="#fff" />
            <Txt variant="caption" color="#ffffffcc" style={{ position: 'absolute', top: 10, left: 12 }}>Free video · {x.tutor?.name}</Txt>
            <View style={styles.bar}><View style={{ height: 4, width: `${(t / total) * 100}%`, backgroundColor: c.accent, borderRadius: 2 }} /></View>
            <Txt variant="caption" color="#fff" style={{ position: 'absolute', bottom: 14, right: 12 }}>{mm(t)} / {mm(total)}</Txt>
          </Pressable>
          <Txt variant="caption" color={c.muted}>From “{x.course.title}” · {x.course.students.toLocaleString('en-IN')} learners · ★ {x.course.rating.toFixed(1)}</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={`Join · ${x.course.priceInr ? inr(x.course.priceInr) : 'Free'}`} style={{ flex: 1 }} onPress={() => { onClose(); router.push({ pathname: '/course/[id]', params: { id: x.course.id, ref: 'campaign' } }); }} />
            <Button title="More videos" variant="outline" onPress={() => { onClose(); router.push('/watch'); }} />
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  thumb: { height: 124, alignItems: 'center', justifyContent: 'center' },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffffee', alignItems: 'center', justifyContent: 'center' },
  len: { position: 'absolute', right: 8, bottom: 8, backgroundColor: '#00000088', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  screen: { aspectRatio: 16 / 9, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bar: { position: 'absolute', left: 12, right: 12, bottom: 38, height: 4, borderRadius: 2, backgroundColor: '#ffffff44' },
});
