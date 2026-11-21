/** App entry: routes directly to Home (if signed in) or Onboarding (first 4 slides). No splash screen. */
import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { homePath, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import Onboarding from './(auth)/onboarding';

export default function Index() {
  const { ready, session, mode } = useAuth();
  const { tenant } = useTheme();

  useEffect(() => {
    if (!ready) return;
    if (tenant && !session) {
      router.replace(`/site/${tenant.slug}` as any);
      return;
    }
    if (session) {
      router.replace(homePath(session, mode) as any);
    }
  }, [ready, session, mode, tenant]);

  if (!ready) return null;
  if (session) return null;

  return <Onboarding />;
}
