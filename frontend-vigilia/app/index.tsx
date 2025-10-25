import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Definimos un tipo para la información del usuario que esperamos del backend
type UserProfile = {
  id: number;
  firebase_uid: string;
  email: string;
  nombre: string;
  rol: 'cuidador' | 'administrador' | 'adulto_mayor'; // Usamos los roles definidos
};

export default function IndexScreen() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Empezamos cargando
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthAndFetchProfile = async () => {
      let token: string | null = null;
      setError(null); // Resetea error en cada carga

      try {
        // 1. Intentar obtener el token guardado
        const tokenKey = 'userToken'; // Define la llave una vez
        if (Platform.OS === 'web') {
          token = await AsyncStorage.getItem(tokenKey);
        } else {
          token = await SecureStore.getItemAsync(tokenKey);
        }

        // 2. Si no hay token, redirigir a login
        if (!token) {
          console.log('No hay token, redirigiendo a login...');
          router.replace('/login');
          return; // Detiene la ejecución aquí
        }

        // 3. Si hay token, llamar al backend para obtener el perfil
        console.log('Token encontrado, obteniendo perfil...');
        try {
          const response = await axios.get(`${API_URL}/usuarios/yo`, {
            headers: {
              Authorization: `Bearer ${token}`, // Enviamos el token en la cabecera
            },
          });
          setUserProfile(response.data as UserProfile);
          console.log('Perfil obtenido:', response.data.rol);
        } catch (fetchError) {
           console.error('Error al obtener perfil:', fetchError);
           // Si el token es inválido/expirado (error 401/403) o hay otro error
           if (axios.isAxiosError(fetchError) && (fetchError.response?.status === 401 || fetchError.response?.status === 403)) {
               setError('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
               // Opcional: Borrar token inválido
               try {
                   if (Platform.OS === 'web') await AsyncStorage.removeItem(tokenKey);
                   else await SecureStore.deleteItemAsync(tokenKey);
               } catch (removeError) { console.error("Error al borrar token inválido:", removeError); }
               // Esperar un poco y redirigir
               setTimeout(() => router.replace('/login'), 2000);
           } else {
               setError('No se pudo cargar tu información. Intenta de nuevo más tarde.');
           }
           setUserProfile(null); // Asegura que no se muestre contenido viejo
        }

      } catch (storageError) {
        console.error('Error al leer el token:', storageError);
        setError('Error al verificar tu sesión.');
        // Considerar redirigir a login aquí también si falla la lectura del token
        setTimeout(() => router.replace('/login'), 2000);
      } finally {
        setIsLoading(false); // Termina la carga (haya éxito o error)
      }
    };

    checkAuthAndFetchProfile();
  }, []); // El array vacío asegura que esto se ejecute solo una vez al montar

  // --- Renderizado Condicional ---

  // Estado de Carga
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text>Verificando sesión...</Text>
      </View>
    );
  }

  // Estado de Error
  if (error) {
     return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        {/* Podríamos mostrar un botón para reintentar o ir a login */}
        <Button title="Ir a Inicio de Sesión" onPress={() => router.replace('/login')} />
      </View>
    );
  }

  // Si hay perfil de usuario, mostramos contenido según el rol
  if (userProfile) {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>¡Bienvenido, {userProfile.nombre}!</Text>
        <Text>Tu rol es: {userProfile.rol}</Text>

        {/* Aquí renderizamos componentes diferentes según el rol */}
        {userProfile.rol === 'cuidador' && (
          <View>
            <Text style={styles.sectionTitle}>Dashboard del Cuidador</Text>
            {/* Aquí irían los componentes del dashboard del cuidador */}
            <Button title="Configurar Alertas" onPress={() => router.push('/alerts')} />
            <Button title="Ver Historial" onPress={() => router.push('/cuidador/alertas')} />
            {/* ...otros botones/componentes... */}
          </View>
        )}

        {userProfile.rol === 'adulto_mayor' && (
          <View>
            <Text style={styles.sectionTitle}>Dashboard Simplificado</Text>
            {/* Aquí irían los componentes del dashboard del adulto mayor */}
            <Text>Próximo recordatorio: [Mostrar aquí]</Text>
            <Button title="Botón de Ayuda Rápida" onPress={() => alert('¡Ayuda solicitada!')} />
            {/* ...otros botones/componentes... */}
          </View>
        )}
        
         {userProfile.rol === 'administrador' && (
          <View>
            <Text style={styles.sectionTitle}>Panel de Administración</Text>
            {/* Componentes de admin */}
          </View>
        )}

        {/* Botón de Cerrar Sesión */}
        <Pressable style={styles.logoutButton} onPress={async () => {
             try {
                 const tokenKey = 'userToken';
                 if (Platform.OS === 'web') await AsyncStorage.removeItem(tokenKey);
                 else await SecureStore.deleteItemAsync(tokenKey);
                 console.log('Token eliminado.');
                 // Forzar recarga completa o redirigir a login
                 router.replace('/login'); 
             } catch (e) { console.error("Error al cerrar sesión:", e); }
        }}>
           <Text style={styles.buttonText}>Cerrar Sesión</Text>
        </Pressable>
      </View>
    );
  }

  // Fallback final: Si no está cargando, no hay error y no hay perfil (esto no debería pasar)
  // Redirigir a login como medida de seguridad.
  if (!isLoading && !error && !userProfile) {
      console.log("Estado inesperado: redirigiendo a login como fallback.");
      router.replace('/login');
      return null; // No renderiza nada mientras redirige
  }

  return null; // Default return
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
    marginTop: 40, // Espacio superior
  },
  welcome: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingBottom: 5,
  },
   errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  logoutButton: {
    backgroundColor: '#ef4444', // Rojo para logout
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30, 
  },
   buttonText: { // Reutilizamos estilo de botones anteriores
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});