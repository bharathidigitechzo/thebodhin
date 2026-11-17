/** One channel: posts, replies, reactions, report; staff can pin / hide / delete. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { communityApi } from '@/api/growth';
import { REACTION_SET } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, ago, useAct, useData } from '@/ui/grow';
import { Card } from '@/ui/section';

export default function ChannelScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { d, err, load, userId } = useData((u) => communityApi.channel(u, id));
  const a = useAct();
  const [text, setText] = useState('');
  const [reply, setReply] = useState<{ to: string; text: string } | null>(null);
  if (!d) return <Page title="Channel" err={err} fallback="/community" />;
  const back = d.staff ? '/edu/community' : '/community';
  const act = async (fn: () => unknown) => { await a.run(fn); load(); };
  return (
    <Page title={`# ${d.ch.name}`} sub={d.academy} fallback={back}>
      {a.general && <Banner text={a.general} />}
      {d.canPost ? (
        <Card>
          <TextField label="Share something" placeholder={d.staff ? 'Announcement, tip or question…' : 'Ask a question or share a win…'} value={text} onChangeText={setText} multiline error={a.err('text')} />
          <Button title="Post" size="md" disabled={!text.trim()} onPress={async () => { if (await a.run(() => communityApi.post(userId, id, text))) { setText(''); load(); } }} />
        </Card>
      ) : <Banner tone="info" text="Only the academy posts here. You can react and reply." />}
      {d.posts.length === 0 && <Card><Txt color={c.muted} center>No posts yet. Start the conversation!</Txt></Card>}
      {d.posts.map(({ p, replies }) => (
        <Card key={p.id}>
          <View style={styles.head}>
            <Avatar name={p.authorName} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="label">{p.authorName} {p.authorRole !== 'student' && <Pill text={p.authorRole === 'owner' ? 'Academy' : 'Tutor'} tone="info" />}</Txt>
              <Txt variant="caption" color={c.muted}>{ago(p.at)}{p.pinned ? ' · 📌 Pinned' : ''}{p.hidden ? ' · Hidden' : ''}</Txt>
            </View>
          </View>
          <Txt>{p.text}</Txt>
          <View style={styles.reacts}>
            {REACTION_SET.map((e) => {
              const n = p.reactions[e]?.length ?? 0;
              const mine = p.reactions[e]?.includes(userId);
              return (
                <Pressable key={e} onPress={() => act(() => communityApi.react(userId, p.id, e))} style={[styles.react, { borderColor: mine ? c.primary : c.border, backgroundColor: mine ? c.primarySoft : c.surface }]} accessibilityRole="button" accessibilityLabel={`React ${e}${n ? `, ${n}` : ''}`}>
                  <Txt>{e}{n ? ` ${n}` : ''}</Txt>
                </Pressable>
              );
            })}
          </View>
          {replies.map((r) => (
            <View key={r.id} style={[styles.reply, { borderLeftColor: c.border }]}>
              <Txt variant="label">{r.authorName}<Txt variant="caption" color={c.muted}> · {ago(r.at)}</Txt></Txt>
              <Txt>{r.text}</Txt>
            </View>
          ))}
          {reply?.to === p.id ? (
            <View style={{ gap: 6 }}>
              <TextField label="Reply" value={reply.text} onChangeText={(v) => setReply({ to: p.id, text: v })} multiline autoFocus />
              <Button title="Send reply" size="md" onPress={async () => { if (await a.run(() => communityApi.post(userId, id, reply.text, p.id))) { setReply(null); load(); } }} />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button title="Reply" size="md" variant="outline" onPress={() => setReply({ to: p.id, text: '' })} />
              {d.staff && <Button title={p.pinned ? 'Unpin' : 'Pin'} size="md" variant="outline" onPress={() => act(() => communityApi.moderate(userId, p.id, 'pin'))} />}
              {d.staff && <Button title={p.hidden ? 'Unhide' : 'Hide'} size="md" variant="outline" onPress={() => act(() => communityApi.moderate(userId, p.id, p.hidden ? 'unhide' : 'hide'))} />}
              {(d.staff || p.authorId === userId) && <Button title="Delete" size="md" variant="outline" onPress={() => act(() => communityApi.moderate(userId, p.id, 'delete'))} />}
              {!d.staff && p.authorId !== userId && <Button title="Report" size="md" variant="outline" onPress={() => act(() => { communityApi.report(userId, p.id); a.setMsg('Reported. The academy will review it.'); })} />}
            </View>
          )}
        </Card>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  react: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, minHeight: 32, justifyContent: 'center' },
  reply: { borderLeftWidth: 3, paddingLeft: 10, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
