import React from 'react';
import { Stack, useRouter } from 'expo-router';
import CustomHeader from '../../components/CustomHeader'; // La ruta ahora sube un nivel

export default function AppLayout() {
  const router = useRouter();

  return (
    <Stack>
      {/* Pantallas principales de la app */}
      <Stack.Screen
        name="index"
        options={{
          header: () => <CustomHeader title="VigilIA Dashboard" onMenuPress={() => router.push('/panel')} />,
        }}
      />
      <Stack.Screen
        name="perfil"
        options={{
          header: () => <CustomHeader title="Mi Perfil" onMenuPress={() => router.push('/panel')} />,
        }}
      />
      <Stack.Screen
        name="ayuda"
        options={{
          header: () => <CustomHeader title="Ayuda" onMenuPress={() => router.push('/panel')} />,
        }}
      />
      <Stack.Screen
        name="configuracion"
        options={{
          header: () => <CustomHeader title="Configuración" onMenuPress={() => router.push('/panel')} />,
        }}
      />
      <Stack.Screen
        name="solicitudes"
        options={{
          header: () => <CustomHeader title="Solicitudes" onMenuPress={() => router.push('/panel')} />,
        }}
      />
      <Stack.Screen
        name="editar-perfil"
        options={{
          header: () => <CustomHeader title="Editar Perfil" onMenuPress={() => router.push('/panel')} showBackButton={true} />,
        }}
      />
      <Stack.Screen name="cuidador" options={{ headerShown: false }} />

      {/* Pantalla del Panel, que ahora es una ruta normal dentro de este grupo */}
      <Stack.Screen
        name="panel"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          animation: 'slide_from_left',
        }}
      />
    </Stack>
  );
}
