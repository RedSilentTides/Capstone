import React from 'react';
import { View, Text, Pressable, StyleSheet, Image, ScrollView } from 'react-native';
import { X, User, Bell, Settings, HelpCircle, CalendarCheck, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';

interface SlidingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SlidingPanel({ isOpen, onClose }: SlidingPanelProps) {
  const router = useRouter();

  if (!isOpen) return null;

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
});
