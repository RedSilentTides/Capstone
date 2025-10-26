import React, { useState, useEffect, createContext, useContext } from 'react';
import { Stack, useRouter, Slot } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, View, ActivityIndicator, StyleSheet } from 'react-native';
import SlidingPanel from '../components/Slidingpanel'; // Importa tu componente
import { Menu } from 'lucide-react-native'; // Importa el icono del menú
import { Pressable } from 'react-native'; // Importa Pressable

// --- Contexto de Autenticación ---
// Creamos un contexto para compartir el estado de autenticación (si está logueado o no)
// y la función para cambiar ese estado (login/logout).
type AuthContextType = {
  isAuthenticated: boolean;
  setAuthState: (isAuthenticated: boolean) => void;
  isLoading: boolean; // Añadimos estado de carga inicial
};
const AuthContext = createContext<AuthContextType | null>(null);

// Hook personalizado para usar fácilmente el contexto de autenticación
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// --- Proveedor de Autenticación ---
// Este componente envolverá toda la app y manejará la lógica de sesión.
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuthState] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Estado para la carga inicial del token
  const router = useRouter();

  useEffect(() => {
    const checkToken = async () => {
      let token: string | null = null;
      try {
        const tokenKey = 'userToken';
        if (Platform.OS === 'web') {
          token = await AsyncStorage.getItem(tokenKey);
        } else {
          token = await SecureStore.getItemAsync(tokenKey);
        }

        if (token) {
          console.log('_layout: Token encontrado, marcando como autenticado.');
          setAuthState(true);
        } else {
          console.log('_layout: No hay token, marcando como no autenticado.');
          setAuthState(false);
          // Opcional: Redirigir aquí si prefieres manejarlo centralmente
          // router.replace('/login'); 
        }
      } catch (e) {
        console.error('_layout: Error al leer el token:', e);
        setAuthState(false); // Asume no autenticado si hay error
      } finally {
        setIsLoading(false); // Termina la carga inicial
      }
    };

    checkToken();
  }, []); // Se ejecuta solo al montar el componente

  // Efecto para redirigir basado en el estado de autenticación
  useEffect(() => {
    if (!isLoading) { // Solo redirige después de verificar el token
      if (isAuthenticated) {
        // Si está autenticado, asegúrate de que esté en la sección principal
        // Esto es útil si el usuario estaba en /login y luego se autentica
        console.log('_layout: Autenticado, asegurando que esté en /');
        // router.replace('/'); // Puedes descomentar si quieres forzar ir a '/' siempre al autenticar
      } else {
        // Si no está autenticado, redirige a login
        console.log('_layout: No autenticado, redirigiendo a /login');
        router.replace('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]); // Se ejecuta cuando cambian estos valores


  return (
    <AuthContext.Provider value={{ isAuthenticated, setAuthState, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}


// --- Layout Principal ---
export default function RootLayout() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return (
    <AuthProvider>
      <RootLayoutNav isPanelOpen={isPanelOpen} setIsPanelOpen={setIsPanelOpen} />
      {/* Renderiza el panel deslizante fuera de la navegación principal */}
      <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </AuthProvider>
  );
}

// Componente separado para la navegación, para poder usar el hook useAuth
function RootLayoutNav({ isPanelOpen, setIsPanelOpen }: { isPanelOpen: boolean, setIsPanelOpen: (isOpen: boolean) => void }) {
  const { isAuthenticated, isLoading } = useAuth(); // Obtiene el estado del contexto

  // Muestra un indicador de carga mientras se verifica el token
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    // Usa Stack para la navegación principal
    <Stack screenOptions={{ headerShown: false }}> 
      {/* Pantalla principal (Index) con opción de header personalizado */}
      <Stack.Screen 
        name="index" 
        options={{ 
          headerShown: true, // Mostramos el header aquí
          title: 'VigilIA Dashboard', // Título del header
          // Botón de menú para abrir el SlidingPanel
          headerLeft: () => (
             <Pressable onPress={() => setIsPanelOpen(true)} style={{ marginLeft: 15 }}>
               <Menu size={24} color="black" />
             </Pressable>
          ),
        }} 
      />
      {/* Pantallas de autenticación (sin header por defecto) */}
      <Stack.Screen name="login" options={{ title: 'Iniciar Sesión' }} />
      <Stack.Screen name="register" options={{ title: 'Crear Cuenta' }} />
      {/* Otras pantallas principales (se pueden configurar aquí o en sus propios _layout) */}
      <Stack.Screen name="profile" options={{ title: 'Mi Perfil', presentation: 'modal' }} /> 
      <Stack.Screen name="alerts" options={{ title: 'Alertas' }} />
      <Stack.Screen name="reminders" options={{ title: 'Recordatorios' }} />
      <Stack.Screen name="settings" options={{ title: 'Configuración' }} />
      <Stack.Screen name="help" options={{ title: 'Ayuda' }} />
      {/* Puedes definir aquí las rutas de cuidador si quieres o usar un layout anidado */}
      {/* <Stack.Screen name="(cuidador)" options={{ headerShown: false }} /> */}
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});