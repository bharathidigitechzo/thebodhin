/** Learner certificate: academy design, download as PDF (web: print dialog → Save as PDF; phone: real PDF file → save/share). */
import React, { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { certDesignApi } from '@/api/growth2';
import { certFileName, certHtml } from '@/core/certHtml';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/misc';
import { CertificateView } from '@/ui/CertificateView';
import { Page, useData } from '@/ui/grow';
import { shared } from '@/ui/section';

export default function CertificatePage() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { d, err } = useData((u) => certDesignApi.render(u, id));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  if (!d) return <Page title="Certificate" err={err} fallback="/certificates" />;
  const date = new Date(d.cert.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const primary = d.branding?.primary ?? c.primary, accent = d.branding?.accent ?? '#D99A1E';

  const pdf = async () => {
    setNote(null);
    if (Platform.OS === 'web') { (globalThis as unknown as { print?: () => void }).print?.(); return; }
    setBusy(true);
    try {
      const html = certHtml({ t: d.t, learner: d.learner, course: d.cert.title, academy: d.academy, date, certId: d.cert.id, verify: d.verify, primary, accent });
      // A4 landscape in points (842 × 595). The file lands in the app cache; the share sheet lets the learner save or send it.
      const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: certFileName(d.learner, d.cert.title) });
        setNote({ tone: 'success', text: 'PDF ready. Choose “Save to Files” or share it.' });
      } else {
        await Print.printAsync({ uri }); // fallback: system print dialog (has "Save as PDF")
      }
    } catch {
      setNote({ tone: 'danger', text: 'Could not create the PDF. Check storage space and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Certificate" sub={d.cert.title} fallback="/certificates" wide>
      {note && <Banner tone={note.tone} text={note.text} />}
      <CertificateView t={d.t} learner={d.learner} course={d.cert.title} academy={d.academy} date={date} certId={d.cert.id} primary={primary} accent={accent} />
      <View style={shared.row}>
        <Button title={busy ? 'Creating PDF…' : 'Download PDF'} iconLeft="download-outline" loading={busy} style={{ flex: 1 }} onPress={pdf} />
        <Button title="Share verify link" variant="outline" iconLeft="link-outline" style={{ flex: 1 }} onPress={() => Share.share({ message: d.verify }).catch(() => undefined)} />
      </View>
      <Txt variant="caption" color={c.muted} center>Anyone can check it at {d.verify}</Txt>
    </Page>
  );
}
