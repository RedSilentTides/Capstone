import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, CheckCircle, Info, X, Bell, Lightbulb, Heart } from 'lucide-react-native';
import { useAuth } from '../_layout';
import CustomHeader from '../../components/CustomHeader';
import SlidingPanel from '../../components/Slidingpanel';

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Tipos de alertas expandidos
type AlertType = 'caida' | 'recordatorio' | 'consejo' | 'sistema';

interface Alerta {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  icon?: string;
  adulto_mayor_nombre?: string;
}

interface EventoCaida {
  id: number;
  dispositivo_id: number;
  timestamp_caida: string;
  url_video_almacenado?: string | null;
  confirmado_por_usuario?: boolean | null;
  detalles_adicionales?: any | null;
  nombre_dispositivo?: string | null;
  nombre_adulto_mayor?: string | null;
}

// Configuración visual para cada tipo de alerta
const alertConfig: Record<AlertType, { color: string; bgColor: string }> = {
  caida: { color: '#ef4444', bgColor: '#fee2e2' },
  recordatorio: { color: '#3b82f6', bgColor: '#dbeafe' },
  consejo: { color: '#7c3aed', bgColor: '#ede9fe' },
  sistema: { color: '#10b981', bgColor: '#d1fae5' },
};

// Componente AlertCard mejorado
function AlertCard({ alert, onDismiss }: { alert: Alerta; onDismiss: (id: string) => void }) {
  const config = alertConfig[alert.type];

  const renderIcon = () => {
    const iconSize = 24;
    const iconColor = config.color;
    const iconStyle = { marginRight: 12 };

    switch (alert.type) {
      case 'caida':
        return <AlertTriangle size={iconSize} color={iconColor} style={iconStyle} />;
      case 'recordatorio':
        return <Bell size={iconSize} color={iconColor} style={iconStyle} />;
      case 'consejo':
        return <Lightbulb size={iconSize} color={iconColor} style={iconStyle} />;
      case 'sistema':
        return <CheckCircle size={iconSize} color={iconColor} style={iconStyle} />;
      default:
        return <Info size={iconSize} color={iconColor} style={iconStyle} />;
    }
  };

  const formattedTime = alert.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = alert.timestamp.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

  return (
    <View style={[styles.card, { borderLeftColor: config.color, borderLeftWidth: 4 }]}>
      <View style={styles.cardHeader}>
        {renderIcon()}
        <View style={styles.cardContent}>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>{alert.title}</Text>
            <Pressable onPress={() => onDismiss(alert.id)} style={styles.dismissButton}>
              <X color="#9ca3af" size={18} />
            </Pressable>
          </View>
          <Text style={styles.message}>{alert.message}</Text>
          {alert.adulto_mayor_nombre && (
            <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
              <Heart size={12} color={config.color} />
              <Text style={[styles.badgeText, { color: config.color }]}>{alert.adulto_mayor_nombre}</Text>
            </View>
          )}
          <Text style={styles.timestamp}>{formattedDate} • {formattedTime}</Text>
        </View>
      </View>
    </View>
  );
}

// Pantalla Principal
export default function AlertasScreen() {
  const router = useRouter();
  const { setAuthState } = useAuth();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Función reutilizable para obtener el token
  const getToken = useCallback(async (): Promise<string | null> => {
    const tokenKey = 'userToken';
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(tokenKey);
    } else {
      return await SecureStore.getItemAsync(tokenKey);
    }
  }, []);

  // Función para convertir eventos de caída a alertas
  const convertirEventosACaidas = (eventos: EventoCaida[]): Alerta[] => {
    return eventos.map(evento => ({
      id: `caida-${evento.id}`,
      type: 'caida' as AlertType,
      title: '¡Alerta de Caída Detectada!',
      message: `Detectado por ${evento.nombre_dispositivo || 'dispositivo'}`,
      timestamp: new Date(evento.timestamp_caida),
      read: evento.confirmado_por_usuario !== null,
      adulto_mayor_nombre: evento.nombre_adulto_mayor || undefined,
    }));
  };

  // Generar alertas de ejemplo (para poblar datos)
  const generarAlertasEjemplo = (): Alerta[] => {
    const ahora = new Date();

    return [
      {
        id: 'recordatorio-1',
        type: 'recordatorio',
        title: 'Recordatorio de Medicamento',
        message: 'Es hora de tomar la pastilla para la presión',
        timestamp: new Date(ahora.getTime() - 3600000),
        read: false,
        adulto_mayor_nombre: 'Alexander',
      },
      {
        id: 'consejo-1',
        type: 'consejo',
        title: 'Consejo de Salud',
        message: 'Recuerda que la hidratación es importante. Asegúrate de que tus adultos mayores beban suficiente agua.',
        timestamp: new Date(ahora.getTime() - 7200000),
        read: false,
      },
      {
        id: 'sistema-1',
        type: 'sistema',
        title: 'Sistema Actualizado',
        message: 'El sistema VigilIA se ha actualizado con nuevas funcionalidades de detección.',
        timestamp: new Date(ahora.getTime() - 10800000),
        read: true,
      },
      {
        id: 'recordatorio-2',
        type: 'recordatorio',
        title: 'Cita Médica Próxima',
        message: 'Recuerda la cita con el cardiólogo mañana a las 10:00 AM',
        timestamp: new Date(ahora.getTime() - 14400000),
        read: false,
        adulto_mayor_nombre: 'TEST4',
      },
      {
        id: 'consejo-2',
        type: 'consejo',
        title: 'Ejercicio Regular',
        message: 'El ejercicio ligero diario ayuda a mantener la movilidad y prevenir caídas.',
        timestamp: new Date(ahora.getTime() - 86400000),
        read: true,
      },
    ];
  };

  // Función para cargar alertas
  const fetchAlertas = useCallback(async (isRefreshing = false) => {
    if (!isRefreshing) setIsLoading(true);
    setError(null);

    const token = await getToken();

    if (!token) {
      setAuthState(false);
      router.replace('/login');
      return;
    }

    try {
      console.log('Obteniendo historial de eventos de caída...');

      // Obtener eventos de caída reales desde el API
      const response = await axios.get<EventoCaida[]>(`${API_URL}/eventos-caida`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Convertir eventos a alertas de caída
      const alertasCaidas = convertirEventosACaidas(response.data);

      // Agregar alertas de ejemplo (en producción, estas vendrían de otras tablas)
      const alertasEjemplo = generarAlertasEjemplo();

      // Combinar y ordenar por fecha
      const todasAlertas = [...alertasCaidas, ...alertasEjemplo].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );

      setAlertas(todasAlertas);
      console.log(`Alertas cargadas: ${todasAlertas.length}`);
    } catch (err) {
      console.error('Error al obtener alertas:', err);
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
        setError('Tu sesión ha expirado.');
        setAuthState(false);
        setTimeout(() => router.replace('/login'), 2000);
      } else {
        // Si hay error con la API, mostrar solo alertas de ejemplo
        const alertasEjemplo = generarAlertasEjemplo();
        setAlertas(alertasEjemplo);
        console.log('Mostrando alertas de ejemplo debido a error en API');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [getToken, router, setAuthState]);

  // Cargar alertas al montar
  useEffect(() => {
    fetchAlertas();
  }, [fetchAlertas]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAlertas(true);
  };

  // Función para descartar una alerta
  const handleDismiss = (id: string) => {
    setAlertas((prev) => prev.filter((a) => a.id !== id));
  };

  // Estadísticas de alertas
  const alertasNoLeidas = alertas.filter(a => !a.read).length;
  const alertasPorTipo = {
    caida: alertas.filter(a => a.type === 'caida').length,
    recordatorio: alertas.filter(a => a.type === 'recordatorio').length,
    consejo: alertas.filter(a => a.type === 'consejo').length,
    sistema: alertas.filter(a => a.type === 'sistema').length,
  };

  return (
    <View style={styles.container}>
      <CustomHeader
        title="Historial de Alertas"
        onMenuPress={() => setIsPanelOpen(true)}
        showBackButton={true}
      />

      {isLoading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={styles.loadingText}>Cargando alertas...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => fetchAlertas()}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Sección de estadísticas */}
          <View style={styles.statsSection}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{alertasNoLeidas}</Text>
              <Text style={styles.statLabel}>No leídas</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: '#ef4444' }]}>{alertasPorTipo.caida}</Text>
              <Text style={styles.statLabel}>Caídas</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: '#3b82f6' }]}>{alertasPorTipo.recordatorio}</Text>
              <Text style={styles.statLabel}>Recordatorios</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: '#7c3aed' }]}>{alertasPorTipo.consejo}</Text>
              <Text style={styles.statLabel}>Consejos</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.mainContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          >
            {alertas.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Bell size={64} color="#9ca3af" />
                <Text style={styles.noAlerts}>No hay alertas registradas</Text>
                <Text style={styles.noAlertsSubtext}>
                  Las alertas de caídas, recordatorios y consejos aparecerán aquí
                </Text>
              </View>
            ) : (
              alertas.map((alerta) => (
                <AlertCard
                  key={alerta.id}
                  alert={alerta}
                  onDismiss={handleDismiss}
                />
              ))
            )}
          </ScrollView>
        </>
      )}

      <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  loadingText: {
    marginTop: 10,
    color: '#6b7280',
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 16,
  },
  retryButton: {
    backgroundColor: '#7c3aed',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statCard: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#7c3aed',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  mainContent: {
    padding: 20
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  noAlerts: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
  },
  noAlertsSubtext: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 40,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardContent: {
    flex: 1
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  dismissButton: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  message: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
    lineHeight: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af'
  },
});
