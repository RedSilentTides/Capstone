import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ActivityIndicator, Button,
    Pressable, ScrollView, Platform
} from 'react-native';
// Se elimina useFocusEffect porque no se usa
import { useRouter } from 'expo-router'; 
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './_layout';
import { Info, AlertTriangle, CheckCircle, Bell, UserPlus, Users } from 'lucide-react-native';
import SlidingPanel from '../components/Slidingpanel';
import CustomHeader from '../components/CustomHeader';

// URL del backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Tipos
type UserProfile = { 
  id: number;
  firebase_uid: string;
  email: string;
  nombre: string;
  rol: 'cuidador' | 'administrador' | 'adulto_mayor';
};
type AlertType = 'info' | 'warning' | 'error' | 'success';
interface AlertItem { 
  id: string; 
  type: AlertType;
  title: string; 
  message: string; 
  timestamp: Date; 
  read: boolean;
}
interface Recordatorio {
    id: number;
    adulto_mayor_id: number;
    titulo: string;
    descripcion?: string | null;
    fecha_hora_programada: string;
    frecuencia: 'una_vez' | 'diario' | 'semanal' | 'mensual';
    estado: string;
    tipo_recordatorio?: string;
    fecha_creacion: string;
}

const alertConfig: Record<AlertType, { color: string }> = { 
  info: { color: '#3b82f6' },
  warning: { color: '#f59e0b' },
  error: { color: '#ef4444' },
  success: { color: '#10b981' },
};

// --- Componente AlertPreviewCard ---
function AlertPreviewCard({ alert }: { alert: AlertItem }) {
  const config = alertConfig[alert.type];
  const renderIcon = () => {
    const iconSize = 20;
    const iconColor = config.color;
    const iconStyle = { marginRight: 12 };

    switch (alert.type) {
      case 'info':
        return <Info size={iconSize} color={iconColor} style={iconStyle} />;
      case 'warning':
        return <AlertTriangle size={iconSize} color={iconColor} style={iconStyle} />;
      case 'error':
        return <AlertTriangle size={iconSize} color={iconColor} style={iconStyle} />;
      case 'success':
        return <CheckCircle size={iconSize} color={iconColor} style={iconStyle} />;
      default:
        return <Info size={iconSize} color={iconColor} style={iconStyle} />;
    }
  };
  return (
    <View style={[styles.card, { borderColor: config.color, borderLeftWidth: 4, borderWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}>
       <View style={styles.row}>
         {renderIcon()}
         <View style={{ flex: 1 }}>
           <Text style={styles.cardTitle}>{alert.title}</Text>
           <Text style={styles.cardMessage} numberOfLines={1}>{alert.message}</Text>
         </View>
         <Text style={styles.cardTimestamp}>{alert.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
       </View>
     </View>
  );
}



// --- Pantalla Principal ---
export default function IndexScreen() {
  // --- INICIO DE ZONA DE HOOKS (TODOS JUNTOS) ---
  const { isAuthenticated, setAuthState, isLoading: isAuthLoading } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const router = useRouter();

  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);

  // Funciones para formatear fecha y hora
  const formatFecha = (fecha: string) => {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  };
  const formatHora = (fecha: string) => {
      const date = new Date(fecha);
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };
  
  // Función para obtener el token (reutilizable)
  const getToken = useCallback(async (): Promise<string | null> => {
    const tokenKey = 'userToken';
     if (Platform.OS === 'web') return await AsyncStorage.getItem(tokenKey);
     else return await SecureStore.getItemAsync(tokenKey);
  }, []);

  // Función para obtener solicitudes pendientes
  const fetchSolicitudesPendientes = useCallback(async (token?: string) => {
    try {
      const authToken = token || await getToken();
      if (!authToken) return;

      const response = await axios.get(`${API_URL}/solicitudes-cuidado/recibidas`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const pendientes = response.data.filter((s: any) => s.estado === 'pendiente').length;
      setSolicitudesPendientes(pendientes);
    } catch (error) {
      console.error('Error al obtener solicitudes pendientes:', error);
      // No mostramos error al usuario, solo no actualizamos el contador
    }
  }, [getToken]);

  // Efecto para buscar el perfil del usuario CUANDO esté autenticado
  useEffect(() => {
    const fetchProfile = async () => {
      // Solo procede si está autenticado y la carga inicial del auth terminó
      if (!isAuthenticated || isAuthLoading) {
        setProfileLoading(false); // Detiene la carga del perfil si no está auth
        return;
      }

      setProfileLoading(true);
      setProfileError(null);
      const token = await getToken();

      // Verificación extra de token (aunque isAuthenticated debería ser suficiente)
      if (!token) {
        console.error('IndexScreen: Auth=true pero no hay token? Forzando logout.');
        setAuthState(false); // Actualiza estado global
        setProfileLoading(false);
        // _layout se encargará de redirigir
        return;
      }

      // Llamar al backend para obtener el perfil
      try {
        console.log('IndexScreen: Token OK, obteniendo perfil...');
        const response = await axios.get(`${API_URL}/usuarios/yo`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUserProfile(response.data as UserProfile);
        console.log('IndexScreen: Perfil obtenido:', response.data.rol);

        // Obtener solicitudes pendientes para cualquier usuario
        fetchSolicitudesPendientes(token);
        // --- OBTENER RECORDATORIOS ---
        console.log('IndexScreen: Obteniendo recordatorios...');
        const recordatoriosResponse = await axios.get(`${API_URL}/recordatorios`, {
            headers: { Authorization: `Bearer ${token}` }
            // No pasamos params, para que traiga todo lo que el rol puede ver
        });

        // Ordenar por fecha, más próximos primero
        const sortedRecordatorios = (recordatoriosResponse.data as Recordatorio[]).sort(
            (a, b) => new Date(a.fecha_hora_programada).getTime() - new Date(b.fecha_hora_programada).getTime()
        );

        setRecordatorios(sortedRecordatorios);
        console.log(`IndexScreen: Recordatorios obtenidos: ${sortedRecordatorios.length}`);
        // --- FIN DE OBTENER RECORDATORIOS ---
      } catch (fetchError) {
        console.error('IndexScreen: Error al obtener perfil:', fetchError);
        if (axios.isAxiosError(fetchError) && (fetchError.response?.status === 401 || fetchError.response?.status === 403)) {
          setProfileError('Tu sesión ha expirado.');
          // Borrar token inválido y forzar logout/redirección
          try {
              const tokenKey = 'userToken';
              if (Platform.OS === 'web') await AsyncStorage.removeItem(tokenKey);
              else await SecureStore.deleteItemAsync(tokenKey);
              setAuthState(false); // Actualiza estado global -> _layout redirige
          } catch (removeError) { console.error("Error al borrar token inválido:", removeError); }
        } else {
          setProfileError('No se pudo cargar tu información.');
        }
        setUserProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };

    fetchProfile();
  // Se ejecuta cuando cambia el estado de autenticación o la carga inicial
  }, [isAuthenticated, isAuthLoading, getToken, setAuthState, fetchSolicitudesPendientes]); 

  // Efecto para auto-redirigir en caso de error
  // (Este es el hook que debía estar aquí arriba)
  useEffect(() => {
    if (profileError) {
      const timer = setTimeout(() => {
        console.log('Auto-redirigiendo al login después de error...');
        setAuthState(false);
        router.replace('/login');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [profileError, setAuthState, router]);
  // --- FIN DE ZONA DE HOOKS ---


  // --- Función de Cerrar Sesión ---
  const handleLogout = async () => {
      console.log("Cerrando sesión...");
       try {
           const tokenKey = 'userToken';
           if (Platform.OS === 'web') await AsyncStorage.removeItem(tokenKey);
           else await SecureStore.deleteItemAsync(tokenKey);
           console.log('Token local eliminado.');

           // Actualiza estado global y navega al login
           setAuthState(false);
           router.replace('/login');
           console.log('Navegando al login...');
       } catch (e) {
           console.error("Error al cerrar sesión:", e);
           // Aún así forzamos el estado a false y navegamos
           setAuthState(false);
           router.replace('/login');
       }
  };


  // --- Renderizado ---
  // (La lógica de retorno condicional viene DESPUÉS de todos los hooks)

  // Muestra carga global si el AuthProvider aún está verificando
  if (isAuthLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }
  
  // Muestra carga específica del perfil si Auth está listo pero el perfil no
  if (profileLoading) {
      return (
         <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#1e3a8a" />
            <Text>Cargando tu información...</Text>
         </View>
      )
  }

  // Muestra error si falló la carga del perfil
  // (Este es el bloque if que se queda. El duplicado fue eliminado)
  if (profileError) {
     return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{profileError}</Text>
        <Text style={styles.redirectText}>Redirigiendo al inicio de sesión...</Text>
        <Button title="Ir Ahora" onPress={() => {
          setAuthState(false);
          router.replace('/login');
        }} />
      </View>
    );
  }

  // --- SE ELIMINAN LOS BLOQUES DUPLICADOS DE useEffect Y if (profileError) DE AQUÍ ---

  // Si está autenticado y tenemos el perfil, mostramos el dashboard correcto
  if (userProfile) {
    return (
      <View style={{ flex: 1 }}>
        {/* Header con menú lateral */}
        <CustomHeader
          title="VigilIA"
          onMenuPress={() => setIsPanelOpen(true)}
          showBackButton={false}
        />

        <ScrollView style={styles.container}>
          <Text style={styles.welcome}>¡Bienvenido, {userProfile.nombre}!</Text>
        
        {/* --- Dashboard del Cuidador --- */}
        {userProfile.rol === 'cuidador' && (
          <>
            {/* Notificación de solicitudes pendientes */}
            {solicitudesPendientes > 0 && (
              <Pressable
                style={styles.notificationBanner}
                onPress={() => router.push('/solicitudes')}
              >
                <View style={styles.notificationContent}>
                  <UserPlus size={24} color="#2563eb" />
                  <View style={styles.notificationText}>
                    <Text style={styles.notificationTitle}>
                      {solicitudesPendientes} solicitud{solicitudesPendientes > 1 ? 'es' : ''} pendiente{solicitudesPendientes > 1 ? 's' : ''}
                    </Text>
                    <Text style={styles.notificationSubtitle}>
                      Toca para ver y responder
                    </Text>
                  </View>
                </View>
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{solicitudesPendientes}</Text>
                </View>
              </Pressable>
            )}

            <Text style={styles.sectionTitle}>Gestión de Personas</Text>
            <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/cuidador/adultos-mayores')}>
              <Users size={20} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>Ver Personas a Cuidar</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.greenButton]} onPress={() => router.push('/cuidador/agregar-persona')}>
              <UserPlus size={20} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>Agregar Persona</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
            <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/configuracion')}>
              <Text style={styles.buttonText}>Configurar Notificaciones</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.blueButton]} onPress={() => router.push('/cuidador/recordatorios')}>
              <Text style={styles.buttonText}>Gestionar Recordatorios</Text>
            </Pressable>


            <Text style={styles.sectionTitle}>Próximos Recordatorios (Todos)</Text>
            {recordatorios.length > 0 ? (
                <> 
                  {recordatorios.slice(0, 3).map((rec) => ( // Mostrar los 3 más próximos
                      <AlertPreviewCard 
                          key={`rec-${rec.id}`} 
                          alert={{
                              id: `rec-${rec.id}`,
                              type: 'info', // Todos los recordatorios son 'info'
                              title: `Recordatorio: ${rec.titulo}`,
                              message: rec.descripcion || 'Sin descripción',
                              timestamp: new Date(rec.fecha_hora_programada),
                              read: rec.estado !== 'pendiente'
                          }} 
                      />
                  ))}
                </>
            ) : (
                <Text style={styles.noAlerts}>No hay recordatorios próximos.</Text>
            )}
            <Pressable style={[styles.actionButton, styles.greyButton]} onPress={() => router.push('/cuidador/alertas')}>
               <Bell size={16} color="#374151" style={{ marginRight: 8 }} />
               <Text style={[styles.buttonText, {color: '#374151'}]}>Ver Historial Completo</Text>
            </Pressable>
          </>
        )}

        {/* --- Dashboard del Adulto Mayor --- */}
        {userProfile.rol === 'adulto_mayor' && (
           <>
            {/* Notificación de solicitudes pendientes */}
            {solicitudesPendientes > 0 && (
              <Pressable
                style={styles.notificationBanner}
                onPress={() => router.push('/solicitudes')}
              >
                <View style={styles.notificationContent}>
                  <UserPlus size={24} color="#2563eb" />
                  <View style={styles.notificationText}>
                    <Text style={styles.notificationTitle}>
                      {solicitudesPendientes} solicitud{solicitudesPendientes > 1 ? 'es' : ''} de cuidado
                    </Text>
                    <Text style={styles.notificationSubtitle}>
                      Toca para ver y responder
                    </Text>
                  </View>
                </View>
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{solicitudesPendientes}</Text>
                </View>
              </Pressable>
            )}

            <Text style={styles.sectionTitle}>Mis Próximos Recordatorios</Text>

            {recordatorios.length > 0 ? (
                recordatorios.slice(0, 5).map(rec => ( // Mostrar solo los 5 más próximos
                    <View key={rec.id} style={styles.simpleCard}>
                        <Text style={styles.simpleCardTitle}>{rec.titulo}</Text>
                        {rec.descripcion ? <Text style={styles.simpleCardText}>{rec.descripcion}</Text> : null}
                        <Text style={styles.simpleCardDate}>{formatFecha(rec.fecha_hora_programada)} - {formatHora(rec.fecha_hora_programada)}</Text>
                    </View>
                ))
            ) : (
                <Text style={styles.placeholderText}>No tienes recordatorios programados.</Text>
            )}

            <Pressable style={[styles.actionButton, styles.panicButton]} onPress={() => alert('¡Ayuda solicitada!')}>
              <Text style={styles.buttonText}>BOTÓN DE AYUDA</Text>
            </Pressable>
             <Pressable style={[styles.actionButton, styles.greyButton]} onPress={() => router.push('/cuidador/recordatorios')}>
               <Text style={[styles.buttonText, {color: '#374151'}]}>Ver todos mis recordatorios</Text>
            </Pressable>
          </>
        )}
        
         {/* --- Panel de Admin --- */}
         {userProfile.rol === 'administrador' && ( 
           <View>
             <Text style={styles.sectionTitle}>Panel de Administración</Text>
             <Text style={styles.placeholderText}>[Opciones de Administración]</Text>
           </View> 
          )}
          {/* --- FIN Panel de Admin --- */}

        {/* Botón de Cerrar Sesión */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
           <Text style={styles.buttonText}>Cerrar Sesión</Text>
        </Pressable>
        </ScrollView>

        {/* Panel lateral */}
        <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
      </View>
    );
  }

  // Fallback si algo salió muy mal (no debería llegar aquí)
  console.warn("IndexScreen: Estado renderizado inesperado.");
  return (
       <View style={styles.centerContainer}>
           <Text style={styles.errorText}>Ocurrió un error inesperado.</Text>
           <Button title="Ir a Inicio de Sesión" onPress={() => setAuthState(false)} />
       </View>
  );
}

// Estilos
const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f0f4f8' },
  container: { flex: 1, padding: 20, paddingTop: 10, backgroundColor: '#f0f4f8' },
  welcome: { fontSize: 24, fontWeight: 'bold', marginBottom: 5, marginTop: 10, textAlign: 'center', color: '#1e3a8a' },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginTop: 25, marginBottom: 15, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#d1d5db', paddingBottom: 5 },
  errorText: { color: 'red', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  redirectText: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  actionButton: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10, flexDirection: 'row', justifyContent: 'center' },
  blueButton: { backgroundColor: '#2563eb' },
  greenButton: { backgroundColor: '#10b981' },
  greyButton: { backgroundColor: '#e5e7eb' },
  panicButton: { backgroundColor: '#dc2626', paddingVertical: 20, marginTop: 20 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  logoutButton: { backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 40, marginBottom: 20 },
  placeholderText:{ textAlign: 'center', color: '#9ca3af', marginVertical: 20 },
  noAlerts: { textAlign: 'center', color: '#6b7280', fontSize: 14, marginTop: 10, marginBottom: 10 },
  // Estilos para notificación de solicitudes
  notificationBanner: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notificationText: {
    marginLeft: 12,
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e3a8a',
    marginBottom: 2,
  },
  notificationSubtitle: {
    fontSize: 13,
    color: '#3b82f6',
  },
  notificationBadge: {
    backgroundColor: '#2563eb',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Estilos AlertPreviewCard
   card: {
    backgroundColor: 'white', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 15, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 2,
    borderLeftWidth: 4, // Indicador de color a la izquierda
    borderWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, // Ajustes para borde izquierdo
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '600', fontSize: 15, marginBottom: 2, color: '#1f2937'},
  cardMessage: { fontSize: 13, color: '#4b5563' },
  cardTimestamp: { fontSize: 12, color: '#9ca3af', marginLeft: 10 },
  // --- AÑADIR ESTILOS FALTANTES AQUÍ ---
  simpleCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  simpleCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  simpleCardText: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
  },
  simpleCardDate: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7c3aed', // Morado para destacar la fecha
  },
});
