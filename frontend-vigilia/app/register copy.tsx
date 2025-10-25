import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import axios from 'axios';
import { Link, router } from 'expo-router';

// Esta es la URL de tu API backend desplegada
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

export default function RegisterScreen() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onRegisterPressed = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // Llamamos al endpoint /register de nuestra API de FastAPI
      const response = await axios.post(`${API_URL}/register`, {
        nombre: nombre,
        email: email,
        password: password,
      });

      Alert.alert('Éxito', '¡Usuario registrado correctamente! Ahora inicia sesión.');
      router.replace('/login'); // Redirige al usuario a la pantalla de login

    } catch (error) {
      console.error(error.response?.data || error.message);
      const detail = error.response?.data?.detail || 'No se pudo registrar.';
      Alert.alert('Error', detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear Cuenta</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre"
        value={nombre}
        onChangeText={setNombre}
      />
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña (mín. 6 caracteres)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Button title={loading ? 'Creando...' : 'Registrarme'} onPress={onRegisterPressed} />
      
      <Link href="/login" style={styles.link}>
        ¿Ya tienes una cuenta? Inicia sesión
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  link: {
    marginTop: 16,
    color: 'blue',
    textAlign: 'center',
  },
});