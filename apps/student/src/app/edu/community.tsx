/** Community (owner and tutors): announcements, channels (whole academy or one course), announcement-only channels, flagged posts. */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { announcements } from '@/api/academy';
import { communityApi } from '@/api/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, ToggleRow, shared } from '@/ui/section';

export default function CommunityAdmin() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(communityApi.admin);
  const a = useAct();
  const [f, setF] = useState<{ name: string; courseId?: string; announce: boolean } | null>(null);
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const [ann, setAnn] = useState<{ channelId: string; title: string; body: string; pin: boolean; notify: boolean } | null>(null);
  const owner = d?.ctx.role === 'owner';
  const startAnn = () => { const chs = d ? d.channels.map((x) => x.c) : []; const def = chs.find((x) => x.announce) ?? chs[0]; setAnn({ channelId: def?.id ?? '', title: '', body: '', pin: true, notify: true }); a.setFe(null); };
  React.useEffect(() => { if (compose && d && !ann) startAnn(); }, [compose, d]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Page title="Community" sub="Announcements and channels for your learners" err={err} fallback="/educator/more" footer={d && <>
      <Button title="Create announcement" iconLeft="megaphone-outline" size="md" style={{ flex: 1 }} onPress={startAnn} />
      {owner && <Button title="New channel" iconLeft="add" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setF({ name: '', announce: false }); a.setFe(null); }} />}
    </>}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {a.general && <Banner text={a.general} />}
          <Txt variant="caption" color={c.muted}>Only your enrolled students and team can see these. Posts with 3 reports hide automatically until you review them. Phone numbers and link spam are blocked for students.</Txt>
          {d.channels.map(({ c: ch, posts, flagged }) => (
            <Card key={ch.id}>
              <Pressable onPress={() => router.push({ pathname: '/edu/channel/[id]', params: { id: ch.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityRole="button" accessibilityLabel={`Open ${ch.name}`}>
                <Ionicons name={ch.announce ? 'megaphone-outline' : 'chatbubbles-outline'} size={22} color={c.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong"># {ch.name}</Txt>
                  <Txt variant="caption" color={c.muted}>{ch.courseId ? d.courses.find((co) => co.id === ch.courseId)?.title : 'All students'} · {posts} posts{ch.announce ? ' · only team posts' : ''}</Txt>
                </View>
                {flagged > 0 && <Pill text={`${flagged} to review`} tone="warning" />}
                <Ionicons name="chevron-forward" size={18} color={c.muted} />
              </Pressable>
              {owner && <Button title="Delete channel" size="md" variant="outline" onPress={async () => { if (await a.run(() => communityApi.removeChannel(userId, ch.id), 'Channel deleted.')) load(); }} />}
            </Card>
          ))}
        </>
      )}
      <BottomSheet open={!!ann} onClose={() => setAnn(null)} title="Create announcement" footer={<Button title="Post announcement" iconLeft="megaphone-outline" size="md" style={{ flex: 1 }} loading={a.busy} onPress={async () => { if (ann) { let reached = 0; if (await a.run(async () => { reached = (await announcements.post(userId, ann)).reached; })) { a.setMsg(`Announcement posted${ann.notify ? ` · ${reached} student${reached === 1 ? '' : 's'} notified` : ''}.`); setAnn(null); load(); } } }} />}>
        {ann && d && (
          <View style={{ gap: 10 }}>
            <Txt variant="label">Channel</Txt>
            <View style={shared.chips}>{d.channels.map(({ c: ch }) => <Chip key={ch.id} label={`# ${ch.name}`} active={ann.channelId === ch.id} onPress={() => setAnn({ ...ann, channelId: ch.id })} />)}</View>
            {a.err('channel') && <Txt variant="caption" color={c.danger}>{a.err('channel')}</Txt>}
            <TextField label="Title" placeholder="e.g. Class moved to Saturday 7 pm" value={ann.title} onChangeText={(v) => setAnn({ ...ann, title: v.slice(0, 80) })} error={a.err('title')} />
            <TextField label="Message" placeholder="What do students need to know?" value={ann.body} onChangeText={(v) => setAnn({ ...ann, body: v.slice(0, 1000) })} multiline error={a.err('body') ?? a.err('text')} />
            <ToggleRow title="Pin to the top" value={ann.pin} onChange={(v) => setAnn({ ...ann, pin: v })} />
            <ToggleRow title="Notify students" sub="Everyone who can read this channel" value={ann.notify} onChange={(v) => setAnn({ ...ann, notify: v })} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
      <BottomSheet open={!!f} onClose={() => setF(null)} title="New channel" footer={<Button title="Create" size="md" style={{ flex: 1 }} onPress={async () => { if (f && (await a.run(() => communityApi.addChannel(userId, f), `#${f.name} created.`))) { setF(null); load(); } }} />}>
        {f && d && (
          <View style={{ gap: 10 }}>
            <TextField label="Channel name" placeholder="e.g. Doubts, Wins, Jobs" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} error={a.err('name')} />
            <Txt variant="label">Who can see it</Txt>
            <View style={shared.chips}>
              <Chip label="All students" active={!f.courseId} onPress={() => setF({ ...f, courseId: undefined })} />
              {d.courses.map((co) => <Chip key={co.id} label={co.title.slice(0, 24)} active={f.courseId === co.id} onPress={() => setF({ ...f, courseId: co.id })} />)}
            </View>
            <ToggleRow title="Announcements only" sub="Students can react and reply, not start posts" value={f.announce} onChange={(v) => setF({ ...f, announce: v })} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
