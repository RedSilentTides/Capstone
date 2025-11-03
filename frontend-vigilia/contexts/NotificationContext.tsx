import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerForPushNotificationsAsync,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  scheduleLocalNotification,
} from '../services/notificationService';
import { useAuth } from './AuthContext';
import axios from 'axios';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: string | null;
  newAlertsCount: number;
  checkForNewAlerts: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  expoPushToken: null,
  notification: null,
  error: null,
  newAlertsCount: 0,
  checkForNewAlerts: async () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newAlertsCount, setNewAlertsCount] = useState(0);
  const [lastAlertId, setLastAlertId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const lastAlertIdRef = useRef<number | null>(null);

  // Cargar lastAlertId desde AsyncStorage al montar
  useEffect(() => {
    const loadLastAlertId = async () => {
      try {
        const stored = await AsyncStorage.getItem('lastAlertId');
        if (stored) {
          const id = parseInt(stored, 10);
          setLastAlertId(id);
          lastAlertIdRef.current = id;
          console.log('📱 LastAlertId cargado desde AsyncStorage:', id);
        }
      } catch (e) {
        console.log('Error al cargar lastAlertId:', e);
      }
    };

    if (user) {
      loadLastAlertId();
    }
  }, [user]);

  // Limpiar lastAlertId al cerrar sesión
  useEffect(() => {
    if (!isAuthenticated) {
      AsyncStorage.removeItem('lastAlertId');
      setLastAlertId(null);
      lastAlertIdRef.current = null;
      console.log('📱 LastAlertId limpiado por logout');
    }
  }, [isAuthenticated]);

  // Obtener el rol del usuario cuando se autentica
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setUserRole(null);
      return;
    }

    const fetchUserRole = async () => {
      try {
        const firebaseToken = await user.getIdToken();

        // Usar el mismo endpoint que index.tsx (/usuarios/yo) que funciona para ambos roles
        const response = await axios.get(`${API_URL}/usuarios/yo`, {
          headers: { Authorization: `Bearer ${firebaseToken}` },
        });

        const rol = response.data.rol;
        setUserRole(rol);
        console.log('Rol de usuario obtenido:', rol);
      } catch (err: any) {
        console.log('Error al obtener rol de usuario:', err.response?.status || err.message);
      }
    };

    fetchUserRole();
  }, [isAuthenticated, user]);

  // Registrar el dispositivo para notificaciones cuando el usuario esté autenticado
  useEffect(() => {
    // Solo configurar notificaciones en dispositivos móviles (no en web)
    if (Platform.OS === 'web') {
      console.log('Notificaciones push no disponibles en web');
      return;
    }

    if (!isAuthenticated || !user) return;

    // Función asíncrona para configurar todo
    const setupNotifications = async () => {
      try {
        // 1. Obtener el token de push notifications
        const token = await registerForPushNotificationsAsync();

        if (!token) {
          console.log('No se pudo obtener el push token');
          return;
        }

        setExpoPushToken(token);
        console.log('Push token obtenido:', token);

        // 2. Enviar el token al backend
        try {
          const firebaseToken = await user.getIdToken();
          await axios.post(
            `${API_URL}/usuarios/push-token`,
            { push_token: token },
            { headers: { Authorization: `Bearer ${firebaseToken}` } }
          );
          console.log('Push token enviado al backend');
        } catch (err) {
          console.error('Error al enviar push token al backend:', err);
          setError('No se pudo registrar el dispositivo para notificaciones');
        }

        // 3. Configurar listeners para notificaciones
        // Listener para notificaciones recibidas (app en foreground)
        notificationListener.current = addNotificationReceivedListener((notification) => {
          console.log('Notificación recibida en foreground:', notification);
          setNotification(notification);
        });

        // Listener para cuando el usuario toca una notificación
        responseListener.current = addNotificationResponseReceivedListener((response) => {
          console.log('Usuario tocó la notificación:', response);

          // Navegar según el tipo de notificación
          const data = response.notification.request.content.data;

          if (data?.tipo === 'alerta') {
            router.push('/cuidador/alertas' as any);
          } else if (data?.tipo === 'recordatorio') {
            router.push('/cuidador/recordatorios' as any);
          } else if (data?.tipo === 'solicitud') {
            router.push('/cuidador/solicitudes' as any);
          }
        });

      } catch (err) {
        console.error('Error al configurar notificaciones:', err);
        setError('No se pudo configurar las notificaciones');
      }
    };

    setupNotifications();

    // Cleanup: Remover listeners al desmontar
    return () => {
      if (notificationListener.current) {
        try {
          Notifications.removeNotificationSubscription(notificationListener.current);
        } catch (e) {
          console.log('Error al remover notification listener:', e);
        }
      }
      if (responseListener.current) {
        try {
          Notifications.removeNotificationSubscription(responseListener.current);
        } catch (e) {
          console.log('Error al remover response listener:', e);
        }
      }
    };
  }, [isAuthenticated, user, router]);

  // Función para verificar nuevas alertas
  const checkForNewAlerts = async () => {
    if (!user || !isAuthenticated || userRole !== 'cuidador') return;

    try {
      const firebaseToken = await user.getIdToken();
      const response = await axios.get(`${API_URL}/alertas`, {
        headers: { Authorization: `Bearer ${firebaseToken}` },
      });

      const alertas = response.data;
      if (alertas && alertas.length > 0) {
        const latestAlert = alertas[0]; // Las alertas vienen ordenadas por fecha desc
        const newAlertCount = alertas.filter((a: any) => !a.leido).length;
        setNewAlertsCount(newAlertCount);

        // Usar la referencia en lugar del estado para verificación síncrona
        const currentLastAlertId = lastAlertIdRef.current;

        // Si hay una nueva alerta (ID diferente al último conocido), mostrar notificación local
        if (currentLastAlertId !== null && latestAlert.id > currentLastAlertId) {
          console.log('🔔 Nueva alerta detectada!', latestAlert);

          // Mostrar notificación local
          await scheduleLocalNotification(
            '¡Solicitud de Ayuda!',
            `${latestAlert.nombre_adulto_mayor} ha solicitado ayuda`,
            { tipo: 'alerta', alertaId: latestAlert.id }
          );
        }

        // Actualizar el último ID de alerta conocido y persistir
        if (latestAlert.id > (currentLastAlertId || 0)) {
          setLastAlertId(latestAlert.id);
          lastAlertIdRef.current = latestAlert.id;
          await AsyncStorage.setItem('lastAlertId', latestAlert.id.toString());
          console.log('📱 LastAlertId guardado en AsyncStorage:', latestAlert.id);
        }
      }
    } catch (err) {
      console.error('Error al verificar nuevas alertas:', err);
    }
  };

  // Polling para verificar nuevas alertas cada 10 segundos (solo si hay token de desarrollo)
  useEffect(() => {
    if (!isAuthenticated || !user || userRole !== 'cuidador') return;

    // Si el token es de desarrollo, activar polling
    if (expoPushToken && expoPushToken.startsWith('DEV-TOKEN-')) {
      console.log('🔄 Activando polling para alertas (modo desarrollo)');

      // Verificar inmediatamente
      checkForNewAlerts();

      // Configurar polling cada 10 segundos
      pollingInterval.current = setInterval(checkForNewAlerts, 10000);
    }

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [isAuthenticated, user, userRole, expoPushToken]);

  return (
    <NotificationContext.Provider value={{
      expoPushToken,
      notification,
      error,
      newAlertsCount,
      checkForNewAlerts
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
