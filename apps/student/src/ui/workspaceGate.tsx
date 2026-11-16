/**
 * Workspace gate (Nielsen #1: always show the system status).
 * - Locked (trial ended / plan ended / payment overdue): educator screens are replaced by a clear lock screen with
 *   one action, "Choose a plan". Subscription + payment screens stay open so they can unlock it.
 * - Counting down (trial ≤ 3 days left, or payment grace): a slim strip on every educator screen.
 * Learner screens are never affected.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, educator } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';
import { Celebrate } from './celebrate';
import { haptic } from './haptics';

const EDU = /^\/(edu|educator)(\/|$)/;
const OPEN_WHEN_LOCKED = ['/edu/subscription', '/edu/payments-setup'];

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const userId = useAuth().session?.user.id ?? '';
  const inEdu = EDU.test(path);
  const ctx = inEdu && userId ? educator.context(userId) : null;
  const g = ctx?.gate;
  const open = OPEN_WHEN_LOCKED.some((p) => path.startsWith(p));
  React.useEffect(() => { if (g?.locked && !open) haptic('warning'); }, [g?.locked, open]);
  // The navigator always stays mounted (overlay, not replace) so navigation keeps working.
  const locked = !!g?.locked && !open;
  // Educator pages opened by someone who isn't an educator (old link, bookmark, learner): explain, never blank.
  const notEducator = inEdu && !ctx;
  const countdown = !!g && !open && ((g.state === 'trial' && (g.daysLeft ?? 99) <= 3) || g.state === 'grace');
  return (
    <View style={{ flex: 1 }}>
      {countdown && g && <Strip title={g.title} message={g.message} danger={g.state === 'grace'} />}
      <View style={{ flex: 1 }}>{children}</View>
      {notEducator && (
        <View style={StyleSheet.absoluteFill}>
          <NotEducator signedIn={!!userId} applied={!!userId && !!auth.getApplication(userId) && auth.getApplication(userId)!.status !== 'draft'} />
        </View>
      )}
      {locked && g && ctx && (
        <View style={StyleSheet.absoluteFill}>
          <Locked title={g.title} message={g.message} owner={ctx.role === 'owner'} />
        </View>
      )}
    </View>
  );
}

export function NotEducator({ signedIn, applied }: { signedIn: boolean; applied: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.lockWrap}>
        <View style={styles.lockInner} accessibilityRole="alert">
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school-outline" size={44} color={c.primary} />
          </View>
          <Txt variant="title" center>This is the educator area</Txt>
          <Txt color={c.inkSoft} center>
            {!signedIn ? 'Sign in with your educator account to continue.' : applied ? 'Your educator application is with our team. You’ll get access as soon as it’s approved.' : 'Want to teach on Bodhin? Apply in two minutes and get a free trial once approved.'}
          </Txt>
        </View>
        <View style={{ width: '100%', maxWidth: 440, gap: 10 }}>
          {!signedIn ? (
            <Button title="Sign in" iconRight="arrow-forward" onPress={() => router.replace('/sign-in')} />
          ) : applied ? (
            <Button title="See my application" iconRight="arrow-forward" onPress={() => router.replace('/application-status')} />
          ) : (
            <Button title="Teach on Bodhin" iconRight="arrow-forward" onPress={() => router.replace('/apply')} />
          )}
          <Button title="Go to learning" variant="outline" onPress={() => router.replace(signedIn ? '/home' : '/welcome')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Strip({ title, message, danger }: { title: string; message: string; danger: boolean }) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: danger ? c.dangerBg : '#FFF4CC' }}>
      <Pressable onPress={() => router.push('/edu/subscription')} accessibilityRole="button" accessibilityLabel={`${title}. ${message} Open subscription`} style={styles.strip}>
        <Ionicons name={danger ? 'card-outline' : 'hourglass-outline'} size={18} color={danger ? c.danger : '#8A6400'} />
        <View style={{ flex: 1 }}>
          <Txt variant="label" color={danger ? c.danger : '#6B4E00'}>{title}</Txt>
          <Txt variant="caption" color={danger ? c.danger : '#6B4E00'} numberOfLines={1}>{message}</Txt>
        </View>
        <Txt variant="label" color={danger ? c.danger : '#6B4E00'}>{danger ? 'Pay' : 'Choose plan'}</Txt>
      </Pressable>
    </SafeAreaView>
  );
}

function Locked({ title, message, owner }: { title: string; message: string; owner: boolean }) {
  const { c } = useTheme();
  const { signOut } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.lockWrap}>
        <View style={styles.lockInner} accessibilityRole="alert">
          <Celebrate icon="lock-closed" tone="gold" confetti={false} />
          <Txt variant="title" center>{title}</Txt>
          <Txt color={c.inkSoft} center>{message}</Txt>
          <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
            {[['checkmark-circle', 'Courses, videos and students are kept'], ['checkmark-circle', 'Learners keep watching what they bought'], ['pause-circle', 'New enrolments, uploads and live classes are paused']].map(([i, t]) => (
              <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Ionicons name={i as keyof typeof Ionicons.glyphMap} size={20} color={i === 'pause-circle' ? c.warning : c.success} />
                <Txt style={{ flex: 1 }}>{t}</Txt>
              </View>
            ))}
          </View>
        </View>
        <View style={{ width: '100%', maxWidth: 440, gap: 10 }}>
          {owner ? (
            <Button title="Choose a plan" iconRight="arrow-forward" onPress={() => router.push('/edu/subscription')} />
          ) : (
            <Txt color={c.inkSoft} center>Ask your academy owner to choose a plan.</Txt>
          )}
          <Button title="Switch to learning" variant="outline" onPress={() => router.replace('/(tabs)')} />
          <Button title="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, minHeight: 48 },
  lockWrap: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'space-between' },
  lockInner: { flex: 1, width: '100%', maxWidth: 440, alignItems: 'center', justifyContent: 'center', gap: 12 },
  list: { width: '100%', borderWidth: 1, borderRadius: 18, padding: 14, gap: 10, marginTop: 6 },
});
