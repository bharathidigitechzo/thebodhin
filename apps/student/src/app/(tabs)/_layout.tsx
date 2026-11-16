/** The fixed 5-tab bottom navigation — identical on every screen (thumb muscle memory). */
import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '@/ui/haptics';
import { TabIcon } from '@/ui/tabIcon';
import { useAuth } from '@/store/auth';
import { useAppTabs } from '@/ui/responsive';

const TABS = [
  ['home', 'Home', 'home'],
  ['explore', 'Explore', 'compass'],
  ['learning', 'My Learning', 'play-circle'],
  ['live', 'Live', 'radio'],
  ['profile', 'Profile', 'person'],
] as const;

export default function TabsLayout() {
  const { session, ready } = useAuth();
  const tabs = useAppTabs(TABS, 'learner');
  if (ready && !session) return <Redirect href="/sign-in" />;

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
