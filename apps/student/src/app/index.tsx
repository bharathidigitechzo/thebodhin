/** App entry: renders Onboarding directly (first 4 slides). No splash screen. */
import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import Onboarding from './(auth)/onboarding';

export default function Index() {
  const { ready, session } = useAuth();
  const { tenant } = useTheme();

  useEffect(() => {
    if (!ready) return;
    if (tenant && !session) {
      router.replace(`/site/${tenant.slug}` as any);
      return;
    }
  }, [ready, session, tenant]);

  if (!ready) return null;

  return <Onboarding />;
}
