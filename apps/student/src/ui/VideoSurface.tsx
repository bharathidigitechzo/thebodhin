/**
 * Video surface with thumb-friendly controls.
 * Supports real HTML5 video playback, YouTube embeds, and sample fallback video.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Course, Lesson } from '@/core/catalog';
import { getMediaFile, saveMediaFile } from './mediaStore';
import { Txt } from './Txt';

export interface VideoState {
  playing: boolean;
  t: number;
}

interface Props {
  course: Course;
  lesson: Lesson;
  label: string; // "Module 1 · Lesson 1"
  startAt: number;
  speed: number;
  fullscreen: boolean;
  onTime: (t: number, duration: number) => void;
  onEnded: () => void;
  onSpeed: () => void;
  onQuality: () => void;
  onFullscreen: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function getYouTubeEmbedUrl(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? `https://www.youtube.com/embed/${match[2]}?autoplay=1&enablejsapi=1` : null;
}

const DEFAULT_SAMPLE_VIDEO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

export function VideoSurface({ course, lesson, label, startAt, speed, fullscreen, onTime, onEnded, onSpeed, onQuality, onFullscreen }: Props) {
  const [realDuration, setRealDuration] = useState<number | null>(null);
  const duration = realDuration ?? (lesson.durationSec ?? 600);
  const [t, setT] = useState(Math.min(startAt, Math.max(0, duration - 1)));
  const [playing, setPlaying] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [seekHint, setSeekHint] = useState<null | 'back' | 'fwd'>(null);
  const [barW, setBarW] = useState(1);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null);
  const lastTap = useRef<{ at: number; x: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = useRef(1);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const barRef = useRef<any>(null); // the bar's DOM node on web (for mouse-accurate seeking)

  const rawUrl = lesson.videoUrl || (lesson as any).videoUri || course.intro?.uri;
  const ytEmbed = getYouTubeEmbedUrl(rawUrl);

  const videoSource = resolvedMediaUrl || rawUrl || DEFAULT_SAMPLE_VIDEO;
  const isWeb = Platform.OS === 'web';
  const hasRealVideo = isWeb && !ytEmbed && !hasVideoError;

  // Resolve persistent media from IndexedDB if uploaded previously
  useEffect(() => {
    let active = true;
    let localBlobUrl: string | null = null;

    async function resolveMedia() {
      // 1. YouTube embeds
      if (rawUrl && getYouTubeEmbedUrl(rawUrl)) {
        if (active) setResolvedMediaUrl(rawUrl);
        return;
      }
      // 2. Real remote HTTP/HTTPS video URL
      if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) && !rawUrl.startsWith('blob:') && !rawUrl.includes('commondatastorage.googleapis.com')) {
        if (active) setResolvedMediaUrl(rawUrl);
        return;
      }

      // 3. Check IndexedDB by lesson id, course_lesson, or title
      const keys = [
        lesson.id,
        `${course.id}_${lesson.id}`,
        lesson.title,
        `${lesson.title}.mp4`,
        (lesson as any).fileName,
      ];
      for (const k of keys) {
        if (!k) continue;
        const blob = await getMediaFile(k);
        if (blob && active) {
          localBlobUrl = URL.createObjectURL(blob);
          setResolvedMediaUrl(localBlobUrl);
          return;
        }
      }

      // 4. If rawUrl is a live blob in the current browser session, cache it and use it
      if (rawUrl && rawUrl.startsWith('blob:')) {
        try {
          const res = await fetch(rawUrl);
          if (res.ok) {
            const blob = await res.blob();
            if (active) {
              localBlobUrl = URL.createObjectURL(blob);
              setResolvedMediaUrl(localBlobUrl);
            }
            saveMediaFile(lesson.id, blob);
            saveMediaFile(`${course.id}_${lesson.id}`, blob);
            if (lesson.title) saveMediaFile(lesson.title, blob);
            return;
          }
        } catch {
          // Dead blob URL
        }
      }

      if (active) {
        if (rawUrl && !rawUrl.startsWith('blob:')) {
          setResolvedMediaUrl(rawUrl);
        } else {
          setResolvedMediaUrl(DEFAULT_SAMPLE_VIDEO);
        }
      }
    }

    resolveMedia();

    return () => {
      active = false;
      if (localBlobUrl) {
        try { URL.revokeObjectURL(localBlobUrl); } catch { /* ignore */ }
      }
    };
  }, [lesson.id, rawUrl, course.id, lesson.title]);

  // reset when lesson changes
  useEffect(() => {
    setT(Math.min(startAt, Math.max(0, duration - 1)));
    setPlaying(false);
    setChrome(true);
    setHasVideoError(false);
    if (videoElRef.current) {
      videoElRef.current.currentTime = startAt;
      videoElRef.current.pause();
    }
  }, [lesson.id, rawUrl, resolvedMediaUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // sync playback rate
  useEffect(() => {
    if (videoElRef.current) {
      videoElRef.current.playbackRate = speed;
    }
  }, [speed]);

  // fallback simulated clock only when no real video is active
  useEffect(() => {
    if (hasRealVideo || ytEmbed || !playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const n = Math.min(duration, x + 0.5 * speed * 2);
        if (n >= duration) {
          setPlaying(false);
          setTimeout(onEnded, 0);
        }
        return n;
      });
    }, 500);
    return () => clearInterval(id);
  }, [playing, speed, duration, onEnded, hasRealVideo, ytEmbed]);

  useEffect(() => {
    onTime(t, duration);
  }, [t, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-hide controls while playing
  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing && chrome) {
      hideTimer.current = setTimeout(() => setChrome(false), 3500);
    }
  }, [playing, chrome]);

  const togglePlay = () => {
    if (videoElRef.current) {
      if (videoElRef.current.paused) {
        if (videoElRef.current.currentTime >= duration - 0.5) {
          videoElRef.current.currentTime = 0;
        }
        videoElRef.current.play().then(() => setPlaying(true)).catch(() => {
          setHasVideoError(true);
          setPlaying(true);
        });
      } else {
        videoElRef.current.pause();
        setPlaying(false);
      }
    } else {
      setPlaying((p) => !p);
    }
  };

  const seek = (d: number) => {
    const nextT = Math.max(0, Math.min(Math.max(1, duration - 0.5), t + d));
    setT(nextT);
    if (videoElRef.current) {
      videoElRef.current.currentTime = nextT;
    }
  };

  /** Single tap toggles controls; double tap on left/right third seeks ∓10s. */
  const onSurfaceTap = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    const now = Date.now();
    if (lastTap.current && now - lastTap.current.at < 280) {
      const side = x < width.current / 3 ? 'back' : x > (width.current * 2) / 3 ? 'fwd' : null;
      if (side) {
        seek(side === 'back' ? -10 : 10);
        setSeekHint(side);
        setTimeout(() => setSeekHint(null), 500);
      }
      lastTap.current = null;
      return;
    }
    lastTap.current = { at: now, x };
    setTimeout(() => {
      if (lastTap.current && lastTap.current.at === now) setChrome((v) => !v);
    }, 290);
  };

  const scrub = (e: GestureResponderEvent) => {
    // Web: measure against the bar itself (locationX is relative to whichever child was hit — track or knob).
    let ratio = barW > 0 ? e.nativeEvent.locationX / barW : 0;
    if (isWeb) {
      const native = e.nativeEvent as unknown as { clientX?: number; touches?: { clientX: number }[] };
      const clientX = native.clientX ?? native.touches?.[0]?.clientX;
      const node = barRef.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
      const rect = node?.getBoundingClientRect?.();
      if (rect && clientX != null && rect.width > 0) ratio = (clientX - rect.left) / rect.width;
    }
    const nextT = Math.max(0, Math.min(Math.max(1, duration - 0.5), Math.max(0, Math.min(1, ratio)) * duration));
    setT(nextT);
    if (videoElRef.current) {
      videoElRef.current.currentTime = nextT;
    }
  };

  const pct = duration > 0 ? (t / duration) * 100 : 0;

  return (
    <View
      style={[styles.box, fullscreen ? styles.full : { aspectRatio: 16 / 9 }]}
      onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
      accessibilityLabel={`Video: ${lesson.title}`}
    >
      {/* Background / Artwork layer */}
      <LinearGradient colors={[course.art.from, course.art.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Ionicons name={course.art.icon as keyof typeof Ionicons.glyphMap} size={160} color="rgba(255,255,255,0.10)" style={{ position: 'absolute', right: 10, top: 10 }} />

      {/* Real Video Player Layer */}
      {ytEmbed && isWeb ? (
        <View style={StyleSheet.absoluteFill}>
          <iframe
            src={ytEmbed}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#000' } as any}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </View>
      ) : hasRealVideo ? (
        <video
          ref={videoElRef}
          src={videoSource}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            backgroundColor: '#000',
          } as any}
          playsInline
          preload="auto"
          onTimeUpdate={(e) => setT((e.currentTarget as HTMLVideoElement).currentTime)}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget as HTMLVideoElement;
            const d = el.duration;
            if (d && !isNaN(d) && d > 0) setRealDuration(d);
            // Resume where the learner left off — setting currentTime before the metadata loads is ignored by browsers.
            if (startAt > 0 && isFinite(startAt)) {
              const target = Math.max(0, Math.min(startAt, (d && isFinite(d) ? d : duration) - 1));
              try { el.currentTime = target; setT(target); } catch { /* not seekable yet */ }
            }
          }}
          onEnded={() => {
            setPlaying(false);
            onEnded();
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => {
            if (videoSource !== DEFAULT_SAMPLE_VIDEO) {
              setResolvedMediaUrl(DEFAULT_SAMPLE_VIDEO);
            } else {
              setHasVideoError(true);
            }
          }}
        />
      ) : (
        <View style={[styles.slide, chrome && { opacity: 0 }]}>
          <Txt variant="title" color="#fff" numberOfLines={2} style={{ maxWidth: '75%', fontSize: 20 }}>
            {lesson.title}
          </Txt>
        </View>
      )}

      {/* Tap surface (not over YouTube iframe so iframe controls work) */}
      {!ytEmbed && (
        <Pressable style={StyleSheet.absoluteFill} onPress={onSurfaceTap} accessibilityRole="button" accessibilityLabel={chrome ? 'Hide controls' : 'Show controls'} />
      )}

      {seekHint && (
        <View style={[styles.seekHint, seekHint === 'back' ? { left: 24 } : { right: 24 }]} pointerEvents="none">
          <Ionicons name={seekHint === 'back' ? 'play-back' : 'play-forward'} size={22} color="#fff" />
          <Txt variant="label" color="#fff">10s</Txt>
        </View>
      )}

      {!ytEmbed && chrome && (
        <View style={styles.chrome} pointerEvents="box-none">
          <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.topRow} pointerEvents="box-none">
            <View style={styles.tag}>
              <Txt variant="caption" color="#fff" style={{ fontWeight: '700' }}>{label}</Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={onQuality} style={styles.tag} accessibilityRole="button" accessibilityLabel="Video quality" hitSlop={8}>
                <Ionicons name="settings-outline" size={14} color="#fff" />
              </Pressable>
              <Pressable onPress={onSpeed} style={styles.tag} accessibilityRole="button" accessibilityLabel={`Playback speed ${speed}x`} hitSlop={8}>
                <Txt variant="caption" color="#fff" style={{ fontWeight: '700' }}>{speed}x</Txt>
              </Pressable>
            </View>
          </View>

          <View style={styles.center} pointerEvents="box-none">
            <Pressable onPress={() => seek(-10)} style={styles.small} accessibilityRole="button" accessibilityLabel="Back 10 seconds" hitSlop={8}>
              <Ionicons name="play-back" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={togglePlay} style={styles.big} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'}>
              <Ionicons name={playing ? 'pause' : 'play'} size={34} color="#fff" style={!playing ? { marginLeft: 4 } : undefined} />
            </Pressable>
            <Pressable onPress={() => seek(10)} style={styles.small} accessibilityRole="button" accessibilityLabel="Forward 10 seconds" hitSlop={8}>
              <Ionicons name="play-forward" size={24} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.bottom} pointerEvents="box-none">
            <Pressable
              ref={barRef}
              onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
              onPress={scrub}
              onResponderMove={scrub}
              onStartShouldSetResponder={() => true}
              style={styles.barHit}
              accessibilityRole="adjustable"
              accessibilityLabel={`Position ${fmt(t)} of ${fmt(duration)}`}
            >
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <View style={[styles.knob, { left: `${pct}%` }]} />
            </Pressable>
            <View style={styles.timeRow}>
              <Txt variant="caption" color="#fff" style={{ fontVariant: ['tabular-nums'] }}>
                {fmt(t)} / {fmt(duration)}
              </Txt>
              <Pressable onPress={onFullscreen} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={fullscreen ? 'Exit full screen' : 'Full screen'}>
                <Ionicons name={fullscreen ? 'contract' : 'expand'} size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {!ytEmbed && !chrome && (
        <View style={styles.thin} pointerEvents="none">
          <View style={[styles.fill, { width: `${pct}%`, height: 3 }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  slide: { position: 'absolute', left: 20, bottom: 56, right: 20 },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, minHeight: 36, minWidth: 44, justifyContent: 'center', borderRadius: 999 },
  center: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34 },
  big: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  small: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 14, paddingBottom: 8 },
  barHit: { height: 28, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#F5A524' },
  knob: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, backgroundColor: '#F5A524', top: 6 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seekHint: { position: 'absolute', top: '40%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  thin: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
});
