/** Embed widget: put your courses on any website — script tag, iframe, WordPress shortcode, buy button. */
import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import { embedApi } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/kit';
import { Page, useData } from '@/ui/grow';
import { Card, shared } from '@/ui/section';

export default function Embed() {
  const { c } = useTheme();
  const { d, err } = useData(embedApi.get);
  const [courseId, setCourseId] = useState<string | undefined>();
  const sn = d ? d.per(courseId) : null;
  const block = (title: string, sub: string, code: string) => (
    <Card title={title} key={title}>
      <Txt variant="caption" color={c.muted}>{sub}</Txt>
      <View style={{ backgroundColor: '#0E1B33', borderRadius: 12, padding: 12 }}><Txt variant="caption" color="#E5E7EB" selectable style={{ fontFamily: 'monospace' }}>{code}</Txt></View>
      <Button title="Copy / share" size="md" variant="outline" iconLeft="copy-outline" onPress={() => Share.share({ message: code }).catch(() => undefined)} />
    </Card>
  );
  return (
    <Page title="Embed & WordPress" sub="Sell from your existing website" err={err}>
      {d && sn && (
        <>
          <Txt variant="label">Show</Txt>
          <View style={shared.chips}>
            <Chip label="All courses" active={!courseId} onPress={() => setCourseId(undefined)} />
            {d.courses.map((co) => <Chip key={co.id} label={co.title.slice(0, 24)} active={courseId === co.id} onPress={() => setCourseId(co.id)} />)}
          </View>
          <Button title="Preview widget" iconLeft="eye-outline" variant="outline" onPress={() => router.push({ pathname: '/embed/[slug]', params: courseId ? { slug: d.ctx.tenant.slug, course: courseId } : { slug: d.ctx.tenant.slug } })} />
          {block('WordPress', 'Install the Bodhin plugin, then paste this shortcode in any page or post.', sn.wordpress)}
          {block('Any website (recommended)', 'Paste where the courses should appear. Loads fast and matches your colours.', sn.script)}
          {block('iFrame', 'Use if your site builder blocks scripts (Wix, Google Sites).', sn.iframe)}
          {courseId && block('Buy button', 'A single “Enrol now” button for this course.', sn.button)}
          <Txt variant="caption" color={c.muted}>Sales from the widget are your direct sales — no marketplace commission. Learners log in to the same Bodhin app afterwards.</Txt>
        </>
      )}
    </Page>
  );
}
