/** About Bodhin: why it exists, what it promises educators and learners. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { marketing } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { useLayout } from '@/ui/responsive';
import { Eyebrow, Headline, PublicFrame } from '@/ui/publicFrame';
import { CountUp, Reveal } from '@/ui/motion';

const PROMISES: [string, string][] = [
  ['The educator owns the classroom', 'Your content, your students, your brand. You can list on the Bodhin marketplace or stay fully private — course by course.'],
  ['Money is never a mystery', 'Every statement shows the gross amount, any commission, gateway fee and what reaches you. Plans have limits you can read before you pay.'],
  ['No tricks on learners', 'Real offer end dates, a clear refund policy, and offers only for people who asked for them.'],
  ['Phones first', 'Most learners in India study on a phone. Every screen is built for one thumb before it is built for a laptop.'],
];

export default function About() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const d = marketing.home();
  return (
    <PublicFrame>
      <View style={{ gap: 16, maxWidth: 800 }}>
        <Eyebrow>About</Eyebrow>
        <Headline size="xl">போதின் — a place for those who teach.</Headline>
        <Txt color={c.inkSoft} style={{ fontSize: 17, lineHeight: 27 }}>Bodhin comes from the word for awakening through knowledge. It was built in Madurai for the tutor with thirty students and the academy with three thousand, so that neither has to stitch together five apps to run a class.</Txt>
      </View>

      <Reveal>
        <View style={[styles.stats, { backgroundColor: c.primaryDeep, flexDirection: isDesktop ? 'row' : 'column' }]}>
          {([[d.stats.academies, 'academies teaching'], [d.stats.courses, 'courses listed'], [d.stats.learners, 'learners enrolled']] as [number, string][]).map(([n, l]) => (
            <View key={l} style={{ flex: 1 }}><CountUp to={n} variant="display" color="#fff" /><Txt color="#ffffffb3">{l}</Txt></View>
          ))}
        </View>
      </Reveal>

      <View style={{ gap: 18 }}>
        <Reveal><Eyebrow>What we promise</Eyebrow><Headline>Four rules we build by.</Headline></Reveal>
        <View style={{ gap: 0 }}>
          {PROMISES.map(([t, s], i) => (
            <Reveal key={t} delay={i * 80}>
              <View style={[styles.rule, { borderTopColor: c.border }]}>
                <Txt style={{ fontFamily: 'Georgia, serif', fontSize: 30, lineHeight: 34, width: 44 }} color={c.accent}>{i + 1}</Txt>
                <View style={{ flex: 1, gap: 4 }}><Txt variant="heading">{t}</Txt><Txt color={c.inkSoft}>{s}</Txt></View>
              </View>
            </Reveal>
          ))}
        </View>
      </View>

      <Reveal>
        <View style={[styles.final, { backgroundColor: c.primarySoft }]}>
          <Headline size="md">Want to see it from the inside?</Headline>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button title="For educators" iconRight="arrow-forward" onPress={() => router.push('/for-educators')} />
            <Button title="Explore courses" variant="outline" onPress={() => router.push('/explore')} />
            <Button title="Contact us" variant="outline" onPress={() => router.push('/contact')} />
          </View>
        </View>
      </Reveal>
    </PublicFrame>
  );
}

const styles = StyleSheet.create({
  stats: { borderRadius: 28, padding: 28, gap: 20 },
  rule: { flexDirection: 'row', gap: 12, paddingVertical: 18, borderTopWidth: 1 },
  final: { borderRadius: 28, padding: 24, gap: 14 },
});
