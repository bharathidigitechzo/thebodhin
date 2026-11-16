/** Admin tabs: Home · Inbox · Tenants · Money · More (bottom bar on phones, side rail ≥ 900px). */
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '@/ui/haptics';
import { TabIcon } from '@/ui/tabIcon';
import { useAppTabs } from '@/ui/responsive';
import { canOpenAdmin, type AdminRole } from '@/core/admin';
import { adminMembership, useAuth } from '@/store/auth';

const TABS = [
  ['index', 'Home', 'speedometer'],
  ['inbox', 'Inbox', 'file-tray-full'],
  ['tenants', 'Tenants', 'business'],
  ['money', 'Money', 'wallet'],
  ['more', 'More', 'menu'],
] as const;

export default function AdminTabs() {
  const tabs = useAppTabs(TABS, 'admin');
  const { session } = useAuth();
  const role = (adminMembership(session)?.role ?? null) as AdminRole | null;
  return (
    <Tabs tabBar={tabs.tabBar} screenOptions={tabs.screenOptions} screenListeners={{ tabPress: () => haptic('select') }}>
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            // Hide tabs this staff role has no permission for (Finance: no Inbox, Support: no Inbox/Money, …).
            href: canOpenAdmin(role, name === 'index' ? '/admin' : `/admin/${name}`) ? undefined : null,
            tabBarIcon: ({ color, focused }) => <TabIcon icon={icon} focused={focused} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
