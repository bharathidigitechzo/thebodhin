/** For educators: the four jobs (teach, sell, grow, run), how money flows, and the four steps to launch. */
import React, { useEffect, useState } from 'react';
import { trialDays } from '@/api/growth2';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { marketing, marketingX } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { useLayout } from '@/ui/responsive';
import { Eyebrow, Headline, PublicFrame } from '@/ui/publicFrame';
import { Reveal, Tap, useInView, useReduceMotion } from '@/ui/motion';
import { BarsPanel, ChecklistPanel, LiveSlide, MoneyFlow, PhoneFrame, PipelinePanel, SitePanel } from '@/ui/siteMocks';
import { inr } from '@/ui/section';

const STEPS: [string, string, string][] = [
  ['Apply', 'Tell us what you teach. Takes about 3 minutes, no card needed.', 'create-outline'],
  ['Get approved', 'Bodhin reviews every educator by hand before an academy opens.', 'shield-checkmark-outline'],
  ['Try Growth free', 'TRIAL', 'rocket-outline'],
  ['Open your doors', 'Pick a plan, connect your payment gateway, share your link.', 'storefront-outline'],
];

function Chapter({ n, eyebrow, title, body, points, panel, flip, more }: { n: number; eyebrow: string; title: string; body: string; points: string[]; panel: React.ReactNode; flip?: boolean; more?: { title: string; to: string } }) {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  return (
    <View style={{ flexDirection: isDesktop ? (flip ? 'row-reverse' : 'row') : 'column', gap: isDesktop ? 56 : 20, alignItems: 'center' }}>
      <Reveal style={{ flex: 1, gap: 12, width: '100%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Txt style={{ fontFamily: 'Georgia, serif', fontSize: 40, lineHeight: 44 }} color={c.accent}>{n}</Txt>
          <Eyebrow>{eyebrow}</Eyebrow>
        </View>
        <Headline>{title}</Headline>
        <Txt color={c.inkSoft} style={{ fontSize: 16, lineHeight: 25 }}>{body}</Txt>
        <View style={{ gap: 8 }}>
          {points.map((p) => <View key={p} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}><Ionicons name="checkmark" size={18} color={c.success} style={{ marginTop: 2 }} /><Txt style={{ flex: 1 }}>{p}</Txt></View>)}
        </View>
        {more && <Button title={more.title} variant="outline" size="md" iconRight="arrow-forward" style={{ alignSelf: 'flex-start' }} onPress={() => router.push(more.to as never)} />}
      </Reveal>
      <Reveal delay={120} style={{ flex: 1, width: '100%' }}>{panel}</Reveal>
    </View>
  );
}

/** Steps light up one after another; the active one is always labelled. */
function LaunchSteps() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const reduce = useReduceMotion();
  const { ref, seen } = useInView(0.3);
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (!seen || reduce) return;
    const t = setTimeout(() => setOn((x) => (x + 1) % STEPS.length), 2200);
    return () => clearTimeout(t);
  }, [seen, reduce, on]);
  return (
    <View ref={ref} style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
      {STEPS.map(([t, s0, icon], i) => {
        const s = s0 === 'TRIAL' ? `${trialDays()} days with the Growth plan: build courses, your site, a first live class.` : s0;
        const active = reduce || i === on, done = !reduce && i < on;
        return (
          <Tap key={t} onPress={() => setOn(i)} label={`Step ${i + 1}: ${t}. ${s}`} fill={isDesktop} style={[styles.step, { backgroundColor: active ? c.primaryDeep : c.surface, borderColor: active ? c.primaryDeep : c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.stepIcon, { backgroundColor: active ? '#ffffff22' : done ? c.successBg : c.primarySoft }]}><Ionicons name={(done ? 'checkmark' : icon) as never} size={20} color={active ? '#fff' : done ? c.success : c.primary} /></View>
              <Txt variant="caption" color={active ? c.accent : c.muted}>STEP {i + 1}</Txt>
            </View>
            <Txt variant="heading" color={active ? '#fff' : c.ink}>{t}</Txt>
            <Txt variant="caption" color={active ? '#ffffffcc' : c.muted}>{s}</Txt>
          </Tap>
        );
      })}
    </View>
  );
}

export default function ForEducators() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const p = marketing.pricing();
  const starter = p.plans[0].p;
  return (
    <PublicFrame primary={{ title: 'Apply — free trial', to: '/apply' }} secondary={{ title: 'See pricing', to: '/pricing' }}>
      <View style={{ gap: 16, maxWidth: 820 }}>
        <Eyebrow>For tutors, coaching centres and academies</Eyebrow>
        <Headline size="xl">Your academy. Your name on the door.</Headline>
        <Txt color={c.inkSoft} style={{ fontSize: 17, lineHeight: 26 }}>One place to teach, sell, follow up and get paid — on the web and in an Android and iPhone app. Your students see your brand, and their fees reach your account.</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button title={`Apply — ${trialDays()}-day trial`} iconRight="arrow-forward" onPress={() => router.push('/apply')} />
          <Button title={`Plans from ${inr(starter.monthlyInr ?? 0)}/month`} variant="outline" onPress={() => router.push('/pricing')} />
        </View>
      </View>

      <Chapter n={1} eyebrow="Teach" title="Recorded lessons, live classes and practice in one classroom."
        body="Upload once and students stream on any phone, or download for offline. Go live with chat, polls, a whiteboard and Q&A. Students raise a hand before they speak."
        points={['Batches with timetable and attendance', 'Quizzes, assignments and rubric grading', 'A code playground for 15 tech stacks', 'Certificates students can verify online']}
        panel={<PhoneFrame height={400}><LiveSlide /></PhoneFrame>} more={{ title: 'All teaching tools', to: '/features' }} />

      <Chapter n={2} eyebrow="Sell" flip title="Fees reach you directly. Bodhin does not sit in the middle."
        body={`Your own students pay through your payment gateway — no cut from Bodhin. Only when a student discovers you on the Bodhin marketplace does Bodhin keep ${p.commissionPct}% of that sale, and listing there is your choice for every course.`}
        points={['EMI with reminders for bigger courses', 'Bundles, coupons and a one-tap add-on at checkout', 'Webinars, 1:1 sessions and notes as extra income', 'USD, AED, GBP and EUR prices for learners abroad']}
        panel={<ChecklistPanel title="A ₹17,500 course on 3-part EMI" items={['Today: ₹5,834 paid at checkout', 'Day 27: reminder sent automatically', 'Day 30: ₹5,833 paid', 'Day 60: ₹5,833 paid — invoice for each part']} />} more={{ title: 'See the plans', to: '/pricing' }} />

      <View style={[styles.band, { backgroundColor: c.ivoryDeep, borderColor: c.border, flexDirection: isDesktop ? 'row' : 'column' }]}>
        <Reveal style={{ flex: 1, gap: 10, width: '100%' }}>
          <Eyebrow>Follow the money</Eyebrow>
          <Headline>See exactly where a student’s fee goes.</Headline>
          <Txt color={c.inkSoft}>Tap the two cases. The numbers use Bodhin’s real rates on a ₹2,000 course.</Txt>
        </Reveal>
        <Reveal delay={120} style={{ flex: 1.1, width: '100%' }}><MoneyFlow data={marketingX.split(2000)} /></Reveal>
      </View>

      <Chapter n={3} eyebrow="Grow" title="Every enquiry gets a follow-up. Every follow-up has a date."
        body="Your site’s form, webinar registrations and referral links all land in one pipeline. You see who to call today. Welcome, class and fee messages go out on their own."
        points={['Leads CRM with demo booking and lost reasons', 'Email and app-push broadcasts to any group', 'Learners earn for bringing friends', 'Sell from your existing website or WordPress']}
        panel={<PipelinePanel />} />

      <Chapter n={4} eyebrow="Run" flip title="Know what is working before the month ends."
        body="See where your money comes from, which course sells, and where visitors leave. Add tutors who see only their own courses."
        points={['Revenue by channel and top courses', 'Course page → checkout → paid funnel', 'Tutor seats with limited access', 'Usage meters with warnings at 70% and 85%']}
        panel={<BarsPanel title="Example month · where the money comes from" rows={[{ label: 'Your direct sales', pct: 92, value: '68%' }, { label: 'Webinars, 1:1, notes', pct: 34, value: '17%' }, { label: 'Bodhin marketplace', pct: 26, value: '15%' }]} />} />

      <View style={[styles.band, { backgroundColor: c.surface, borderColor: c.border, flexDirection: isDesktop ? 'row' : 'column' }]}>
        <Reveal style={{ flex: 1, gap: 10, width: '100%' }}>
          <Eyebrow>Your brand</Eyebrow>
          <Headline>A website that builds itself from your courses.</Headline>
          <Txt color={c.inkSoft}>Start on yourname.thebodhin.com, move to your own domain when you are ready. Pick sections, write your story, and the enquiry form feeds your CRM.</Txt>
        </Reveal>
        <Reveal delay={120} style={{ flex: 1, width: '100%' }}><SitePanel host="yourname.thebodhin.com" /></Reveal>
      </View>

      <View style={{ gap: 18 }}>
        <Reveal><Eyebrow>Getting started</Eyebrow><Headline>Four steps to your first student.</Headline></Reveal>
        <LaunchSteps />
      </View>

      <Reveal>
        <View style={[styles.final, { backgroundColor: c.primaryDeep }]}>
          <Headline color="#fff">See what it costs — it is one page.</Headline>
          <Txt color="#ffffffcc">Flat monthly plans with clear limits. No setup fee, no hidden renewals.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button title="Go to pricing" iconRight="arrow-forward" style={{ backgroundColor: c.accent }} onPress={() => router.push('/pricing')} />
            <Button title="Talk to us" variant="outline" style={{ backgroundColor: '#fff' }} onPress={() => router.push('/contact')} />
          </View>
        </View>
      </Reveal>
    </PublicFrame>
  );
}

const styles = StyleSheet.create({
  step: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8, minHeight: 150 },
  stepIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  band: { borderWidth: 1, borderRadius: 28, padding: 24, gap: 24, alignItems: 'center' },
  final: { borderRadius: 28, padding: 28, gap: 12 },
});
