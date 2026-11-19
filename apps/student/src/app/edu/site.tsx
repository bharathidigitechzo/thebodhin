/** Website builder: sections on/off, order (Growth), text, SEO, contact, GA4 / Meta Pixel. Live preview link. */
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { workspaceApi } from '@/api/client';
import { siteApi } from '@/api/growth';
import type { Site, SiteSection } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, ToggleRow, shared } from '@/ui/section';
import { pickImage } from '@/ui/pickMedia';

const PRIMARY_COLORS = ['#0B3B73', '#0F6E5A', '#6D28D9', '#B91C1C', '#0E7490', '#1F2937', '#9D174D', '#14532D'];
const ACCENT_COLORS = ['#D99A1E', '#E8833A', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#EAB308', '#F97316'];

export default function SiteBuilder() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(siteApi.get);
  const a = useAct();
  const [s, setS] = useState<Site | null>(null);
  const [ed, setEd] = useState<SiteSection | null>(null);
  const [copied, setCopied] = useState(false);

  // Unified Academy Branding state
  const [brand, setBrand] = useState({
    displayName: '',
    tagline: '',
    primary: PRIMARY_COLORS[0],
    accent: ACCENT_COLORS[0],
    logoUrl: '',
  });

  useEffect(() => {
    if (d) {
      setS(d.site);
      const br = d.ctx.tenant.branding;
      setBrand({
        displayName: br?.displayName || '',
        tagline: br?.tagline || '',
        primary: br?.primary || PRIMARY_COLORS[0],
        accent: br?.accent || ACCENT_COLORS[0],
        logoUrl: br?.logoUrl || '',
      });
    }
  }, [d]);

  if (!d || !s) return <Page title="Website" err={err} />;
  const owner = d.ctx.role === 'owner';
  const errs = siteApi.errors(userId, s);
  const fe = (f: string) => errs.find((e) => e.field === f)?.msg;
  const setSec = (id: string, patch: Partial<SiteSection>) => setS({ ...s, sections: s.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const move = (i: number, dir: -1 | 1) => { const arr = [...s.sections]; const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; setS({ ...s, sections: arr }); };

  const heroSec = s.sections.find((x) => x.kind === 'hero');
  const aboutSec = s.sections.find((x) => x.kind === 'about');

  const origBrand = d.ctx.tenant.branding;
  const dirty =
    JSON.stringify(s) !== JSON.stringify(d.site) ||
    brand.displayName !== (origBrand?.displayName || '') ||
    brand.tagline !== (origBrand?.tagline || '') ||
    brand.primary !== (origBrand?.primary || PRIMARY_COLORS[0]) ||
    brand.accent !== (origBrand?.accent || ACCENT_COLORS[0]) ||
    brand.logoUrl !== (origBrand?.logoUrl || '');

  const slug = d.ctx.tenant.slug;
  const isVercelOrLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.endsWith('.vercel.app'));
  const liveStorefrontUrl = isVercelOrLocal ? `${window.location.origin}/site/${slug}` : `https://${slug}.thebodhin.com`;

  const copyUrl = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(liveStorefrontUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePickLogo = async () => {
    const res = await pickImage();
    if (res?.uri) {
      setBrand((prev) => ({ ...prev, logoUrl: res.uri }));
    }
  };

  return (
    <Page
      title="Storefront & Website Control"
      sub={d.ctx.host}
      fallback="/educator/home"
      footer={
        <>
          <Button
            title="Preview Live Site"
            variant="outline"
            size="md"
            iconLeft="eye-outline"
            onPress={() => router.push({ pathname: '/site/[slug]', params: { slug } })}
          />
          <Button
            title={dirty ? 'Save & publish changes' : 'Saved'}
            size="md"
            style={{ flex: 1, backgroundColor: dirty ? brand.accent : undefined }}
            disabled={!owner || !dirty}
            onPress={async () => {
              if (
                await a.run(async () => {
                  await workspaceApi.saveBranding(userId, {
                    displayName: brand.displayName,
                    tagline: brand.tagline,
                    primary: brand.primary,
                    accent: brand.accent,
                    logoUrl: brand.logoUrl,
                  });
                  await siteApi.save(userId, s);
                }, 'Published! All updates are live on your storefront.')
              ) {
                load();
              }
            }}
          />
        </>
      }
    >
      {a.msg && !dirty && <Banner tone="success" text={a.msg} />}
      {a.fe && <Banner text={a.fe.msg} />}

      {/* 1. Live Storefront Link & Actions */}
      <Card title="Live Storefront Link">
        <View style={{ backgroundColor: c.surfaceMuted, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border }}>
          <Txt variant="caption" color={c.muted}>Your public learner-facing website is live at:</Txt>
          <Txt variant="bodyStrong" color={c.primary} numberOfLines={1}>{liveStorefrontUrl}</Txt>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <Button
              title="Open Storefront ↗"
              size="md"
              style={{ backgroundColor: brand.primary }}
              onPress={() => router.push({ pathname: '/site/[slug]', params: { slug } })}
            />
            <Button
              title={copied ? 'Link Copied! ✓' : 'Copy Storefront Link 📋'}
              size="md"
              variant="outline"
              onPress={copyUrl}
            />
          </View>
        </View>
      </Card>

      {/* 2. Academy Branding & Logo */}
      <Card title="Academy Identity & Branding">
        <TextField
          label="Academy Name"
          value={brand.displayName}
          onChangeText={(v) => setBrand({ ...brand, displayName: v })}
          hint="Learners see this across your website, header, and certificates."
        />
        <TextField
          label="Tagline / Mission"
          value={brand.tagline}
          onChangeText={(v) => setBrand({ ...brand, tagline: v })}
          hint="e.g. Master Practical Coding & AI in Tamil & English"
        />

        {/* Logo Upload */}
        <View style={{ gap: 8, marginTop: 6 }}>
          <Txt variant="label">Academy Logo</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Avatar uri={brand.logoUrl || undefined} name={brand.displayName} size={64} />
            <View style={{ gap: 8, flex: 1 }}>
              <Button title="Upload Logo Image" iconLeft="camera-outline" size="md" variant="outline" onPress={handlePickLogo} />
              {brand.logoUrl ? (
                <Pressable onPress={() => setBrand({ ...brand, logoUrl: '' })} hitSlop={6}>
                  <Txt variant="caption" color={c.danger}>Remove logo (use initial badge)</Txt>
                </Pressable>
              ) : (
                <Txt variant="caption" color={c.muted}>Square PNG/JPG recommended</Txt>
              )}
            </View>
          </View>
        </View>

        {/* Primary Color Picker */}
        <View style={{ gap: 8, marginTop: 12 }}>
          <Txt variant="label">Main Brand Color</Txt>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {PRIMARY_COLORS.map((hex) => {
              const active = brand.primary.toLowerCase() === hex.toLowerCase();
              return (
                <Pressable
                  key={hex}
                  onPress={() => setBrand({ ...brand, primary: hex })}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: hex,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: active ? 3 : 1,
                    borderColor: active ? '#fff' : c.border,
                    shadowColor: '#000',
                    shadowOpacity: active ? 0.25 : 0,
                    shadowRadius: 4,
                  }}
                  accessibilityLabel={`Pick color ${hex}`}
                >
                  {active && <Ionicons name="checkmark" size={20} color="#fff" />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Accent Color Picker */}
        <View style={{ gap: 8, marginTop: 12 }}>
          <Txt variant="label">Accent Highlight Color</Txt>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {ACCENT_COLORS.map((hex) => {
              const active = brand.accent.toLowerCase() === hex.toLowerCase();
              return (
                <Pressable
                  key={hex}
                  onPress={() => setBrand({ ...brand, accent: hex })}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: hex,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: active ? 3 : 1,
                    borderColor: active ? '#fff' : c.border,
                  }}
                  accessibilityLabel={`Pick accent ${hex}`}
                >
                  {active && <Ionicons name="checkmark" size={20} color="#fff" />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      {/* 3. Hero Banner Section */}
      <Card title="Hero Banner (Main Top Section)">
        {heroSec && (
          <View style={{ gap: 10 }}>
            <TextField
              label="Hero Headline"
              value={heroSec.heading ?? ''}
              onChangeText={(v) => setSec('hero', { heading: v.slice(0, 120) })}
              hint="The main promise learners see when they open your site."
            />
            <TextField
              label="Hero Subtitle / Description"
              value={heroSec.text ?? ''}
              onChangeText={(v) => setSec('hero', { text: v.slice(0, 600) })}
              multiline
              hint="Describe your curriculum, approach, and why they should join."
            />
            <TextField
              label="Call to Action Button Text"
              value={heroSec.cta ?? 'Explore courses'}
              onChangeText={(v) => setSec('hero', { cta: v.slice(0, 30) })}
            />
          </View>
        )}
      </Card>

      {/* 4. Courses on Storefront */}
      <Card
        title="Courses on Storefront"
        right={
          <Txt variant="caption" color={c.primary} style={{ fontWeight: '600' }}>
            {(s.selectedCourseIds ?? (d.courses ?? []).map((x: any) => x.id)).length} / {(d.courses ?? []).length} Shown
          </Txt>
        }
      >
        <Txt color={c.inkSoft} style={{ fontSize: 14 }}>
          Select which of your existing courses appear on your public website and marketplace.
        </Txt>

        <View style={{ flexDirection: 'row', gap: 16, marginVertical: 4 }}>
          <Pressable
            onPress={() => setS({ ...s, selectedCourseIds: (d.courses ?? []).map((x: any) => x.id) })}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Txt variant="label" color={c.primary} style={{ textDecorationLine: 'underline' }}>Select All</Txt>
          </Pressable>
          <Pressable
            onPress={() => setS({ ...s, selectedCourseIds: [] })}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Txt variant="label" color={c.muted} style={{ textDecorationLine: 'underline' }}>Clear All</Txt>
          </Pressable>
        </View>

        <View style={{ gap: 8, marginTop: 6 }}>
          {(d.courses ?? []).map((co: any) => {
            const allIds = (d.courses ?? []).map((x: any) => x.id);
            const sel = s.selectedCourseIds ?? allIds;
            const checked = sel.includes(co.id);
            return (
              <Pressable
                key={co.id}
                onPress={() => {
                  const next = checked ? sel.filter((x: string) => x !== co.id) : [...sel, co.id];
                  setS({ ...s, selectedCourseIds: next });
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: checked ? c.primary : c.border,
                  backgroundColor: checked ? c.primarySoft : c.surface,
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{co.title}</Txt>
                  {co.subtitle ? <Txt variant="caption" color={c.muted} numberOfLines={1}>{co.subtitle}</Txt> : null}
                  <Txt variant="label" color={c.primary} style={{ fontSize: 13, marginTop: 2 }}>
                    {co.priceInr ? `₹${co.priceInr.toLocaleString('en-IN')}` : 'Free'}
                  </Txt>
                </View>
                <Switch
                  value={checked}
                  onValueChange={(val) => {
                    const next = val ? [...sel, co.id] : sel.filter((x: string) => x !== co.id);
                    setS({ ...s, selectedCourseIds: next });
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* 5. About The Educator */}
      <Card title="About The Educator / Academy">
        {aboutSec && (
          <View style={{ gap: 10 }}>
            <TextField
              label="Section Heading"
              value={aboutSec.heading ?? 'About'}
              onChangeText={(v) => setSec('about', { heading: v.slice(0, 80) })}
            />
            <TextField
              label="Educator Bio / Background Story"
              value={aboutSec.text ?? ''}
              onChangeText={(v) => setSec('about', { text: v.slice(0, 2500) })}
              multiline
              hint="Share your experience, achievements, and teaching philosophy (up to 2,500 characters)."
            />
          </View>
        )}
      </Card>

      {/* 5. Contact & Social Information */}
      <Card title="Direct Contact Details">
        <TextField
          label="Phone Number"
          prefix="+91"
          value={s.contact.phone ?? ''}
          onChangeText={(v) => setS({ ...s, contact: { ...s.contact, phone: v.replace(/\D/g, '').slice(0, 10) } })}
          keyboardType="phone-pad"
          error={fe('contact.phone')}
        />
        <TextField
          label="WhatsApp Number (Direct Chat Link on Site)"
          prefix="+91"
          value={s.contact.whatsapp ?? ''}
          onChangeText={(v) => setS({ ...s, contact: { ...s.contact, whatsapp: v.replace(/\D/g, '').slice(0, 10) } })}
          keyboardType="phone-pad"
          hint="Enables 1-tap WhatsApp chat button for prospective learners."
        />
        <TextField
          label="Support Email"
          value={s.contact.email ?? ''}
          onChangeText={(v) => setS({ ...s, contact: { ...s.contact, email: v } })}
          autoCapitalize="none"
          keyboardType="email-address"
          error={fe('contact.email')}
        />
        <TextField
          label="Office / Academy Address (Optional)"
          value={s.contact.address ?? ''}
          onChangeText={(v) => setS({ ...s, contact: { ...s.contact, address: v } })}
        />
      </Card>

      {/* 6. Layout Style & Publishing */}
      <Card title="Design Template & Visibility">
        <View style={shared.chips}>
          {(['classic', 'bold', 'minimal'] as const).map((t) => (
            <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} active={s.template === t} onPress={() => setS({ ...s, template: t })} />
          ))}
        </View>
        <ToggleRow
          title="Site is Published & Public"
          sub={s.published ? 'Anyone with your link can view courses & enroll' : 'Site is in draft mode; visible only to you'}
          value={s.published}
          onChange={(v) => setS({ ...s, published: v })}
        />
      </Card>

      {/* 7. Storefront Sections Management */}
      <Card title="All Sections & Order">
        {s.sections.map((sec, i) => {
          const m = d.meta.find((x) => x.kind === sec.kind)!;
          return (
            <View key={sec.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, opacity: m.locked ? 0.55 : 1 }}>
              <Ionicons name={m.icon as never} size={22} color={brand.primary} />
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => !m.locked && setEd({ ...sec })} accessibilityRole="button" accessibilityLabel={`Edit ${m.label}`}>
                <Txt variant="label" numberOfLines={1}>{m.label}</Txt>
                <Txt variant="caption" color={c.muted} numberOfLines={1}>{m.locked ? 'Needs a higher plan' : sec.heading || 'Tap to edit content'}</Txt>
              </Pressable>
              {d.pro && <Pressable onPress={() => move(i, -1)} hitSlop={6} accessibilityLabel={`Move ${m.label} up`}><Ionicons name="chevron-up" size={22} color={c.muted} /></Pressable>}
              {d.pro && <Pressable onPress={() => move(i, 1)} hitSlop={6} accessibilityLabel={`Move ${m.label} down`}><Ionicons name="chevron-down" size={22} color={c.muted} /></Pressable>}
              {m.locked ? <Pill text="Locked" tone="gold" icon="lock-closed" /> : <Switch value={sec.visible} onValueChange={(v) => setSec(sec.id, { visible: v })} accessibilityLabel={`Show ${m.label}`} />}
            </View>
          );
        })}
        {fe('sections') && <Banner text={fe('sections')!} />}
      </Card>

      {/* 8. Google search (SEO) */}
      <Card title="Google Search (SEO)">
        <TextField label="Page Title" value={s.seo.title} onChangeText={(v) => setS({ ...s, seo: { ...s.seo, title: v } })} error={fe('seo.title')} hint={`${s.seo.title.length}/60`} />
        <TextField label="Description" value={s.seo.description} onChangeText={(v) => setS({ ...s, seo: { ...s.seo, description: v } })} multiline error={fe('seo.description')} hint={`${s.seo.description.length}/160`} />
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, gap: 2 }}>
          <Txt variant="caption" color={c.success}>{d.ctx.host}</Txt>
          <Txt variant="bodyStrong" color={c.info} numberOfLines={1}>{s.seo.title}</Txt>
          <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>{s.seo.description}</Txt>
        </View>
      </Card>

      {/* 9. Tracking (Analytics & Ads) */}
      <Card title="Marketing & Analytics" right={!d.pro ? <Pill text="Growth" tone="gold" icon="lock-closed" /> : undefined}>
        <TextField label="Google Analytics 4 ID" placeholder="G-XXXXXXXXXX" value={s.tracking.ga4 ?? ''} editable={d.pro} onChangeText={(v) => setS({ ...s, tracking: { ...s.tracking, ga4: v.toUpperCase().trim() || undefined } })} error={fe('tracking.ga4')} />
        <TextField label="Meta Pixel ID" placeholder="15–16 digits" value={s.tracking.metaPixel ?? ''} editable={d.pro} onChangeText={(v) => setS({ ...s, tracking: { ...s.tracking, metaPixel: v.replace(/\D/g, '') || undefined } })} keyboardType="number-pad" error={fe('tracking.metaPixel')} />
        <Txt variant="caption" color={c.muted}>Tracking loads after visitors accept the privacy cookie banner.</Txt>
      </Card>

      {/* Section Edit Bottom Sheet (FAQ, Testimonials, etc.) */}
      <BottomSheet open={!!ed} onClose={() => setEd(null)} title={ed ? d.meta.find((m) => m.kind === ed.kind)!.label : ''} footer={<Button title="Done" size="md" style={{ flex: 1 }} onPress={() => { if (ed) setSec(ed.id, ed); setEd(null); }} />}>
        {ed && (
          <View style={{ gap: 10 }}>
            <TextField label="Heading" value={ed.heading ?? ''} onChangeText={(v) => setEd({ ...ed, heading: v.slice(0, 120) })} />
            {['hero', 'about', 'lead_form', 'contact'].includes(ed.kind) && <TextField label="Text" value={ed.text ?? ''} onChangeText={(v) => setEd({ ...ed, text: v.slice(0, 2500) })} multiline />}
            {['hero', 'lead_form'].includes(ed.kind) && <TextField label="Button text" value={ed.cta ?? ''} onChangeText={(v) => setEd({ ...ed, cta: v.slice(0, 30) })} />}
            {(ed.kind === 'faq' || ed.kind === 'testimonials') && (
              <>
                {(ed.items ?? []).map((it, i) => (
                  <Card key={i}>
                    <TextField label={ed.kind === 'faq' ? 'Question' : 'Student name'} value={it.q} onChangeText={(v) => setEd({ ...ed, items: ed.items!.map((x, j) => (j === i ? { ...x, q: v } : x)) })} />
                    <TextField label={ed.kind === 'faq' ? 'Answer' : 'Student review / feedback'} value={it.a} onChangeText={(v) => setEd({ ...ed, items: ed.items!.map((x, j) => (j === i ? { ...x, a: v } : x)) })} multiline />
                    <Button title="Remove item" size="md" variant="outline" onPress={() => setEd({ ...ed, items: ed.items!.filter((_, j) => j !== i) })} />
                  </Card>
                ))}
                <Button title={ed.kind === 'faq' ? '+ Add question' : '+ Add student review'} iconLeft="add" size="md" variant="outline" onPress={() => setEd({ ...ed, items: [...(ed.items ?? []), { q: '', a: '' }] })} />
              </>
            )}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
