import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Menu, ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CustomHeaderProps {
  title: string;
  onMenuPress: () => void;
  showBackButton?: boolean;
}

export default function CustomHeader({ title, onMenuPress, showBackButton = true }: CustomHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Determinar si estamos en la página de inicio
  const isHomePage = pathname === '/' || pathname === '/index';

  // Función segura para navegar hacia atrás
  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      {/* Botón izquierdo: Siempre muestra el menú hamburguesa */}
      <View style={styles.leftSection}>
        <Pressable onPress={onMenuPress} style={styles.iconButton}>
          <Menu size={24} color="#ffffff" />
        </Pressable>
      </View>

      {/* Título centrado */}
      <View style={styles.centerSection}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      {/* Botón derecho: Muestra flecha de regreso si showBackButton=true y no estamos en home */}
      <View style={styles.rightSection}>
        {showBackButton && !isHomePage ? (
          <Pressable onPress={handleBackPress} style={styles.iconButton}>
            <ArrowLeft size={24} color="#ffffff" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#7c3aed', // Morado
    paddingBottom: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 4,
  },
  leftSection: {
    width: 40,
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rightSection: {
    width: 40,
  },
  iconButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
});
