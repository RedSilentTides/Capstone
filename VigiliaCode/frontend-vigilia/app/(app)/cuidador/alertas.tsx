import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform, RefreshControl, Modal, Image, Animated, DeviceEventEmitter, Dimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, CheckCircle, Info, X, Bell, Lightbulb, Heart, Camera, AlertCircle, BarChart3, Clock, TrendingUp, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../../contexts/AuthContext';
import CustomHeader from '../../../components/CustomHeader';
import { VictoryBar, VictoryChart, VictoryAxis, VictoryTheme } from 'victory';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import dayjs from 'dayjs';
import 'dayjs/locale/es';

dayjs.locale('es');

// Configurar calendario en español
LocaleConfig.locales['es'] = {
  monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  monthNamesShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  today: 'Hoy'
};
LocaleConfig.defaultLocale = 'es';

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Intervalo de actualización automática (30 segundos)
const AUTO_REFRESH_INTERVAL = 30000;

// Tipos de alertas expandidos
type AlertType = 'caida' | 'ayuda' | 'recordatorio' | 'consejo' | 'sistema';

interface Alerta {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  icon?: string;
  adulto_mayor_nombre?: string;
  hasSnapshot?: boolean;  // Indica si tiene foto disponible
  alertaIdNumerico?: number;  // ID numérico de la alerta para obtener snapshot
}

interface EventoCaida {
  id: number;
  adulto_mayor_id: number;
  dispositivo_id?: number | null;
  timestamp_alerta: string;
  url_video_almacenado?: string | null;
  confirmado_por_cuidador?: boolean | null;
  notas?: string | null;
  detalles_adicionales?: any | null;
  nombre_dispositivo?: string | null;
  nombre_adulto_mayor?: string | null;
  vista?: boolean | null;
}

interface AlertaAyuda {
  id: number;
  adulto_mayor_id: number;
  tipo_alerta: string;
  timestamp_alerta: string;
  confirmado_por_cuidador?: boolean | null;
  notas?: string | null;
  nombre_adulto_mayor?: string | null;
  vista?: boolean | null;
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
  vista?: boolean | null;
}

interface RecordatoriosPorAdultoMayor {
  adulto_mayor_id: number;
  nombre_adulto_mayor: string;
  recordatorios: Recordatorio[];
}

interface CaidasPorAdultoMayor {
  adulto_mayor_id: number;
  nombre_adulto_mayor: string;
  caidas: EventoCaida[];
}

interface AyudasPorAdultoMayor {
  adulto_mayor_id: number;
  nombre_adulto_mayor: string;
  ayudas: AlertaAyuda[];
}

interface AdultoMayor {
  id: number;
  usuario_id: number | null;
  nombre_completo: string;
  fecha_nacimiento: string | null;
  direccion: string | null;
  notas_relevantes: string | null;
  fecha_registro: string;
}

// Configuración visual para cada tipo de alerta
const alertConfig: Record<AlertType, { color: string; bgColor: string }> = {
  caida: { color: '#ef4444', bgColor: '#fee2e2' },
  ayuda: { color: '#f97316', bgColor: '#ffedd5' },
  recordatorio: { color: '#3b82f6', bgColor: '#dbeafe' },
  consejo: { color: '#7c3aed', bgColor: '#ede9fe' },
  sistema: { color: '#10b981', bgColor: '#d1fae5' },
};

// Componente Dashboard de Estadísticas de Caídas
function DashboardCaidas({
  eventos,
  recordatorios,
  adultosMayores,
  onSelectRecordatorio
}: {
  eventos: EventoCaida[];
  recordatorios: RecordatoriosPorAdultoMayor[];
  adultosMayores: AdultoMayor[];
  onSelectRecordatorio: (recordatorio: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'7days' | 'calendar'>('7days'); // Selector de vista
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM')); // Mes seleccionado para calendario
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // Día seleccionado en calendario
  const [selectedAdultoMayorId, setSelectedAdultoMayorId] = useState<number | null>(null); // null = Todos
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 48, 400);

  // Filtrar eventos por adulto mayor seleccionado
  const eventosFiltrados = selectedAdultoMayorId
    ? eventos.filter(e => e.adulto_mayor_id === selectedAdultoMayorId)
    : eventos;

  // Agregar datos por día (últimos 7 días)
  const getCaidasPorDia = () => {
    const ultimos7Dias = Array.from({ length: 7 }, (_, i) => {
      const fecha = dayjs().subtract(6 - i, 'day');
      return {
        fecha: fecha.format('YYYY-MM-DD'),
        label: fecha.format('DD MMM'),
        count: 0
      };
    });

    eventosFiltrados.forEach(evento => {
      const fechaEvento = dayjs(evento.timestamp_alerta).format('YYYY-MM-DD');
      const dia = ultimos7Dias.find(d => d.fecha === fechaEvento);
      if (dia) {
        dia.count++;
      }
    });

    return ultimos7Dias;
  };

  // Filtrar recordatorios por adulto mayor seleccionado
  const recordatoriosFiltrados = selectedAdultoMayorId
    ? recordatorios.filter(grupo => grupo.adulto_mayor_id === selectedAdultoMayorId)
    : recordatorios;

  // Obtener días con caídas y recordatorios para el calendario
  const getMarkedDates = () => {
    const marked: any = {};

    // Agregar caídas (filtradas por adulto mayor seleccionado)
    eventosFiltrados.forEach(evento => {
      const fecha = dayjs(evento.timestamp_alerta).format('YYYY-MM-DD');
      if (!marked[fecha]) {
        marked[fecha] = {
          selected: false,
          caidaCount: 0,
          recordatorios: [],
          dots: []
        };
      }
      marked[fecha].caidaCount++;
    });

    // Agregar recordatorios (filtrados por adulto mayor seleccionado)
    recordatoriosFiltrados.forEach(grupo => {
      grupo.recordatorios.forEach(rec => {
        const fecha = dayjs(rec.fecha_hora_programada).format('YYYY-MM-DD');
        if (!marked[fecha]) {
          marked[fecha] = {
            selected: false,
            caidaCount: 0,
            recordatorios: [],
            dots: []
          };
        }
        marked[fecha].recordatorios.push({
          ...rec,
          nombre_adulto_mayor: grupo.nombre_adulto_mayor
        });
      });
    });

    // Configurar colores y dots
    Object.keys(marked).forEach(fecha => {
      const data = marked[fecha];
      const caidaCount = data.caidaCount;
      const tieneRecordatorios = data.recordatorios.length > 0;

      // Color de fondo según caídas
      if (caidaCount >= 3) {
        marked[fecha].selectedColor = '#dc2626'; // Rojo oscuro para 3+ caídas
        marked[fecha].selected = true;
      } else if (caidaCount === 2) {
        marked[fecha].selectedColor = '#fb923c'; // Naranja para 2 caídas
        marked[fecha].selected = true;
      } else if (caidaCount === 1) {
        marked[fecha].selectedColor = '#fca5a5'; // Rosa claro para 1 caída
        marked[fecha].selected = true;
      }

      // Agregar dots para recordatorios (azul para futuros y pasados)
      if (tieneRecordatorios) {
        marked[fecha].dots = [{ color: '#3b82f6' }];
        marked[fecha].marked = true;
      }
    });

    return marked;
  };

  // Agregar datos por hora del día (todas las 24 horas)
  const getCaidasPorHora = () => {
    const horas = Array.from({ length: 24 }, (_, i) => ({
      hora: i,
      label: `${i}h`,
      count: 0
    }));

    eventosFiltrados.forEach(evento => {
      const hora = dayjs(evento.timestamp_alerta).hour();
      horas[hora].count++;
    });

    // Retornar todas las horas para mostrar distribución completa
    return horas;
  };

  const caidasPorDia = getCaidasPorDia();
  const caidasPorHora = getCaidasPorHora();
  const markedDates = getMarkedDates();
  const totalCaidas = eventosFiltrados.length;
  const promedioPorDia = (totalCaidas / 7).toFixed(1);
  const horaPico = caidasPorHora.length > 0
    ? caidasPorHora.reduce((prev, current) => (prev.count > current.count) ? prev : current)
    : null;

  return (
    <View style={styles.dashboardContainer}>
      <Pressable
        style={styles.dashboardHeader}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <View style={styles.dashboardHeaderContent}>
          <BarChart3 size={24} color="#7c3aed" />
          <Text style={styles.dashboardTitle}>Estadisticas de Caidas</Text>
        </View>
        <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
      </Pressable>

      {isExpanded && (
        <View style={styles.dashboardContent}>
          {/* Selector de Adulto Mayor */}
          {adultosMayores.length > 0 && (
            <View style={styles.adultoMayorSelectorContainer}>
              <Text style={styles.selectorLabel}>Filtrar por persona:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScrollView}>
                <Pressable
                  style={[
                    styles.selectorChip,
                    selectedAdultoMayorId === null && styles.selectorChipActive
                  ]}
                  onPress={() => setSelectedAdultoMayorId(null)}
                >
                  <Text style={[
                    styles.selectorChipText,
                    selectedAdultoMayorId === null && styles.selectorChipTextActive
                  ]}>Todos</Text>
                </Pressable>
                {adultosMayores.map(am => (
                  <Pressable
                    key={am.id}
                    style={[
                      styles.selectorChip,
                      selectedAdultoMayorId === am.id && styles.selectorChipActive
                    ]}
                    onPress={() => setSelectedAdultoMayorId(am.id)}
                  >
                    <Text style={[
                      styles.selectorChipText,
                      selectedAdultoMayorId === am.id && styles.selectorChipTextActive
                    ]}>{am.nombre_completo}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Métricas principales */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <AlertTriangle size={20} color="#ef4444" />
              <Text style={styles.metricValue}>{totalCaidas}</Text>
              <Text style={styles.metricLabel}>Total (7 dias)</Text>
            </View>
            <View style={styles.metricCard}>
              <TrendingUp size={20} color="#3b82f6" />
              <Text style={styles.metricValue}>{promedioPorDia}</Text>
              <Text style={styles.metricLabel}>Promedio/dia</Text>
            </View>
            <View style={styles.metricCard}>
              <Clock size={20} color="#7c3aed" />
              <Text style={styles.metricValue}>{horaPico ? `${horaPico.hora}h` : '-'}</Text>
              <Text style={styles.metricLabel}>Hora pico</Text>
            </View>
          </View>

          {/* Selector de vista */}
          {totalCaidas > 0 && (
            <>
              <View style={styles.viewSelectorContainer}>
                <Pressable
                  style={[styles.viewButton, viewMode === '7days' && styles.viewButtonActive]}
                  onPress={() => setViewMode('7days')}
                >
                  <BarChart3 size={18} color={viewMode === '7days' ? '#7c3aed' : '#6b7280'} />
                  <Text style={[styles.viewButtonText, viewMode === '7days' && styles.viewButtonTextActive]}>
                    Últimos 7 días
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.viewButton, viewMode === 'calendar' && styles.viewButtonActive]}
                  onPress={() => setViewMode('calendar')}
                >
                  <CalendarIcon size={18} color={viewMode === 'calendar' ? '#7c3aed' : '#6b7280'} />
                  <Text style={[styles.viewButtonText, viewMode === 'calendar' && styles.viewButtonTextActive]}>
                    Calendario
                  </Text>
                </Pressable>
              </View>

              {/* Vista de gráfico de 7 días */}
              {viewMode === '7days' ? (
                <>
                  <Text style={styles.chartTitle}>Caídas por Día</Text>
                  <View style={styles.chartContainer}>
                    <VictoryChart
                      width={chartWidth}
                      height={200}
                      theme={VictoryTheme.material}
                      padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                      domainPadding={{ x: 20 }}
                    >
                      <VictoryAxis
                        tickFormat={(t) => t}
                        style={{
                          tickLabels: { fontSize: 10, angle: -45, textAnchor: 'end' }
                        }}
                      />
                      <VictoryAxis
                        dependentAxis
                        tickFormat={(t) => Math.round(t)}
                        style={{
                          tickLabels: { fontSize: 10 }
                        }}
                      />
                      <VictoryBar
                        data={caidasPorDia}
                        x="label"
                        y="count"
                        style={{
                          data: { fill: '#ef4444' }
                        }}
                        barWidth={20}
                      />
                    </VictoryChart>
                  </View>
                </>
              ) : (
                <>
                  {/* Vista de calendario */}
                  <View style={styles.calendarHeader}>
                    <Pressable
                      style={styles.monthNavButton}
                      onPress={() => {
                        const newMonth = dayjs(selectedMonth).subtract(1, 'month').format('YYYY-MM');
                        setSelectedMonth(newMonth);
                      }}
                    >
                      <ChevronLeft size={24} color="#7c3aed" />
                    </Pressable>
                    <Text style={styles.calendarMonthTitle}>
                      {dayjs(selectedMonth).format('MMMM YYYY')}
                    </Text>
                    <Pressable
                      style={styles.monthNavButton}
                      onPress={() => {
                        const newMonth = dayjs(selectedMonth).add(1, 'month').format('YYYY-MM');
                        setSelectedMonth(newMonth);
                      }}
                    >
                      <ChevronRight size={24} color="#7c3aed" />
                    </Pressable>
                  </View>

                  <Calendar
                    key={selectedMonth}
                    current={selectedMonth}
                    markedDates={markedDates}
                    onMonthChange={(month) => setSelectedMonth(month.dateString.substring(0, 7))}
                    onDayPress={(day) => {
                      const dayData = markedDates[day.dateString];
                      if (dayData && dayData.recordatorios && dayData.recordatorios.length > 0) {
                        setSelectedDay(day.dateString);
                      } else {
                        setSelectedDay(null);
                      }
                    }}
                    markingType={'multi-dot'}
                    hideArrows={true}
                    hideExtraDays={true}
                    firstDay={1}
                    theme={{
                      backgroundColor: '#ffffff',
                      calendarBackground: '#ffffff',
                      textSectionTitleColor: '#6b7280',
                      selectedDayBackgroundColor: '#7c3aed',
                      selectedDayTextColor: '#ffffff',
                      todayTextColor: '#7c3aed',
                      dayTextColor: '#1f2937',
                      textDisabledColor: '#d1d5db',
                      monthTextColor: 'transparent',
                      textMonthFontWeight: '600',
                      textDayFontSize: 14,
                      textMonthFontSize: 0,
                      textDayHeaderFontSize: 12,
                    }}
                    style={styles.calendar}
                  />

                  {/* Leyenda de colores */}
                  <View style={styles.legendContainer}>
                    <Text style={styles.legendTitle}>Leyenda:</Text>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#fca5a5' }]} />
                        <Text style={styles.legendLabel}>1 caída</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#fb923c' }]} />
                        <Text style={styles.legendLabel}>2 caídas</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#dc2626' }]} />
                        <Text style={styles.legendLabel}>3+ caídas</Text>
                      </View>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
                        <Text style={styles.legendLabel}>Recordatorio</Text>
                      </View>
                    </View>
                  </View>

                  {/* Recordatorios del día seleccionado */}
                  {selectedDay && markedDates[selectedDay]?.recordatorios?.length > 0 && (
                    <View style={styles.selectedDayContainer}>
                      <Text style={styles.selectedDayTitle}>
                        Recordatorios para {dayjs(selectedDay).format('D [de] MMMM')}
                      </Text>
                      {markedDates[selectedDay].recordatorios.map((rec: any, index: number) => {
                        const tipoRecordatorioIcons: Record<string, string> = {
                          medicamento: '💊',
                          cita_medica: '🏥',
                          ejercicio: '🏃',
                          hidratacion: '💧',
                          comida: '🍽️',
                          consejo_salud: '💜',
                          otro: '📌',
                        };
                        const icon = tipoRecordatorioIcons[rec.tipo_recordatorio || 'otro'] || '📌';
                        const hora = dayjs(rec.fecha_hora_programada).format('HH:mm');

                        return (
                          <Pressable
                            key={`${rec.id}-${index}`}
                            style={styles.selectedDayRecordatorio}
                            onPress={() => onSelectRecordatorio(rec)}
                          >
                            <Text style={styles.selectedDayIcon}>{icon}</Text>
                            <View style={styles.selectedDayContent}>
                              <Text style={styles.selectedDayRecordatorioTitle}>{rec.titulo}</Text>
                              <View style={styles.selectedDayMeta}>
                                <Heart size={14} color="#3b82f6" />
                                <Text style={styles.selectedDayPersona}>{rec.nombre_adulto_mayor}</Text>
                                <Text style={styles.selectedDayHora}>• {hora}</Text>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

              {/* Gráfico de distribución por hora (barras horizontales para mejor visualización) */}
              <Text style={styles.chartTitle}>Distribución por Hora del Día</Text>
              <View style={styles.chartContainer}>
                <VictoryChart
                  horizontal
                  width={chartWidth}
                  height={600}
                  theme={VictoryTheme.material}
                  padding={{ top: 20, bottom: 30, left: 50, right: 40 }}
                  domainPadding={{ y: 12 }}
                >
                  <VictoryAxis
                    style={{
                      axis: { stroke: '#374151', strokeWidth: 1 },
                      grid: { stroke: '#d1d5db', strokeWidth: 0.8 },
                      tickLabels: { fontSize: 9, padding: 5 }
                    }}
                  />
                  <VictoryAxis
                    dependentAxis
                    tickFormat={(t) => Math.round(t)}
                    style={{
                      axis: { stroke: '#374151', strokeWidth: 1 },
                      grid: { stroke: '#d1d5db', strokeWidth: 0.8 },
                      tickLabels: { fontSize: 9, padding: 5 }
                    }}
                  />
                  <VictoryBar
                    data={caidasPorHora}
                    x="label"
                    y="count"
                    style={{
                      data: { fill: '#7c3aed' }
                    }}
                    barWidth={10}
                  />
                </VictoryChart>
              </View>
            </>
          )}

          {totalCaidas === 0 && (
            <View style={styles.emptyState}>
              <CheckCircle size={48} color="#10b981" />
              <Text style={styles.emptyStateText}>No hay caídas registradas en los últimos 7 días</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// Componente Toast para notificaciones
function Toast({
  visible,
  message,
  type = 'info',
  onDismiss
}: {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onDismiss: () => void;
}) {
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(3000),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onDismiss();
      });
    }
  }, [visible]);

  if (!visible) return null;

  const bgColors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6',
  };

  const icons = {
    success: <CheckCircle size={20} color="white" />,
    error: <AlertCircle size={20} color="white" />,
    info: <Info size={20} color="white" />,
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: bgColors[type],
          opacity: fadeAnim,
          transform: [{
            translateY: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-20, 0]
            })
          }]
        }
      ]}
    >
      {icons[type]}
      <Text style={styles.toastText}>{message}</Text>
      <Pressable onPress={onDismiss} style={styles.toastCloseButton}>
        <X size={18} color="white" />
      </Pressable>
    </Animated.View>
  );
}

// Componente AlertCard mejorado
function AlertCard({
  alert,
  onDismiss,
  onViewSnapshot
}: {
  alert: Alerta;
  onDismiss: (id: string) => void;
  onViewSnapshot?: (alertaId: number) => void;
}) {
  const config = alertConfig[alert.type];

  const renderIcon = () => {
    const iconSize = 24;
    const iconColor = config.color;
    const iconStyle = { marginRight: 12 };

    switch (alert.type) {
      case 'caida':
        return <AlertTriangle size={iconSize} color={iconColor} style={iconStyle} />;
      case 'ayuda':
        return <Heart size={iconSize} color={iconColor} style={iconStyle} />;
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
          <View style={styles.rowBetween}>
            <Text style={styles.timestamp}>{formattedDate} • {formattedTime}</Text>
            {alert.hasSnapshot && alert.alertaIdNumerico && onViewSnapshot && (
              <Pressable
                style={styles.snapshotButton}
                onPress={() => onViewSnapshot(alert.alertaIdNumerico!)}
              >
                <Camera size={16} color="#7c3aed" />
                <Text style={styles.snapshotButtonText}>Ver foto</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// Componente de ficha expandible para recordatorios por adulto mayor
function RecordatoriosAdultoMayorCard({ data, onToggle, isExpanded, recordatoriosLeidos, onRecordatorioPress }: {
  data: RecordatoriosPorAdultoMayor;
  onToggle: () => void;
  isExpanded: boolean;
  recordatoriosLeidos: Set<number>;
  onRecordatorioPress: (recordatorio: Recordatorio) => void;
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
  const noLeidos = data.recordatorios.filter(rec => !rec.vista).length;

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
            const noLeido = !rec.vista;

            return (
              <Pressable
                key={rec.id}
                style={styles.recordatorioItem}
                onPress={() => onRecordatorioPress(rec)}
              >
                <Text style={styles.recordatorioIcon}>{icon}</Text>
                <View style={styles.recordatorioContent}>
                  <Text style={styles.recordatorioTitulo}>{rec.titulo}</Text>
                  {rec.descripcion && (
                    <Text style={styles.recordatorioDescripcion} numberOfLines={2}>{rec.descripcion}</Text>
                  )}
                  <Text style={styles.recordatorioFecha}>{formattedDate} • {formattedTime}</Text>
                </View>
                {noLeido && (
                  <View style={styles.unreadIndicator}>
                    <Text style={styles.unreadIndicatorText}>!</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Componente de ficha expandible para caídas por adulto mayor
function CaidasAdultoMayorCard({ data, onToggle, isExpanded, onCaidaPress }: {
  data: CaidasPorAdultoMayor;
  onToggle: () => void;
  isExpanded: boolean;
  onCaidaPress: (caida: EventoCaida) => void;
}) {
  // Contar cuántas caídas no están vistas
  const noLeidas = data.caidas.filter(caida => !caida.vista).length;

  return (
    <View style={styles.adultoMayorCard}>
      <Pressable onPress={onToggle} style={styles.adultoMayorHeader}>
        <View style={styles.adultoMayorHeaderContent}>
          <AlertTriangle size={20} color="#ef4444" style={{ marginRight: 8 }} />
          <Text style={styles.adultoMayorNombre}>{data.nombre_adulto_mayor}</Text>
          {noLeidas > 0 && (
            <View style={styles.noLeidoIndicator}>
              <Text style={styles.noLeidoText}>{noLeidas}</Text>
            </View>
          )}
        </View>
        <View style={[styles.recordatoriosBadge, { backgroundColor: '#fee2e2' }]}>
          <Text style={[styles.recordatoriosBadgeText, { color: '#ef4444' }]}>{data.caidas.length}</Text>
        </View>
      </Pressable>

      {isExpanded && (
        <View style={styles.recordatoriosList}>
          {data.caidas.map((caida) => {
            const fecha = new Date(caida.timestamp_alerta);
            const formattedDate = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            const formattedTime = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const hasSnapshot = caida.detalles_adicionales?.snapshot_url ? true : false;
            const confirmada = caida.confirmado_por_cuidador;
            const noLeido = !caida.vista;

            return (
              <Pressable
                key={caida.id}
                style={styles.recordatorioItem}
                onPress={() => onCaidaPress(caida)}
              >
                {hasSnapshot ? (
                  <Camera size={20} color="#7c3aed" style={{ marginRight: 12 }} />
                ) : (
                  <AlertTriangle size={20} color="#ef4444" style={{ marginRight: 12 }} />
                )}
                <View style={styles.recordatorioContent}>
                  <Text style={styles.recordatorioTitulo}>Alerta de Caída</Text>
                  {caida.notas && (
                    <Text style={styles.recordatorioDescripcion} numberOfLines={2}>{caida.notas}</Text>
                  )}
                  <Text style={styles.recordatorioFecha}>{formattedDate} • {formattedTime}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {noLeido && (
                    <View style={[styles.unreadIndicator, { marginRight: 4 }]}>
                      <Text style={styles.unreadIndicatorText}>!</Text>
                    </View>
                  )}
                  {confirmada && (
                    <View style={[styles.statusBadge, { backgroundColor: '#d1fae5', borderRadius: 12 }]}>
                      <Text style={[styles.statusBadgeText, { color: '#065f46' }]}>En camino</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Componente de ficha expandible para ayudas por adulto mayor
function AyudasAdultoMayorCard({ data, onToggle, isExpanded, onAyudaPress }: {
  data: AyudasPorAdultoMayor;
  onToggle: () => void;
  isExpanded: boolean;
  onAyudaPress: (ayuda: AlertaAyuda) => void;
}) {
  // Contar cuántas ayudas no están vistas
  const noLeidas = data.ayudas.filter(ayuda => !ayuda.vista).length;

  return (
    <View style={styles.adultoMayorCard}>
      <Pressable onPress={onToggle} style={styles.adultoMayorHeader}>
        <View style={styles.adultoMayorHeaderContent}>
          <Bell size={20} color="#f97316" style={{ marginRight: 8 }} />
          <Text style={styles.adultoMayorNombre}>{data.nombre_adulto_mayor}</Text>
          {noLeidas > 0 && (
            <View style={styles.noLeidoIndicator}>
              <Text style={styles.noLeidoText}>{noLeidas}</Text>
            </View>
          )}
        </View>
        <View style={[styles.recordatoriosBadge, { backgroundColor: '#ffedd5' }]}>
          <Text style={[styles.recordatoriosBadgeText, { color: '#f97316' }]}>{data.ayudas.length}</Text>
        </View>
      </Pressable>

      {isExpanded && (
        <View style={styles.recordatoriosList}>
          {data.ayudas.map((ayuda) => {
            const fecha = new Date(ayuda.timestamp_alerta);
            const formattedDate = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            const formattedTime = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const confirmada = ayuda.confirmado_por_cuidador;
            const noLeido = !ayuda.vista;

            return (
              <Pressable
                key={ayuda.id}
                style={styles.recordatorioItem}
                onPress={() => onAyudaPress(ayuda)}
              >
                <Text style={styles.recordatorioIcon}>🔔</Text>
                <View style={styles.recordatorioContent}>
                  <Text style={styles.recordatorioTitulo}>Solicitud de Ayuda</Text>
                  {ayuda.notas && (
                    <Text style={styles.recordatorioDescripcion} numberOfLines={2}>{ayuda.notas}</Text>
                  )}
                  <Text style={styles.recordatorioFecha}>{formattedDate} • {formattedTime}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {noLeido && (
                    <View style={[styles.unreadIndicator, { marginRight: 4 }]}>
                      <Text style={styles.unreadIndicatorText}>!</Text>
                    </View>
                  )}
                  {confirmada && (
                    <View style={[styles.statusBadge, { backgroundColor: '#d1fae5', borderRadius: 12 }]}>
                      <Text style={[styles.statusBadgeText, { color: '#065f46' }]}>En camino</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Interfaz para perfil de usuario
interface UserProfile {
  id: number;
  firebase_uid: string;
  email: string;
  nombre: string;
  rol: 'cuidador' | 'adulto_mayor' | 'administrador';
}

// Pantalla Principal
export default function AlertasScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [eventosCaida, setEventosCaida] = useState<EventoCaida[]>([]);
  const [recordatoriosPorAdultoMayor, setRecordatoriosPorAdultoMayor] = useState<RecordatoriosPorAdultoMayor[]>([]);
  const [caidasPorAdultoMayor, setCaidasPorAdultoMayor] = useState<CaidasPorAdultoMayor[]>([]);
  const [ayudasPorAdultoMayor, setAyudasPorAdultoMayor] = useState<AyudasPorAdultoMayor[]>([]);
  const [adultosMayores, setAdultosMayores] = useState<AdultoMayor[]>([]);
  const [expandedCaidas, setExpandedCaidas] = useState<Set<number>>(new Set());
  const [expandedAyudas, setExpandedAyudas] = useState<Set<number>>(new Set());
  const [expandedRecordatorios, setExpandedRecordatorios] = useState<Set<number>>(new Set());
  const [recordatoriosLeidos, setRecordatoriosLeidos] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRecordatorio, setSelectedRecordatorio] = useState<Recordatorio | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [isSnapshotModalVisible, setIsSnapshotModalVisible] = useState(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  // Función para mostrar toast
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  }, []);

  // Funciones para persistir recordatorios leídos
  const RECORDATORIOS_LEIDOS_KEY = 'recordatorios_leidos';

  const guardarRecordatoriosLeidos = useCallback(async (recordatoriosIds: Set<number>) => {
    try {
      const idsArray = Array.from(recordatoriosIds);
      await AsyncStorage.setItem(RECORDATORIOS_LEIDOS_KEY, JSON.stringify(idsArray));
    } catch (error) {
      console.error('Error al guardar recordatorios leídos:', error);
    }
  }, []);

  const cargarRecordatoriosLeidos = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(RECORDATORIOS_LEIDOS_KEY);
      if (stored) {
        const idsArray = JSON.parse(stored) as number[];
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
      const idsActuales = new Set(recordatoriosActuales.map(rec => rec.id));
      const leidosGuardados = await cargarRecordatoriosLeidos();
      const leidosFiltrados = Array.from(leidosGuardados).filter(id => idsActuales.has(id));
      if (leidosFiltrados.length !== leidosGuardados.size) {
        const newSet = new Set(leidosFiltrados);
        await guardarRecordatoriosLeidos(newSet);
        setRecordatoriosLeidos(newSet);
      }
    } catch (error) {
      console.error('Error al limpiar recordatorios antiguos:', error);
    }
  }, [cargarRecordatoriosLeidos, guardarRecordatoriosLeidos]);

  // Función para marcar alerta/recordatorio como visto
  const marcarComoVisto = useCallback(async (alertaId?: number, recordatorioId?: number) => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      await axios.post(
        `${API_URL}/alertas-vistas`,
        { alerta_id: alertaId, recordatorio_id: recordatorioId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`[ALERTAS] Marcado como visto: alerta=${alertaId}, recordatorio=${recordatorioId}`);
    } catch (error) {
      console.error('[ALERTAS] Error al marcar como visto:', error);
      // No mostramos error al usuario, es una operación silenciosa
    }
  }, [user]);

  const convertirEventosACaidas = (eventos: EventoCaida[]): Alerta[] => {
    return eventos.map(evento => {
      // Verificar si tiene snapshot en detalles_adicionales
      const hasSnapshot = evento.detalles_adicionales?.snapshot_url ? true : false;

      return {
        id: `caida-${evento.id}`,
        type: 'caida' as AlertType,
        title: '¡Alerta de Caída Detectada!',
        message: `Detectado por ${evento.nombre_dispositivo || 'dispositivo'}`,
        timestamp: new Date(evento.timestamp_alerta),
        read: !!evento.vista,
        adulto_mayor_nombre: evento.nombre_adulto_mayor || undefined,
        hasSnapshot,
        alertaIdNumerico: evento.id,
      };
    });
  };

  const convertirAlertasAyuda = (alertasAyuda: AlertaAyuda[]): Alerta[] => {
    return alertasAyuda.map(alerta => ({
      id: `ayuda-${alerta.id}`,
      type: 'ayuda' as AlertType,
      title: '¡Solicitud de Ayuda!',
      message: alerta.nombre_adulto_mayor || 'Persona bajo cuidado',
      timestamp: new Date(alerta.timestamp_alerta),
      read: !!alerta.vista,
      adulto_mayor_nombre: alerta.nombre_adulto_mayor || undefined,
    }));
  };

  // Obtener perfil del usuario
  const fetchUserProfile = useCallback(async () => {
    if (!user) return null;
    try {
      const token = await user.getIdToken();
      const response = await axios.get<UserProfile>(`${API_URL}/usuarios/yo`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUserProfile(response.data);
      console.log('[ALERTAS] Perfil de usuario obtenido:', response.data.rol);
      return response.data;
    } catch (err) {
      console.error('[ALERTAS] Error al obtener perfil:', err);
      showToast('No se pudo verificar tu perfil', 'error');
      return null;
    }
  }, [user, showToast]);

  // Obtener adultos mayores asignados al cuidador
  const fetchAdultosMayores = useCallback(async () => {
    if (!user || !userProfile || userProfile.rol !== 'cuidador') return;
    try {
      const token = await user.getIdToken();
      const response = await axios.get<AdultoMayor[]>(`${API_URL}/adultos-mayores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdultosMayores(response.data);
      console.log('[ALERTAS] Adultos mayores cargados:', response.data.length);
    } catch (err) {
      console.error('[ALERTAS] Error al obtener adultos mayores:', err);
    }
  }, [user, userProfile]);

  const fetchAlertas = useCallback(async (isRefreshing = false, silentUpdate = false) => {
    if (!user || !userProfile) return;
    if (!isRefreshing && !silentUpdate) setIsLoading(true);
    setError(null);

    try {
        const token = await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };

        console.log('[ALERTAS] Obteniendo alertas para rol:', userProfile.rol);

        // Obtener todos los tipos de alertas (eventos de caída, alertas de ayuda y recordatorios)
        const promises: [
          Promise<EventoCaida[]>,
          Promise<AlertaAyuda[]>,
          Promise<Recordatorio[]>
        ] = [
          axios.get<EventoCaida[]>(`${API_URL}/eventos-caida`, config).then(res => res.data),
          axios.get<AlertaAyuda[]>(`${API_URL}/alertas`, config).then(res => res.data),
          axios.get<Recordatorio[]>(`${API_URL}/recordatorios`, config).then(res => res.data),
        ];

        const [caidasData, alertasAyudaData, recordatoriosData] = await Promise.all(promises);

        // Guardar eventos de caída originales para el dashboard
        setEventosCaida(caidasData);

        const alertasCaidas = convertirEventosACaidas(caidasData);
        const alertasAyuda = convertirAlertasAyuda(alertasAyudaData);

        const recordatoriosAgrupados: Record<number, RecordatoriosPorAdultoMayor> = {};
        recordatoriosData.forEach((rec) => {
            if (!recordatoriosAgrupados[rec.adulto_mayor_id]) {
                recordatoriosAgrupados[rec.adulto_mayor_id] = {
                    adulto_mayor_id: rec.adulto_mayor_id,
                    nombre_adulto_mayor: rec.nombre_adulto_mayor || 'Sin nombre',
                    recordatorios: [],
                };
            }
            recordatoriosAgrupados[rec.adulto_mayor_id].recordatorios.push(rec);
        });

        const recordatoriosArray = Object.values(recordatoriosAgrupados).map((grupo) => ({
            ...grupo,
            recordatorios: grupo.recordatorios.sort((a, b) => new Date(a.fecha_hora_programada).getTime() - new Date(b.fecha_hora_programada).getTime()),
        }));

        setRecordatoriosPorAdultoMayor(recordatoriosArray);
        limpiarRecordatoriosAntiguos(recordatoriosData);

        // Agrupar caídas por adulto mayor
        const caidasAgrupadas: Record<number, CaidasPorAdultoMayor> = {};
        caidasData.forEach((caida) => {
            if (!caidasAgrupadas[caida.adulto_mayor_id]) {
                caidasAgrupadas[caida.adulto_mayor_id] = {
                    adulto_mayor_id: caida.adulto_mayor_id,
                    nombre_adulto_mayor: caida.nombre_adulto_mayor || 'Sin nombre',
                    caidas: [],
                };
            }
            caidasAgrupadas[caida.adulto_mayor_id].caidas.push(caida);
        });

        const caidasArray = Object.values(caidasAgrupadas).map((grupo) => ({
            ...grupo,
            caidas: grupo.caidas.sort((a, b) => new Date(b.timestamp_alerta).getTime() - new Date(a.timestamp_alerta).getTime()),
        }));

        setCaidasPorAdultoMayor(caidasArray);

        // Agrupar ayudas por adulto mayor
        const ayudasAgrupadas: Record<number, AyudasPorAdultoMayor> = {};
        alertasAyudaData.forEach((ayuda) => {
            if (!ayudasAgrupadas[ayuda.adulto_mayor_id]) {
                ayudasAgrupadas[ayuda.adulto_mayor_id] = {
                    adulto_mayor_id: ayuda.adulto_mayor_id,
                    nombre_adulto_mayor: ayuda.nombre_adulto_mayor || 'Sin nombre',
                    ayudas: [],
                };
            }
            ayudasAgrupadas[ayuda.adulto_mayor_id].ayudas.push(ayuda);
        });

        const ayudasArray = Object.values(ayudasAgrupadas).map((grupo) => ({
            ...grupo,
            ayudas: grupo.ayudas.sort((a, b) => new Date(b.timestamp_alerta).getTime() - new Date(a.timestamp_alerta).getTime()),
        }));

        setAyudasPorAdultoMayor(ayudasArray);

        const todasAlertas = [...alertasCaidas, ...alertasAyuda].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setAlertas(todasAlertas);

        console.log('[ALERTAS] Alertas cargadas exitosamente:', {
          caidas: alertasCaidas.length,
          ayuda: alertasAyuda.length,
          recordatorios: recordatoriosData.length
        });

    } catch (err) {
        console.error('[ALERTAS] Error al obtener alertas:', err);
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setError('Acceso no permitido para este rol.');
          showToast('Acceso no permitido', 'error');
        } else {
          setError(axios.isAxiosError(err) ? err.response?.data?.detail || 'No se pudieron cargar las alertas.' : 'Error inesperado.');
          if (!silentUpdate) {
            showToast('Error al cargar alertas', 'error');
          }
        }
    } finally {
        setIsLoading(false);
        setRefreshing(false);
    }
  }, [user, userProfile, limpiarRecordatoriosAntiguos, showToast]);

  // Cargar perfil de usuario al iniciar
  useEffect(() => {
    const initialize = async () => {
      await fetchUserProfile();
    };
    initialize();
  }, [fetchUserProfile]);

  // Cargar recordatorios leídos desde AsyncStorage al iniciar
  useEffect(() => {
    const inicializarRecordatoriosLeidos = async () => {
      const leidos = await cargarRecordatoriosLeidos();
      setRecordatoriosLeidos(leidos);
    };
    inicializarRecordatoriosLeidos();
  }, [cargarRecordatoriosLeidos]);

  // Cargar alertas y adultos mayores al montar (solo después de obtener el perfil)
  useEffect(() => {
    if (userProfile) {
      fetchAlertas();
      fetchAdultosMayores();
    }
  }, [userProfile, fetchAdultosMayores]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    if (!userProfile) return;

    const interval = setInterval(() => {
      console.log('[ALERTAS] Auto-refresh en progreso...');
      fetchAlertas(false, true); // silentUpdate = true para no mostrar loading
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [userProfile, fetchAlertas]);

  // Escuchar eventos de notificaciones para actualizar alertas automáticamente (web + móvil)
  useEffect(() => {
    if (!user || !userProfile) {
      return;
    }

    // Listener para nuevas alertas
    const handleNuevaAlerta = async (eventData?: any) => {
      console.log('[ALERTAS] 🔔 Evento nueva-alerta recibido', eventData);

      // Refrescar alertas silenciosamente
      await fetchAlertas(false, true);
    };

    // Listener para confirmaciones de alerta
    const handleConfirmacionAlerta = async (eventData?: any) => {
      console.log('[ALERTAS] 💙 Evento confirmacion-alerta recibido', eventData);

      // Refrescar alertas silenciosamente
      await fetchAlertas(false, true);
    };

    if (Platform.OS === 'web') {
      // En web: escuchar eventos de window (WebSocket)
      const handleNuevaAlertaWeb = (event: Event) => {
        const customEvent = event as CustomEvent;
        handleNuevaAlerta(customEvent.detail);
      };

      const handleConfirmacionAlertaWeb = (event: Event) => {
        const customEvent = event as CustomEvent;
        handleConfirmacionAlerta(customEvent.detail);
      };

      window.addEventListener('nueva-alerta', handleNuevaAlertaWeb);
      window.addEventListener('confirmacion-alerta', handleConfirmacionAlertaWeb);

      return () => {
        window.removeEventListener('nueva-alerta', handleNuevaAlertaWeb);
        window.removeEventListener('confirmacion-alerta', handleConfirmacionAlertaWeb);
      };
    } else {
      // En móvil: escuchar eventos de DeviceEventEmitter (Push notifications)
      const subscription1 = DeviceEventEmitter.addListener('nueva-alerta', handleNuevaAlerta);
      const subscription2 = DeviceEventEmitter.addListener('confirmacion-alerta', handleConfirmacionAlerta);

      return () => {
        subscription1.remove();
        subscription2.remove();
      };
    }
  }, [user, userProfile, fetchAlertas]);

  // Refresh automático cuando la vista recibe foco (útil en móvil cuando tocas una notificación)
  useFocusEffect(
    useCallback(() => {
      if (userProfile) {
        console.log('[ALERTAS] Vista enfocada, refrescando datos...');
        fetchAlertas(false, true); // silentUpdate = true
      }
    }, [userProfile, fetchAlertas])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAlertas(true);
  };

  // Función para obtener snapshot de una alerta
  const handleViewSnapshot = useCallback(async (alertaId: number) => {
    if (!user) return;

    setIsLoadingSnapshot(true);
    setIsSnapshotModalVisible(true);
    setSnapshotUrl(null);

    try {
      const token = await user.getIdToken();

      // Descargar la imagen como blob usando axios con Authorization header
      const response = await axios.get(`${API_URL}/alertas/${alertaId}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      // Convertir el blob a Data URL para mostrarlo en <Image>
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        setSnapshotUrl(base64data);
        console.log('[SNAPSHOT] Imagen cargada exitosamente como base64');
        setIsLoadingSnapshot(false);
      };
      reader.onerror = () => {
        console.error('[SNAPSHOT] Error al leer blob');
        showToast('error', 'Error', 'Error al procesar la imagen');
        setIsSnapshotModalVisible(false);
        setIsLoadingSnapshot(false);
      };
      reader.readAsDataURL(response.data);

    } catch (err) {
      console.error('[SNAPSHOT] Error al obtener snapshot:', err);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        showToast('error', 'Error', 'Esta alerta no tiene foto disponible');
      } else {
        showToast('error', 'Error', 'Error al cargar la imagen');
      }
      setIsSnapshotModalVisible(false);
      setIsLoadingSnapshot(false);
    }
  }, [user, showToast, marcarComoVisto]);

  // Función para descartar una alerta
  const handleDismiss = (id: string) => {
    setAlertas((prev) => prev.filter((a) => a.id !== id));
    showToast('Alerta descartada', 'success');
  };

  // Función para alternar expansión de adulto mayor
  const toggleCaida = (adultoMayorId: number) => {
    setExpandedCaidas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(adultoMayorId)) {
        newSet.delete(adultoMayorId);
      } else {
        newSet.add(adultoMayorId);
      }
      return newSet;
    });
  };

  const toggleAyuda = (adultoMayorId: number) => {
    setExpandedAyudas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(adultoMayorId)) {
        newSet.delete(adultoMayorId);
      } else {
        newSet.add(adultoMayorId);
      }
      return newSet;
    });
  };

  const toggleRecordatorio = (adultoMayorId: number) => {
    setExpandedRecordatorios((prev) => {
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

  // Filtrar últimas 3 de cada tipo
  const alertasCaidas = alertas.filter(a => a.type === 'caida').slice(0, 3);
  const alertasAyuda = alertas.filter(a => a.type === 'ayuda').slice(0, 3);

  // Estadísticas de alertas
  const totalRecordatorios = recordatoriosPorAdultoMayor.reduce((sum, grupo) => sum + grupo.recordatorios.length, 0);

  // Contar recordatorios no leídos
  const recordatoriosNoLeidos = recordatoriosPorAdultoMayor.reduce((count, grupo) => {
    const noLeidos = grupo.recordatorios.filter(rec => !rec.vista).length;
    return count + noLeidos;
  }, 0);

  // Total de caídas y caídas no leídas (confirmado_por_usuario === null)
  const totalCaidas = alertas.filter(a => a.type === 'caida').length;
  const alertasCaidasNoLeidas = alertas.filter(a => a.type === 'caida' && !a.read).length;

  // Total de alertas de ayuda y no leídas
  const totalAlertasAyuda = alertas.filter(a => a.type === 'ayuda').length;
  const alertasAyudaNoLeidas = alertas.filter(a => a.type === 'ayuda' && !a.read).length;

  // Total de alertas no leídas (caídas + ayuda + recordatorios)
  const alertasNoLeidas = alertasCaidasNoLeidas + alertasAyudaNoLeidas + recordatoriosNoLeidos;

  return (
    <View style={styles.container}>
      <CustomHeader
        title={userProfile?.rol === 'adulto_mayor' ? 'Mis Notificaciones' : 'Historial de Notificaciones'}
        onMenuPress={() => router.push('/panel')}
        showBackButton={true}
      />

      {/* Toast de notificaciones */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastVisible(false)}
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
          <ScrollView
            contentContainerStyle={styles.mainContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          >
            {/* Dashboard de Estadísticas de Caídas - Primero en el ScrollView */}
            {eventosCaida.length > 0 && (
              <DashboardCaidas
                eventos={eventosCaida}
                recordatorios={recordatoriosPorAdultoMayor}
                adultosMayores={adultosMayores}
                onSelectRecordatorio={async (rec) => {
                  setSelectedRecordatorio(rec);
                  setIsModalVisible(true);
                  // Marcar recordatorio como visto y refrescar
                  await marcarComoVisto(undefined, rec.id);
                  fetchAlertas(false, true);
                }}
              />
            )}

            {/* Sección de estadísticas - Después del dashboard */}
            <View style={styles.statsSection}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{alertasNoLeidas}</Text>
                <Text style={styles.statLabel}>No leídas</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: '#f97316' }]}>{totalAlertasAyuda}</Text>
                <Text style={styles.statLabel}>Ayuda</Text>
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

            {/* ORDEN: 1. Caídas por Persona, 2. Ayudas por Persona, 3. Recordatorios por Persona */}

            {/* Sección de Caídas por Persona */}
            {caidasPorAdultoMayor.length > 0 && userProfile?.rol === 'cuidador' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Alertas de Caída por Persona</Text>
                {caidasPorAdultoMayor.map((grupo) => (
                  <CaidasAdultoMayorCard
                    key={grupo.adulto_mayor_id}
                    data={grupo}
                    isExpanded={expandedCaidas.has(grupo.adulto_mayor_id)}
                    onToggle={() => toggleCaida(grupo.adulto_mayor_id)}
                    onCaidaPress={async (caida) => {
                      // Actualizar estado local inmediatamente
                      setEventosCaida(prev => prev.map(c =>
                        c.id === caida.id ? { ...c, vista: true } : c
                      ));
                      setCaidasPorAdultoMayor(prev => prev.map(grupo => ({
                        ...grupo,
                        caidas: grupo.caidas.map(c =>
                          c.id === caida.id ? { ...c, vista: true } : c
                        )
                      })));
                      setAlertas(prev => prev.map(a =>
                        a.alertaIdNumerico === caida.id ? { ...a, read: true } : a
                      ));

                      // Marcar como visto en backend
                      await marcarComoVisto(caida.id, undefined);

                      const hasSnapshot = caida.detalles_adicionales?.snapshot_url ? true : false;
                      if (hasSnapshot) {
                        handleViewSnapshot(caida.id);
                      } else {
                        showToast('Caída registrada sin foto', 'info');
                      }
                    }}
                  />
                ))}
              </View>
            )}

            {/* Sección de Solicitudes de Ayuda por Persona */}
            {ayudasPorAdultoMayor.length > 0 && userProfile?.rol === 'cuidador' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Solicitudes de Ayuda por Persona</Text>
                {ayudasPorAdultoMayor.map((grupo) => (
                  <AyudasAdultoMayorCard
                    key={grupo.adulto_mayor_id}
                    data={grupo}
                    isExpanded={expandedAyudas.has(grupo.adulto_mayor_id)}
                    onToggle={() => toggleAyuda(grupo.adulto_mayor_id)}
                    onAyudaPress={async (ayuda) => {
                      // Actualizar estado local inmediatamente
                      setAyudasPorAdultoMayor(prev => prev.map(grupo => ({
                        ...grupo,
                        ayudas: grupo.ayudas.map(a =>
                          a.id === ayuda.id ? { ...a, vista: true } : a
                        )
                      })));
                      setAlertas(prev => prev.map(a =>
                        a.alertaIdNumerico === ayuda.id ? { ...a, read: true } : a
                      ));

                      // Marcar como visto en backend
                      await marcarComoVisto(ayuda.id, undefined);
                    }}
                  />
                ))}
              </View>
            )}

            {/* Sección de Recordatorios */}
            {recordatoriosPorAdultoMayor.length > 0 && (
              <View style={styles.section}>
                {userProfile?.rol === 'cuidador' ? (
                  <>
                    <Text style={styles.sectionTitle}>Recordatorios por Persona</Text>
                    {recordatoriosPorAdultoMayor.map((grupo) => (
                      <RecordatoriosAdultoMayorCard
                        key={grupo.adulto_mayor_id}
                        data={grupo}
                        isExpanded={expandedRecordatorios.has(grupo.adulto_mayor_id)}
                        onToggle={() => toggleRecordatorio(grupo.adulto_mayor_id)}
                        recordatoriosLeidos={recordatoriosLeidos}
                        onRecordatorioPress={async (rec) => {
                          setSelectedRecordatorio(rec);
                          setIsModalVisible(true);
                          // Marcar recordatorio como visto y refrescar
                          await marcarComoVisto(undefined, rec.id);
                          fetchAlertas(false, true);
                        }}
                      />
                    ))}
                  </>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>Mis Recordatorios</Text>
                    <View style={styles.recordatoriosDirectList}>
                      {recordatoriosPorAdultoMayor[0]?.recordatorios.map((rec) => {
                        const tipoRecordatorioIcons: Record<string, string> = {
                          medicamento: '💊',
                          cita_medica: '🏥',
                          ejercicio: '🏃',
                          hidratacion: '💧',
                          comida: '🍽️',
                          consejo_salud: '💜',
                          otro: '📌',
                        };
                        const icon = tipoRecordatorioIcons[rec.tipo_recordatorio || 'otro'] || '📌';
                        const fecha = new Date(rec.fecha_hora_programada);
                        const formattedDate = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                        const formattedTime = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

                        return (
                          <Pressable
                            key={rec.id}
                            style={styles.recordatorioItemDirect}
                            onPress={async () => {
                              setSelectedRecordatorio(rec);
                              setIsModalVisible(true);
                              // Marcar recordatorio como visto y refrescar
                              await marcarComoVisto(undefined, rec.id);
                              fetchAlertas(false, true);
                            }}
                          >
                            <Text style={styles.recordatorioIconDirect}>{icon}</Text>
                            <View style={styles.recordatorioContentDirect}>
                              <Text style={styles.recordatorioTituloDirect}>{rec.titulo}</Text>
                              {rec.descripcion && (
                                <Text style={styles.recordatorioDescripcionDirect} numberOfLines={2}>{rec.descripcion}</Text>
                              )}
                              <Text style={styles.recordatorioFechaDirect}>{formattedDate} • {formattedTime}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Mensaje cuando no hay nada */}
            {alertas.length === 0 && recordatoriosPorAdultoMayor.length === 0 && (
              <View style={styles.emptyContainer}>
                <Bell size={64} color="#9ca3af" />
                <Text style={styles.noAlerts}>No hay alertas registradas</Text>
                <Text style={styles.noAlertsSubtext}>
                  Las alertas de ayuda, caídas y recordatorios aparecerán aquí
                </Text>
              </View>
            )}
          </ScrollView>
        </>
      )}



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

                  {selectedRecordatorio.nombre_adulto_mayor && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Para</Text>
                      <View style={styles.modalPersonBadge}>
                        <Heart size={16} color="#7c3aed" style={{ marginRight: 6 }} />
                        <Text style={styles.modalPersonName}>{selectedRecordatorio.nombre_adulto_mayor}</Text>
                      </View>
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

      {/* Modal de Snapshot de Caída */}
      <Modal
        visible={isSnapshotModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setIsSnapshotModalVisible(false);
          setSnapshotUrl(null);
        }}
      >
        <Pressable
          style={styles.snapshotModalOverlay}
          onPress={() => {
            setIsSnapshotModalVisible(false);
            setSnapshotUrl(null);
          }}
        >
          <Pressable
            style={styles.snapshotModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.snapshotModalHeader}>
              <View style={styles.snapshotHeaderLeft}>
                <Camera size={24} color="#7c3aed" style={{ marginRight: 8 }} />
                <Text style={styles.snapshotModalTitle}>Foto de la Caída</Text>
              </View>
              <Pressable
                onPress={() => {
                  setIsSnapshotModalVisible(false);
                  setSnapshotUrl(null);
                }}
                style={styles.snapshotCloseButton}
              >
                <X size={24} color="#6b7280" />
              </Pressable>
            </View>

            <View style={styles.snapshotImageContainer}>
              {isLoadingSnapshot ? (
                <View style={styles.snapshotLoadingContainer}>
                  <ActivityIndicator size="large" color="#7c3aed" />
                  <Text style={styles.snapshotLoadingText}>Cargando imagen...</Text>
                </View>
              ) : snapshotUrl ? (
                <Image
                  source={{ uri: snapshotUrl }}
                  style={styles.snapshotImage}
                  resizeMode="contain"
                  onError={(error) => {
                    console.error('[SNAPSHOT] Error al cargar imagen:', error.nativeEvent.error);
                    showToast('Error al cargar la imagen', 'error');
                    setIsSnapshotModalVisible(false);
                  }}
                />
              ) : (
                <View style={styles.snapshotErrorContainer}>
                  <AlertTriangle size={48} color="#ef4444" />
                  <Text style={styles.snapshotErrorText}>No se pudo cargar la imagen</Text>
                </View>
              )}
            </View>

            <View style={styles.snapshotModalFooter}>
              <Pressable
                style={styles.snapshotCloseButtonLarge}
                onPress={() => {
                  setIsSnapshotModalVisible(false);
                  setSnapshotUrl(null);
                }}
              >
                <Text style={styles.snapshotCloseButtonText}>Cerrar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  // Estilos para selector de adulto mayor
  adultoMayorSelectorContainer: {
    marginBottom: 16,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  selectorScrollView: {
    flexGrow: 0,
  },
  selectorChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  selectorChipActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  selectorChipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  selectorChipTextActive: {
    color: '#ffffff',
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
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
    marginBottom: 28,
  },
  sectionHeader: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
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
  // Estilos para vista directa de recordatorios (adultos mayores)
  recordatoriosDirectList: {
    gap: 12,
  },
  recordatorioItemDirect: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#7c3aed',
  },
  recordatorioIconDirect: {
    fontSize: 32,
    marginRight: 16,
  },
  recordatorioContentDirect: {
    flex: 1,
  },
  recordatorioTituloDirect: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  recordatorioDescripcionDirect: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 20,
  },
  recordatorioFechaDirect: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
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
  modalPersonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  modalPersonName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
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
  // Estilos para botón de snapshot
  snapshotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  snapshotButtonText: {
    color: '#7c3aed',
    fontSize: 12,
    fontWeight: '600',
  },
  // Estilos para modal de snapshot
  snapshotModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  snapshotModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 10,
  },
  snapshotModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  snapshotHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  snapshotModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  snapshotCloseButton: {
    padding: 4,
  },
  snapshotImageContainer: {
    minHeight: 400,
    maxHeight: 600,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  snapshotImage: {
    width: '100%',
    height: '100%',
  },
  snapshotLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snapshotLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  snapshotErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  snapshotErrorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '600',
    textAlign: 'center',
  },
  snapshotModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  snapshotCloseButtonLarge: {
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  snapshotCloseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Estilos para Toast
  toast: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
    gap: 12,
  },
  toastText: {
    flex: 1,
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  toastCloseButton: {
    padding: 4,
  },
  // Estilos para Dashboard de Caídas
  dashboardContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  dashboardHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dashboardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  expandIcon: {
    fontSize: 16,
    color: '#9ca3af',
  },
  dashboardContent: {
    padding: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  metricLabel: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 12,
  },
  chartContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Estilos para selector de vista
  viewSelectorContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  viewButtonActive: {
    backgroundColor: '#f3e8ff',
    borderColor: '#7c3aed',
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  viewButtonTextActive: {
    color: '#7c3aed',
  },
  // Estilos para calendario
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  monthNavButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  calendarMonthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    textTransform: 'capitalize',
  },
  calendar: {
    borderRadius: 8,
    marginBottom: 16,
  },
  // Estilos para leyenda
  legendContainer: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    color: '#4b5563',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  // Estilos para día seleccionado
  selectedDayContainer: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  selectedDayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  selectedDayRecordatorio: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  selectedDayIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  selectedDayContent: {
    flex: 1,
  },
  selectedDayRecordatorioTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  selectedDayMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedDayPersona: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  selectedDayHora: {
    fontSize: 12,
    color: '#6b7280',
  },
  unreadIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadIndicatorText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
