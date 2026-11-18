/**
 * Renders a MediaStream: camera, shared screen or your own preview.
 * Web: a <video> element. Native: RTCView from the WebRTC build (react-native-webrtc, bundled with @livekit/react-native);
 * without that build it shows a plain placeholder.
 */
import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

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
    return RTCView && url ? <RTCView streamURL={url} objectFit={fit} mirror={mirror} style={{ width: '100%', height: '100%', ...(style as object) }} /> : <View style={style} />;
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
