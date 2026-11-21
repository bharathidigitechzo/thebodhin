import React, { useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { BrandLogo } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';

const hero = require('../../../assets/brand/onboard-hero.jpg');

type Slide = { key: string; lead: string; accent: string; body: string; icons?: (keyof typeof Ionicons.glyphMap)[] };
const SLIDES: Slide[] = [
  { key: 'a', lead: '', accent: '', body: '' },
  { key: 'b', lead: 'Learn', accent: 'anywhere.', body: 'Recorded lessons, notes and quizzes in your pocket. Download and keep learning offline.', icons: ['play-circle', 'download', 'document-text'] },
  { key: 'c', lead: 'Live with', accent: 'mentors.', body: 'Join live classes, raise your hand and get your doubts cleared in real time.', icons: ['videocam', 'hand-left', 'chatbubbles'] },
  { key: 'd', lead: 'Earn real', accent: 'certificates.', body: 'Finish courses, pass assessments and share verified certificates with employers.', icons: ['ribbon', 'trophy', 'shield-checkmark'] },
];

export default function Onboarding() {
  const { c } = useTheme();
  const { markOnboarded } = useAuth();
  const { width: winW, height: winH } = useWindowDimensions();
  const slideWidth = Math.min(winW - 48, layout.authMaxWidth - 48);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Slide>>(null);

  const go = (path: '/sign-up' | '/sign-in') => {
    markOnboarded();
    router.replace(path);
  };

  const isSmallDevice = winH < 720;
  const stageSize = isSmallDevice ? 190 : 220;
  const bigIconSize = isSmallDevice ? 96 : 112;

  return (
    <Screen
      scroll={false}
      contentStyle={{ alignItems: 'center', justifyContent: 'space-between', flexGrow: 1 }}
      footer={
        <>
          <View style={styles.dots} accessibilityRole="tablist">
            {SLIDES.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => list.current?.scrollToIndex({ index: i, animated: true })}
                hitSlop={10}
                style={{ minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === index }}
                accessibilityLabel={`Slide ${i + 1}`}
              >
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: i === index ? c.primary : c.borderStrong, width: i === index ? 22 : 8 },
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <Button title="Get Started" iconRight="arrow-forward" onPress={() => go('/sign-up')} />
          <Button title="I already have an account · Sign In" variant="outline" onPress={() => go('/sign-in')} />
        </>
      }
    >
      <View style={styles.top}>
        <BrandLogo size="md" />
        <Pressable onPress={() => go('/sign-in')} hitSlop={12} accessibilityRole="button" style={styles.skip}>
          <Txt variant="label" color={c.muted}>
            Skip
          </Txt>
        </Pressable>
      </View>

      <View style={styles.sliderWrap}>
        <FlatList
          ref={list}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ width: slideWidth }}
          getItemLayout={(_, i) => ({ length: slideWidth, offset: slideWidth * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / slideWidth))}
          onScroll={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
            if (i !== index && i >= 0 && i < SLIDES.length) setIndex(i);
          }}
          scrollEventThrottle={32}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: slideWidth }]}>
              {item.lead ? (
                <View style={styles.textWrap}>
                  <TwoTone lead={item.lead} accent={item.accent} center />
                  <Txt center color={c.inkSoft} style={{ marginTop: 8, maxWidth: 320 }}>
                    {item.body}
                  </Txt>
                </View>
              ) : null}
              <View style={styles.art}>
                {item.icons ? (
                  <View style={[styles.iconStage, { width: stageSize, height: stageSize, borderRadius: stageSize / 2, backgroundColor: c.primarySoft }]}>
                    <View style={[styles.bigIcon, { width: bigIconSize, height: bigIconSize, borderRadius: bigIconSize * 0.28, backgroundColor: c.primary }]}>
                      <Ionicons name={item.icons[0]} size={isSmallDevice ? 52 : 60} color="#fff" />
                    </View>
                    <View style={[styles.chip, { top: 14, left: 6, backgroundColor: c.surface }]}>
                      <Ionicons name={item.icons[1]} size={24} color={c.accent} />
                    </View>
                    <View style={[styles.chip, { bottom: 14, right: 6, backgroundColor: c.surface }]}>
                      <Ionicons name={item.icons[2]} size={24} color={c.primary} />
                    </View>
                  </View>
                ) : (
                  <View style={styles.heroWrap}>
                    <Image
                      source={hero}
                      style={styles.hero}
                      resizeMode="contain"
                      accessibilityLabel="Students learning on Bodhin"
                    />
                  </View>
                )}
              </View>
            </View>
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { width: '100%', alignItems: 'center', paddingVertical: 8 },
  skip: { position: 'absolute', right: 0, top: 12, minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  sliderWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  textWrap: { alignItems: 'center', marginBottom: 12 },
  art: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  heroWrap: { width: '100%', maxWidth: 360, aspectRatio: 800 / 524, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', height: '100%' },
  iconStage: { alignItems: 'center', justifyContent: 'center' },
  bigIcon: { alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B2A55', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  dot: { height: 8, borderRadius: 4 },
});
