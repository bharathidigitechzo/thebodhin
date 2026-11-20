/**
 * Educator dashboard. Order = what needs action first:
 * usage alert → live class → KPIs → needs attention → earnings (by who collected) → completion → activity.
 * A floating "Create" button sits in the thumb zone.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFrame, useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { courseAdmin, educator } from '@/api/client';
import { inr } from '@/ui/section';
import { greeting, sessionStatus, timeRange, dayLabel } from '@/core/time';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { AppHeader, BottomSheet, ErrorState, Pill, ProgressBar, SectionHeader, Skeleton, useAsync } from '@/ui/kit';

type Data = Awaited<ReturnType<typeof educator.dashboard>>;
const soon = (f: string, step: string) => router.push({ pathname: '/educator-soon', params: { f, step } });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function EducatorHome() {
  const { isDesktop } = useLayout();
  const frame = useFrame(); // same width and side spacing as every educator section
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { data, loading, error, reload } = useAsync(() => educator.dashboard(userId), [userId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [create, setCreate] = useState(false);
  const { width } = useWindowDimensions();
  const twoCol = width >= 900;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingHorizontal: frame.padX, paddingBottom: isDesktop ? 48 : 110 }]} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} />} showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, { maxWidth: frame.maxWidth }]}>
            <AppHeader profileHref="/educator/more" action={{ title: 'Create', onPress: () => setCreate(true) }} />
            {error ? (
              <ErrorState text={error} onRetry={reload} />
            ) : !data || loading ? (
              <View style={{ gap: 12, marginTop: 12 }}>
                <Skeleton h={60} r={16} />
                <Skeleton h={150} r={22} />
                <Skeleton h={180} r={18} />
              </View>
            ) : (
              <>
                <Body data={data} twoCol={twoCol} />
              </>
            )}
          </View>
        </ScrollView>

        {/* thumb-zone create button (desktop: in the header) */}
        {!isDesktop && <Pressable onPress={() => setCreate(true)} style={[styles.fab, { backgroundColor: c.primary }]} accessibilityRole="button" accessibilityLabel="Create">
          <Ionicons name="add" size={26} color="#fff" />
          <Txt variant="bodyStrong" color="#fff">Create</Txt>
        </Pressable>}
      </SafeAreaView>

      <BottomSheet open={create} onClose={() => setCreate(false)} title="Create">
        <View style={{ gap: 8 }}>
          {(
            [
              ['layers', 'Create course', 'Recorded, live or hybrid', () => router.push('/edu/new-course'), true],
              ['people', 'New batch', 'Group students with a schedule', () => router.push('/edu/batch-new'), data?.ctx.ent.has('batches') && data?.ctx.role === 'owner'],
              ['help-circle', 'Quiz or assignment', 'Test students or collect their work', () => router.push('/edu/assess/new'), true],
              ['radio', 'Schedule live class', 'Pick a batch, date and time', () => router.push('/edu/schedule'), true],
              ['megaphone', 'Announcement', 'Post to your community and notify students', () => router.push({ pathname: '/edu/community', params: { compose: '1' } }), data?.ctx.ent.has('community')],
              ['alarm', 'Reminder', 'Course update, quiz, deadline …', () => router.push('/edu/timetable'), true],
              ['person-add', 'Invite students', 'By link, file or one by one', () => router.navigate({ pathname: '/educator/batches', params: { seg: 'students' } }), data?.ctx.role === 'owner'],
            ] as const
          )
            .filter((x) => x[4])
            .map(([icon, t, sub, fn]) => (
              <Pressable key={t} onPress={() => { setCreate(false); fn(); }} style={[styles.createRow, { borderColor: c.border }]} accessibilityRole="button">
                <View style={[styles.createIcon, { backgroundColor: c.primarySoft }]}>
                  <Ionicons name={icon} size={22} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{t}</Txt>
                  <Txt variant="caption" color={c.muted}>{sub}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={20} color={c.muted} />
              </Pressable>
            ))}
        </View>
      </BottomSheet>
    </View>
  );
}

function Body({ data, twoCol }: { data: Data; twoCol: boolean }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const { ctx, kpis, next, attention, earnings, completion, activity } = data;
  const owner = ctx.role === 'owner';
  const worst = ctx.usage.worst;

  const firstSteps = owner ? [
    { done: ctx.tenant.payments?.directGatewayStatus === 'active', icon: 'card', t: 'Connect your payment gateway', s: 'Students on your site pay you directly (Razorpay / Stripe)', go: () => router.push('/edu/payments-setup') },
    { done: kpis.liveCourses > 0 || educator.courses(session?.user.id ?? '').length > 0, icon: 'layers', t: 'Create your first course', s: 'Recorded video, live classes or hybrid cohorts', go: () => router.push({ pathname: '/edu/course/[id]', params: { id: courseAdmin.create(session?.user.id ?? '') } }) },
    { done: ctx.tenant.branding.primary !== '#0B3B73', icon: 'color-palette', t: 'Add your academy branding', s: `Custom colours, logo & banner · ${ctx.host}`, go: () => router.push('/edu/workspace') },
    { done: kpis.students > 0, icon: 'person-add', t: 'Invite your students & tutors', s: 'Share public link, batch code or add faculty', go: () => router.navigate({ pathname: '/educator/batches', params: { seg: 'students' } }) },
  ] as const : [];
  const stepsLeft = firstSteps.filter((x) => !x.done).length;
  const progressPct = Math.round(((firstSteps.length - stepsLeft) / (firstSteps.length || 1)) * 100);

  const left = (
    <>
      {ctx.tenant.status === 'suspended' && (
        <View style={[styles.steps, { backgroundColor: c.dangerBg, borderColor: c.danger }]}>
          <Txt variant="bodyStrong" color={c.danger}>Workspace suspended by Bodhin</Txt>
          <Txt variant="caption" color={c.inkSoft}>New sales and enrolments are paused. Your students keep access. Check notifications or contact support@thebodhin.com.</Txt>
        </View>
      )}

      {/* Onboarding checklist */}
      {stepsLeft > 0 && kpis.students === 0 && (
        <View style={[styles.steps, { backgroundColor: c.surface, borderColor: c.border, marginTop: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Txt variant="heading">Get your academy live</Txt>
              <Txt variant="caption" color={c.muted}>{firstSteps.length - stepsLeft} of {firstSteps.length} completed</Txt>
            </View>
            <Pill text={`${progressPct}% ready`} tone={progressPct >= 50 ? 'success' : 'info'} />
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: c.surfaceMuted }]}>
            <View style={[styles.progressFill, { width: `${Math.max(progressPct, 5)}%`, backgroundColor: c.primary }]} />
          </View>

          {firstSteps.map((x) => (
            <Pressable key={x.t} onPress={x.go} disabled={x.done} style={[styles.step, { borderBottomWidth: 1, borderBottomColor: c.border }]} accessibilityRole="button" accessibilityLabel={x.t}>
              <View style={[styles.stepIconWrap, { backgroundColor: x.done ? '#E6F4EA' : c.primarySoft }]}>
                <Ionicons name={x.done ? 'checkmark-circle' : (`${x.icon}` as keyof typeof Ionicons.glyphMap)} size={22} color={x.done ? c.success : c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" style={x.done ? { textDecorationLine: 'line-through', color: c.muted } : undefined}>{x.t}</Txt>
                <Txt variant="caption" color={c.muted}>{x.s}</Txt>
              </View>
              {x.done ? (
                <Pill text="Done" tone="success" />
              ) : (
                <View style={[styles.startPill, { backgroundColor: c.surfaceMuted }]}>
                  <Txt variant="caption" color={c.primary} style={{ fontWeight: '700' }}>Start →</Txt>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {next && <LiveCard next={next} />}

      {/* Primary KPIs */}
      <View style={{ marginTop: 14 }}>
        <SectionHeader title="Academy Overview" />
        <View style={styles.kpis}>
          <Kpi icon="people" tint="#E9F0FD" color={c.info} value={kpis.students.toLocaleString('en-IN')} label={owner ? 'Active students' : 'My students'} delta={owner ? `+${kpis.studentsDelta}%` : undefined} onPress={() => router.navigate('/educator/batches')} />
          <Kpi icon="layers" tint="#FDF3E1" color={c.warning} value={String(kpis.liveCourses)} label="Live courses" onPress={() => router.navigate('/educator/courses')} />
          <Kpi icon="radio" tint="#E8F6EC" color={c.success} value={String(kpis.sessionsThisMonth)} label="Classes held" onPress={() => router.navigate('/educator/live')} />
          {earnings ? (
            <Kpi icon="wallet" tint="#F1ECFC" color="#7C3AED" value={inr(earnings.net)} label="Net this month" delta={`${earnings.deltaPct >= 0 ? '+' : ''}${earnings.deltaPct}%`} onPress={() => router.push('/edu/earnings')} />
          ) : (
            <Kpi icon="document-text" tint="#F1ECFC" color="#7C3AED" value={String(attention.find((a) => a.key === 'grade')?.count ?? 0)} label="To grade" onPress={() => router.push('/edu/grading')} />
          )}
        </View>
      </View>

      {attention.length > 0 && (
        <>
          <SectionHeader title="Needs your attention" />
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
            {attention.map((a, i) => (
              <Pressable key={a.key} onPress={() => router.push(a.href as any)} style={[styles.attn, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${a.count} ${a.label}`}>
                <View style={[styles.attnIcon, { backgroundColor: c.warningBg }]}>
                  <Ionicons name={a.icon as keyof typeof Ionicons.glyphMap} size={20} color={c.warning} />
                </View>
                <Txt variant="bodyStrong" style={{ flex: 1 }}>{a.label}</Txt>
                <View style={[styles.count, { backgroundColor: c.primary }]}>
                  <Txt variant="caption" color="#fff" style={{ fontWeight: '800' }}>{a.count}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.muted} />
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Growth Guidance for Educators — in the left column so both columns end at a similar height */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, marginTop: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="sparkles" size={18} color="#D97706" />
          <Txt variant="bodyStrong">Tips to get your first 50 students</Txt>
        </View>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Txt variant="caption" color={c.primary} style={{ fontWeight: '700' }}>1.</Txt>
            <Txt variant="caption" color={c.inkSoft} style={{ flex: 1 }}>Share your academy link directly on WhatsApp, LinkedIn and student groups.</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Txt variant="caption" color={c.primary} style={{ fontWeight: '700' }}>2.</Txt>
            <Txt variant="caption" color={c.inkSoft} style={{ flex: 1 }}>Host a free live introduction masterclass to build audience trust.</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Txt variant="caption" color={c.primary} style={{ fontWeight: '700' }}>3.</Txt>
            <Txt variant="caption" color={c.inkSoft} style={{ flex: 1 }}>Publish at least one bite-sized recorded preview lesson.</Txt>
          </View>
        </View>
      </View>

    </>
  );

  const right = (
    <>
      {earnings && <EarningsCard e={earnings} />}

      <SectionHeader title="Course completion" />
      <Completion data={completion} />

      <SectionHeader title="Recent activity" />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
        {activity.length === 0 ? (
          <View style={{ padding: 18, alignItems: 'center' }}>
            <Txt variant="caption" color={c.muted}>No activity yet. Once students enrol, updates will appear here.</Txt>
          </View>
        ) : (
          activity.map((a, i) => {
            const icon = { enroll: 'school', live: 'radio', submission: 'document-text', certificate: 'ribbon', review: 'star', payout: 'cash' }[a.kind] as keyof typeof Ionicons.glyphMap;
            return (
              <Pressable key={a.id} disabled={!a.link} onPress={() => a.link && router.push(a.link as any)} style={[styles.act, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole={a.link ? 'button' : undefined}>
                <View style={[styles.actIcon, { backgroundColor: c.primarySoft }]}>
                  <Ionicons name={icon} size={16} color={c.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="label" style={{ fontWeight: '500' }}>{a.text}</Txt>
                  <Txt variant="caption" color={c.muted}>{ago(a.at)}</Txt>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </>
  );

  return (
    <>
      {/* workspace + greeting */}
      <Pressable onPress={() => owner && router.push('/edu/workspace')} style={[styles.ws, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Workspace ${ctx.tenant.branding.displayName}`}>
        <View style={[styles.wsLogo, { backgroundColor: ctx.tenant.branding.primary }]}>
          <Txt variant="label" color="#fff" style={{ fontWeight: '700' }}>{ctx.tenant.branding.displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{ctx.tenant.branding.displayName}</Txt>
            <Ionicons name="checkmark-circle" size={16} color={c.primary} />
          </View>
          <Txt variant="caption" color={c.muted} numberOfLines={1}>{ctx.host}</Txt>
        </View>
        <Pill text={owner ? (ctx.trialDaysLeft != null ? 'Growth Plan • Free Trial' : `${ctx.ent.plan.name} plan`) : 'Tutor'} tone={owner ? 'gold' : 'info'} />
      </Pressable>

      <View style={{ marginTop: 14, marginBottom: 4 }}>
        <Txt variant="label" color={c.muted}>{greeting()}</Txt>
        <Txt variant="title" color={c.primaryDeep}>Welcome back, {data.firstName} 👋</Txt>
      </View>

      {/* Prominent Growth Plan Free Trial Card */}
      {ctx.trialDaysLeft != null && owner && (
        <View style={[styles.growthTrialHero, { backgroundColor: c.surface, borderColor: '#D97706' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={[styles.rocketBadge, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="rocket" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Txt variant="bodyStrong" style={{ fontSize: 16 }}>Growth Plan • Free Trial Active</Txt>
                  <Pill text={`${ctx.trialDaysLeft} days remaining`} tone="gold" />
                </View>
                <Txt variant="caption" color={c.muted} style={{ marginTop: 2 }}>
                  Full premium features unlocked: multi-tutors, assessments, 500 students & custom academy site.
                </Txt>
              </View>
            </View>

            <Button
              title="Explore Perks"
              size="md"
              variant="outline"
              onPress={() => router.push('/edu/subscription')}
            />
          </View>

          {/* Unlocked Perks Chips */}
          <View style={styles.perksRow}>
            <View style={[styles.perkChip, { backgroundColor: c.surfaceMuted }]}>
              <Ionicons name="people-outline" size={14} color={c.primary} />
              <Txt variant="caption" style={{ fontWeight: '600' }}>500 Students</Txt>
            </View>
            <View style={[styles.perkChip, { backgroundColor: c.surfaceMuted }]}>
              <Ionicons name="videocam-outline" size={14} color={c.primary} />
              <Txt variant="caption" style={{ fontWeight: '600' }}>100h Live Classes</Txt>
            </View>
            <View style={[styles.perkChip, { backgroundColor: c.surfaceMuted }]}>
              <Ionicons name="cloud-outline" size={14} color={c.primary} />
              <Txt variant="caption" style={{ fontWeight: '600' }}>50 GB Storage</Txt>
            </View>
            <View style={[styles.perkChip, { backgroundColor: c.surfaceMuted }]}>
              <Ionicons name="person-add-outline" size={14} color={c.primary} />
              <Txt variant="caption" style={{ fontWeight: '600' }}>5 Tutor Seats</Txt>
            </View>
            <View style={[styles.perkChip, { backgroundColor: c.surfaceMuted }]}>
              <Ionicons name="shield-checkmark-outline" size={14} color={c.success} />
              <Txt variant="caption" style={{ fontWeight: '600', color: c.success }}>0% Direct Sales Fee</Txt>
            </View>
          </View>
        </View>
      )}

      {worst && owner && <UsageBanner row={worst} />}

      {/* Paired Equal Row: Quick Actions & Public Storefront */}
      <View style={[styles.pairRow, twoCol && { flexDirection: 'row', alignItems: 'stretch' }]}>
        {/* Left: Quick Actions Card */}
        <View style={[styles.pairCol, twoCol && { flex: 1.15 }]}>
          <View style={[styles.card, { flex: 1, backgroundColor: c.surface, borderColor: c.border, justifyContent: 'space-between', padding: 18 }]}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.quickHeaderIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="flash" size={20} color="#2563EB" />
                  </View>
                  <View>
                    <Txt variant="bodyStrong" style={{ fontSize: 16 }}>Quick Actions</Txt>
                    <Txt variant="caption" color={c.muted}>One-tap creator shortcuts</Txt>
                  </View>
                </View>
                <Pill text="6 Shortcuts" tone="info" />
              </View>

              <View style={styles.quickGrid}>
                <QuickActionItem
                  icon="add-circle"
                  color="#2563EB"
                  bg="#EFF6FF"
                  label="Create Course"
                  desc="Add lessons & video"
                  onPress={() => router.push('/edu/new-course')}
                />
                <QuickActionItem
                  icon="videocam"
                  color="#059669"
                  bg="#ECFDF5"
                  label="Schedule Class"
                  desc="Live batch session"
                  onPress={() => router.push('/edu/schedule')}
                />
                <QuickActionItem
                  icon="people"
                  color="#D97706"
                  bg="#FFFBEB"
                  label="Invite Tutors"
                  desc="Assign to courses"
                  onPress={() => router.push('/edu/team')}
                />
                <QuickActionItem
                  icon="calendar"
                  color="#7C3AED"
                  bg="#F5F3FF"
                  label="New Batch"
                  desc="Group students"
                  onPress={() => router.push('/edu/batch-new')}
                />
                <QuickActionItem
                  icon="card"
                  color="#0891B2"
                  bg="#ECFEFF"
                  label="Payments"
                  desc="Setup direct gateway"
                  onPress={() => router.push('/edu/payments-setup')}
                />
                <QuickActionItem
                  icon="color-palette"
                  color="#EA580C"
                  bg="#FFF7ED"
                  label="Branding"
                  desc="Logo & colors"
                  onPress={() => router.push('/edu/workspace')}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Right: Public Academy Storefront Card */}
        <View style={[styles.pairCol, twoCol && { flex: 1 }]}>
          <View style={[styles.card, { flex: 1, backgroundColor: c.surface, borderColor: c.border, justifyContent: 'space-between', padding: 18 }]}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={[styles.quickHeaderIcon, { backgroundColor: '#E0E7FF' }]}>
                    <Ionicons name="globe-outline" size={20} color="#4338CA" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong" style={{ fontSize: 16 }} numberOfLines={1}>Public Storefront</Txt>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{ctx.host}</Txt>
                  </View>
                </View>
                <Pill text="Live" tone="success" />
              </View>

              <View style={[styles.domainBox, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
                <Ionicons name="link-outline" size={16} color={c.primary} />
                <Txt variant="caption" color={c.primary} style={{ fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  http://{ctx.host}
                </Txt>
              </View>

              <Txt variant="caption" color={c.inkSoft} style={{ marginTop: 10, lineHeight: 18 }}>
                Your dedicated academy storefront where students can discover, enroll, and pay directly into your account with 0% platform commission.
              </Txt>

              <View style={{ gap: 8, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color={c.success} />
                  <Txt variant="caption" color={c.ink} style={{ fontWeight: '500' }}>Direct Razorpay / Stripe payouts to your account</Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color={c.success} />
                  <Txt variant="caption" color={c.ink} style={{ fontWeight: '500' }}>Branded student portal · Instant enrolments</Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color={c.success} />
                  <Txt variant="caption" color={c.ink} style={{ fontWeight: '500' }}>Mobile-ready responsive catalog & checkout</Txt>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Button
                title="Preview Website ↗"
                size="md"
                style={{ flex: 1.2 }}
                onPress={() => router.push(`/site/${ctx.tenant.slug}` as any)}
              />
              <Button
                title="Edit Branding"
                size="md"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => router.push('/edu/workspace')}
              />
            </View>
          </View>
        </View>
      </View>

      {twoCol ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start', marginTop: 14 }}>
          <View style={{ flex: 1.15, minWidth: 0 }}>{left}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
        </View>
      ) : (
        <View style={{ marginTop: 14 }}>
          {left}
          {right}
        </View>
      )}
    </>
  );
}

function QuickActionItem({
  icon,
  color,
  bg,
  label,
  desc,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  label: string;
  desc: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickActionTile,
        { backgroundColor: c.surface, borderColor: c.border },
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.quickActionIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Txt variant="bodyStrong" style={{ fontSize: 13, marginTop: 4 }} numberOfLines={1}>{label}</Txt>
      <Txt variant="caption" color={c.muted} style={{ fontSize: 11 }} numberOfLines={1}>{desc}</Txt>
    </Pressable>
  );
}

function UsageBanner({ row }: { row: NonNullable<Data['ctx']['usage']['worst']> }) {
  const { c } = useTheme();
  const tone = row.level === 'warn' ? { bg: c.warningBg, fg: c.warning } : { bg: c.dangerBg, fg: c.danger };
  const fmt = (n: number) => `${n.toLocaleString('en-IN')}${row.unit ? ` ${row.unit}` : ''}`;
  const title =
    row.level === 'limit' ? `${row.label} limit reached` : row.level === 'critical' ? `${row.pct}% of ${row.label.toLowerCase()} used` : `${row.label}: ${row.pct}% used`;
  return (
    <View style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.fg, flexDirection: 'column', alignItems: 'stretch' }]} accessibilityRole="alert">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={row.level === 'warn' ? 'warning-outline' : 'alert-circle'} size={22} color={tone.fg} />
        <Txt variant="bodyStrong" style={{ flex: 1 }}>{title}</Txt>
        <Txt variant="label" color={tone.fg}>{fmt(row.used)} / {row.limit == null ? '∞' : fmt(row.limit)}</Txt>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <ProgressBar pct={row.pct} color={tone.fg} height={7} />
      </View>
      <Txt variant="caption" color={c.inkSoft}>{row.level === 'limit' ? row.atLimit : 'Upgrade your plan or add a top-up before you hit the limit. Nothing is charged automatically.'}</Txt>
      {row.level !== 'warn' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="See plans" size="md" style={{ flex: 1 }} onPress={() => router.push('/edu/subscription')} />
          <Button title="Add top-up" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/edu/subscription')} />
        </View>
      )}
    </View>
  );
}

function LiveCard({ next }: { next: NonNullable<Data['next']> }) {
  const st = sessionStatus(next.session.startsAt, next.session.endsAt);
  const live = st.state === 'live';
  const mins = Math.round((Date.now() - new Date(next.session.startsAt).getTime()) / 6e4);
  return (
    <LinearGradient colors={['#071F44', '#12407F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.live}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pill text={live ? 'LIVE NOW' : st.label} tone={live ? 'live' : 'info'} icon="radio" />
        <Txt variant="caption" color="rgba(255,255,255,0.75)">{live ? `Started ${mins} min ago` : dayLabel(next.session.startsAt)}</Txt>
      </View>
      <Txt variant="heading" color="#fff" style={{ fontSize: 19, lineHeight: 25 }}>{next.session.title}</Txt>
      <Txt variant="label" color="rgba(255,255,255,0.8)" style={{ fontWeight: '500' }}>{next.course.title} · {timeRange(next.session.startsAt, next.session.endsAt)}</Txt>
      <Button title={live ? 'Rejoin as host' : 'Start class'} iconRight="arrow-forward" style={{ backgroundColor: '#E8A21B', marginTop: 6 }} onPress={() => router.push({ pathname: '/edu/prejoin/[id]', params: { id: next.session.id } })} />
    </LinearGradient>
  );
}

function Kpi({ icon, tint, color, value, label, delta, onPress }: { icon: keyof typeof Ionicons.glyphMap; tint: string; color: string; value: string; label: string; delta?: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.kpi, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}>
      <View style={[styles.kpiIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Txt variant="title" style={{ fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="caption" color={c.muted} style={{ flexShrink: 1 }} numberOfLines={1}>{label}</Txt>
        {delta && <Txt variant="caption" color={delta.startsWith('-') ? c.danger : c.success} style={{ fontWeight: '700' }}>{delta}</Txt>}
      </View>
    </Pressable>
  );
}

function EarningsCard({ e }: { e: NonNullable<Data['earnings']> }) {
  const { c } = useTheme();
  const total = e.direct.gross + e.marketplace.net || 1;
  const directPct = Math.round((e.direct.gross / total) * 100);
  return (
    <>
      <SectionHeader title="Earnings this month" action="Statement" onAction={() => router.push('/edu/earnings')} />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View>
            <Txt variant="display" style={{ fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] }}>{inr(e.net)}</Txt>
            <Txt variant="caption" color={e.deltaPct >= 0 ? c.success : c.danger} style={{ fontWeight: '700' }}>{e.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(e.deltaPct)}% vs last month</Txt>
          </View>
          <Spark values={e.history} color={c.primary} />
        </View>

        <View style={styles.split} accessibilityLabel={`${directPct}% direct sales, ${100 - directPct}% marketplace`}>
          <View style={{ flex: Math.max(directPct, 1), backgroundColor: c.success }} />
          <View style={{ flex: Math.max(100 - directPct, 1), backgroundColor: c.accent }} />
        </View>

        <View style={styles.channel}>
          <View style={[styles.dot, { backgroundColor: c.success }]} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Direct sales · {inr(e.direct.gross)}</Txt>
            <Txt variant="caption" color={c.muted}>{e.direct.count} sales on your site. Collected straight to your Razorpay. No commission.</Txt>
          </View>
        </View>
        <View style={styles.channel}>
          <View style={[styles.dot, { backgroundColor: c.accent }]} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Bodhin marketplace · {inr(e.marketplace.net)}</Txt>
            <Txt variant="caption" color={c.muted}>
              {e.marketplace.count} sales of {inr(e.marketplace.gross)} − commission {inr(e.marketplace.commission)} − gateway fee {inr(e.marketplace.fees)}. Bodhin pays you.
            </Txt>
          </View>
        </View>
        {e.nextPayout && (
          <View style={[styles.payout, { backgroundColor: c.accentSoft }]}>
            <Ionicons name="calendar-outline" size={18} color={c.warning} />
            <Txt variant="label" style={{ flex: 1 }}>
              Next payout {inr(e.nextPayout.amount)} on {new Date(e.nextPayout.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Txt>
          </View>
        )}
      </View>
    </>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 120, h = 44;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <Svg width={w} height={h} accessibilityLabel="Earnings trend, last 9 months">
      <Path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity={0.08} />
      <Path d={d} stroke={color} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={4} fill={color} />
    </Svg>
  );
}

function Completion({ data }: { data: Data['completion'] }) {
  const { c } = useTheme();
  const total = data.completed + data.inProgress + data.notStarted || 1;
  const parts = [
    { label: 'Completed', n: data.completed, color: c.success },
    { label: 'In progress', n: data.inProgress, color: c.info },
    { label: 'Not started', n: data.notStarted, color: c.borderStrong },
  ];
  const size = 112, stroke = 14, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 18 }]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {parts.map((p) => {
            const len = (p.n / total) * circ;
            const el = <Circle key={p.label} cx={size / 2} cy={size / 2} r={r} stroke={p.color} strokeWidth={stroke} fill="none" strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
            offset += len;
            return el;
          })}
        </Svg>
        <Txt variant="heading">{Math.round((data.completed / total) * 100)}%</Txt>
        <Txt variant="caption" color={c.muted} style={{ fontSize: 10 }}>completed</Txt>
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Txt variant="label" style={{ flex: 1, fontWeight: '500' }}>{p.label}</Txt>
            <Txt variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{p.n.toLocaleString('en-IN')}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { borderWidth: 1.5, borderRadius: 20, padding: 14, gap: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  ws: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1, marginTop: 6 },
  wsLogo: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1.2, marginTop: 12 },
  live: { borderRadius: 22, padding: 18, gap: 6, marginTop: 14 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  kpi: { flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 6 },
  kpiIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 12, overflow: 'hidden' },
  attn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 62 },
  attnIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  split: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  channel: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  payout: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.md },
  act: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 },
  actIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, height: 56, borderRadius: 28, shadowColor: '#0B2A55', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, minHeight: 66 },
  createIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  growthTrialHero: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    gap: 14,
    marginTop: 12,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  rocketBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  perkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pairRow: {
    gap: 20,
    marginTop: 14,
  },
  pairCol: {
    minWidth: 0,
  },
  domainBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  quickHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionsContainer: {
    marginTop: 12,
    gap: 10,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionTile: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 100,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  quickActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
    marginVertical: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  stepIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  storefrontCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginBottom: 14,
  },
  storefrontIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
