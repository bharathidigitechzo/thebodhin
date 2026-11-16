/** Tutor's public website (tutorslug.thebodhin.com): rendered from the builder sections. */
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { siteApi } from '@/api/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Banner } from '@/ui/misc';
import { Grid, useLayout } from '@/ui/responsive';
import { Page, useAct, useData, when } from '@/ui/grow';
import { Card, inr } from '@/ui/section';
import { CookieConsent } from '@/ui/cookieConsent';
import { Seo } from '@/ui/seo';

export default function TutorSite() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { d, err } = useData(() => siteApi.render(slug));
  const a = useAct();
  const [lead, setLead] = useState({ name: '', phone: '', hp: '' });
  if (!d) return <Page title="Academy" err={err} fallback="/home" />;
  const br = d.t.branding;
  const bold = d.site.template === 'bold';
  const go = (pathname: string, id: string) => router.push({ pathname: pathname as never, params: { id } });
  const H = ({ t }: { t?: string }) => (t ? <Txt variant="heading">{t}</Txt> : null);
  return (
    <View style={{ flex: 1 }}>
      <Seo title={d.site.seo.title} description={d.site.seo.description} path={`/site/${d.t.slug}`} />
    <Page title={br.displayName} sub={d.t.customDomain ?? `${d.t.slug}.thebodhin.com`} fallback="/home" wide>
        {d.site.sections.map((s) => {
          switch (s.kind) {
            case 'hero':
              return (
                <View key={s.id} style={[styles.hero, { backgroundColor: bold ? br.primary : c.primarySoft }]}>
                  <Txt variant="display" color={bold ? '#fff' : br.primary}>{s.heading}</Txt>
                  {!!s.text && <Txt color={bold ? '#ffffffdd' : c.inkSoft}>{s.text}</Txt>}
                  {!!s.cta && <Button title={s.cta} style={{ alignSelf: 'flex-start', backgroundColor: br.accent }} onPress={() => router.push('/explore')} />}
                </View>
              );
            case 'courses':
              return d.courses.length ? (
                <View key={s.id} style={{ gap: 8 }}>
                  <H t={s.heading} />
                  <Grid cols={isDesktop ? 3 : 1} gap={10}>
                    {d.courses.map((co) => (
                      <Pressable key={co.id} onPress={() => go('/course/[id]', co.id)} style={[styles.item, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="link">
                        <Txt variant="bodyStrong" numberOfLines={2}>{co.title}</Txt>
                        <Txt variant="caption" color={c.muted}>{co.priceInr ? inr(co.priceInr) : 'Free'}</Txt>
                      </Pressable>
                    ))}
                  </Grid>
                </View>
              ) : null;
            case 'about':
              return <Card key={s.id}><H t={s.heading} /><Txt color={c.inkSoft}>{s.text}</Txt></Card>;
            case 'stats':
              return <Card key={s.id}><H t={s.heading} /><Txt variant="title">{d.stats.students.toLocaleString('en-IN')} learners · {d.stats.courses} courses</Txt></Card>;
            case 'testimonials':
              return (s.items ?? []).length ? <Card key={s.id}><H t={s.heading} />{s.items!.map((it, i) => <View key={i} style={{ gap: 2 }}><Txt color={c.inkSoft}>“{it.a}”</Txt><Txt variant="caption" color={c.muted}>— {it.q}</Txt></View>)}</Card> : null;
            case 'webinars':
              return d.webinars.length ? <Card key={s.id}><H t={s.heading} />{d.webinars.map((w) => <Pressable key={w.id} onPress={() => go('/webinar/[id]', w.id)} accessibilityRole="link"><Txt variant="bodyStrong">{w.title}</Txt><Txt variant="caption" color={c.muted}>{when(w.startsAt)} · {w.priceInr ? inr(w.priceInr) : 'Free'}</Txt></Pressable>)}</Card> : null;
            case 'products':
              return d.products.length ? <Card key={s.id}><H t={s.heading} />{d.products.map((p) => <Pressable key={p.id} onPress={() => go('/product/[id]', p.id)} accessibilityRole="link"><Txt variant="bodyStrong">{p.title}</Txt><Txt variant="caption" color={c.muted}>{p.priceInr ? inr(p.priceInr) : 'Free'}</Txt></Pressable>)}</Card> : null;
            case 'bookings':
              return d.offers.length ? <Card key={s.id}><H t={s.heading} />{d.offers.map((o) => <Button key={o.id} title={`${o.title} · ${o.durationMin} min${o.priceInr ? ` · ${inr(o.priceInr)}` : ''}`} variant="outline" size="md" onPress={() => go('/book/[id]', o.id)} />)}</Card> : null;
            case 'faq':
              return <Card key={s.id}><H t={s.heading} />{(s.items ?? []).map((it, i) => <View key={i} style={{ gap: 2 }}><Txt variant="bodyStrong">{it.q}</Txt><Txt color={c.inkSoft}>{it.a}</Txt></View>)}</Card>;
            case 'lead_form':
              return (
                <Card key={s.id}>
                  <H t={s.heading} />
                  {a.msg ? <Banner tone="success" text={a.msg} /> : (
                    <>
                      <TextField label="Your name" value={lead.name} onChangeText={(v) => setLead({ ...lead, name: v })} error={a.err('name')} />
                      <TextField label="Mobile" prefix="+91" value={lead.phone} onChangeText={(v) => setLead({ ...lead, phone: v.replace(/\D/g, '').slice(0, 10) })} keyboardType="phone-pad" error={a.err('phone')} />
                      {a.general && <Banner text={a.general} />}
                      <Button title={s.cta || 'Request a call back'} onPress={() => a.run(() => siteApi.submitLead(slug, lead), 'Thanks! We’ll call you soon.')} />
                      <Txt variant="caption" color={c.muted}>We use your number only to reply to this enquiry.</Txt>
                    </>
                  )}
                </Card>
              );
            case 'contact':
              return (
                <Card key={s.id}>
                  <H t={s.heading} />
                  {d.site.contact.phone && <Pressable onPress={() => Linking.openURL(`tel:+91${d.site.contact.phone}`)} style={styles.line} accessibilityRole="link"><Ionicons name="call-outline" size={18} color={c.primary} /><Txt>+91 {d.site.contact.phone}</Txt></Pressable>}
                  {d.site.contact.email && <Pressable onPress={() => Linking.openURL(`mailto:${d.site.contact.email}`)} style={styles.line} accessibilityRole="link"><Ionicons name="mail-outline" size={18} color={c.primary} /><Txt>{d.site.contact.email}</Txt></Pressable>}
                  {d.site.contact.address && <View style={styles.line}><Ionicons name="location-outline" size={18} color={c.primary} /><Txt>{d.site.contact.address}</Txt></View>}
                </Card>
              );
            default:
              return null;
          }
        })}
        {!br.hidePoweredBy && <Txt variant="caption" color={c.muted} center>Powered by Bodhin</Txt>}
      </Page>
      <CookieConsent slug={d.t.slug} tracking={d.site.tracking} academy={br.displayName} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, padding: 24, gap: 10 },
  item: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 4, minHeight: 80 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
});
