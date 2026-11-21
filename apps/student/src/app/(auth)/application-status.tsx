/** Tutor sign-up lands here: educator application status (blueprint: Draft → Submitted → Under review → Decision). */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Redirect } from 'expo-router';
import { auth } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Banner } from '@/ui/misc';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { BrandLogo } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';

const STAGES = [
  { key: 'submitted', title: 'Application submitted', sub: 'Your details have been received successfully.' },
  { key: 'under_review', title: 'Under review by Admin', sub: 'Our team verifies educator details within 1–2 business days.' },
  { key: 'approved', title: 'Workspace approved & activated', sub: 'Approval notification sent to your email with your portal link.' },
];

export default function ApplicationStatus() {
  const { c } = useTheme();
  const { session, signOut, setSession, setMode } = useAuth();
  const [tick, setTick] = useState(0);
  const app = session ? auth.getApplication(session.user.id) : null;
  const current = Math.max(0, STAGES.findIndex((s) => s.key === app?.status));
  const isApproved = app?.status === 'approved';

  // A draft never reaches the Super Admin — send the tutor to the form instead of a misleading "submitted" timeline.
  React.useEffect(() => {
    if (app?.status === 'draft') router.replace('/apply');
  }, [app?.status]);
  if (app?.status === 'draft') return <Redirect href="/apply" />;

  const handleRefresh = () => {
    setTick((t) => t + 1);
  };

  return (
    <Screen
      footer={
        <>
          {isApproved ? (
            <Button
              title="Open my educator workspace"
              iconRight="arrow-forward"
              onPress={() => {
                setSession(auth.refreshSession(session!.user.id));
                setMode('educator');
                router.replace('/educator/home');
              }}
            />
          ) : app?.status === 'changes_requested' ? (
            <Button title="Edit & resubmit application" iconRight="create-outline" onPress={() => router.push('/apply')} />
          ) : (
            <>
              <Button title="Refresh Status" variant="outline" iconLeft="refresh" onPress={handleRefresh} />
              <Button title="Explore Bodhin as a learner" variant="soft" iconRight="arrow-forward" onPress={() => router.replace('/home')} />
            </>
          )}
          <Button title="Sign out" variant="ghost" onPress={() => { signOut(); router.replace('/sign-in'); }} />
        </>
      }
    >
      <BrandLogo size="sm" />
      <View style={styles.head}>
        <TwoTone lead={isApproved ? "Welcome," : "Thanks,"} accent={session?.user.name.split(' ')[0] ?? 'there'} variant="title" center />
        <Txt center color={c.inkSoft}>
          {isApproved
            ? `Your educator workspace for ${app?.workspaceName || 'your academy'} is live! An approval email has been delivered to ${session?.user?.email}.`
            : `Your educator application for ${app?.workspaceName || 'your academy'} has been submitted and is currently in review. Once approved by Admin, an official approval email will be sent to your Gmail (${session?.user?.email}).`}
        </Txt>
      </View>

      {/* Status Highlights */}
      {isApproved ? (
        <View style={[styles.approvedBadge, { backgroundColor: '#e6f4ea', borderColor: c.success }]}>
          <Ionicons name="checkmark-circle" size={28} color={c.success} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" color={c.success}>Application Approved! 🎉</Txt>
            <Txt variant="caption" color={c.inkSoft}>
              Your academy workspace has been created. Click below to enter your Educator Dashboard.
            </Txt>
          </View>
        </View>
      ) : (
        <View style={[styles.pendingBadge, { backgroundColor: c.primarySoft, borderColor: c.primary }]}>
          <Ionicons name="time-outline" size={26} color={c.primary} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" color={c.primary}>Application Under Review ⏳</Txt>
            <Txt variant="caption" color={c.inkSoft}>
              Submitted details are queued for Super Admin review. You will receive an approval email at <Txt variant="caption" style={{ fontWeight: '600', color: c.ink }}>{session?.user?.email}</Txt>.
            </Txt>
          </View>
        </View>
      )}

      {app?.note && (app.status === 'changes_requested' || app.status === 'rejected') && (
        <Banner tone={app.status === 'rejected' ? 'danger' : 'info'} text={`${app.status === 'rejected' ? 'Not approved' : 'Bodhin asked for changes'}: ${app.note}`} />
      )}

      {/* Stage Tracker */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, marginTop: 12 }]}>
        <Txt variant="label" color={c.muted} style={{ marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Application Progress
        </Txt>
        {STAGES.map((s, i) => {
          const done = i < current || (i === current && s.key === 'approved');
          const active = i === current;
          const color = done ? c.success : active ? c.primary : c.borderStrong;
          return (
            <View key={s.key} style={styles.stage}>
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.node, { borderColor: color, backgroundColor: done ? c.success : active ? c.primarySoft : c.surface }]}>
                  {done ? <Ionicons name="checkmark" size={16} color="#fff" /> : active ? <View style={[styles.pulse, { backgroundColor: c.primary }]} /> : null}
                </View>
                {i < STAGES.length - 1 && <View style={[styles.line, { backgroundColor: i < current ? c.success : c.border }]} />}
              </View>
              <View style={{ flex: 1, paddingBottom: 18 }}>
                <Txt variant="bodyStrong" color={active || done ? c.ink : c.muted}>
                  {s.title}
                </Txt>
                <Txt variant="label" color={c.muted} style={{ fontWeight: '400', marginTop: 2 }}>
                  {s.sub}
                </Txt>
              </View>
            </View>
          );
        })}
      </View>

      {/* Summary of submitted details */}
      {app && (
        <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Txt variant="label" color={c.muted} style={{ marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Submitted Academy Information
          </Txt>
          <View style={styles.detailRow}>
            <Txt variant="label" color={c.muted}>Academy Name:</Txt>
            <Txt variant="bodyStrong">{app.workspaceName || 'Not specified'}</Txt>
          </View>
          {app.subjects && app.subjects.length > 0 && (
            <View style={styles.detailRow}>
              <Txt variant="label" color={c.muted}>Subjects:</Txt>
              <Txt variant="bodyStrong">{app.subjects.join(', ')}</Txt>
            </View>
          )}
          {app.city && (
            <View style={styles.detailRow}>
              <Txt variant="label" color={c.muted}>City / Location:</Txt>
              <Txt variant="body">{app.city}</Txt>
            </View>
          )}
          {app.experienceYears != null && (
            <View style={styles.detailRow}>
              <Txt variant="label" color={c.muted}>Experience:</Txt>
              <Txt variant="body">{app.experienceYears} Years</Txt>
            </View>
          )}
          <View style={styles.detailRow}>
            <Txt variant="label" color={c.muted}>Identity Verification:</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={app.idVerified ? 'shield-checkmark' : 'shield-outline'} size={16} color={app.idVerified ? c.success : c.warning} />
              <Txt variant="bodyStrong" color={app.idVerified ? c.success : c.warning}>
                {app.idVerified ? 'Government ID Verified' : 'Self-declared'}
              </Txt>
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  approvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 6,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 6,
  },
  card: { borderRadius: 20, borderWidth: 1, padding: 18 },
  summaryCard: { borderRadius: 20, borderWidth: 1, padding: 18, marginTop: 14, gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  stage: { flexDirection: 'row', gap: 14 },
  node: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pulse: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 2, flex: 1, minHeight: 24, marginVertical: 2 },
});
