import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { User, Calendar, MapPin, FileText } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import CustomHeader from '../../components/CustomHeader';
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
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados del formulario
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [direccion, setDireccion] = useState('');
  const [notasRelevantes, setNotasRelevantes] = useState('');

  // Función para cargar el perfil del usuario
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);

    try {
        const token = await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };

        const userResponse = await axios.get(`${API_URL}/usuarios/yo`, config);
        const userData = userResponse.data;
        let profileData: UserProfileData = { ...userData };

        if (userData.rol === 'adulto_mayor') {
            try {
                const amResponse = await axios.get(`${API_URL}/adultos-mayores/mi-perfil`, config);
                const miPerfil = amResponse.data;
                if (miPerfil) {
                    profileData = { ...profileData, ...miPerfil };
                    setNombreCompleto(miPerfil.nombre_completo || userData.nombre);
                    if (miPerfil.fecha_nacimiento) {
                        setFechaNacimiento(new Date(miPerfil.fecha_nacimiento));
                    }
                    setDireccion(miPerfil.direccion || '');
                    setNotasRelevantes(miPerfil.notas_relevantes || '');
                } else {
                    setNombreCompleto(userData.nombre);
                }
            } catch (amError) {
                console.error('Error al obtener datos de adulto mayor:', amError);
                setNombreCompleto(userData.nombre);
            }
        } else {
            setNombreCompleto(userData.nombre);
        }
        setUserProfile(profileData);
    } catch (err) {
        console.error('Error al obtener perfil:', err);
        setError('No se pudo cargar tu perfil.');
    } finally {
        setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async () => {
    if (!user) {
        Alert.alert('Error', 'No se encontró tu sesión.');
        return;
    }
    setIsSaving(true);
    setError(null);

    try {
        const token = await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };

        if (userProfile?.rol === 'adulto_mayor' && userProfile.adulto_mayor_id) {
            const updateData = {
                nombre_completo: nombreCompleto.trim(),
                fecha_nacimiento: fechaNacimiento ? fechaNacimiento.toISOString() : null,
                direccion: direccion.trim() || null,
                notas_relevantes: notasRelevantes.trim() || null,
            };
            await axios.put(`${API_URL}/adultos-mayores/${userProfile.adulto_mayor_id}`, updateData, config);
        } else {
            const updateData = { nombre: nombreCompleto.trim() };
            await axios.put(`${API_URL}/usuarios/yo`, updateData, config);
        }

        Alert.alert('Éxito', 'Perfil actualizado exitosamente');
        router.replace('/');

    } catch (err) {
        console.error('Error al guardar perfil:', err);
        const errorMessage = axios.isAxiosError(err)
            ? err.response?.data?.detail || 'Error al guardar el perfil'
            : 'Error inesperado al guardar';
        setError(errorMessage);
        Alert.alert('Error', errorMessage);
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
        onMenuPress={() => router.push('/panel')}
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
          onPress={() => router.replace('/')}
          disabled={isSaving}
        >
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </Pressable>
      </ScrollView>
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
