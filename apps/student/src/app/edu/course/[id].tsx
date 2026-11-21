/**
 * Course Builder — one screen, four steps: Details · Content · Pricing & where to sell · Publish.
 * Saves on every step. Private courses go live instantly; marketplace listings go to Bodhin review.
 * Tutors can edit details and content; pricing and publishing are owner-only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, COVER_ICONS, COVER_PRESETS, catalog, courseAdmin, platform } from '@/api/client';
import { FORMAT_LABEL, LEVEL_LABEL, allLessons, inr, type Course, type Format, type Level } from '@/core/catalog';
import { paymentRoute, splitOrder } from '@/core/business';
import { coursesHome, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, IconButton, Pill } from '@/ui/kit';
import { Banner, Checkbox } from '@/ui/misc';
import { CourseArt } from '@/ui/course';
import { STATE_META } from '@/ui/courseState';
import { askOwnerToPublish, categoriesApi, respondToTutorReview } from '@/api/academy';
import { mediaError } from '@/core/academy';
import { pickImage, pickVideo } from '@/ui/pickMedia';
import { VideoPreview } from '@/ui/VideoPreview';
import { haptic } from '@/ui/haptics';

const STEPS = ['Details', 'Content', 'Pricing', 'Publish'] as const;
const LANGS = ['English', 'Tamil', 'Hindi', 'Telugu', 'Malayalam', 'Kannada'];
const fmtDur = (s: number) => {
  if (!s || s <= 0) return '0:00 min';
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    return sec > 0 ? `${h}h ${m}m ${sec}s` : `${h}h ${m}m`;
  }
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')} min`;
};

export default function CourseBuilder() {
  const { isDesktop } = useLayout();
  const { id, step: stepParam, review: reviewParam } = useLocalSearchParams<{ id: string; step?: string; review?: string }>();
  const { c: t } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [step, setStep] = useState(reviewParam === '1' ? 3 : Number(stepParam ?? 0));
  const [c, setC] = useState<Course | null>(null);
  const [meta, setMeta] = useState<ReturnType<typeof courseAdmin.get>>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | ReturnType<typeof courseAdmin.get>>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [previewLesson, setPreviewLesson] = useState<{ title: string; durationSec?: number; sizeMb?: number; uri?: string; moduleTitle?: string } | null>(null);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  const load = useCallback(() => {
    const m = courseAdmin.get(userId, id);
    setMeta(m);
    setC(m ? m.course : null);
  }, [userId, id]);
  useFocusEffect(load);

  const flash = (x: string) => {
    setToast(x);
    setTimeout(() => setToast(null), 2000);
  };

  if (!meta || !c) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.ivory, padding: 20, gap: 16, justifyContent: 'center' }}>
        <Banner text="This course isn’t available to you." />
        <Button title="Back to courses" onPress={() => router.replace(coursesHome(session) as never)} />
      </SafeAreaView>
    );
  }
  const owner = meta.role === 'owner';
  const set = (patch: Partial<Course>) => {
    setC((x) => (x ? { ...x, ...patch } : x));
    setErr(null);
  };

  /** Save fields this role may change for the current step. */
  const save = (silent = false) => {
    try {
      const base: Partial<Course> = { title: c.title, subtitle: c.subtitle, description: c.description, categoryId: c.categoryId, level: c.level, language: c.language, art: c.art, intro: c.intro, outcomes: c.outcomes.filter((o) => o.trim()) };
      const pricing: Partial<Course> = owner ? { priceInr: c.priceInr, compareAtInr: c.compareAtInr, offerEndsAt: c.offerEndsAt, format: c.format, accessMonths: c.accessMonths, drip: c.drip, visibility: c.visibility } : {};
      const saved = courseAdmin.update(userId, c.id, { ...base, ...pricing });
      setC(saved);
      if (!silent) flash('Saved');
      return true;
    } catch (e) {
      setErr((e as ApiError).message);
      return false;
    }
  };

  const validate = (s: number): string | null => {
    if (s === 0) {
      if (c.title.trim().length < 5) return 'Add a course title (5+ characters).';
      if (!c.categoryId) return 'Choose a category.';
      if (c.description.trim().length < 50) return 'Write a description of at least 50 characters.';
    }
    if (s === 2 && owner) {
      if (c.priceInr !== 0 && c.priceInr < 99) return 'Set a price of at least ₹99, or make the course free.';
      if (c.compareAtInr && c.compareAtInr <= c.priceInr) return 'The original price must be higher than the selling price.';
      if (c.compareAtInr && !c.offerEndsAt) return 'Pick when the offer ends. A crossed-out price needs a real deadline.';
    }
    return null;
  };

  const next = () => {
    const v = validate(step);
    if (v) return setErr(v);
    if (!save(true)) return;
    setStep((s) => Math.min(3, s + 1));
  };

  const publish = async () => {
    if (c.visibility !== 'private' && !agree) return setErr('Tick the marketplace guidelines box to submit the listing.');
    if (!save(true)) return;
    setBusy(true);
    try {
      await courseAdmin.publish(userId, c.id);
      const m = courseAdmin.get(userId, c.id);
      setMeta(m);
      setC(m!.course);
      setDone(m);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const exit = () => {
    save(true);
    router.canGoBack() ? router.back() : router.replace(coursesHome(session) as never);
  };

  // Back · Save · Next/Publish — pinned bar on phones, inline under the form on desktop.
  const navBar = (
    <>
    {step > 0 ? (
      <Pressable onPress={() => { save(true); setStep(step - 1); }} style={[styles.round, { borderColor: t.border }]} accessibilityRole="button" accessibilityLabel="Previous step">
        <Ionicons name="chevron-back" size={22} color={t.ink} />
      </Pressable>
    ) : null}
    <Button title="Save" variant="outline" iconLeft="save-outline" style={{ flex: 1 }} onPress={() => save()} />
    {step < 3 ? (
      <Button title={`Next: ${STEPS[step + 1]}`} iconRight="arrow-forward" style={{ flex: 1.6 }} onPress={next} />
    ) : owner && meta.state === 'draft' ? (
      <Button title={c.visibility === 'private' ? 'Publish' : 'Publish & submit'} iconRight="rocket-outline" loading={busy} style={{ flex: 1.6 }} onPress={publish} />
    ) : !owner && meta.state === 'draft' ? (
      <Button
        title={c.tutorReview?.status === 'pending' ? 'Submitted for Review' : 'Ask educator to publish'}
        iconRight="paper-plane-outline"
        disabled={c.tutorReview?.status === 'pending'}
        style={{ flex: 1.6 }}
        onPress={async () => {
          try {
            await askOwnerToPublish(userId, c.id);
            load();
            flash('Submitted to educator for review');
            haptic('success');
          } catch (e) {
            flash((e as ApiError).message);
          }
        }}
      />
    ) : (
      <Button title="Done" iconRight="checkmark" style={{ flex: 1.6 }} onPress={() => { save(true); router.replace(coursesHome(session) as never); }} />
    )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={[styles.top, isDesktop && { paddingHorizontal: 24, paddingVertical: 14 }]}>
          <IconButton icon="chevron-back" label="Save and go back" tone="filled" onPress={exit} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>{c.title || 'New course'}</Txt>
            <Pill text={STATE_META[meta.state].label} tone={STATE_META[meta.state].tone} />
          </View>
          <IconButton icon="eye-outline" label="Preview as a student" tone="filled" onPress={() => { save(true); router.push({ pathname: '/course/[id]', params: { id: c.id } }); }} />
          <Button title="Done" size="md" variant={meta.state === 'draft' ? 'outline' : 'primary'} onPress={exit} />
        </View>

        <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
        {/* stepper (desktop: vertical step list on the left) */}
        <View style={isDesktop ? [styles.stepCol, { borderRightColor: t.border }] : styles.stepper} accessibilityRole="tablist">
          {STEPS.map((s, i) => {
            const on = i === step;
            const past = i < step;
            return (
              <Pressable key={s} onPress={() => { if (i > step) { const v = validate(step); if (v) return setErr(v); } save(true); setStep(i); }} style={isDesktop ? [styles.stepRow, on && { backgroundColor: t.primarySoft }] : styles.stepItem} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <View style={[styles.stepDot, { backgroundColor: on ? t.primary : past ? t.success : t.surface, borderColor: on ? t.primary : past ? t.success : t.borderStrong }]}>
                  {past ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Txt variant="caption" color={on ? '#fff' : t.muted} style={{ fontWeight: '800' }}>{i + 1}</Txt>}
                </View>
                <Txt variant="caption" color={on ? t.primary : t.inkSoft} style={{ fontWeight: on ? '800' : '600' }}>{s}</Txt>
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: 32, paddingTop: 8, paddingBottom: 48 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, isDesktop && { maxWidth: 860 }]}>
            {err && <Banner text={err} />}

            {/* Tutor Submission Alert Banner */}
            {c.tutorReview?.status === 'pending' && (
              <View style={[styles.reviewAlert, { backgroundColor: t.warningBg, borderColor: t.warning }]}>
                <Ionicons name="alert-circle" size={24} color={t.warning} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong">
                    {owner ? `Tutor Submission from ${c.tutorReview.tutorName || 'Tutor'}` : 'Submitted for Educator Review'}
                  </Txt>
                  <Txt variant="caption" color={t.inkSoft}>
                    {owner
                      ? `${c.tutorReview.notes ? `Tutor note: "${c.tutorReview.notes}" · ` : ''}Preview videos below, set pricing in Step 3, and publish.`
                      : 'Your academy educator has been notified to review your videos, set pricing, and publish this course.'}
                  </Txt>
                </View>
                {owner && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Button title="Preview videos" size="md" variant="outline" onPress={() => setStep(1)} />
                    <Button title="Set pricing" size="md" onPress={() => setStep(2)} />
                  </View>
                )}
              </View>
            )}

            {c.tutorReview?.status === 'changes_requested' && (
              <View style={[styles.reviewAlert, { backgroundColor: t.dangerBg, borderColor: t.danger }]}>
                <Ionicons name="information-circle" size={24} color={t.danger} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong" color={t.danger}>
                    Changes Requested by {owner ? 'You' : 'Educator'}
                  </Txt>
                  <Txt variant="caption" color={t.inkSoft}>
                    {c.tutorReview.ownerFeedback || 'Please update the course lessons and resubmit.'}
                  </Txt>
                </View>
              </View>
            )}

            {step === 0 && <Details c={c} set={set} />}
            {step === 1 && <Content c={c} userId={userId} reload={load} onError={setErr} onPreviewVideo={setPreviewLesson} />}
            {step === 2 && (owner ? <Pricing c={c} set={set} state={meta.state} payReady={meta.ctx.tenant.payments?.directGatewayStatus === 'active'} host={meta.ctx.host} /> : <OwnerOnly c={c} reload={load} onSent={() => flash('Sent to educator for review')} />)}
            {step === 3 && (
              <Publish
                c={c}
                set={set}
                meta={meta}
                owner={owner}
                goStep={setStep}
                agree={agree || meta.state !== 'draft'}
                setAgree={setAgree}
                onPreviewVideo={setPreviewLesson}
                reload={load}
                onToast={flash}
                onRequestChanges={() => setFeedbackModal(true)}
                onPublished={(m) => {
                  if (m) {
                    setMeta(m);
                    setC(m.course);
                    setDone(m);
                  }
                }}
              />
            )}
            {isDesktop && <View style={[styles.barInner, { maxWidth: undefined, marginTop: 12 }]}>{navBar}</View>}
          </View>
        </ScrollView>
        </View>

        {!isDesktop && (
          <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
            <View style={styles.barInner}>{navBar}</View>
          </View>
        )}
        {toast && (
          <View style={[styles.toast, { backgroundColor: t.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff">{toast}</Txt>
          </View>
        )}
      </SafeAreaView>

      {/* Video Preview Modal */}
      <BottomSheet
        open={!!previewLesson}
        onClose={() => setPreviewLesson(null)}
        title={previewLesson?.title ? `Preview: ${previewLesson.title}` : 'Video Preview'}
        footer={<Button title="Done viewing video" size="md" style={{ flex: 1 }} onPress={() => setPreviewLesson(null)} />}
      >
        {previewLesson && (
          <View style={{ gap: 14 }}>
            <VideoPreview
              name={previewLesson.title}
              uri={previewLesson.uri || 'https://vjs.zencdn.net/v/oceans.mp4'}
              sizeMb={previewLesson.sizeMb}
            />
            <View style={{ gap: 4 }}>
              <Txt variant="bodyStrong">{previewLesson.title}</Txt>
              <Txt variant="caption" color={t.muted}>
                {previewLesson.durationSec ? `${fmtDur(previewLesson.durationSec)} · ` : ''}
                {previewLesson.moduleTitle ? `${previewLesson.moduleTitle} · ` : ''}
                Uploaded lesson video
              </Txt>
            </View>
          </View>
        )}
      </BottomSheet>

      {/* Changes Request Feedback Modal */}
      <BottomSheet
        open={feedbackModal}
        onClose={() => setFeedbackModal(false)}
        title="Request Changes from Tutor"
        footer={
          <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
            <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setFeedbackModal(false)} />
            <Button
              title="Send feedback"
              size="md"
              style={{ flex: 1 }}
              disabled={!feedbackText.trim()}
              onPress={async () => {
                try {
                  await respondToTutorReview(userId, c.id, 'request_changes', feedbackText.trim());
                  setFeedbackModal(false);
                  setFeedbackText('');
                  load();
                  flash('Feedback sent to tutor. Course remains in draft.');
                  haptic('success');
                } catch (e) {
                  flash((e as ApiError).message);
                }
              }}
            />
          </View>
        }
      >
        <View style={{ gap: 12 }}>
          <Txt color={t.inkSoft}>
            Provide specific guidance on what the tutor should fix (e.g. video audio, additional practice exercises, or description).
          </Txt>
          <TextField
            label="Feedback for tutor"
            placeholder="e.g. Please re-record lesson 2 with a clearer microphone and add downloadable PDF cheat sheet."
            value={feedbackText}
            onChangeText={setFeedbackText}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        open={!!done}
        onClose={() => {
          setDone(null);
          router.replace(coursesHome(session) as never);
        }}
        title={done?.state === 'in_review' ? 'Published · in review' : 'Course published'}
        footer={
          <>
            <Button title="Preview course" variant="outline" size="md" style={{ flex: 1 }} onPress={() => { setDone(null); router.push({ pathname: '/course/[id]', params: { id: c.id } }); }} />
            <Button title="Done · Close form" size="md" style={{ flex: 1.4 }} onPress={() => { setDone(null); router.replace(coursesHome(session) as never); }} />
          </>
        }
      >
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={[styles.okIcon, { backgroundColor: t.successBg }]}>
            <Ionicons name="rocket" size={36} color={t.success} />
          </View>
          <Txt center color={t.inkSoft}>
            {done?.state === 'in_review'
              ? `“${c.title}” is live on ${meta.ctx.host} now. Bodhin will review the marketplace listing within 24–48 hours and notify you.`
              : `“${c.title}” is live on ${meta.ctx.host}. Share the link with your students.`}
          </Txt>
        </View>
      </BottomSheet>
    </View>
  );
}

/* ───────── Step 1: Details ───────── */
function Details({ c, set }: { c: Course; set: (p: Partial<Course>) => void }) {
  const { c: t } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [cats, setCats] = useState(() => categoriesApi.forCourse(userId));
  const [catOpen, setCatOpen] = useState(false);
  const [other, setOther] = useState<string | null>(null);
  const [catErr, setCatErr] = useState<string | null>(null);
  const [mediaErr, setMediaErr] = useState<{ cover?: string; video?: string }>({});
  const outcomes = c.outcomes.length ? c.outcomes : [''];
  const current = cats.find((k) => k.id === c.categoryId);
  const saveOther = async () => {
    try {
      const k = await categoriesApi.add(userId, other ?? '');
      setCats(categoriesApi.forCourse(userId));
      set({ categoryId: k.id });
      setOther(null);
      setCatErr(null);
      haptic('success');
    } catch (e) { setCatErr((e as ApiError).message); haptic('error'); }
  };
  const chooseCover = async () => {
    const f = await pickImage();
    if (!f) return;
    const e = mediaError('cover', f);
    if (e) { setMediaErr({ ...mediaErr, cover: e }); haptic('error'); return; }
    setMediaErr({ ...mediaErr, cover: undefined });
    set({ art: { ...c.art, image: f.uri } });
  };
  const chooseVideo = async () => {
    const f = await pickVideo();
    if (!f) return;
    const e = mediaError('video', f);
    if (e) { setMediaErr({ ...mediaErr, video: e }); haptic('error'); return; }
    setMediaErr({ ...mediaErr, video: undefined });
    set({ intro: { name: f.name, sizeMb: Math.round(((f.sizeBytes ?? 0) / 1048576) * 10) / 10, uri: f.uri, mime: f.mime ?? undefined, at: new Date().toISOString() } });
  };
  return (
    <>
      <Section icon="information-circle-outline" title="Course details" sub="This is what learners see first.">
        <TextField label="Course title *" placeholder="e.g. Digital Marketing & AI Mastery" value={c.title} onChangeText={(v) => set({ title: v.slice(0, 100) })} hint={`${c.title.length} / 100`} />
        <TextField label="Subtitle" placeholder="One line on what learners achieve" value={c.subtitle} onChangeText={(v) => set({ subtitle: v.slice(0, 150) })} hint={`${c.subtitle.length} / 150`} />
        <Field label="Category *">
          <Pressable onPress={() => setCatOpen(true)} accessibilityRole="button" accessibilityLabel={`Category: ${current?.name ?? 'choose a category'}`} style={[styles.select, { borderColor: t.border, backgroundColor: t.surface }]}>
            <Ionicons name={((current?.icon ?? 'apps') + '-outline') as keyof typeof Ionicons.glyphMap} size={20} color={current ? t.primary : t.muted} />
            <Txt style={{ flex: 1 }} color={current ? t.ink : t.muted}>{current?.name ?? 'Choose a category'}</Txt>
            <Ionicons name="chevron-down" size={18} color={t.muted} />
          </Pressable>
          {other !== null && (
            <View style={{ gap: 8 }}>
              <TextField label="New category name" placeholder="e.g. Spoken Tamil, Drone pilot training" value={other} onChangeText={(v) => { setOther(v.slice(0, 40)); setCatErr(null); }} error={catErr ?? undefined} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Save category" size="md" style={{ flex: 1 }} onPress={saveOther} />
                <Button title="Cancel" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setOther(null); setCatErr(null); }} />
              </View>
              <Txt variant="caption" color={t.muted}>Saved categories stay in this list for your future courses.</Txt>
            </View>
          )}
        </Field>
        <BottomSheet open={catOpen} onClose={() => setCatOpen(false)} title="Choose a category">
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 4 }}>
            {cats.map((k) => {
              const on = c.categoryId === k.id;
              return (
                <Pressable key={k.id} onPress={() => { set({ categoryId: k.id }); setOther(null); setCatOpen(false); haptic('select'); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={k.name} style={[styles.option, { backgroundColor: on ? t.primarySoft : 'transparent' }]}>
                  <Ionicons name={(k.icon + '-outline') as keyof typeof Ionicons.glyphMap} size={20} color={on ? t.primary : t.inkSoft} />
                  <Txt style={{ flex: 1 }} variant={on ? 'bodyStrong' : 'body'}>{k.name}</Txt>
                  {k.own && <Pill text="Yours" tone="info" />}
                  {on && <Ionicons name="checkmark" size={20} color={t.primary} />}
                </Pressable>
              );
            })}
            <Pressable onPress={() => { setOther(''); setCatOpen(false); }} accessibilityRole="button" accessibilityLabel="Other: add a new category" style={styles.option}>
              <Ionicons name="add-circle-outline" size={20} color={t.primary} />
              <Txt style={{ flex: 1 }} color={t.primary} variant="bodyStrong">Other… add a new category</Txt>
            </Pressable>
          </ScrollView>
        </BottomSheet>
        <Field label="Level *">
          <View style={styles.wrap}>
            {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => <Chip key={l} label={LEVEL_LABEL[l]} active={c.level === l} onPress={() => set({ level: l })} />)}
          </View>
        </Field>
        <Field label="Teaching language *">
          <View style={styles.wrap}>
            {LANGS.map((l) => <Chip key={l} label={l} active={(c.language ?? 'English') === l} onPress={() => set({ language: l })} />)}
          </View>
        </Field>
        <Field label="Description *">
          <TextInput value={c.description} onChangeText={(v) => set({ description: v.slice(0, 2000) })} multiline placeholder="What will learners be able to do after this course? Who is it for? Any prerequisites?" placeholderTextColor={t.muted} accessibilityLabel="Course description" style={[styles.area, { borderColor: t.border, backgroundColor: t.surfaceMuted, color: t.ink }]} />
          <Txt variant="caption" color={c.description.length < 50 ? t.warning : t.muted} style={{ alignSelf: 'flex-end' }}>{c.description.length < 50 ? `${50 - c.description.length} more characters needed` : `${c.description.length} / 2000`}</Txt>
        </Field>
      </Section>

      <Section icon="image-outline" title="Cover" sub="Shown on cards and the course page.">
        <CourseArt course={c} height={150} rounded={18} showTitle />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title={c.art.image ? 'Replace image' : 'Upload cover image'} iconLeft="cloud-upload-outline" size="md" variant={c.art.image ? 'outline' : 'primary'} style={{ flexGrow: 1 }} onPress={chooseCover} />
          {c.art.image && <Button title="Remove image" iconLeft="trash-outline" size="md" variant="outline" style={{ flexGrow: 1 }} onPress={() => set({ art: { ...c.art, image: undefined } })} />}
        </View>
        {mediaErr.cover ? <Banner text={mediaErr.cover} /> : <Txt variant="caption" color={t.muted}>JPG, PNG or WebP, up to 5 MB. 1280 × 720 looks best. {c.art.image ? 'Colour and icon below are used if you remove the image.' : 'No image? Pick a colour and icon below.'}</Txt>}
        <Field label="Colour">
          <View style={styles.wrap}>
            {COVER_PRESETS.map((p) => {
              const on = c.art.from === p.from && c.art.to === p.to;
              return (
                <Pressable key={p.from} onPress={() => set({ art: { ...c.art, ...p } })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel="Cover colour" style={[styles.swatch, { borderColor: on ? t.ink : 'transparent' }]}>
                  <View style={{ flex: 1, borderRadius: 10, overflow: 'hidden', flexDirection: 'row' }}>
                    <View style={{ flex: 1, backgroundColor: p.from }} />
                    <View style={{ flex: 1, backgroundColor: p.to }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Field>
        <Field label="Icon">
          <View style={styles.wrap}>
            {COVER_ICONS.map((i) => {
              const on = c.art.icon === i;
              return (
                <Pressable key={i} onPress={() => set({ art: { ...c.art, icon: i } })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={i} style={[styles.iconPick, { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface }]}>
                  <Ionicons name={i as any} size={22} color={on ? t.primary : t.inkSoft} />
                </Pressable>
              );
            })}
          </View>
        </Field>
      </Section>

      <Section icon="videocam-outline" title="Intro video" sub="A short preview on the course page (optional).">
        {c.intro ? (
          <View style={{ gap: 8 }}>
            <VideoPreview uri={c.intro.uri} name={c.intro.name} sizeMb={c.intro.sizeMb} />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button title="Replace video" iconLeft="swap-horizontal" size="md" variant="outline" style={{ flexGrow: 1 }} onPress={chooseVideo} />
              <Button title="Remove video" iconLeft="trash-outline" size="md" variant="outline" style={{ flexGrow: 1 }} onPress={() => set({ intro: undefined })} />
            </View>
          </View>
        ) : (
          <Button title="Upload intro video" iconLeft="cloud-upload-outline" size="md" onPress={chooseVideo} />
        )}
        {mediaErr.video ? <Banner text={mediaErr.video} /> : <Txt variant="caption" color={t.muted}>MP4, MOV, WebM or MKV, up to 2 GB. Lesson videos are added in Content.</Txt>}
      </Section>

      <Section icon="flag-outline" title="What learners will get" sub="Add 3–6 outcomes. Start each with a verb.">
        {outcomes.map((o, i) => (
          <View key={i} style={styles.outRow}>
            <Ionicons name="checkmark-circle" size={20} color={o.trim() ? t.success : t.borderStrong} />
            <TextInput value={o} onChangeText={(v) => set({ outcomes: outcomes.map((x, j) => (j === i ? v.slice(0, 90) : x)) })} placeholder={['Run a Google Ads campaign', 'Plan a month of content', 'Read an analytics report'][i] ?? 'Another outcome'} placeholderTextColor={t.muted} accessibilityLabel={`Outcome ${i + 1}`} style={[styles.outInput, { color: t.ink, borderColor: t.border }]} />
            <IconButton icon="trash-outline" label={`Remove outcome ${i + 1}`} onPress={() => set({ outcomes: outcomes.filter((_, j) => j !== i) })} />
          </View>
        ))}
        {outcomes.length < 6 && <Button title="Add outcome" iconLeft="add" variant="soft" size="md" onPress={() => set({ outcomes: [...outcomes, ''] })} />}
        <Txt variant="caption" color={outcomes.filter((o) => o.trim()).length >= 3 ? t.success : t.muted}>{outcomes.filter((o) => o.trim()).length} of 3 minimum</Txt>
      </Section>
    </>
  );
}

/* ───────── Step 2: Content ───────── */
function Content({
  c,
  userId,
  reload,
  onError,
  onPreviewVideo,
}: {
  c: Course;
  userId: string;
  reload: () => void;
  onError: (e: string) => void;
  onPreviewVideo?: (l: { title: string; durationSec?: number; sizeMb?: number; uri?: string; moduleTitle?: string }) => void;
}) {
  const { c: t } = useTheme();
  const [open, setOpen] = useState<Set<string>>(() => new Set(c.modules.map((m) => m.id)));
  const [sheet, setSheet] = useState<null | { mode: 'add' } | { mode: 'rename'; id: string; title: string } | { mode: 'delete'; id: string; title: string }>(null);
  const [name, setName] = useState('');
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    if (c.modules.length === 0 && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      setName('');
      setSheet({ mode: 'add' });
    }
  }, [c.modules.length]);

  useEffect(() => {
    if (c.modules.length) {
      setOpen((prev) => {
        const next = new Set(prev);
        c.modules.forEach((m) => next.add(m.id));
        return next;
      });
    }
  }, [c.modules]);

  const lessons = allLessons(c);
  const dur = lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0);
  const resources = lessons.filter((l) => l.type === 'pdf').length + lessons.reduce((s, l) => s + (l.resources?.length ?? 0), 0);
  const run = (fn: () => void) => {
    try {
      fn();
      reload();
      setSheet(null);
    } catch (e) {
      onError((e as ApiError).message);
      setSheet(null);
    }
  };
  const openLesson = (moduleId: string, lessonId?: string) => router.push({ pathname: '/edu/lesson', params: { courseId: c.id, moduleId, ...(lessonId ? { lessonId } : {}) } });

  return (
    <>
      <View style={[styles.statsRow, { backgroundColor: t.surface, borderColor: t.border }]}>
        {([['layers-outline', c.modules.length, 'Modules'], ['play-circle-outline', lessons.length, 'Lessons'], ['time-outline', fmtDur(dur), 'Duration'], ['document-text-outline', resources, 'Resources']] as const).map(([i, v, l]) => (
          <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Ionicons name={i} size={20} color={t.primary} />
            <Txt variant="bodyStrong">{String(v)}</Txt>
            <Txt variant="caption" color={t.muted}>{l}</Txt>
          </View>
        ))}
      </View>

      {c.modules.length === 0 && (
        <View style={[styles.emptyBox, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: t.primarySoft }]}>
            <Ionicons name="folder-open-outline" size={28} color={t.primary} />
          </View>
          <Txt variant="bodyStrong">No modules yet</Txt>
          <Txt variant="caption" color={t.muted} center style={{ maxWidth: 360 }}>
            Every course begins with Module 1. Name and create your first module to organize lessons and curriculum.
          </Txt>
          <Button
            title="Add Module 1"
            iconLeft="add-circle-outline"
            onPress={() => { setName(''); setSheet({ mode: 'add' }); }}
            style={{ marginTop: 6 }}
          />
        </View>
      )}

      {c.modules.map((m, mi) => {
        const isOpen = open.has(m.id);
        const mDur = m.lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0);
        return (
          <View key={m.id} style={[styles.module, { backgroundColor: t.surface, borderColor: m.lessons.length ? t.border : t.warning }]}>
            <View style={styles.modHead}>
              <Pressable onPress={() => setOpen((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 48 }} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                <View style={[styles.modNo, { backgroundColor: t.primarySoft }]}><Txt variant="label" color={t.primary}>{mi + 1}</Txt></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={2}>{m.title}</Txt>
                  <Txt variant="caption" color={m.lessons.length ? t.muted : t.warning}>{m.lessons.length ? `${m.lessons.length} lessons · ${fmtDur(mDur)}` : 'No lessons yet'}</Txt>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={t.muted} />
              </Pressable>
              <IconButton icon="pencil-outline" label="Rename module" onPress={() => { setName(m.title); setSheet({ mode: 'rename', id: m.id, title: m.title }); }} />
            </View>
            {isOpen && (
              <>
                {m.lessons.map((l, li) => (
                  <View key={l.id} style={[styles.lesson, { borderTopColor: t.border }]}>
                    <Pressable onPress={() => openLesson(m.id, l.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 }} accessibilityRole="button" accessibilityLabel={`Edit lesson ${l.title}`}>
                      <Ionicons name={l.type === 'video' ? 'play-circle-outline' : l.type === 'pdf' ? 'document-text-outline' : 'help-circle-outline'} size={24} color={t.inkSoft} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="label" numberOfLines={2}>{li + 1}. {l.title}</Txt>
                        <Txt variant="caption" color={t.muted}>{l.type === 'video' ? `Video · ${fmtDur(l.durationSec ?? 0)}` : l.type === 'pdf' ? `PDF · ${l.sizeMb} MB` : `Quiz · ${l.questions} questions`}{l.preview ? ' · Free preview' : ''}</Txt>
                      </View>
                    </Pressable>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {l.type === 'video' && onPreviewVideo && (
                        <IconButton
                          icon="play-circle"
                          label="Preview video"
                          tone="filled"
                          onPress={() => onPreviewVideo({ title: l.title, durationSec: l.durationSec, sizeMb: l.sizeMb, uri: l.videoUrl || l.videoUri, moduleTitle: m.title })}
                        />
                      )}
                      <IconButton icon="chevron-up" label="Move lesson up" onPress={() => run(() => courseAdmin.moveLesson(userId, c.id, m.id, l.id, -1))} />
                      <IconButton icon="chevron-down" label="Move lesson down" onPress={() => run(() => courseAdmin.moveLesson(userId, c.id, m.id, l.id, 1))} />
                    </View>
                  </View>
                ))}
                <View style={[styles.modActions, { borderTopColor: t.border }]}>
                  <Pressable onPress={() => openLesson(m.id)} style={[styles.addLesson, { backgroundColor: t.primarySoft }]} accessibilityRole="button">
                    <Ionicons name="add" size={20} color={t.primary} />
                    <Txt variant="label" color={t.primary}>Add lesson</Txt>
                  </Pressable>
                  <IconButton icon="pencil-outline" label="Rename module" onPress={() => { setName(m.title); setSheet({ mode: 'rename', id: m.id, title: m.title }); }} />
                  <IconButton icon="arrow-up-outline" label="Move module up" onPress={() => run(() => courseAdmin.moveModule(userId, c.id, m.id, -1))} />
                  <IconButton icon="arrow-down-outline" label="Move module down" onPress={() => run(() => courseAdmin.moveModule(userId, c.id, m.id, 1))} />
                  <IconButton icon="trash-outline" label="Delete module" onPress={() => setSheet({ mode: 'delete', id: m.id, title: m.title })} />
                </View>
              </>
            )}
          </View>
        );
      })}

      {c.modules.length > 0 && (
        <Button
          title={`Add Module ${c.modules.length + 1}`}
          iconLeft="add-circle-outline"
          variant="outline"
          onPress={() => { setName(''); setSheet({ mode: 'add' }); }}
        />
      )}

      <View style={[styles.tips, { backgroundColor: t.accentSoft }]}>
        <Ionicons name="bulb-outline" size={20} color={t.warning} />
        <Txt variant="caption" color={t.inkSoft} style={{ flex: 1 }}>Keep lessons 5–20 minutes. Mark the first lesson as a free preview: it helps marketplace learners decide. Quizzes are added from the Quiz builder.</Txt>
      </View>

      <BottomSheet
        open={!!sheet && sheet.mode !== 'delete'}
        onClose={() => setSheet(null)}
        title={sheet?.mode === 'rename' ? 'Rename module' : `Add Module ${c.modules.length + 1}`}
        footer={
          <Button
            title={sheet?.mode === 'rename' ? 'Save' : `Add Module ${c.modules.length + 1}`}
            disabled={name.trim().length < 3}
            style={{ flex: 1 }}
            onPress={() => run(() => (sheet?.mode === 'rename' ? courseAdmin.renameModule(userId, c.id, sheet.id, name) : courseAdmin.addModule(userId, c.id, name)))}
          />
        }
      >
        <TextField
          label={sheet?.mode === 'rename' ? 'Module name' : `Module ${c.modules.length + 1} name`}
          placeholder={c.modules.length === 0 ? 'e.g. Introduction & Fundamentals' : c.modules.length === 1 ? 'e.g. Core Concepts & Practical Projects' : 'e.g. Advanced Topics & Real-world Practice'}
          hint="Minimum 3 characters"
          autoFocus
          value={name}
          onChangeText={setName}
        />
      </BottomSheet>
      <BottomSheet
        open={sheet?.mode === 'delete'}
        onClose={() => setSheet(null)}
        title="Delete module?"
        footer={
          <>
            <Button title="Keep" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setSheet(null)} />
            <Button title="Delete" size="md" style={{ flex: 1, backgroundColor: t.danger }} onPress={() => sheet?.mode === 'delete' && run(() => courseAdmin.deleteModule(userId, c.id, sheet.id))} />
          </>
        }
      >
        <Txt color={t.inkSoft}>“{sheet?.mode === 'delete' ? sheet.title : ''}” and its lessons will be removed from this course.</Txt>
      </BottomSheet>
    </>
  );
}

/* ───────── Step 3: Pricing & where to sell ───────── */
function Pricing({ c, set, state, payReady, host }: { c: Course; set: (p: Partial<Course>) => void; state: string; payReady: boolean; host: string }) {
  const { c: t } = useTheme();
  const cfg = platform.config();
  const [isPaid, setPaid] = useState(c.priceInr > 0);
  const [priceText, setPriceText] = useState(c.priceInr ? String(c.priceInr) : '');
  const [offer, setOffer] = useState(!!c.compareAtInr);
  const [cmpText, setCmpText] = useState(c.compareAtInr ? String(c.compareAtInr) : '');
  useEffect(() => {
    if (!isPaid) set({ priceInr: 0, compareAtInr: undefined, offerEndsAt: undefined });
    else set({ priceInr: Number(priceText) || 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid]);
  const pct = c.compareAtInr && c.priceInr ? Math.round((1 - c.priceInr / c.compareAtInr) * 100) : 0;
  const direct = splitOrder(c.priceInr, paymentRoute(c.tenantId, c.tenantId, cfg), cfg);
  const market = splitOrder(c.priceInr, paymentRoute(c.tenantId, null, cfg), cfg);
  const published = state !== 'draft';
  const endIn = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  };

  return (
    <>
      <Section icon="pricetag-outline" title="Price" sub="Prices include GST. Learners see the full price before paying.">
        <View style={styles.twoCards}>
          {([[true, 'cash-outline', 'Paid', 'One-time fee for full access'], [false, 'gift-outline', 'Free', 'Anyone in your workspace can join']] as const).map(([v, icon, l, sub]) => (
            <Pressable key={l} onPress={() => setPaid(v)} style={[styles.choice, { borderColor: isPaid === v ? t.primary : t.border, backgroundColor: isPaid === v ? t.primarySoft : t.surface }, isPaid === v && { borderWidth: 2 }]} accessibilityRole="radio" accessibilityState={{ checked: isPaid === v }}>
              <Ionicons name={icon} size={24} color={t.primary} />
              <Txt variant="bodyStrong">{l}</Txt>
              <Txt variant="caption" color={t.muted}>{sub}</Txt>
            </Pressable>
          ))}
        </View>
        {isPaid && (
          <>
            <TextField label="Selling price (₹) *" prefix="₹" keyboardType="number-pad" placeholder="17500" value={priceText} onChangeText={(v) => { const n = v.replace(/\D/g, '').slice(0, 7); setPriceText(n); set({ priceInr: Number(n) || 0 }); }} />
            <Pressable onPress={() => { const on = !offer; setOffer(on); if (!on) { setCmpText(''); set({ compareAtInr: undefined, offerEndsAt: undefined }); } }} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: offer }}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">Limited-time offer</Txt>
                <Txt variant="caption" color={t.muted}>Show the original price crossed out until a real end date.</Txt>
              </View>
              <Switch value={offer} onValueChange={(v) => { setOffer(v); if (!v) { setCmpText(''); set({ compareAtInr: undefined, offerEndsAt: undefined }); } }} trackColor={{ true: t.primary, false: t.borderStrong }} thumbColor="#fff" />
            </Pressable>
            {offer && (
              <>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                  <View style={{ flex: 1 }}>
                    <TextField label="Original price (₹)" prefix="₹" keyboardType="number-pad" placeholder="24500" value={cmpText} onChangeText={(v) => { const n = v.replace(/\D/g, '').slice(0, 7); setCmpText(n); set({ compareAtInr: Number(n) || undefined }); }} />
                  </View>
                  {pct > 0 && <View style={{ marginBottom: 12 }}><Pill text={`${pct}% OFF`} tone="success" icon="pricetag" /></View>}
                </View>
                <Field label="Offer ends *">
                  <View style={styles.wrap}>
                    {[7, 14, 30].map((d) => {
                      const iso = endIn(d);
                      const on = !!c.offerEndsAt && Math.abs(new Date(c.offerEndsAt).getTime() - new Date(iso).getTime()) < 864e5 / 2;
                      return <Chip key={d} label={`${d} days`} active={on} onPress={() => set({ offerEndsAt: iso })} />;
                    })}
                  </View>
                  {c.offerEndsAt && <Txt variant="caption" color={t.inkSoft}>Ends {new Date(c.offerEndsAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. After that the normal price shows automatically.</Txt>}
                </Field>
              </>
            )}
          </>
        )}
      </Section>

      <Section icon="layers-outline" title="Delivery & access">
        <Field label="How it’s taught">
          <View style={styles.wrap}>
            {(['recorded', 'live', 'hybrid'] as Format[]).map((f) => <Chip key={f} label={FORMAT_LABEL[f]} icon={f === 'live' ? 'radio' : f === 'recorded' ? 'play-circle' : 'layers'} active={c.format === f} onPress={() => set({ format: f })} />)}
          </View>
        </Field>
        <Field label="Access after enrolling">
          <View style={styles.wrap}>
            {[3, 6, 12, null].map((m) => <Chip key={String(m)} label={m ? `${m} months` : 'Lifetime'} active={(c.accessMonths ?? null) === m} onPress={() => set({ accessMonths: m })} />)}
          </View>
        </Field>
        <Pressable onPress={() => set({ drip: { everyDays: c.drip?.everyDays ?? 7, enabled: !c.drip?.enabled } })} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: !!c.drip?.enabled }}>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Release modules gradually</Txt>
            <Txt variant="caption" color={t.muted}>Unlock the next module on a schedule after enrolling.</Txt>
          </View>
          <Switch value={!!c.drip?.enabled} onValueChange={(v) => set({ drip: { everyDays: c.drip?.everyDays ?? 7, enabled: v } })} trackColor={{ true: t.primary, false: t.borderStrong }} thumbColor="#fff" />
        </Pressable>
        {c.drip?.enabled && (
          <View style={styles.wrap}>
            {[3, 7, 14].map((d) => <Chip key={d} label={`Every ${d} days`} active={c.drip?.everyDays === d} onPress={() => set({ drip: { enabled: true, everyDays: d } })} />)}
          </View>
        )}
      </Section>

      <Section icon="storefront-outline" title="Where to sell" sub="Private by default. Listing and promotion are separate choices you can change any time.">
        {([
          ['private', 'lock-closed-outline', 'Only my students', `Sell on ${host} and private links. You collect the payment directly. No commission.`],
          ['public', 'storefront-outline', 'Also list on Bodhin marketplace', 'Bodhin reviews it first (24–48 h). Sales made on Bodhin are collected by Bodhin and paid out to you after commission.'],
          ['public_promoted', 'megaphone-outline', 'List + allow Bodhin promotion', 'Bodhin may also feature it in campaigns and newsletters. Withdraw consent any time.'],
        ] as const).map(([v, icon, l, sub]) => {
          const on = c.visibility === v;
          return (
            <Pressable key={v} onPress={() => set({ visibility: v })} style={[styles.sell, { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface }, on && { borderWidth: 2 }]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
              <Ionicons name={icon} size={24} color={t.primary} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{l}</Txt>
                <Txt variant="caption" color={t.inkSoft}>{sub}</Txt>
              </View>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.primary : t.borderStrong} />
            </Pressable>
          );
        })}
      </Section>

      {c.priceInr > 0 && (
        <Section icon="wallet-outline" title="What you receive" sub={`On a ${inr(c.priceInr)} sale`}>
          <Receive label="Sold on your site" sub="Paid straight to your gateway" amount={direct.educatorNet} tone={t.success} />
          {c.visibility !== 'private' && (
            <Receive label="Sold on Bodhin marketplace" sub={`${inr(market.gross)} − ${Math.round(cfg.commissionRate * 100)}% commission ${inr(market.commission)} − gateway fee ${inr(market.gatewayFee)}. Paid weekly after the ${cfg.refundHoldDays}-day refund window.`} amount={market.educatorNet} tone={t.accent} />
          )}
          {!payReady && <Banner text="Connect your payment gateway (More → Payments setup) before selling on your own site." />}
        </Section>
      )}

      <Pressable onPress={() => router.push({ pathname: '/educator-soon', params: { f: 'Coupons & offers', step: 'E6' } })} style={[styles.linkRow, { borderColor: t.border, backgroundColor: t.surface }]} accessibilityRole="button">
        <Ionicons name="ticket-outline" size={22} color={t.primary} />
        <Txt variant="bodyStrong" style={{ flex: 1 }}>Coupons & early-bird codes</Txt>
        <Ionicons name="chevron-forward" size={18} color={t.muted} />
      </Pressable>
    </>
  );
}

function Receive({ label, sub, amount, tone }: { label: string; sub: string; amount: number; tone: string }) {
  const { c: t } = useTheme();
  return (
    <View style={[styles.receive, { borderColor: t.border }]}>
      <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: tone }} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        <Txt variant="caption" color={t.muted}>{sub}</Txt>
      </View>
      <Txt variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{inr(amount)}</Txt>
    </View>
  );
}

function OwnerOnly({ c, reload, onSent }: { c: Course; reload: () => void; onSent: () => void }) {
  const { c: t } = useTheme();
  const { session } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPending = c.tutorReview?.status === 'pending';

  return (
    <View style={{ gap: 14, paddingVertical: 14 }}>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
        <Ionicons name="lock-closed-outline" size={36} color={t.muted} />
        <Txt variant="bodyStrong">Pricing & Publishing managed by Academy Educator</Txt>
        <Txt color={t.muted} center>
          As a tutor, you can design modules and upload lesson videos. The educator sets the final selling price and publishes the course.
        </Txt>
      </View>

      {isPending ? (
        <View style={[styles.reviewAlert, { backgroundColor: t.warningBg, borderColor: t.warning }]}>
          <Ionicons name="hourglass-outline" size={24} color={t.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">Course is pending educator review</Txt>
            <Txt variant="caption" color={t.inkSoft}>
              Submitted on {new Date(c.tutorReview!.requestedAt || Date.now()).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.
              {c.tutorReview?.notes ? ` Note: "${c.tutorReview.notes}"` : ''}
            </Txt>
          </View>
        </View>
      ) : (
        <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Txt variant="heading">Ask educator to review & set pricing</Txt>
          <Txt variant="caption" color={t.muted}>
            When you submit, your academy educator will receive an in-app notification to review your video lessons, set the course price, and publish.
          </Txt>
          <TextField
            label="Note for educator (optional)"
            placeholder="e.g. Completed modules with video lessons, ready for pricing review."
            value={note}
            onChangeText={setNote}
          />
          {err && <Banner tone="danger" text={err} />}
          <Button
            title="Submit course to educator for review"
            iconLeft="paper-plane-outline"
            size="md"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setErr(null);
              try {
                await askOwnerToPublish(session?.user.id ?? '', c.id, note);
                reload();
                onSent();
                haptic('success');
              } catch (e) {
                setErr((e as ApiError).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      )}
    </View>
  );
}

/* ───────── Step 4: Publish ───────── */
function Publish({
  c,
  set,
  meta,
  owner,
  goStep,
  agree,
  setAgree,
  onPreviewVideo,
  reload,
  onToast,
  onRequestChanges,
  onPublished,
}: {
  c: Course;
  set: (p: Partial<Course>) => void;
  meta: NonNullable<ReturnType<typeof courseAdmin.get>>;
  owner: boolean;
  goStep: (s: number) => void;
  agree: boolean;
  setAgree: (v: boolean) => void;
  onPreviewVideo: (lesson: { title: string; uri?: string; sizeMb?: number; durationSec?: number; moduleTitle?: string }) => void;
  reload: () => void;
  onToast: (msg: string) => void;
  onRequestChanges: () => void;
  onPublished?: (m: ReturnType<typeof courseAdmin.get>) => void;
}) {
  const { c: t } = useTheme();
  const { session } = useAuth();
  const ownerUserId = session?.user.id ?? '';
  const list = useMemo(() => courseAdmin.checklist(c, meta.ctx.tenant.payments), [c, meta]);
  const doneCount = list.filter((x) => x.ok || x.optional).length;
  const lessons = allLessons(c);
  const listing = c.visibility !== 'private';
  const published = meta.state !== 'draft';

  const videoLessons = useMemo(() => {
    const vids: Array<{ id: string; title: string; videoUri?: string; uri?: string; sizeMb?: number; durationSec?: number; moduleTitle?: string }> = [];
    (c.modules || []).forEach((m) => {
      (m.lessons || []).forEach((l) => {
        if (l.type === 'video') {
          vids.push({
            id: l.id,
            title: l.title,
            videoUri: l.videoUrl || l.videoUri,
            uri: l.videoUrl || l.videoUri,
            sizeMb: l.sizeMb,
            durationSec: l.durationSec,
            moduleTitle: m.title,
          });
        }
      });
    });
    return vids;
  }, [c.modules]);

  return (
    <>
      {owner && c.tutorReview?.status === 'pending' && (
        <Section icon="shield-checkmark-outline" title="Tutor Course Review & Approval" sub={`Submitted by ${c.tutorReview.tutorName || 'Tutor'}`}>
          {c.tutorReview.notes && (
            <View style={[styles.tutorNote, { backgroundColor: t.primarySoft }]}>
              <Txt variant="caption" color={t.muted}>Note from tutor:</Txt>
              <Txt variant="body">{c.tutorReview.notes}</Txt>
            </View>
          )}

          <View style={[styles.pricingNotice, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ionicons name="pricetag-outline" size={24} color={t.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">Course Price: {c.priceInr ? inr(c.priceInr) : 'Free'}</Txt>
              <Txt variant="caption" color={t.muted}>
                {c.priceInr ? 'Selling price configured' : 'Currently Free. Set the final selling price in Step 3 before publishing.'}
              </Txt>
            </View>
            <Button title="Set price (Step 3)" variant="outline" size="md" onPress={() => goStep(2)} />
          </View>

          <View style={[styles.pricingNotice, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ionicons name="storefront-outline" size={24} color={t.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">
                Where to sell: {c.visibility === 'private' ? 'Only my students (Private)' : c.visibility === 'public' ? 'Bodhin marketplace' : 'List + Bodhin promotion'}
              </Txt>
              <Txt variant="caption" color={t.muted}>
                {c.visibility === 'private' ? 'Sell directly on your academy site · no commission' : 'Listed on marketplace after 24–48h review'}
              </Txt>
            </View>
            <Pill text={c.visibility === 'private' ? 'Private' : 'Marketplace'} tone={c.visibility === 'private' ? 'info' : 'success'} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Button
              title="Request changes"
              variant="outline"
              size="md"
              style={{ flex: 1 }}
              onPress={onRequestChanges}
            />
            <Button
              title="Approve & Publish"
              iconLeft="rocket-outline"
              size="md"
              style={{ flex: 1.4 }}
              onPress={async () => {
                if (c.visibility !== 'private' && !agree) {
                  onToast('Tick the marketplace guidelines box to submit for listing.');
                  return;
                }
                try {
                  await respondToTutorReview(ownerUserId, c.id, 'approve', undefined, { visibility: c.visibility });
                  const m = courseAdmin.get(ownerUserId, c.id);
                  if (m && onPublished) {
                    onPublished(m);
                  } else {
                    reload();
                  }
                  onToast('Course approved & published! Tutor notified.');
                  haptic('success');
                } catch (e) {
                  onToast((e as ApiError).message);
                }
              }}
            />
          </View>
        </Section>
      )}

      <Section icon="eye-outline" title="Preview" sub="How learners will see it.">
        <CourseArt course={c} height={150} rounded={18} showTitle />
        <Txt variant="heading">{c.title || 'Untitled course'}</Txt>
        <Txt color={t.inkSoft}>{c.subtitle}</Txt>
        <View style={styles.wrap}>
          <Pill text={`${lessons.length} lessons`} />
          <Pill text={fmtDur(lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0))} />
          <Pill text={LEVEL_LABEL[c.level]} />
          <Pill text={c.priceInr ? inr(c.priceInr) : 'Free'} tone="info" />
        </View>
        <Button title="Preview as a student" variant="outline" iconLeft="eye-outline" size="md" onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })} />
      </Section>

      <Section icon="videocam-outline" title="Video lessons review" sub={`${videoLessons.length} video ${videoLessons.length === 1 ? 'lesson' : 'lessons'} available to preview`}>
        {videoLessons.length === 0 ? (
          <Txt variant="caption" color={t.muted}>No video lessons uploaded in this course yet.</Txt>
        ) : (
          videoLessons.map((l) => (
            <View key={l.id} style={[styles.videoReviewRow, { borderColor: t.border }]}>
              <Ionicons name="play-circle" size={24} color={t.primary} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>{l.title}</Txt>
                <Txt variant="caption" color={t.muted}>
                  {l.moduleTitle ? `${l.moduleTitle} · ` : ''}{fmtDur(l.durationSec ?? 0)}
                </Txt>
              </View>
              <Button
                title="Watch video"
                variant="outline"
                size="md"
                iconLeft="play-circle-outline"
                onPress={() => onPreviewVideo(l)}
              />
            </View>
          ))
        )}
      </Section>

      <Section icon="radio-outline" title="Live classes for this course" sub="Everyone who buys it sees them in Live and gets a notification.">
        <Button title="Schedule a live class" iconLeft="calendar-outline" size="md" variant="outline" disabled={!c.title} onPress={() => router.push({ pathname: '/edu/schedule', params: { courseId: c.id } })} />
      </Section>

      <Section icon="checkmark-done-outline" title="Publishing checklist" sub={`${doneCount} of ${list.length} complete`}>
        {list.map((x) => (
          <Pressable key={x.key} onPress={() => goStep(x.step)} style={styles.check} accessibilityRole="button" accessibilityLabel={`${x.label}: ${x.ok ? 'done' : 'not done'}`}>
            <Ionicons name={x.ok ? 'checkmark-circle' : x.optional ? 'ellipse-outline' : 'close-circle'} size={24} color={x.ok ? t.success : x.optional ? t.borderStrong : t.danger} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{x.label}{x.optional && !x.ok ? ' (recommended)' : ''}</Txt>
              <Txt variant="caption" color={t.muted}>{x.sub}</Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.muted} />
          </Pressable>
        ))}
      </Section>

      <Section icon="storefront-outline" title="Where to sell" sub="Private by default. Listing and promotion are separate choices you can change any time.">
        {published && <Banner tone="info" text="Change listing for a published course from My Courses → course menu." />}
        {([
          ['private', 'lock-closed-outline', 'Only my students', `Sell on ${meta.ctx.host} and private links. You collect the payment directly. No commission.`],
          ['public', 'storefront-outline', 'Also list on Bodhin marketplace', 'Bodhin reviews it first (24–48 h). Sales made on Bodhin are collected by Bodhin and paid out to you after commission.'],
          ['public_promoted', 'megaphone-outline', 'List + allow Bodhin promotion', 'Bodhin may also feature it in campaigns and newsletters. Withdraw consent any time.'],
        ] as const).map(([v, icon, l, sub]) => {
          const on = c.visibility === v;
          return (
            <Pressable
              key={v}
              disabled={!owner || published}
              onPress={() => {
                if (owner && !published) {
                  set({ visibility: v });
                }
              }}
              style={[
                styles.sell,
                { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface, opacity: published && !on ? 0.5 : 1 },
                on && { borderWidth: 2 },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: !owner || published }}
            >
              <Ionicons name={icon} size={24} color={t.primary} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{l}</Txt>
                <Txt variant="caption" color={t.inkSoft}>{sub}</Txt>
              </View>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.primary : t.borderStrong} />
            </Pressable>
          );
        })}

        <View style={styles.where}>
          <Ionicons name="checkmark-circle" size={20} color={t.success} />
          <Txt style={{ flex: 1 }}><Txt variant="bodyStrong">Your site</Txt> · {meta.ctx.host}/course/{c.id}</Txt>
        </View>
        <View style={styles.where}>
          <Ionicons name={listing ? 'hourglass-outline' : 'remove-circle-outline'} size={20} color={listing ? t.warning : t.muted} />
          <Txt style={{ flex: 1 }}><Txt variant="bodyStrong">Bodhin marketplace</Txt> · {listing ? (meta.state === 'listed' || meta.state === 'promoted' ? 'listed' : 'after Bodhin review, usually 24–48 h') : 'not listed (private)'}</Txt>
        </View>
        {listing && meta.state === 'draft' && (
          <Checkbox checked={agree} onChange={setAgree} label="Agree to marketplace guidelines">
            <Txt variant="label" color={t.inkSoft}>The content is mine or licensed, follows Bodhin’s marketplace guidelines, and makes no guaranteed-income claims.</Txt>
          </Checkbox>
        )}
      </Section>

      {!owner && <OwnerOnly c={c} reload={reload} onSent={() => onToast('Submitted to educator for review')} />}
      {owner && listing && meta.state === 'draft' && !agree && <Txt variant="caption" color={t.warning} center>Tick the guidelines box to submit for listing.</Txt>}
    </>
  );
}

/* ───────── shared bits ───────── */
function Section({ icon, title, sub, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string; children: React.ReactNode }) {
  const { c: t } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Ionicons name={icon} size={22} color={t.primary} />
        <View style={{ flex: 1 }}>
          <Txt variant="heading">{title}</Txt>
          {sub && <Txt variant="caption" color={t.muted}>{sub}</Txt>}
        </View>
      </View>
      {children}
    </View>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{label}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  stepper: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 8, maxWidth: layout.contentMaxWidth, width: '100%', alignSelf: 'center' },
  stepCol: { width: 240, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 12, gap: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 52, borderRadius: 14 },
  stepItem: { alignItems: 'center', gap: 4, minWidth: 64, minHeight: 48, justifyContent: 'center' },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  section: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  area: { minHeight: 130, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  swatch: { width: 52, height: 40, borderRadius: 12, borderWidth: 2.5, padding: 2 },
  iconPick: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.4, alignItems: 'center', justifyContent: 'center' },
  outRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outInput: { flex: 1, minWidth: 0, minHeight: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 15, outlineStyle: 'none' } as any,
  statsRow: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  module: { borderRadius: radius.lg, borderWidth: 1.2, overflow: 'hidden' },
  modHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  modNo: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  lesson: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderTopWidth: 1 },
  modActions: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 8, borderTopWidth: 1 },
  addLesson: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.md },
  tips: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md },
  twoCards: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, padding: 14, borderRadius: radius.lg, borderWidth: 1.2, gap: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  sell: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1.2 },
  receive: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, minHeight: 58 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  where: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 52 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 48, borderRadius: 12 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, alignItems: 'center' },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 92, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill },
  okIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  reviewAlert: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1 },
  tutorNote: { padding: 10, borderRadius: radius.sm, gap: 4 },
  pricingNotice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  videoReviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1 },
  emptyBox: { padding: 24, borderRadius: radius.lg, borderWidth: 1.2, alignItems: 'center', gap: 10, borderStyle: 'dashed' },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
