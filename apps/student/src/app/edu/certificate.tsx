/** Certificate designer: layout, wording, signer, logo, QR, accent — with a live preview. */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { certDesignApi } from '@/api/growth2';
import { certErrors, type CertTemplate } from '@/core/growth2';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Chip } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { CertificateView } from '@/ui/CertificateView';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, ToggleRow, shared } from '@/ui/section';

export default function CertDesigner() {
  const { c } = useTheme();
  const { session } = useAuth();
  const { d, err, load, userId } = useData(certDesignApi.get);
  const a = useAct();
  const [t, setT] = useState<CertTemplate | null>(null);
  useEffect(() => { if (d) setT({ ...d.t }); }, [d]);
  if (!d || !t) return <Page title="Certificate" err={err} />;
  const e = certErrors(t);
  const fe = (f: string) => e.find((x) => x.field === f)?.msg;
  const dirty = JSON.stringify(t) !== JSON.stringify(d.t);
  return (
    <Page title="Certificate designer" sub="Every completion certificate uses this" wide footer={d.ctx.role === 'owner' && <Button title={dirty ? 'Save design' : 'Saved'} size="md" style={{ flex: 1 }} disabled={!dirty || e.length > 0} onPress={async () => { if (await a.run(() => certDesignApi.save(userId, t), 'Saved. New and existing certificates show this design.')) load(); }} />}>
      {a.msg && !dirty && <Banner tone="success" text={a.msg} />}
      {a.general && <Banner text={a.general} />}
      <CertificateView t={t} learner={session?.user.name ? 'Arjun Kumar' : 'Learner'} course="SEO & Content Strategy" academy={d.branding.displayName} date={new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} certId="DEMO-2026-0001" primary={d.branding.primary} accent={d.branding.accent} />
      <Card title="Layout">
        <View style={shared.chips}>{(['classic', 'modern', 'minimal'] as const).map((l) => <Chip key={l} label={l[0].toUpperCase() + l.slice(1)} active={t.layout === l} onPress={() => setT({ ...t, layout: l })} />)}</View>
        <Txt variant="label">Accent</Txt>
        <View style={shared.chips}>{[undefined, '#D99A1E', '#0F6E5A', '#B91C1C', '#6D28D9'].map((col) => <Chip key={col ?? 'brand'} label={col ?? 'Brand colour'} active={t.accent === col} onPress={() => setT({ ...t, accent: col })} />)}</View>
        <ToggleRow title="Show academy logo" value={t.showLogo} onChange={(v) => setT({ ...t, showLogo: v })} />
        <ToggleRow title="Show verification QR" sub="Employers scan it to check the certificate is real" value={t.showQr} onChange={(v) => setT({ ...t, showQr: v })} />
      </Card>
      <Card title="Background design">
        <View style={shared.chips}>
          <Chip label="None (layout colours)" active={!t.bgId} onPress={() => setT({ ...t, bgId: undefined, bg: undefined })} />
          {d.designs.map((x) => <Chip key={x.id} label={x.name.slice(0, 24)} active={t.bgId === x.id} onPress={() => setT({ ...t, bgId: x.id, bg: x.dataUrl })} />)}
        </View>
        <Txt variant="caption" color={c.muted}>Upload your own artwork in Certificates → Templates. The learner’s name, course, date and ID are printed on top.</Txt>
        <Button title="Upload or manage designs" iconLeft="cloud-upload-outline" size="md" variant="outline" onPress={() => router.push('/edu/certificates')} />
      </Card>
      <Card title="Wording">
        <TextField label="Title" value={t.title} onChangeText={(v) => setT({ ...t, title: v })} error={fe('title')} />
        <TextField label="Line before course name" value={t.line} onChangeText={(v) => setT({ ...t, line: v })} error={fe('line')} />
        <TextField label="Signed by" value={t.signName} onChangeText={(v) => setT({ ...t, signName: v })} error={fe('signName')} />
        <TextField label="Signer title" value={t.signTitle} onChangeText={(v) => setT({ ...t, signTitle: v })} error={fe('signTitle')} />
        <Txt variant="caption" color={c.muted}>The learner’s name, course, date and certificate ID are filled in automatically. Learners download it as PDF from their Certificates screen.</Txt>
      </Card>
    </Page>
  );
}
