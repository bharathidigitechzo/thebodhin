/**
 * Appear: content fades up into place when it first mounts. Items that mount together (a list of cards)
 * are staggered automatically (40 ms apart, max ~320 ms), so lists "deal in" without passing indexes.
 * transform + opacity only, 260 ms; skipped entirely with reduce-motion.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import { useReduceMotion } from './motion';

let batchStart = 0;
let batchCount = 0;
function nextDelay() {
  const now = Date.now();
  if (now - batchStart > 350) { batchStart = now; batchCount = 0; }
  return Math.min(8, batchCount++) * 40;
}

export function Appear({ children, style, distance = 14 }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; distance?: number }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration: 260, delay: nextDelay(), easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, v]);
  return (
    <Animated.View style={[style as ViewStyle, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}
