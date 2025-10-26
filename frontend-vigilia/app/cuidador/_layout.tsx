// app/cuidador/_layout.tsx
import { Stack } from 'expo-router';
import React from 'react';

export default function CuidadorLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="alertas"
        options={{ title: 'Historial de Alertas' }}
      />
      <Stack.Screen
        name="configuracion"
        options={{ title: 'Configuración de Notificaciones' }}
      />
      <Stack.Screen
        name="recordatorios"
        options={{ title: 'Gestión de Recordatorios' }}
      />
    </Stack>
  );
}