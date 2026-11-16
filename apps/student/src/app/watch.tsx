/** Watch: every free video educators share with Bodhin, filterable by subject — the "so much to learn here" page. */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { showcaseApi } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/kit';
import { Grid, useLayout } from '@/ui/responsive';
import { Eyebrow, Headline, PublicFrame } from '@/ui/publicFrame';
import { CountUp, Reveal } from '@/ui/motion';
import { PreviewSheet, VideoTile, VideoWall } from '@/ui/videoWall';

export default function Watch() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const [cat, setCat] = useState('all');
  const all = showcaseApi.wall();
  const d = showcaseApi.wall(cat);
  const [open, setOpen] = useState<(typeof d.rows)[number] | null>(null);
  return (
    <PublicFrame primary={{ title: 'Explore courses', to: '/explore' }} secondary={{ title: 'Teach here', to: '/for-educators' }}>
      <View style={{ gap: 14, maxWidth: 820 }}>
        <Eyebrow>Free to watch</Eyebrow>
        <Headline size="xl">Learn something before you decide.</Headline>
        <Txt color={c.inkSoft} style={{ fontSize: 17, lineHeight: 26 }}>Real lessons from educators on Bodhin. Watch as many as you like — no sign-up.</Txt>
        <View style={{ flexDirection: 'row', gap: isDesktop ? 40 : 22 }}>
          {([[all.rows.length, 'free videos'], [all.minutes, 'minutes of teaching'], [all.educators, 'educators']] as [number, string][]).map(([n, l]) => <View key={l}><CountUp to={n} color={c.primaryDeep} /><Txt variant="caption" color={c.muted}>{l}</Txt></View>)}
        </View>
      </View>
      {all.rows.length > 0 && <VideoWall rows={all.rows} onPlay={setOpen} lanes={isDesktop ? 2 : 2} />}
      <View style={{ gap: 14 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label={`All (${all.rows.length})`} active={cat === 'all'} onPress={() => setCat('all')} />
          {all.cats.map((k) => <Chip key={k.id} label={`${k.name} (${all.rows.filter((x) => x.course.categoryId === k.id).length})`} active={cat === k.id} onPress={() => setCat(k.id)} />)}
        </ScrollView>
        {d.rows.length === 0 ? <Txt color={c.muted}>No videos in this subject yet.</Txt> : (
          <Grid cols={isDesktop ? 4 : 1} gap={14}>
            {d.rows.map((x, i) => <Reveal key={`${cat}-${x.c.id}`} delay={Math.min(i, 8) * 40}><VideoTile x={x} onPlay={setOpen} w={isDesktop ? 250 : 358} /></Reveal>)}
          </Grid>
        )}
      </View>
      <Reveal>
        <View style={{ backgroundColor: c.primarySoft, borderRadius: 28, padding: 24, gap: 12 }}>
          <Headline size="md">Teach on Bodhin? Your videos can be here.</Headline>
          <Txt color={c.inkSoft}>Turn on “Listing + promotion” for a course and pick the lessons to share. Learners who join from here count as Bodhin marketplace sales.</Txt>
          <Button title="For educators" iconRight="arrow-forward" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/for-educators')} />
        </View>
      </Reveal>
      <PreviewSheet x={open} onClose={() => setOpen(null)} />
    </PublicFrame>
  );
}
