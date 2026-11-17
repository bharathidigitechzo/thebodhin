/**
 * Certificate management (academy owner, and the Bodhin team for Bodhin's own courses).
 * Requests arrive when a learner finishes 75% of a course and passes the required quiz → approve (issued at once,
 * learner notified) or reject with a reason. Also: approval on/off, the required quiz per course, templates and designs.
 */
import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { certApprovals } from '@/api/academy';
import { CERT_MIN_PCT } from '@/core/academy';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { PillTabs } from '@/ui/pickers';
import { Page, ago, useAct, useDataAsync } from '@/ui/grow';
import { Card, ToggleRow, shared } from '@/ui/section';
import { pickImage } from '@/ui/pickMedia';

type Tab = 'requests' | 'rules' | 'designs';

export default function CertificateManagement() {
  const { c } = useTheme();
  const { d, err, load, userId } = useDataAsync(certApprovals.overview);
  const a = useAct();
  const [tab, setTab] = useState<Tab>('requests');
  const [reject, setReject] = useState<{ id: string; name: string; course: string } | null>(null);
  const [reason, setReason] = useState('');
  const admin = d?.ctx.tenant.id === 't_bodhin';

  return (
    <Page title="Certificates" sub={admin ? 'Bodhin courses · approvals and designs' : 'Approvals, rules and designs'} err={err} fallback={admin ? '/admin/more' : '/educator/more'} wide>
      {d && (
        <>
          <PillTabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'requests', label: `Requests${d.pending.length ? ` · ${d.pending.length}` : ''}`, icon: 'ribbon-outline' }, { id: 'rules', label: 'Rules', icon: 'options-outline' }, { id: 'designs', label: 'Templates', icon: 'color-palette-outline' }]} />
          {a.msg && <Banner tone="success" text={a.msg} />}
          {a.general && <Banner text={a.general} />}

          {tab === 'requests' && (
            <>
              <View style={shared.row}>
                <Pill text={d.mode === 'approval' ? 'You approve each certificate' : 'Issued automatically'} tone={d.mode === 'approval' ? 'info' : 'success'} />
                <Pill text={`${d.issuedCount} issued`} tone="gold" />
              </View>
              {d.pending.length === 0 && (
                <Card>
                  <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                    <Ionicons name="checkmark-done-circle-outline" size={36} color={c.success} />
                    <Txt variant="bodyStrong">No certificates waiting</Txt>
                    <Txt color={c.muted} center>When a learner completes {CERT_MIN_PCT}% of a course and passes its required quiz, the request appears here and you get a notification.</Txt>
                  </View>
                </Card>
              )}
              {d.pending.map(({ r, learner, course }) => (
                <Card key={r.id}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Ionicons name="ribbon-outline" size={24} color={c.primary} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="bodyStrong" numberOfLines={1}>{learner?.name ?? 'Learner'}</Txt>
                      <Txt variant="caption" color={c.muted} numberOfLines={1}>{learner?.email} · {course.title}</Txt>
                    </View>
                    <Pill text="Waiting" tone="warning" />
                  </View>
                  <View style={shared.row}>
                    <Pill text={`Progress ${r.progressPct}%`} tone={r.progressPct >= CERT_MIN_PCT ? 'success' : 'warning'} icon="trending-up" />
                    <Pill text={r.quizPct == null ? 'No quiz in course' : `Quiz ${r.quizPct}%`} tone={r.quizPct == null ? 'neutral' : 'success'} icon="help-circle" />
                    <Txt variant="caption" color={c.muted}>Requested {ago(r.requestedAt)}</Txt>
                  </View>
                  <View style={shared.row}>
                    <Button title="Approve" iconLeft="checkmark" size="md" style={{ flex: 1 }} loading={a.busy} onPress={async () => { if (await a.run(() => certApprovals.decide(userId, r.id, 'approve'), `Approved. ${learner?.name ?? 'The learner'} can download the certificate now.`)) load(); }} />
                    <Button title="Reject" iconLeft="close" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setReason(''); a.setFe(null); setReject({ id: r.id, name: learner?.name ?? 'Learner', course: course.title }); }} />
                  </View>
                </Card>
              ))}
              {d.decided.length > 0 && (
                <Card title="Recent decisions">
                  {d.decided.map(({ r, learner, course }) => (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                      <Ionicons name={r.status === 'approved' ? 'checkmark-circle' : 'close-circle'} size={20} color={r.status === 'approved' ? c.success : c.danger} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="label" numberOfLines={1}>{learner?.name} · {course.title}</Txt>
                        {r.reason ? <Txt variant="caption" color={c.muted} numberOfLines={2}>{r.reason}</Txt> : r.certId ? <Txt variant="caption" color={c.muted}>{r.certId}</Txt> : null}
                      </View>
                      <Txt variant="caption" color={c.muted}>{r.decidedAt ? ago(r.decidedAt) : ''}</Txt>
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}

          {tab === 'rules' && (
            <>
              <Card title="How certificates are issued">
                <ToggleRow title="I approve each certificate" sub={`Learners who reach ${CERT_MIN_PCT}% and pass the required quiz are sent to you first. Off: issued automatically.`} value={d.mode === 'approval'} onChange={async (v) => { if (await a.run(() => certApprovals.setMode(userId, v ? 'approval' : 'auto'), v ? 'Certificates now wait for your approval.' : 'Certificates are now issued automatically.')) load(); }} />
              </Card>
              <Card title="Required quiz per course">
                <Txt variant="caption" color={c.muted}>The learner must pass this quiz (its pass mark) to become eligible. Default: the last quiz of the course.</Txt>
                {d.courses.length === 0 && <Txt color={c.muted}>No courses yet.</Txt>}
                {d.courses.map(({ course, quizzes, required }) => (
                  <View key={course.id} style={{ gap: 6, paddingVertical: 6 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{course.title}</Txt>
                    {!course.certificate && <Txt variant="caption" color={c.warning}>Certificate is off for this course (Course builder → Pricing).</Txt>}
                    <View style={shared.chips}>
                      <Chip label="No quiz needed" active={required === 'none'} onPress={async () => { if (await a.run(() => certApprovals.setRequiredQuiz(userId, course.id, 'none'), 'Saved.')) load(); }} />
                      {quizzes.map((q) => <Chip key={q.id} label={`${q.title.slice(0, 26)} · ${q.passPct}%`} active={required === q.id} onPress={async () => { if (await a.run(() => certApprovals.setRequiredQuiz(userId, course.id, q.id), 'Saved.')) load(); }} />)}
                    </View>
                  </View>
                ))}
              </Card>
            </>
          )}

          {tab === 'designs' && (
            <>
              <Card title="Certificate template">
                <Txt variant="caption" color={c.muted}>Layout, wording, signer, logo and QR. Every certificate is generated from it with the learner’s name, course, date and a unique ID.</Txt>
                <Button title="Open the designer" iconLeft="color-palette-outline" size="md" onPress={() => router.push('/edu/certificate')} />
              </Card>
              <Card title={`Uploaded designs · ${d.designs.length}/6`} right={d.designs.length < 6 ? <Pressable onPress={async () => { const f = await pickImage(); if (!f) return; if (await a.run(() => certApprovals.addDesign(userId, { name: f.name, dataUrl: f.uri, mime: f.mime ?? undefined, sizeBytes: f.sizeBytes ?? undefined }), 'Design uploaded. Pick it in the designer.')) load(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Upload design" style={{ minHeight: 44, justifyContent: 'center' }}><Txt variant="label" color={c.primary}>+ Upload</Txt></Pressable> : undefined}>
                <Txt variant="caption" color={c.muted}>Your own background artwork (JPG, PNG or WebP, up to 5 MB, landscape A4 works best). The text is placed on top.</Txt>
                {d.designs.map((x) => (
                  <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 }}>
                    <View style={{ width: 84, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: c.surfaceMuted }}>
                      <Image source={{ uri: x.dataUrl }} style={{ width: '100%', height: '100%' }} accessibilityLabel={x.name} />
                    </View>
                    <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{x.name}</Txt>
                    <Button title="Remove" size="md" variant="outline" onPress={async () => { if (await a.run(() => certApprovals.removeDesign(userId, x.id), 'Design removed.')) load(); }} />
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      <BottomSheet open={!!reject} onClose={() => setReject(null)} title="Reject certificate" footer={<Button title="Reject and tell the learner" size="md" style={{ flex: 1 }} loading={a.busy} onPress={async () => { if (reject && (await a.run(() => certApprovals.decide(userId, reject.id, 'reject', reason), 'Rejected. The learner has your reason.'))) { setReject(null); load(); } }} />}>
        {reject && (
          <View style={{ gap: 10 }}>
            <Txt color={c.inkSoft}>{reject.name} · {reject.course}</Txt>
            <TextField label="Reason (the learner sees this)" placeholder="e.g. Please submit the final project before the certificate." value={reason} onChangeText={setReason} multiline error={a.err('reason')} />
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
