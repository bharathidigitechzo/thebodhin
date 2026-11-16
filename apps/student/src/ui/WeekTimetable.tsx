/** Week timetable: week switcher, 7-day strip with class counts, the chosen day's classes. Used by learners and tutors. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { weekDays, weekLabel, weekStart } from '@/core/timetable';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { IconButton, Pill } from '@/ui/kit';

export interface TTItem { id: string; title: string; sub?: string; startsAt: string; endsAt: string; mode: 'online' | 'offline'; clash?: boolean; state?: 'live' | 'upcoming' | 'conducted' }

const t = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function WeekTimetable({ items, offset, onOffset, onPress, empty = 'No classes this day.' }: { items: TTItem[]; offset: number; onOffset: (n: number) => void; onPress?: (it: TTItem) => void; empty?: string }) {
  const { c } = useTheme();
  const start = useMemo(() => weekStart(new Date(), offset), [offset]);
  const days = useMemo(() => weekDays(items, start), [items, start]);
  const todayIdx = days.findIndex((d) => sameDay(d.date, new Date()));
  const [pick, setPick] = useState(todayIdx >= 0 ? todayIdx : 0);
  useEffect(() => { setPick(todayIdx >= 0 ? todayIdx : Math.max(0, days.findIndex((d) => d.items.length))); }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const day = days[pick] ?? days[0];
  const total = days.reduce((n, d) => n + d.items.length, 0);

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.weekBar}>
        <IconButton icon="chevron-back" label="Previous week" onPress={() => onOffset(offset - 1)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="bodyStrong">{offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : weekLabel(start)}</Txt>
          <Txt variant="caption" color={c.muted}>{weekLabel(start)} · {total} class{total === 1 ? '' : 'es'}</Txt>
        </View>
        <IconButton icon="chevron-forward" label="Next week" onPress={() => onOffset(offset + 1)} />
      </View>

      <View style={styles.strip} accessibilityRole="tablist">
        {days.map((d, i) => {
          const on = i === pick;
          const today = sameDay(d.date, new Date());
          const clash = d.items.some((x) => x.clash);
          return (
            <Pressable key={i} onPress={() => setPick(i)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${d.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}, ${d.items.length} classes`} style={[styles.day, { backgroundColor: on ? c.primary : c.surface, borderColor: today && !on ? c.primary : c.border }]}>
              <Txt variant="caption" color={on ? '#fff' : c.muted}>{d.date.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3)}</Txt>
              <Txt variant="bodyStrong" color={on ? '#fff' : c.ink}>{d.date.getDate()}</Txt>
              <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>
                {d.items.slice(0, 3).map((x) => <View key={x.id} style={[styles.dot, { backgroundColor: on ? '#fff' : clash ? c.danger : c.primary }]} />)}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="label" color={c.muted} style={{ padding: 12, paddingBottom: 4 }}>{day.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</Txt>
        {day.items.length === 0 && <Txt color={c.muted} style={{ padding: 16, paddingTop: 6 }}>{empty}</Txt>}
        {day.items.map((it, i) => (
          <Pressable key={it.id} disabled={!onPress} onPress={() => onPress?.(it)} style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${it.title}, ${t(it.startsAt)} to ${t(it.endsAt)}, ${it.mode === 'online' ? 'online' : 'in person'}${it.clash ? ', clash' : ''}`}>
            <View style={{ width: 64 }}>
              <Txt variant="bodyStrong">{t(it.startsAt)}</Txt>
              <Txt variant="caption" color={c.muted}>{t(it.endsAt)}</Txt>
            </View>
            <View style={[styles.bar, { backgroundColor: it.clash ? c.danger : it.state === 'live' ? c.live : it.mode === 'offline' ? c.warning : c.primary }]} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Txt variant="bodyStrong" numberOfLines={2}>{it.title}</Txt>
              {!!it.sub && <Txt variant="caption" color={c.muted} numberOfLines={1}>{it.sub}</Txt>}
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {it.state === 'live' && <Pill text="Live now" tone="live" icon="radio" />}
                {it.state === 'conducted' && <Pill text="Done" tone="neutral" />}
                <Pill text={it.mode === 'online' ? 'Online' : 'In person'} tone={it.mode === 'online' ? 'info' : 'warning'} icon={it.mode === 'online' ? 'videocam-outline' : 'location-outline'} />
                {it.clash && <Pill text="Instructor clash" tone="live" icon="warning-outline" />}
              </View>
            </View>
            {onPress && <Ionicons name="chevron-forward" size={18} color={c.muted} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weekBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  strip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 14, borderWidth: 1, minHeight: 64 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  list: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 64 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});
