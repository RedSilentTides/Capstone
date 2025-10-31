import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, View, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
// Ruta actualizada al componente
import SlidingPanel from '../components/Slidingpanel';
import { Menu } from 'lucide-react-native';

// --- Contexto de Autenticación ---
type AuthContextType = {
  isAuthenticated: boolean;
  // Añadimos función para actualizar estado desde login/logout
  setAuthState: (isAuthenticated: boolean) => void; 
  isLoading: boolean;
};
const AuthContext = createContext<AuthContextType | null>(null);

// Hook personalizado
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}

// --- Proveedor de Autenticación ---
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuthStateInternal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Usamos useCallback para que la función setAuthState no cambie en cada render
  const setAuthState = useCallback((isAuth: boolean) => {
      console.log(`AuthProvider: Actualizando estado Auth a ${isAuth}`);
      setAuthStateInternal(isAuth);
  }, []);

  useEffect(() => {
    const checkToken = async () => {
      let token: string | null = null;
      console.log("AuthProvider: Verificando token...");
      try {
        const tokenKey = 'userToken';
        if (Platform.OS === 'web') {
          token = await AsyncStorage.getItem(tokenKey);
        } else {
          token = await SecureStore.getItemAsync(tokenKey);
        }

        if (token) {
          console.log('AuthProvider: Token encontrado.');
          setAuthState(true); // Actualiza estado usando la función memoizada
        } else {
          console.log('AuthProvider: No hay token.');
          setAuthState(false); // Actualiza estado
        }
      } catch (e) {
        console.error('AuthProvider: Error al leer token:', e);
        setAuthState(false); 
      } finally {
        setIsLoading(false);
        console.log("AuthProvider: Verificación inicial completa.");
      }
    };
    checkToken();
    // La dependencia de setAuthState es estable gracias a useCallback
  }, [setAuthState]); 

  // Ya no necesitamos el useEffect para redirigir aquí, 
  // el renderizado condicional en RootLayoutNav lo maneja.

  return (
    // Pasamos la función setAuthState al contexto
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
      {/* Usamos Consumer para acceder al contexto y pasarlo */}
      <AuthContext.Consumer>
        {(authContext) => (
          <>
            <RootLayoutNav
              setIsPanelOpen={setIsPanelOpen}
              isLoadingAuth={authContext?.isLoading ?? true}
              isAuthenticated={authContext?.isAuthenticated ?? false}
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
    setIsPanelOpen,
    isLoadingAuth,
    isAuthenticated
  }: {
    setIsPanelOpen: (isOpen: boolean) => void,
    isLoadingAuth: boolean,
    isAuthenticated: boolean
}) {
  
  // Muestra indicador de carga global mientras AuthProvider verifica
  if (isLoadingAuth) {
    console.log("RootLayoutNav: Mostrando indicador de carga...");
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e3a8a"/>
      </View>
    );
  }

  console.log(`RootLayoutNav: Renderizando. Autenticado: ${isAuthenticated}`);

  return (
    // --- Renderizado Condicional del Stack ---
    <Stack screenOptions={{ headerShown: false }}> 
      {!isAuthenticated ? (
        // Pantallas Públicas (si NO está autenticado)
        <>
          <Stack.Screen name="login" options={{ title: 'Iniciar Sesión' }} />
          <Stack.Screen name="register" options={{ title: 'Crear Cuenta' }} />
        </>
      ) : (
        // Pantallas Privadas (si SÍ está autenticado)
        <>
          <Stack.Screen
            name="index"
            options={{
              headerShown: true, 
              title: 'VigilIA Dashboard',
              headerLeft: () => (
                 <Pressable onPress={() => setIsPanelOpen(true)} style={{ marginLeft: 15 }}>
                   <Menu size={24} color="#1f2937" /> 
                 </Pressable>
              ),
            }} 
          />
           <Stack.Screen name="perfil" options={{ title: 'Mi Perfil', headerShown: true }} />
           <Stack.Screen name="ayuda" options={{ title: 'Ayuda', headerShown: true }} />
           {/* Rutas del cuidador */}
           <Stack.Screen name="cuidador" options={{ headerShown: false }} />
        </>
      )}
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8' 
  },
});