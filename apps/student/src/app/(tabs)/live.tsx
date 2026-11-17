/** Live tab — combines the Live Classes and Live Class History & Attendance designs. */
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { live as liveApi, liveTab } from '@/api/client';
import { dateParts, dayLabel, sessionStatus, timeRange } from '@/core/time';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { AppHeader, BottomSheet, ErrorState, Pill, Skeleton, useAsync } from '@/ui/kit';
import { WeekTimetable } from '@/ui/WeekTimetable';
import { mentorship } from '@/api/academy';

/** 1:1 mentorship: confirmed sessions (join when it's time) and a way to book one. */
function MentorCard({ userId }: { userId: string }) {
  const { c } = useTheme();
  const list = mentorship.learnerSessions(userId);
  return (
    <View style={{ gap: 10 }}>
      <Txt variant="label" color={c.muted} style={{ marginTop: 6 }}>1:1 MENTORSHIP</Txt>
      {list.map(({ r, course, mentor, label }) => (
        <View key={r.id} style={[styles.mentor, { backgroundColor: c.surface, borderColor: label === 'Live now' ? c.danger : c.border }]}>
          <Ionicons name={label === 'Live now' ? 'videocam' : 'person-circle-outline'} size={26} color={label === 'Live now' ? c.danger : c.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{mentor}</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{course.title} · {new Date(r.startsAt!).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Txt>
          </View>
          {label === 'Live now' ? <Button title="Join" size="md" onPress={() => router.push({ pathname: '/mentor-room/[id]', params: { id: r.id } })} /> : <Pill text="Confirmed" tone="success" />}
        </View>
      ))}
      <Pressable onPress={() => router.push('/mentorship')} style={[styles.cal, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }]} accessibilityRole="button" accessibilityLabel="Book a 1:1 mentorship">
        <Ionicons name="person-add-outline" size={26} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Book a 1:1 with your tutor</Txt>
          <Txt variant="caption" color={c.inkSoft}>Pick a time and what you need help with. Your tutor confirms it.</Txt>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.muted} />
      </Pressable>
    </View>
  );
}

type Data = Awaited<ReturnType<typeof liveTab.schedule>>;
type Row = Data['upcoming'][number];

export default function Live() {
  const { isDesktop, pad } = useLayout();
  const { c, tenant } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [seg, setSeg] = useState<'upcoming' | 'week' | 'past'>('upcoming');
  const [wk, setWk] = useState(0);
  const [calOpen, setCalOpen] = useState(false);
  const { data, loading, error, reload } = useAsync(() => liveTab.schedule(userId, tenant?.id ?? null), [userId, tenant?.id]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const join = (id: string) => router.push({ pathname: '/live-room/[id]', params: { id } });

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: pad, paddingTop: 24 }]} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} />} showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, isDesktop && { maxWidth: 960 }]}>
            <AppHeader />
            <View style={{ marginTop: 10, marginBottom: 14 }}>
              <TwoTone lead="Live" accent="Classes" variant="title" />
              <Txt color={c.inkSoft}>Join live, ask questions, catch up on recordings.</Txt>
            </View>

            <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
              {(['upcoming', 'week', 'past'] as const).map((s) => (
                <Pressable key={s} onPress={() => setSeg(s)} accessibilityRole="tab" accessibilityState={{ selected: seg === s }} style={[styles.segBtn, seg === s && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }]}>
                  <Txt variant="label" color={seg === s ? c.primary : c.inkSoft}>{s === 'upcoming' ? 'Upcoming' : s === 'week' ? 'Timetable' : 'Past'}</Txt>
                </Pressable>
              ))}
            </View>

            {error ? (
              <ErrorState text={error} onRetry={reload} />
            ) : !data ? (
              <View style={{ gap: 12, marginTop: 14 }}>
                <Skeleton h={150} r={22} />
                <Skeleton h={90} r={18} />
              </View>
            ) : seg === 'upcoming' ? (
              <View style={{ gap: 12, marginTop: 14 }}>
                {data.liveNow.map((r) => <LiveNowCard key={r.session.id} row={r} onJoin={() => join(r.session.id)} />)}
                {data.upcoming.length === 0 && data.liveNow.length === 0 && (
                  <Txt color={c.muted} center style={{ paddingVertical: 30 }}>No live classes scheduled. Your tutors' sessions will appear here.</Txt>
                )}
                {groupByDay(data.upcoming).map(([day, rows]) => (
                  <View key={day} style={{ gap: 10 }}>
                    <Txt variant="label" color={c.muted} style={{ marginTop: 6 }}>{day.toUpperCase()}</Txt>
                    {rows.map((r) => <UpcomingRow key={r.session.id} row={r} userId={userId} onJoin={() => join(r.session.id)} onChange={reload} />)}
                  </View>
                ))}
                <MentorCard userId={userId} />
                <Pressable onPress={() => setCalOpen(true)} style={[styles.cal, { backgroundColor: c.primarySoft }]} accessibilityRole="button">
                  <Ionicons name={data.calendarSync ? 'checkmark-circle' : 'calendar-outline'} size={28} color={data.calendarSync ? c.success : c.primary} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{data.calendarSync ? 'Calendar sync is on' : 'Add classes to your calendar'}</Txt>
                    <Txt variant="caption" color={c.inkSoft}>{data.calendarSync ? 'New and changed classes update automatically.' : 'Never miss a session. Get automatic reminders.'}</Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={c.muted} />
                </Pressable>
              </View>
            ) : seg === 'week' ? (
              <View style={{ marginTop: 14 }}>
                <WeekTimetable
                  offset={wk}
                  onOffset={setWk}
                  empty="No classes this day."
                  items={[...data.liveNow.map((r) => ({ r, state: 'live' as const })), ...data.upcoming.map((r) => ({ r, state: 'upcoming' as const })), ...data.past.map((r) => ({ r, state: 'conducted' as const }))].map(({ r, state }) => ({ id: r.session.id, title: r.session.title, sub: `${r.tutor.name} · ${r.course.title}`, startsAt: r.session.startsAt, endsAt: r.session.endsAt, mode: r.session.mode ?? 'online', state }))}
                  onPress={(it) => (it.state === 'conducted' ? router.push({ pathname: '/live-room/[id]', params: { id: it.id, mode: 'recording' } }) : it.mode === 'online' ? join(it.id) : undefined)}
                />
              </View>
            ) : (
              <Past data={data} />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet
        open={calOpen}
        onClose={() => setCalOpen(false)}
        title="Calendar sync"
        footer={
          <Button
            title={data?.calendarSync ? 'Turn off sync' : 'Sync with my calendar'}
            variant={data?.calendarSync ? 'outline' : 'primary'}
            style={{ flex: 1 }}
            onPress={() => { liveTab.setCalendarSync(userId, !data?.calendarSync); setCalOpen(false); reload(); }}
          />
        }
      >
        <Txt color={c.inkSoft}>Bodhin adds your enrolled live classes to your phone's calendar with a reminder 15 minutes before. Rescheduled or cancelled classes update on their own.</Txt>
        <Txt variant="caption" color={c.muted}>Your phone will ask for calendar permission the first time.</Txt>
      </BottomSheet>
    </View>
  );
}

function groupByDay(rows: Row[]) {
  const m = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = dayLabel(r.session.startsAt);
    m.set(k, [...(m.get(k) ?? []), r]);
  });
  return [...m.entries()];
}

function LiveNowCard({ row, onJoin }: { row: Row; onJoin: () => void }) {
  const mins = Math.round((Date.now() - new Date(row.session.startsAt).getTime()) / 6e4);
  return (
    <LinearGradient colors={['#071F44', '#12407F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liveNow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pill text="LIVE NOW" tone="live" icon="radio" />
        <Txt variant="caption" color="rgba(255,255,255,0.75)">Started {mins} min ago</Txt>
      </View>
      <Txt variant="heading" color="#fff" style={{ fontSize: 20, lineHeight: 26 }}>{row.session.title}</Txt>
      <Txt variant="label" color="rgba(255,255,255,0.8)" style={{ fontWeight: '500' }}>{row.tutor.name} · {row.course.title}</Txt>
      {row.session.mode === 'offline' ? (
        <Pill text="In person · happening now" tone="warning" icon="location-outline" />
      ) : (
        <Button title="Join class" iconRight="enter-outline" onPress={onJoin} style={{ backgroundColor: '#E5383B', marginTop: 6 }} />
      )}
    </LinearGradient>
  );
}

function UpcomingRow({ row, userId, onJoin, onChange }: { row: Row; userId: string; onJoin: () => void; onChange: () => void }) {
  const { c } = useTheme();
  const d = dateParts(row.session.startsAt);
  const st = sessionStatus(row.session.startsAt, row.session.endsAt);
  const offline = row.session.mode === 'offline';
  const canJoin = st.state === 'soon' && !offline;
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: canJoin ? c.live : c.border }]}>
      <View style={[styles.date, { backgroundColor: c.primarySoft }]}>
        <Txt variant="caption" color={c.inkSoft}>{d.month}</Txt>
        <Txt variant="title" color={c.primaryDeep} style={{ lineHeight: 28 }}>{d.day}</Txt>
        <Txt variant="caption" color={c.inkSoft}>{d.weekday}</Txt>
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>{row.session.title}</Txt>
        <Txt variant="caption" color={c.muted} numberOfLines={1}>{row.course.title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="time-outline" size={13} color={c.muted} />
          <Txt variant="caption" color={c.inkSoft}>{timeRange(row.session.startsAt, row.session.endsAt)}{offline ? ' · In person' : ''}</Txt>
        </View>
        <Txt variant="caption" color={canJoin ? c.live : c.info} style={{ fontWeight: '700' }}>{st.label}</Txt>
      </View>
      {canJoin ? (
        <Button title="Join" size="md" onPress={onJoin} />
      ) : (
        <Pressable
          onPress={async () => { await liveApi.toggleReminder(userId, row.session.id); onChange(); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: row.reminder }}
          accessibilityLabel="Remind me"
          style={[styles.remind, { borderColor: row.reminder ? c.success : c.primary, backgroundColor: row.reminder ? c.successBg : c.surface }]}
        >
          <Ionicons name={row.reminder ? 'notifications' : 'notifications-outline'} size={18} color={row.reminder ? c.success : c.primary} />
          <Txt variant="caption" color={row.reminder ? c.success : c.primary} style={{ fontWeight: '700' }}>{row.reminder ? 'On' : 'Remind'}</Txt>
        </Pressable>
      )}
    </View>
  );
}

function Past({ data }: { data: Data }) {
  const { c } = useTheme();
  const recent = data.past.slice(0, 14).reverse();
  const stats = [
    ['calendar-outline', String(data.stats.total), 'Classes', c.primary],
    ['checkmark-circle-outline', String(data.stats.attended), 'Attended', c.success],
    ['pie-chart-outline', `${data.stats.pct}%`, 'Attendance', c.accent],
    ['close-circle-outline', String(data.stats.missed), 'Missed', c.danger],
  ] as const;
  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
        {stats.map(([icon, v, l, col]) => (
          <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Ionicons name={icon} size={22} color={col} />
            <Txt variant="heading">{v}</Txt>
            <Txt variant="caption" color={c.muted}>{l}</Txt>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="bodyStrong">Last {recent.length} classes</Txt>
        <View style={styles.strip}>
          {recent.map((r) => {
            const ok = !!r.attendance;
            const d = dateParts(r.session.startsAt);
            return (
              <View key={r.session.id} style={{ alignItems: 'center', gap: 4 }} accessibilityLabel={`${d.day} ${d.month}: ${ok ? 'attended' : 'missed'}`}>
                <Txt variant="caption" color={c.muted} style={{ fontSize: 10 }}>{d.day}</Txt>
                <View style={[styles.dot, { backgroundColor: ok ? c.successBg : c.dangerBg }]}>
                  <Ionicons name={ok ? 'checkmark' : 'close'} size={14} color={ok ? c.success : c.danger} />
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Legend color={c.success} label="Attended" />
          <Legend color={c.danger} label="Missed" />
        </View>
      </View>

      <Txt variant="heading" style={{ marginTop: 6 }}>Recordings</Txt>
      {data.past.map((r) => (
        <Pressable key={r.session.id} disabled={!r.recording.available} onPress={() => router.push({ pathname: '/live-room/[id]', params: { id: r.session.id, mode: 'recording' } })} style={[styles.rec, { backgroundColor: c.surface, borderColor: c.border, opacity: r.recording.available ? 1 : 0.6 }]} accessibilityRole="button" accessibilityLabel={`Watch recording: ${r.session.title}`}>
          <LinearGradient colors={[r.course.art.from, r.course.art.to]} style={styles.thumb}>
            <Ionicons name="play" size={18} color="#fff" />
            <Txt variant="caption" color="#fff" style={styles.dur}>{Math.round((new Date(r.session.endsAt).getTime() - new Date(r.session.startsAt).getTime()) / 6e4)} min</Txt>
          </LinearGradient>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="label" numberOfLines={2}>{r.session.title}</Txt>
            <Txt variant="caption" color={c.muted}>{new Date(r.session.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {timeRange(r.session.startsAt, r.session.endsAt)}</Txt>
            {!r.recording.available ? (
              <Txt variant="caption" color={c.danger}>Recording expired</Txt>
            ) : r.recording.daysLeft != null && r.recording.daysLeft <= 14 ? (
              <Txt variant="caption" color={c.warning}>Recording available {r.recording.daysLeft} more day{r.recording.daysLeft === 1 ? '' : 's'}</Txt>
            ) : null}
          </View>
          {r.attendance ? <Pill text="Attended" tone="success" icon="checkmark" /> : <Pill text="Missed" tone="warning" />}
        </Pressable>
      ))}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Txt variant="caption" color={c.inkSoft}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  mentor: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  liveNow: { borderRadius: 22, padding: 18, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1.2 },
  date: { width: 60, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center' },
  remind: { alignItems: 'center', justifyContent: 'center', gap: 2, width: 64, minHeight: 56, borderRadius: radius.md, borderWidth: 1.2 },
  cal: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, marginTop: 4 },
  stats: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  card: { padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rec: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  thumb: { width: 92, height: 60, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', right: 6, bottom: 4, fontSize: 10 },
});
