// app/cuidador/_layout.tsx
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import CustomHeader from '../../components/CustomHeader';
import SlidingPanel from '../../components/Slidingpanel';

export default function CuidadorLayout() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return (
    <>
      <Stack>
        <Stack.Screen
          name="alertas"
          options={{
            headerShown: true,
            header: () => <CustomHeader title="Historial de Alertas" onMenuPress={() => setIsPanelOpen(true)} />,
          }}
        />
        <Stack.Screen
          name="recordatorios"
          options={{
            headerShown: true,
            header: () => <CustomHeader title="Gestión de Recordatorios" onMenuPress={() => setIsPanelOpen(true)} />,
          }}
        />
        <Stack.Screen
          name="adultos-mayores"
          options={{
            headerShown: true,
            header: () => <CustomHeader title="Adultos Mayores" onMenuPress={() => setIsPanelOpen(true)} />,
          }}
        />
        <Stack.Screen
          name="agregar-persona"
          options={{
            headerShown: true,
            header: () => <CustomHeader title="Agregar Persona" onMenuPress={() => setIsPanelOpen(true)} />,
          }}
        />
      </Stack>
      <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </>
  );
}