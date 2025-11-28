// app/cuidador/_layout.tsx
import { Stack } from 'expo-router';
import React from 'react';

export default function CuidadorLayout() {
  // El header ya se maneja dentro de cada pantalla individual
  // Este layout solo necesita definir el Stack sin headers personalizados
  return (
    <Stack>
      <Stack.Screen
        name="alertas"
        options={{
          headerShown: false, // El header se maneja dentro de alertas.tsx
        }}
      />
      <Stack.Screen
        name="recordatorios"
        options={{
          headerShown: false, // El header se maneja dentro de recordatorios.tsx
        }}
      />
      <Stack.Screen
        name="adultos-mayores"
        options={{
          headerShown: false, // El header se maneja dentro de adultos-mayores.tsx
        }}
      />
      <Stack.Screen
        name="agregar-persona"
        options={{
          headerShown: false, // El header se maneja dentro de agregar-persona.tsx
        }}
      />
      <Stack.Screen
        name="seleccionar-adulto-recordatorios"
        options={{
          headerShown: false, // El header se maneja dentro de seleccionar-adulto-recordatorios.tsx
        }}
      />
    </Stack>
  );
}