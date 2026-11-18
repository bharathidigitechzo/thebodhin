/** Super Admin → Playground challenges: the challenges the Bodhin team added (built-in ones live in code). */
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ApiError, playgroundAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop, shared } from '@/ui/section';

type Row = ReturnType<typeof playgroundAdmin.list>[number];

export default function PlaygroundChallenges() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const { saved } = useLocalSearchParams<{ saved?: string }>();
  const load = useCallback(() => {
    try { setRows(playgroundAdmin.list(userId)); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not load challenges.'); }
  }, [userId]);
  useFocusEffect(load);

  const act = (fn: () => void, ok: string) => {
    setErr(null);
    try { fn(); setMsg(ok); load(); } catch (e) { setMsg(null); setErr(e instanceof ApiError ? e.message : 'Something went wrong.'); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Playground challenges" sub="Add coding challenges for every learner" fallback="/admin/more" right={<Button title="Add" iconLeft="add" size="md" onPress={() => router.push({ pathname: '/admin/playground/[id]', params: { id: 'new' } })} />} />
        <ScrollView contentContainerStyle={shared.scroll}>
          <View style={shared.inner}>
            {(msg || saved) && <Banner tone="success" text={msg ?? `Saved “${saved}”.`} />}
            {err && <Banner text={err} />}
            <Txt variant="caption" color={c.muted}>Published challenges appear in every learner’s Playground right away, with the same checking and points as the built-in ones. Drafts are hidden from learners.</Txt>
            {rows.length === 0 && (
              <Card>
                <Txt color={c.muted} center>No challenges added yet. Tap “Add” to create the first one.</Txt>
              </Card>
            )}
            {rows.map((r) => (
              <Card key={r.c.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt variant="bodyStrong" style={{ flex: 1 }}>{r.c.title}</Txt>
                  <Pill text={r.c.status === 'published' ? 'Published' : 'Draft'} tone={r.c.status === 'published' ? 'success' : 'neutral'} />
                </View>
                <Txt variant="caption" color={c.muted}>{r.c.kind === 'sql' ? 'SQL' : `Program · ${r.langs.length} language${r.langs.length === 1 ? '' : 's'} (${r.langs.slice(0, 4).join(', ')}${r.langs.length > 4 ? '…' : ''})`} · {r.c.level} · {r.c.points} pts · {r.c.kind === 'sql' ? `${r.c.expect?.length ?? 0} expected rows` : `${r.c.tests.length} tests`}</Txt>
                <Txt variant="caption" color={c.inkSoft}>{r.solvers} learner{r.solvers === 1 ? '' : 's'} solved it</Txt>
                <View style={[shared.row, { flexWrap: 'wrap' }]}>
                  <Button title="Edit" iconLeft="create-outline" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/admin/playground/[id]', params: { id: r.c.id } })} />
                  {r.c.status === 'published'
                    ? <Button title="Unpublish" iconLeft="eye-off-outline" size="md" variant="outline" style={{ flex: 1 }} onPress={() => act(() => playgroundAdmin.setStatus(userId, r.c.id, 'draft'), `“${r.c.title}” is hidden from learners.`)} />
                    : <Button title="Publish" iconLeft="rocket-outline" size="md" style={{ flex: 1 }} onPress={() => act(() => playgroundAdmin.setStatus(userId, r.c.id, 'published'), `“${r.c.title}” is live in the Playground.`)} />}
                  <Button title="Delete" iconLeft="trash-outline" size="md" variant="outline" style={{ flex: 1 }} onPress={() => setDel(r)} />
                </View>
              </Card>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
      <BottomSheet open={!!del} onClose={() => setDel(null)} title="Delete this challenge?" footer={<Button title="Delete" size="md" style={{ flex: 1 }} onPress={() => { const r = del!; setDel(null); act(() => playgroundAdmin.remove(userId, r.c.id), `“${r.c.title}” deleted.`); }} />}>
        <Txt color={c.inkSoft}>“{del?.c.title}” disappears from the Playground. Points learners earned from it stop counting. To hide it for now and keep their points, use Unpublish instead.</Txt>
      </BottomSheet>
    </View>
  );
}
