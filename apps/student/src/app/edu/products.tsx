/** Digital products: sell eBooks, notes, templates, question banks without a course. Uses plan storage. */
import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import { productsApi } from '@/api/growth';
import { PRODUCT_KINDS, type ProductKind } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, Stat, ToggleRow, inr, shared } from '@/ui/section';

const blank = () => ({ id: undefined as string | undefined, title: '', description: '', kind: 'notes' as ProductKind, files: [] as { name: string; sizeMb: number }[], downloadLimit: 5, publish: true });

export default function Products() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(productsApi.list);
  const a = useAct();
  const [f, setF] = useState<ReturnType<typeof blank> | null>(null);
  const [price, setPrice] = useState('199');
  const owner = d?.ctx.role === 'owner';
  // POC: a picked file is simulated; real app uses the document picker + resumable upload to storage.
  const addFile = () => f && setF({ ...f, files: [...f.files, { name: `${(f.title || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${f.files.length + 1}.pdf`, sizeMb: 1.5 }] });
  return (
    <Page title="Digital products" sub="eBooks, notes, templates" err={err} footer={d && <Button title="New product" iconLeft="add" size="md" style={{ flex: 1 }} disabled={!owner} onPress={() => { setF(blank()); setPrice('199'); a.setFe(null); }} />}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          <View style={shared.row}>
            <Stat v={String(d.rows.filter((p) => p.status === 'published').length)} l="On sale" />
            <Stat v={String(d.rows.reduce((s, p) => s + p.sales, 0))} l="Sold" />
            <Stat v={inr(d.revenue)} l="Revenue (app)" />
          </View>
          {d.rows.length === 0 && <Card><Txt color={c.muted} center>Sell your notes or eBook — buyers download from their Bodhin app.</Txt></Card>}
          {d.rows.map((p) => (
            <Card key={p.id} title={PRODUCT_KINDS.find((k) => k.id === p.kind)!.label} right={<Pill text={p.status === 'published' ? 'On sale' : 'Draft'} tone={p.status === 'published' ? 'success' : 'warning'} />}>
              <Txt variant="bodyStrong">{p.title}</Txt>
              <Txt variant="caption" color={c.muted}>{p.priceInr ? inr(p.priceInr) : 'Free'} · {p.files.length} file{p.files.length === 1 ? '' : 's'} · {p.sales} sold</Txt>
              <View style={shared.row}>
                <Button title="Share" size="md" variant="outline" iconLeft="share-social-outline" style={{ flex: 1 }} onPress={async () => { try { await Share.share({ message: `${p.title}: https://${d.ctx.host}/product/${p.id}` }); } catch { /* cancelled */ } }} />
                <Button title="View" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })} />
                {owner && <Button title="Edit" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setF({ id: p.id, title: p.title, description: p.description, kind: p.kind, files: [...p.files], downloadLimit: p.downloadLimit, publish: p.status === 'published' }); setPrice(String(p.priceInr)); a.setFe(null); }} />}
              </View>
            </Card>
          ))}
        </>
      )}
      <BottomSheet open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit product' : 'New product'} footer={<>
        {f?.id && <Button title="Archive" variant="outline" size="md" onPress={async () => { if (await a.run(() => productsApi.archive(userId, f.id!), 'Archived. Buyers keep their downloads.')) { setF(null); load(); } }} />}
        <Button title={f?.publish ? 'Publish' : 'Save draft'} size="md" style={{ flex: 1 }} onPress={async () => { if (f && (await a.run(() => productsApi.save(userId, { ...f, priceInr: Number(price) || 0 }), f.publish ? 'On sale now.' : 'Draft saved.'))) { setF(null); load(); } }} />
      </>}>
        {f && (
          <View style={{ gap: 10 }}>
            <View style={shared.chips}>{PRODUCT_KINDS.map((k) => <Chip key={k.id} label={k.label} icon={k.icon as never} active={f.kind === k.id} onPress={() => setF({ ...f, kind: k.id })} />)}</View>
            <TextField label="Title" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} error={a.err('title')} />
            <TextField label="Description" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline />
            <TextField label="Price (₹, 0 = free)" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" error={a.err('price')} />
            <Txt variant="label">Files</Txt>
            {f.files.map((fl, i) => (
              <View key={fl.name + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt style={{ flex: 1 }} numberOfLines={1}>{fl.name} · {fl.sizeMb} MB</Txt>
                <Button title="Remove" size="md" variant="outline" onPress={() => setF({ ...f, files: f.files.filter((_, j) => j !== i) })} />
              </View>
            ))}
            <Button title="Add file" iconLeft="cloud-upload-outline" size="md" variant="outline" onPress={addFile} />
            {a.err('files') && <Banner text={a.err('files')!} />}
            <Txt variant="label">Downloads per buyer</Txt>
            <View style={shared.chips}>{[3, 5, 10].map((n) => <Chip key={n} label={`${n}`} active={f.downloadLimit === n} onPress={() => setF({ ...f, downloadLimit: n })} />)}</View>
            <ToggleRow title="Publish now" value={f.publish} onChange={(v) => setF({ ...f, publish: v })} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
