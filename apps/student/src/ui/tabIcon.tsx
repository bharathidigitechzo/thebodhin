/** Bottom-tab icon that pops when its tab becomes active (spring scale + lift). Honours reduce-motion. */
import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReduceMotion } from './motion';

export function TabIcon({ icon, focused, color }: { icon: string; focused: boolean; color: string }) {
  const s = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) { s.setValue(focused ? 1 : 0); return; }
    Animated.spring(s, { toValue: focused ? 1 : 0, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [focused, reduce, s]);
  const scale = s.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const translateY = s.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  return (
    <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
      <Ionicons name={(focused ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap} size={24} color={color} />
    </Animated.View>
  );
}
