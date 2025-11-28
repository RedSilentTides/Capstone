import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView,
    ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import CustomHeader from '../../../../components/CustomHeader';
import { User, UserPlus, Calendar, MapPin, FileText, Bell } from 'lucide-react-native';
import { useAuth } from '../../../../contexts/AuthContext';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

type AdultoMayor = {
    id: number;
    usuario_id: number | null;
    nombre_completo: string;
    fecha_nacimiento: string | null;
    direccion: string | null;
    notas_relevantes: string | null;
    token_fcm_app_adulto: string | null;
    fecha_registro: string;
};

export default function AdultosMayoresScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [adultos, setAdultos] = useState<AdultoMayor[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAdultos = useCallback(async (isRefreshing = false) => {
        if (!user) return;
        if (!isRefreshing) setLoading(true);
        setError(null);

        try {
            const token = await user.getIdToken();
            const response = await axios.get(`${API_URL}/adultos-mayores`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setAdultos(response.data);
        } catch (err) {
            console.error('Error al obtener adultos mayores:', err);
            if (axios.isAxiosError(err)) {
                const message = err.response?.data?.detail || 'Error al obtener adultos mayores.';
                setError(message);
            } else {
                setError('Error inesperado al obtener adultos mayores.');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        fetchAdultos();
    }, [fetchAdultos]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchAdultos(true);
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
            month: 'long',
            year: 'numeric'
        });
    };

    const renderAdultoCard = (adulto: AdultoMayor) => (
        <Pressable
            key={adulto.id}
            style={styles.card}
            onPress={() => router.push(`/cuidador/adultos-mayores/${adulto.id}`)}
        >
            <View style={styles.cardHeader}>
                <View style={styles.avatarContainer}>
                    <User size={32} color="white" />
                </View>
                <View style={styles.headerInfo}>
                    <Text style={styles.cardTitle}>{adulto.nombre_completo}</Text>
                    {adulto.fecha_nacimiento && (
                        <Text style={styles.cardSubtitle}>
                            {calcularEdad(adulto.fecha_nacimiento)}
                        </Text>
                    )}
                </View>
            </View>

            <View style={styles.cardBody}>
                {adulto.fecha_nacimiento && (
                    <View style={styles.infoRow}>
                        <Calendar size={16} color="#6b7280" />
                        <Text style={styles.infoText}>
                            Nacimiento: {formatFecha(adulto.fecha_nacimiento)}
                        </Text>
                    </View>
                )}

                {adulto.direccion && (
                    <View style={styles.infoRow}>
                        <MapPin size={16} color="#6b7280" />
                        <Text style={styles.infoText} numberOfLines={1}>
                            {adulto.direccion}
                        </Text>
                    </View>
                )}

                {adulto.notas_relevantes && (
                    <View style={styles.infoRow}>
                        <FileText size={16} color="#6b7280" />
                        <Text style={styles.infoText} numberOfLines={2}>
                            {adulto.notas_relevantes}
                        </Text>
                    </View>
                )}
            </View>

            <View style={styles.cardFooter}>
                <Text style={styles.footerText}>
                    Registrado: {formatFecha(adulto.fecha_registro)}
                </Text>
                <Pressable
                    style={styles.recordatoriosButton}
                    onPress={(e) => {
                        e.stopPropagation();
                        router.push({
                            pathname: '/cuidador/recordatorios',
                            params: { adulto_mayor_id: adulto.id, nombre: adulto.nombre_completo }
                        });
                    }}
                >
                    <Bell size={16} color="#7c3aed" />
                    <Text style={styles.recordatoriosButtonText}>Recordatorios</Text>
                </Pressable>
            </View>
        </Pressable>
    );

    return (
        <View style={{ flex: 1 }}>
            <CustomHeader
                title="Adultos Mayores"
                onMenuPress={() => router.push('/panel')}
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
                        <ActivityIndicator size="large" color="#2563eb" />
                        <Text style={styles.loadingText}>Cargando personas...</Text>
                    </View>
                ) : error ? (
                    <View style={styles.centerContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                        <Pressable style={styles.retryButton} onPress={() => fetchAdultos()}>
                            <Text style={styles.retryButtonText}>Reintentar</Text>
                        </Pressable>
                    </View>
                ) : adultos.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <User size={64} color="#9ca3af" />
                        <Text style={styles.emptyText}>No tienes personas asignadas</Text>
                        <Text style={styles.emptySubtext}>
                            Envía solicitudes de cuidado para agregar personas
                        </Text>
                        <Pressable
                            style={styles.addButton}
                            onPress={() => router.push('/cuidador/agregar-persona')}
                        >
                            <UserPlus size={20} color="white" />
                            <Text style={styles.addButtonText}>Agregar Persona</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <View style={styles.header}>
                            <Text style={styles.sectionTitle}>
                                {adultos.length} {adultos.length === 1 ? 'Persona' : 'Personas'}
                            </Text>
                            <Pressable
                                style={styles.addButtonSmall}
                                onPress={() => router.push('/cuidador/agregar-persona')}
                            >
                                <UserPlus size={16} color="white" />
                            </Pressable>
                        </View>
                        {adultos.map(renderAdultoCard)}
                    </>
                )}
            </ScrollView>
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
        backgroundColor: '#2563eb',
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
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
    },
    addButtonSmall: {
        backgroundColor: '#2563eb',
        padding: 10,
        borderRadius: 8,
    },
    addButton: {
        backgroundColor: '#2563eb',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    addButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
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
        alignItems: 'center',
        marginBottom: 12,
    },
    avatarContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#2563eb',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerInfo: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 14,
        color: '#6b7280',
    },
    cardBody: {
        marginBottom: 8,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 14,
        color: '#4b5563',
        marginLeft: 8,
        flex: 1,
    },
    cardFooter: {
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        paddingTop: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#9ca3af',
    },
    recordatoriosButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3e8ff',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        gap: 6,
    },
    recordatoriosButtonText: {
        fontSize: 13,
        color: '#7c3aed',
        fontWeight: '600',
    },
});
