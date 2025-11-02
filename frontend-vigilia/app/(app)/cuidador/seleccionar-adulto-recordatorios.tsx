import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView,
    Platform, ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import CustomHeader from '../../../components/CustomHeader';
import { User, Calendar, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../../contexts/AuthContext';

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

export default function SeleccionarAdultoRecordatoriosScreen() {
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

    const handleSelectAdulto = (adulto: AdultoMayor) => {
        router.push({
            pathname: '/cuidador/recordatorios',
            params: {
                adulto_mayor_id: adulto.id,
                nombre: adulto.nombre_completo
            }
        } as any);
    };

    const renderAdultoCard = (adulto: AdultoMayor) => (
        <Pressable
            key={adulto.id}
            style={styles.card}
            onPress={() => handleSelectAdulto(adulto)}
        >
            <View style={styles.cardContent}>
                <View style={styles.avatarContainer}>
                    <User size={28} color="white" />
                </View>
                <View style={styles.infoContainer}>
                    <Text style={styles.cardTitle}>{adulto.nombre_completo}</Text>
                    {adulto.fecha_nacimiento && (
                        <View style={styles.infoRow}>
                            <Calendar size={14} color="#6b7280" />
                            <Text style={styles.infoText}>
                                {calcularEdad(adulto.fecha_nacimiento)}
                            </Text>
                        </View>
                    )}
                </View>
                <ChevronRight size={24} color="#9ca3af" />
            </View>
        </Pressable>
    );

    return (
        <View style={{ flex: 1, backgroundColor: '#f0f4f8' }}>
            <CustomHeader
                title="Seleccionar Persona"
                onMenuPress={() => router.push('/panel')}
                showBackButton={true}
            />

            <View style={styles.headerSection}>
                <Text style={styles.headerTitle}>Gestionar Recordatorios</Text>
                <Text style={styles.headerSubtitle}>
                    Selecciona a la persona para ver o crear recordatorios
                </Text>
            </View>

            <ScrollView
                style={styles.container}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                {loading && !refreshing ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#7c3aed" />
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
                            Agrega personas para poder crear recordatorios
                        </Text>
                        <Pressable
                            style={styles.addButton}
                            onPress={() => router.push('/cuidador/agregar-persona')}
                        >
                            <Text style={styles.addButtonText}>Agregar Persona</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <Text style={styles.sectionTitle}>
                            {adultos.length} {adultos.length === 1 ? 'Persona' : 'Personas'}
                        </Text>
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
    },
    headerSection: {
        backgroundColor: '#7c3aed',
        padding: 20,
        paddingBottom: 25,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: 'white',
        marginBottom: 8,
    },
    headerSubtitle: {
        fontSize: 15,
        color: '#e9d5ff',
        lineHeight: 20,
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
        marginBottom: 20,
    },
    addButton: {
        backgroundColor: '#7c3aed',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    addButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 15,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 3,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#7c3aed',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    infoContainer: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 4,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    infoText: {
        fontSize: 13,
        color: '#6b7280',
    },
});
