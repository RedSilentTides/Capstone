import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable,
    ScrollView, Platform, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import CustomHeader from '../../components/CustomHeader';
import SlidingPanel from '../../components/Slidingpanel';
import { UserPlus } from 'lucide-react-native';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

export default function AgregarPersonaScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const getToken = useCallback(async (): Promise<string | null> => {
        const tokenKey = 'userToken';
        if (Platform.OS === 'web') return await AsyncStorage.getItem(tokenKey);
        else return await SecureStore.getItemAsync(tokenKey);
    }, []);

    const handleEnviarSolicitud = async () => {
        setError(null);

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

        setLoading(true);

        try {
            const token = await getToken();
            if (!token) {
                setError('No se encontró el token de autenticación.');
                return;
            }

            await axios.post(
                `${API_URL}/solicitudes-cuidado`,
                {
                    email_destinatario: email.trim(),
                    mensaje: mensaje.trim() || null
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            // Limpiar formulario
            setEmail('');
            setMensaje('');

            Alert.alert(
                'Solicitud Enviada',
                `Se ha enviado una solicitud de cuidado a ${email}. Recibirás una notificación cuando la persona acepte o rechace la solicitud.`,
                [
                    {
                        text: 'OK',
                        onPress: () => router.push('/')
                    }
                ]
            );
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
                onMenuPress={() => setIsPanelOpen(true)}
                showBackButton={true}
            />

            <ScrollView style={styles.container}>
                <View style={styles.iconContainer}>
                    <UserPlus size={64} color="#7c3aed" />
                </View>

                <Text style={styles.title}>Enviar Solicitud de Cuidado</Text>
                <Text style={styles.description}>
                    Ingresa el correo electrónico de la persona que deseas cuidar.
                    Recibirá una solicitud y podrá aceptarla o rechazarla.
                </Text>

                {error && (
                    <View style={styles.errorContainer}>
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
    errorContainer: {
        backgroundColor: '#fee2e2',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: '#ef4444',
    },
    errorText: {
        color: '#dc2626',
        fontSize: 14,
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
});
