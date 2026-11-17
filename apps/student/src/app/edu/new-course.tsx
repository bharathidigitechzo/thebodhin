/** "Create course" from the navigation: makes a draft (owner, tutor or Bodhin team) and opens the course builder. */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ApiError, courseAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/misc';

export default function NewCourse() {
  const { c } = useTheme();
  const { session } = useAuth();
  const [id, setId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    try { setId(courseAdmin.create(session?.user.id ?? '')); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not start a course.'); }
  }, [session?.user.id]);
  if (id) return <Redirect href={{ pathname: '/edu/course/[id]', params: { id } }} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 12 }}>
      {err ? <><Banner text={err} /><Button title="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/home'))} /></> : <Txt center color={c.muted}>Starting a new course…</Txt>}
    </View>
  );
}
