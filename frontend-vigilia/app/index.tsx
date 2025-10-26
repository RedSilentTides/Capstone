import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Button, Pressable, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router'; // Cambiado de 'expo-router' a useRouter
import * as SecureStore from 'expo-secure-store';
import axios from 'axios'; // Mantenemos AxiosError aquí por si acaso, aunque isAxiosError se importa directamente
import AsyncStorage from '@react-native-async-storage/async-storage';
// Importamos useAuth para obtener el estado de autenticación y perfil del contexto
import { useAuth } from './_layout'; // Ajusta la ruta si es necesario

// Importa los iconos que usarás en la vista previa de alertas
import { Info, AlertTriangle, CheckCircle, Bell } from 'lucide-react-native';

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Definimos un tipo para la información del usuario
type UserProfile = {
  id: number;
  firebase_uid: string;
  email: string;
  nombre: string;
  rol: 'cuidador' | 'administrador' | 'adulto_mayor';
};

// --- Componente de Vista Previa de Alerta (Similar al de alerts.tsx) ---
// (Podrías mover esto a un archivo de componente separado más adelante)
type AlertType = 'info' | 'warning' | 'error' | 'success';
interface AlertItem {
  id: string; // O number si viene de la BD
  type: AlertType;
  title: string; // Podríamos obtener esto de la BD o definirlo basado en el evento
  message: string; // Podríamos obtener esto de la BD (ej. detalles_adicionales)
  timestamp: Date; // O string si viene de la BD y necesita parseo
  read: boolean;
}

const alertConfig: Record<AlertType, { color: string }> = {
  info: { color: '#3b82f6' },
  warning: { color: '#f59e0b' },
  error: { color: '#ef4444' },
  success: { color: '#10b981' },
};

function AlertPreviewCard({ alert }: { alert: AlertItem }) {
  const config = alertConfig[alert.type];
  const renderIcon = () => {
    switch (alert.type) {
      case 'warning': case 'error': return <AlertTriangle color={config.color} size={20} style={{ marginRight: 8 }} />;
      case 'success': return <CheckCircle color={config.color} size={20} style={{ marginRight: 8 }} />;
      default: return <Info color={config.color} size={20} style={{ marginRight: 8 }} />;
    }
  };
  return (
    <View style={[styles.card, { borderColor: config.color, borderWidth: alert.read ? 0 : 1 }]}>
      <View style={styles.row}>
        {renderIcon()}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{alert.title}</Text>
          <Text style={styles.cardMessage} numberOfLines={1}>{alert.message}</Text> 
          {/* Mostramos solo 1 línea en preview */}
        </View>
        <Text style={styles.cardTimestamp}>{alert.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    </View>
  );
}
// --- Fin Componente Vista Previa ---


export default function IndexScreen() {
  // Ya no necesitamos manejar isLoading/error/profile aquí, el _layout lo hace.
  // Pero sí necesitamos obtener el perfil del contexto para saber qué mostrar.
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth(); // Usamos el hook del contexto
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true); // Carga específica del perfil
  const [profileError, setProfileError] = useState<string | null>(null);
  const router = useRouter(); // Hook para navegación

  // Estado para las alertas de vista previa (ejemplo)
  const [previewAlerts, setPreviewAlerts] = useState<AlertItem[]>([
      { id: '1', type: 'error', title: 'Caída Detectada', message: 'Posible caída en Salón Principal', timestamp: new Date(Date.now() - 3600000), read: false },
      { id: '2', type: 'info', title: 'Recordatorio', message: 'Tomar medicamento presión', timestamp: new Date(Date.now() - 7200000), read: true },
  ]); // Deberíamos buscar esto desde la API

  useEffect(() => {
    const fetchProfile = async () => {
      if (!isAuthenticated || isAuthLoading) {
        // Si no está autenticado o aún se está cargando el estado auth, no hacemos nada aquí
        // _layout se encargará de redirigir si no está autenticado
        setProfileLoading(false); 
        return;
      }

      setProfileLoading(true);
      setProfileError(null);
      let token: string | null = null;
      const tokenKey = 'userToken';

      try {
        // Re-leer el token (necesario para la llamada API)
        if (Platform.OS === 'web') {
          token = await AsyncStorage.getItem(tokenKey);
        } else {
          token = await SecureStore.getItemAsync(tokenKey);
        }

        if (!token) {
           // Esto no debería pasar si isAuthenticated es true, pero por seguridad...
          console.error('IndexScreen: Autenticado pero sin token? Redirigiendo a login.');
          router.replace('/login'); 
          return;
        }

        // Llamar al backend para obtener el perfil (ya sabemos que estamos autenticados)
        const response = await axios.get(`${API_URL}/usuarios/yo`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUserProfile(response.data as UserProfile);
        console.log('IndexScreen: Perfil obtenido:', response.data.rol);

        // Aquí podrías añadir una llamada para buscar las últimas alertas/eventos para la preview
        // fetchPreviewAlerts(token, response.data.id); 

      } catch (fetchError) {
        console.error('IndexScreen: Error al obtener perfil:', fetchError);
        // Manejar error (ej. token expiró entre la carga del layout y esta llamada)
        if (axios.isAxiosError(fetchError) && (fetchError.response?.status === 401 || fetchError.response?.status === 403)) {
          setProfileError('Tu sesión ha expirado.');
          // Borrar token inválido y redirigir (opcional, _layout podría manejarlo también)
          try {
              if (Platform.OS === 'web') await AsyncStorage.removeItem(tokenKey);
              else await SecureStore.deleteItemAsync(tokenKey);
          } catch (removeError) { console.error("Error al borrar token inválido:", removeError); }
          setTimeout(() => router.replace('/login'), 1500); 
        } else {
          setProfileError('No se pudo cargar tu información.');
        }
        setUserProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };

    fetchProfile();
    // Dependemos de isAuthenticated e isAuthLoading del contexto
  }, [isAuthenticated, isAuthLoading, router]); 

  // --- Renderizado ---

  // Muestra carga si el estado de auth o el perfil se están cargando
  if (isAuthLoading || profileLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text>Cargando...</Text>
      </View>
    );
  }

  // Muestra error si falló la carga del perfil
  if (profileError) {
     return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{profileError}</Text>
        <Button title="Ir a Inicio de Sesión" onPress={() => router.replace('/login')} />
      </View>
    );
  }

  // Si está autenticado y tenemos el perfil, mostramos el dashboard correcto
  if (isAuthenticated && userProfile) {
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.welcome}>¡Bienvenido, {userProfile.nombre}!</Text>
        {/* <Text>Tu rol es: {userProfile.rol}</Text> */}

        {/* --- Dashboard del Cuidador --- */}
        {userProfile.rol === 'cuidador' && (
          <>
            <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
            {/* Usamos Pressable para botones más estilizados */}
            <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/cuidador/configuracion')}>
              <Text style={styles.buttonText}>Configurar Notificaciones</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/cuidador/recordatorios')}>
              <Text style={styles.buttonText}>Gestionar Recordatorios</Text>
            </Pressable>
             <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/cuidador/personas')}>
              <Text style={styles.buttonText}>Gestionar Personas Cuidadas</Text>
            </Pressable>
             <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/cuidador/dispositivos')}>
              <Text style={styles.buttonText}>Gestionar Dispositivos</Text>
            </Pressable>


            <Text style={styles.sectionTitle}>Últimas Alertas</Text>
            {previewAlerts.length > 0 ? (
                previewAlerts.map((alert) => <AlertPreviewCard key={alert.id} alert={alert} />)
            ) : (
                <Text style={styles.noAlerts}>No hay alertas recientes.</Text>
            )}
            <Pressable style={[styles.actionButton, styles.greyButton]} onPress={() => router.push('/alerts')}>
               <Bell size={16} color="#374151" style={{ marginRight: 8 }} />
               <Text style={[styles.buttonText, {color: '#374151'}]}>Ver Historial Completo</Text>
            </Pressable>
          </>
        )}

        {/* --- Dashboard del Adulto Mayor --- */}
        {userProfile.rol === 'adulto_mayor' && (
          <>
            <Text style={styles.sectionTitle}>Mis Recordatorios de Hoy</Text>
            {/* Aquí iría la lista de recordatorios para hoy */}
            <Text style={styles.placeholderText}>[Lista de recordatorios del día]</Text>
            
            <Pressable style={[styles.actionButton, styles.panicButton]} onPress={() => alert('¡Ayuda solicitada!')}>
              <Text style={styles.buttonText}>BOTÓN DE AYUDA</Text>
            </Pressable>
             <Pressable style={[styles.actionButton, styles.greyButton]} onPress={() => router.push('/recordatorios')}> 
               {/* Asumiendo que /recordatorios muestra *sus* recordatorios */}
               <Text style={[styles.buttonText, {color: '#374151'}]}>Ver todos mis recordatorios</Text>
            </Pressable>
          </>
        )}
        
         {/* --- Panel de Admin --- */}
         {userProfile.rol === 'administrador' && (
          <View>
            <Text style={styles.sectionTitle}>Panel de Administración</Text>
            {/* Componentes de admin */}
            <Text style={styles.placeholderText}>[Opciones de Administración]</Text>
          </View>
        )}

        {/* Botón de Cerrar Sesión (Lo dejamos aquí, aunque también esté en el panel) */}
        <Pressable style={styles.logoutButton} onPress={async () => {
             try {
                 const tokenKey = 'userToken';
                 if (Platform.OS === 'web') await AsyncStorage.removeItem(tokenKey);
                 else await SecureStore.deleteItemAsync(tokenKey);
                 console.log('Token eliminado.');
                 // Importante: Actualizar el estado global de autenticación
                 // Esto debería hacerse a través del contexto si lo centralizamos
                 // authContext.setAuthState(false); // <--- Necesitaríamos pasar setAuthState al index o manejarlo en _layout
                 router.replace('/login'); 
             } catch (e) { console.error("Error al cerrar sesión:", e); }
        }}>
           <Text style={styles.buttonText}>Cerrar Sesión</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Si no está cargando, ni autenticado, ni hay error (estado inesperado)
  // _layout ya debería haber redirigido, pero por si acaso:
  if (!isAuthLoading && !isAuthenticated){
      console.log("IndexScreen: Fallback - No autenticado, redirigiendo a login.");
      router.replace('/login');
  }

  return null; // No renderiza nada si no está listo o redirige
}

// Estilos (Añadimos/ajustamos algunos)
const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f0f4f8',
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f0f4f8',
  },
  welcome: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
    color: '#1e3a8a',
  },
   sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 25,
    marginBottom: 15,
    color: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingBottom: 5,
  },
   errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
    flexDirection: 'row', // Para iconos
    justifyContent: 'center', // Para iconos
  },
  blueButton: {
    backgroundColor: '#2563eb', 
  },
   greyButton: {
    backgroundColor: '#e5e7eb', 
  },
  panicButton: {
     backgroundColor: '#dc2626', // Rojo
     paddingVertical: 20, // Más grande
     marginTop: 20,
  },
   buttonText: { 
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: '#ef4444', 
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 40, 
    marginBottom: 20,
  },
  placeholderText:{
      textAlign: 'center',
      color: '#9ca3af',
      marginVertical: 20,
  },
   noAlerts: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 14,
    marginTop: 10,
    marginBottom: 10,
  },
  // Estilos para AlertPreviewCard (puedes moverlos)
   card: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4, // Indicador de color a la izquierda
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between', // Para separar timestamp
  },
  cardTitle: { fontWeight: '600', fontSize: 15, marginBottom: 2, color: '#1f2937'},
  cardMessage: { fontSize: 13, color: '#4b5563' },
  cardTimestamp: { fontSize: 12, color: '#9ca3af', marginLeft: 10 },
});