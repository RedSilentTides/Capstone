import React from 'react';
import {
  View, Text, Pressable, StyleSheet, Image, ScrollView, Platform
} from 'react-native';
import { X, User, Bell, Settings, HelpCircle, CalendarCheck, ChevronRight, LogOut, Home } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../contexts/ToastContext';

export default function PanelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast, showConfirm } = useToast();

  const handleLogout = () => {
    const performLogout = async () => {
      try {
        console.log('[PANEL] Ejecutando signOut...');
        await signOut(auth);
        console.log('[PANEL] signOut completado sin errores.');
        router.back(); // Cierra el panel
      } catch (error) {
        console.error('[PANEL] Error durante signOut:', error);
        showToast('error', 'Error', 'No se pudo cerrar sesión correctamente');
      }
    };

    showConfirm({
        title: "Cerrar Sesión",
        message: "¿Estás seguro que deseas cerrar sesión?",
        cancelText: "Cancelar",
        confirmText: "Cerrar Sesión",
        onConfirm: performLogout,
        destructive: true
    });
  };

  const navigate = (path: string) => {
    // Usar replace en lugar de back + push para evitar problemas en iOS
    router.replace(path as any);
  };

  return (
    <View style={styles.modalContainer}>
      {/* Overlay para cerrar al tocar fuera */}
      <Pressable style={styles.overlay} onPress={() => router.back()} />

      {/* Contenido del Panel a la izquierda */}
      <View style={styles.slidingPanel}>
        <View style={[styles.panelHeader, { paddingTop: insets.top + 16 }]}>
          <View style={styles.logoContainer}>
            <Image source={require('../../assets/images/LogoVigilIa.png')} style={styles.logo} />
            <Text style={styles.appName}>VigilIA</Text>
          </View>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <X size={24} color="#374151" />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom }}>
          <MenuItem icon={<Home size={20} color="#374151" />} text="Inicio" onPress={() => navigate('/')} />
          <MenuItem icon={<User size={20} color="#374151" />} text="Mi Perfil" onPress={() => navigate('/perfil')} />
          <MenuItem icon={<Bell size={20} color="#374151" />} text="Alertas" onPress={() => navigate('/cuidador/alertas')} />
          <MenuItem icon={<CalendarCheck size={20} color="#374151" />} text="Recordatorios" onPress={() => navigate('/cuidador/recordatorios')} />
          <MenuItem icon={<Settings size={20} color="#374151" />} text="Configuración" onPress={() => navigate('/configuracion')} />
          <MenuItem icon={<HelpCircle size={20} color="#374151" />} text="Ayuda" onPress={() => navigate('/ayuda')} />
          <View style={styles.separator} />
          <Pressable style={styles.logoutMenuItem} onPress={handleLogout}>
            <View style={styles.menuLeft}>
              <LogOut size={20} color="#ef4444" />
              <Text style={styles.logoutText}>Cerrar Sesión</Text>
            </View>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const MenuItem = ({ icon, text, onPress }: { icon: React.ReactNode; text: string; onPress: () => void; }) => (
  <Pressable style={styles.menuItem} onPress={onPress}>
    <View style={styles.menuLeft}>
      {icon}
      <Text style={styles.menuText}>{text}</Text>
    </View>
    <ChevronRight size={18} color="#6b7280" />
  </Pressable>
);

const styles = StyleSheet.create({
  modalContainer: { flex: 1, flexDirection: 'row' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 1
  },
  slidingPanel: {
    width: 280,
    backgroundColor: '#fff',
    zIndex: 2,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: -4, height: 0 }, shadowRadius: 12 },
      android: { elevation: 20 },
      default: { boxShadow: '-4px 0px 12px rgba(0, 0, 0, 0.25)' }
    })
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  logoContainer: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 40, height: 40, marginRight: 10 },
  appName: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  closeButton: { padding: 4 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  menuLeft: { flexDirection: 'row', alignItems: 'center' },
  menuText: { fontSize: 16, marginLeft: 16, color: '#374151' },
  separator: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 12 },
  logoutMenuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, marginTop: 8 },
  logoutText: { fontSize: 16, marginLeft: 16, color: '#ef4444', fontWeight: '600' },
});
