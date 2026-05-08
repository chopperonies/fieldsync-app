import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/themeContext';

export default function CrewLayout() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border, height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hours"
        options={{
          title: 'Hours',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'time' : 'time-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'create' : 'create-outline'} size={size} color={color} />,
        }}
      />
      {/* Hidden tabs — still reachable via deep-link / job detail, just not in the tab bar. */}
      <Tabs.Screen name="photo"      options={{ href: null }} />
      <Tabs.Screen name="supplies"   options={{ href: null }} />
      <Tabs.Screen name="bottleneck" options={{ href: null }} />
      <Tabs.Screen name="job/[id]"   options={{ href: null }} />
      <Tabs.Screen name="settings"   options={{ href: null }} />
    </Tabs>
  );
}
