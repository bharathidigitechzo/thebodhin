import React, { useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { BrandLogo } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { homePath, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';

const hero = require('../../../assets/brand/onboard-hero.jpg');

type Slide = {
  key: string;
  lead: string;
  accent: string;
  body: string;
  icons?: (keyof typeof Ionicons.glyphMap)[];
};

const SLIDES: Slide[] = [
  {
    key: 'a',
    lead: 'Learn from the',
    accent: 'best.',
    body: 'Interactive classes, courses and masterclasses from expert educators.',
  },
  {
    key: 'b',
    lead: 'Learn',
    accent: 'anywhere.',
    body: 'Recorded lessons, notes and quizzes in your pocket. Download and keep learning offline.',
    icons: ['play-circle', 'download', 'document-text'],
  },
  {
    key: 'c',
    lead: 'Live with',
    accent: 'mentors.',
    body: 'Join live classes, raise your hand and get your doubts cleared in real time.',
    icons: ['videocam', 'hand-left', 'chatbubbles'],
  },
  {
    key: 'd',
    lead: 'Earn real',
    accent: 'certificates.',
    body: 'Finish courses, pass assessments and share verified certificates with employers.',
    icons: ['ribbon', 'trophy', 'shield-checkmark'],
  },
];

export default function Onboarding() {
  const { c } = useTheme();
  const { session, mode, markOnboarded } = useAuth();
  const { width: winW, height: winH } = useWindowDimensions();
  const carouselWidth = Math.min(winW, layout.authMaxWidth);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Slide>>(null);

  const go = (path: '/sign-up' | '/sign-in') => {
    markOnboarded();
    if (session) {
      router.replace(homePath(session, mode) as any);
    } else {
      router.replace(path);
    }
  };

  const isSmallDevice = winH < 720;
  const stageSize = isSmallDevice ? 190 : 220;
  const bigIconSize = isSmallDevice ? 96 : 112;
  const heroMaxWidth = Math.min(carouselWidth - 48, 340);

  return (
    <Screen
      scroll={false}
      padded={false}
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

      <View style={[styles.sliderWrap, { width: carouselWidth }]}>
        <FlatList
          ref={list}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ width: carouselWidth, overflow: 'hidden' }}
          snapToInterval={carouselWidth}
          snapToAlignment="center"
          decelerationRate="fast"
          getItemLayout={(_, i) => ({ length: carouselWidth, offset: carouselWidth * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
            if (i >= 0 && i < SLIDES.length) setIndex(i);
          }}
          onScroll={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
            if (i !== index && i >= 0 && i < SLIDES.length) setIndex(i);
          }}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: carouselWidth }]}>
              <View style={styles.textWrap}>
                <TwoTone lead={item.lead} accent={item.accent} center />
                <Txt center color={c.inkSoft} style={styles.bodyText}>
                  {item.body}
                </Txt>
              </View>
              <View style={styles.art}>
                {item.icons ? (
                  <View
                    style={[
                      styles.iconStage,
                      {
                        width: stageSize,
                        height: stageSize,
                        borderRadius: stageSize / 2,
                        backgroundColor: c.primarySoft,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.bigIcon,
                        {
                          width: bigIconSize,
                          height: bigIconSize,
                          borderRadius: bigIconSize * 0.28,
                          backgroundColor: c.primary,
                        },
                      ]}
                    >
                      <Ionicons name={item.icons[0]} size={isSmallDevice ? 52 : 62} color="#fff" />
                    </View>
                    <View
                      style={[
                        styles.chip,
                        {
                          top: isSmallDevice ? 12 : 16,
                          left: isSmallDevice ? 4 : 8,
                          backgroundColor: c.surface,
                        },
                      ]}
                    >
                      <Ionicons name={item.icons[1]} size={isSmallDevice ? 22 : 26} color={c.accent} />
                    </View>
                    <View
                      style={[
                        styles.chip,
                        {
                          bottom: isSmallDevice ? 12 : 16,
                          right: isSmallDevice ? 4 : 8,
                          backgroundColor: c.surface,
                        },
                      ]}
                    >
                      <Ionicons name={item.icons[2]} size={isSmallDevice ? 22 : 26} color={c.primary} />
                    </View>
                  </View>
                ) : (
                  <View style={[styles.heroWrap, { maxWidth: heroMaxWidth }]}>
                    <Image
                      source={hero}
                      style={styles.hero}
                      resizeMode="cover"
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
  top: { width: '100%', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 24 },
  skip: { position: 'absolute', right: 24, top: 12, minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  sliderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  textWrap: { alignItems: 'center', marginBottom: 16 },
  bodyText: { marginTop: 8, maxWidth: 320, lineHeight: 20 },
  art: { width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 210 },
  heroWrap: { width: '100%', aspectRatio: 800 / 524, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#E4E8EF', shadowColor: '#0B2A55', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  hero: { width: '100%', height: '100%' },
  iconStage: { alignItems: 'center', justifyContent: 'center' },
  bigIcon: { alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B2A55', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  dot: { height: 8, borderRadius: 4 },
});
