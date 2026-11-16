/** Public certificate check (thebodhin.com/cert/ID) — what the QR on every certificate opens. No login needed. */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { verifyCertificate } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Eyebrow, Headline, PublicFrame } from '@/ui/publicFrame';
import { Reveal } from '@/ui/motion';

export default function Verify() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [q, setQ] = useState(id === 'check' ? '' : id ?? '');
  const r = id && id !== 'check' ? verifyCertificate(id) : null;
  const row = (k: string, v: string) => <View style={styles.row}><Txt variant="caption" color={c.muted} style={{ width: 110 }}>{k}</Txt><Txt variant="bodyStrong" style={{ flex: 1 }}>{v}</Txt></View>;
  return (
    <PublicFrame seo={{ title: 'Verify a certificate | Bodhin', description: 'Check that a Bodhin certificate is real using its ID or QR code.' }} primary={{ title: 'Explore courses', to: '/explore' }} secondary={{ title: 'Home', to: '/welcome' }}>
      <View style={{ gap: 12, maxWidth: 680 }}>
        <Eyebrow>Certificate check</Eyebrow>
        <Headline size="lg">Is this certificate real?</Headline>
        <Txt color={c.inkSoft}>Enter the ID printed on the certificate, or scan its QR code.</Txt>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><TextField label="Certificate ID" value={q} onChangeText={setQ} autoCapitalize="characters" /></View>
          <Button title="Check" disabled={!q.trim()} onPress={() => router.replace({ pathname: '/cert/[id]', params: { id: q.trim() } })} />
        </View>
      </View>
      {r && (
        <Reveal key={id}>
          <View accessibilityLiveRegion="polite" style={[styles.card, { borderColor: r.valid ? c.success : c.danger, backgroundColor: c.surface }]}>
            <View style={[styles.head, { backgroundColor: r.valid ? c.successBg : c.dangerBg }]}>
              <Ionicons name={r.valid ? 'shield-checkmark' : 'close-circle'} size={30} color={r.valid ? c.success : c.danger} />
              <View style={{ flex: 1 }}>
                <Txt variant="heading" color={r.valid ? c.success : c.danger}>{r.valid ? 'Valid certificate' : 'Not found'}</Txt>
                <Txt variant="caption" color={c.inkSoft}>{r.valid ? 'Issued on Bodhin and not altered.' : r.reason}</Txt>
              </View>
            </View>
            {r.valid && (
              <View style={{ padding: 16, gap: 8 }}>
                {row('Awarded to', r.learner)}
                {row('Course', r.course)}
                {row('Academy', r.academy)}
                {row('Educator', r.tutor)}
                {row('Issued', new Date(r.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}
                {row('Certificate ID', r.id)}
              </View>
            )}
          </View>
        </Reveal>
      )}
    </PublicFrame>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 20, overflow: 'hidden', maxWidth: 680 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'baseline' },
});
