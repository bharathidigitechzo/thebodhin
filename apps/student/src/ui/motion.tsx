/**
 * Motion kit for the public site. Rules (docs/design/direction.md): transform/opacity only, ≤ 500 ms per step,
 * ease-out entering, and every component shows its final state when the OS "reduce motion" setting is on.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Txt } from './Txt';
import { useTheme } from '@/theme/ThemeProvider';

export const dur = { micro: 140, comp: 260, screen: 360 } as const;
const out = Easing.out(Easing.cubic);
const native = Platform.OS !== 'web';

export function useReduceMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    let on = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => on && setR(v)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setR);
    return () => { on = false; sub?.remove?.(); };
  }, []);
  return r;
}

/** True once the element has entered the viewport (web: IntersectionObserver; native: on mount). */
export function useInView(threshold = 0.2) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const node = ref.current as unknown as Element | null;
    if (Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined' || !node) { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(node);
    return () => io.disconnect();
  }, [seen, threshold]);
  return { ref, seen };
}

/** Fade + rise once when scrolled into view. */
export function Reveal({ children, delay = 0, y = 16, style }: { children: React.ReactNode; delay?: number; y?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const { ref, seen } = useInView();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!seen) return;
    if (reduce) { a.setValue(1); return; }
    Animated.timing(a, { toValue: 1, duration: 320, delay, easing: out, useNativeDriver: native }).start();
  }, [seen, reduce, a, delay]);
  return (
    <Animated.View ref={ref} style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Number that counts up the first time it is seen. */
export function CountUp({ to, format = (n: number) => n.toLocaleString('en-IN'), variant = 'title', color }: { to: number; format?: (n: number) => string; variant?: 'display' | 'title' | 'heading'; color?: string }) {
  const reduce = useReduceMotion();
  const { ref, seen } = useInView(0.5);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduce) { setN(to); return; }
    const start = Date.now(), ms = 900;
    const id = setInterval(() => { const p = Math.min(1, (Date.now() - start) / ms); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p >= 1) clearInterval(id); }, 32);
    return () => clearInterval(id);
  }, [seen, reduce, to]);
  return <View ref={ref}><Txt variant={variant} color={color} accessibilityLabel={format(to)}>{format(seen ? n : 0)}</Txt></View>;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** Hand-drawn gold "chalk" underline that draws itself — the site's signature mark. */
export function ChalkUnderline({ width, color, delay = 300 }: { width: number; color: string; delay?: number }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  const len = width * 1.08;
  useEffect(() => {
    if (reduce) { a.setValue(1); return; }
    Animated.timing(a, { toValue: 1, duration: 480, delay, easing: out, useNativeDriver: false }).start();
  }, [a, reduce, delay, width]);
  if (width <= 0) return null;
  const d = `M2 9 C ${width * 0.25} 2, ${width * 0.45} 13, ${width * 0.7} 6 S ${width - 8} 4, ${width - 2} 8`;
  return (
    <Svg width={width} height={14} style={{ marginTop: -4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AnimatedPath d={d} stroke={color} strokeWidth={4} strokeLinecap="round" fill="none" strokeDasharray={`${len}`} strokeDashoffset={a.interpolate({ inputRange: [0, 1], outputRange: [len, 0] })} />
    </Svg>
  );
}

/** Rotating word (slides up) — screen readers get the full list once. */
export function WordRotator({ words, color, variant = 'display', style, every = 2400, onWidth }: { words: string[]; color: string; variant?: 'display' | 'title'; style?: object; every?: number; onWidth?: (w: number) => void }) {
  const reduce = useReduceMotion();
  const [i, setI] = useState(0);
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce || words.length < 2) return;
    const id = setInterval(() => {
      Animated.timing(a, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: native }).start(() => {
        setI((x) => (x + 1) % words.length);
        a.setValue(0);
        Animated.timing(a, { toValue: 1, duration: 260, easing: out, useNativeDriver: native }).start();
      });
    }, every);
    return () => clearInterval(id);
  }, [reduce, words.length, a, every]);
  return (
    <Animated.View onLayout={(e) => onWidth?.(e.nativeEvent.layout.width)} style={{ alignSelf: 'flex-start', opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }} accessibilityLabel={words.join(', ')}>
      <Txt variant={variant} color={color} style={style}>{words[i]}</Txt>
    </Animated.View>
  );
}

/** Soft pulsing dot (LIVE indicator, status lights). */
export function Pulse({ color, size = 10 }: { color: string; size?: number }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1400, easing: out, useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [a, reduce]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }} />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

/** Children appear one after another, then the sequence restarts (chat bubbles, checklist ticks). */
export function Sequence({ children, step = 900, hold = 2200, style }: { children: React.ReactNode[]; step?: number; hold?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const { ref, seen } = useInView(0.3);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduce) { setN(children.length); return; }
    const t = setTimeout(() => setN((x) => (x >= children.length ? 0 : x + 1)), n >= children.length ? hold : step);
    return () => clearTimeout(t);
  }, [seen, reduce, n, children.length, step, hold]);
  return <View ref={ref} style={style}>{children.map((ch, i) => <Pop key={i} show={i < n}>{ch}</Pop>)}</View>;
}
function Pop({ show, children }: { show: boolean; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: show ? 1 : 0, duration: show ? dur.comp : dur.micro, easing: out, useNativeDriver: native }).start(); }, [show, a]);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>{children}</Animated.View>;
}

/** Endless horizontal ticker. Content is rendered twice and slid by half its width. */
export function Marquee({ children, speed = 28 }: { children: React.ReactNode; speed?: number }) {
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !w) return;
    a.setValue(0);
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: (w / speed) * 1000, easing: Easing.linear, useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [reduce, w, a, speed]);
  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.View style={{ flexDirection: 'row', alignSelf: 'flex-start', transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, -w] }) }] }}>
        <View style={{ flexDirection: 'row' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>{children}</View>
        {!reduce && <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>}
      </Animated.View>
    </View>
  );
}

/** Press feedback: slight scale down (and lift on web hover). */
export function Tap({ children, onPress, style, label, role = 'button', fill }: { children: React.ReactNode; onPress: () => void; style?: StyleProp<ViewStyle>; label: string; role?: 'button' | 'link'; fill?: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  const to = (v: number) => Animated.timing(a, { toValue: v, duration: dur.micro, easing: out, useNativeDriver: native }).start();
  return (
    <Pressable onPress={onPress} onPressIn={() => to(1)} onPressOut={() => to(0)} onHoverIn={() => to(-1)} onHoverOut={() => to(0)} accessibilityRole={role} accessibilityLabel={label} style={fill ? { flex: 1 } : undefined}>
      <Animated.View style={[style, { transform: [{ scale: a.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.015, 1, 0.975] }) }, { translateY: a.interpolate({ inputRange: [-1, 0, 1], outputRange: [-3, 0, 0] }) }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Auto-advancing slides with tappable dots; pauses while pressed. Shows what state it is in (dot + label). */
export function Carousel({ slides, every = 3600, height }: { slides: { label: string; node: React.ReactNode }[]; every?: number; height: number }) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const a = useRef(new Animated.Value(1)).current;
  const go = (n: number) => {
    if (reduce) { setI(n); return; }
    Animated.timing(a, { toValue: 0, duration: dur.micro, useNativeDriver: native }).start(() => { setI(n); Animated.timing(a, { toValue: 1, duration: dur.comp, easing: out, useNativeDriver: native }).start(); });
  };
  useEffect(() => {
    if (reduce || hold) return;
    const id = setTimeout(() => go((i + 1) % slides.length), every);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, hold, reduce, slides.length, every]);
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPressIn={() => setHold(true)} onPressOut={() => setHold(false)} accessibilityLabel={`Product preview: ${slides[i].label}. ${i + 1} of ${slides.length}`}>
        <Animated.View style={{ height, opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>{slides[i].node}</Animated.View>
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        {slides.map((s, k) => (
          <Pressable key={s.label} onPress={() => go(k)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Show ${s.label}`} accessibilityState={{ selected: k === i }} style={{ minHeight: 32, minWidth: 32, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ height: 6, width: k === i ? 22 : 6, borderRadius: 3, backgroundColor: k === i ? c.accent : c.borderStrong }} />
          </Pressable>
        ))}
        <Txt variant="caption" color={c.muted} style={{ marginLeft: 6 }}>{slides[i].label}</Txt>
      </View>
    </View>
  );
}

/** Scroll progress shared from the page frame to the header line. */
export const ScrollCtx = createContext<Animated.Value | null>(null);
export function ScrollProgress({ color }: { color: string }) {
  const v = useContext(ScrollCtx);
  if (!v) return null;
  return <Animated.View style={[{ height: 3, backgroundColor: color, alignSelf: 'flex-start', width: '100%', transform: [{ scaleX: v }] }, Platform.select({ web: { transformOrigin: 'left' } as never, default: {} })]} />;
}

/** Raw scroll offset (px) from the page frame — used for gentle parallax. */
export const ScrollYCtx = createContext<Animated.Value | null>(null);
export function Parallax({ children, travel = 36, style }: { children: React.ReactNode; travel?: number; style?: StyleProp<ViewStyle> }) {
  const y = useContext(ScrollYCtx);
  const reduce = useReduceMotion();
  if (!y || reduce) return <View style={style}>{children}</View>;
  return <Animated.View style={[style, { transform: [{ translateY: y.interpolate({ inputRange: [0, 700], outputRange: [0, -travel], extrapolate: 'clamp' }) }] }]}>{children}</Animated.View>;
}

/** Page transition: content rises and fades in whenever a public page opens. */
export function PageEnter({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) { a.setValue(1); return; }
    Animated.timing(a, { toValue: 1, duration: dur.screen, easing: out, useNativeDriver: native }).start();
  }, [a, reduce]);
  return <Animated.View style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>{children}</Animated.View>;
}

/** A line that draws itself when seen (connects numbered steps). */
export function DrawLine({ color, vertical, thickness = 2, length }: { color: string; vertical?: boolean; thickness?: number; length?: number | `${number}%` }) {
  const reduce = useReduceMotion();
  const { ref, seen } = useInView(0.2);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!seen) return;
    if (reduce) { a.setValue(1); return; }
    Animated.timing(a, { toValue: 1, duration: 500, delay: 150, easing: out, useNativeDriver: native }).start();
  }, [seen, reduce, a]);
  return (
    <View ref={ref} style={vertical ? { width: thickness, height: length ?? '100%' } : { height: thickness, width: length ?? '100%' }}>
      <Animated.View style={[{ flex: 1, backgroundColor: color, borderRadius: thickness, transform: [vertical ? { scaleY: a } : { scaleX: a }] }, Platform.select({ web: { transformOrigin: vertical ? 'top' : 'left' } as never, default: {} })]} />
    </View>
  );
}

/** Text that slides to its new value when it changes (prices, plan names). */
export function Swap({ value, children }: { value: string; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce) return;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: dur.comp, easing: out, useNativeDriver: native }).start();
  }, [value, a, reduce]);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>;
}

/** Accordion body + rotating chevron. */
export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [show, setShow] = useState(open);
  useEffect(() => {
    if (open) setShow(true);
    if (reduce) { a.setValue(open ? 1 : 0); if (!open) setShow(false); return; }
    Animated.timing(a, { toValue: open ? 1 : 0, duration: open ? dur.comp : dur.micro, easing: out, useNativeDriver: native }).start(() => { if (!open) setShow(false); });
  }, [open, a, reduce]);
  if (!show) return null;
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>{children}</Animated.View>;
}
export function Chevron({ open, color }: { open: boolean; color: string }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => { reduce ? a.setValue(open ? 1 : 0) : Animated.timing(a, { toValue: open ? 1 : 0, duration: dur.comp, easing: out, useNativeDriver: native }).start(); }, [open, a, reduce]);
  return <Animated.View style={{ transform: [{ rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}><Txt color={color} style={{ fontSize: 18 }}>⌄</Txt></Animated.View>;
}

/** A dot that travels along a track (0 → 1) on a loop; used for the money-flow diagram. */
export function Traveller({ color, size = 12, width, ms = 1600, delay = 0, active = true }: { color: string; size?: number; width: number; ms?: number; delay?: number; active?: boolean }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !active || width <= 0) { a.setValue(reduce ? 1 : 0); return; }
    const loop = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(a, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }), Animated.delay(500)]));
    loop.start();
    return () => loop.stop();
  }, [a, reduce, active, width, ms, delay]);
  if (!active) return null;
  return <Animated.View style={{ position: 'absolute', left: 0, top: -size / 2 + 1, width: size, height: size, borderRadius: size, backgroundColor: color, opacity: a.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, reduce ? 1 : 0] }), transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, width - size)] }) }] }} />;
}
