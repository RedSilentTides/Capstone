import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable, Platform, Image, Button} from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react-native'; // Mantienes tus iconos

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Tipos (ajustados para coincidir con el backend y datos opcionales)
type AlertType = 'info' | 'error' | 'success'; // Podríamos basar esto en 'detalles_adicionales' o 'confirmado_por_usuario'

interface EventoCaida {
  id: number;
  dispositivo_id: number;
  timestamp_caida: string; // Vendrá como string ISO del backend
  url_video_almacenado?: string | null;
  confirmado_por_usuario?: boolean | null;
  detalles_adicionales?: any | null; // JSON
  nombre_dispositivo?: string | null;
  nombre_adulto_mayor?: string | null;
  // Añadimos campos locales para la UI si es necesario
  type?: AlertType; // Derivaremos el tipo
  title?: string; // Derivaremos el título
  read?: boolean; // Podríamos manejar esto localmente o añadirlo a la BD
}

// Configuración visual (igual que antes)
const alertConfig: Record<AlertType, { color: string }> = {
  info: { color: '#3b82f6' },
  error: { color: '#ef4444' },
  success: { color: '#10b981' },
};

// --- Componente AlertCard (Ajustado) ---
// Recibe EventoCaida, maneja datos opcionales y parsea fecha
function AlertCard({ event, onDismiss }: { event: EventoCaida; onDismiss: (id: number) => void }) {
  // Determina el tipo y título basado en los datos (ejemplo simple)
  const alertType = event.confirmado_por_usuario === false ? 'success' // Falsa alarma marcada
                   : event.confirmado_por_usuario === true ? 'info'     // Caída confirmada
                   : 'error'; // Por defecto, si es null o no existe, asumimos error/pendiente
  const config = alertConfig[alertType];
  const title = event.title || (alertType === 'error' ? '¡Alerta de Caída!' : alertType === 'success' ? 'Falsa Alarma Confirmada' : 'Evento Registrado');
  const message = `Detectado por ${event.nombre_dispositivo || 'dispositivo desconocido'} en ${event.nombre_adulto_mayor || 'ubicación desconocida'}`;
  const isRead = event.read ?? false; // Asumimos no leída si no se especifica

  const renderIcon = () => {
    switch (alertType) {
      case 'error': return <AlertTriangle color={config.color} size={24} style={styles.icon} />;
      case 'success': return <CheckCircle color={config.color} size={24} style={styles.icon} />;
      default: return <Info color={config.color} size={24} style={styles.icon} />;
    }
  };

  // Formatear la fecha/hora
  const eventDate = new Date(event.timestamp_caida);
  const formattedTime = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = eventDate.toLocaleDateString();


  return (
    <View style={[styles.card, { borderColor: !isRead ? config.color : '#e5e7eb' }]}>
      <View style={styles.row}>
        {renderIcon()}
        <View style={styles.cardContent}>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={() => onDismiss(event.id)}>
              <X color="#6b7280" size={18} />
            </Pressable>
          </View>
          <Text style={styles.message}>{message}</Text>
          {/* Podríamos añadir más detalles de event.detalles_adicionales si existen */}
          <View style={styles.rowBetween}>
             <Text style={styles.timestamp}>{formattedDate} {formattedTime}</Text>
             {/* Aquí podríamos añadir botones para Confirmar / Marcar Falsa Alarma */}
             {/* <Pressable style={styles.markRead}><Text style={styles.markReadText}>Ver Detalles</Text></Pressable> */}
          </View>
        </View>
      </View>
    </View>
  );
}

// --- Pantalla Principal ---
export default function AlertasScreen() {
  const router = useRouter();
  const [eventos, setEventos] = useState<EventoCaida[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Función reutilizable para obtener el token
  const getToken = useCallback(async (): Promise<string | null> => {
    const tokenKey = 'userToken';
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(tokenKey);
    } else {
      return await SecureStore.getItemAsync(tokenKey);
    }
  }, []);

  // Función para cargar los eventos
  const fetchEventos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const token = await getToken();

    if (!token) {
      Alert.alert('Error', 'Sesión no válida.');
      router.replace('/login');
      return;
    }

    try {
      console.log('Obteniendo historial de eventos...');
      // Añadimos parámetros de paginación si quisiéramos (ej. ?limit=20&skip=0)
      const response = await axios.get<EventoCaida[]>(`${API_URL}/eventos-caida`, { 
        headers: { Authorization: `Bearer ${token}` },
      });
      // Procesamos los datos recibidos (ej. parsear fechas, derivar tipo/título si es necesario)
      const processedEventos = response.data.map(e => ({
          ...e,
          timestamp: new Date(e.timestamp_caida), // Convertir string a Date
          // Podríamos añadir más lógica aquí para determinar 'type', 'title', 'read'
      }));
      setEventos(processedEventos);
      console.log(`Eventos obtenidos: ${response.data.length}`);
    } catch (err) {
      console.error('Error al obtener eventos:', err);
       if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
         setError('Tu sesión ha expirado.');
         setTimeout(() => router.replace('/login'), 2000);
      } else {
        setError('No se pudo cargar el historial de alertas.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [getToken, router]);

  // Cargar eventos al montar
  useEffect(() => {
    fetchEventos();
  }, [fetchEventos]);

   // Función para descartar una alerta (solo visualmente por ahora)
   const handleDismiss = (id: number) => {
     setEventos((prev) => prev.filter((e) => e.id !== id));
     // En el futuro, podríamos llamar a una API para marcarla como 'descartada'
   };

  // --- Renderizado ---
  return (
    <View style={styles.container}>
      {/* Header (Asumiendo que _layout podría añadir uno, o lo ponemos aquí) */}
       <View style={styles.header}>
         <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
            {/* Podríamos poner un icono de flecha atrás si quisiéramos */}
             <Image
               source={require('../assets/images/LogoVigilIa2.png')}
               style={styles.logo}
               resizeMode="contain"
             />
         </Pressable>
         <Text style={styles.titleHeader}>Historial de Alertas</Text>
       </View>

      {isLoading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color="#1e3a8a" /></View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Reintentar" onPress={fetchEventos} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.mainContent}>
          {eventos.length === 0 ? (
            <Text style={styles.noAlerts}>No hay eventos registrados.</Text>
          ) : (
            eventos.map((evento) => (
              <AlertCard
                key={evento.id}
                event={evento}
                onDismiss={handleDismiss} 
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// --- Estilos (Ajustados ligeramente) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
   errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  header: {
    position: 'relative',        
    alignItems: 'center',        
    justifyContent: 'center',
    backgroundColor: '#6366f1', // Morado claro
    paddingVertical: 20, // Un poco menos padding
    paddingHorizontal: 20,
    // Quitamos border radius si es una pantalla completa
  },
  logo: { // Ajustamos posición del logo en header
    position: 'absolute',
    left: 15, // Más cerca del borde
    top: 15, // Ajusta según sea necesario
    width: 40,
    height: 40,
  },   
  titleHeader: { fontSize: 22, fontWeight: 'bold', color: 'white', textAlign: 'center' }, // Ligeramente más pequeño
  mainContent: { padding: 20 },
  noAlerts: { textAlign: 'center', color: '#6b7280', fontSize: 16, marginTop: 40 },
  card: {
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1.5, // Ligeramente más grueso
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2, // Sombra ligera
  },
  cardContent: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center'}, // Centrar icono y texto verticalmente
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }, // Más espacio arriba
  icon: { marginRight: 12 }, // Más espacio para el icono
  title: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2}, // Ligeramente más pequeño el margen
  message: { fontSize: 14, color: '#4b5563', marginTop: 2 },
  timestamp: { fontSize: 12, color: '#9ca3af' },
  markRead: { backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  markReadText: { color: 'white', fontSize: 12, fontWeight: '500' },
});