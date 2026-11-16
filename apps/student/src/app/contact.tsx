/** Contact: a short form that lands in Bodhin's own lead pipeline; clear success state and next steps. */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { marketingX } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Chip } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { useLayout } from '@/ui/responsive';
import { Eyebrow, Headline, PublicFrame } from '@/ui/publicFrame';
import { Reveal } from '@/ui/motion';
import { useAct } from '@/ui/grow';

const TOPICS = ['I want to teach on Bodhin', 'Enterprise / institute plan', 'I am a learner', 'Something else'];

export default function Contact() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const a = useAct();
  const [f, setF] = useState({ name: '', phone: '', email: '', topic: TOPICS[0], message: '', hp: '' });
  const [sent, setSent] = useState(false);
  return (
    <PublicFrame>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 64 : 24 }}>
        <View style={{ flex: 1, gap: 14 }}>
          <Eyebrow>Contact</Eyebrow>
          <Headline size="xl">Ask us anything.</Headline>
          <Txt color={c.inkSoft} style={{ fontSize: 17, lineHeight: 26 }}>Tell us what you teach or what you need. A person from Bodhin calls you back.</Txt>
          <View style={{ gap: 10, marginTop: 6 }}>
            {([['school-outline', 'Thinking of moving your academy? We help you plan the switch.'], ['help-buoy-outline', 'Already on Bodhin? The Help centre inside the app is faster.'], ['shield-checkmark-outline', 'We use your number only to reply to this message.']] as const).map(([icon, t]) => (
              <View key={t} style={{ flexDirection: 'row', gap: 10 }}><Ionicons name={icon} size={20} color={c.primary} /><Txt style={{ flex: 1 }} color={c.inkSoft}>{t}</Txt></View>
            ))}
          </View>
        </View>
        <Reveal style={{ flex: 1, width: '100%' }}>
          <View style={[styles.form, { backgroundColor: c.surface, borderColor: c.border }]}>
            {sent ? (
              <View style={{ gap: 12, alignItems: 'flex-start' }} accessibilityLiveRegion="polite">
                <Ionicons name="checkmark-circle" size={44} color={c.success} />
                <Headline size="md">Got it, {f.name.split(' ')[0]}.</Headline>
                <Txt color={c.inkSoft}>We will call +91 {f.phone}. Meanwhile:</Txt>
                <Button title="See pricing" onPress={() => router.push('/pricing')} />
                <Button title="Apply as an educator" variant="outline" onPress={() => router.push('/apply')} />
              </View>
            ) : (
              <>
                <Txt variant="label">What is this about?</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{TOPICS.map((t) => <Chip key={t} label={t} active={f.topic === t} onPress={() => setF({ ...f, topic: t })} />)}</View>
                <TextField label="Your name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} error={a.err('name')} />
                <TextField label="Mobile" prefix="+91" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v.replace(/\D/g, '').slice(0, 10) })} keyboardType="phone-pad" error={a.err('phone')} />
                <TextField label="Email (optional)" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" autoCapitalize="none" error={a.err('email')} />
                <TextField label="Message (optional)" value={f.message} onChangeText={(v) => setF({ ...f, message: v.slice(0, 500) })} multiline />
                {a.general && <Banner text={a.general} />}
                <Button title={a.busy ? 'Sending…' : 'Request a call back'} loading={a.busy} onPress={async () => { if (await a.run(() => marketingX.contact({ ...f, email: f.email || undefined }))) setSent(true); }} />
              </>
            )}
          </View>
        </Reveal>
      </View>
    </PublicFrame>
  );
}

const styles = StyleSheet.create({ form: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 12 } });
