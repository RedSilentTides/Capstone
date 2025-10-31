import React, { ReactNode } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  backgroundColor?: string;
  icon?: ReactNode;
}

export default function Header({
  title,
  showBackButton = true,
  onBackPress,
  backgroundColor = '#2563eb',
  icon
}: HeaderProps) {
  const router = useRouter();

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={[styles.header, { backgroundColor }]}>
      {showBackButton && (
        <Pressable onPress={handleBackPress} style={styles.backButton}>
          <Image
            source={require('../assets/images/LogoVigilIa.png')}
            style={styles.logoBack}
            resizeMode="contain"
          />
        </Pressable>
      )}
      <View style={styles.titleContainer}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <Text style={styles.title}>{title}</Text>
      </View>
      {/* Espacio para centrar el título */}
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: 5,
  },
  logoBack: {
    width: 40,
    height: 40,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 8,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
});
