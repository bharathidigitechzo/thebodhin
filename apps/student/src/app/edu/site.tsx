/** Website builder: sections on/off, order (Growth), text, SEO, contact, GA4 / Meta Pixel. Live preview link. */
import React, { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { siteApi } from '@/api/growth';
import type { Site, SiteSection } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, ToggleRow, shared } from '@/ui/section';

export default function SiteBuilder() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(siteApi.get);
  const a = useAct();
  const [s, setS] = useState<Site | null>(null);
  const [ed, setEd] = useState<SiteSection | null>(null);
  useEffect(() => { if (d) setS(d.site); }, [d]);
  if (!d || !s) return <Page title="Website" err={err} />;
  const owner = d.ctx.role === 'owner';
  const errs = siteApi.errors(userId, s);
  const fe = (f: string) => errs.find((e) => e.field === f)?.msg;
  const setSec = (id: string, patch: Partial<SiteSection>) => setS({ ...s, sections: s.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const move = (i: number, dir: -1 | 1) => { const arr = [...s.sections]; const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; setS({ ...s, sections: arr }); };
  const dirty = JSON.stringify(s) !== JSON.stringify(d.site);
  return (
    <Page title="Website" sub={d.ctx.host} footer={<>
      <Button title="Preview" variant="outline" size="md" iconLeft="eye-outline" onPress={() => router.push({ pathname: '/site/[slug]', params: { slug: d.ctx.tenant.slug } })} />
      <Button title={dirty ? 'Save & publish' : 'Saved'} size="md" style={{ flex: 1 }} disabled={!owner || !dirty} onPress={async () => { if (await a.run(() => siteApi.save(userId, s), 'Published. Changes are live on your site.')) load(); }} />
    </>}>
      {a.msg && !dirty && <Banner tone="success" text={a.msg} />}
      {a.fe && <Banner text={a.fe.msg} />}
      {!d.pro && <Banner tone="info" text="Starter template: show/hide sections and edit text. Growth adds ordering, testimonials, FAQ, enquiry form and Google Analytics / Meta Pixel." />}
      <Card title="Look">
        <View style={shared.chips}>{(['classic', 'bold', 'minimal'] as const).map((t) => <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} active={s.template === t} onPress={() => setS({ ...s, template: t })} />)}</View>
        <Txt variant="caption" color={c.muted}>Colours and logo come from Branding & domain.</Txt>
        <ToggleRow title="Site is published" sub={s.published ? 'Visitors can see it' : 'Only you can preview it'} value={s.published} onChange={(v) => setS({ ...s, published: v })} />
      </Card>
      <Card title="Sections">
        {s.sections.map((sec, i) => {
          const m = d.meta.find((x) => x.kind === sec.kind)!;
          return (
            <View key={sec.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: m.locked ? 0.55 : 1 }}>
              <Ionicons name={m.icon as never} size={20} color={c.primary} />
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => !m.locked && setEd({ ...sec })} accessibilityRole="button" accessibilityLabel={`Edit ${m.label}`}>
                <Txt variant="label" numberOfLines={1}>{m.label}</Txt>
                <Txt variant="caption" color={c.muted} numberOfLines={1}>{m.locked ? 'Needs a higher plan' : sec.heading || 'Tap to edit'}</Txt>
              </Pressable>
              {d.pro && <Pressable onPress={() => move(i, -1)} hitSlop={6} accessibilityLabel={`Move ${m.label} up`}><Ionicons name="chevron-up" size={20} color={c.muted} /></Pressable>}
              {d.pro && <Pressable onPress={() => move(i, 1)} hitSlop={6} accessibilityLabel={`Move ${m.label} down`}><Ionicons name="chevron-down" size={20} color={c.muted} /></Pressable>}
              {m.locked ? <Pill text="Locked" tone="gold" icon="lock-closed" /> : <Switch value={sec.visible} onValueChange={(v) => setSec(sec.id, { visible: v })} accessibilityLabel={`Show ${m.label}`} />}
            </View>
          );
        })}
        {fe('sections') && <Banner text={fe('sections')!} />}
      </Card>
      <Card title="Google search (SEO)">
        <TextField label="Page title" value={s.seo.title} onChangeText={(v) => setS({ ...s, seo: { ...s.seo, title: v } })} error={fe('seo.title')} hint={`${s.seo.title.length}/60`} />
        <TextField label="Description" value={s.seo.description} onChangeText={(v) => setS({ ...s, seo: { ...s.seo, description: v } })} multiline error={fe('seo.description')} hint={`${s.seo.description.length}/160`} />
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, gap: 2 }}>
          <Txt variant="caption" color={c.success}>{d.ctx.host}</Txt>
          <Txt variant="bodyStrong" color={c.info} numberOfLines={1}>{s.seo.title}</Txt>
          <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>{s.seo.description}</Txt>
        </View>
      </Card>
      <Card title="Contact">
        <TextField label="Phone" prefix="+91" value={s.contact.phone ?? ''} onChangeText={(v) => setS({ ...s, contact: { ...s.contact, phone: v.replace(/\D/g, '').slice(0, 10) } })} keyboardType="phone-pad" error={fe('contact.phone')} />
        <TextField label="Email" value={s.contact.email ?? ''} onChangeText={(v) => setS({ ...s, contact: { ...s.contact, email: v } })} autoCapitalize="none" keyboardType="email-address" error={fe('contact.email')} />
        <TextField label="Address" value={s.contact.address ?? ''} onChangeText={(v) => setS({ ...s, contact: { ...s.contact, address: v } })} />
      </Card>
      <Card title="Tracking" right={!d.pro ? <Pill text="Growth" tone="gold" icon="lock-closed" /> : undefined}>
        <TextField label="Google Analytics 4 ID" placeholder="G-XXXXXXXXXX" value={s.tracking.ga4 ?? ''} editable={d.pro} onChangeText={(v) => setS({ ...s, tracking: { ...s.tracking, ga4: v.toUpperCase().trim() || undefined } })} error={fe('tracking.ga4')} />
        <TextField label="Meta Pixel ID" placeholder="15–16 digits" value={s.tracking.metaPixel ?? ''} editable={d.pro} onChangeText={(v) => setS({ ...s, tracking: { ...s.tracking, metaPixel: v.replace(/\D/g, '') || undefined } })} keyboardType="number-pad" error={fe('tracking.metaPixel')} />
        <Txt variant="caption" color={c.muted}>Tracking loads only after the visitor accepts the cookie banner.</Txt>
      </Card>

      <BottomSheet open={!!ed} onClose={() => setEd(null)} title={ed ? d.meta.find((m) => m.kind === ed.kind)!.label : ''} footer={<Button title="Done" size="md" style={{ flex: 1 }} onPress={() => { if (ed) setSec(ed.id, ed); setEd(null); }} />}>
        {ed && (
          <View style={{ gap: 10 }}>
            <TextField label="Heading" value={ed.heading ?? ''} onChangeText={(v) => setEd({ ...ed, heading: v.slice(0, 80) })} />
            {['hero', 'about', 'lead_form', 'contact'].includes(ed.kind) && <TextField label="Text" value={ed.text ?? ''} onChangeText={(v) => setEd({ ...ed, text: v.slice(0, 600) })} multiline />}
            {['hero', 'lead_form'].includes(ed.kind) && <TextField label="Button text" value={ed.cta ?? ''} onChangeText={(v) => setEd({ ...ed, cta: v.slice(0, 30) })} />}
            {(ed.kind === 'faq' || ed.kind === 'testimonials') && (
              <>
                {(ed.items ?? []).map((it, i) => (
                  <Card key={i}>
                    <TextField label={ed.kind === 'faq' ? 'Question' : 'Student name'} value={it.q} onChangeText={(v) => setEd({ ...ed, items: ed.items!.map((x, j) => (j === i ? { ...x, q: v } : x)) })} />
                    <TextField label={ed.kind === 'faq' ? 'Answer' : 'What they said (real words only)'} value={it.a} onChangeText={(v) => setEd({ ...ed, items: ed.items!.map((x, j) => (j === i ? { ...x, a: v } : x)) })} multiline />
                    <Button title="Remove" size="md" variant="outline" onPress={() => setEd({ ...ed, items: ed.items!.filter((_, j) => j !== i) })} />
                  </Card>
                ))}
                <Button title={ed.kind === 'faq' ? 'Add question' : 'Add story'} iconLeft="add" size="md" variant="outline" onPress={() => setEd({ ...ed, items: [...(ed.items ?? []), { q: '', a: '' }] })} />
              </>
            )}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
