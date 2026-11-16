/** Automations: ready recipes (welcome, class reminder, fee reminder, abandoned checkout...) — switch on, edit text, test. */
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { automationsApi } from '@/api/growth';
import { TEMPLATE_VARS, type Automation, type Channel } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, ago, useAct, useData } from '@/ui/grow';
import { Card, shared } from '@/ui/section';

const CH: { id: Channel; label: string }[] = [{ id: 'both', label: 'Email + push' }, { id: 'email', label: 'Email' }, { id: 'push', label: 'App push' }];

export default function Automations() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(automationsApi.list);
  const a = useAct();
  const [ed, setEd] = useState<Automation | null>(null);
  const prev = ed && d ? automationsApi.preview(d.ctx.tenant.id, ed.subject, ed.body) : null;
  const owner = d?.ctx.role === 'owner';
  return (
    <Page title="Automations" sub="Messages that send themselves" err={err}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {a.general && <Banner text={a.general} />}
          <Txt variant="caption" color={c.muted}>Class, fee and booking messages always go out. Offer-type nudges (abandoned checkout, inactive learner) reach only people who allowed offers. WhatsApp comes later; today these use email and app push.</Txt>
          {d.rows.map(({ a: au, meta }) => (
            <Card key={au.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="bodyStrong">{meta.label}</Txt>
                  <Txt variant="caption" color={c.muted}>{meta.sub}</Txt>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    <Pill text={CH.find((x) => x.id === au.channel)!.label} tone="info" />
                    {!meta.transactional && <Pill text="Marketing" tone="gold" />}
                    {au.sent > 0 && <Pill text={`${au.sent} sent`} tone="success" />}
                  </View>
                </View>
                <Switch value={au.enabled} disabled={!owner} onValueChange={(v) => { a.run(() => automationsApi.toggle(userId, au.id, v), v ? `“${meta.label}” is on.` : `“${meta.label}” is off.`); load(); }} accessibilityLabel={`${meta.label} ${au.enabled ? 'on' : 'off'}`} />
              </View>
              <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>“{au.subject}” — {au.body}</Txt>
              <View style={shared.row}>
                {owner && <Button title="Edit message" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setEd({ ...au }); a.setFe(null); }} />}
                <Button title="Send me a test" size="md" variant="outline" style={{ flex: 1 }} onPress={() => a.run(() => automationsApi.test(userId, au.id), 'Test sent to you — check Notifications.')} />
              </View>
            </Card>
          ))}
          <Card title="Recent messages">
            {d.log.length === 0 && <Txt variant="caption" color={c.muted}>Nothing sent yet.</Txt>}
            {d.log.filter((m) => m.subject !== 'marker').slice(0, 12).map((m) => (
              <View key={m.id} style={{ gap: 1 }}>
                <Txt variant="label" numberOfLines={1}>{m.subject}</Txt>
                <Txt variant="caption" color={c.muted}>{m.channel === 'email' ? 'Email' : 'Push'} → {m.to.name} · {ago(m.at)} · test mode</Txt>
              </View>
            ))}
          </Card>
        </>
      )}
      <BottomSheet open={!!ed} onClose={() => setEd(null)} title="Edit message" footer={<Button title="Save" size="md" style={{ flex: 1 }} onPress={async () => { if (ed && (await a.run(() => automationsApi.save(userId, ed.id, ed), 'Saved.'))) { setEd(null); load(); } }} />}>
        {ed && (
          <View style={{ gap: 10 }}>
            <View style={shared.chips}>{CH.map((x) => <Chip key={x.id} label={x.label} active={ed.channel === x.id} onPress={() => setEd({ ...ed, channel: x.id })} />)}</View>
            <TextField label="Subject / title" value={ed.subject} onChangeText={(v) => setEd({ ...ed, subject: v })} error={a.err('subject')} />
            <TextField label="Message" value={ed.body} onChangeText={(v) => setEd({ ...ed, body: v })} multiline error={a.err('body')} />
            <Txt variant="caption" color={c.muted}>Tap to insert:</Txt>
            <View style={shared.chips}>{TEMPLATE_VARS.map((v) => <Chip key={v} label={`{{${v}}}`} onPress={() => setEd({ ...ed, body: `${ed.body} {{${v}}}` })} />)}</View>
            {prev && (
              <Card title="Preview">
                <Txt variant="bodyStrong">{prev.subject}</Txt>
                <Txt color={c.inkSoft}>{prev.body}</Txt>
                {prev.unknown.length > 0 && <Banner text={`Unknown variable: {{${prev.unknown[0]}}}`} />}
              </Card>
            )}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
