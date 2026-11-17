/**
 * Educator area — same app, same login. Shown to owners and tutors.
 * Fixed 5 tabs: Dashboard · Courses · Live classes · Batches · More (same order as core/nav.ts) (bottom bar on phones, side rail ≥ 900px).
 */
import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '@/ui/haptics';
import { TabIcon } from '@/ui/tabIcon';
import { educatorMembership, useAuth } from '@/store/auth';
import { NotEducator } from '@/ui/workspaceGate';
import { auth } from '@/api/client';
import { useAppTabs } from '@/ui/responsive';

const TABS = [
  ['home', 'Dashboard', 'grid'],
  ['courses', 'Courses', 'layers'],
  ['live', 'Live classes', 'radio'],
  ['batches', 'Batches', 'people'],
  ['more', 'More', 'menu'],
] as const;

export default function EducatorLayout() {
  const { session, ready, refresh } = useAuth();
  const tabs = useAppTabs(TABS, 'educator');
  React.useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- pick up a just-approved educator role
  if (ready && !session) return <Redirect href="/sign-in" />;
  if (ready && !educatorMembership(session)) return <NotEducator signedIn applied={!!auth.getApplication(session!.user.id) && auth.getApplication(session!.user.id)!.status !== 'draft'} />;

  return (
    <Tabs tabBar={tabs.tabBar} screenOptions={tabs.screenOptions} screenListeners={{ tabPress: () => haptic('select') }}>
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, focused }) => <TabIcon icon={icon} focused={focused} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
