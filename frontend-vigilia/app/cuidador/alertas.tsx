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

interface Recordatorio {
  id: number;
  adulto_mayor_id: number;
  titulo: string;
  descripcion?: string | null;
  fecha_hora_programada: string;
  frecuencia: 'una_vez' | 'diario' | 'semanal' | 'mensual';
  estado: string;
  tipo_recordatorio?: string;
  fecha_creacion: string;
  nombre_adulto_mayor?: string | null;
}

interface RecordatoriosPorAdultoMayor {
  adulto_mayor_id: number;
  nombre_adulto_mayor: string;
  recordatorios: Recordatorio[];
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

// Componente de ficha expandible para recordatorios por adulto mayor
function RecordatoriosAdultoMayorCard({ data, onToggle, isExpanded, recordatoriosLeidos }: {
  data: RecordatoriosPorAdultoMayor;
  onToggle: () => void;
  isExpanded: boolean;
  recordatoriosLeidos: Set<number>;
}) {
  const tipoRecordatorioIcons: Record<string, string> = {
    medicamento: '💊',
    cita_medica: '🏥',
    ejercicio: '🏃',
    hidratacion: '💧',
    comida: '🍽️',
    consejo_salud: '💜',
    otro: '📌',
  };

  // Contar cuántos recordatorios no están leídos
  const noLeidos = data.recordatorios.filter(rec => !recordatoriosLeidos.has(rec.id)).length;

  return (
    <View style={styles.adultoMayorCard}>
      <Pressable onPress={onToggle} style={styles.adultoMayorHeader}>
        <View style={styles.adultoMayorHeaderContent}>
          <Heart size={20} color="#7c3aed" style={{ marginRight: 8 }} />
          <Text style={styles.adultoMayorNombre}>{data.nombre_adulto_mayor}</Text>
          {noLeidos > 0 && (
            <View style={styles.noLeidoIndicator}>
              <Text style={styles.noLeidoText}>{noLeidos}</Text>
            </View>
          )}
        </View>
        <View style={styles.recordatoriosBadge}>
          <Text style={styles.recordatoriosBadgeText}>{data.recordatorios.length}</Text>
        </View>
      </Pressable>

      {isExpanded && (
        <View style={styles.recordatoriosList}>
          {data.recordatorios.map((rec) => {
            const icon = tipoRecordatorioIcons[rec.tipo_recordatorio || 'otro'] || '📌';
            const fecha = new Date(rec.fecha_hora_programada);
            const formattedDate = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            const formattedTime = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

            return (
              <View key={rec.id} style={styles.recordatorioItem}>
                <Text style={styles.recordatorioIcon}>{icon}</Text>
                <View style={styles.recordatorioContent}>
                  <Text style={styles.recordatorioTitulo}>{rec.titulo}</Text>
                  {rec.descripcion && (
                    <Text style={styles.recordatorioDescripcion}>{rec.descripcion}</Text>
                  )}
                  <Text style={styles.recordatorioFecha}>{formattedDate} • {formattedTime}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Pantalla Principal
export default function AlertasScreen() {
  const router = useRouter();
  const { setAuthState } = useAuth();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [recordatoriosPorAdultoMayor, setRecordatoriosPorAdultoMayor] = useState<RecordatoriosPorAdultoMayor[]>([]);
  const [expandedAdultos, setExpandedAdultos] = useState<Set<number>>(new Set());
  const [recordatoriosLeidos, setRecordatoriosLeidos] = useState<Set<number>>(new Set());
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

  // Funciones para persistir recordatorios leídos
  const RECORDATORIOS_LEIDOS_KEY = 'recordatorios_leidos';

  const guardarRecordatoriosLeidos = useCallback(async (recordatoriosIds: Set<number>) => {
    try {
      const idsArray = Array.from(recordatoriosIds);
      await AsyncStorage.setItem(RECORDATORIOS_LEIDOS_KEY, JSON.stringify(idsArray));
      console.log(`✅ Guardados ${idsArray.length} recordatorios leídos en AsyncStorage`);
    } catch (error) {
      console.error('Error al guardar recordatorios leídos:', error);
    }
  }, []);

  const cargarRecordatoriosLeidos = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(RECORDATORIOS_LEIDOS_KEY);
      if (stored) {
        const idsArray = JSON.parse(stored) as number[];
        console.log(`✅ Cargados ${idsArray.length} recordatorios leídos desde AsyncStorage`);
        return new Set(idsArray);
      }
      return new Set<number>();
    } catch (error) {
      console.error('Error al cargar recordatorios leídos:', error);
      return new Set<number>();
    }
  }, []);

  const limpiarRecordatoriosAntiguos = useCallback(async (recordatoriosActuales: Recordatorio[]) => {
    try {
      // Obtener IDs de recordatorios actuales
      const idsActuales = new Set(recordatoriosActuales.map(rec => rec.id));

      // Cargar IDs leídos guardados
      const leidosGuardados = await cargarRecordatoriosLeidos();

      // Filtrar solo los que todavía existen
      const leidosFiltrados = Array.from(leidosGuardados).filter(id => idsActuales.has(id));

      // Si hubo cambios, guardar la versión limpia
      if (leidosFiltrados.length !== leidosGuardados.size) {
        const eliminados = leidosGuardados.size - leidosFiltrados.length;
        await AsyncStorage.setItem(RECORDATORIOS_LEIDOS_KEY, JSON.stringify(leidosFiltrados));
        console.log(`🧹 Limpiados ${eliminados} recordatorios antiguos del almacenamiento`);
      }
    } catch (error) {
      console.error('Error al limpiar recordatorios antiguos:', error);
    }
  }, [cargarRecordatoriosLeidos]);

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

  // NOTA: Función eliminada - Ya no se generan alertas de prueba
  // En el futuro, las alertas de recordatorios, consejos y sistema
  // vendrán de endpoints reales del backend

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
      console.log('Obteniendo historial de eventos de caída y recordatorios...');

      // Obtener eventos de caída reales desde el API
      const responseCaidas = await axios.get<EventoCaida[]>(`${API_URL}/eventos-caida`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Convertir eventos a alertas de caída
      const alertasCaidas = convertirEventosACaidas(responseCaidas.data);

      // Obtener recordatorios
      const responseRecordatorios = await axios.get<Recordatorio[]>(`${API_URL}/recordatorios`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log(`Recordatorios obtenidos: ${responseRecordatorios.data.length}`);

      // Agrupar recordatorios por adulto mayor
      const recordatoriosAgrupados: Record<number, RecordatoriosPorAdultoMayor> = {};

      responseRecordatorios.data.forEach((rec) => {
        if (!recordatoriosAgrupados[rec.adulto_mayor_id]) {
          recordatoriosAgrupados[rec.adulto_mayor_id] = {
            adulto_mayor_id: rec.adulto_mayor_id,
            nombre_adulto_mayor: rec.nombre_adulto_mayor || 'Sin nombre',
            recordatorios: [],
          };
        }
        recordatoriosAgrupados[rec.adulto_mayor_id].recordatorios.push(rec);
      });

      // Convertir a array y ordenar recordatorios dentro de cada grupo
      const recordatoriosArray = Object.values(recordatoriosAgrupados).map((grupo) => ({
        ...grupo,
        recordatorios: grupo.recordatorios.sort(
          (a, b) => new Date(a.fecha_hora_programada).getTime() - new Date(b.fecha_hora_programada).getTime()
        ),
      }));

      setRecordatoriosPorAdultoMayor(recordatoriosArray);

      // Limpiar recordatorios antiguos del almacenamiento
      limpiarRecordatoriosAntiguos(responseRecordatorios.data);

      // Ordenar por fecha (más recientes primero)
      const todasAlertas = alertasCaidas.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );

      setAlertas(todasAlertas);
      console.log(`Alertas cargadas: ${todasAlertas.length}`);
      console.log(`Adultos mayores con recordatorios: ${recordatoriosArray.length}`);
    } catch (err) {
      console.error('Error al obtener alertas:', err);
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
        setError('Tu sesión ha expirado.');
        setAuthState(false);
        setTimeout(() => router.replace('/login'), 2000);
      } else {
        setError('No se pudieron cargar las alertas. Intenta nuevamente.');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [getToken, router, setAuthState, limpiarRecordatoriosAntiguos]);

  // Cargar recordatorios leídos desde AsyncStorage al iniciar
  useEffect(() => {
    const inicializarRecordatoriosLeidos = async () => {
      const leidos = await cargarRecordatoriosLeidos();
      setRecordatoriosLeidos(leidos);
    };
    inicializarRecordatoriosLeidos();
  }, [cargarRecordatoriosLeidos]);

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

  // Función para alternar expansión de adulto mayor
  const toggleAdultoMayor = (adultoMayorId: number) => {
    setExpandedAdultos((prev) => {
      const newSet = new Set(prev);
      const isExpanding = !newSet.has(adultoMayorId);

      if (newSet.has(adultoMayorId)) {
        newSet.delete(adultoMayorId);
      } else {
        newSet.add(adultoMayorId);

        // Marcar todos los recordatorios de este adulto mayor como leídos
        const grupo = recordatoriosPorAdultoMayor.find(g => g.adulto_mayor_id === adultoMayorId);
        if (grupo) {
          setRecordatoriosLeidos((prevLeidos) => {
            const newLeidos = new Set(prevLeidos);
            grupo.recordatorios.forEach(rec => newLeidos.add(rec.id));

            // Guardar en AsyncStorage
            guardarRecordatoriosLeidos(newLeidos);

            return newLeidos;
          });
        }
      }
      return newSet;
    });
  };

  // Estadísticas de alertas
  const totalRecordatorios = recordatoriosPorAdultoMayor.reduce((sum, grupo) => sum + grupo.recordatorios.length, 0);

  // Contar recordatorios no leídos
  const recordatoriosNoLeidos = recordatoriosPorAdultoMayor.reduce((count, grupo) => {
    const noLeidos = grupo.recordatorios.filter(rec => !recordatoriosLeidos.has(rec.id)).length;
    return count + noLeidos;
  }, 0);

  // Total de caídas y caídas no leídas (confirmado_por_usuario === null)
  const totalCaidas = alertas.filter(a => a.type === 'caida').length;
  const alertasCaidasNoLeidas = alertas.filter(a => a.type === 'caida' && !a.read).length;

  // Total de alertas no leídas (caídas + recordatorios)
  const alertasNoLeidas = alertasCaidasNoLeidas + recordatoriosNoLeidos;

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
              <Text style={[styles.statNumber, { color: '#ef4444' }]}>{totalCaidas}</Text>
              <Text style={styles.statLabel}>Caídas</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: '#3b82f6' }]}>{totalRecordatorios}</Text>
              <Text style={styles.statLabel}>Recordatorios</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.mainContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          >
            {/* Sección de Recordatorios por Adulto Mayor */}
            {recordatoriosPorAdultoMayor.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recordatorios por Persona</Text>
                {recordatoriosPorAdultoMayor.map((grupo) => (
                  <RecordatoriosAdultoMayorCard
                    key={grupo.adulto_mayor_id}
                    data={grupo}
                    isExpanded={expandedAdultos.has(grupo.adulto_mayor_id)}
                    onToggle={() => toggleAdultoMayor(grupo.adulto_mayor_id)}
                    recordatoriosLeidos={recordatoriosLeidos}
                  />
                ))}
              </View>
            )}

            {/* Sección de Alertas de Caída */}
            {alertas.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Alertas de Caída</Text>
                {alertas.map((alerta) => (
                  <AlertCard
                    key={alerta.id}
                    alert={alerta}
                    onDismiss={handleDismiss}
                  />
                ))}
              </View>
            )}

            {/* Mensaje cuando no hay nada */}
            {alertas.length === 0 && recordatoriosPorAdultoMayor.length === 0 && (
              <View style={styles.emptyContainer}>
                <Bell size={64} color="#9ca3af" />
                <Text style={styles.noAlerts}>No hay alertas registradas</Text>
                <Text style={styles.noAlertsSubtext}>
                  Las alertas de caídas, recordatorios y consejos aparecerán aquí
                </Text>
              </View>
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
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  statCard: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#7c3aed',
  },
  statLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
    fontWeight: '600',
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  adultoMayorCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  adultoMayorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
  },
  adultoMayorHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  adultoMayorNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  noLeidoIndicator: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noLeidoText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  recordatoriosBadge: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  recordatoriosBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  recordatoriosList: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  recordatorioItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  recordatorioIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  recordatorioContent: {
    flex: 1,
  },
  recordatorioTitulo: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  recordatorioDescripcion: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  recordatorioFecha: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
});
