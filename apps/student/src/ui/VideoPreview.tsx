/** Preview of a picked video before saving: a real player on the web; file details on phones (player after upload). */
import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { saveMediaFile } from './mediaStore';
import { Txt } from './Txt';

export function VideoPreview({ uri, name, sizeMb }: { uri: string; name: string; sizeMb?: number }) {
  const { c } = useTheme();
  const validUri = uri || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  const playable = Platform.OS === 'web' && /^(blob:|data:|https?:)/.test(validUri);

  useEffect(() => {
    if (Platform.OS === 'web' && validUri && validUri.startsWith('blob:') && name) {
      fetch(validUri)
        .then((r) => r.blob())
        .then((blob) => {
          saveMediaFile(name, blob);
          if (name.endsWith('.mp4')) {
            saveMediaFile(name.replace('.mp4', ''), blob);
          }
        })
        .catch(() => {});
    }
  }, [validUri, name]);
  return (
    <View style={[s.box, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
      {playable ? (
        React.createElement('video', { src: validUri, controls: true, preload: 'metadata', playsInline: true, style: { width: '100%', maxHeight: 260, borderRadius: 12, background: '#000' }, 'aria-label': `Preview of ${name}` })
      ) : (
        <View style={[s.poster, { backgroundColor: '#0B1F3A' }]}>
          <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="videocam-outline" size={18} color={c.primary} />
        <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>{name}</Txt>
        {sizeMb != null && sizeMb > 0 && <Txt variant="caption" color={c.muted}>{sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${sizeMb} MB`}</Txt>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  poster: { height: 160, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
