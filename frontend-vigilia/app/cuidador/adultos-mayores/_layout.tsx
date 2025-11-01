import { Stack } from 'expo-router';

export default function AdultosMayoresLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Usamos CustomHeader en cada pantalla
      }}
    />
  );
}
