import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Configurar cómo se muestran las notificaciones cuando la app está en foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, // Deprecated pero compatible
    shouldPlaySound: true,
    shouldSetBadge: true,
    // Nuevas propiedades recomendadas:
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registra el dispositivo para recibir notificaciones push
 * @returns El token de notificación push o null si falla
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Error: No se obtuvieron permisos de notificación push');
      return null;
    }

    try {
      console.log('📱 Solicitando push token de Expo...');
      console.log('   App slug:', Constants.expoConfig?.slug);
      console.log('   Owner:', Constants.expoConfig?.owner);

      // Para builds standalone (APK), usar el projectId de EAS
      const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;

      if (!easProjectId) {
        throw new Error('EAS projectId no encontrado en la configuración');
      }

      console.log('   EAS Project ID:', easProjectId);

      // Usar el projectId de EAS para builds standalone
      const pushTokenData = await Notifications.getExpoPushTokenAsync({
        projectId: easProjectId
      });

      token = pushTokenData.data;
      console.log('✅ Push token obtenido exitosamente!');
      console.log('   Token:', token);
    } catch (e: any) {
      console.error('❌ Error al obtener el push token');
      console.error('   Error:', e.message || e);

      if (e.message?.includes('projectId')) {
        console.log('\n⚠️  MODO DESARROLLO SIN PUSH REMOTO:');
        console.log('   Tu versión de Expo SDK requiere EAS para push notifications');
        console.log('   Usando notificaciones LOCALES para desarrollo');
        console.log('   Las alertas se mostrarán como notificaciones locales en este dispositivo');

        // Generar un token simulado para desarrollo local
        token = `DEV-TOKEN-${Platform.OS}-${Date.now()}`;
        console.log('   Token de desarrollo:', token);
      }
    }
  } else {
    console.log('Las notificaciones push solo funcionan en dispositivos físicos');
  }

  return token;
}

/**
 * Añade un listener para notificaciones recibidas mientras la app está abierta
 * @param callback Función a ejecutar cuando se recibe una notificación
 * @returns Subscription que puede ser removida con .remove()
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Añade un listener para cuando el usuario toca una notificación
 * @param callback Función a ejecutar cuando se toca una notificación
 * @returns Subscription que puede ser removida con .remove()
 */
export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Envía una notificación local (para testing)
 * @param title Título de la notificación
 * @param body Cuerpo de la notificación
 * @param data Datos adicionales
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data ?? {},
      sound: true,
    },
    trigger: null, // null = enviar inmediatamente
  });
}
