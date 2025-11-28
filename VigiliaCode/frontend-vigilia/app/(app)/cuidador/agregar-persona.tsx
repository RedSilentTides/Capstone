import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable,
    ScrollView, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import CustomHeader from '../../../components/CustomHeader';
import { UserPlus, Clock, CheckCircle, XCircle, Mail } from 'lucide-react-native';
import { useAuth } from '../../../contexts/AuthContext';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Tipos
interface SolicitudEnviada {
    id: number;
    email_destinatario: string;
    usuario_destinatario_id: number | null;
    estado: 'pendiente' | 'aceptada' | 'rechazada';
    mensaje: string | null;
    fecha_solicitud: string;
    fecha_respuesta: string | null;
}

// Componente para mostrar cada solicitud
function SolicitudCard({ solicitud }: { solicitud: SolicitudEnviada }) {
    const getEstadoConfig = () => {
        switch (solicitud.estado) {
            case 'pendiente':
                return {
                    icon: <Clock size={20} color="#f59e0b" />,
                    text: 'Pendiente',
                    bgColor: '#fef3c7',
                    textColor: '#f59e0b',
                    borderColor: '#f59e0b',
                };
            case 'aceptada':
                return {
                    icon: <CheckCircle size={20} color="#10b981" />,
                    text: 'Aceptada',
                    bgColor: '#d1fae5',
                    textColor: '#10b981',
                    borderColor: '#10b981',
                };
            case 'rechazada':
                return {
                    icon: <XCircle size={20} color="#ef4444" />,
                    text: 'Rechazada',
                    bgColor: '#fee2e2',
                    textColor: '#ef4444',
                    borderColor: '#ef4444',
                };
        }
    };

    const config = getEstadoConfig();
    const fechaSolicitud = new Date(solicitud.fecha_solicitud).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });

    return (
        <View style={[styles.solicitudCard, { borderLeftColor: config.borderColor }]}>
            <View style={styles.solicitudHeader}>
                <Text style={styles.solicitudEmail}>{solicitud.email_destinatario}</Text>
                <View style={[styles.estadoBadge, { backgroundColor: config.bgColor }]}>
                    {config.icon}
                    <Text style={[styles.estadoText, { color: config.textColor }]}>
                        {config.text}
                    </Text>
                </View>
            </View>

            {solicitud.mensaje && (
                <Text style={styles.solicitudMensaje} numberOfLines={2}>
                    "{solicitud.mensaje}"
                </Text>
            )}

            <Text style={styles.solicitudFecha}>Enviada: {fechaSolicitud}</Text>

            {solicitud.fecha_respuesta && (
                <Text style={styles.solicitudFecha}>
                    Respondida: {new Date(solicitud.fecha_respuesta).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                    })}
                </Text>
            )}
        </View>
    );
}

export default function AgregarPersonaScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [email, setEmail] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [solicitudesEnviadas, setSolicitudesEnviadas] = useState<SolicitudEnviada[]>([]);
    const [loadingSolicitudes, setLoadingSolicitudes] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Función para cargar solicitudes enviadas
    const fetchSolicitudesEnviadas = useCallback(async (isRefreshing = false) => {
        if (!user) return;
        if (!isRefreshing) setLoadingSolicitudes(true);

        try {
            const token = await user.getIdToken();

            const response = await axios.get<SolicitudEnviada[]>(
                `${API_URL}/solicitudes-cuidado/enviadas`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            setSolicitudesEnviadas(response.data);
            console.log(`Solicitudes enviadas cargadas: ${response.data.length}`);
        } catch (err) {
            console.error('Error al cargar solicitudes enviadas:', err);
            // No mostramos error al usuario, solo no cargamos las solicitudes
        } finally {
            setLoadingSolicitudes(false);
            setRefreshing(false);
        }
    }, [user]);

    // Cargar solicitudes al montar el componente
    useEffect(() => {
        fetchSolicitudesEnviadas();
    }, [fetchSolicitudesEnviadas]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchSolicitudesEnviadas(true);
    };

    const handleEnviarSolicitud = async () => {
        setError(null);
        setSuccessMessage(null);

        // Validaciones
        if (!email.trim()) {
            setError('Por favor ingresa un correo electrónico.');
            return;
        }

        // Validación básica de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            setError('Por favor ingresa un correo electrónico válido.');
            return;
        }

        if (!user) {
            setError('No se encontró información de autenticación.');
            return;
        }

        setLoading(true);

        try {
            const token = await user.getIdToken();

            const emailEnviado = email.trim(); // Guardar antes de limpiar

            await axios.post(
                `${API_URL}/solicitudes-cuidado`,
                {
                    email_destinatario: emailEnviado,
                    mensaje: mensaje.trim() || null
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            // Limpiar formulario
            setEmail('');
            setMensaje('');

            // Mostrar mensaje de éxito
            setSuccessMessage(`Solicitud enviada exitosamente a ${emailEnviado}`);

            // Recargar lista de solicitudes
            fetchSolicitudesEnviadas();

            // Auto-ocultar mensaje después de 5 segundos
            setTimeout(() => {
                setSuccessMessage(null);
            }, 5000);
        } catch (err) {
            console.error('Error al enviar solicitud:', err);
            if (axios.isAxiosError(err)) {
                const message = err.response?.data?.detail || 'Error al enviar la solicitud.';

                // Mostrar mensaje más amigable para errores comunes
                if (err.response?.status === 400) {
                    if (message.includes('Ya existe una solicitud pendiente')) {
                        setError('Ya enviaste una solicitud a este usuario. Espera a que la acepte o rechace.');
                    } else if (message.includes('No puedes enviarte una solicitud')) {
                        setError('No puedes enviarte una solicitud a ti mismo.');
                    } else {
                        setError(message);
                    }
                } else if (err.response?.status === 403) {
                    setError('No tienes permiso para enviar solicitudes. Solo los cuidadores pueden hacerlo.');
                } else {
                    setError(message);
                }
            } else {
                setError('Error inesperado al enviar la solicitud.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={{ flex: 1 }}>
            <CustomHeader
                title="Agregar Persona a Cuidar"
                onMenuPress={() => router.push('/panel')}
                showBackButton={true}
            />

            <ScrollView
                style={styles.container}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                <View style={styles.iconContainer}>
                    <UserPlus size={64} color="#7c3aed" />
                </View>

                <Text style={styles.title}>Enviar Solicitud de Cuidado</Text>
                <Text style={styles.description}>
                    Ingresa el correo electrónico de la persona que deseas cuidar.
                    Recibirá una solicitud y podrá aceptarla o rechazarla.
                </Text>

                {successMessage && (
                    <View style={styles.successContainer}>
                        <CheckCircle size={20} color="#10b981" style={{ marginRight: 8 }} />
                        <Text style={styles.successText}>{successMessage}</Text>
                    </View>
                )}

                {error && (
                    <View style={styles.errorContainer}>
                        <XCircle size={20} color="#ef4444" style={{ marginRight: 8 }} />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Correo Electrónico *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="ejemplo@correo.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!loading}
                    />
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Mensaje (Opcional)</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Escribe un mensaje personalizado..."
                        value={mensaje}
                        onChangeText={setMensaje}
                        multiline
                        numberOfLines={4}
                        editable={!loading}
                    />
                </View>

                <Pressable
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleEnviarSolicitud}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.buttonText}>Enviar Solicitud</Text>
                    )}
                </Pressable>

                <Pressable
                    style={styles.cancelButton}
                    onPress={() => router.push('/')}
                    disabled={loading}
                >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                </Pressable>

                {/* Sección de Solicitudes Enviadas */}
                <View style={styles.separator} />

                <Text style={styles.sectionTitle}>Solicitudes Enviadas</Text>

                {loadingSolicitudes && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#7c3aed" />
                        <Text style={styles.loadingText}>Cargando solicitudes...</Text>
                    </View>
                ) : solicitudesEnviadas.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Mail size={48} color="#d1d5db" />
                        <Text style={styles.emptyText}>No has enviado solicitudes aún</Text>
                        <Text style={styles.emptySubtext}>
                            Las solicitudes que envíes aparecerán aquí
                        </Text>
                    </View>
                ) : (
                    <View style={styles.solicitudesList}>
                        {solicitudesEnviadas.map((solicitud) => (
                            <SolicitudCard key={solicitud.id} solicitud={solicitud} />
                        ))}
                    </View>
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
    iconContainer: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#7c3aed',
        textAlign: 'center',
        marginBottom: 10,
    },
    description: {
        fontSize: 14,
        color: '#6b7280',
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 20,
    },
    successContainer: {
        backgroundColor: '#d1fae5',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: '#10b981',
        flexDirection: 'row',
        alignItems: 'center',
    },
    successText: {
        color: '#065f46',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    errorContainer: {
        backgroundColor: '#fee2e2',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: '#ef4444',
        flexDirection: 'row',
        alignItems: 'center',
    },
    errorText: {
        color: '#dc2626',
        fontSize: 14,
        flex: 1,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 8,
    },
    input: {
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#111827',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    button: {
        backgroundColor: '#7c3aed',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonDisabled: {
        backgroundColor: '#c4b5fd',
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    cancelButton: {
        backgroundColor: '#e5e7eb',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 30,
    },
    cancelButtonText: {
        color: '#374151',
        fontSize: 16,
        fontWeight: '600',
    },
    separator: {
        height: 1,
        backgroundColor: '#d1d5db',
        marginVertical: 30,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 16,
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        marginLeft: 10,
        color: '#6b7280',
        fontSize: 14,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6b7280',
        marginTop: 16,
        marginBottom: 4,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#9ca3af',
        textAlign: 'center',
    },
    solicitudesList: {
        marginBottom: 20,
    },
    solicitudCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 2,
    },
    solicitudHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    solicitudEmail: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        flex: 1,
        marginRight: 8,
    },
    estadoBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    estadoText: {
        fontSize: 12,
        fontWeight: '600',
    },
    solicitudMensaje: {
        fontSize: 14,
        color: '#6b7280',
        fontStyle: 'italic',
        marginBottom: 8,
        lineHeight: 20,
    },
    solicitudFecha: {
        fontSize: 12,
        color: '#9ca3af',
        marginTop: 4,
    },
});
