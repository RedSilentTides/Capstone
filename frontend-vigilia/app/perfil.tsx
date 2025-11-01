import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { User, Lock, Trash2, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, deleteUser } from 'firebase/auth';
import { auth as firebaseAuthInstance } from '../firebaseConfig';
import { useAuth } from './_layout';
import CustomHeader from '../components/CustomHeader';
import SlidingPanel from '../components/Slidingpanel';

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Tipo para el perfil de usuario (simplificado para esta vista)
type UserProfileData = {
    nombre: string;
    email: string;
    // No necesitamos el rol aquí generalmente, pero podría incluirse
};

// Interfaz reutilizada de tu código original para el componente MenuItem
interface MenuItemProps {
  icon: ReactNode;
  text: string;
  children?: ReactNode;
  open: boolean;
  onPress: () => void;
  isDestructive?: boolean; // Para marcar visualmente la opción de eliminar
}

// Componente MenuItem reutilizado (con estilo ajustado)
function MenuItem({ icon, text, children, open, onPress, isDestructive = false }: MenuItemProps) {
  return (
    <View style={[styles.menuItem, isDestructive && styles.menuItemDestructive]}>
      <Pressable onPress={onPress} style={styles.menuLeft}>
        {icon}
        <Text style={[styles.menuText, isDestructive && styles.menuTextDestructive]}>{text}</Text>
        <ChevronRight size={18} color={isDestructive ? "#ef4444" : "#9ca3af"} style={[styles.chevron, open && styles.chevronOpen]} />
      </Pressable>
      {open && <View style={styles.dropdown}>{children}</View>}
    </View>
  );
}


export default function ProfileScreen() {
  const router = useRouter();
  const { setAuthState } = useAuth(); // Obtener función para actualizar estado global
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<string | null>(null); // Panel desplegable activo
  const [isPanelOpen, setIsPanelOpen] = useState(false); // Estado para el panel de navegación

  // Estados para los formularios
  const [currentPassword, setCurrentPassword] = useState(""); // Para reautenticar
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // Función reutilizable para obtener el token
  const getToken = useCallback(async (): Promise<string | null> => {
    const tokenKey = 'userToken';
    if (Platform.OS === 'web') return await AsyncStorage.getItem(tokenKey);
    else return await SecureStore.getItemAsync(tokenKey);
  }, []);

  // Función para cargar el perfil del usuario
  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { router.replace('/login'); return; }

    try {
      console.log('Obteniendo perfil para /profile...');
      const response = await axios.get(`${API_URL}/usuarios/yo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserProfile({
          nombre: response.data.nombre,
          email: response.data.email,
      });
      console.log('Perfil obtenido:', response.data.email);
    } catch (err) {
      console.error('Error al obtener perfil:', err);
      setError('No se pudo cargar tu perfil.');
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
          setTimeout(() => router.replace('/login'), 1500);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getToken, router]);

  // Cargar perfil al montar
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // --- Lógica para Cambiar Contraseña ---
  const handleChangePassword = async () => {
     if (newPassword.length < 6) {
        Alert.alert("Error", "La nueva contraseña debe tener al menos 6 caracteres.");
        return;
    }
     if (newPassword !== confirmNewPassword) {
        Alert.alert("Error", "Las nuevas contraseñas no coinciden.");
        return;
    }
     if (!currentPassword) {
         Alert.alert("Error", "Ingresa tu contraseña actual para confirmar.");
         return;
     }

    const user = firebaseAuthInstance.currentUser;
    if (!user || !user.email) {
        Alert.alert("Error", "No se pudo encontrar tu sesión de usuario. Intenta iniciar sesión de nuevo.");
        router.replace('/login');
        return;
    }

    // 1. Reautenticar al usuario (por seguridad)
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    try {
        console.log("Reautenticando para cambio de contraseña...");
        await reauthenticateWithCredential(user, credential);
        console.log("Reautenticación exitosa.");
        
        // 2. Si la reautenticación fue exitosa, cambiar la contraseña
        console.log("Actualizando contraseña en Firebase...");
        await updatePassword(user, newPassword);
        console.log("Contraseña actualizada en Firebase.");
        
        Alert.alert("Éxito", "Tu contraseña ha sido actualizada.");
        setOpenPanel(null); // Cierra el panel
        setCurrentPassword(""); // Limpia campos
        setNewPassword("");
        setConfirmNewPassword("");

    } catch (error: any) {
        console.error("Error al cambiar contraseña:", error);
        let message = "Ocurrió un error.";
        if (error.code === 'auth/wrong-password') {
            message = "La contraseña actual es incorrecta.";
        } else if (error.code === 'auth/too-many-requests') {
             message = "Demasiados intentos fallidos. Intenta más tarde.";
        }
        Alert.alert("Error al Cambiar Contraseña", message);
    }
  };

  // --- Lógica para Eliminar Cuenta ---
  const handleDeleteAccount = async () => {
       if (!currentPassword) {
         Alert.alert("Confirmación Requerida", "Ingresa tu contraseña actual para eliminar tu cuenta.");
         return;
     }

      const user = firebaseAuthInstance.currentUser;
      if (!user || !user.email) {
        Alert.alert("Error", "Sesión no válida.");
        router.replace('/login');
        return;
      }

      // Confirmación final
      Alert.alert(
          "¿Eliminar Cuenta Permanentemente?",
          "Esta acción no se puede deshacer. Se eliminarán todos tus datos asociados.",
          [
              { text: "Cancelar", style: "cancel" },
              { text: "Eliminar Definitivamente", style: "destructive", onPress: async () => {
                  
                  // 1. Reautenticar
                  const credential = EmailAuthProvider.credential(user.email!, currentPassword);
                  try {
                      console.log("Reautenticando para eliminar cuenta...");
                      await reauthenticateWithCredential(user, credential);
                      console.log("Reautenticación exitosa.");

                      // 2. Obtener token ANTES de borrar en Firebase (para llamar a nuestra API)
                      const token = await getToken();

                      // 3. Borrar de Firebase Auth
                      console.log("Eliminando usuario de Firebase Auth...");
                      await deleteUser(user);
                      console.log("Usuario eliminado de Firebase Auth.");

                      // 4. Borrar de nuestra BD (si tenemos token)
                      if (token) {
                          try {
                              console.log("Eliminando datos de la BD local...");
                              await axios.delete(`${API_URL}/usuarios/yo`, {
                                  headers: { Authorization: `Bearer ${token}` },
                              });
                              console.log("Datos locales eliminados.");
                          } catch (dbError) {
                              console.error("Error al eliminar datos locales (usuario ya borrado en Firebase):", dbError);
                              // No es crítico si esto falla, pero hay que loggearlo
                          }
                      }

                      // 5. Limpiar token local, actualizar estado y redirigir
                       try {
                           const tokenKey = 'userToken';
                           if (Platform.OS === 'web') await AsyncStorage.removeItem(tokenKey);
                           else await SecureStore.deleteItemAsync(tokenKey);
                       } catch(e) { console.error("Error limpiando token local:", e); }

                      // Actualizar estado global y navegar
                      setAuthState(false);
                      router.replace('/login');

                      Alert.alert("Cuenta Eliminada", "Tu cuenta ha sido eliminada permanentemente.");

                  } catch (error: any) {
                       console.error("Error al eliminar cuenta:", error);
                       let message = "Ocurrió un error al eliminar la cuenta.";
                       if (error.code === 'auth/wrong-password') {
                           message = "La contraseña actual es incorrecta.";
                       } else if (error.code === 'auth/too-many-requests') {
                            message = "Demasiados intentos fallidos. Intenta más tarde.";
                       }
                       Alert.alert("Error al Eliminar Cuenta", message);
                  }
              }}
          ]
      );
  };


  // --- Renderizado ---

  if (isLoading) {
    return <View style={styles.centerContainer}><ActivityIndicator size="large" /></View>;
  }

  if (error) {
     return (
       <View style={styles.centerContainer}>
         <Text style={styles.errorText}>{error}</Text>
         <Pressable style={styles.button} onPress={fetchProfile}>
           <Text style={styles.buttonText}>Reintentar</Text>
         </Pressable>
       </View>
     );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header con el componente reutilizable */}
      <CustomHeader
        title="Mi Perfil"
        onMenuPress={() => setIsPanelOpen(true)}
        showBackButton={true}
      />

      {/* Información del Usuario (No editable aquí directamente) */}
      <View style={styles.userInfoSection}>
          <Text style={styles.infoLabel}>Nombre:</Text>
          <Text style={styles.infoValue}>{userProfile?.nombre || 'Cargando...'}</Text>
          <Text style={styles.infoLabel}>Correo Electrónico:</Text>
          <Text style={styles.infoValue}>{userProfile?.email || 'Cargando...'}</Text>
      </View>


      {/* Menú de Acciones */}
      <View style={styles.menu}>
        {/* Cambiar Contraseña */}
        <MenuItem
          icon={<Lock size={20} color="#000" />}
          text="Cambiar contraseña"
          open={openPanel === "password"}
          onPress={() => setOpenPanel(openPanel === "password" ? null : "password")}
        >
          <TextInput
            style={styles.input}
            placeholder="Contraseña actual"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            textContentType="password" // Ayuda a gestores
          />
          <TextInput
            style={styles.input}
            placeholder="Nueva contraseña (mín. 6 caracteres)"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            textContentType="newPassword"
          />
           <TextInput
            style={styles.input}
            placeholder="Confirmar nueva contraseña"
            value={confirmNewPassword}
            onChangeText={setConfirmNewPassword}
            secureTextEntry
            textContentType="newPassword"
          />
          <Pressable style={styles.button} onPress={handleChangePassword}>
            <Text style={styles.buttonText}>Actualizar Contraseña</Text>
          </Pressable>
        </MenuItem>

        {/* Eliminar Cuenta */}
        <MenuItem
          icon={<Trash2 size={20} color="#ef4444" />} // Rojo para peligro
          text="Eliminar mi cuenta"
          open={openPanel === "delete"}
          onPress={() => setOpenPanel(openPanel === "delete" ? null : "delete")}
          isDestructive={true} // Marca visual
        >
          <Text style={styles.warningText}>
              Esta acción es permanente y eliminará tu cuenta y todos los datos asociados.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Ingresa tu contraseña actual para confirmar"
            value={currentPassword} // Reutilizamos el estado si ya lo abrió para cambiar pwd
            onChangeText={setCurrentPassword}
            secureTextEntry
            textContentType="password"
          />
          <Pressable style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.buttonText}>Confirmar Eliminación Permanente</Text>
          </Pressable>
        </MenuItem>
      </View>

      <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </ScrollView>
  );
}

// --- Estilos --- (Combinados y ajustados)
const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  container: { flex: 1, backgroundColor: "#f9fafb" },
  userInfoSection: {
      backgroundColor: '#fff',
      padding: 15,
      borderRadius: 8,
      marginHorizontal: 16,
      marginBottom: 20,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
   infoLabel: {
      fontSize: 14,
      color: '#6b7280', // Gris
      marginBottom: 2,
  },
   infoValue: {
      fontSize: 16,
      color: '#1f2937', // Oscuro
      marginBottom: 10,
  },
  menu: { flexDirection: "column", marginHorizontal: 16 }, // Añadimos margen horizontal
  menuItem: {
    flexDirection: "column", backgroundColor: "#fff", borderRadius: 8,
    marginBottom: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    borderWidth: 1, borderColor: '#e5e7eb' // Borde sutil
  },
   menuItemDestructive: {
      borderColor: '#fecaca', // Borde rojo claro para eliminar
  },
  menuLeft: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 12, // Ajusta padding
    width: "100%",
  },
  menuText: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: "500", color: '#1f2937' },
  menuTextDestructive: { color: '#ef4444' }, // Texto rojo para eliminar
  chevron: { transform: [{ rotate: "0deg" }] },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  dropdown: {
    paddingVertical: 15, paddingHorizontal: 16, backgroundColor: "#f9fafb",
    borderTopWidth: 1, borderTopColor: "#e5e7eb",
  },
  input: {
    width: "100%", padding: 10, borderRadius: 6, borderWidth: 1,
    borderColor: "#d1d5db", backgroundColor: "#fff", fontSize: 16,
    marginBottom: 12, // Espacio entre inputs
  },
  button: {
    backgroundColor: "#22c55e", paddingVertical: 12, borderRadius: 6,
    alignItems: "center", marginTop: 5, // Menos espacio arriba
  },
  deleteButton: {
    backgroundColor: "#ef4444", paddingVertical: 12, borderRadius: 6,
    alignItems: "center", marginTop: 5,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  warningText: {
      color: '#b91c1c', // Rojo oscuro
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 15,
      fontWeight: '500',
  }
});