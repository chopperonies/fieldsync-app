import Constants from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let notificationsPromise: Promise<NotificationsModule | null> | null = null;
let notificationHandlerSet = false;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (Constants.appOwnership === 'expo') return null;

  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications').catch(error => {
      console.warn('Notifications unavailable in this runtime', error);
      return null;
    });
  }

  const Notifications = await notificationsPromise;

  if (Notifications && !notificationHandlerSet) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerSet = true;
  }

  return Notifications;
}

export async function addNotificationResponseListener(
  listener: (response: any) => void,
): Promise<{ remove: () => void } | null> {
  const Notifications = await getNotifications();
  if (!Notifications) return null;
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export async function registerPushToken(): Promise<string | null> {
  const Notifications = await getNotifications();
  if (!Notifications) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'FieldSync Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: 'c053d985-0227-41dc-8907-965f85e05372',
  });
  return token.data;
}
