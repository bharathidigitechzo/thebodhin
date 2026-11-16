/** Smart board on its own — for a classroom TV/projector, a tablet, or practising before a live class. */
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenTop } from '@/ui/section';
import { SmartBoard } from '@/ui/SmartBoard';
import { useLayout } from '@/ui/responsive';

export default function BoardScreen() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Smart board" sub="Write in any language — it turns neat" fallback="/educator/more" />
        <View style={{ flex: 1, padding: isDesktop ? 20 : 10, paddingTop: 4 }}>
          <SmartBoard />
        </View>
      </SafeAreaView>
    </View>
  );
}
