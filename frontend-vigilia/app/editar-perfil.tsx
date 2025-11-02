import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { User, Calendar, MapPin, FileText } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './_layout';
import CustomHeader from '../components/CustomHeader';
import SlidingPanel from '../components/Slidingpanel';
import DateTimePicker from '@react-native-community/datetimepicker';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Tipo para el perfil de usuario completo
type UserProfileData = {
    // Datos de usuarios
    id: number;
    nombre: string;
    email: string;
    rol: 'cuidador' | 'adulto_mayor' | 'administrador';

    // Datos de adultos_mayores (solo si rol = adulto_mayor)
    adulto_mayor_id?: number;
    nombre_completo?: string;
    fecha_nacimiento?: string;
    direccion?: string;
    notas_relevantes?: string;
};

export default function EditarPerfilScreen() {
  const router = useRouter();
  const { setAuthState } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Estados del formulario
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [direccion, setDireccion] = useState('');
  const [notasRelevantes, setNotasRelevantes] = useState('');

  const getToken = useCallback(async (): Promise<string | null> => {
    const tokenKey = 'userToken';
    if (Platform.OS === 'web') return await AsyncStorage.getItem(tokenKey);
    else return await SecureStore.getItemAsync(tokenKey);
  }, []);

  // Función para cargar el perfil del usuario
  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { router.replace('/login'); return; }

    try {
      console.log('Obteniendo perfil completo...');

      // Primero obtenemos datos básicos del usuario
      const userResponse = await axios.get(`${API_URL}/usuarios/yo`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userData = userResponse.data;
      let profileData: UserProfileData = {
        id: userData.id,
        nombre: userData.nombre,
        email: userData.email,
        rol: userData.rol,
      };

      // Si es adulto mayor, obtenemos datos adicionales
      if (userData.rol === 'adulto_mayor') {
        try {
          // Obtener el perfil propio del adulto mayor
          const amResponse = await axios.get(`${API_URL}/adultos-mayores/mi-perfil`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          // El endpoint devuelve directamente el perfil del adulto mayor
          const miPerfil = amResponse.data;

          if (miPerfil) {
            profileData.adulto_mayor_id = miPerfil.id;
            profileData.nombre_completo = miPerfil.nombre_completo || '';
            profileData.fecha_nacimiento = miPerfil.fecha_nacimiento || null;
            profileData.direccion = miPerfil.direccion || '';
            profileData.notas_relevantes = miPerfil.notas_relevantes || '';

            // Inicializar estados del formulario
            setNombreCompleto(miPerfil.nombre_completo || userData.nombre);
            if (miPerfil.fecha_nacimiento) {
              setFechaNacimiento(new Date(miPerfil.fecha_nacimiento));
            }
            setDireccion(miPerfil.direccion || '');
            setNotasRelevantes(miPerfil.notas_relevantes || '');
          } else {
            // No existe perfil de adulto mayor aún, usar valores por defecto
            setNombreCompleto(userData.nombre);
          }
        } catch (amError) {
          console.error('Error al obtener datos de adulto mayor:', amError);
          setNombreCompleto(userData.nombre);
        }
      } else {
        // Para cuidadores, solo usamos el nombre de usuarios
        setNombreCompleto(userData.nombre);
      }

      setUserProfile(profileData);
      console.log('Perfil cargado:', profileData);
    } catch (err) {
      console.error('Error al obtener perfil:', err);
      setError('No se pudo cargar tu perfil.');
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
          setTimeout(() => router.replace('/login'), 1500);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getToken, router]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    const token = await getToken();
    if (!token) {
      Alert.alert('Error', 'No se encontró tu sesión.');
      router.replace('/login');
      return;
    }

    try {
      if (userProfile?.rol === 'adulto_mayor' && userProfile.adulto_mayor_id) {
        // Actualizar perfil de adulto mayor
        const updateData = {
          nombre_completo: nombreCompleto.trim(),
          fecha_nacimiento: fechaNacimiento ? fechaNacimiento.toISOString() : null,
          direccion: direccion.trim() || null,
          notas_relevantes: notasRelevantes.trim() || null,
        };

        console.log('Actualizando perfil de adulto mayor:', updateData);
        await axios.put(
          `${API_URL}/adultos-mayores/${userProfile.adulto_mayor_id}`,
          updateData,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (Platform.OS === 'web') {
          window.alert('Perfil actualizado exitosamente');
        } else {
          Alert.alert('Éxito', 'Perfil actualizado exitosamente');
        }
        router.back();
      } else {
        // Para cuidadores y administradores, actualizar nombre de usuario
        const updateData = {
          nombre: nombreCompleto.trim(),
        };

        console.log('Actualizando nombre de usuario:', updateData);
        await axios.put(
          `${API_URL}/usuarios/yo`,
          updateData,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (Platform.OS === 'web') {
          window.alert('Perfil actualizado exitosamente');
        } else {
          Alert.alert('Éxito', 'Perfil actualizado exitosamente');
        }
        router.back();
      }
    } catch (err) {
      console.error('Error al guardar perfil:', err);
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.detail || 'Error al guardar el perfil'
        : 'Error inesperado al guardar';

      setError(errorMessage);
      if (Platform.OS === 'web') {
        window.alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFechaNacimiento(selectedDate);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>Cargando perfil...</Text>
      </View>
    );
  }

  if (error && !userProfile) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.button} onPress={fetchProfile}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CustomHeader
        title="Editar Perfil"
        onMenuPress={() => setIsPanelOpen(true)}
        showBackButton={true}
      />

      <ScrollView style={styles.container}>
        {/* Información de solo lectura */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Información de Cuenta</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.readOnlyValue}>{userProfile?.email}</Text>
          </View>
          <View style={styles.readOnlyField}>
            <Text style={styles.label}>Rol:</Text>
            <Text style={styles.readOnlyValue}>
              {userProfile?.rol === 'cuidador' ? 'Cuidador' :
               userProfile?.rol === 'adulto_mayor' ? 'Adulto Mayor' : 'Administrador'}
            </Text>
          </View>
        </View>

        {/* Campos editables */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Información Personal</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>
              <User size={16} color="#7c3aed" /> Nombre Completo *
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu nombre completo"
              value={nombreCompleto}
              onChangeText={setNombreCompleto}
              editable={!isSaving}
            />
          </View>

          {userProfile?.rol === 'adulto_mayor' && (
            <>
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  <Calendar size={16} color="#7c3aed" /> Fecha de Nacimiento
                </Text>
                <Pressable
                  style={styles.input}
                  onPress={() => setShowDatePicker(true)}
                  disabled={isSaving}
                >
                  <Text style={fechaNacimiento ? styles.dateText : styles.placeholderText}>
                    {fechaNacimiento
                      ? fechaNacimiento.toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })
                      : 'Selecciona tu fecha de nacimiento'}
                  </Text>
                </Pressable>

                {showDatePicker && (
                  <DateTimePicker
                    value={fechaNacimiento || new Date()}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                    maximumDate={new Date()}
                  />
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  <MapPin size={16} color="#7c3aed" /> Dirección
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ingresa tu dirección"
                  value={direccion}
                  onChangeText={setDireccion}
                  editable={!isSaving}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  <FileText size={16} color="#7c3aed" /> Notas Relevantes
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Información médica, alergias, contactos de emergencia, etc."
                  value={notasRelevantes}
                  onChangeText={setNotasRelevantes}
                  editable={!isSaving}
                  multiline
                  numberOfLines={4}
                />
                <Text style={styles.helperText}>
                  Esta información ayudará a tus cuidadores en caso de emergencia
                </Text>
              </View>
            </>
          )}

          {userProfile?.rol === 'cuidador' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Como cuidador, puedes actualizar tu nombre aquí. Para cambiar tu contraseña,
                ve a la vista de perfil desde el menú lateral.
              </Text>
            </View>
          )}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, isSaving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Guardar Cambios</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={isSaving}
        >
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </Pressable>
      </ScrollView>

      <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
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
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  infoSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  formSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  readOnlyField: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  readOnlyValue: {
    fontSize: 16,
    color: '#111827',
    paddingVertical: 8,
  },
  formGroup: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    minHeight: 48,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateText: {
    fontSize: 16,
    color: '#111827',
  },
  placeholderText: {
    fontSize: 16,
    color: '#9ca3af',
  },
  helperText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    fontStyle: 'italic',
  },
  infoBox: {
    backgroundColor: '#ede9fe',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#7c3aed',
  },
  infoText: {
    fontSize: 14,
    color: '#5b21b6',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#7c3aed',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24,
  },
  cancelButton: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 32,
  },
  buttonDisabled: {
    backgroundColor: '#c4b5fd',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
});
