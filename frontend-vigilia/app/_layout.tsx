import React, { useState, useEffect, createContext, useContext } from 'react';
import { Stack, useRouter } from 'expo-router'; // Slot no es necesario aquí usualmente
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, View, ActivityIndicator, StyleSheet, Pressable } from 'react-native'; // Pressable ya estaba
// --- RUTA CORREGIDA ---
import SlidingPanel from '../components/Slidingpanel'; // Importa desde la carpeta components
// --- FIN RUTA CORREGIDA ---
import { Menu } from 'lucide-react-native';

// --- Contexto de Autenticación (Sin cambios) ---
type AuthContextType = {
  isAuthenticated: boolean;
  setAuthState: (isAuthenticated: boolean) => void;
  isLoading: boolean;
};
const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// --- Proveedor de Autenticación (Sin cambios) ---
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuthState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
        }
      } catch (e) {
        console.error('_layout: Error al leer el token:', e);
        setAuthState(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        console.log('_layout: No autenticado, redirigiendo a /login');
        router.replace('/login');
      } else {
         console.log('_layout: Autenticado.');
         // Podríamos verificar si está en login/register y redirigir a '/'
         // const currentRoute = router. // Expo router no expone ruta actual fácilmente aquí
         // if (currentRoute === '/login' || currentRoute === '/register') {
         //    router.replace('/');
         // }
      }
    }
  }, [isAuthenticated, isLoading, router]);

  // Renderiza los hijos solo después de la carga inicial Y si está autenticado
  // O si NO está autenticado (para mostrar login/register)
  // Las pantallas dentro del Stack decidirán qué mostrar basado en si `isAuthenticated` es true/false
  // if (isLoading) {
  //     return <View style={styles.loadingContainer}><ActivityIndicator size="large" /></View>;
  // }

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
      {/* Usamos función como hijo para acceder al contexto aquí si fuera necesario */}
      <AuthContext.Consumer> 
        {(authContext) => (
          <>
            <RootLayoutNav 
              isPanelOpen={isPanelOpen} 
              setIsPanelOpen={setIsPanelOpen} 
              isLoadingAuth={authContext?.isLoading ?? true} // Pasa el estado de carga
            />
            {/* Solo muestra el panel si está autenticado y no cargando */}
            {(authContext?.isAuthenticated && !authContext?.isLoading) && (
              <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
            )}
          </>
        )}
      </AuthContext.Consumer>
    </AuthProvider>
  );
}

// Componente separado para la navegación
function RootLayoutNav({ 
    isPanelOpen, 
    setIsPanelOpen,
    isLoadingAuth // Recibe el estado de carga
  }: { 
    isPanelOpen: boolean, 
    setIsPanelOpen: (isOpen: boolean) => void,
    isLoadingAuth: boolean 
}) {
  const { isAuthenticated } = useAuth(); // Obtiene el estado del contexto

  // Muestra un indicador de carga global mientras AuthProvider verifica el token
  if (isLoadingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e3a8a"/>
      </View>
    );
  }

  return (
    // Usa Stack. Navigator provee el contexto de navegación
    <Stack screenOptions={{ 
        headerShown: false // Ocultamos header por defecto, lo activamos por pantalla
    }}>
      {/* Pantallas Públicas (accesibles sin login) */}
      <Stack.Screen 
        name="login" 
        options={{ title: 'Iniciar Sesión', headerShown: false }} // Sin header en login
        redirect={isAuthenticated} // Si está autenticado, redirige fuera de login (a '/')
      />
      <Stack.Screen 
        name="register" 
        options={{ title: 'Crear Cuenta', headerShown: false }} // Sin header en register
        redirect={isAuthenticated} // Si está autenticado, redirige fuera de register (a '/')
      />

      {/* Pantallas Privadas (requieren login) */}
      <Stack.Screen
        name="index"
        options={{
          headerShown: true, // Mostramos header en el dashboard
          title: 'VigilIA Dashboard',
          headerLeft: () => (
             <Pressable onPress={() => setIsPanelOpen(true)} style={{ marginLeft: 15 }}>
               <Menu size={24} color="#1f2937" /> {/* Color oscuro para header claro */}
             </Pressable>
          ),
          // Podrías añadir headerRight aquí si necesitas (ej. icono de notificaciones)
        }}
        redirect={!isAuthenticated} // Si NO está autenticado, redirige fuera de index (a '/login')
      />
       <Stack.Screen 
        name="perfil" // Nombre de archivo actualizado
        options={{ 
            title: 'Mi Perfil', 
            // presentation: 'modal' // Puedes mantenerlo modal o hacerlo pantalla completa
            headerShown: true // Mostrar header estándar o personalizado
        }} 
        redirect={!isAuthenticated} 
      />
       <Stack.Screen 
        name="ayuda" // Nombre de archivo actualizado
        options={{ 
            title: 'Ayuda',
            headerShown: true // Mostrar header estándar o personalizado
        }} 
        redirect={!isAuthenticated} 
      />
      
      {/* Grupo de rutas del cuidador */}
      {/* Usamos 'name' para referirnos a la carpeta del grupo */}
      <Stack.Screen 
          name="(cuidador)" 
          options={{ headerShown: false }} // El layout interno de (cuidador) definirá sus headers
          redirect={!isAuthenticated} 
      />

      {/* Pantallas eliminadas (ya no se definen) */}
      {/* <Stack.Screen name="settings" ... /> */}
      {/* <Stack.Screen name="alerts" ... /> (Ahora está dentro de cuidador) */}
      {/* <Stack.Screen name="reminders" ... /> (Ahora está dentro de cuidador) */}
      
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8' // Fondo mientras carga
  },
});