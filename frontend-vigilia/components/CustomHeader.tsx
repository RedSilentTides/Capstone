import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Menu, ArrowLeft } from 'lucide-react-native';

interface CustomHeaderProps {
  title: string;
  onMenuPress: () => void;
  showBackButton?: boolean;
}

export default function CustomHeader({ title, onMenuPress, showBackButton = true }: CustomHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Determinar si mostrar el botón de back (no en index/dashboard)
  const isHomePage = pathname === '/' || pathname === '/index';
  // Mostrar back en rutas anidadas (que contienen /) excepto en home
  const isNestedRoute = pathname.split('/').filter(p => p).length > 1;
  const shouldShowBack = showBackButton && !isHomePage && isNestedRoute;

  return (
    <View style={styles.header}>
      <View style={styles.leftSection}>
        {shouldShowBack ? (
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <ArrowLeft size={24} color="#ffffff" />
          </Pressable>
        ) : (
          <Pressable onPress={onMenuPress} style={styles.iconButton}>
            <Menu size={24} color="#ffffff" />
          </Pressable>
        )}
      </View>

      <View style={styles.centerSection}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <View style={styles.rightSection}>
        {/* Espacio reservado para mantener el título centrado */}
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
    paddingTop: 12,
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
