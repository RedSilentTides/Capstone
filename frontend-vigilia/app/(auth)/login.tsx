import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Image, Platform } from 'react-native';
import { Link } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { useToast } from '../../contexts/ToastContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const onLoginPressed = async () => {
    if (loading) return;
    setLoading(true);

    if (!email || !password) {
        showToast('error', 'Error', 'Por favor, ingresa tu correo y contraseña.');
        setLoading(false);
        return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged en AuthProvider se encargará de la redirección automáticamente
      // No necesitamos redirigir manualmente aquí para evitar conflictos en iOS
    } catch (error: any) {
      console.error('Error en login:', error.code || error.message);
      let friendlyMessage = 'Ocurrió un error al iniciar sesión.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        friendlyMessage = 'Correo electrónico o contraseña incorrectos.';
      } else if (error.code === 'auth/invalid-email') {
        friendlyMessage = 'El formato del correo electrónico no es válido.';
      }
      showToast('error', 'Error de Inicio de Sesión', friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ... (JSX sin cambios: Logo, Title, Inputs, Button, Link) ... */}
       <Image 
        source={require('../../assets/images/LogoVigilIa.png')} 
        style={styles.logo}
        resizeMode="contain" 
      />
      <Text style={styles.title}>Iniciar Sesión en VigilIA</Text>
      <TextInput style={styles.input} placeholder="Correo electrónico" value={email} onChangeText={setEmail} placeholderTextColor="#9ca3af" keyboardType="email-address" autoComplete="email" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#9ca3af" />
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