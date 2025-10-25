// SlidingPanel.tsx
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

  // Componente interno MenuItem
  const MenuItem = ({
    icon,
    text,
    onPress,
  }: {
    icon: React.ReactNode;
    text: string;
    onPress: () => void;
  }) => {
    return (
      <Pressable
        style={styles.menuItem}
        onPress={onPress}
      >
        <View style={styles.menuLeft}>
          {icon}
          <Text style={styles.menuText}>{text}</Text>
        </View>
        <ChevronRight size={18} />
      </Pressable>
    );
  };

  return (
    <>
      {/* Overlay */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Sliding panel */}
      <View style={styles.slidingPanel}>
        <View style={styles.panelContent}>
          {/* Header */}
          <View style={styles.panelHeader}>
            <View style={styles.logoName}>
              <Image source={require('../assets/images/LogoVigilIa.png')} style={styles.logo} />
              <Text style={styles.appName}>VigilIA</Text>
            </View>
            <Pressable onPress={onClose}>
              <X size={24} />
            </Pressable>
          </View>

          <ScrollView>
            <MenuItem
              icon={<User size={20} />}
              text="Mi Perfil"
              onPress={() => {
                onClose();
                router.push('/profile');
              }}
            />
            <MenuItem
              icon={<Bell size={20} />}
              text="Alertas"
              onPress={() => {
                onClose();
                router.push('/alerts');
              }}
            />
            <MenuItem
              icon={<CalendarCheck size={20} />}
              text="Recordatorios"
              onPress={() => {
                onClose();
                router.push('/reminders');
              }}
            />
            <MenuItem
              icon={<Settings size={20} />}
              text="Configuración"
              onPress={() => {
                onClose();
                router.push('/settings');
              }}
            />
            <MenuItem
              icon={<HelpCircle size={20} />}
              text="Ayuda"
              onPress={() => {
                onClose();
                router.push('/help');
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoName: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 40, height: 40 },
  appName: { fontSize: 18, fontWeight: 'bold', marginLeft: 8 },

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
