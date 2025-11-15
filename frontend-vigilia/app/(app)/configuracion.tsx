import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, TextInput, Button, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext'; 

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';
// URL del webhook de WhatsApp (desplegado en GCP)
const WHATSAPP_WEBHOOK_URL = 'https://whatsapp-webhook-687053793381.southamerica-west1.run.app';
const WHATSAPP_API_KEY = 'bfc79d65d767'; // IMPORTANTE: Cambia esto por el API_KEY que configuraste en GCP Secret Manager

// Tipo para los datos de configuración que esperamos/enviamos
interface AlertConfig {
  id?: number; // El ID de la fila en la BD
  usuario_id?: number; // El ID del usuario
  notificar_app: boolean;
  token_fcm_app?: string | null; // Puede ser null si no está registrado
  notificar_whatsapp: boolean;
  numero_whatsapp?: string | null; // Puede ser null o string
  notificar_email: boolean;
  email_secundario?: string | null; // Puede ser null o string
  ultima_modificacion?: string; // Fecha como string desde la BD
}

export default function ConfiguracionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [config, setConfig] = useState<Partial<AlertConfig>>({}); // Usamos Partial para estado inicial
  const [originalConfig, setOriginalConfig] = useState<Partial<AlertConfig>>({}); // Para detectar cambios
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Función para cargar la configuración actual
  const fetchConfig = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('Obteniendo configuración...');
      const token = await user.getIdToken();
      const response = await axios.get<AlertConfig>(`${API_URL}/configuracion/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const loadedConfig = {
          ...response.data,
          // Aseguramos que los campos null sean strings vacíos para los TextInput
          numero_whatsapp: response.data.numero_whatsapp ?? '',
          email_secundario: response.data.email_secundario ?? '',
      };
      setConfig(loadedConfig);
      setOriginalConfig(loadedConfig); // Guardar estado original
      console.log('Configuración obtenida:', response.data);
    } catch (err) {
      console.error('Error al obtener configuración:', err);
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
         setError('Tu sesión ha expirado.');
      } else if (axios.isAxiosError(err) && err.response?.status === 404) {
          setError('No se encontró tu configuración. ¿Registro incompleto? Contacta soporte.');
      } else {
        setError('No se pudo cargar la configuración.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Cargar configuración al montar la pantalla
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]); // fetchConfig está envuelta en useCallback

  // Función para enviar mensaje de prueba de WhatsApp
  const handleSendTestWhatsApp = async () => {
    if (!config.numero_whatsapp) {
      showToast('error', 'Error', 'Por favor, ingresa un número de WhatsApp primero.');
      return;
    }

    setIsSendingTest(true);

    try {
      console.log('Enviando mensaje de prueba a WhatsApp...');
      const response = await axios.post(
        `${WHATSAPP_WEBHOOK_URL}/send-template`,
        {
          to: config.numero_whatsapp.replace(/\+/g, ''), // Remover el + si existe
          template_name: 'hello_world',
          language_code: 'en_US'
        },
        {
          headers: {
            'X-API-Key': WHATSAPP_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status === 'sent') {
        showToast(
          'success',
          'Mensaje Enviado',
          `Se envió un mensaje de prueba a ${config.numero_whatsapp}. Revisa tu WhatsApp!`
        );
      }
    } catch (err) {
      console.error('Error al enviar mensaje de WhatsApp:', err);
      let errorMessage = 'No se pudo enviar el mensaje de WhatsApp.';

      if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNREFUSED' || err.message.includes('Network Error')) {
          errorMessage = 'No se pudo conectar al servicio de WhatsApp. Verifica que esté desplegado.';
        } else if (err.response?.data?.detail) {
          errorMessage = err.response.data.detail;
        }
      }

      showToast('error', 'Error', errorMessage);
    } finally {
      setIsSendingTest(false);
    }
  };

  // Función para guardar los cambios
  const handleSaveChanges = async () => {
    if (!user) {
      showToast('error', 'Error', 'No se encontró tu sesión.');
      return;
    }

    setIsSaving(true);
    setError(null);

    // Prepara los datos a enviar (solo los campos modificables)
    // Usamos ?. para evitar errores si config aún no se ha cargado
    const dataToSend: Partial<AlertConfig> = {
        notificar_app: config.notificar_app ?? true, // Valor por defecto si no está definido
        notificar_whatsapp: config.notificar_whatsapp ?? false,
        numero_whatsapp: config.numero_whatsapp || null, // Envía null si está vacío
        notificar_email: config.notificar_email ?? true,
        email_secundario: config.email_secundario || null, // Envía null si está vacío
        // No enviamos token_fcm_app desde aquí, se manejaría por separado
    };


    try {
      console.log('Guardando configuración:', dataToSend);
      const token = await user.getIdToken();
      await axios.put(`${API_URL}/configuracion/`, dataToSend, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Solo enviar mensaje de bienvenida si WhatsApp se ACABA DE ACTIVAR
      const wasWhatsAppDisabled = !originalConfig.notificar_whatsapp;
      const isWhatsAppNowEnabled = config.notificar_whatsapp;
      const shouldSendWelcome = wasWhatsAppDisabled && isWhatsAppNowEnabled && config.numero_whatsapp;

      if (shouldSendWelcome) {
        try {
          console.log('Enviando mensaje de bienvenida por WhatsApp (primera activación)...');
          await axios.post(
            `${WHATSAPP_WEBHOOK_URL}/send-template`,
            {
              to: config.numero_whatsapp.replace(/\+/g, ''),
              template_name: 'hello_world',
              language_code: 'en_US'
            },
            {
              headers: {
                'X-API-Key': WHATSAPP_API_KEY,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('Mensaje de bienvenida enviado');
        } catch (whatsappErr) {
          console.error('Error al enviar mensaje de bienvenida:', whatsappErr);
          // No bloqueamos el guardado si falla el mensaje
        }
      }

      // Actualizar configuración original después de guardar
      setOriginalConfig({
        ...config,
        numero_whatsapp: config.numero_whatsapp || null,
        email_secundario: config.email_secundario || null,
      });

      showToast('success', 'Éxito', 'Configuración guardada correctamente.' +
        (shouldSendWelcome ? ' Se envió un mensaje de bienvenida a tu WhatsApp!' : ''));
      // Opcional: Volver a cargar la config para confirmar, o simplemente asumir éxito
      // fetchConfig();
    } catch (err) {
      console.error('Error al guardar configuración:', err);
       if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
         setError('Tu sesión ha expirado.');
      } else {
         setError('No se pudo guardar la configuración.');
         showToast('error', 'Error', 'No se pudo guardar la configuración. Intenta de nuevo.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Renderizado ---

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text>Cargando configuración...</Text>
      </View>
    );
  }

  if (error && !config.usuario_id) { // Muestra error solo si no se pudo cargar nada
     return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.button} onPress={fetchConfig}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
        <View style={{marginTop: 10}}/>
        <Pressable style={styles.button} onPress={() => router.replace('/')}>
          <Text style={styles.buttonText}>Volver al Inicio</Text>
        </Pressable>
      </View>
    );
  }

  // Formulario de configuración
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Preferencias de Notificación</Text>
      
      {error && <Text style={styles.errorText}>Hubo un error al guardar: {error}</Text>}

      {/* Notificaciones App Push */}
      <View style={styles.settingRow}>
        <Text style={styles.label}>Recibir notificaciones en la App</Text>
        <Switch
          value={config.notificar_app ?? true} // Valor por defecto true si no está cargado
          onValueChange={(value) => setConfig(prev => ({ ...prev, notificar_app: value }))}
          trackColor={{ false: "#d1d5db", true: "#81b0ff" }}
          thumbColor={config.notificar_app ? "#2563eb" : "#f4f3f4"}
        />
      </View>
       <Text style={styles.description}>Recibe alertas push directamente en esta aplicación.</Text>

      {/* Notificaciones WhatsApp */}
      <View style={styles.settingRow}>
        <Text style={styles.label}>Recibir alertas por WhatsApp</Text>
        <Switch
          value={config.notificar_whatsapp ?? false}
          onValueChange={(value) => setConfig(prev => ({ ...prev, notificar_whatsapp: value }))}
          trackColor={{ false: "#d1d5db", true: "#81b0ff" }}
          thumbColor={config.notificar_whatsapp ? "#2563eb" : "#f4f3f4"}
        />
      </View>
      {config.notificar_whatsapp && ( // Mostrar input solo si está activado
        <>
          <TextInput
            style={styles.input}
            placeholder="Número de WhatsApp (ej. 56957342441)"
            value={config.numero_whatsapp || ''}
            onChangeText={(text) => setConfig(prev => ({ ...prev, numero_whatsapp: text }))}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />
          <Pressable
            style={[styles.testButton, isSendingTest && styles.buttonDisabled]}
            onPress={handleSendTestWhatsApp}
            disabled={isSendingTest}
          >
            <Text style={styles.testButtonText}>
              {isSendingTest ? '📤 Enviando...' : '📱 Enviar Mensaje de Prueba'}
            </Text>
          </Pressable>
        </>
      )}
      <Text style={styles.description}>Recibe mensajes de alerta urgentes vía WhatsApp.</Text>


      {/* Notificaciones Email */}
      <View style={styles.settingRow}>
        <Text style={styles.label}>Recibir alertas por Email</Text>
        <Switch
          value={config.notificar_email ?? true}
          onValueChange={(value) => setConfig(prev => ({ ...prev, notificar_email: value }))}
          trackColor={{ false: "#d1d5db", true: "#81b0ff" }}
          thumbColor={config.notificar_email ? "#2563eb" : "#f4f3f4"}
        />
      </View>
       {config.notificar_email && ( // Mostrar input solo si está activado
        <TextInput
          style={styles.input}
          placeholder="Correo electrónico para alertas"
          value={config.email_secundario || ''}
          onChangeText={(text) => setConfig(prev => ({ ...prev, email_secundario: text }))}
          keyboardType="email-address"
          autoCapitalize='none'
        />
      )}
       <Text style={styles.description}>Recibe un correo electrónico por cada alerta generada.</Text>


      {/* Botón Guardar */}
      <Pressable 
        style={[styles.button, isSaving && styles.buttonDisabled]} 
        onPress={handleSaveChanges} 
        disabled={isSaving}
      >
        <Text style={styles.buttonText}>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</Text>
      </Pressable>

      </ScrollView>
    </View>
  );
}

// Estilos
const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f9fafb', // Fondo ligeramente gris
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 25,
    color: '#7c3aed',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8, // Menos espacio antes de la descripción
    marginTop: 15, // Espacio entre secciones
  },
  label: {
    fontSize: 16,
    color: '#111827', // Casi negro
    flexShrink: 1, // Permite que el texto se ajuste si es largo
    marginRight: 10,
  },
   input: {
    backgroundColor: 'white',
    height: 45,
    borderColor: '#d1d5db', 
    borderWidth: 1,
    borderRadius: 8, 
    // marginBottom: 5, // No necesita margen si la descripción está debajo
    paddingHorizontal: 15, 
    fontSize: 16,
    marginTop: 5, // Espacio después del Switch
  },
  description: {
      fontSize: 13,
      color: '#6b7280', // Gris medio
      marginBottom: 15, // Espacio después de la descripción
  },
  button: {
    backgroundColor: '#16a34a', // Verde para guardar
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30, // Más espacio antes de guardar
  },
   buttonDisabled: {
    backgroundColor: '#9ca3af', // Gris si está guardando
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  testButton: {
    backgroundColor: '#25D366', // Color verde de WhatsApp
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#128C7E',
  },
  testButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
   errorText: {
    color: 'red',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
});