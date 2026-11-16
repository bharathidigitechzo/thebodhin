/** Educator week timetable: every class the user can host, across batches, day by day. Clashes are flagged; tap to manage. */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { liveAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { WeekTimetable } from '@/ui/WeekTimetable';

export default function Timetable() {
  const { c } = useTheme();
  const userId = useAuth().session?.user.id ?? '';
  const [wk, setWk] = useState(0);
  const [rev, setRev] = useState(0);
  useFocusEffect(React.useCallback(() => setRev((x) => x + 1), []));
  const data = useMemo(() => liveAdmin.week(userId, wk), [userId, wk, rev]);
  const items = data.days.flatMap((d) => d.items).map((s) => ({ id: s.id, title: s.title, sub: [s.batchName, s.instructor].filter(Boolean).join(' · '), startsAt: s.startsAt, endsAt: s.endsAt, mode: s.mode, clash: s.clash, state: s.state === 'cancelled' ? undefined : s.state }));
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="arrow-back" label="Back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/live'))} />
          <Txt variant="heading" style={{ flex: 1 }}>Timetable</Txt>
          <Button title="Schedule" iconLeft="add" size="md" onPress={() => router.push('/edu/schedule')} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            {data.clashes > 0 && <Banner tone="danger" text={`${data.clashes} class${data.clashes === 1 ? '' : 'es'} this week overlap another class of the same instructor. Open the class and change its time.`} />}
            <WeekTimetable
              items={items}
              offset={wk}
              onOffset={setWk}
              empty="No classes this day. Tap Schedule to add one."
              onPress={(it) => {
                const s = data.days.flatMap((d) => d.items).find((x) => x.id === it.id);
                if (s?.batchId) router.push({ pathname: '/edu/batch/[id]', params: { id: s.batchId, tab: 'schedule' } });
                else router.push({ pathname: '/edu/prejoin/[id]', params: { id: it.id } });
              }}
            />
            <Txt variant="caption" color={c.muted}>Times are shown in your phone’s time zone. Students see the same timetable in their Live tab.</Txt>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 32 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 14 },
});
