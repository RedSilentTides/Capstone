import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView,
    Platform, ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import CustomHeader from '../components/CustomHeader';
import SlidingPanel from '../components/Slidingpanel';
import { UserPlus, Check, X, Clock, Mail } from 'lucide-react-native';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

type SolicitudCuidado = {
    id: number;
    cuidador_id: number;
    email_destinatario: string;
    usuario_destinatario_id: number | null;
    estado: 'pendiente' | 'aceptada' | 'rechazada';
    mensaje: string | null;
    fecha_solicitud: string;
    fecha_respuesta: string | null;
    nombre_cuidador: string | null;
    email_cuidador: string | null;
};

export default function SolicitudesScreen() {
    const router = useRouter();
    const [solicitudes, setSolicitudes] = useState<SolicitudCuidado[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const getToken = useCallback(async (): Promise<string | null> => {
        const tokenKey = 'userToken';
        if (Platform.OS === 'web') return await AsyncStorage.getItem(tokenKey);
        else return await SecureStore.getItemAsync(tokenKey);
    }, []);

    const fetchSolicitudes = useCallback(async (isRefreshing = false) => {
        if (!isRefreshing) setLoading(true);
        setError(null);

        try {
            const token = await getToken();
            if (!token) {
                setError('No se encontró el token de autenticación.');
                return;
            }

            const response = await axios.get(`${API_URL}/solicitudes-cuidado/recibidas`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setSolicitudes(response.data);
        } catch (err) {
            console.error('Error al obtener solicitudes:', err);
            if (axios.isAxiosError(err)) {
                const message = err.response?.data?.detail || 'Error al obtener solicitudes.';
                setError(message);
            } else {
                setError('Error inesperado al obtener solicitudes.');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getToken]);

    useEffect(() => {
        fetchSolicitudes();
    }, [fetchSolicitudes]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchSolicitudes(true);
    };

    const handleAceptar = async (solicitudId: number) => {
        const confirmacion = Platform.OS === 'web'
            ? window.confirm('¿Estás seguro de que deseas aceptar esta solicitud? Tu rol cambiará a "Adulto Mayor" y se creará una relación con el cuidador.')
            : true; // En móvil usaremos Alert nativo

        if (!confirmacion) return;

        try {
            const token = await getToken();
            if (!token) {
                if (Platform.OS === 'web') {
                    alert('Error: No se encontró el token de autenticación.');
                }
                return;
            }

            await axios.put(
                `${API_URL}/solicitudes-cuidado/${solicitudId}/aceptar`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (Platform.OS === 'web') {
                alert('Solicitud aceptada exitosamente. Ahora eres un adulto mayor bajo el cuidado de esta persona.');
            }

            // Recargar solicitudes y redirigir al dashboard
            await fetchSolicitudes();
            router.push('/');
        } catch (err) {
            console.error('Error al aceptar solicitud:', err);
            const errorMsg = axios.isAxiosError(err)
                ? (err.response?.data?.detail || 'Error al aceptar la solicitud.')
                : 'Error inesperado al aceptar la solicitud.';

            if (Platform.OS === 'web') {
                alert(`Error: ${errorMsg}`);
            }
        }
    };

    const handleRechazar = async (solicitudId: number) => {
        const confirmacion = Platform.OS === 'web'
            ? window.confirm('¿Estás seguro de que deseas rechazar esta solicitud?')
            : true;

        if (!confirmacion) return;

        try {
            const token = await getToken();
            if (!token) {
                if (Platform.OS === 'web') {
                    alert('Error: No se encontró el token de autenticación.');
                }
                return;
            }

            await axios.put(
                `${API_URL}/solicitudes-cuidado/${solicitudId}/rechazar`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (Platform.OS === 'web') {
                alert('Solicitud rechazada exitosamente.');
            }

            // Recargar solicitudes
            await fetchSolicitudes();
        } catch (err) {
            console.error('Error al rechazar solicitud:', err);
            const errorMsg = axios.isAxiosError(err)
                ? (err.response?.data?.detail || 'Error al rechazar la solicitud.')
                : 'Error inesperado al rechazar la solicitud.';

            if (Platform.OS === 'web') {
                alert(`Error: ${errorMsg}`);
            }
        }
    };

    const getEstadoColor = (estado: string) => {
        switch (estado) {
            case 'pendiente': return '#f59e0b';
            case 'aceptada': return '#10b981';
            case 'rechazada': return '#ef4444';
            default: return '#6b7280';
        }
    };

    const getEstadoTexto = (estado: string) => {
        switch (estado) {
            case 'pendiente': return 'Pendiente';
            case 'aceptada': return 'Aceptada';
            case 'rechazada': return 'Rechazada';
            default: return estado;
        }
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

    const renderSolicitud = (solicitud: SolicitudCuidado) => (
        <View key={solicitud.id} style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <UserPlus size={20} color="#7c3aed" />
                    <Text style={styles.cardTitle}>
                        {solicitud.nombre_cuidador || 'Cuidador'}
                    </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: getEstadoColor(solicitud.estado) }]}>
                    <Text style={styles.badgeText}>{getEstadoTexto(solicitud.estado)}</Text>
                </View>
            </View>

            <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                    <Mail size={16} color="#6b7280" />
                    <Text style={styles.infoText}>{solicitud.email_cuidador}</Text>
                </View>

                <View style={styles.infoRow}>
                    <Clock size={16} color="#6b7280" />
                    <Text style={styles.infoText}>{formatFecha(solicitud.fecha_solicitud)}</Text>
                </View>

                {solicitud.mensaje && (
                    <View style={styles.mensajeContainer}>
                        <Text style={styles.mensajeLabel}>Mensaje:</Text>
                        <Text style={styles.mensajeText}>{solicitud.mensaje}</Text>
                    </View>
                )}
            </View>

            {solicitud.estado === 'pendiente' && (
                <View style={styles.cardActions}>
                    <Pressable
                        style={[styles.actionButton, styles.acceptButton]}
                        onPress={() => handleAceptar(solicitud.id)}
                    >
                        <Check size={18} color="white" />
                        <Text style={styles.actionButtonText}>Aceptar</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => handleRechazar(solicitud.id)}
                    >
                        <X size={18} color="white" />
                        <Text style={styles.actionButtonText}>Rechazar</Text>
                    </Pressable>
                </View>
            )}

            {solicitud.fecha_respuesta && (
                <Text style={styles.fechaRespuesta}>
                    Respondida: {formatFecha(solicitud.fecha_respuesta)}
                </Text>
            )}
        </View>
    );

    return (
        <View style={{ flex: 1 }}>
            <CustomHeader
                title="Solicitudes de Cuidado"
                onMenuPress={() => setIsPanelOpen(true)}
                showBackButton={true}
            />

            <ScrollView
                style={styles.container}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                {loading && !refreshing ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#7c3aed" />
                        <Text style={styles.loadingText}>Cargando solicitudes...</Text>
                    </View>
                ) : error ? (
                    <View style={styles.centerContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                        <Pressable style={styles.retryButton} onPress={() => fetchSolicitudes()}>
                            <Text style={styles.retryButtonText}>Reintentar</Text>
                        </Pressable>
                    </View>
                ) : solicitudes.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <UserPlus size={64} color="#9ca3af" />
                        <Text style={styles.emptyText}>No tienes solicitudes de cuidado</Text>
                        <Text style={styles.emptySubtext}>
                            Cuando alguien te envíe una solicitud, aparecerá aquí
                        </Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.sectionTitle}>
                            {solicitudes.filter(s => s.estado === 'pendiente').length > 0 &&
                                `${solicitudes.filter(s => s.estado === 'pendiente').length} solicitud(es) pendiente(s)`
                            }
                        </Text>
                        {solicitudes.map(renderSolicitud)}
                    </>
                )}
            </ScrollView>
            <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f0f4f8',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
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
        paddingHorizontal: 40,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#7c3aed',
        marginBottom: 15,
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
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginLeft: 8,
    },
    badge: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 12,
    },
    badgeText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    cardBody: {
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 14,
        color: '#4b5563',
        marginLeft: 8,
    },
    mensajeContainer: {
        backgroundColor: '#f3f4f6',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
    },
    mensajeLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6b7280',
        marginBottom: 4,
    },
    mensajeText: {
        fontSize: 14,
        color: '#111827',
        lineHeight: 20,
    },
    cardActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    acceptButton: {
        backgroundColor: '#10b981',
    },
    rejectButton: {
        backgroundColor: '#ef4444',
    },
    actionButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    fechaRespuesta: {
        fontSize: 12,
        color: '#9ca3af',
        marginTop: 8,
        textAlign: 'right',
    },
});
