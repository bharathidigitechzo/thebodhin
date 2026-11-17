/** One certificate layout used by the designer preview and the learner's certificate page (print = PDF on web). */
import React from 'react';
import { Image, ImageBackground, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CertTemplate } from '@/core/growth2';
import { Txt } from './Txt';

export function CertificateView({ t, learner, course, academy, date, certId, primary, accent }: { t: CertTemplate; learner: string; course: string; academy: string; date: string; certId: string; primary: string; accent: string }) {
  const ac = t.accent ?? accent;
  const modern = t.layout === 'modern', minimal = t.layout === 'minimal', custom = t.layout === 'custom' || !!t.customBackgroundUri;
  // Background: uploaded custom image (designer) or a picked design from certificate management (t.bg, resolved by the API).
  const bgUri = t.customBackgroundUri || t.bg;
  const certify = t.certifyText?.trim() || 'This is to certify that';

  const content = (
    <View style={[styles.inner, !minimal && !custom && { borderColor: `${ac}55`, borderWidth: 1 }, custom && styles.customInner]}>
      <View style={styles.top}>
        {t.showLogo ? (
          <View style={[styles.logo, { backgroundColor: primary }]}>
            <Txt variant="label" color="#fff">{academy.split(' ').map((w) => w[0]).join('').slice(0, 3)}</Txt>
          </View>
        ) : <View />}
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Txt variant="caption" color="#6B7280">{academy}</Txt>
          {t.badgeText ? (
            <View style={[styles.badge, { backgroundColor: `${ac}20`, borderColor: ac }]}>
              <Ionicons name="ribbon-outline" size={12} color={ac} />
              <Txt variant="caption" color={ac} style={{ fontWeight: '600', fontSize: 10 }}>{t.badgeText}</Txt>
            </View>
          ) : null}
        </View>
      </View>

      <Txt variant="title" center color={primary} style={{ letterSpacing: 1.2 }}>{t.title}</Txt>
      <Txt center color="#6B7280">{certify}</Txt>
      <Txt variant="display" center color="#111827" style={{ fontFamily: modern ? undefined : 'serif', fontSize: 26 }}>{learner}</Txt>
      <Txt center color="#6B7280" style={{ maxWidth: 500, alignSelf: 'center' }}>{t.line}</Txt>
      <Txt variant="heading" center color="#111827">{course}</Txt>
      <View style={[styles.rule, { backgroundColor: ac }]} />

      <View style={styles.bottom}>
        {t.showDate !== false ? (
          <View style={{ gap: 2 }}>
            <Txt variant="caption" color="#6B7280">Issued</Txt>
            <Txt variant="label" color="#111827">{date}</Txt>
          </View>
        ) : <View />}

        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-end' }}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            {t.customSignatureUri ? (
              <Image source={{ uri: t.customSignatureUri }} style={styles.sigImage} resizeMode="contain" />
            ) : (
              <Txt style={{ fontStyle: 'italic', fontSize: 18 }} color="#111827">{t.signName}</Txt>
            )}
            <View style={{ height: 1, width: 120, backgroundColor: '#9CA3AF' }} />
            <Txt variant="caption" color="#6B7280">{t.signTitle}</Txt>
          </View>

          {t.signName2 ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Txt style={{ fontStyle: 'italic', fontSize: 18 }} color="#111827">{t.signName2}</Txt>
              <View style={{ height: 1, width: 120, backgroundColor: '#9CA3AF' }} />
              <Txt variant="caption" color="#6B7280">{t.signTitle2 || 'Co-instructor'}</Txt>
            </View>
          ) : null}
        </View>

        {t.showQr ? (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Ionicons name="qr-code-outline" size={40} color="#111827" />
            <Txt variant="caption" color="#6B7280" style={{ fontSize: 9 }}>{certId}</Txt>
          </View>
        ) : (
          <Txt variant="caption" color="#6B7280" style={{ fontSize: 9 }}>{certId}</Txt>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.page, { borderColor: minimal ? '#E5E7EB' : ac, backgroundColor: '#FFFDF8' }]} accessibilityLabel={`Certificate for ${learner}, ${course}`}>
      {bgUri ? (
        <ImageBackground source={{ uri: bgUri }} style={StyleSheet.absoluteFill} resizeMode="cover">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,253,248,0.85)' }]} />
        </ImageBackground>
      ) : null}
      {modern && !bgUri && <View style={[styles.band, { backgroundColor: primary }]} />}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 900, aspectRatio: 1.414, borderWidth: 6, borderRadius: 8, padding: 10, alignSelf: 'center', overflow: 'hidden', position: 'relative' },
  band: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 18 },
  inner: { flex: 1, padding: 16, justifyContent: 'space-between', gap: 4 },
  customInner: { backgroundColor: 'transparent' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  rule: { height: 2, width: 80, alignSelf: 'center' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 },
  sigImage: { width: 110, height: 32 },
});
