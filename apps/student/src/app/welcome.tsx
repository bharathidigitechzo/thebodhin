/** thebodhin.com home. Two clear paths from the first screen: learn (→ Explore) or teach (→ For educators). */
import React, { useState } from 'react';
import { trialDays } from '@/api/growth2';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { marketing, showcaseApi } from '@/api/growth2';
import { PreviewSheet, VideoWall } from '@/ui/videoWall';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, Pill } from '@/ui/kit';
import { Grid, useLayout } from '@/ui/responsive';
import { Eyebrow, Headline, PublicFrame } from '@/ui/publicFrame';
import { Carousel, ChalkUnderline, CountUp, DrawLine, Marquee, Parallax, Reveal, Tap, WordRotator } from '@/ui/motion';
import { CertSlide, CourseSlide, LiveSlide, PhoneFrame, PipelinePanel, PlaygroundSlide } from '@/ui/siteMocks';
import { inr } from '@/ui/section';

const SUBJECTS = ['SEO', 'Python', 'NEET', 'Tally', 'Music', 'Design'];
const LEARN_STEPS: [string, string][] = [['Watch a free preview', 'Every course opens a few lessons before you pay.'], ['Join and learn your way', 'Recorded lessons, live classes, downloads for offline.'], ['Practise and prove it', 'Quizzes, a code playground, and a certificate anyone can verify.']];

export default function Welcome() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const d = marketing.home();
  const [ww, setWw] = useState(0);
  const wall = showcaseApi.wall();
  const [clip, setClip] = useState<(typeof wall.rows)[number] | null>(null);
  const first = d.showcase[0];
  const serif = { fontFamily: 'Georgia, serif', fontSize: isDesktop ? 56 : 36, lineHeight: isDesktop ? 64 : 42, fontWeight: '700' as const };
  return (
    <PublicFrame primary={{ title: 'I want to teach', to: '/for-educators' }} secondary={{ title: 'I want to learn', to: '/explore' }}>
      {/* ── hero ── */}
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 48 : 28, alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 16, width: '100%' }}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({ length: 9 }).map((_, i) => <View key={i} style={{ height: 1, backgroundColor: c.border, marginTop: isDesktop ? 46 : 38, opacity: 0.45 }} />)}</View>
          <Eyebrow>For learners and educators</Eyebrow>
          <View accessibilityRole="header" accessibilityLabel={`Teach ${SUBJECTS.join(', ')} on a platform that carries your name`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 12 }}>
              <Headline size="xl">Teach</Headline>
              <View>
                <WordRotator words={SUBJECTS} color={c.primary} style={serif} onWidth={setWw} />
                <ChalkUnderline width={ww} color={c.accent} />
              </View>
            </View>
            <Headline size="xl">on a platform that carries your name.</Headline>
          </View>
          <Reveal delay={120}><Txt color={c.inkSoft} style={{ fontSize: 17, lineHeight: 26, maxWidth: 520 }}>Bodhin is where tutors and academies run courses, live classes and students — and where learners find a teacher worth their time.</Txt></Reveal>
          <Reveal delay={220} style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
            <Tap onPress={() => router.push('/explore')} label="I want to learn. Explore courses" role="link" fill={isDesktop} style={[styles.path, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={[styles.pathIcon, { backgroundColor: c.primarySoft }]}><Ionicons name="book-outline" size={22} color={c.primary} /></View>
              <View style={{ flex: 1 }}><Txt variant="bodyStrong">I want to learn</Txt><Txt variant="caption" color={c.muted}>Browse courses, watch free previews</Txt></View>
              <Ionicons name="arrow-forward" size={20} color={c.primary} />
            </Tap>
            <Tap onPress={() => router.push('/for-educators')} label="I want to teach. See how Bodhin works for educators" role="link" fill={isDesktop} style={[styles.path, { backgroundColor: c.primaryDeep, borderColor: c.primaryDeep }]}>
              <View style={[styles.pathIcon, { backgroundColor: '#ffffff22' }]}><Ionicons name="school-outline" size={22} color="#fff" /></View>
              <View style={{ flex: 1 }}><Txt variant="bodyStrong" color="#fff">I want to teach</Txt><Txt variant="caption" color="#ffffffb3">Launch your academy · {trialDays()}-day trial</Txt></View>
              <Ionicons name="arrow-forward" size={20} color={c.accent} />
            </Tap>
          </Reveal>
          <View style={{ flexDirection: 'row', gap: isDesktop ? 40 : 22, marginTop: 6 }}>
            {([[d.stats.learners, 'learners'], [d.stats.courses, 'courses'], [d.stats.academies, 'academies']] as [number, string][]).map(([n, l]) => (
              <View key={l}><CountUp to={n} color={c.primaryDeep} /><Txt variant="caption" color={c.muted}>{l}</Txt></View>
            ))}
          </View>
        </View>
        <Reveal delay={150} style={{ width: isDesktop ? 300 : '100%' }}>
          <Parallax travel={isDesktop ? 44 : 0}>
          <Carousel height={430} slides={[
            { label: 'Course', node: <PhoneFrame><CourseSlide title={first?.c.title ?? 'Your course'} tutor={first?.tutor?.name ?? 'Your academy'} price={first ? inr(first.c.priceInr) : ''} color={first?.tutor?.color ?? c.primary} /></PhoneFrame> },
            { label: 'Live class', node: <PhoneFrame><LiveSlide /></PhoneFrame> },
            { label: 'Playground', node: <PhoneFrame><PlaygroundSlide /></PhoneFrame> },
            { label: 'Certificate', node: <PhoneFrame><CertSlide academy={first?.tutor?.name ?? 'Your academy'} /></PhoneFrame> },
          ]} />
          </Parallax>
        </Reveal>
      </View>

      {/* ── what people teach here ── */}
      <View style={{ gap: 10 }}>
        <Txt variant="caption" color={c.muted} center>Taught on Bodhin right now</Txt>
        <Marquee>
          {d.showcase.concat(d.showcase).map(({ c: co }, i) => <View key={co.id + i} style={[styles.tag, { borderColor: c.border, backgroundColor: c.surface }]}><Txt variant="label" color={c.inkSoft} numberOfLines={1}>{co.title}</Txt></View>)}
        </Marquee>
      </View>

      {/* ── video wall: free lessons educators chose to share ── */}
      {wall.rows.length > 0 && (
        <View style={{ gap: 16 }}>
          <Reveal style={{ gap: 6 }}>
            <Eyebrow>Free to watch</Eyebrow>
            <Headline>{wall.rows.length} free lessons. {wall.minutes} minutes of real teaching.</Headline>
            <Txt color={c.inkSoft}>Tap any video to watch it here — no sign-up. These come from educators who chose to share them.</Txt>
          </Reveal>
          <VideoWall rows={wall.rows} onPlay={setClip} lanes={isDesktop ? 3 : 2} />
          <Button title="Watch all free videos" iconRight="play" variant="outline" style={{ alignSelf: isDesktop ? 'flex-start' : 'stretch' }} onPress={() => router.push('/watch')} />
        </View>
      )}

      {/* ── learner path ── */}
      <View style={{ gap: 20 }}>
        <Reveal><Eyebrow>For learners</Eyebrow><Headline>Watch before you join.</Headline></Reveal>
        <Grid cols={isDesktop ? 3 : 1} gap={14}>
          {d.showcase.slice(0, isDesktop ? 6 : 3).map(({ c: co, tutor, preview }, i) => (
            <Reveal key={co.id} delay={i * 70}>
              <Tap onPress={() => router.push({ pathname: '/course/[id]', params: { id: co.id } })} label={`${co.title} by ${tutor?.name}. ${preview ? 'Free preview available' : ''}`} role="link" style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={[styles.video, { backgroundColor: tutor?.color ?? c.primaryDeep }]}>
                  <Ionicons name="play-circle" size={46} color="#fff" />
                  {preview && <View style={{ position: 'absolute', left: 10, bottom: 10 }}><Pill text={`Free preview · ${Math.max(1, Math.round((preview.durationSec ?? 300) / 60))} min`} tone="gold" /></View>}
                </View>
                <View style={{ padding: 14, gap: 4 }}>
                  <Txt variant="bodyStrong" numberOfLines={2}>{co.title}</Txt>
                  <Txt variant="caption" color={c.muted}>{tutor?.name} · ★ {co.rating.toFixed(1)} · {co.students.toLocaleString('en-IN')} learners</Txt>
                  <Txt variant="label" color={c.primary}>{co.priceInr ? inr(co.priceInr) : 'Free'}</Txt>
                </View>
              </Tap>
            </Reveal>
          ))}
        </Grid>
        <DrawLine color={c.accent} />
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 28 : 14 }}>
          {LEARN_STEPS.map(([t, s], i) => (
            <Reveal key={t} delay={i * 90} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Txt style={{ fontFamily: 'Georgia, serif', fontSize: 34, lineHeight: 38 }} color={c.accent}>{i + 1}</Txt>
                <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: c.dangerBg, paddingLeft: 12 }}><Txt variant="bodyStrong">{t}</Txt><Txt variant="caption" color={c.muted}>{s}</Txt></View>
              </View>
            </Reveal>
          ))}
        </View>
        <Button title="Explore all courses" iconRight="arrow-forward" style={{ alignSelf: isDesktop ? 'flex-start' : 'stretch' }} onPress={() => router.push('/explore')} />
      </View>

      {/* ── educator teaser ── */}
      <View style={[styles.band, { backgroundColor: c.surface, borderColor: c.border, flexDirection: isDesktop ? 'row' : 'column' }]}>
        <Reveal style={{ flex: 1, gap: 12 }}>
          <Eyebrow>For educators</Eyebrow>
          <Headline>From an enquiry to an enrolment, without the follow-up chaos.</Headline>
          <Txt color={c.inkSoft}>Your website form, webinars and referrals feed one pipeline. Reminders tell you who to call. When they join, the welcome message goes on its own.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button title="See how it works" iconRight="arrow-forward" onPress={() => router.push('/for-educators')} />
            <Button title="Pricing" variant="outline" onPress={() => router.push('/pricing')} />
          </View>
        </Reveal>
        <Reveal delay={120} style={{ flex: 1, width: '100%' }}><PipelinePanel /></Reveal>
      </View>

      {/* ── educators ── */}
      <View style={{ gap: 16 }}>
        <Reveal><Eyebrow>People, not a catalogue</Eyebrow><Headline>Educators on Bodhin</Headline></Reveal>
        <Grid cols={isDesktop ? 3 : 1} gap={12}>
          {d.tutors.map(({ t, courses, learners }, i) => (
            <Reveal key={t.id} delay={i * 60}>
              <View style={[styles.tutor, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Avatar name={t.name} color={t.color} size={52} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong">{t.name}{t.verified ? ' ✓' : ''}</Txt>
                  <Txt variant="caption" color={c.muted} numberOfLines={2}>{t.headline}</Txt>
                  <Txt variant="caption" color={c.inkSoft}>{courses} course{courses === 1 ? '' : 's'} · {learners.toLocaleString('en-IN')} learners · {t.yearsExperience} yrs</Txt>
                </View>
              </View>
            </Reveal>
          ))}
        </Grid>
      </View>

      {/* ── next step ── */}
      <Reveal>
        <View style={[styles.final, { backgroundColor: c.primaryDeep }]}>
          <Headline color="#fff" center>Pick your side of the classroom.</Headline>
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, alignSelf: 'center', width: isDesktop ? undefined : '100%' }}>
            <Button title="Find a course" onPress={() => router.push('/explore')} style={{ backgroundColor: c.accent }} />
            <Button title="Start teaching — plans from ₹799" variant="outline" onPress={() => router.push('/pricing')} style={{ backgroundColor: '#fff' }} />
          </View>
        </View>
      </Reveal>
      <PreviewSheet x={clip} onClose={() => setClip(null)} />
    </PublicFrame>
  );
}

const styles = StyleSheet.create({
  path: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14, minHeight: 72 },
  pathIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 10, maxWidth: 260 },
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  video: { height: 150, alignItems: 'center', justifyContent: 'center' },
  band: { borderWidth: 1, borderRadius: 28, padding: 24, gap: 24, alignItems: 'center' },
  tutor: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14, alignItems: 'center' },
  final: { borderRadius: 28, padding: 28, gap: 18 },
});
