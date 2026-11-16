/**
 * Success moment: the icon springs in, a ring pulses out, a small confetti burst, and one success haptic.
 * Used for: payment done / enrolled, course completed, certificate earned, course submitted, class joined.
 * transform + opacity only; with reduce-motion the icon simply appears (haptic still fires).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { haptic } from './haptics';
import { useReduceMotion } from './motion';

const COLORS = ['#F2B705', '#12407F', '#E5383B', '#2E9E6A', '#7C5CFF', '#FF8A3D'];

export function Celebrate({ icon = 'checkmark-circle', size = 72, tone = 'success', confetti = true }: { icon?: keyof typeof Ionicons.glyphMap; size?: number; tone?: 'success' | 'gold'; confetti?: boolean }) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const bits = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
    const d = 70 + (i * 37) % 50;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 10, r: (i * 47) % 180, col: COLORS[i % COLORS.length], w: i % 3 ? 7 : 5, h: i % 3 ? 11 : 6 };
  }), []);

  useEffect(() => {
    haptic('success');
    if (reduce) return;
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [reduce, pop, ring, burst]);

  const fg = tone === 'gold' ? '#B98900' : c.success;
  const bg = tone === 'gold' ? '#FFF4CC' : c.successBg;
  const box = size + 48;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="image" accessibilityLabel="Success">
      {!reduce && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: box, borderWidth: 3, borderColor: fg, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }] }]} />
      )}
      {!reduce && confetti && bits.map((b, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute', width: b.w, height: b.h, borderRadius: 2, backgroundColor: b.col,
            opacity: burst.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, b.x] }) },
              { translateY: burst.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, b.y, b.y + 24] }) },
              { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.r + 180}deg`] }) },
            ],
          }}
        />
      ))}
      <Animated.View style={{ width: size + 28, height: size + 28, borderRadius: size, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }], opacity: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }) }}>
        <Ionicons name={icon} size={size} color={fg} />
      </Animated.View>
    </View>
  );
}
