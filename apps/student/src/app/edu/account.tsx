/**
 * Educator / tutor profile & account. Only what a teacher needs: name and email, password, notifications, help,
 * switch dashboard, log out. No student features (purchases, playground, downloads, refer & earn, certificates).
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ApiError, account } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Banner } from '@/ui/misc';
import { Group, Row } from '@/ui/ListRow';
import { Page } from '@/ui/grow';
import { Card, ToggleRow } from '@/ui/section';
import { SwitchDashboardSheet, dashboardsOf } from '@/ui/responsive';
import { haptic } from '@/ui/haptics';

export default function EducatorAccount() {
  const { c } = useTheme();
  const { session, setSession, signOut } = useAuth();
  const userId = session?.user.id ?? '';
  const [name, setName] = useState(session?.user.name ?? '');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [fe, setFe] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState<'profile' | 'pw' | null>(null);
  const [switching, setSwitching] = useState(false);
  const [settings, setSettings] = useState(() => account.settings(userId));
  if (!session) return null;
  const err = (f: string) => (fe?.field === f ? fe.msg : undefined);
  const run = async (kind: 'profile' | 'pw', fn: () => Promise<unknown>, ok: string) => {
    setBusy(kind); setFe(null); setMsg(null);
    try { await fn(); setMsg(ok); haptic('success'); } catch (e) { setFe(e instanceof ApiError ? { field: e.field, msg: e.message } : { msg: 'Something went wrong.' }); haptic('error'); } finally { setBusy(null); }
  };
  const push = (k: keyof typeof settings.push, v: boolean) => { const s = { ...settings, push: { ...settings.push, [k]: v } }; setSettings(s); account.saveSettings(userId, s); };

  return (
    <Page title="Profile & account" sub="Your teaching account" fallback="/educator/more">
      {msg && <Banner tone="success" text={msg} />}
      {fe && !fe.field && <Banner text={fe.msg} />}
      <Card title="Profile">
        <TextField label="Full name" value={name} onChangeText={setName} error={err('name')} />
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={err('email')} />
        <Button title="Save profile" size="md" loading={busy === 'profile'} onPress={() => run('profile', async () => setSession(await account.updateProfile(userId, { name, email })), 'Profile saved.')} />
      </Card>
      <Card title="Password">
        <TextField label="Current password" value={pw.current} onChangeText={(v) => setPw({ ...pw, current: v })} secureTextEntry error={err('current')} />
        <TextField label="New password" value={pw.next} onChangeText={(v) => setPw({ ...pw, next: v })} secureTextEntry hint="8+ characters with letters and numbers" error={err('next')} />
        <Button title="Change password" size="md" variant="outline" loading={busy === 'pw'} onPress={() => run('pw', async () => { await account.changePassword(userId, pw.current, pw.next); setPw({ current: '', next: '' }); }, 'Password changed.')} />
      </Card>
      <Card title="Notifications">
        <ToggleRow title="Live classes & mentorship" sub="Requests, reminders, class started" value={settings.push.live} onChange={(v) => push('live', v)} />
        <ToggleRow title="Assignments & certificates" sub="Submissions to grade, certificates to approve" value={settings.push.assignments} onChange={(v) => push('assignments', v)} />
        <ToggleRow title="Course activity" sub="Doubts, reviews, community replies" value={settings.push.course} onChange={(v) => push('course', v)} />
      </Card>
      <Group title="Account" icon="person-outline">
        <Row icon="notifications-outline" title="Notification inbox" onPress={() => router.push('/notifications')} />
        <Row icon="help-buoy-outline" title="Help center" onPress={() => router.push('/help')} />
        {dashboardsOf(session).length > 1 && <Row icon="swap-horizontal-outline" title="Switch dashboard" sub="Open another dashboard you have access to" onPress={() => setSwitching(true)} />}
        <Row icon="log-out-outline" title="Log out" danger onPress={() => { signOut(); router.replace('/sign-in'); }} />
      </Group>
      <View style={{ height: 8 }} />
      <Txt variant="caption" color={c.muted} center>Signed in as {session.user.email}</Txt>
      <SwitchDashboardSheet open={switching} onClose={() => setSwitching(false)} current="educator" />
    </Page>
  );
}
