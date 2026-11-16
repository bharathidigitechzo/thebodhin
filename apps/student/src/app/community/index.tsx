/** Learner community home: channels from every academy the learner studies with. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { communityApi } from '@/api/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Page, ago, useData } from '@/ui/grow';
import { Card } from '@/ui/section';

export default function CommunityHome() {
  const { c } = useTheme();
  const { d, err } = useData(communityApi.spaces);
  return (
    <Page title="Community" sub="Talk with your batchmates and tutors" err={err} fallback="/profile">
      {d && d.length === 0 && <Card><Txt color={c.muted} center>Join a course to see its community here.</Txt></Card>}
      {d?.map((sp) => (
        <Card key={sp.tenantId} title={sp.academy}>
          {sp.channels.map(({ c: ch, posts, last }) => (
            <Pressable key={ch.id} onPress={() => router.push({ pathname: '/community/[id]', params: { id: ch.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }} accessibilityRole="button" accessibilityLabel={`Open ${ch.name}`}>
              <Ionicons name={ch.announce ? 'megaphone-outline' : 'chatbubbles-outline'} size={20} color={c.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong"># {ch.name}</Txt>
                <Txt variant="caption" color={c.muted}>{posts} posts{last ? ` · ${ago(last)}` : ''}</Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </Pressable>
          ))}
        </Card>
      ))}
    </Page>
  );
}
