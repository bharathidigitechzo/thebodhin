import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Grid, PAGE, useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { learning, notifications, questions } from '@/api/client';
import { dateParts, greeting, sessionStatus, timeRange } from '@/core/time';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { AppHeader, ErrorState, Pill, ProgressBar, ProgressRing, SectionHeader, Skeleton, useAsync } from '@/ui/kit';
import { CourseArt, CourseCard, openCourse } from '@/ui/course';

export default function Home() {
  const { c, tenant } = useTheme();
  const { isDesktop, pad, cols } = useLayout();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { data, loading, error, reload } = useAsync(() => learning.home(userId, tenant?.id ?? null), [userId, tenant?.id]);
  const first = session?.user.name.split(' ')[0] ?? 'there';
  const [, setNotifRev] = React.useState(0);
  const notifs = notifications.list(userId);
  const unreadNotifs = notifs.filter((n) => !n.read).length;
  const topNotif = notifs[0];
  const answers = questions.answeredFor(userId);
  const openDoubts = questions.openCount(userId);

  useFocusEffect(
    React.useCallback(() => {
      setNotifRev((r) => r + 1);
    }, [])
  );

  const quick = [
    { label: 'My Learning', icon: 'book-outline', color: c.primary, go: () => router.navigate('/learning') },
    { label: 'Live Classes', icon: 'calendar-outline', color: c.accent, go: () => router.navigate('/live') },
    { label: 'Quizzes', icon: 'help-circle-outline', color: '#E11D48', go: () => router.push('/quizzes') },
    { label: 'Assignments', icon: 'document-text-outline', color: '#7C3AED', go: () => router.push('/assignments'), badge: data?.counts.assignmentsPending },
    { label: '1:1 Mentorship', icon: 'person-circle-outline', color: '#2563EB', go: () => router.push('/mentorship') },
    { label: 'Community', icon: 'chatbubbles-outline', color: '#059669', go: () => router.push('/community') },
    { label: 'Playground', icon: 'code-slash-outline', color: '#D97706', go: () => router.push('/playground') },
    { label: 'Certificates', icon: 'ribbon-outline', color: c.success, go: () => router.push('/certificates') },
  ];

  const cont = data?.inProgress[0];
  const live = data?.upcomingLive[0];

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: pad, paddingTop: 24 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} tintColor={c.primary} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.inner, isDesktop && { maxWidth: PAGE.wide }]}>
            <AppHeader />
            <View style={{ marginTop: 10, marginBottom: 16 }}>
              <Txt variant="label" color={c.muted}>
                {greeting()}
              </Txt>
              <Txt variant="title" color={c.primaryDeep}>
                Hello, {first} 👋
              </Txt>
            </View>

            {error ? (
              <ErrorState text={error} onRetry={reload} />
            ) : loading && !data ? (
              <View style={{ gap: 14 }}>
                <Skeleton h={112} r={22} />
                <Skeleton h={92} r={18} />
                <Skeleton h={120} r={18} />
              </View>
            ) : data ? (
              <>
              <View style={isDesktop && live ? styles.deskRow : undefined}>
              <View style={isDesktop && live ? { flex: 1, minWidth: 0 } : undefined}>
                {/* Overall progress */}
                <LinearGradient colors={[c.primaryDeep, c.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                  <ProgressRing pct={data.overallPct} size={78} stroke={8} track="rgba(255,255,255,0.18)" color="#3FD17C" textColor="#fff" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="heading" color="#fff">
                      Your learning progress
                    </Txt>
                    <Txt variant="label" color="rgba(255,255,255,0.78)" style={{ fontWeight: '500' }}>
                      {data.inProgress.length} of {data.enrolled.length} courses in progress · {data.completedCount} completed
                    </Txt>
                  </View>
                  <Ionicons name="stats-chart" size={30} color="rgba(255,255,255,0.9)" />
                </LinearGradient>

                {/* Quick actions */}
                <View style={styles.quick}>
                  {quick.map((q) => (
                    <Pressable
                      key={q.label}
                      onPress={q.go}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.quickItem,
                        { backgroundColor: c.surface, borderColor: c.border },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <View style={styles.quickIconWrap}>
                        <Ionicons name={q.icon as any} size={28} color={q.color} />
                        {'badge' in q && !!q.badge && (
                          <View style={[styles.badge, { backgroundColor: c.live }]}>
                            <Txt variant="caption" color="#fff" style={{ fontSize: 10, lineHeight: 14 }}>
                              {q.badge}
                            </Txt>
                          </View>
                        )}
                      </View>
                      <Txt variant="caption" center numberOfLines={2} style={{ fontWeight: '600', fontSize: 11, lineHeight: 14, letterSpacing: -0.2 }}>
                        {q.label}
                      </Txt>
                    </Pressable>
                  ))}
                </View>

                {/* Code Playground */}
                <Pressable
                  onPress={() => router.push('/playground')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Code Playground"
                  style={({ pressed }) => [
                    styles.playground,
                    { backgroundColor: c.primarySoft, borderColor: c.primary },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={[styles.playgroundIconBox, { backgroundColor: c.surface, borderColor: `${c.primary}30` }]}>
                    <Ionicons name="code-slash" size={24} color={c.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <Txt variant="bodyStrong">Code Playground</Txt>
                    <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>
                      Practise Python, JavaScript, SQL, Java, React and more — no install.
                    </Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={c.primary} />
                </Pressable>

                {/* Notifications card */}
                {topNotif && (
                  <Pressable
                    onPress={() => {
                      notifications.markRead(userId, topNotif.id); // same as opening it from Notifications
                      if (topNotif.link) router.push(topNotif.link as any);
                      else router.push('/notifications');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Notification: ${topNotif.title}`}
                    style={({ pressed }) => [
                      styles.notifBanner,
                      { backgroundColor: c.surface, borderColor: !topNotif.read ? c.primary : c.border },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <View style={[styles.notifIconWrap, { backgroundColor: !topNotif.read ? c.primarySoft : c.surfaceMuted }]}>
                      <Ionicons name="notifications" size={20} color={c.primary} />
                      {!topNotif.read && <View style={[styles.notifDot, { backgroundColor: c.live }]} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>{topNotif.title}</Txt>
                        {unreadNotifs > 0 && <Pill text={`${unreadNotifs} unread`} tone="live" />}
                      </View>
                      <Txt variant="caption" color={c.inkSoft} numberOfLines={1}>{topNotif.body}</Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.muted} />
                  </Pressable>
                )}

                {/* Tutors' answers to my doubts — no need to open each course to check */}
                {(answers.length > 0 || openDoubts > 0) && (
                  <>
                    <SectionHeader title="Answers to your doubts" />
                    <View style={[styles.doubts, { backgroundColor: c.surface, borderColor: c.border }]}>
                      {answers.map(({ q, courseTitle, lessonTitle }, k) => (
                        <Pressable
                          key={q.id}
                          onPress={() => router.push({ pathname: '/learn/[courseId]', params: { courseId: q.courseId, lesson: q.lessonId } })}
                          accessibilityRole="button"
                          accessibilityLabel={`${q.answer!.by} answered your doubt: ${q.text}`}
                          style={({ pressed }) => [styles.doubtRow, k > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { opacity: 0.85 }]}
                        >
                          <View style={[styles.notifIconWrap, { backgroundColor: c.successBg }]}>
                            <Ionicons name="chatbubbles" size={18} color={c.success} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Txt variant="caption" color={c.muted} numberOfLines={1}>{courseTitle}{lessonTitle ? ` · ${lessonTitle}` : ''}</Txt>
                            <Txt variant="label" numberOfLines={1}>Q: {q.text}</Txt>
                            <Txt variant="caption" color={c.inkSoft} numberOfLines={2}><Txt variant="caption" style={{ fontWeight: '700' }} color={c.success}>{q.answer!.by}: </Txt>{q.answer!.text}</Txt>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={c.muted} />
                        </Pressable>
                      ))}
                      {openDoubts > 0 && (
                        <View style={[styles.doubtRow, answers.length > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                          <Ionicons name="time-outline" size={18} color={c.muted} />
                          <Txt variant="caption" color={c.muted} style={{ flex: 1 }}>{openDoubts} doubt{openDoubts === 1 ? ' is' : 's are'} waiting for your tutor. You’ll see the answer here.</Txt>
                        </View>
                      )}
                    </View>
                  </>
                )}

                {/* Continue learning */}
                {cont ? (
                  <>
                    <SectionHeader title="Continue Learning" action="View all" onAction={() => router.navigate('/learning')} />
                    <Pressable onPress={() => openCourse(cont.course.id)} accessibilityRole="button" accessibilityLabel={`Continue ${cont.course.title}`} style={({ pressed }) => [styles.cont, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.92 }]}>
                      <View style={{ width: 112 }}>
                        <CourseArt course={cont.course} height={96} rounded={radius.md} />
                      </View>
                      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>
                          {cont.course.title}
                        </Txt>
                        <Txt variant="caption" color={c.muted} numberOfLines={1}>
                          Next: {cont.next.lesson.title}
                        </Txt>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <ProgressBar pct={cont.progress.pct} />
                          <Txt variant="label">{cont.progress.pct}%</Txt>
                        </View>
                      </View>
                      <View style={[styles.play, { backgroundColor: c.primary }]}>
                        <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 3 }} />
                      </View>
                    </Pressable>
                  </>
                ) : null}

              </View>
              {/* Next live class (desktop: right rail only when there is an active live class) */}
              {isDesktop && live ? (
                <View style={{ width: 380 }}>
                  <SectionHeader title="Upcoming Live Class" action="Schedule" onAction={() => router.navigate('/live')} />
                  <LiveCard live={live} />
                </View>
              ) : null}
              </View>

                {/* Recommendations */}
                {data.recommended.length > 0 && (
                  <>
                    <SectionHeader title={tenant ? `More from ${tenant.branding.displayName}` : 'Recommended for you'} action="Explore" onAction={() => router.navigate('/explore')} />
                    {isDesktop ? (
                      <Grid cols={cols(250)}>
                        {data.recommended.slice(0, cols(250) * 2).map(({ course, tutor }) => (
                          <CourseCard key={course.id} course={course} tutor={tutor} width="100%" />
                        ))}
                      </Grid>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.bleed}>
                        {data.recommended.map(({ course, tutor }) => (
                          <CourseCard key={course.id} course={course} tutor={tutor} />
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {data.enrolled.length === 0 && data.recommended.length === 0 && (
                  <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Ionicons name="sparkles-outline" size={30} color={c.accent} />
                    <Txt variant="bodyStrong" center>
                      Start your first course
                    </Txt>
                    <Txt color={c.muted} center>
                      Browse courses from verified educators and start learning today.
                    </Txt>
                    <Pressable onPress={() => router.navigate('/explore')} style={[styles.emptyBtn, { backgroundColor: c.primary }]} accessibilityRole="button">
                      <Txt variant="bodyStrong" color="#fff">
                        Explore courses
                      </Txt>
                    </Pressable>
                  </View>
                )}
              </>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

type LiveItem = Awaited<ReturnType<typeof learning.home>>['upcomingLive'][number];

export function LiveCard({ live }: { live: LiveItem }) {
  const { c } = useTheme();
  const d = dateParts(live.session.startsAt);
  const st = sessionStatus(live.session.startsAt, live.session.endsAt);
  const isLive = st.state === 'live' || st.state === 'soon';
  return (
    <Pressable onPress={() => router.navigate('/live')} accessibilityRole="button" style={({ pressed }) => [styles.live, { backgroundColor: c.surface, borderColor: isLive ? c.live : c.border }, pressed && { opacity: 0.92 }]}>
      <View style={[styles.date, { backgroundColor: c.primarySoft }]}>
        <Txt variant="caption" color={c.inkSoft}>
          {d.month}
        </Txt>
        <Txt variant="title" color={c.primaryDeep} style={{ lineHeight: 28 }}>
          {d.day}
        </Txt>
        <Txt variant="caption" color={c.inkSoft}>
          {d.weekday}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
        <Pill text={st.state === 'live' ? 'LIVE NOW' : st.label} tone={isLive ? 'live' : 'info'} icon="radio" />
        <Txt variant="bodyStrong" numberOfLines={2}>
          {live.session.title}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="time-outline" size={14} color={c.muted} />
          <Txt variant="caption" color={c.muted} numberOfLines={1}>
            {timeRange(live.session.startsAt, live.session.endsAt)}
          </Txt>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={22} color={c.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  doubts: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 16 },
  doubtRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 28 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  deskRow: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 22 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 14 },
  quickItem: { width: '23%', flexGrow: 1, minWidth: 74, maxWidth: 180, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 4, borderRadius: radius.lg, borderWidth: 1, minHeight: 82 },
  quickIconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  playground: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, borderWidth: 1, marginBottom: 6 },
  playgroundIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  notifBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, marginTop: 4, marginBottom: 12 },
  notifIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  cont: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1.2 },
  date: { width: 64, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center' },
  rail: { gap: 12, paddingHorizontal: 20 },
  bleed: { marginHorizontal: -20 },
  empty: { alignItems: 'center', gap: 8, padding: 24, borderRadius: radius.lg, borderWidth: 1, marginTop: 16 },
  emptyBtn: { marginTop: 8, paddingHorizontal: 22, minHeight: 48, borderRadius: radius.pill, justifyContent: 'center' },
});
