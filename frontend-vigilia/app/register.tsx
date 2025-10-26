import React, { useState } from 'react';
import axios, { AxiosError } from 'axios'; // Importamos AxiosError para el manejo de tipos
// Añadimos Image e importamos Platform
import { Alert, Pressable, StyleSheet, Text, TextInput, View, Image, Platform } from 'react-native'; 
import { Link, router } from 'expo-router';

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

export default function RegisterScreen() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Renombramos 'tipoCuenta' a 'rol' para coincidir con el backend
  const [rol, setRol] = useState<'cuidador' | 'adulto_mayor'>('cuidador'); // Tipo explícito

  const onRegisterPressed = async () => {
    if (loading) return;
    setLoading(true);

    if (!nombre || !email || password.length < 6) {
        Alert.alert('Error', 'Por favor, completa todos los campos (contraseña mín. 6 caracteres).');
        setLoading(false);
        return;
    }

    try {
      // --- CAMBIO AQUÍ: Enviamos el 'rol' seleccionado ---
      const response = await axios.post(`${API_URL}/register`, {
        nombre: nombre,
        email: email,
        password: password,
        rol: rol // Enviamos el rol seleccionado ('cuidador' o 'adulto_mayor')
      });
      // --- FIN DEL CAMBIO ---

      console.log('Registro exitoso:', response.data);
      Alert.alert(
        '¡Éxito!',
        'Usuario registrado correctamente. Serás redirigido para iniciar sesión.',
        [{ text: 'OK', onPress: () => router.replace('/login') }] 
      );

    } catch (error) { // Usamos el manejo de errores mejorado
        let errorMessage = 'Ocurrió un error al registrar. Intenta de nuevo.';
        let errorData: any = null; 

        if (axios.isAxiosError(error)) { 
          errorData = error.response?.data;
          // Usamos el 'detail' que envía FastAPI si existe
          errorMessage = errorData?.detail || error.message || errorMessage; 
          console.error('Error de Axios en registro:', errorData || error.message);
        } else if (error instanceof Error) { 
          errorMessage = error.message;
          console.error('Error general en registro:', error.message);
        } else {
          console.error('Error desconocido en registro:', error);
        }
    
        Alert.alert('Error de Registro', errorMessage);
        
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Añadimos el logo */}
      <Image 
        source={require('../assets/images/LogoVigilIa.png')} // Asegúrate que la ruta sea correcta
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.title}>Crear Cuenta en VigilIA</Text>

      {/* Inputs */}
      <TextInput
        style={styles.input}
        placeholder="Nombre Completo"
        value={nombre}
        onChangeText={setNombre}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña (mín. 6 caracteres)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
      />

      {/* Selector de Rol */}
      <Text style={styles.label}>¿Cómo usarás la aplicación?</Text>
      <View style={styles.roleSelector}>
        <Pressable 
          style={[styles.roleButton, rol === 'cuidador' && styles.roleButtonSelected]} 
          onPress={() => setRol('cuidador')}>
          <Text style={rol === 'cuidador' ? styles.roleTextSelected : styles.roleText}>Como Cuidador</Text>
        </Pressable>
        <Pressable 
          style={[styles.roleButton, rol === 'adulto_mayor' && styles.roleButtonSelected]} 
          onPress={() => setRol('adulto_mayor')}>
           <Text style={rol === 'adulto_mayor' ? styles.roleTextSelected : styles.roleText}>Para Recibir Cuidados</Text>
        </Pressable>
      </View>

      {/* Botón de Registro */}
      <Pressable style={styles.button} onPress={onRegisterPressed} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creando Cuenta...' : 'Registrarme'}</Text>
      </Pressable>
      
      {/* Enlace a Login */}
      <Link href="/login" asChild> 
        <Pressable style={styles.linkContainer}>
            <Text style={styles.linkText}>¿Ya tienes una cuenta? Inicia sesión</Text>
        </Pressable>
      </Link>
    </View>
  );
}

// Estilos consistentes con login.tsx (añadiendo logo y selector de rol)
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    paddingHorizontal: 20, 
    backgroundColor: '#f0f4f8', 
  },
   logo: {
    width: 100, 
    height: 100, 
    alignSelf: 'center', 
    marginBottom: 20, 
  },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginBottom: 30, 
    color: '#1e3a8a', 
  },
  input: {
    backgroundColor: 'white',
    height: 50, 
    borderColor: '#d1d5db', 
    borderWidth: 1,
    borderRadius: 8, 
    marginBottom: 15, 
    paddingHorizontal: 15, 
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    color: '#374151', 
    marginBottom: 8,
    marginLeft: 4,
    textAlign: 'center', // Centramos la pregunta
  },
  roleSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around', // Espacio entre botones
    marginBottom: 25, // Más espacio después
    marginTop: 5, // Espacio antes
  },
  roleButton: {
    paddingVertical: 10,
    paddingHorizontal: 15, // Un poco menos padding horizontal
    borderWidth: 1.5, // Borde ligeramente más grueso
    borderColor: '#60a5fa', 
    borderRadius: 20, // Más redondeado
    minWidth: 120, // Ancho mínimo para que se vean bien
    alignItems: 'center', // Centrar texto
  },
  roleButtonSelected: {
    backgroundColor: '#60a5fa', 
  },
  roleText: {
    color: '#3b82f6', // Azul un poco más oscuro para texto no seleccionado
    fontSize: 14,
    fontWeight: '500', // Semi-bold
  },
  roleTextSelected: {
     color: 'white',
     fontSize: 14,
     fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#2563eb', 
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10, 
    marginBottom: 15,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkContainer: {
    marginTop: 15, 
  },
  linkText: {
    color: '#2563eb', 
    textAlign: 'center',
    fontSize: 14,
  },
});