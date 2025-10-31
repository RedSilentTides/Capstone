import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable,
    Platform, TextInput, Modal, RefreshControl
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlusCircle, Calendar, Clock, Repeat, Trash2, Edit2, X } from 'lucide-react-native';
import { useAuth } from '../_layout';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

interface Recordatorio {
    id: number;
    adulto_mayor_id: number;
    titulo: string;
    descripcion?: string | null;
    fecha_hora_programada: string;
    frecuencia: 'una_vez' | 'diario' | 'semanal' | 'mensual';
    estado: string;
    fecha_creacion: string;
}

interface ReminderFormData {
    id?: number;
    titulo: string;
    descripcion: string;
    fecha_hora_programada: Date;
    frecuencia: 'una_vez' | 'diario' | 'semanal' | 'mensual';
}

const frecuenciaOptions = [
    { label: 'Solo una vez', value: 'una_vez' },
    { label: 'Diario', value: 'diario' },
    { label: 'Semanal', value: 'semanal' },
    { label: 'Mensual', value: 'mensual' },
];

export default function RecordatoriosScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { setAuthState } = useAuth();

    // Obtenemos los parámetros de la URL
    const adultoMayorId = params.adulto_mayor_id ? parseInt(params.adulto_mayor_id as string) : null;
    const nombreAdultoMayor = params.nombre as string || 'Persona';

    const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentReminder, setCurrentReminder] = useState<Partial<ReminderFormData>>({});
    const [isSaving, setIsSaving] = useState(false);

    const getToken = useCallback(async (): Promise<string | null> => {
        const tokenKey = 'userToken';
        if (Platform.OS === 'web') {
            return await AsyncStorage.getItem(tokenKey);
        } else {
            return await SecureStore.getItemAsync(tokenKey);
        }
    }, []);

    const fetchRecordatorios = useCallback(async (isRefreshing = false) => {
        if (!adultoMayorId) {
            setError('No se especificó un adulto mayor.');
            setIsLoading(false);
            return;
        }

        if (!isRefreshing) setIsLoading(true);
        setError(null);

        try {
            const token = await getToken();
            if (!token) {
                setAuthState(false);
                router.replace('/login');
                return;
            }

            console.log(`Obteniendo recordatorios para adulto_mayor_id: ${adultoMayorId}...`);
            const response = await axios.get<Recordatorio[]>(`${API_URL}/recordatorios`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { adulto_mayor_id: adultoMayorId }
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
        fetchRecordatorios();
    }, [fetchRecordatorios]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchRecordatorios(true);
    };

    const handleAddOrUpdateReminder = async () => {
        if (!currentReminder.titulo || !currentReminder.fecha_hora_programada || !adultoMayorId) {
            Alert.alert('Error', 'Completa el título y la fecha/hora.');
            return;
        }

        const token = await getToken();
        if (!token) {
            setAuthState(false);
            router.replace('/login');
            return;
        }

        const dataToSend = {
            titulo: currentReminder.titulo,
            descripcion: currentReminder.descripcion || null,
            adulto_mayor_id: adultoMayorId,
            fecha_hora_programada: currentReminder.fecha_hora_programada.toISOString(),
            frecuencia: currentReminder.frecuencia ?? 'una_vez',
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
        setCurrentReminder({
            titulo: '',
            descripcion: '',
            fecha_hora_programada: new Date(),
            frecuencia: 'una_vez',
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
        });
        setIsEditing(true);
        setModalVisible(true);
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

    const renderRecordatorioCard = (recordatorio: Recordatorio) => (
        <View key={recordatorio.id} style={styles.reminderCard}>
            <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.reminderTitle}>{recordatorio.titulo}</Text>
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
            <View style={styles.reminderActions}>
                <Pressable onPress={() => openEditModal(recordatorio)} style={styles.actionButton}>
                    <Edit2 size={20} color="#3b82f6" />
                </Pressable>
                <Pressable onPress={() => handleDeleteReminder(recordatorio.id)} style={styles.actionButton}>
                    <Trash2 size={20} color="#ef4444" />
                </Pressable>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.headerSection}>
                <Text style={styles.headerTitle}>Recordatorios</Text>
                <Text style={styles.headerSubtitle}>{nombreAdultoMayor}</Text>
                <Pressable onPress={openAddModal} style={styles.addButton}>
                    <PlusCircle size={24} color="white" />
                    <Text style={styles.addButtonText}>Nuevo Recordatorio</Text>
                </Pressable>
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
                                Crea un recordatorio para mantener un seguimiento de medicamentos, citas o tareas importantes.
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

                            <Text style={styles.modalLabel}>Fecha *</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="YYYY-MM-DD"
                                value={currentReminder.fecha_hora_programada?.toISOString().split('T')[0] || ''}
                                onChangeText={(text) => {
                                    const [year, month, day] = text.split('-').map(Number);
                                    if (year && month && day) {
                                        const newDate = currentReminder.fecha_hora_programada ? new Date(currentReminder.fecha_hora_programada) : new Date();
                                        newDate.setFullYear(year, month - 1, day);
                                        setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: newDate }));
                                    }
                                }}
                            />

                            <Text style={styles.modalLabel}>Hora *</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="HH:MM (24 horas)"
                                value={currentReminder.fecha_hora_programada ?
                                    `${String(currentReminder.fecha_hora_programada.getHours()).padStart(2, '0')}:${String(currentReminder.fecha_hora_programada.getMinutes()).padStart(2, '0')}` : ''}
                                onChangeText={(text) => {
                                    const [hours, minutes] = text.split(':').map(Number);
                                    if (!isNaN(hours) && !isNaN(minutes)) {
                                        const newDate = currentReminder.fecha_hora_programada ? new Date(currentReminder.fecha_hora_programada) : new Date();
                                        newDate.setHours(hours, minutes, 0, 0);
                                        setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: newDate }));
                                    }
                                }}
                            />

                            <Text style={styles.modalLabel}>Frecuencia *</Text>
                            <View style={styles.frecuenciaContainer}>
                                {frecuenciaOptions.map((option) => (
                                    <Pressable
                                        key={option.value}
                                        style={[
                                            styles.frecuenciaOption,
                                            currentReminder.frecuencia === option.value && styles.frecuenciaOptionActive
                                        ]}
                                        onPress={() => setCurrentReminder(prev => ({ ...prev, frecuencia: option.value as any }))}
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
        paddingTop: 40,
        paddingBottom: 25,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 16,
        color: '#e9d5ff',
        marginBottom: 16,
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
    reminderTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 6,
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
});
