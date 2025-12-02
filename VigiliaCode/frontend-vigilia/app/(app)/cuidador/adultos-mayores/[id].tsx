import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView,
    ActivityIndicator, RefreshControl, TextInput, Modal
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import CustomHeader from '../../../../components/CustomHeader';
import { User, Calendar, MapPin, FileText, Bell, AlertTriangle, Heart, Smartphone } from 'lucide-react-native';
import { useAuth } from '../../../../contexts/AuthContext';
import { useToast } from '../../../../contexts/ToastContext';

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
    adulto_mayor_id: number;
    dispositivo_id?: number | null;
    timestamp_alerta: string;
    url_video_almacenado?: string | null;
    confirmado_por_cuidador?: boolean | null;
    notas?: string | null;
    nombre_dispositivo?: string | null;
};

type DispositivoInfo = {
    id: number;
    identificador_hw: string;
    nombre_dispositivo: string;
    usuario_camara: string | null;
    fecha_configuracion: string | null;
};

export default function AdultoMayorDetalleScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const { showToast, showConfirm } = useToast();
    const [adulto, setAdulto] = useState<AdultoMayorDetalle | null>(null);
    const [caidas, setCaidas] = useState<EventoCaida[]>([]);
    const [dispositivo, setDispositivo] = useState<DispositivoInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Estados para configuración de dispositivo
    const [showDeviceConfig, setShowDeviceConfig] = useState(false);
    const [hardwareId, setHardwareId] = useState('');
    const [usuarioCamara, setUsuarioCamara] = useState('');
    const [contrasenaCamara, setContrasenaCamara] = useState('');
    const [configurandoDispositivo, setConfigurandoDispositivo] = useState(false);

    const fetchDatos = useCallback(async (isRefreshing = false) => {
        if (!user) return;
        if (!isRefreshing) setLoading(true);
        setError(null);

        try {
            const token = await user.getIdToken();

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

            // Obtener información del dispositivo asociado
            try {
                const dispositivoResponse = await axios.get(`${API_URL}/dispositivos/adulto-mayor/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setDispositivo(dispositivoResponse.data);
            } catch (dispositivoError) {
                console.log('No hay dispositivo configurado para este adulto mayor');
                setDispositivo(null);
            }

            // Obtener eventos de caída del adulto mayor
            try {
                const caidasResponse = await axios.get(`${API_URL}/eventos-caida`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                // Filtrar solo las caídas de este adulto mayor específico
                const caidasFiltradas = caidasResponse.data
                    .filter((caida: EventoCaida) => caida.adulto_mayor_id === parseInt(id))
                    .slice(0, 5); // Últimas 5 caídas de este adulto mayor
                setCaidas(caidasFiltradas);
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
    }, [user, id]);

    useEffect(() => {
        fetchDatos();
    }, [fetchDatos]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchDatos(true);
    };

    const handleConfigurarDispositivo = async () => {
        if (!hardwareId.trim()) {
            showToast('error', 'Error', 'Por favor ingresa el Hardware ID (MAC Address) del dispositivo');
            return;
        }
        if (!usuarioCamara.trim()) {
            showToast('error', 'Error', 'Por favor ingresa el usuario de la cámara');
            return;
        }
        if (!contrasenaCamara.trim()) {
            showToast('error', 'Error', 'Por favor ingresa la contraseña de la cámara');
            return;
        }

        setConfigurandoDispositivo(true);

        try {
            const token = await user!.getIdToken();
            await axios.post(
                `${API_URL}/dispositivos/configurar`,
                {
                    identificador_hw: hardwareId.trim(),
                    adulto_mayor_id: parseInt(id),
                    usuario_camara: usuarioCamara.trim(),
                    contrasena_camara: contrasenaCamara.trim()
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            // Cerrar modal y limpiar formulario
            setShowDeviceConfig(false);
            setHardwareId('');
            setUsuarioCamara('');
            setContrasenaCamara('');

            // Refrescar datos para mostrar el dispositivo configurado
            await fetchDatos();

            showToast(
                'success',
                'Éxito',
                `Dispositivo NanoPi configurado exitosamente para ${adulto?.nombre_completo}. Ahora los videos de este dispositivo se asociarán automáticamente.`
            );

        } catch (err) {
            console.error('Error al configurar dispositivo:', err);
            const mensaje = axios.isAxiosError(err)
                ? err.response?.data?.detail || 'Error al configurar el dispositivo'
                : 'Error inesperado al configurar el dispositivo';
            showToast('error', 'Error', mensaje);
        } finally {
            setConfigurandoDispositivo(false);
        }
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
                <Pressable style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/cuidador/adultos-mayores')}>
                    <Text style={styles.backButtonText}>Volver</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <CustomHeader
                title={adulto.nombre_completo}
                onMenuPress={() => router.push('/panel')}
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

                {/* Configuración de Dispositivo NanoPi */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Smartphone size={20} color="#10b981" />
                        <Text style={styles.sectionTitle}>
                            Dispositivo NanoPi
                            {dispositivo && <Text style={styles.dispositivoIdBadge}> • {dispositivo.identificador_hw}</Text>}
                        </Text>
                    </View>

                    {dispositivo ? (
                        <View>
                            <View style={styles.dispositivoInfo}>
                                <Text style={styles.dispositivoInfoLabel}>Hardware ID:</Text>
                                <Text style={styles.dispositivoInfoValue}>{dispositivo.identificador_hw}</Text>
                            </View>
                            <View style={styles.dispositivoInfo}>
                                <Text style={styles.dispositivoInfoLabel}>Nombre:</Text>
                                <Text style={styles.dispositivoInfoValue}>{dispositivo.nombre_dispositivo}</Text>
                            </View>
                            {dispositivo.usuario_camara && (
                                <View style={styles.dispositivoInfo}>
                                    <Text style={styles.dispositivoInfoLabel}>Usuario cámara:</Text>
                                    <Text style={styles.dispositivoInfoValue}>{dispositivo.usuario_camara}</Text>
                                </View>
                            )}
                            {dispositivo.fecha_configuracion && (
                                <View style={styles.dispositivoInfo}>
                                    <Text style={styles.dispositivoInfoLabel}>Configurado:</Text>
                                    <Text style={styles.dispositivoInfoValue}>
                                        {new Date(dispositivo.fecha_configuracion).toLocaleDateString()}
                                    </Text>
                                </View>
                            )}
                            <Pressable
                                style={[styles.configurarButton, styles.reconfigurarButton]}
                                onPress={() => setShowDeviceConfig(true)}
                            >
                                <Smartphone size={20} color="#10b981" style={{ marginRight: 8 }} />
                                <Text style={[styles.configurarButtonText, styles.reconfigurarButtonText]}>Reconfigurar</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <View>
                            <Text style={styles.descripcionDispositivo}>
                                Configura el dispositivo NanoPi para monitoreo de caídas y asociarlo con{' '}
                                {adulto.nombre_completo}.
                            </Text>

                            <Pressable
                                style={styles.configurarButton}
                                onPress={() => setShowDeviceConfig(true)}
                            >
                                <Smartphone size={20} color="white" style={{ marginRight: 8 }} />
                                <Text style={styles.configurarButtonText}>Configurar Dispositivo</Text>
                            </Pressable>
                        </View>
                    )}
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
                                    {formatFecha(caida.timestamp_alerta)}
                                </Text>
                                {caida.nombre_dispositivo && (
                                    <Text style={styles.caidaDispositivo}>
                                        Dispositivo: {caida.nombre_dispositivo}
                                    </Text>
                                )}
                                {caida.confirmado_por_cuidador !== null && (
                                    <View style={[
                                        styles.caidaEstado,
                                        { backgroundColor: caida.confirmado_por_cuidador ? '#dcfce7' : '#fef3c7' }
                                    ]}>
                                        <Text style={[
                                            styles.caidaEstadoTexto,
                                            { color: caida.confirmado_por_cuidador ? '#16a34a' : '#f59e0b' }
                                        ]}>
                                            {caida.confirmado_por_cuidador ? 'Confirmada' : 'Pendiente'}
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

            {/* Modal de Configuración de Dispositivo */}
            <Modal
                visible={showDeviceConfig}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowDeviceConfig(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Configurar Dispositivo NanoPi</Text>
                        <Text style={styles.modalSubtitle}>
                            Asociar dispositivo con {adulto?.nombre_completo}
                        </Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Hardware ID (MAC Address)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Ej: bec1a2c71301"
                                value={hardwareId}
                                onChangeText={setHardwareId}
                                autoCapitalize="none"
                                editable={!configurandoDispositivo}
                            />
                            <Text style={styles.inputHint}>
                                Identificador único del dispositivo NanoPi
                            </Text>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Usuario de Cámara</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Usuario de acceso a la cámara"
                                value={usuarioCamara}
                                onChangeText={setUsuarioCamara}
                                autoCapitalize="none"
                                editable={!configurandoDispositivo}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Contraseña de Cámara</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Contraseña de acceso a la cámara"
                                value={contrasenaCamara}
                                onChangeText={setContrasenaCamara}
                                secureTextEntry
                                editable={!configurandoDispositivo}
                            />
                        </View>

                        <View style={styles.modalButtons}>
                            <Pressable
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setShowDeviceConfig(false)}
                                disabled={configurandoDispositivo}
                            >
                                <Text style={styles.cancelButtonText}>Cancelar</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.modalButton, styles.saveButton, configurandoDispositivo && styles.disabledButton]}
                                onPress={handleConfigurarDispositivo}
                                disabled={configurandoDispositivo}
                            >
                                {configurandoDispositivo ? (
                                    <ActivityIndicator color="white" size="small" />
                                ) : (
                                    <Text style={styles.saveButtonText}>Guardar</Text>
                                )}
                            </Pressable>
                        </View>
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
    descripcionDispositivo: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 16,
        lineHeight: 20,
    },
    configurarButton: {
        backgroundColor: '#10b981',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
    },
    configurarButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    reconfigurarButton: {
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: '#10b981',
    },
    reconfigurarButtonText: {
        color: '#10b981',
    },
    dispositivoIdBadge: {
        fontSize: 14,
        fontWeight: '400',
        color: '#6b7280',
    },
    dispositivoInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    dispositivoInfoLabel: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    dispositivoInfoValue: {
        fontSize: 14,
        color: '#1f2937',
        fontWeight: '600',
    },
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
        padding: 24,
        width: '100%',
        maxWidth: 500,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
        elevation: 8,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 4,
        textAlign: 'center',
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 24,
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        backgroundColor: '#f9fafb',
    },
    inputHint: {
        fontSize: 12,
        color: '#9ca3af',
        marginTop: 4,
        fontStyle: 'italic',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#e5e7eb',
    },
    cancelButtonText: {
        color: '#374151',
        fontSize: 16,
        fontWeight: '600',
    },
    saveButton: {
        backgroundColor: '#10b981',
    },
    saveButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    disabledButton: {
        opacity: 0.6,
    },
});
