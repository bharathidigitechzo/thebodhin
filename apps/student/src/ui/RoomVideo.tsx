/**
 * Renders a MediaStream: camera, shared screen or your own preview.
 * Web: a <video> element. Native: RTCView from the WebRTC build (react-native-webrtc, bundled with @livekit/react-native);
 * without that build it shows a plain placeholder.
 */
import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './Txt';

type NativeRTCView = React.ComponentType<{ streamURL: string; objectFit?: string; mirror?: boolean; style?: object }>;
let RTCView: NativeRTCView | null = null;
if (Platform.OS !== 'web') {
  try {
    RTCView = require('react-native-webrtc').RTCView; // eslint-disable-line @typescript-eslint/no-var-requires
  } catch {
    RTCView = null;
  }
}

export function RoomVideo({ stream, muted = true, fit = 'cover', mirror = false, label = 'Video', style }: { stream: MediaStream | null; muted?: boolean; fit?: 'cover' | 'contain'; mirror?: boolean; label?: string; style?: object }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (Platform.OS !== 'web' || !el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play?.().catch(() => {});
  }, [stream]);
  if (!stream) return <View style={style} />;
  if (Platform.OS !== 'web') {
    const url = (stream as unknown as { toURL?: () => string }).toURL?.();
    if (RTCView && url) {
      return <RTCView streamURL={url} objectFit={fit} mirror={mirror} style={{ width: '100%', height: '100%', ...(style as object) }} />;
    }
    return (
      <View style={[{ width: '100%', height: '100%', backgroundColor: '#070F1E', alignItems: 'center', justifyContent: 'center' }, style as object]}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#0F4C81', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#2EC4B6' }}>
            <Ionicons name="videocam" size={38} color="#FFFFFF" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(46, 196, 182, 0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2EC4B6' }} />
            <Txt variant="caption" color="#2EC4B6" style={{ fontWeight: '700' }}>LIVE CAMERA FEED</Txt>
          </View>
        </View>
      </View>
    );
  }
  return React.createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true,
    muted,
    'aria-label': label,
    style: { width: '100%', height: '100%', objectFit: fit, background: '#000', transform: mirror ? 'scaleX(-1)' : undefined, ...(style as object) },
  });
}
