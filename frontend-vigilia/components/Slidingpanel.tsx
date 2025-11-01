import React from 'react';
import { View, Text, Pressable, StyleSheet, Image, ScrollView, Platform, Alert } from 'react-native';
import { X, User, Bell, Settings, HelpCircle, CalendarCheck, ChevronRight, LogOut } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../app/_layout';

interface SlidingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SlidingPanel({ isOpen, onClose }: SlidingPanelProps) {
  const router = useRouter();
  const { setAuthState } = useAuth();

  if (!isOpen) return null;

  const handleLogout = async () => {
    Alert.alert(
      "Cerrar Sesión",
      "¿Estás seguro que deseas cerrar sesión?",
      [
        {
          text: "Cancelar",
          style: "cancel"
        },
        {
          text: "Cerrar Sesión",
          style: "destructive",
          onPress: async () => {
            try {
              const tokenKey = 'userToken';
              if (Platform.OS === 'web') {
                await AsyncStorage.removeItem(tokenKey);
              } else {
                await SecureStore.deleteItemAsync(tokenKey);
              }
              setAuthState(false);
              onClose();
              router.replace('/login');
            } catch (error) {
              console.error('Error al cerrar sesión:', error);
              Alert.alert('Error', 'No se pudo cerrar sesión correctamente');
            }
          }
        }
      ]
    );
  };

  const MenuItem = ({
    icon,
    text,
    onPress,
  }: {
    icon: React.ReactNode;
    text: string;
    onPress: () => void;
  }) => (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuLeft}>
        {icon}
        <Text style={styles.menuText}>{text}</Text>
      </View>
      <ChevronRight size={18} />
    </Pressable>
  );

  return (
    <>
      {/* Fondo oscuro */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Panel lateral */}
      <View style={styles.slidingPanel}>
        <View style={styles.panelContent}>
          {/* Header */}
          <View style={styles.panelHeader}>
            <View style={styles.logoContainer}>
              <Image source={require('../assets/images/LogoVigilIa.png')} style={styles.logo} />
              <Text style={styles.appName}>VigilIA</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} />
            </Pressable>
          </View>

          <ScrollView>
            <MenuItem
              icon={<User size={20} />}
              text="Mi Perfil"
              onPress={() => {
                onClose();
                router.push('/perfil');
              }}
            />
            <MenuItem
              icon={<Bell size={20} />}
              text="Alertas"
              onPress={() => {
                onClose();
                router.push('/cuidador/alertas');
              }}
            />
            <MenuItem
              icon={<CalendarCheck size={20} />}
              text="Recordatorios"
              onPress={() => {
                onClose();
                router.push('/cuidador/recordatorios');
              }}
            />
            <MenuItem
              icon={<Settings size={20} />}
              text="Configuración"
              onPress={() => {
                onClose();
                router.push('/configuracion');
              }}
            />
            <MenuItem
              icon={<HelpCircle size={20} />}
              text="Ayuda"
              onPress={() => {
                onClose();
                router.push('/ayuda');
              }}
            />

            {/* Separador */}
            <View style={styles.separator} />

            {/* Botón de Cerrar Sesión */}
            <Pressable style={styles.logoutMenuItem} onPress={handleLogout}>
              <View style={styles.menuLeft}>
                <LogOut size={20} color="#ef4444" />
                <Text style={styles.logoutText}>Cerrar Sesión</Text>
              </View>
              <ChevronRight size={18} color="#ef4444" />
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 998,
  },
  slidingPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 280,
    bottom: 0,
    backgroundColor: '#fff',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 2, height: 0 },
    shadowRadius: 4,
    elevation: 5,
    zIndex: 999,
  },
  panelContent: { flex: 1 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // separa logo y botón
    marginBottom: 24,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: { width: 40, height: 40, marginRight: 8 },
  appName: { fontSize: 20, fontWeight: 'bold' },
  closeButton: {
    padding: 4,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center' },
  menuText: { fontSize: 16, marginLeft: 8 },
  separator: {
    height: 1,
    backgroundColor: '#d1d5db',
    marginVertical: 12,
    marginHorizontal: 8,
  },
  logoutMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  logoutText: {
    fontSize: 16,
    marginLeft: 8,
    color: '#ef4444',
    fontWeight: '600',
  },
});
