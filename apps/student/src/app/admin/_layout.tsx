/**
 * Super Admin portal — web (admin.thebodhin.com) and the Android/iOS apps.
 * Gate: signed in → Bodhin staff role → 2-step code (12 h). Then tabs + stack screens.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, Stack, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, admin } from '@/api/client';
import { ROLE_LABEL, canOpenAdmin } from '@/core/admin';
import { adminMembership, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BrandLogo } from '@/ui/Brand';
import { OtpInput } from '@/ui/misc';

export default function AdminLayout() {
  const { session, ready, signOut } = useAuth();
  const [, force] = useState(0);
  const path = usePathname();
  if (!ready) return null;
  if (!session) return <Redirect href="/sign-in" />;
  if (!adminMembership(session)) return <Redirect href="/home" />;
  const me = admin.me(session.user.id);
  if (!me) return <Redirect href="/home" />;
  if (!me.verified) return <TwoStep userId={session.user.id} name={me.user.name} role={ROLE_LABEL[me.role]} onDone={() => force((n) => n + 1)} onCancel={() => { signOut(); router.replace('/sign-in'); }} />;
  if (!canOpenAdmin(me.role, path)) return <NoAccess role={ROLE_LABEL[me.role]} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

/** Direct link to an admin page outside this staff role: explain instead of crashing. */
function NoAccess({ role }: { role: string }) {
  const { c } = useTheme();
  return (
    <SafeAreaView style={[styles.gate, { backgroundColor: c.ivory }]}>
      <View style={styles.box}>
        <View style={[styles.lock, { backgroundColor: c.primarySoft }]}><Ionicons name="lock-closed" size={28} color={c.primary} /></View>
        <Txt variant="title" center>Not part of your role</Txt>
        <Txt color={c.muted} center>Your {role} role doesn’t include this section. Ask a Super Admin if you need access.</Txt>
        <Button title="Go to admin home" onPress={() => router.replace('/admin')} />
      </View>
    </SafeAreaView>
  );
}

function TwoStep({ userId, name, role, onDone, onCancel }: { userId: string; name: string; role: string; onDone: () => void; onCancel: () => void }) {
  const { c } = useTheme();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (v = code) => {
    setBusy(true);
    setErr(null);
    try {
      await admin.verify(userId, v);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not verify.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={[styles.gate, { backgroundColor: c.ivory }]}>
      <View style={styles.box}>
        <BrandLogo size="md" />
        <View style={[styles.lock, { backgroundColor: c.primarySoft }]}><Ionicons name="shield-checkmark" size={30} color={c.primary} /></View>
        <Txt variant="title" center>Admin verification</Txt>
        <Txt color={c.muted} center>{name} · {role}. Enter the 6-digit code from your authenticator app.</Txt>
        <OtpInput value={code} onChange={(v) => { setCode(v); if (v.length === 6) go(v); }} error={!!err} />
        {err ? <Txt variant="caption" color={c.danger} center>{err}</Txt> : <Txt variant="caption" color={c.muted} center>Demo code: 123456 · valid for 12 hours on this device</Txt>}
        <Button title="⚡ Auto-fill 123456 & Verify" variant="outline" size="md" loading={busy} onPress={() => { setCode('123456'); go('123456'); }} />
        <Button title="Verify" loading={busy} disabled={code.length !== 6} onPress={() => go()} />
        <Button title="Use a different account" variant="ghost" onPress={onCancel} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  box: { width: '100%', maxWidth: 420, gap: 14 },
  lock: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
