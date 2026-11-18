/** Educator Live tab: live now, upcoming by day, conducted (summary + recording), live-hours usage. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { liveAdmin, type UnifiedSession } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { AppHeader, Chip, Pill, ProgressBar, Skeleton } from '@/ui/kit';

type Data = Awaited<ReturnType<typeof liveAdmin.list>>;
type Seg = 'upcoming' | 'conducted' | 'cancelled';
const tm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayKey = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t.getTime()) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
};

export default function LiveTab() {
  const { width } = useWindowDimensions();
  const headerHasAction = width >= 1024; // AppHeader shows "Schedule" itself on wide screens
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [data, setData] = useState<Data | null>(null);
  const [seg, setSeg] = useState<Seg>('upcoming');
  useFocusEffect(useCallback(() => { liveAdmin.list(userId).then(setData); }, [userId]));

  const list = data ? data[seg] : [];
  const groups: { day: string; rows: UnifiedSession[] }[] = [];
  list.forEach((s) => {
    const k = dayKey(s.startsAt);
    const g = groups.find((x) => x.day === k);
    if (g) g.rows.push(s);
    else groups.push({ day: k, rows: [s] });
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <AppHeader profileHref="/educator/more" action={{ title: 'Schedule', onPress: () => router.push('/edu/schedule') }} />
            {/* Schedule sits beside the title (no floating button covering the class list). */}
            <View style={styles.titleRow}>
              <Txt variant="title" style={{ flex: 1 }}>Live classes</Txt>
              {!headerHasAction && <Button title="Schedule" iconLeft="add" size="md" onPress={() => router.push('/edu/schedule')} />}
            </View>
            {!data ? (
              <View style={{ gap: 12 }}><Skeleton h={150} r={20} /><Skeleton h={70} /><Skeleton h={70} /></View>
            ) : (
              <>
                {data.live.map((s) => (
                  <LinearGradient key={s.id} colors={['#071F44', '#12407F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liveCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pill text={s.started ? 'LIVE NOW' : 'READY TO START'} tone={s.started ? 'live' : 'warning'} icon="radio" />
                      <Txt variant="caption" color="rgba(255,255,255,0.75)">{s.started ? `Started ${Math.max(1, Math.round((Date.now() - new Date(s.startedAt ?? s.startsAt).getTime()) / 6e4))} min ago` : 'Students are waiting — start when you are ready'}</Txt>
                    </View>
                    <Txt variant="heading" color="#fff">{s.title}</Txt>
                    <Txt variant="label" color="rgba(255,255,255,0.8)" style={{ fontWeight: '500' }}>{s.batchName ?? data.courseOf(s.courseId).title} · {tm(s.startsAt)} – {tm(s.endsAt)}</Txt>
                     <Button title={s.started ? 'Return to class' : 'Start class'} iconRight="arrow-forward" style={{ backgroundColor: '#E8A21B', marginTop: 4 }} onPress={() => router.push({ pathname: '/edu/prejoin/[id]', params: { id: s.id } })} />
                  </LinearGradient>
                ))}

                <Pressable onPress={() => router.push('/edu/timetable')} accessibilityRole="button" accessibilityLabel="Open week timetable" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.primarySoft }}>
                  <Ionicons name="grid-outline" size={22} color={c.primary} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">Week timetable</Txt>
                    <Txt variant="caption" color={c.inkSoft}>All batches day by day · clashes flagged</Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.muted} />
                </Pressable>
                <View style={styles.stats}>
                  <Stat v={String(data.stats.upcoming)} l="Upcoming" />
                  <Stat v={String(data.stats.conducted)} l="Conducted" />
                  <Stat v={data.stats.attendance == null ? '—' : `${data.stats.attendance}%`} l="Avg attendance" />
                </View>

                <View style={[styles.hours, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Txt variant="label">Live room-hours this month</Txt>
                    <Txt variant="label" color={data.hours.level === 'ok' ? c.inkSoft : data.hours.level === 'warn' ? c.warning : c.danger}>{data.hours.used} / {data.hours.limit ?? '∞'} h</Txt>
                  </View>
                  <ProgressBar pct={data.hours.pct} color={data.hours.level === 'ok' ? c.primary : data.hours.level === 'warn' ? c.warning : c.danger} />
                  {data.hours.level !== 'ok' && <Txt variant="caption" color={c.muted}>Running classes are never cut. At 100%, new classes can’t be scheduled until you top up or the month resets.</Txt>}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Chip label={`Upcoming (${data.upcoming.length})`} active={seg === 'upcoming'} onPress={() => setSeg('upcoming')} />
                  <Chip label={`Past (${data.conducted.length})`} active={seg === 'conducted'} onPress={() => setSeg('conducted')} />
                  {data.cancelled.length > 0 && <Chip label={`Cancelled (${data.cancelled.length})`} active={seg === 'cancelled'} onPress={() => setSeg('cancelled')} />}
                </View>

                {groups.length === 0 && (
                  <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Ionicons name="calendar-clear-outline" size={34} color={c.muted} />
                    <Txt color={c.muted} center>{seg === 'upcoming' ? 'No classes scheduled. Tap “Schedule” to add one.' : 'Nothing here yet.'}</Txt>
                  </View>
                )}
                {groups.slice(0, seg === 'conducted' ? 8 : 12).map((g) => (
                  <View key={g.day} style={{ gap: 8 }}>
                    <Txt variant="label" color={c.muted}>{g.day.toUpperCase()}</Txt>
                    <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
                      {g.rows.map((s, i) => (
                        <Pressable
                          key={s.id}
                          onPress={() => (s.state === 'conducted' ? router.push({ pathname: '/edu/summary/[id]', params: { id: s.id } }) : s.batchId ? router.push({ pathname: '/edu/batch/[id]', params: { id: s.batchId, tab: 'schedule' } }) : router.push({ pathname: '/edu/prejoin/[id]', params: { id: s.id } }))}
                          style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { opacity: 0.8 }]}
                          accessibilityRole="button"
                          accessibilityLabel={`${s.title}, ${dayKey(s.startsAt)} ${tm(s.startsAt)}`}
                        >
                          <View style={[styles.time, { backgroundColor: s.state === 'conducted' ? c.surfaceMuted : c.primarySoft }]}>
                            <Txt variant="label" color={c.primaryDeep}>{tm(s.startsAt).replace(' ', '\n')}</Txt>
                          </View>
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Txt variant="bodyStrong" numberOfLines={2} style={s.state === 'cancelled' ? { textDecorationLine: 'line-through' } : undefined}>{s.title}</Txt>
                            <Txt variant="caption" color={c.muted} numberOfLines={1}>{s.batchName ?? `${data.courseOf(s.courseId).title} · all learners`}</Txt>
                          </View>
                          {s.state === 'conducted' ? <Pill text="Summary" tone="success" icon="play-circle" /> : s.state === 'upcoming' && new Date(s.startsAt).getTime() - Date.now() < 30 * 6e4 ? (
                            <Button title="Start" size="md" style={{ backgroundColor: '#E8A21B' }} onPress={() => router.push({ pathname: '/edu/prejoin/[id]', params: { id: s.id } })} />
                          ) : <Ionicons name="chevron-forward" size={18} color={c.muted} />}
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt>
      <Txt variant="caption" color={c.muted} numberOfLines={2}>{l}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 14 },
  liveCard: { borderRadius: 20, padding: 16, gap: 6 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 16, padding: 12, gap: 2 },
  hours: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  list: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 64 },
  time: { width: 58, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderRadius: 18, padding: 28, alignItems: 'center', gap: 8 },
});
