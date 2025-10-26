import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, Pressable, Image, Platform } from 'react-native';
import { Link, useRouter } from 'expo-router'; // Importamos useRouter para navegación
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
// --- IMPORTACIÓN AÑADIDA ---
import { useAuth } from './_layout'; // Importa el hook del contexto

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter(); // Hook para navegación programática
  // --- OBTENER setAuthState DEL CONTEXTO ---
  const { setAuthState } = useAuth(); // Obtiene la función para actualizar el estado global

  const onLoginPressed = async () => {
    if (loading) return;
    setLoading(true);

    if (!email || !password) {
        Alert.alert('Error', 'Por favor, ingresa tu correo y contraseña.');
        setLoading(false);
        return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('Login exitoso, usuario:', user.uid);

      const idToken = await user.getIdToken();
      console.log('Token obtenido:', idToken ? 'Sí' : 'No'); 

      const tokenKey = 'userToken'; 
      try {
        if (Platform.OS === 'web') {
          await AsyncStorage.setItem(tokenKey, idToken);
          console.log('Token guardado en AsyncStorage (web).');
        } else {
          await SecureStore.setItemAsync(tokenKey, idToken);
          console.log('Token guardado en SecureStore (móvil).');
        }
        
        // --- CAMBIO CLAVE: Actualizar Estado Global y Navegar ---
        // Actualizamos el estado en AuthProvider
        setAuthState(true);
        console.log("Estado de autenticación actualizado a true.");

        // Navegamos programáticamente al dashboard
        router.replace('/');
        console.log("Navegando al dashboard...");
        // --- FIN CAMBIO CLAVE --- 

      } catch (storageError) {
          console.error("Error al guardar el token:", storageError);
          Alert.alert('Error', 'No se pudo guardar la sesión de forma segura.');
          // Mantenemos el estado como no autenticado si falla el guardado
          setAuthState(false); 
      }

    } catch (error: any) { 
      console.error('Error en login:', error.code || error.message);
      let friendlyMessage = 'Ocurrió un error al iniciar sesión.';
      // ... (manejo de errores de Firebase igual que antes) ...
       if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        friendlyMessage = 'Correo electrónico o contraseña incorrectos.';
      } else if (error.code === 'auth/invalid-email') {
        friendlyMessage = 'El formato del correo electrónico no es válido.';
      }
      Alert.alert('Error de Inicio de Sesión', friendlyMessage);
      // Aseguramos que el estado siga siendo no autenticado si falla el login
      setAuthState(false); 

    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ... (JSX sin cambios: Logo, Title, Inputs, Button, Link) ... */}
       <Image 
        source={require('../assets/images/LogoVigilIa.png')} 
        style={styles.logo}
        resizeMode="contain" 
      />
      <Text style={styles.title}>Iniciar Sesión en VigilIA</Text>
      <TextInput /* Email */ style={styles.input} placeholder="Correo electrónico" value={email} onChangeText={setEmail} /* ...props... */ />
      <TextInput /* Password */ style={styles.input} placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry /* ...props... */ />
      <Pressable style={styles.button} onPress={onLoginPressed} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Ingresando...' : 'Iniciar Sesión'}</Text>
      </Pressable>
      <Link href="/register" asChild>
         <Pressable style={styles.linkContainer}>
            <Text style={styles.linkText}>¿No tienes una cuenta? Regístrate</Text>
         </Pressable>
      </Link>
    </View>
  );
}

// --- Estilos (Sin cambios) ---
const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#f0f4f8' },
    logo: { width: 100, height: 100, alignSelf: 'center', marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#1e3a8a' },
    input: { backgroundColor: 'white', height: 50, borderColor: '#d1d5db', borderWidth: 1, borderRadius: 8, marginBottom: 15, paddingHorizontal: 15, fontSize: 16 },
    button: { backgroundColor: '#2563eb', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 15 },
    buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    linkContainer: { marginTop: 15 },
    linkText: { color: '#2563eb', textAlign: 'center', fontSize: 14 },
});