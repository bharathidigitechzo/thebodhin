/** Community admin: channels (whole academy or one course), announcement-only channels, flagged posts. */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
  const owner = d?.ctx.role === 'owner';
  return (
    <Page title="Community" sub="Channels for your learners" err={err} footer={d && <Button title="New channel" iconLeft="add" size="md" style={{ flex: 1 }} disabled={!owner} onPress={() => { setF({ name: '', announce: false }); a.setFe(null); }} />}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {a.general && <Banner text={a.general} />}
          <Txt variant="caption" color={c.muted}>Only your enrolled students and team can see these. Posts with 3 reports hide automatically until you review them. Phone numbers and link spam are blocked for students.</Txt>
          {d.channels.map(({ c: ch, posts, flagged }) => (
            <Card key={ch.id}>
              <Pressable onPress={() => router.push({ pathname: '/community/[id]', params: { id: ch.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityRole="button" accessibilityLabel={`Open ${ch.name}`}>
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
