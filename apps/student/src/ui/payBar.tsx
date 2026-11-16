/** Small pay-and-confirm block for webinars, 1:1 sessions and digital products (direct to the academy). */
import React, { useState } from 'react';
import { View } from 'react-native';
import type { PaymentMethod } from '@/core/catalog';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';
import { Chip } from './kit';
import { inr, shared } from './section';

export function PayBar({ price, academy, label, busy, disabled, onPay }: { price: number; academy: string; label: string; busy?: boolean; disabled?: boolean; onPay: (m: PaymentMethod) => void }) {
  const { c } = useTheme();
  const [m, setM] = useState<PaymentMethod>('upi');
  return (
    <View style={{ gap: 8 }}>
      {price > 0 && (
        <>
          <View style={shared.chips}>
            {(['upi', 'card', 'netbanking'] as PaymentMethod[]).map((x) => <Chip key={x} label={x === 'upi' ? 'UPI' : x === 'card' ? 'Card' : 'Net banking'} active={m === x} onPress={() => setM(x)} />)}
          </View>
          <Txt variant="caption" color={c.muted}>Paid directly to {academy}. They send the GST invoice and handle refunds.</Txt>
        </>
      )}
      <Button title={busy ? 'Processing…' : price > 0 ? `${label} · ${inr(price)}` : label} iconRight={price > 0 ? 'lock-closed' : undefined} loading={busy} disabled={disabled} onPress={() => onPay(m)} />
    </View>
  );
}
