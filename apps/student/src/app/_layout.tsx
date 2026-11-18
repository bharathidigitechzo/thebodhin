import 'react-native-url-polyfill/auto'; // native: full URL support for the Supabase client (api/cloud.ts)
import React from 'react';
import '@/api/growth2'; // registers round-2 paid-order hooks (affiliates, analytics)
import '@/api/academy'; // certificate approvals, mentorship, course-wide live classes (registers progress hooks)
import { Stack, router, type ErrorBoundaryProps } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/store/auth';
import { SystemBanner } from '@/ui/SystemBanner';
import { LiveClassBanner } from '@/ui/LiveClassBanner';
import { Pressable, Text, View } from 'react-native';
import { DesktopFrame } from '@/ui/responsive';
import { WorkspaceGate } from '@/ui/workspaceGate';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          {/* Default tab title: pages with their own <Seo> override it; when they leave, the title falls back here. */}
          <Head><title>Bodhin</title></Head>
          <View style={{ flex: 1 }}>
            <SystemBanner />
            <LiveClassBanner />
            <View style={{ flex: 1 }}>
              <DesktopFrame>
                <WorkspaceGate>
                  <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                </WorkspaceGate>
              </DesktopFrame>
            </View>
          </View>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Safety net (Expo Router): if any screen throws while rendering, show this instead of a blank/frozen app.
 * "Try again" re-renders; "Go home" leaves the broken screen. Real build: also report `error` to Sentry here.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: '#FBF7F0', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }} accessibilityRole="alert">
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ fontSize: 15, color: '#4B5563', textAlign: 'center', maxWidth: 340 }}>This screen hit a problem. Your data is safe. Try again, or go back to the home screen.</Text>
      {__DEV__ ? <Text style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', maxWidth: 340 }}>{String(error?.message ?? error)}</Text> : null}
      <Pressable onPress={() => { retry(); }} accessibilityRole="button" style={{ marginTop: 8, minHeight: 48, paddingHorizontal: 28, borderRadius: 999, backgroundColor: '#12407F', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
      </Pressable>
      <Pressable onPress={() => { try { router.replace('/'); } catch { /* ignore */ } retry(); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 20, justifyContent: 'center' }}>
        <Text style={{ color: '#12407F', fontWeight: '600', fontSize: 15 }}>Go home</Text>
      </Pressable>
    </View>
  );
}
