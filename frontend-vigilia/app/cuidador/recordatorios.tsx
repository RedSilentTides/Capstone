import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable,
    Platform, TextInput, Modal, RefreshControl
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import DatePicker from 'react-native-ui-datepicker';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { PlusCircle, Calendar, Clock, Repeat, Trash2, Edit2, X } from 'lucide-react-native';
import { useAuth } from '../_layout';
import CustomHeader from '../../components/CustomHeader';
import SlidingPanel from '../../components/Slidingpanel';

// Configurar dayjs en español
dayjs.locale('es');

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

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
}

interface ReminderFormData {
    id?: number;
    titulo: string;
    descripcion: string;
    fecha_hora_programada: Date;
    frecuencia: 'una_vez' | 'diario' | 'semanal' | 'mensual';
    tipo_recordatorio: string;
}

interface UserProfile {
    id: number;
    firebase_uid: string;
    email: string;
    nombre: string;
    rol: string;
}

const frecuenciaOptions = [
    { label: 'Solo una vez', value: 'una_vez' },
    { label: 'Diario', value: 'diario' },
    { label: 'Semanal', value: 'semanal' },
    { label: 'Mensual', value: 'mensual' },
];

const tipoRecordatorioOptions = [
    { label: '💊 Medicamento', value: 'medicamento', color: '#ef4444', icon: '💊' },
    { label: '🏥 Cita Médica', value: 'cita_medica', color: '#3b82f6', icon: '🏥' },
    { label: '🏃 Ejercicio', value: 'ejercicio', color: '#10b981', icon: '🏃' },
    { label: '💧 Hidratación', value: 'hidratacion', color: '#06b6d4', icon: '💧' },
    { label: '🍽️ Comida', value: 'comida', color: '#f59e0b', icon: '🍽️' },
    { label: '💜 Consejo de Salud', value: 'consejo_salud', color: '#7c3aed', icon: '💜' },
    { label: '📌 Otro', value: 'otro', color: '#6b7280', icon: '📌' },
];

export default function RecordatoriosScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { setAuthState } = useAuth();

    // Obtenemos los parámetros de la URL (pueden no existir si es un adulto mayor viendo sus propios recordatorios)
    const adultoMayorIdParam = params.adulto_mayor_id ? parseInt(params.adulto_mayor_id as string) : null;
    const nombreParam = params.nombre as string || '';

    const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentReminder, setCurrentReminder] = useState<Partial<ReminderFormData>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [adultoMayorId, setAdultoMayorId] = useState<number | null>(adultoMayorIdParam);
    const [nombreAdultoMayor, setNombreAdultoMayor] = useState<string>(nombreParam);

    // Estados para el DateTimePicker y Calendario
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);

    // Estado para días de la semana seleccionados (para frecuencia semanal)
    const [selectedDays, setSelectedDays] = useState<number[]>([]); // 0=Domingo, 1=Lunes, etc.

    const getToken = useCallback(async (): Promise<string | null> => {
        const tokenKey = 'userToken';
        if (Platform.OS === 'web') {
            return await AsyncStorage.getItem(tokenKey);
        } else {
            return await SecureStore.getItemAsync(tokenKey);
        }
    }, []);

    // Obtener perfil del usuario
    const fetchUserProfile = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) {
                setAuthState(false);
                router.replace('/login');
                return null;
            }

            const response = await axios.get<UserProfile>(`${API_URL}/usuarios/yo`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setUserProfile(response.data);

            // Si es adulto mayor y no se pasó un adulto_mayor_id, obtenerlo
            if (response.data.rol === 'adulto_mayor' && !adultoMayorIdParam) {
                // Obtener el perfil propio del adulto mayor
                const adultoResponse = await axios.get(`${API_URL}/adultos-mayores/mi-perfil`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (adultoResponse.data) {
                    setAdultoMayorId(adultoResponse.data.id);
                    setNombreAdultoMayor(adultoResponse.data.nombre_completo || response.data.nombre);
                } else {
                    setNombreAdultoMayor(response.data.nombre);
                }
            }

            return response.data;
        } catch (err) {
            console.error('Error al obtener perfil:', err);
            return null;
        }
    }, [getToken, router, setAuthState, adultoMayorIdParam]);

    const fetchRecordatorios = useCallback(async (isRefreshing = false) => {
        if (!isRefreshing) setIsLoading(true);
        setError(null);

        try {
            const token = await getToken();
            if (!token) {
                setAuthState(false);
                router.replace('/login');
                return;
            }

            // Construir parámetros según si se filtró por adulto_mayor_id
            const requestParams: any = {};
            if (adultoMayorId) {
                requestParams.adulto_mayor_id = adultoMayorId;
                console.log(`Obteniendo recordatorios para adulto_mayor_id: ${adultoMayorId}...`);
            } else {
                console.log('Obteniendo todos los recordatorios del usuario...');
            }

            const response = await axios.get<Recordatorio[]>(`${API_URL}/recordatorios`, {
                headers: { Authorization: `Bearer ${token}` },
                params: requestParams
            });

            setRecordatorios(response.data);
            console.log(`Recordatorios obtenidos: ${response.data.length}`);
        } catch (err) {
            console.error('Error al obtener recordatorios:', err);
            if (axios.isAxiosError(err)) {
                if (err.response?.status === 401 || err.response?.status === 403) {
                    setError('Tu sesión ha expirado.');
                    setAuthState(false);
                    setTimeout(() => router.replace('/login'), 1500);
                } else {
                    const message = err.response?.data?.detail || 'Error al obtener recordatorios.';
                    setError(message);
                }
            } else {
                setError('Error inesperado al obtener recordatorios.');
            }
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [getToken, router, adultoMayorId, setAuthState]);

    useEffect(() => {
        const initialize = async () => {
            await fetchUserProfile();
        };
        initialize();
    }, [fetchUserProfile]);

    useEffect(() => {
        if (adultoMayorId !== null || userProfile?.rol === 'adulto_mayor') {
            fetchRecordatorios();
        }
    }, [adultoMayorId, userProfile, fetchRecordatorios]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchRecordatorios(true);
    };

    const validateDateTime = (dateTime: Date): string | null => {
        const now = new Date();

        if (dateTime < now) {
            return 'La fecha y hora del recordatorio no puede ser en el pasado.';
        }

        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

        if (dateTime > oneYearFromNow) {
            return 'La fecha no puede ser mayor a un año en el futuro.';
        }

        return null;
    };

    const handleAddOrUpdateReminder = async () => {
        if (!currentReminder.titulo || !currentReminder.fecha_hora_programada) {
            Alert.alert('Error', 'Completa el título y la fecha/hora.');
            return;
        }

        if (!adultoMayorId) {
            Alert.alert('Error', 'No se pudo determinar el adulto mayor.');
            return;
        }

        // Validar fecha y hora
        const validationError = validateDateTime(currentReminder.fecha_hora_programada);
        if (validationError) {
            Alert.alert('Error de validación', validationError);
            return;
        }

        const token = await getToken();
        if (!token) {
            setAuthState(false);
            router.replace('/login');
            return;
        }

        const dataToSend = {
            titulo: currentReminder.titulo.trim(),
            descripcion: currentReminder.descripcion?.trim() || null,
            adulto_mayor_id: adultoMayorId,
            fecha_hora_programada: currentReminder.fecha_hora_programada.toISOString(),
            frecuencia: currentReminder.frecuencia ?? 'una_vez',
            tipo_recordatorio: currentReminder.tipo_recordatorio ?? 'medicamento',
            dias_semana: selectedDays.length > 0 ? selectedDays : null, // Solo enviar si hay días seleccionados
        };

        console.log('📤 Datos a enviar:', JSON.stringify(dataToSend, null, 2));
        setIsSaving(true);

        try {
            if (isEditing && currentReminder.id) {
                console.log('✏️ Actualizando recordatorio:', currentReminder.id);
                const response = await axios.put(`${API_URL}/recordatorios/${currentReminder.id}`, dataToSend, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log('✅ Respuesta actualización:', response.data);
                Alert.alert('Éxito', 'Recordatorio actualizado.');
            } else {
                console.log('➕ Creando nuevo recordatorio...');
                const response = await axios.post(`${API_URL}/recordatorios`, dataToSend, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log('✅ Respuesta creación:', response.data);
                Alert.alert('Éxito', 'Recordatorio creado.');
            }
            setModalVisible(false);
            fetchRecordatorios();
        } catch (err) {
            console.error('Error al guardar recordatorio:', err);
            const errorMsg = axios.isAxiosError(err) ? err.response?.data?.detail || err.message : 'Error desconocido';
            Alert.alert('Error', `No se pudo guardar el recordatorio: ${errorMsg}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteReminder = async (id: number) => {
        const token = await getToken();
        if (!token) {
            setAuthState(false);
            router.replace('/login');
            return;
        }

        Alert.alert(
            "Confirmar Eliminación",
            "¿Estás seguro de que quieres eliminar este recordatorio?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar", style: "destructive", onPress: async () => {
                        try {
                            console.log('Eliminando recordatorio:', id);
                            await axios.delete(`${API_URL}/recordatorios/${id}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            Alert.alert('Éxito', 'Recordatorio eliminado.');
                            fetchRecordatorios();
                        } catch (err) {
                            console.error('Error al eliminar recordatorio:', err);
                            const errorMsg = axios.isAxiosError(err) ? err.response?.data?.detail || err.message : 'Error desconocido';
                            Alert.alert('Error', `No se pudo eliminar el recordatorio: ${errorMsg}`);
                        }
                    }
                }
            ]
        );
    };

    const openAddModal = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);

        setCurrentReminder({
            titulo: '',
            descripcion: '',
            fecha_hora_programada: tomorrow,
            frecuencia: 'una_vez',
            tipo_recordatorio: 'medicamento', // Valor por defecto
        });
        setIsEditing(false);
        setModalVisible(true);
    };

    const openEditModal = (reminder: Recordatorio) => {
        setCurrentReminder({
            id: reminder.id,
            titulo: reminder.titulo,
            descripcion: reminder.descripcion || '',
            fecha_hora_programada: new Date(reminder.fecha_hora_programada),
            frecuencia: reminder.frecuencia,
            tipo_recordatorio: reminder.tipo_recordatorio || 'medicamento', // Incluir tipo
        });
        setIsEditing(true);
        setModalVisible(true);
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            const currentTime = currentReminder.fecha_hora_programada || new Date();
            selectedDate.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);
            setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: selectedDate }));
        }
    };

    const handleTimeChange = (event: any, selectedTime?: Date) => {
        setShowTimePicker(Platform.OS === 'ios');
        if (selectedTime) {
            const currentDate = currentReminder.fecha_hora_programada || new Date();
            const newDateTime = new Date(currentDate);
            newDateTime.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: newDateTime }));
        }
    };

    const formatFecha = (fecha: string) => {
        const date = new Date(fecha);
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    };

    const formatHora = (fecha: string) => {
        const date = new Date(fecha);
        return date.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderRecordatorioCard = (recordatorio: Recordatorio) => {
        const tipoInfo = tipoRecordatorioOptions.find(t => t.value === (recordatorio.tipo_recordatorio || 'medicamento'));

        return (
            <View key={recordatorio.id} style={styles.reminderCard}>
                <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={styles.reminderHeader}>
                        <Text style={styles.reminderTitle}>{recordatorio.titulo}</Text>
                        {tipoInfo && (
                            <View style={[styles.tipoBadge, { backgroundColor: tipoInfo.color + '20', borderColor: tipoInfo.color }]}>
                                <Text style={styles.tipoBadgeIcon}>{tipoInfo.icon}</Text>
                                <Text style={[styles.tipoBadgeText, { color: tipoInfo.color }]}>
                                    {tipoInfo.label.split(' ')[1]}
                                </Text>
                            </View>
                        )}
                    </View>
                    {recordatorio.descripcion && (
                        <Text style={styles.reminderDesc}>{recordatorio.descripcion}</Text>
                    )}
                    <View style={styles.reminderRow}>
                        <Calendar size={14} color="#6b7280" />
                        <Text style={styles.reminderDetailText}>{formatFecha(recordatorio.fecha_hora_programada)}</Text>
                    </View>
                    <View style={styles.reminderRow}>
                        <Clock size={14} color="#6b7280" />
                        <Text style={styles.reminderDetailText}>{formatHora(recordatorio.fecha_hora_programada)}</Text>
                    </View>
                    <View style={styles.reminderRow}>
                        <Repeat size={14} color="#6b7280" />
                        <Text style={styles.reminderDetailText}>
                            {frecuenciaOptions.find(f => f.value === recordatorio.frecuencia)?.label || recordatorio.frecuencia}
                        </Text>
                    </View>
                </View>
                {/* Mostrar botones de editar/eliminar */}
                {(userProfile?.rol === 'cuidador' || userProfile?.rol === 'adulto_mayor') && (
                    <View style={styles.reminderActions}>
                        <Pressable onPress={() => openEditModal(recordatorio)} style={styles.actionButton}>
                            <Edit2 size={20} color="#3b82f6" />
                        </Pressable>
                        <Pressable onPress={() => handleDeleteReminder(recordatorio.id)} style={styles.actionButton}>
                            <Trash2 size={20} color="#ef4444" />
                        </Pressable>
                    </View>
                )}
            </View>
        );
    };

    // Determinar el título del header
    const headerTitle = nombreAdultoMayor ? `Recordatorios - ${nombreAdultoMayor}` : 'Mis Recordatorios';

    return (
        <View style={styles.container}>
            <CustomHeader
                title="Recordatorios"
                onMenuPress={() => setIsPanelOpen(true)}
                showBackButton={true}
            />

            <View style={styles.headerSection}>
                <Text style={styles.headerSubtitle}>
                    {nombreAdultoMayor || (userProfile?.nombre || 'Cargando...')}
                </Text>
                {/* Mostrar botón de agregar si es cuidador con adulto_mayor_id o si es adulto_mayor */}
                {((userProfile?.rol === 'cuidador' && adultoMayorId) || userProfile?.rol === 'adulto_mayor') && adultoMayorId && (
                    <Pressable onPress={openAddModal} style={styles.addButton}>
                        <PlusCircle size={24} color="white" />
                        <Text style={styles.addButtonText}>Nuevo Recordatorio</Text>
                    </Pressable>
                )}
            </View>

            {isLoading && !refreshing ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#7c3aed" />
                    <Text style={styles.loadingText}>Cargando recordatorios...</Text>
                </View>
            ) : error ? (
                <View style={styles.centerContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable style={styles.retryButton} onPress={() => fetchRecordatorios()}>
                        <Text style={styles.retryButtonText}>Reintentar</Text>
                    </Pressable>
                </View>
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                    }
                >
                    {recordatorios.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Calendar size={64} color="#9ca3af" />
                            <Text style={styles.emptyText}>No hay recordatorios</Text>
                            <Text style={styles.emptySubtext}>
                                {userProfile?.rol === 'cuidador'
                                    ? 'Crea un recordatorio para mantener un seguimiento de medicamentos, citas o tareas importantes.'
                                    : 'Presiona "Nuevo Recordatorio" para crear tu primer recordatorio de medicamentos, citas o actividades.'}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.listContent}>
                            {recordatorios.map(renderRecordatorioCard)}
                        </View>
                    )}
                </ScrollView>
            )}

            {/* Modal para Añadir/Editar Recordatorio */}
            {(userProfile?.rol === 'cuidador' || userProfile?.rol === 'adulto_mayor') && (
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={modalVisible}
                    onRequestClose={() => setModalVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>
                                    {isEditing ? 'Editar Recordatorio' : 'Nuevo Recordatorio'}
                                </Text>
                                <Pressable onPress={() => setModalVisible(false)}>
                                    <X size={24} color="#6b7280" />
                                </Pressable>
                            </View>

                            <ScrollView>
                                <Text style={styles.modalLabel}>Para:</Text>
                                <Text style={styles.modalInfo}>{nombreAdultoMayor}</Text>

                                <Text style={styles.modalLabel}>Título *</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Ej: Tomar medicamento"
                                    value={currentReminder.titulo || ''}
                                    onChangeText={(text) => setCurrentReminder(prev => ({ ...prev, titulo: text }))}
                                />

                                <Text style={styles.modalLabel}>Descripción (Opcional)</Text>
                                <TextInput
                                    style={[styles.modalInput, styles.textArea]}
                                    placeholder="Ej: Pastilla azul con el desayuno"
                                    value={currentReminder.descripcion || ''}
                                    onChangeText={(text) => setCurrentReminder(prev => ({ ...prev, descripcion: text }))}
                                    multiline
                                    numberOfLines={3}
                                />

                                {/* Mostrar calendario SOLO si frecuencia es "una_vez" */}
                                {currentReminder.frecuencia === 'una_vez' ? (
                                    <>
                                        {/* Solo una vez: Mostrar Fecha completa + Hora */}
                                        <Text style={styles.modalLabel}>Fecha y Hora *</Text>

                                        <Pressable
                                            style={styles.dateButton}
                                            onPress={() => setShowCalendar(!showCalendar)}
                                        >
                                            <Calendar size={20} color="#7c3aed" />
                                            <Text style={styles.dateButtonText}>
                                                {currentReminder.fecha_hora_programada
                                                    ? `${formatFecha(currentReminder.fecha_hora_programada.toISOString())} ${formatHora(currentReminder.fecha_hora_programada.toISOString())}`
                                                    : 'Seleccionar fecha y hora'}
                                            </Text>
                                        </Pressable>

                                        {showCalendar && (
                                            <View style={styles.calendarContainer}>
                                                <DatePicker
                                                    mode="single"
                                                    locale="es"
                                                    date={currentReminder.fecha_hora_programada ? dayjs(currentReminder.fecha_hora_programada).toDate() : undefined}
                                                    onChange={(params: any) => {
                                                        if (params.date) {
                                                            const selectedDate = new Date(params.date);
                                                            const currentDateTime = currentReminder.fecha_hora_programada || new Date();
                                                            selectedDate.setHours(currentDateTime.getHours(), currentDateTime.getMinutes(), 0, 0);
                                                            setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: selectedDate }));
                                                        }
                                                    }}
                                                    minDate={dayjs().toDate()}
                                                    maxDate={dayjs().add(1, 'year').toDate()}
                                                    selectedItemColor="#7c3aed"
                                                    calendarTextStyle={{ color: '#111827', fontSize: 14 }}
                                                    headerTextStyle={{ color: '#7c3aed', fontWeight: 'bold', fontSize: 16 }}
                                                    weekDaysTextStyle={{ color: '#6b7280', fontWeight: '600', fontSize: 13 }}
                                                    selectedTextStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                                                    todayTextStyle={{ color: '#7c3aed', fontWeight: 'bold' }}
                                                    todayContainerStyle={{ borderColor: '#7c3aed', borderWidth: 1 }}
                                                />

                                                <View style={styles.timePickerContainer}>
                                                    <Text style={styles.timePickerLabel}>Selecciona la hora:</Text>
                                                    <View style={styles.timeInputRow}>
                                                        <TextInput
                                                            style={styles.timeInput}
                                                            value={currentReminder.fecha_hora_programada
                                                                ? String(currentReminder.fecha_hora_programada.getHours()).padStart(2, '0')
                                                                : '00'}
                                                            onChangeText={(text) => {
                                                                const hours = parseInt(text) || 0;
                                                                if (hours >= 0 && hours < 24) {
                                                                    const newDate = new Date(currentReminder.fecha_hora_programada || new Date());
                                                                    newDate.setHours(hours);
                                                                    setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: newDate }));
                                                                }
                                                            }}
                                                            keyboardType="numeric"
                                                            maxLength={2}
                                                            placeholder="HH"
                                                        />
                                                        <Text style={styles.timeSeparator}>:</Text>
                                                        <TextInput
                                                            style={styles.timeInput}
                                                            value={currentReminder.fecha_hora_programada
                                                                ? String(currentReminder.fecha_hora_programada.getMinutes()).padStart(2, '0')
                                                                : '00'}
                                                            onChangeText={(text) => {
                                                                const minutes = parseInt(text) || 0;
                                                                if (minutes >= 0 && minutes < 60) {
                                                                    const newDate = new Date(currentReminder.fecha_hora_programada || new Date());
                                                                    newDate.setMinutes(minutes);
                                                                    setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: newDate }));
                                                                }
                                                            }}
                                                            keyboardType="numeric"
                                                            maxLength={2}
                                                            placeholder="MM"
                                                        />
                                                    </View>
                                                </View>

                                                <Pressable
                                                    style={styles.closeCalendarButton}
                                                    onPress={() => setShowCalendar(false)}
                                                >
                                                    <Text style={styles.closeCalendarButtonText}>Confirmar</Text>
                                                </Pressable>
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {/* Diario, Mensual, o Semanal con días: Solo selector de Hora */}
                                        <Text style={styles.modalLabel}>Hora del recordatorio *</Text>
                                        <View style={styles.timePickerContainer}>
                                            <View style={styles.timeInputRow}>
                                                <TextInput
                                                    style={styles.timeInput}
                                                    value={currentReminder.fecha_hora_programada
                                                        ? String(currentReminder.fecha_hora_programada.getHours()).padStart(2, '0')
                                                        : '09'}
                                                    onChangeText={(text) => {
                                                        const hours = parseInt(text) || 0;
                                                        if (hours >= 0 && hours < 24) {
                                                            const newDate = new Date(currentReminder.fecha_hora_programada || new Date());
                                                            newDate.setHours(hours);
                                                            setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: newDate }));
                                                        }
                                                    }}
                                                    keyboardType="numeric"
                                                    maxLength={2}
                                                    placeholder="HH"
                                                />
                                                <Text style={styles.timeSeparator}>:</Text>
                                                <TextInput
                                                    style={styles.timeInput}
                                                    value={currentReminder.fecha_hora_programada
                                                        ? String(currentReminder.fecha_hora_programada.getMinutes()).padStart(2, '0')
                                                        : '00'}
                                                    onChangeText={(text) => {
                                                        const minutes = parseInt(text) || 0;
                                                        if (minutes >= 0 && minutes < 60) {
                                                            const newDate = new Date(currentReminder.fecha_hora_programada || new Date());
                                                            newDate.setMinutes(minutes);
                                                            setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: newDate }));
                                                        }
                                                    }}
                                                    keyboardType="numeric"
                                                    maxLength={2}
                                                    placeholder="MM"
                                                />
                                            </View>
                                            {selectedDays.length > 0 && (
                                                <Text style={styles.helperText}>
                                                    Esta hora se aplicará a: {selectedDays.map(d => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d]).join(', ')}
                                                </Text>
                                            )}
                                            {currentReminder.frecuencia === 'diario' && (
                                                <Text style={styles.helperText}>
                                                    Este recordatorio se repetirá todos los días a esta hora
                                                </Text>
                                            )}
                                            {currentReminder.frecuencia === 'mensual' && (
                                                <Text style={styles.helperText}>
                                                    Este recordatorio se repetirá mensualmente a esta hora
                                                </Text>
                                            )}
                                        </View>
                                    </>
                                )}

                                <Text style={styles.modalLabel}>Tipo de Recordatorio *</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tipoContainer}>
                                    {tipoRecordatorioOptions.map((option) => (
                                        <Pressable
                                            key={option.value}
                                            style={[
                                                styles.tipoOption,
                                                currentReminder.tipo_recordatorio === option.value && styles.tipoOptionActive,
                                                currentReminder.tipo_recordatorio === option.value && { borderColor: option.color }
                                            ]}
                                            onPress={() => setCurrentReminder(prev => ({ ...prev, tipo_recordatorio: option.value }))}
                                        >
                                            <Text style={styles.tipoIcon}>{option.icon}</Text>
                                            <Text style={[
                                                styles.tipoOptionText,
                                                currentReminder.tipo_recordatorio === option.value && styles.tipoOptionTextActive
                                            ]}>
                                                {option.label.split(' ')[1]} {/* Muestra solo el nombre sin el emoji */}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>

                                <Text style={styles.modalLabel}>Frecuencia *</Text>
                                <View style={styles.frecuenciaContainer}>
                                    {frecuenciaOptions.filter(opt => opt.value !== 'semanal').map((option) => (
                                        <Pressable
                                            key={option.value}
                                            style={[
                                                styles.frecuenciaOption,
                                                currentReminder.frecuencia === option.value && styles.frecuenciaOptionActive
                                            ]}
                                            onPress={() => {
                                                setCurrentReminder(prev => ({ ...prev, frecuencia: option.value as any }));
                                                if (option.value !== 'semanal') {
                                                    setSelectedDays([]);
                                                }
                                            }}
                                        >
                                            <Text style={[
                                                styles.frecuenciaOptionText,
                                                currentReminder.frecuencia === option.value && styles.frecuenciaOptionTextActive
                                            ]}>
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>

                                {/* Selector de días de la semana */}
                                <Text style={styles.modalLabel}>Repetir ciertos días (Semanal)</Text>
                                <View style={styles.weekDaysContainer}>
                                    {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((day, index) => {
                                        const isSelected = selectedDays.includes(index);
                                        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

                                        return (
                                            <Pressable
                                                key={index}
                                                style={[
                                                    styles.weekDayButton,
                                                    isSelected && styles.weekDayButtonActive
                                                ]}
                                                onPress={() => {
                                                    setSelectedDays(prev => {
                                                        const newDays = isSelected
                                                            ? prev.filter(d => d !== index)
                                                            : [...prev, index].sort();

                                                        // Si hay días seleccionados, cambiar frecuencia a semanal
                                                        if (newDays.length > 0) {
                                                            setCurrentReminder(p => ({ ...p, frecuencia: 'semanal' }));
                                                        } else if (currentReminder.frecuencia === 'semanal') {
                                                            setCurrentReminder(p => ({ ...p, frecuencia: 'una_vez' }));
                                                        }

                                                        return newDays;
                                                    });
                                                }}
                                            >
                                                <Text style={[
                                                    styles.weekDayText,
                                                    isSelected && styles.weekDayTextActive
                                                ]}>
                                                    {day}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                                {selectedDays.length > 0 && (
                                    <Text style={styles.selectedDaysInfo}>
                                        Se repetirá: {selectedDays.map(d => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d]).join(', ')}
                                    </Text>
                                )}

                                <View style={styles.modalButtons}>
                                    <Pressable
                                        style={[styles.modalButton, styles.cancelButton]}
                                        onPress={() => setModalVisible(false)}
                                    >
                                        <Text style={styles.cancelButtonText}>Cancelar</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.modalButton, styles.saveButton, isSaving && styles.saveButtonDisabled]}
                                        onPress={handleAddOrUpdateReminder}
                                        disabled={isSaving}
                                    >
                                        <Text style={styles.saveButtonText}>
                                            {isSaving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
                                        </Text>
                                    </Pressable>
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Panel lateral */}
            <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0f4f8',
    },
    headerSection: {
        backgroundColor: '#7c3aed',
        padding: 20,
        paddingTop: 15,
        paddingBottom: 25,
    },
    headerSubtitle: {
        fontSize: 18,
        color: '#e9d5ff',
        marginBottom: 16,
        fontWeight: '600',
    },
    addButton: {
        backgroundColor: '#8b5cf6',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        gap: 8,
    },
    addButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 10,
        color: '#6b7280',
        fontSize: 14,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
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
    scrollView: {
        flex: 1,
    },
    listContent: {
        padding: 20,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#6b7280',
        marginTop: 20,
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 14,
        color: '#9ca3af',
        marginTop: 8,
        textAlign: 'center',
    },
    reminderCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 3,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    reminderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        flexWrap: 'wrap',
        gap: 8,
    },
    reminderTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111827',
        flex: 1,
    },
    tipoBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        gap: 4,
    },
    tipoBadgeIcon: {
        fontSize: 14,
    },
    tipoBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    reminderDesc: {
        fontSize: 14,
        color: '#4b5563',
        marginBottom: 10,
    },
    reminderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    reminderDetailText: {
        fontSize: 13,
        color: '#6b7280',
        marginLeft: 6,
    },
    reminderActions: {
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
    },
    actionButton: {
        padding: 8,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        width: '90%',
        maxWidth: 500,
        maxHeight: '90%',
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#7c3aed',
    },
    modalLabel: {
        fontSize: 16,
        color: '#374151',
        marginBottom: 8,
        marginTop: 12,
        fontWeight: '500',
    },
    modalInfo: {
        fontSize: 16,
        marginBottom: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#f3f4f6',
        borderRadius: 8,
        color: '#4b5563',
        fontWeight: '600',
    },
    modalInput: {
        backgroundColor: '#f9fafb',
        height: 48,
        borderColor: '#d1d5db',
        borderWidth: 1,
        borderRadius: 8,
        marginBottom: 12,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
        paddingTop: 12,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        height: 48,
        borderColor: '#d1d5db',
        borderWidth: 1,
        borderRadius: 8,
        marginBottom: 12,
        paddingHorizontal: 16,
        gap: 10,
    },
    dateButtonText: {
        fontSize: 16,
        color: '#374151',
    },
    frecuenciaContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 20,
    },
    frecuenciaOption: {
        flex: 1,
        minWidth: '45%',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#d1d5db',
        backgroundColor: '#f9fafb',
        alignItems: 'center',
    },
    frecuenciaOptionActive: {
        backgroundColor: '#7c3aed',
        borderColor: '#7c3aed',
    },
    frecuenciaOptionText: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    frecuenciaOptionTextActive: {
        color: 'white',
        fontWeight: '600',
    },
    tipoContainer: {
        marginBottom: 20,
        maxHeight: 100,
    },
    tipoOption: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#e5e7eb',
        backgroundColor: '#f9fafb',
        marginRight: 12,
        alignItems: 'center',
        minWidth: 120,
    },
    tipoOptionActive: {
        backgroundColor: '#ede9fe',
        borderWidth: 2,
    },
    tipoIcon: {
        fontSize: 28,
        marginBottom: 4,
    },
    tipoOptionText: {
        fontSize: 13,
        color: '#6b7280',
        fontWeight: '500',
        textAlign: 'center',
    },
    tipoOptionTextActive: {
        color: '#7c3aed',
        fontWeight: '600',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 24,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#f3f4f6',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6b7280',
    },
    saveButton: {
        backgroundColor: '#7c3aed',
    },
    saveButtonDisabled: {
        backgroundColor: '#9ca3af',
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
    },
    calendarContainer: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginVertical: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    timePickerContainer: {
        marginTop: 20,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    timePickerLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 12,
        textAlign: 'center',
    },
    timeInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    timeInput: {
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 8,
        padding: 12,
        fontSize: 24,
        fontWeight: '600',
        color: '#111827',
        textAlign: 'center',
        width: 70,
    },
    timeSeparator: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#6b7280',
    },
    closeCalendarButton: {
        backgroundColor: '#7c3aed',
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 20,
        alignItems: 'center',
    },
    closeCalendarButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    weekDaysContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 8,
    },
    weekDayButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#d1d5db',
        backgroundColor: '#f9fafb',
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekDayButtonActive: {
        backgroundColor: '#7c3aed',
        borderColor: '#7c3aed',
    },
    weekDayText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    weekDayTextActive: {
        color: 'white',
    },
    selectedDaysInfo: {
        fontSize: 13,
        color: '#7c3aed',
        fontWeight: '500',
        textAlign: 'center',
        marginBottom: 12,
        fontStyle: 'italic',
    },
});
