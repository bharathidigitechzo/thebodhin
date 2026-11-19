/** Splash → routes to Home (signed in), Sign In (returning) or Onboarding (first launch). */
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { homePath, useAuth } from '@/store/auth';
import { BrandLogo, PoweredBy } from '@/ui/Brand';
import { Waves } from '@/ui/Waves';
import { useTheme } from '@/theme/ThemeProvider';

export default function Splash() {
  const { ready, session, onboarded, mode } = useAuth();
  const { c, tenant } = useTheme();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      // If visiting an educator's subdomain without an active session, show the educator's public storefront / marketplace
      if (tenant) {
        router.replace((session ? homePath(session, mode) : `/site/${tenant.slug}`) as any);
        return;
      }
      // New web visitors (thebodhin.com) land on the public home; returning ones go to sign in. The phone app keeps onboarding.
      router.replace((session ? homePath(session, mode) : onboarded ? '/sign-in' : Platform.OS === 'web' ? '/welcome' : '/onboarding') as any);
    }, 1100);
    return () => clearTimeout(t);
  }, [ready, session, onboarded, mode, tenant]);

  return (
    <View style={[styles.root, { backgroundColor: c.ivory }]}>
      <Waves />
      <Animated.View style={{ opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
        <BrandLogo size="lg" />
      </Animated.View>
      <View style={styles.bottom}>
        <PoweredBy />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bottom: { position: 'absolute', bottom: 40 },
});
