/** Tutor's public website (tutorslug.thebodhin.com): rendered from the builder sections. */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { siteApi } from '@/api/growth';
import { educatorMembership, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Banner } from '@/ui/misc';
import { Grid, useLayout } from '@/ui/responsive';
import { useAct, useData, when } from '@/ui/grow';
import { Card, inr } from '@/ui/section';
import { Avatar } from '@/ui/kit';
import { CookieConsent } from '@/ui/cookieConsent';
import { Seo } from '@/ui/seo';

export default function TutorSite() {
  const { c, tenant } = useTheme();
  const { session } = useAuth();
  const { isDesktop } = useLayout();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const activeSlug = slug || tenant?.slug || 'rajesh';
  const { d, err } = useData(() => siteApi.render(activeSlug), [activeSlug]);
  const a = useAct();
  const [lead, setLead] = useState({ name: '', phone: '', hp: '' });

  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ivory, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Banner text={err?.message || 'Loading academy site...'} />
      </View>
    );
  }

  const br = d.t.branding;
  const bold = d.site.template === 'bold';
  const edu = educatorMembership(session);
  const isOwner = !!session && (
    d.t.ownerUserId === session.user.id ||
    edu?.tenantId === d.t.id ||
    (!!edu && (activeSlug === 'rajesh' ? session.user.email.includes('rajesh') : true))
  );
  const go = (pathname: string, id: string) => router.push({ pathname: pathname as never, params: { id } });
  const H = ({ t }: { t?: string }) => (t ? <Txt variant="heading">{t}</Txt> : null);

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <Seo title={d.site.seo.title} description={d.site.seo.description} path={`/site/${d.t.slug}`} />

      {/* Public Storefront Navbar */}
      <View style={[styles.navHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={[styles.navInner, isDesktop && { maxWidth: 1100 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {br.logoUrl ? (
              <Avatar uri={br.logoUrl} name={br.displayName} size={42} />
            ) : (
              <View style={[styles.logoBadge, { backgroundColor: br.primary }]}>
                <Txt variant="label" color="#fff" style={{ fontWeight: '800', fontSize: 16 }}>{br.displayName.slice(0, 2).toUpperCase()}</Txt>
              </View>
            )}
            <View>
              <Txt variant="bodyStrong" style={{ fontSize: 18, fontWeight: '700' }}>{br.displayName}</Txt>
              {br.tagline ? <Txt variant="caption" color={c.muted} numberOfLines={1}>{br.tagline}</Txt> : null}
            </View>
          </View>

          {/* Student Sign In / Sign Up Controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {session && session.user.id !== d.t.ownerUserId && !edu ? (
              <Button title="My Learning" iconRight="arrow-forward" size="md" onPress={() => router.push('/home')} />
            ) : (
              <>
                <Button title="Sign In" variant="outline" size="md" onPress={() => router.push(`/sign-in?tenant=${d.t.slug}` as any)} />
                <Button title="Sign Up" size="md" style={{ backgroundColor: br.primary }} onPress={() => router.push(`/sign-up?tenant=${d.t.slug}` as any)} />
              </>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && { paddingHorizontal: 32, paddingBottom: 64 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.body, isDesktop && { maxWidth: 1100 }]}>
          {d.site.sections.map((s) => {
            switch (s.kind) {
              case 'hero':
                return (
                  <View key={s.id} style={[styles.hero, { backgroundColor: bold ? br.primary : c.primarySoft }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                      {br.logoUrl ? (
                        <Avatar uri={br.logoUrl} name={br.displayName} size={64} />
                      ) : null}
                      <View style={{ flex: 1, gap: 4 }}>
                        <Txt variant="display" color={bold ? '#fff' : br.primary}>{s.heading}</Txt>
                        {br.tagline ? <Txt variant="bodyStrong" color={bold ? '#ffffffcc' : c.accent}>{br.tagline}</Txt> : null}
                      </View>
                    </View>
                    {!!s.text && <Txt color={bold ? '#ffffffdd' : c.inkSoft} style={{ fontSize: 16, lineHeight: 24 }}>{s.text}</Txt>}
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                      {!!s.cta && <Button title={s.cta} style={{ alignSelf: 'flex-start', backgroundColor: br.accent }} onPress={() => router.push('/explore')} />}
                      <Button title="Enroll Now" variant="outline" size="md" onPress={() => router.push(`/sign-up?tenant=${d.t.slug}` as any)} />
                    </View>
                  </View>
                );
              case 'courses':
                if (!d.courses.length) return null;
                return (
                  <View key={s.id} style={{ gap: 12 }}>
                    <H t={s.heading} />
                    <Grid cols={isDesktop ? 3 : 1} gap={14}>
                        {d.courses.map((co) => (
                          <Pressable key={co.id} onPress={() => go('/course/[id]', co.id)} style={[styles.item, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="link">
                            <View style={{ flex: 1, gap: 6 }}>
                              <Txt variant="bodyStrong" numberOfLines={2}>{co.title}</Txt>
                              {co.subtitle ? <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>{co.subtitle}</Txt> : null}
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
                              <Txt variant="label" color={c.primary}>{co.priceInr ? inr(co.priceInr) : 'Free'}</Txt>
                              <Txt variant="caption" color={c.primary} style={{ fontWeight: '600' }}>View course &rarr;</Txt>
                            </View>
                          </Pressable>
                        ))}
                      </Grid>
                  </View>
                );
              case 'about':
                return (
                  <Card key={s.id}>
                    <H t={s.heading} />
                    <Txt color={c.inkSoft} style={{ fontSize: 15, lineHeight: 24 }}>{s.text}</Txt>
                  </Card>
                );
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
                    {d.site.contact.phone ? <Pressable onPress={() => Linking.openURL(`tel:+91${d.site.contact.phone}`)} style={styles.line} accessibilityRole="link"><Ionicons name="call-outline" size={18} color={c.primary} /><Txt>+91 {d.site.contact.phone}</Txt></Pressable> : null}
                    {d.site.contact.whatsapp ? (
                      <Pressable onPress={() => Linking.openURL(`https://wa.me/91${d.site.contact.whatsapp?.replace(/\D/g, '')}`)} style={styles.line} accessibilityRole="link">
                        <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                        <Txt>WhatsApp: +91 {d.site.contact.whatsapp}</Txt>
                      </Pressable>
                    ) : null}
                    {d.site.contact.email ? <Pressable onPress={() => Linking.openURL(`mailto:${d.site.contact.email}`)} style={styles.line} accessibilityRole="link"><Ionicons name="mail-outline" size={18} color={c.primary} /><Txt>{d.site.contact.email}</Txt></Pressable> : null}
                    {d.site.contact.address ? <View style={styles.line}><Ionicons name="location-outline" size={18} color={c.primary} /><Txt>{d.site.contact.address}</Txt></View> : null}
                  </Card>
                );
              default:
                return null;
            }
          })}
          {!br.hidePoweredBy && <Txt variant="caption" color={c.muted} center style={{ marginTop: 24 }}>Powered by Bodhin</Txt>}
        </View>
      </ScrollView>

      <CookieConsent slug={d.t.slug} tracking={d.site.tracking} academy={br.displayName} />
    </View>
  );
}

const styles = StyleSheet.create({
  ownerBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  navHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  navInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    alignItems: 'center',
  },
  body: {
    width: '100%',
    gap: 20,
  },
  hero: { borderRadius: 24, padding: 24, gap: 14 },
  item: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 4, minHeight: 80 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
});
