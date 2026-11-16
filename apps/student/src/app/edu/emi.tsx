/** EMI & fee collection: turn on instalments per course; see who is on track, due soon or overdue. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { emiApi } from '@/api/growth';
import { emiSchedule, type EmiPlan } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, Chip, Pill, ProgressBar } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, KV, Stat, ToggleRow, fmtDay, inr, shared } from '@/ui/section';

type Form = Omit<EmiPlan, 'courseId' | 'tenantId'> & { courseId: string; title: string; price: number };
const ST = { overdue: ['Overdue', 'live'], due_soon: ['Due soon', 'warning'], on_track: ['On track', 'success'], completed: ['Paid in full', 'neutral'] } as const;

export default function Emi() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(emiApi.overview);
  const a = useAct();
  const [f, setF] = useState<Form | null>(null);
  return (
    <Page title="EMI & fee collection" sub="Instalments for bigger courses" err={err}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          <View style={shared.row}>
            <Stat v={inr(d.totals.collected)} l="Collected" />
            <Stat v={inr(d.totals.pending)} l="Still to come" />
            <Stat v={inr(d.totals.overdue)} l="Overdue now" tone={d.totals.overdue ? c.danger : undefined} />
          </View>
          <Card title="Courses">
            {d.courses.length === 0 && <Txt variant="caption" color={c.muted}>EMI is for paid courses of ₹2,000 or more.</Txt>}
            {d.courses.map(({ co, plan }) => (
              <View key={co.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="label" numberOfLines={1}>{co.title}</Txt>
                  <Txt variant="caption" color={c.muted}>{inr(co.priceInr)} · {plan?.enabled ? `${plan.parts} parts every ${plan.everyDays} days${plan.feePct ? ` · +${plan.feePct}%` : ' · no-cost'}` : 'Full payment only'}</Txt>
                </View>
                <Button title={plan?.enabled ? 'Edit' : 'Turn on'} size="md" variant="outline" disabled={d.ctx.role !== 'owner'} onPress={() => { setF({ courseId: co.id, title: co.title, price: co.priceInr, parts: plan?.parts ?? 3, everyDays: plan?.everyDays ?? 30, feePct: plan?.feePct ?? 0, graceDays: plan?.graceDays ?? 7, enabled: true }); a.setFe(null); }} />
              </View>
            ))}
          </Card>
          <Txt variant="label">Students on EMI</Txt>
          {d.rows.length === 0 && <Card><Txt color={c.muted} center>No one is paying in instalments yet.</Txt></Card>}
          {d.rows.map(({ c: k, name, course, st }) => (
            <Card key={k.id} title={course} right={<Pill text={st.state === 'overdue' ? `${ST.overdue[0]} ${st.daysOverdue}d` : ST[st.state][0]} tone={ST[st.state][1]} />}>
              <Txt variant="bodyStrong">{name}</Txt>
              <ProgressBar pct={(st.paid / k.totalInr) * 100} color={st.state === 'overdue' ? c.danger : c.primary} />
              <KV k="Paid" v={`${inr(st.paid)} of ${inr(k.totalInr)} · ${k.instalments.filter((i) => i.paidAt).length}/${k.instalments.length}`} />
              {st.next && <KV k="Next" v={`${inr(st.next.amountInr)} on ${fmtDay(st.next.dueAt)}`} />}
              {st.accessPaused && <Txt variant="caption" color={c.danger}>Course access is paused until they pay. Their progress is kept.</Txt>}
            </Card>
          ))}
          <Txt variant="caption" color={c.muted}>Reminders go 3 days before and 1 day after each due date when the “Instalment” automations are on. Payments go to your own gateway; each instalment gets its own invoice.</Txt>
        </>
      )}
      <BottomSheet open={!!f} onClose={() => setF(null)} title={f?.title ?? ''} footer={<Button title="Save" size="md" style={{ flex: 1 }} onPress={async () => { if (f && (await a.run(() => emiApi.savePlan(userId, f.courseId, f), f.enabled ? 'EMI is live on checkout.' : 'EMI turned off. Existing plans continue.'))) { setF(null); load(); } }} />}>
        {f && (
          <View style={{ gap: 10 }}>
            <ToggleRow title="Offer EMI on this course" value={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} />
            <Txt variant="label">Number of parts</Txt>
            <View style={shared.chips}>{([2, 3, 4, 6] as const).map((n) => <Chip key={n} label={`${n} parts`} active={f.parts === n} onPress={() => setF({ ...f, parts: n })} />)}</View>
            <Txt variant="label">Gap between parts</Txt>
            <View style={shared.chips}>{[15, 30, 45].map((n) => <Chip key={n} label={`${n} days`} active={f.everyDays === n} onPress={() => setF({ ...f, everyDays: n })} />)}</View>
            <Txt variant="label">EMI charge</Txt>
            <View style={shared.chips}>{[0, 5, 10].map((n) => <Chip key={n} label={n ? `+${n}%` : 'No-cost'} active={f.feePct === n} onPress={() => setF({ ...f, feePct: n })} />)}</View>
            <Txt variant="label">Pause access when late by</Txt>
            <View style={shared.chips}>{[3, 7, 14].map((n) => <Chip key={n} label={`${n} days`} active={f.graceDays === n} onPress={() => setF({ ...f, graceDays: n })} />)}</View>
            <Card title="Student sees">
              {emiSchedule(f.price, f).map((i) => <KV key={i.n} k={i.n === 1 ? 'At checkout' : `Part ${i.n} · day ${(i.n - 1) * f.everyDays}`} v={inr(i.amountInr)} />)}
            </Card>
            {a.general && <Banner text={a.general} />}
            {a.fe?.field && <Banner text={a.fe.msg} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
