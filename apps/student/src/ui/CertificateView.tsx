/** One certificate layout used by the designer preview and the learner's certificate page (print = PDF on web). */
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CertTemplate } from '@/core/growth2';
import { Txt } from './Txt';

export function CertificateView({ t, learner, course, academy, date, certId, primary, accent }: { t: CertTemplate; learner: string; course: string; academy: string; date: string; certId: string; primary: string; accent: string }) {
  const ac = t.accent ?? accent;
  const modern = t.layout === 'modern', minimal = t.layout === 'minimal';
  return (
    <View style={[styles.page, { borderColor: minimal ? '#E5E7EB' : ac, backgroundColor: '#FFFDF8' }, t.bg ? { overflow: 'hidden' } : null]} accessibilityLabel={`Certificate for ${learner}, ${course}`}>
      {t.bg ? <Image source={{ uri: t.bg }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      {modern && <View style={[styles.band, { backgroundColor: primary }]} />}
      <View style={[styles.inner, !minimal && { borderColor: `${ac}55`, borderWidth: 1 }]}>
        <View style={styles.top}>
          {t.showLogo ? <View style={[styles.logo, { backgroundColor: primary }]}><Txt variant="label" color="#fff">{academy.split(' ').map((w) => w[0]).join('').slice(0, 3)}</Txt></View> : <View />}
          <Txt variant="caption" color="#6B7280">{academy}</Txt>
        </View>
        <Txt variant="title" center color={primary} style={{ letterSpacing: 1 }}>{t.title}</Txt>
        <Txt center color="#6B7280">This is to certify that</Txt>
        <Txt variant="display" center color="#111827" style={{ fontFamily: modern ? undefined : 'serif' }}>{learner}</Txt>
        <Txt center color="#6B7280">{t.line}</Txt>
        <Txt variant="heading" center color="#111827">{course}</Txt>
        <View style={[styles.rule, { backgroundColor: ac }]} />
        <View style={styles.bottom}>
          <View style={{ gap: 2 }}>
            <Txt variant="caption" color="#6B7280">Issued</Txt>
            <Txt variant="label" color="#111827">{date}</Txt>
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Txt style={{ fontStyle: 'italic', fontSize: 20 }} color="#111827">{t.signName}</Txt>
            <View style={{ height: 1, width: 140, backgroundColor: '#9CA3AF' }} />
            <Txt variant="caption" color="#6B7280">{t.signTitle}</Txt>
          </View>
          {t.showQr ? <View style={{ alignItems: 'center', gap: 2 }}><Ionicons name="qr-code-outline" size={44} color="#111827" /><Txt variant="caption" color="#6B7280">{certId}</Txt></View> : <Txt variant="caption" color="#6B7280">{certId}</Txt>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 900, aspectRatio: 1.414, borderWidth: 6, borderRadius: 6, padding: 10, alignSelf: 'center', overflow: 'hidden' },
  band: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 18 },
  inner: { flex: 1, padding: 16, justifyContent: 'space-between', gap: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rule: { height: 2, width: 80, alignSelf: 'center' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 },
});
