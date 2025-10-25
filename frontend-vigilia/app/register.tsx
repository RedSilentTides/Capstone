import React, { useState } from 'react';
// Usamos componentes de react-native para compatibilidad universal
import axios from 'axios'; // Asegúrate de importar AxiosError
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
// Importamos Link para navegar y router para redirigir programáticamente
import { Link, router } from 'expo-router';

// URL de tu API backend desplegada en Cloud Run
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

export default function RegisterScreen() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // --- Selección de Rol (Ejemplo Básico) ---
  // Añadimos un estado para el tipo de cuenta
  const [tipoCuenta, setTipoCuenta] = useState('cuidador'); // Por defecto 'cuidador'

  const onRegisterPressed = async () => {
    if (loading) return;
    setLoading(true);

    // Validación simple (puedes añadir más)
    if (!nombre || !email || password.length < 6) {
        Alert.alert('Error', 'Por favor, completa todos los campos (contraseña mín. 6 caracteres).');
        setLoading(false);
        return;
    }

    try {
      // Llamamos al endpoint /register de la API
      // Enviamos el 'nombre', 'email', 'password'
      // El backend asignará el rol basado en su lógica (actualmente por defecto 'cuidador')
      // Si quisieras pasar el rol desde aquí, tendrías que modificar el backend también.
      const response = await axios.post(`${API_URL}/register`, {
        nombre: nombre,
        email: email,
        password: password,
        // Opcional: Podrías enviar el tipoCuenta si modificas el backend para aceptarlo
        // tipo_cuenta: tipoCuenta 
      });

      console.log('Registro exitoso:', response.data);
      router.replace('/login');
      Alert.alert('¡Éxito!', 'Usuario registrado correctamente. Serás redirigido para iniciar sesión.');

    } catch (error) {
        // Manejo de errores más seguro con TypeScript
        let errorMessage = 'Ocurrió un error al registrar. Intenta de nuevo.';
        let errorData: any = null; // Para guardar los datos específicos del error

        if (axios.isAxiosError(error)) { // Verifica si es un error de Axios
          errorData = error.response?.data;
          errorMessage = errorData?.detail || error.message || errorMessage; // Usa el detalle si existe
          console.error('Error de Axios en registro:', errorData || error.message);
        } else if (error instanceof Error) { // Verifica si es un error estándar de JS
          errorMessage = error.message;
          console.error('Error general en registro:', error.message);
        } else {
          // Si es otro tipo de error inesperado
          console.error('Error desconocido en registro:', error);
        }

        Alert.alert('Error de Registro', errorMessage);

      } finally {
        setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear Cuenta en VigilIA</Text>

      {/* Inputs para datos del usuario */}
      <TextInput
        style={styles.input}
        placeholder="Nombre Completo"
        value={nombre}
        onChangeText={setNombre}
        autoCapitalize="words" // Capitaliza nombres
      />
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none" // No capitalizar emails
        keyboardType="email-address" // Muestra teclado de email
        textContentType="emailAddress" // Ayuda a autocompletar
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña (mín. 6 caracteres)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry // Oculta la contraseña
        textContentType="newPassword" // Ayuda a gestores de contraseñas
      />

      {/* Selector de Rol Básico */}
      <Text style={styles.label}>Tipo de cuenta:</Text>
      <View style={styles.roleSelector}>
        <Pressable 
          style={[styles.roleButton, tipoCuenta === 'cuidador' && styles.roleButtonSelected]} 
          onPress={() => setTipoCuenta('cuidador')}>
          <Text style={tipoCuenta === 'cuidador' ? styles.roleTextSelected : styles.roleText}>Soy Cuidador</Text>
        </Pressable>
        <Pressable 
          style={[styles.roleButton, tipoCuenta === 'adulto_mayor' && styles.roleButtonSelected]} 
          onPress={() => setTipoCuenta('adulto_mayor')}>
           <Text style={tipoCuenta === 'adulto_mayor' ? styles.roleTextSelected : styles.roleText}>Recibiré Cuidados</Text>
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

// Estilos (puedes personalizarlos)
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    paddingHorizontal: 20, 
    backgroundColor: '#f0f4f8', // Un fondo suave
  },
  title: { 
    fontSize: 28, // Más grande
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginBottom: 30, 
    color: '#1e3a8a', // Azul oscuro
  },
  input: {
    backgroundColor: 'white',
    height: 50, // Más altos
    borderColor: '#d1d5db', // Gris claro
    borderWidth: 1,
    borderRadius: 8, // Bordes más redondeados
    marginBottom: 15, // Más espacio
    paddingHorizontal: 15, // Más padding interno
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    color: '#374151', // Gris oscuro
    marginBottom: 8,
    marginLeft: 4,
  },
  roleSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  roleButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#60a5fa', // Azul claro
    borderRadius: 20,
  },
  roleButtonSelected: {
    backgroundColor: '#60a5fa', // Azul claro
  },
  roleText: {
    color: '#60a5fa', // Azul claro
    fontSize: 14,
  },
  roleTextSelected: {
     color: 'white',
     fontSize: 14,
     fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#2563eb', // Azul primario
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10, // Espacio antes del botón
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
    color: '#2563eb', // Azul primario
    textAlign: 'center',
    fontSize: 14,
  },
});