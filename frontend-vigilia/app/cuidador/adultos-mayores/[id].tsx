import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView,
    Platform, ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import CustomHeader from '../../../components/CustomHeader';
import SlidingPanel from '../../../components/Slidingpanel';
import { User, Calendar, MapPin, FileText, Bell, AlertTriangle, Heart } from 'lucide-react-native';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

type AdultoMayorDetalle = {
    id: number;
    usuario_id: number | null;
    nombre_completo: string;
    fecha_nacimiento: string | null;
    direccion: string | null;
    notas_relevantes: string | null;
    token_fcm_app_adulto: string | null;
    fecha_registro: string;
};

type EventoCaida = {
    id: number;
    dispositivo_id: number;
    timestamp_caida: string;
    url_video_almacenado?: string | null;
    confirmado_por_usuario?: boolean | null;
    nombre_dispositivo?: string | null;
};

export default function AdultoMayorDetalleScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [adulto, setAdulto] = useState<AdultoMayorDetalle | null>(null);
    const [caidas, setCaidas] = useState<EventoCaida[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const getToken = useCallback(async (): Promise<string | null> => {
        const tokenKey = 'userToken';
        if (Platform.OS === 'web') return await AsyncStorage.getItem(tokenKey);
        else return await SecureStore.getItemAsync(tokenKey);
    }, []);

    const fetchDatos = useCallback(async (isRefreshing = false) => {
        if (!isRefreshing) setLoading(true);
        setError(null);

        try {
            const token = await getToken();
            if (!token) {
                setError('No se encontró el token de autenticación.');
                return;
            }

            // Obtener datos del adulto mayor
            const adultoResponse = await axios.get(`${API_URL}/adultos-mayores`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const adultoEncontrado = adultoResponse.data.find((a: AdultoMayorDetalle) => a.id === parseInt(id));

            if (!adultoEncontrado) {
                setError('No se encontró la persona.');
                return;
            }

            setAdulto(adultoEncontrado);

            // Obtener eventos de caída del adulto mayor
            try {
                const caidasResponse = await axios.get(`${API_URL}/eventos-caida`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                // Filtrar solo las caídas de este adulto mayor
                // Nota: Necesitarías tener la relación dispositivo -> adulto_mayor en el backend
                // Por ahora, mostramos todas las caídas del cuidador
                setCaidas(caidasResponse.data.slice(0, 5)); // Últimas 5 caídas
            } catch (caidaError) {
                console.error('Error al obtener caídas:', caidaError);
                setCaidas([]);
            }

        } catch (err) {
            console.error('Error al obtener detalles:', err);
            if (axios.isAxiosError(err)) {
                const message = err.response?.data?.detail || 'Error al obtener detalles.';
                setError(message);
            } else {
                setError('Error inesperado al obtener detalles.');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getToken, id]);

    useEffect(() => {
        fetchDatos();
    }, [fetchDatos]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchDatos(true);
    };

    const calcularEdad = (fechaNacimiento: string | null): string => {
        if (!fechaNacimiento) return 'No especificada';
        const hoy = new Date();
        const nacimiento = new Date(fechaNacimiento);
        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        const mes = hoy.getMonth() - nacimiento.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
            edad--;
        }
        return `${edad} años`;
    };

    const formatFecha = (fecha: string) => {
        const date = new Date(fecha);
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#7c3aed" />
                <Text style={styles.loadingText}>Cargando detalles...</Text>
            </View>
        );
    }

    if (error || !adulto) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error || 'No se encontró la persona'}</Text>
                <Pressable style={styles.retryButton} onPress={() => fetchDatos()}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </Pressable>
                <Pressable style={styles.backButton} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>Volver</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <CustomHeader
                title={adulto.nombre_completo}
                onMenuPress={() => setIsPanelOpen(true)}
                showBackButton={true}
            />

            <ScrollView
                style={styles.container}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                {/* Información Personal */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Heart size={20} color="#7c3aed" />
                        <Text style={styles.sectionTitle}>Información Personal</Text>
                    </View>

                    <View style={styles.avatarLarge}>
                        <User size={64} color="white" />
                    </View>

                    <Text style={styles.nombre}>{adulto.nombre_completo}</Text>

                    {adulto.fecha_nacimiento && (
                        <View style={styles.infoRow}>
                            <Calendar size={18} color="#6b7280" />
                            <View style={styles.infoTextContainer}>
                                <Text style={styles.infoLabel}>Edad</Text>
                                <Text style={styles.infoValue}>{calcularEdad(adulto.fecha_nacimiento)}</Text>
                                <Text style={styles.infoSubtext}>
                                    Nacimiento: {new Date(adulto.fecha_nacimiento).toLocaleDateString('es-ES')}
                                </Text>
                            </View>
                        </View>
                    )}

                    {adulto.direccion && (
                        <View style={styles.infoRow}>
                            <MapPin size={18} color="#6b7280" />
                            <View style={styles.infoTextContainer}>
                                <Text style={styles.infoLabel}>Dirección</Text>
                                <Text style={styles.infoValue}>{adulto.direccion}</Text>
                            </View>
                        </View>
                    )}

                    {adulto.notas_relevantes && (
                        <View style={styles.infoRow}>
                            <FileText size={18} color="#6b7280" />
                            <View style={styles.infoTextContainer}>
                                <Text style={styles.infoLabel}>Notas Relevantes</Text>
                                <Text style={styles.infoValue}>{adulto.notas_relevantes}</Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.infoRow}>
                        <Calendar size={18} color="#6b7280" />
                        <View style={styles.infoTextContainer}>
                            <Text style={styles.infoLabel}>Fecha de Registro</Text>
                            <Text style={styles.infoValue}>
                                {new Date(adulto.fecha_registro).toLocaleDateString('es-ES')}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Acciones Rápidas */}
                <View style={styles.actionsSection}>
                    <Pressable
                        style={[styles.actionCard, { backgroundColor: '#ede9fe' }]}
                        onPress={() => router.push({
                            pathname: '/cuidador/recordatorios',
                            params: { adulto_mayor_id: adulto.id, nombre: adulto.nombre_completo }
                        })}
                    >
                        <Bell size={32} color="#7c3aed" />
                        <Text style={[styles.actionCardText, { color: '#7c3aed' }]}>Recordatorios</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.actionCard, { backgroundColor: '#fee2e2' }]}
                        onPress={() => router.push('/cuidador/alertas')}
                    >
                        <AlertTriangle size={32} color="#ef4444" />
                        <Text style={[styles.actionCardText, { color: '#ef4444' }]}>Alertas</Text>
                    </Pressable>
                </View>

                {/* Últimas Caídas Detectadas */}
                {caidas.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <AlertTriangle size={20} color="#ef4444" />
                            <Text style={styles.sectionTitle}>Últimas Caídas Detectadas</Text>
                        </View>

                        {caidas.map((caida) => (
                            <View key={caida.id} style={styles.caidaCard}>
                                <View style={styles.caidaHeader}>
                                    <AlertTriangle size={20} color="#ef4444" />
                                    <Text style={styles.caidaTitle}>
                                        Caída Detectada
                                    </Text>
                                </View>
                                <Text style={styles.caidaFecha}>
                                    {formatFecha(caida.timestamp_caida)}
                                </Text>
                                {caida.nombre_dispositivo && (
                                    <Text style={styles.caidaDispositivo}>
                                        Dispositivo: {caida.nombre_dispositivo}
                                    </Text>
                                )}
                                {caida.confirmado_por_usuario !== null && (
                                    <View style={[
                                        styles.caidaEstado,
                                        { backgroundColor: caida.confirmado_por_usuario ? '#dcfce7' : '#fef3c7' }
                                    ]}>
                                        <Text style={[
                                            styles.caidaEstadoTexto,
                                            { color: caida.confirmado_por_usuario ? '#16a34a' : '#f59e0b' }
                                        ]}>
                                            {caida.confirmado_por_usuario ? 'Confirmada' : 'Pendiente'}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        ))}

                        <Pressable
                            style={styles.verMasButton}
                            onPress={() => router.push('/cuidador/alertas')}
                        >
                            <Text style={styles.verMasButtonText}>Ver Todas las Alertas</Text>
                        </Pressable>
                    </View>
                )}
            </ScrollView>

            <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0f4f8',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
        backgroundColor: '#f0f4f8',
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
        paddingHorizontal: 40,
    },
    retryButton: {
        backgroundColor: '#7c3aed',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        marginBottom: 10,
    },
    retryButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    backButton: {
        backgroundColor: '#e5e7eb',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    backButtonText: {
        color: '#374151',
        fontSize: 14,
        fontWeight: '600',
    },
    section: {
        backgroundColor: 'white',
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 3,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginLeft: 8,
    },
    avatarLarge: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#7c3aed',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        marginBottom: 16,
    },
    nombre: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 20,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    infoTextContainer: {
        flex: 1,
        marginLeft: 12,
    },
    infoLabel: {
        fontSize: 12,
        color: '#6b7280',
        marginBottom: 4,
        fontWeight: '500',
    },
    infoValue: {
        fontSize: 16,
        color: '#111827',
        fontWeight: '500',
    },
    infoSubtext: {
        fontSize: 13,
        color: '#9ca3af',
        marginTop: 2,
    },
    actionsSection: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 16,
        marginTop: 16,
    },
    actionCard: {
        flex: 1,
        padding: 20,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
        elevation: 2,
    },
    actionCardText: {
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
    },
    caidaCard: {
        backgroundColor: '#fef2f2',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#ef4444',
    },
    caidaHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    caidaTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginLeft: 8,
    },
    caidaFecha: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 4,
    },
    caidaDispositivo: {
        fontSize: 13,
        color: '#9ca3af',
        marginBottom: 8,
    },
    caidaEstado: {
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 4,
        marginTop: 4,
    },
    caidaEstadoTexto: {
        fontSize: 12,
        fontWeight: '600',
    },
    verMasButton: {
        backgroundColor: '#7c3aed',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
    },
    verMasButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
});
