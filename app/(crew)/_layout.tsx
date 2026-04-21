import { TouchableOpacity } from 'react-native';
import { Tabs, router } from 'expo-router';
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
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: { fontWeight: '700', color: theme.textPrimary },
        headerRight: () => (
          <TouchableOpacity onPress={() => router.push('/(crew)/settings' as any)} style={{ marginRight: 16 }}>
            <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />,
          headerTitle: 'Schedule',
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Check In',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'location' : 'location-outline'} size={size} color={color} />,
          headerTitle: 'LinkCrew',
        }}
      />
      <Tabs.Screen
        name="photo"
        options={{
          title: 'Photo',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'camera' : 'camera-outline'} size={size} color={color} />,
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
      <Tabs.Screen
        name="supplies"
        options={{
          title: 'Supplies',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'layers' : 'layers-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bottleneck"
        options={{
          title: 'Issues',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'alert-circle' : 'alert-circle-outline'} size={size} color={color} />,
        }}
      />
      {/* Nested dynamic route — hidden from tab bar; reached via router.push from the jobs list */}
      <Tabs.Screen name="job/[id]" options={{ href: null, title: 'Job' }} />
      <Tabs.Screen name="settings" options={{ href: null, title: 'Settings' }} />
    </Tabs>
  );
}
