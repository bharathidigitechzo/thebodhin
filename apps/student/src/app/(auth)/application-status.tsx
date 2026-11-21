/**
 * Tutor sign-up lands here: educator application status
 * (blueprint: Draft → Submitted → Under review → Approved).
 */
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Redirect } from 'expo-router';
import { auth } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Banner } from '@/ui/misc';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { BrandLogo } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';

export default function ApplicationStatus() {
  const { c } = useTheme();
  const { session, signOut, setSession, setMode } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const app = session ? auth.getApplication(session.user.id) : null;

  // A draft never reaches the Super Admin — send the tutor to the form instead
  React.useEffect(() => {
    if (app?.status === 'draft') {
      router.replace('/apply');
    }
  }, [app?.status]);

  if (app?.status === 'draft') return <Redirect href="/apply" />;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (session?.user?.id) {
        auth.refreshSession(session.user.id);
        setRefreshKey((k) => k + 1);
      }
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  const isApproved = app?.status === 'approved';
  const isRejected = app?.status === 'rejected';
  const isChangesRequested = app?.status === 'changes_requested';
  const isUnderReview = app?.status === 'under_review';
  const isSubmitted = app?.status === 'submitted' || !app?.status;

  const academyName = app?.workspaceName || (session?.user?.name ? `${session.user.name} Academy` : 'Uno Academy');
  const userEmail = session?.user?.email || 'your email';

  return (
    <Screen scroll>
      <BrandLogo size="sm" />
      <View style={styles.head}>
        <TwoTone
          lead={isRejected ? "Application," : isApproved ? "Welcome," : "Thanks,"}
          accent={isRejected ? "Not Approved" : (session?.user.name.split(' ')[0] ?? 'there')}
          variant="title"
          center
        />
        <Txt center color={c.inkSoft} style={{ fontSize: 14, lineHeight: 21, marginTop: 4 }}>
          {isRejected
            ? `Your educator application for ${academyName} was reviewed and not approved. Review the admin's note below to update your details and re-apply.`
            : `Your educator application for ${academyName} is submitted and is currently in review. Once approved by Admin, an official approval email will be sent to your Gmail (${userEmail}).`}
        </Txt>
      </View>

      {/* Changes requested or rejected notice */}
      {app?.note && (isChangesRequested || isRejected) && (
        <Banner
          tone={isRejected ? 'danger' : 'info'}
          text={`${isRejected ? 'Admin decision' : 'Bodhin asked for changes'}: ${app.note}`}
        />
      )}

      {/* Review Status Banner Card */}
      <View
        style={[
          styles.reviewBanner,
          {
            backgroundColor: isRejected ? '#FEF2F2' : '#F0F9FF',
            borderColor: isRejected ? '#FECACA' : '#BAE6FD',
          },
        ]}
      >
        <View
          style={[
            styles.reviewBannerIcon,
            { backgroundColor: isRejected ? '#FEE2E2' : '#E0F2FE' },
          ]}
        >
          <Ionicons
            name={isRejected ? 'close-circle-outline' : 'time-outline'}
            size={24}
            color={isRejected ? '#DC2626' : '#0284C7'}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Txt
            style={[
              styles.reviewBannerTitle,
              isRejected ? { color: '#991B1B' } : undefined,
            ]}
          >
            {isApproved
              ? 'Application Approved! 🎉'
              : isRejected
              ? 'Application Not Approved ❌'
              : 'Application Under Review ⏳'}
          </Txt>
          <Txt
            style={[
              styles.reviewBannerSubtitle,
              isRejected ? { color: '#7F1D1D' } : undefined,
            ]}
          >
            {isApproved
              ? 'Your educator workspace is activated. You can now configure your academy and start launching courses.'
              : isRejected
              ? `Reason: ${app?.note || 'Incomplete details'}. You can update your details and re-apply.`
              : `Submitted details are queued for Super Admin review. You will receive an approval email at ${userEmail}.`}
          </Txt>
        </View>
      </View>

      {/* Application Progress Stepper Card */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="caption" color={c.muted} style={styles.cardHeader}>
          APPLICATION PROGRESS
        </Txt>

        {/* Step 1: Application submitted */}
        <View style={styles.stageRow}>
          <View style={styles.stageIndicatorCol}>
            {isUnderReview || isApproved || isRejected ? (
              <View style={[styles.circleFilled, { backgroundColor: c.success, borderColor: c.success }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            ) : (
              <View style={[styles.radioOuter, { borderColor: c.primary, backgroundColor: '#EFF6FF' }]}>
                <View style={[styles.radioInner, { backgroundColor: c.primary }]} />
              </View>
            )}
            <View style={[styles.stageLine, { backgroundColor: isUnderReview || isApproved || isRejected ? c.success : '#E2E8F0' }]} />
          </View>
          <View style={styles.stageContent}>
            <Txt variant="bodyStrong" color={c.ink} style={styles.stageTitle}>
              Application submitted
            </Txt>
            <Txt variant="caption" color={c.muted} style={styles.stageSub}>
              Your details have been received successfully.
            </Txt>
          </View>
        </View>

        {/* Step 2: Under review by Admin */}
        <View style={styles.stageRow}>
          <View style={styles.stageIndicatorCol}>
            {isApproved ? (
              <View style={[styles.circleFilled, { backgroundColor: c.success, borderColor: c.success }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            ) : isRejected ? (
              <View style={[styles.circleFilled, { backgroundColor: '#DC2626', borderColor: '#DC2626' }]}>
                <Ionicons name="close" size={14} color="#FFFFFF" />
              </View>
            ) : isUnderReview ? (
              <View style={[styles.radioOuter, { borderColor: c.primary, backgroundColor: '#EFF6FF' }]}>
                <View style={[styles.radioInner, { backgroundColor: c.primary }]} />
              </View>
            ) : (
              <View style={[styles.circleOutline, { borderColor: '#CBD5E1' }]} />
            )}
            <View style={[styles.stageLine, { backgroundColor: isApproved ? c.success : '#E2E8F0' }]} />
          </View>
          <View style={styles.stageContent}>
            <Txt
              variant="bodyStrong"
              style={[
                styles.stageTitle,
                { color: isRejected ? '#DC2626' : isUnderReview ? c.ink : '#334155' },
              ]}
            >
              {isRejected ? 'Application not approved' : 'Under review by Admin'}
            </Txt>
            <Txt variant="caption" color={c.muted} style={styles.stageSub}>
              {isRejected
                ? (app?.note ? `Admin note: "${app.note}"` : 'Details need updates to meet educator criteria.')
                : 'Our team verifies educator details within 1–2 business days.'}
            </Txt>
          </View>
        </View>

        {/* Step 3: Workspace approved & activated */}
        <View style={[styles.stageRow, { marginBottom: 0 }]}>
          <View style={styles.stageIndicatorCol}>
            {isApproved ? (
              <View style={[styles.circleFilled, { backgroundColor: c.success, borderColor: c.success }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            ) : (
              <View style={[styles.circleOutline, { borderColor: '#CBD5E1' }]} />
            )}
          </View>
          <View style={styles.stageContent}>
            <Txt
              variant="bodyStrong"
              style={[styles.stageTitle, { color: isApproved ? c.ink : '#334155' }]}
            >
              Workspace approved &amp; activated
            </Txt>
            <Txt variant="caption" color={c.muted} style={styles.stageSub}>
              Approval notification sent to your email with your portal link.
            </Txt>
          </View>
        </View>
      </View>

      {/* Submitted Academy Information Card */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="caption" color={c.muted} style={styles.cardHeader}>
          SUBMITTED ACADEMY INFORMATION
        </Txt>

        <View style={styles.infoRow}>
          <Txt variant="body" color={c.muted} style={{ fontSize: 13.5 }}>
            Academy Name:
          </Txt>
          <Txt variant="bodyStrong" color={c.ink} style={{ fontSize: 14 }}>
            {academyName}
          </Txt>
        </View>

        <View style={[styles.infoRow, { marginTop: 14 }]}>
          <Txt variant="body" color={c.muted} style={{ fontSize: 13.5 }}>
            Identity Verification:
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={app?.idVerified ? 'shield-checkmark' : 'shield-outline'}
              size={16}
              color={app?.idVerified ? c.success : '#D97706'}
            />
            <Txt
              style={{
                fontSize: 13.5,
                fontWeight: '600',
                color: app?.idVerified ? c.success : '#D97706',
              }}
            >
              {app?.idVerified ? 'Verified via DigiLocker' : 'Self-declared'}
            </Txt>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsWrap}>
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
        ) : isRejected || app?.status === 'changes_requested' ? (
          <Button
            title="Re-apply with updated details"
            iconRight="create-outline"
            onPress={() => router.push('/apply')}
          />
        ) : null}

        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.refreshBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={handleRefresh}
        >
          <Ionicons
            name="refresh-outline"
            size={18}
            color={c.primary}
            style={refreshing ? { transform: [{ rotate: '45deg' }] } : undefined}
          />
          <Txt style={{ color: c.primary, fontWeight: '700', fontSize: 15 }}>
            {refreshing ? 'Refreshing...' : 'Refresh Status'}
          </Txt>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.exploreBtn, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}
          onPress={() => router.replace('/home')}
        >
          <Txt style={{ color: c.primary, fontWeight: '700', fontSize: 15 }}>
            Explore Bodhin as a learner
          </Txt>
          <Ionicons name="arrow-forward" size={18} color={c.primary} />
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 20,
  },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    marginBottom: 18,
    width: '100%',
  },
  reviewBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewBannerTitle: {
    color: '#0369A1',
    fontWeight: '700',
    fontSize: 15,
  },
  reviewBannerSubtitle: {
    color: '#0C4A6E',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 18,
    width: '100%',
  },
  cardHeader: {
    fontWeight: '700',
    letterSpacing: 0.8,
    fontSize: 11,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  stageRow: {
    flexDirection: 'row',
    gap: 14,
  },
  stageIndicatorCol: {
    alignItems: 'center',
    width: 24,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  circleFilled: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleOutline: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  stageLine: {
    width: 2,
    flex: 1,
    minHeight: 28,
    marginVertical: 4,
  },
  stageContent: {
    flex: 1,
    paddingBottom: 20,
  },
  stageTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  stageSub: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionsWrap: {
    width: '100%',
    gap: 12,
    marginTop: 4,
    marginBottom: 32,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
});
