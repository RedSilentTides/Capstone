import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ActivityIndicator, Button,
    Pressable, ScrollView, Platform, Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import axios, { AxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Info, AlertTriangle, CheckCircle, Bell, UserPlus, Users, X, CalendarCheck, Camera } from 'lucide-react-native';

// URL del backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Tipos
type UserProfile = { 
  id: number;
  firebase_uid: string;
  email: string;
  nombre: string;
  rol: 'cuidador' | 'administrador' | 'adulto_mayor';
};
type AlertType = 'info' | 'warning' | 'error' | 'success';
interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  hasSnapshot?: boolean;
  alertaIdNumerico?: number;
}
interface Recordatorio {
    id: number;
    adulto_mayor_id: number;
    titulo: string;
    descripcion?: string | null;
    fecha_hora_programada: string;
    frecuencia: 'una_vez' | 'diario' | 'semanal' | 'mensual';
    estado: string;
    tipo_recordatorio?: string;
    dias_semana?: number[] | null;
    fecha_creacion: string;
    nombre_adulto_mayor?: string | null;
}

interface Alerta {
    id: number;
    adulto_mayor_id: number;
    tipo_alerta: 'ayuda' | 'caida';
    timestamp_alerta: string;
    dispositivo_id?: number | null;
    url_video_almacenado?: string | null;
    confirmado_por_cuidador?: boolean | null;
    notas?: string | null;
    detalles_adicionales?: any;
    fecha_registro: string;
    nombre_adulto_mayor?: string | null;
}

const alertConfig: Record<AlertType, { color: string }> = { 
  info: { color: '#3b82f6' },
  warning: { color: '#f59e0b' },
  error: { color: '#ef4444' },
  success: { color: '#10b981' },
};

// --- Componente AlertPreviewCard ---
function AlertPreviewCard({
  alert,
  onPressAction,
  loading = false,
  blocked = false,
  blockedUntil,
}: {
  alert: AlertItem;
  onPressAction?: () => void;
  loading?: boolean;
  blocked?: boolean;
  blockedUntil?: number;
}) {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const config = alertConfig[alert.type];

  // Actualizar cada segundo para mostrar countdown
  useEffect(() => {
    if (blocked && blockedUntil && blockedUntil > Date.now()) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [blocked, blockedUntil]);

  const renderIcon = () => {
    const iconSize = 20;
    const iconColor = config.color;
    const iconStyle = { marginRight: 12 };
    switch (alert.type) {
      case 'info':
        return <Info size={iconSize} color={iconColor} style={iconStyle} />;
      case 'warning':
      case 'error':
        return <AlertTriangle size={iconSize} color={iconColor} style={iconStyle} />;
      case 'success':
        return <CheckCircle size={iconSize} color={iconColor} style={iconStyle} />;
      default:
        return <Info size={iconSize} color={iconColor} style={iconStyle} />;
    }
  };

  const getTimeRemaining = () => {
    if (!blockedUntil) return '';
    const remaining = Math.max(0, Math.ceil((blockedUntil - currentTime) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <View
      style={[
        styles.card,
        { borderColor: config.color, borderLeftWidth: 4, borderWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
      ]}
    >
      <View style={styles.row}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          {renderIcon()}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.cardTitle}>{alert.title}</Text>
              {alert.hasSnapshot && <Camera size={14} color="#7c3aed" />}
            </View>
            <Text style={styles.cardMessage} numberOfLines={1}>{alert.message}</Text>
          </View>
        </View>

        {/* Botón solo si hay acción (alertas) */}
        {onPressAction ? (
          <Pressable
            style={[
              styles.goButton,
              (loading || blocked) && { opacity: 0.7, backgroundColor: '#9ca3af' }
            ]}
            onPress={(loading || blocked) ? undefined : onPressAction}
            disabled={loading || blocked}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : blocked ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.goButtonText, { fontSize: 10 }]}>EN CAMINO</Text>
                <Text style={[styles.goButtonText, { fontSize: 9 }]}>{getTimeRemaining()}</Text>
              </View>
            ) : (
              <Text style={styles.goButtonText}>YA VOY</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}



// --- Pantalla Principal ---
export default function IndexScreen() {
  // --- INICIO DE ZONA DE HOOKS (TODOS JUNTOS) ---
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const router = useRouter();

  // Efecto para redirigir si no está autenticado
  useEffect(() => {
    // Solo redirigir si la carga ha terminado y no está autenticado.
    if (!isAuthLoading && !isAuthenticated) {
      console.log('IndexScreen: No autenticado, redirigiendo a /login');
      router.replace('/login');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [selectedRecordatorio, setSelectedRecordatorio] = useState<Recordatorio | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEnviandoAlerta, setIsEnviandoAlerta] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [alertasNoLeidas, setAlertasNoLeidas] = useState(0);

  // ⬇️ loading por alerta al enviar "YA VOY"
  const [enviandoYaVoy, setEnviandoYaVoy] = useState<Set<number>>(new Set());

  // ⬇️ Bloqueos de botón YA VOY: Map<alertaId, timestampDeBloqueoHasta>
  const [bloqueosYaVoy, setBloqueosYaVoy] = useState<Map<number, number>>(new Map());

  // Funciones para formatear fecha y hora
  const formatFecha = (fecha: string) => {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  };
  const formatHora = (fecha: string) => {
      const date = new Date(fecha);
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  // Cargar bloqueos desde AsyncStorage al montar y limpiar expirados
  useEffect(() => {
    const loadBlocks = async () => {
      try {
        const stored = await AsyncStorage.getItem('bloqueosYaVoy');
        if (stored) {
          const parsed = JSON.parse(stored);
          const now = Date.now();
          const validBlocks = new Map<number, number>();

          // Solo mantener bloqueos que no han expirado
          Object.entries(parsed).forEach(([alertId, timestamp]) => {
            if (typeof timestamp === 'number' && timestamp > now) {
              validBlocks.set(Number(alertId), timestamp);
            }
          });

          setBloqueosYaVoy(validBlocks);
          console.log('📱 Bloqueos YA VOY cargados:', validBlocks.size);
        }
      } catch (e) {
        console.log('Error al cargar bloqueos YA VOY:', e);
      }
    };

    loadBlocks();

    // Limpiar bloqueos expirados cada 10 segundos
    const cleanupInterval = setInterval(() => {
      setBloqueosYaVoy(prev => {
        const now = Date.now();
        const newMap = new Map(prev);
        let changed = false;

        newMap.forEach((timestamp, alertId) => {
          if (timestamp <= now) {
            newMap.delete(alertId);
            changed = true;
          }
        });

        if (changed) {
          console.log('🧹 Limpiando bloqueos expirados');
          // Persistir cambios
          const obj = Object.fromEntries(newMap);
          AsyncStorage.setItem('bloqueosYaVoy', JSON.stringify(obj));
        }

        return changed ? newMap : prev;
      });
    }, 10000);

    return () => clearInterval(cleanupInterval);
  }, []);

  // ⬇️ helper robusto para enviar "YA VOY" probando múltiples endpoints (prioriza el correcto)
  const sendYaVoyWithFallback = useCallback(
    async (alerta: Alerta, authHeader: AxiosRequestConfig) => {
      const attempts: Array<() => Promise<any>> = [
        // ✅ #0: CORRECTO en tu backend → PUT /alertas/:id?confirmado=true&notas=...
        async () =>
          axios.put(
            `${API_URL}/alertas/${alerta.id}`,
            null, // sin body
            {
              ...authHeader,
              params: { confirmado: true, notas: 'Ayuda en camino' },
            }
          ),

        // (Fallbacks opcionales por si mantienes otros servicios)
        async () =>
          axios.post(
            `${API_URL}/mensajes`,
            { adulto_mayor_id: alerta.adulto_mayor_id, contenido: 'Ayuda en camino' },
            authHeader
          ),

        async () =>
          axios.post(
            `${API_URL}/notificaciones/enviar`,
            {
              tipo: 'ya_voy',
              alerta_id: alerta.id,
              adulto_mayor_id: alerta.adulto_mayor_id,
              mensaje: 'Ayuda en camino',
            },
            authHeader
          ),
      ];

      let lastErr: any = null;
      for (const run of attempts) {
        try {
          const res = await run();
          if (res?.status >= 200 && res?.status < 300) {
            console.log('✅ YA VOY enviado');
            return true;
          }
        } catch (err: any) {
          lastErr = err;
          const status = err?.response?.status;
          const detail = err?.response?.data?.detail || err?.message;
          console.warn(`❌ Intento fallido (${status}): ${detail}`);
          // seguimos probando el siguiente intento
        }
      }
      throw lastErr || new Error('Sin endpoints disponibles para YA VOY');
    },
    []
  );

  // Handler YA VOY
  const handleYaVoy = useCallback(async (alerta: Alerta) => {
    if (!user) return;
    const id = alerta.id;

    // Verificar si está bloqueado
    const blockedUntil = bloqueosYaVoy.get(id);
    if (blockedUntil && blockedUntil > Date.now()) {
      console.log('⏸️ Botón YA VOY bloqueado para alerta', id);
      return;
    }

    setEnviandoYaVoy(prev => new Set(prev).add(id));
    try {
      const token = await user.getIdToken();
      const authHeader = { headers: { Authorization: `Bearer ${token}` } };

      await sendYaVoyWithFallback(alerta, authHeader);

      showToast('success', 'Ayuda en camino', `Se informó a ${alerta.nombre_adulto_mayor || 'la persona'}: "Ayuda en camino"`);

      // marcar alerta como confirmada y ajustar contador
      setAlertas(prev => prev.map(a => (a.id === id ? { ...a, confirmado_por_cuidador: true } : a)));
      setAlertasNoLeidas(prev => Math.max(0, prev - 1));

      // ✅ BLOQUEAR BOTÓN POR 3 MINUTOS (180000ms)
      const blockUntil = Date.now() + 180000;
      setBloqueosYaVoy(prev => {
        const newMap = new Map(prev);
        newMap.set(id, blockUntil);

        // Persistir en AsyncStorage
        const obj = Object.fromEntries(newMap);
        AsyncStorage.setItem('bloqueosYaVoy', JSON.stringify(obj));

        console.log(`🔒 Botón YA VOY bloqueado para alerta ${id} hasta ${new Date(blockUntil).toLocaleTimeString()}`);
        return newMap;
      });

    } catch (error) {
      console.error('Error YA VOY:', error);
      const msg =
        axios.isAxiosError(error) && (error.response?.data?.detail || error.message)
          ? (error.response?.data?.detail || error.message)
          : 'No se pudo enviar la confirmación.';
      showToast('error', 'Error', msg);
    } finally {
      setEnviandoYaVoy(prev => {
        const copy = new Set(prev);
        copy.delete(id);
        return copy;
      });
    }
  }, [user, sendYaVoyWithFallback, bloqueosYaVoy]);
  
  // Función reutilizable para refrescar datos del dashboard
  const refetchDashboardData = useCallback(async (skipProfile = true) => {
    if (!isAuthenticated || !user) {
      return;
    }

    try {
      const token = await user.getIdToken();
      if (!token) {
        console.error('No se pudo obtener el token de Firebase.');
        return;
      }

      const authHeader = { headers: { Authorization: `Bearer ${token}` } };

      console.log('🔄 Refrescando datos del dashboard...');

      // Realizar todas las llamadas en paralelo (excepto perfil si ya lo tenemos)
      const requests = skipProfile
        ? [
            axios.get(`${API_URL}/solicitudes-cuidado/recibidas`, authHeader),
            axios.get(`${API_URL}/recordatorios`, authHeader),
            axios.get(`${API_URL}/alertas`, authHeader)
          ]
        : [
            axios.get(`${API_URL}/usuarios/yo`, authHeader),
            axios.get(`${API_URL}/solicitudes-cuidado/recibidas`, authHeader),
            axios.get(`${API_URL}/recordatorios`, authHeader),
            axios.get(`${API_URL}/alertas`, authHeader)
          ];

      const responses = await Promise.all(requests);

      let profileResponse, solicitudesResponse, recordatoriosResponse, alertasResponse;

      if (skipProfile) {
        [solicitudesResponse, recordatoriosResponse, alertasResponse] = responses;
      } else {
        [profileResponse, solicitudesResponse, recordatoriosResponse, alertasResponse] = responses;
        setUserProfile(profileResponse.data as UserProfile);
        console.log('IndexScreen: Perfil obtenido:', profileResponse.data.rol);
      }

      // Procesar solicitudes
      const pendientes = solicitudesResponse.data.filter((s: any) => s.estado === 'pendiente').length;
      setSolicitudesPendientes(pendientes);

      // Procesar recordatorios
      const sortedRecordatorios = (recordatoriosResponse.data as Recordatorio[]).sort(
          (a, b) => new Date(a.fecha_hora_programada).getTime() - new Date(b.fecha_hora_programada).getTime()
      );
      setRecordatorios(sortedRecordatorios);
      console.log(`✅ Recordatorios actualizados: ${sortedRecordatorios.length}`);

      // Procesar alertas
      const sortedAlertas = (alertasResponse.data as Alerta[]).sort(
          (a, b) => new Date(b.timestamp_alerta).getTime() - new Date(a.timestamp_alerta).getTime()
      );
      setAlertas(sortedAlertas);

      // Contar alertas no leídas (las que no han sido confirmadas por el cuidador)
      const noLeidas = sortedAlertas.filter(a => a.confirmado_por_cuidador === null || a.confirmado_por_cuidador === false).length;
      setAlertasNoLeidas(noLeidas);
      console.log(`✅ Alertas actualizadas: ${sortedAlertas.length}, No leídas: ${noLeidas}`);

    } catch (fetchError) {
      console.error('IndexScreen: Error al refrescar datos:', fetchError);
    }
  }, [user, isAuthenticated]);

  // Efecto para buscar el perfil del usuario y otros datos cuando está autenticado
  useEffect(() => {
    const fetchAllData = async () => {
      if (!isAuthenticated || !user) {
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setProfileError(null);

      try {
        await refetchDashboardData(false); // Incluir perfil en la primera carga
      } catch (fetchError) {
        console.error('IndexScreen: Error al obtener datos:', fetchError);
        setProfileError('No se pudo cargar tu información. Intenta iniciar sesión de nuevo.');
        setUserProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };

    fetchAllData();
  }, [user, isAuthenticated, refetchDashboardData]);

  // Escuchar eventos de WebSocket para actualizar el dashboard automáticamente
  useEffect(() => {
    if (Platform.OS !== 'web' || !user || !isAuthenticated || !userProfile) {
      return;
    }

    // Listener para nuevas alertas (CUIDADORES)
    const handleNuevaAlerta = async (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('🔔 Evento nueva-alerta recibido en index.tsx', customEvent.detail);

      if (userProfile.rol === 'cuidador') {
        // Refrescar todos los datos del dashboard para cuidadores
        console.log('🔄 Refrescando dashboard de cuidador por nueva alerta...');
        await refetchDashboardData(true);
      }
    };

    // Listener para confirmaciones de alerta (ADULTOS MAYORES)
    const handleConfirmacionAlerta = async (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('💙 Evento confirmacion-alerta recibido en index.tsx', customEvent.detail);

      if (userProfile.rol === 'adulto_mayor') {
        // Refrescar alertas para mostrar el estado actualizado
        console.log('🔄 Refrescando dashboard de adulto mayor por confirmación...');
        await refetchDashboardData(true);
      }
    };

    // Registrar listeners
    window.addEventListener('nueva-alerta', handleNuevaAlerta);
    window.addEventListener('confirmacion-alerta', handleConfirmacionAlerta);

    return () => {
      window.removeEventListener('nueva-alerta', handleNuevaAlerta);
      window.removeEventListener('confirmacion-alerta', handleConfirmacionAlerta);
    };
  }, [user, isAuthenticated, userProfile, refetchDashboardData]);

  // Función para enviar alerta de ayuda
  const enviarAlertaAyuda = useCallback(async () => {
    if (isEnviandoAlerta || !user || !userProfile) return;

    setIsEnviandoAlerta(true);

    try {
      const token = await user.getIdToken();
      const authHeader = { headers: { Authorization: `Bearer ${token}` } };

      // Si el usuario es adulto mayor, necesitamos obtener su adulto_mayor_id de la tabla adultos_mayores
      let adultoMayorId: number;

      if (userProfile.rol === 'adulto_mayor') {
        // Obtener el perfil de adulto mayor desde el endpoint específico
        const perfilAdultoResponse = await axios.get(`${API_URL}/adultos-mayores/mi-perfil`, authHeader);
        adultoMayorId = perfilAdultoResponse.data.id;
        console.log(`Adulto mayor ID obtenido: ${adultoMayorId}`);
      } else if (userProfile.rol === 'cuidador') {
        // Los cuidadores podrían tener un adulto_mayor_id asociado si están vinculados a uno específico
        const adultoMayorIdFromProfile = (userProfile as any).adulto_mayor_id;
        if (!adultoMayorIdFromProfile) {
          throw new Error('No tienes un adulto mayor asociado para enviar alertas.');
        }
        adultoMayorId = adultoMayorIdFromProfile;
      } else {
        throw new Error('Solo los adultos mayores pueden enviar alertas de ayuda.');
      }

      await axios.post(`${API_URL}/alertas`, { adulto_mayor_id: adultoMayorId, tipo_alerta: 'ayuda' }, authHeader);

      showToast('success', 'Alerta enviada', '¡Alerta de ayuda enviada! Tus cuidadores han sido notificados.');

      // Refrescar el dashboard para que el adulto mayor vea su alerta inmediatamente
      console.log('🔄 Refrescando dashboard después de enviar alerta...');
      await refetchDashboardData(true);

    } catch (error) {
      console.error('Error al enviar alerta de ayuda:', error);
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.detail || 'Error al enviar alerta de ayuda'
        : (error instanceof Error ? error.message : 'Error inesperado al enviar alerta');
      showToast('error', 'Error', errorMessage);
    } finally {
      setIsEnviandoAlerta(false);
    }
  }, [user, userProfile, isEnviandoAlerta, refetchDashboardData]);


  // --- Renderizado ---

  // Muestra carga global si el AuthProvider aún está verificando
  if (isAuthLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }
  
  // Muestra carga específica del perfil si Auth está listo pero el perfil no
  if (profileLoading) {
      return (
         <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#1e3a8a" />
            <Text>Cargando tu información...</Text>
         </View>
      )
  }

  // Muestra error si falló la carga del perfil
  if (profileError) {
     return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{profileError}</Text>
        <Button title="Ir a Inicio de Sesión" onPress={() => router.replace('/login')} />
      </View>
    );
  }

  // Si está autenticado y tenemos el perfil, mostramos el dashboard correcto
  if (isAuthenticated && userProfile) {
    return (
      <View style={{ flex: 1 }}>

        <ScrollView style={styles.container}>
          <Text style={styles.welcome}>¡Bienvenido, {userProfile.nombre}!</Text>
        
        {/* --- Dashboard del Cuidador --- */}
        {userProfile.rol === 'cuidador' && (
          <>
            {/* Notificación de solicitudes pendientes */}
            {solicitudesPendientes > 0 && (
              <Pressable
                style={styles.notificationBanner}
                onPress={() => router.push('/solicitudes')}
              >
                <View style={styles.notificationContent}>
                  <UserPlus size={24} color="#2563eb" />
                  <View style={styles.notificationText}>
                    <Text style={styles.notificationTitle}>
                      {solicitudesPendientes} solicitud{solicitudesPendientes > 1 ? 'es' : ''} pendiente{solicitudesPendientes > 1 ? 's' : ''}
                    </Text>
                    <Text style={styles.notificationSubtitle}>
                      Toca para ver y responder
                    </Text>
                  </View>
                </View>
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{solicitudesPendientes}</Text>
                </View>
              </Pressable>
            )}

            <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
            <Text style={styles.subsectionTitle}>Gestión de Personas</Text>
            <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/cuidador/adultos-mayores')}>
              <Users size={20} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>Ver Personas a Cuidar</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.greenButton]} onPress={() => router.push('/cuidador/agregar-persona')}>
              <UserPlus size={20} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>Agregar Persona</Text>
            </Pressable>

            <Text style={styles.subsectionTitle}>Otros</Text>
            <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/cuidador/seleccionar-adulto-recordatorios')}>
              <Text style={styles.buttonText}>Gestionar Recordatorios</Text>
            </Pressable>

            {/* Sección de Alertas Recientes */}
            <View style={styles.alertsSection}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Alertas Recientes</Text>
                {alertasNoLeidas > 0 && (
                  <View style={styles.alertBadge}>
                    <Text style={styles.alertBadgeText}>{alertasNoLeidas}</Text>
                  </View>
                )}
              </View>

              <Pressable style={[styles.actionButton, styles.greyButton]} onPress={() => router.push('/cuidador/alertas')}>
                 <Bell size={16} color="#374151" style={{ marginRight: 8 }} />
                 <Text style={[styles.buttonText, {color: '#374151'}]}>Ver Historial Completo</Text>
              </Pressable>

              {alertas.length > 0 ? (
                  <>
                    {alertas.slice(0, 3).map((alerta) => {
                      const blockedUntil = bloqueosYaVoy.get(alerta.id);
                      const isBlocked = blockedUntil ? blockedUntil > Date.now() : false;

                      return (
                        <AlertPreviewCard
                            key={`alert-${alerta.id}`}
                            alert={{
                                id: `alert-${alerta.id}`,
                                type: alerta.tipo_alerta === 'ayuda' ? 'warning' : 'error',
                                title: alerta.tipo_alerta === 'ayuda' ? '¡Solicitud de Ayuda!' : '⚠️ Alerta de Caída',
                                message: alerta.nombre_adulto_mayor
                                    ? `${alerta.nombre_adulto_mayor} · ${new Date(alerta.timestamp_alerta).toLocaleTimeString('es-ES', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}`
                                    : new Date(alerta.timestamp_alerta).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                                timestamp: new Date(alerta.timestamp_alerta),
                                read: alerta.confirmado_por_cuidador !== null,
                                hasSnapshot: alerta.detalles_adicionales?.snapshot_url ? true : false,
                                alertaIdNumerico: alerta.id
                            }}
                            onPressAction={() => handleYaVoy(alerta)}
                            loading={enviandoYaVoy.has(alerta.id)}
                            blocked={isBlocked}
                            blockedUntil={blockedUntil}
                        />
                      );
                    })}
                  </>
              ) : (
                  <Text style={styles.noAlerts}>No hay alertas recientes.</Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Próximos Recordatorios (Todos)</Text>

            <Pressable style={[styles.actionButton, styles.greyButton]} onPress={() => router.push('/cuidador/recordatorios')}>
               <CalendarCheck size={16} color="#374151" style={{ marginRight: 8 }} />
               <Text style={[styles.buttonText, {color: '#374151'}]}>Ver Todos los Recordatorios</Text>
            </Pressable>

            {recordatorios.length > 0 ? (
                <>
                  {recordatorios.slice(0, 3).map((rec) => ( // Mostrar los 3 más próximos
                      <AlertPreviewCard
                          key={`rec-${rec.id}`}
                          alert={{
                              id: `rec-${rec.id}`,
                              type: 'info', // Todos los recordatorios son 'info'
                              title: `Recordatorio: ${rec.titulo}`,
                              message: rec.nombre_adulto_mayor
                                  ? `${rec.nombre_adulto_mayor} - ${rec.descripcion || 'Sin descripción'}`
                                  : rec.descripcion || 'Sin descripción',
                              timestamp: new Date(rec.fecha_hora_programada),
                              read: rec.estado !== 'pendiente'
                          }}
                          // NO pasamos onPressAction => sin botón YA VOY
                      />
                  ))}
                </>
            ) : (
                <Text style={styles.noAlerts}>No hay recordatorios próximos.</Text>
            )}
          </>
        )}

        {/* --- Dashboard del Adulto Mayor --- */}
        {userProfile.rol === 'adulto_mayor' && (
           <>
            {/* Notificación de solicitudes pendientes */}
            {solicitudesPendientes > 0 && (
              <Pressable
                style={styles.notificationBanner}
                onPress={() => router.push('/solicitudes')}
              >
                <View style={styles.notificationContent}>
                  <UserPlus size={24} color="#2563eb" />
                  <View style={styles.notificationText}>
                    <Text style={styles.notificationTitle}>
                      {solicitudesPendientes} solicitud{solicitudesPendientes > 1 ? 'es' : ''} de cuidado
                    </Text>
                    <Text style={styles.notificationSubtitle}>
                      Toca para ver y responder
                    </Text>
                  </View>
                </View>
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{solicitudesPendientes}</Text>
                </View>
              </Pressable>
            )}

            <Pressable
              style={[styles.actionButton, styles.panicButton, isEnviandoAlerta && styles.disabledButton]}
              onPress={enviarAlertaAyuda}
              disabled={isEnviandoAlerta}
            >
              {isEnviandoAlerta ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.buttonText}>BOTÓN DE AYUDA</Text>
              )}
            </Pressable>

            {/* Sección de Alertas Confirmadas */}
            <View style={styles.alertsSection}>
              <Text style={styles.sectionTitle}>Estado de Mis Alertas</Text>
              {alertas.length > 0 ? (
                <>
                  {alertas.slice(0, 5).map((alerta) => (
                    <View
                      key={`alert-am-${alerta.id}`}
                      style={[
                        styles.card,
                        {
                          borderLeftWidth: 4,
                          borderLeftColor: alerta.confirmado_por_cuidador ? '#10b981' : '#f59e0b',
                          borderWidth: 0,
                          borderTopLeftRadius: 0,
                          borderBottomLeftRadius: 0
                        }
                      ]}
                    >
                      <View style={styles.row}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          {alerta.confirmado_por_cuidador ? (
                            <CheckCircle size={20} color="#10b981" style={{ marginRight: 12 }} />
                          ) : (
                            <AlertTriangle size={20} color="#f59e0b" style={{ marginRight: 12 }} />
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>
                              {alerta.tipo_alerta === 'ayuda' ? 'Solicitud de Ayuda' : 'Alerta de Caída'}
                            </Text>
                            <Text style={styles.cardMessage}>
                              {new Date(alerta.timestamp_alerta).toLocaleString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Text>
                            {alerta.notas && (
                              <Text style={[styles.cardMessage, { color: '#10b981', fontWeight: '600', marginTop: 4 }]}>
                                💙 {alerta.notas}
                              </Text>
                            )}
                          </View>
                        </View>
                        <View style={[
                          styles.statusBadge,
                          { backgroundColor: alerta.confirmado_por_cuidador ? '#d1fae5' : '#fef3c7' }
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            { color: alerta.confirmado_por_cuidador ? '#065f46' : '#92400e' }
                          ]}>
                            {alerta.confirmado_por_cuidador ? 'En camino' : 'Pendiente'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.noAlerts}>No hay alertas recientes.</Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Mis Próximos Recordatorios</Text>

            <Pressable style={[styles.actionButton, styles.greyButton]} onPress={() => router.push('/cuidador/recordatorios')}>
               <Text style={[styles.buttonText, {color: '#374151'}]}>Ver todos mis recordatorios</Text>
            </Pressable>

            {recordatorios.length > 0 ? (
                recordatorios.slice(0, 5).map(rec => ( // Mostrar solo los 5 más próximos
                    <Pressable
                        key={rec.id}
                        style={styles.simpleCard}
                        onPress={() => {
                            setSelectedRecordatorio(rec);
                            setIsModalVisible(true);
                        }}
                    >
                        <Text style={styles.simpleCardTitle}>{rec.titulo}</Text>
                        {rec.descripcion ? <Text style={styles.simpleCardText}>{rec.descripcion}</Text> : null}
                        <Text style={styles.simpleCardDate}>{formatFecha(rec.fecha_hora_programada)} - {formatHora(rec.fecha_hora_programada)}</Text>
                    </Pressable>
                ))
            ) : (
                <Text style={styles.placeholderText}>No tienes recordatorios programados.</Text>
            )}
          </>
        )}
        
         {/* --- Panel de Admin --- */}
         {userProfile.rol === 'administrador' && ( 
           <View>
             <Text style={styles.sectionTitle}>Panel de Administración</Text>
             <Text style={styles.placeholderText}>[Opciones de Administración]</Text>
           </View> 
          )}
          {/* --- FIN Panel de Admin --- */}

        </ScrollView>

        {/* Modal de detalle del recordatorio */}
        <Modal
          visible={isModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsModalVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setIsModalVisible(false)}
          >
            <Pressable
              style={styles.modalContent}
              onPress={(e) => e.stopPropagation()}
            >
              {selectedRecordatorio && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Detalle del Recordatorio</Text>
                    <Pressable onPress={() => setIsModalVisible(false)} style={styles.modalCloseButton}>
                      <X size={24} color="#6b7280" />
                    </Pressable>
                  </View>

                  <ScrollView style={styles.modalBody}>
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Título</Text>
                      <Text style={styles.modalValue}>{selectedRecordatorio.titulo}</Text>
                    </View>

                    {selectedRecordatorio.descripcion && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalLabel}>Descripción</Text>
                        <Text style={styles.modalValue}>{selectedRecordatorio.descripcion}</Text>
                      </View>
                    )}

                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Fecha y Hora</Text>
                      <Text style={styles.modalValue}>
                        {new Date(selectedRecordatorio.fecha_hora_programada).toLocaleString('es-ES', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                    </View>

                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Tipo</Text>
                      <Text style={styles.modalValue}>
                        {selectedRecordatorio.tipo_recordatorio === 'medicamento' && '💊 Medicamento'}
                        {selectedRecordatorio.tipo_recordatorio === 'cita_medica' && '🏥 Cita Médica'}
                        {selectedRecordatorio.tipo_recordatorio === 'ejercicio' && '🏃 Ejercicio'}
                        {selectedRecordatorio.tipo_recordatorio === 'hidratacion' && '💧 Hidratación'}
                        {selectedRecordatorio.tipo_recordatorio === 'comida' && '🍽️ Comida'}
                        {selectedRecordatorio.tipo_recordatorio === 'consejo_salud' && '💜 Consejo de Salud'}
                        {selectedRecordatorio.tipo_recordatorio === 'otro' && '📌 Otro'}
                        {!selectedRecordatorio.tipo_recordatorio && '📌 Sin especificar'}
                      </Text>
                    </View>

                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Frecuencia</Text>
                      <Text style={styles.modalValue}>
                        {selectedRecordatorio.frecuencia === 'una_vez' && 'Una vez'}
                        {selectedRecordatorio.frecuencia === 'diario' && 'Diario'}
                        {selectedRecordatorio.frecuencia === 'semanal' && 'Semanal'}
                        {selectedRecordatorio.frecuencia === 'mensual' && 'Mensual'}
                      </Text>
                    </View>

                    {selectedRecordatorio.dias_semana && selectedRecordatorio.dias_semana.length > 0 && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalLabel}>Días de la semana</Text>
                        <Text style={styles.modalValue}>
                          {selectedRecordatorio.dias_semana.map(dia => {
                            const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                            return dias[dia];
                          }).join(', ')}
                        </Text>
                      </View>
                    )}

                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Estado</Text>
                      <View style={[
                        styles.modalStatusBadge,
                        selectedRecordatorio.estado === 'pendiente' && { backgroundColor: '#fef3c7' },
                        selectedRecordatorio.estado === 'enviado' && { backgroundColor: '#dbeafe' },
                        selectedRecordatorio.estado === 'confirmado' && { backgroundColor: '#d1fae5' },
                        selectedRecordatorio.estado === 'omitido' && { backgroundColor: '#fee2e2' }
                      ]}>
                        <Text style={[
                          styles.modalStatusText,
                          selectedRecordatorio.estado === 'pendiente' && { color: '#92400e' },
                          selectedRecordatorio.estado === 'enviado' && { color: '#1e40af' },
                          selectedRecordatorio.estado === 'confirmado' && { color: '#065f46' },
                          selectedRecordatorio.estado === 'omitido' && { color: '#991b1b' }
                        ]}>
                          {selectedRecordatorio.estado === 'pendiente' && 'Pendiente'}
                          {selectedRecordatorio.estado === 'enviado' && 'Enviado'}
                          {selectedRecordatorio.estado === 'confirmado' && 'Confirmado'}
                          {selectedRecordatorio.estado === 'omitido' && 'Omitido'}
                        </Text>
                      </View>
                    </View>
                  </ScrollView>

                  <View style={styles.modalFooter}>
                    <Pressable
                      style={styles.modalCloseButtonLarge}
                      onPress={() => setIsModalVisible(false)}
                    >
                      <Text style={styles.modalCloseButtonText}>Cerrar</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // Si no está autenticado (y no está cargando), el useEffect de arriba se encargará de la redirección.
  // Mientras tanto, mostramos un loader para evitar una pantalla en blanco.
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#1e3a8a" />
    </View>
  );
}

// Estilos
const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f0f4f8' },
  container: { flex: 1, padding: 20, paddingTop: 10, backgroundColor: '#f0f4f8' },
  welcome: { fontSize: 24, fontWeight: 'bold', marginBottom: 5, marginTop: 10, textAlign: 'center', color: '#1e3a8a' },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginTop: 25, marginBottom: 15, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#d1d5db', paddingBottom: 5 },
  subsectionTitle: { fontSize: 16, fontWeight: '500', marginTop: 10, marginBottom: 10, color: '#374151', paddingLeft: 5 },
  errorText: { color: 'red', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  redirectText: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  actionButton: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10, flexDirection: 'row', justifyContent: 'center' },
  blueButton: { backgroundColor: '#2563eb' },
  greenButton: { backgroundColor: '#10b981' },
  greyButton: { backgroundColor: '#e5e7eb' },
  panicButton: { backgroundColor: '#dc2626', paddingVertical: 20, marginTop: 20 },
  disabledButton: { backgroundColor: '#9ca3af', opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  logoutButton: { backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 40, marginBottom: 20 },
  placeholderText:{ textAlign: 'center', color: '#9ca3af', marginVertical: 20 },
  noAlerts: { textAlign: 'center', color: '#6b7280', fontSize: 14, marginTop: 10, marginBottom: 10 },
  // Estilos para notificación de solicitudes
  notificationBanner: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notificationText: {
    marginLeft: 12,
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e3a8a',
    marginBottom: 2,
  },
  notificationSubtitle: {
    fontSize: 13,
    color: '#3b82f6',
  },
  notificationBadge: {
    backgroundColor: '#2563eb',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Estilos AlertPreviewCard
   card: {
    backgroundColor: 'white', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 15, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 2,
    borderLeftWidth: 4, // Indicador de color a la izquierda
    borderWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, // Ajustes para borde izquierdo
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '600', fontSize: 15, marginBottom: 2, color: '#1f2937'},
  cardMessage: { fontSize: 13, color: '#4b5563' },
  cardTimestamp: { fontSize: 12, color: '#9ca3af', marginLeft: 10 },
  // --- AÑADIR ESTILOS FALTANTES AQUÍ ---
  simpleCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  simpleCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  simpleCardText: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
  },
  simpleCardDate: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7c3aed', // Morado para destacar la fecha
  },
  // Estilos del Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    maxHeight: 500,
  },
  modalSection: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  modalValue: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  modalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  modalStatusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  modalCloseButtonLarge: {
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  alertsSection: {
    marginTop: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  alertBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },

  goButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
    marginLeft: 10,
  },
  goButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
