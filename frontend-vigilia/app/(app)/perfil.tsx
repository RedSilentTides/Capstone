import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { User, Lock, Trash2, ChevronRight, Edit, Calendar, MapPin, FileText } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, deleteUser } from 'firebase/auth';
import { auth as firebaseAuthInstance } from '../../firebaseConfig';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

type UserProfileData = {
    id: number;
    nombre: string;
    email: string;
    rol: 'cuidador' | 'adulto_mayor' | 'administrador';
    adulto_mayor_id?: number;
    nombre_completo?: string;
    fecha_nacimiento?: string;
    direccion?: string;
    notas_relevantes?: string;
};

interface MenuItemProps {
  icon: ReactNode;
  text: string;
  children?: ReactNode;
  open: boolean;
  onPress: () => void;
  isDestructive?: boolean;
}

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
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
        const token = await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const userResponse = await axios.get(`${API_URL}/usuarios/yo`, config);
        const userData = userResponse.data;
        let profileData: UserProfileData = { ...userData };

        if (userData.rol === 'adulto_mayor') {
            try {
                const amResponse = await axios.get(`${API_URL}/adultos-mayores/mi-perfil`, config);
                if (amResponse.data) {
                    profileData = { ...profileData, ...amResponse.data };
                }
            } catch (amError) {
                console.error('Error al obtener datos de adulto mayor:', amError);
            }
        }
        setUserProfile(profileData);
    } catch (err) {
        console.error('Error al obtener perfil:', err);
        setError('No se pudo cargar tu perfil.');
    } finally {
        setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

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

    const firebaseUser = firebaseAuthInstance.currentUser;
    if (!firebaseUser || !firebaseUser.email) {
        Alert.alert("Error", "No se pudo encontrar tu sesión de usuario.");
        return;
    }

    const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
    try {
        await reauthenticateWithCredential(firebaseUser, credential);
        await updatePassword(firebaseUser, newPassword);
        Alert.alert("Éxito", "Tu contraseña ha sido actualizada.");
        setOpenPanel(null);
        setCurrentPassword("");
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

  const handleDeleteAccount = async () => {
       if (!currentPassword) {
         Alert.alert("Confirmación Requerida", "Ingresa tu contraseña actual para eliminar tu cuenta.");
         return;
     }

      const firebaseUser = firebaseAuthInstance.currentUser;
      if (!firebaseUser || !firebaseUser.email) {
        Alert.alert("Error", "Sesión no válida.");
        return;
      }

      Alert.alert(
          "¿Eliminar Cuenta Permanentemente?",
          "Esta acción no se puede deshacer. Se eliminarán todos tus datos asociados.",
          [
              { text: "Cancelar", style: "cancel" },
              { text: "Eliminar Definitivamente", style: "destructive", onPress: async () => {
                  const credential = EmailAuthProvider.credential(firebaseUser.email!, currentPassword);
                  try {
                      await reauthenticateWithCredential(firebaseUser, credential);
                      const token = await user?.getIdToken();
                      if (token) {
                          try {
                              await axios.delete(`${API_URL}/usuarios/yo`, { headers: { Authorization: `Bearer ${token}` } });
                          } catch (dbError) {
                              console.error("Error al eliminar datos locales:", dbError);
                          }
                      }
                      await deleteUser(firebaseUser);
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
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <Pressable
          style={styles.editProfileButton}
          onPress={() => router.push('/editar-perfil')}
        >
          <Edit size={20} color="#7c3aed" />
          <Text style={styles.editProfileText}>Editar Información Personal</Text>
          <ChevronRight size={20} color="#7c3aed" />
        </Pressable>
        <View style={styles.userInfoSection}>
            <Text style={styles.sectionTitle}>Información de Cuenta</Text>
            <View style={styles.infoRow}>
              <User size={18} color="#7c3aed" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Nombre</Text>
                <Text style={styles.infoValue}>{userProfile?.nombre || 'No especificado'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <User size={18} color="#7c3aed" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Correo Electrónico</Text>
                <Text style={styles.infoValue}>{userProfile?.email || 'No especificado'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <User size={18} color="#7c3aed" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Rol</Text>
                <Text style={styles.infoValue}>
                  {userProfile?.rol === 'cuidador' ? 'Cuidador' :
                   userProfile?.rol === 'adulto_mayor' ? 'Adulto Mayor' : 'Administrador'}
                </Text>
              </View>
            </View>
            {userProfile?.rol === 'adulto_mayor' && (
              <>
                {userProfile.nombre_completo && (
                  <View style={styles.infoRow}>
                    <User size={18} color="#7c3aed" />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Nombre Completo</Text>
                      <Text style={styles.infoValue}>{userProfile.nombre_completo}</Text>
                    </View>
                  </View>
                )}
                {userProfile.fecha_nacimiento && (
                  <View style={styles.infoRow}>
                    <Calendar size={18} color="#7c3aed" />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Fecha de Nacimiento</Text>
                      <Text style={styles.infoValue}>
                        {new Date(userProfile.fecha_nacimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                )}
                {userProfile.direccion && (
                  <View style={styles.infoRow}>
                    <MapPin size={18} color="#7c3aed" />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Dirección</Text>
                      <Text style={styles.infoValue}>{userProfile.direccion}</Text>
                    </View>
                  </View>
                )}
                {userProfile.notas_relevantes && (
                  <View style={styles.infoRow}>
                    <FileText size={18} color="#7c3aed" />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Notas Relevantes</Text>
                      <Text style={styles.infoValue}>{userProfile.notas_relevantes}</Text>
                    </View>
                  </View>
                )}
                {!userProfile.nombre_completo && !userProfile.fecha_nacimiento && !userProfile.direccion && (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      ⚠️ Tu perfil está incompleto. Completa tu información para que tus cuidadores puedan ayudarte mejor.
                    </Text>
                  </View>
                )}
              </>
            )}
        </View>
        <View style={styles.menu}>
          <MenuItem
            icon={<Lock size={20} color="#000" />}
            text="Cambiar contraseña"
            open={openPanel === "password"}
            onPress={() => setOpenPanel(openPanel === "password" ? null : "password")}
          >
            <TextInput style={styles.input} placeholder="Contraseña actual" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry textContentType="password" />
            <TextInput style={styles.input} placeholder="Nueva contraseña (mín. 6 caracteres)" value={newPassword} onChangeText={setNewPassword} secureTextEntry textContentType="newPassword" />
            <TextInput style={styles.input} placeholder="Confirmar nueva contraseña" value={confirmNewPassword} onChangeText={setConfirmNewPassword} secureTextEntry textContentType="newPassword" />
            <Pressable style={styles.button} onPress={handleChangePassword}><Text style={styles.buttonText}>Actualizar Contraseña</Text></Pressable>
          </MenuItem>
          <MenuItem
            icon={<Trash2 size={20} color="#ef4444" />}
            text="Eliminar mi cuenta"
            open={openPanel === "delete"}
            onPress={() => setOpenPanel(openPanel === "delete" ? null : "delete")}
            isDestructive={true}
          >
            <Text style={styles.warningText}>Esta acción es permanente y eliminará tu cuenta y todos los datos asociados.</Text>
            <TextInput style={styles.input} placeholder="Ingresa tu contraseña actual para confirmar" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry textContentType="password" />
            <Pressable style={styles.deleteButton} onPress={handleDeleteAccount}><Text style={styles.buttonText}>Confirmar Eliminación Permanente</Text></Pressable>
          </MenuItem>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  container: { flex: 1, backgroundColor: "#f9fafb" },
  editProfileButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingVertical: 16, paddingHorizontal: 20, marginHorizontal: 16, marginTop: 16, marginBottom: 12, borderRadius: 12, borderWidth: 2, borderColor: '#7c3aed', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  editProfileText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#7c3aed', marginLeft: 12 },
  userInfoSection: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginHorizontal: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoContent: { flex: 1, marginLeft: 12 },
  infoLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', fontWeight: '600' },
  infoValue: { fontSize: 16, color: '#111827', lineHeight: 22 },
  warningBox: { backgroundColor: '#fef3c7', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#f59e0b', marginTop: 8 },
  warningText: { color: '#92400e', fontSize: 14, lineHeight: 20 },
  menu: { flexDirection: "column", marginHorizontal: 16 },
  menuItem: { flexDirection: "column", backgroundColor: "#fff", borderRadius: 8, marginBottom: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, borderWidth: 1, borderColor: '#e5e7eb' },
  menuItemDestructive: { borderColor: '#fecaca' },
  menuLeft: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 12, width: "100%" },
  menuText: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: "500", color: '#1f2937' },
  menuTextDestructive: { color: '#ef4444' },
  chevron: { transform: [{ rotate: "0deg" }] },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  dropdown: { paddingVertical: 15, paddingHorizontal: 16, backgroundColor: "#f9fafb", borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  input: { width: "100%", padding: 10, borderRadius: 6, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#fff", fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: "#22c55e", paddingVertical: 12, borderRadius: 6, alignItems: "center", marginTop: 5 },
  deleteButton: { backgroundColor: "#ef4444", paddingVertical: 12, borderRadius: 6, alignItems: "center", marginTop: 5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  warningText: { color: '#b91c1c', fontSize: 14, textAlign: 'center', marginBottom: 15, fontWeight: '500' }
});
