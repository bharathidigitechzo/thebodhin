/** Showcase videos: which lessons or promo videos Bodhin may play on its public pages (needs "Listing + promotion"). */
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { showcaseApi } from '@/api/growth2';
import { clipLength } from '@/core/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, Stat, shared } from '@/ui/section';

type CourseRow = ReturnType<typeof showcaseApi.admin>['courses'][number];

export default function Showcase() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(showcaseApi.admin);
  const a = useAct();
  const [add, setAdd] = useState<{ row: CourseRow; mode: 'lesson' | 'promo'; lessonId?: string; title: string; mins: string } | null>(null);
  const owner = d?.ctx.role === 'owner';
  return (
    <Page title="Showcase videos" sub="Free videos Bodhin shows to attract learners" err={err} footer={d && <Button title="See the public video wall" variant="outline" size="md" style={{ flex: 1 }} onPress={() => router.push('/watch')} />}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {a.general && <Banner text={a.general} />}
          <View style={shared.row}>
            <Stat v={String(d.live)} l="Videos live" />
            <Stat v={d.plays.toLocaleString('en-IN')} l="Plays" />
          </View>
          <Txt variant="caption" color={c.muted}>Bodhin plays these on thebodhin.com and in its ads, with a “Join” button to your course. Only courses on “Listing + promotion” qualify — turn promotion off and every video disappears from Bodhin’s pages at once.</Txt>
          {d.courses.map((row) => (
            <Card key={row.co.id} title={row.eligible ? `${row.clips.length} video${row.clips.length === 1 ? '' : 's'}` : row.why} right={<Pill text={row.eligible ? 'Promotion on' : 'Not eligible'} tone={row.eligible ? 'success' : 'neutral'} />}>
              <Txt variant="bodyStrong">{row.co.title}</Txt>
              {row.clips.map((cl) => (
                <View key={cl.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" numberOfLines={1}>{cl.title}</Txt>
                    <Txt variant="caption" color={c.muted}>{cl.lessonId ? 'Lesson' : 'Promo video'} · {clipLength(cl.durationSec)} · {cl.plays} plays</Txt>
                    {cl.blocked && <Txt variant="caption" color={c.danger}>Removed by Bodhin: {cl.blockReason}</Txt>}
                  </View>
                  {owner && <Switch value={cl.active} onValueChange={async (v) => { if (await a.run(() => showcaseApi.setActive(userId, cl.id, v), v ? 'Video is live.' : 'Video hidden.')) load(); }} accessibilityLabel={`Show ${cl.title} publicly`} />}
                </View>
              ))}
              {owner && (row.eligible
                ? <Button title="Add a video" iconLeft="add" size="md" variant="outline" onPress={() => { setAdd({ row, mode: 'lesson', title: '', mins: '2' }); a.setFe(null); }} />
                : <Button title="Open course settings" size="md" variant="outline" onPress={() => router.push({ pathname: '/edu/course/[id]', params: { id: row.co.id } })} />)}
            </Card>
          ))}
        </>
      )}
      <BottomSheet open={!!add} onClose={() => setAdd(null)} title="Add a showcase video" footer={<Button title="Add" size="md" style={{ flex: 1 }} onPress={async () => { if (add && (await a.run(() => showcaseApi.add(userId, add.mode === 'lesson' ? { courseId: add.row.co.id, lessonId: add.lessonId } : { courseId: add.row.co.id, title: add.title, durationSec: Math.round(Number(add.mins) * 60) }), 'Added. It appears on the public video wall now.'))) { setAdd(null); load(); } }} />}>
        {add && (
          <View style={{ gap: 10 }}>
            <View style={shared.chips}>
              <Chip label="Use a lesson" active={add.mode === 'lesson'} onPress={() => setAdd({ ...add, mode: 'lesson' })} />
              <Chip label="Upload a promo video" active={add.mode === 'promo'} onPress={() => setAdd({ ...add, mode: 'promo' })} />
            </View>
            {add.mode === 'lesson' ? (
              <>
                <Txt variant="caption" color={c.muted}>The lesson stays locked inside the course for non-buyers; only this public copy is free.</Txt>
                {add.row.lessons.filter((l) => !add.row.clips.some((cl) => cl.lessonId === l.id)).slice(0, 12).map((l) => <Chip key={l.id} label={`${l.title} · ${clipLength(l.durationSec ?? 0)}`} active={add.lessonId === l.id} onPress={() => setAdd({ ...add, lessonId: l.id })} />)}
                {a.err('lesson') && <Banner text={a.err('lesson')!} />}
              </>
            ) : (
              <>
                <TextField label="Title" placeholder="Why learn SEO in 2027?" value={add.title} onChangeText={(v) => setAdd({ ...add, title: v })} error={a.err('title')} />
                <TextField label="Length (minutes)" value={add.mins} onChangeText={(v) => setAdd({ ...add, mins: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" error={a.err('duration')} hint="20 seconds to 20 minutes. Upload is simulated in the preview." />
              </>
            )}
            {a.fe && !a.fe.field && <Banner text={a.fe.msg} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
