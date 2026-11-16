/** Error / success feedback that users feel and see: a short shake plus a haptic when something is wrong. */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { haptic, type HapticKind } from './haptics';
import { useReduceMotion } from './motion';

/** Returns an animated style; shakes left-right (~320 ms) whenever `trigger` becomes a new truthy value. */
export function useShake(trigger: unknown, kind: HapticKind | null = 'error') {
  const x = useRef(new Animated.Value(0)).current;
  const prev = useRef<unknown>(null);
  const reduce = useReduceMotion();
  useEffect(() => {
    if (!trigger) { prev.current = null; return; }
    if (trigger === prev.current) return;
    prev.current = trigger;
    if (kind) haptic(kind);
    if (reduce) return;
    const step = (to: number, d = 50) => Animated.timing(x, { toValue: to, duration: d, easing: Easing.out(Easing.quad), useNativeDriver: true });
    Animated.sequence([step(-9), step(9), step(-6), step(6), step(-3), step(0, 70)]).start();
  }, [trigger, kind, reduce, x]);
  return { transform: [{ translateX: x }] };
}

/** Fire a haptic once each time `value` changes to a new truthy value (e.g. a success message). */
export function useHapticOn(value: unknown, kind: HapticKind) {
  const prev = useRef<unknown>(null);
  useEffect(() => {
    if (value && value !== prev.current) haptic(kind);
    prev.current = value || null;
  }, [value, kind]);
}
