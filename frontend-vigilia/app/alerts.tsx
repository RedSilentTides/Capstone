import { useRouter } from 'expo-router';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// 💡 Definimos los tipos de alerta
type AlertType = 'info' | 'warning' | 'error' | 'success';

interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface AlertCardProps {
  alert: AlertItem;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

// Configuración de colores según tipo de alerta
const alertConfig: Record<AlertType, { color: string }> = {
  info: { color: '#3b82f6' },
  warning: { color: '#f59e0b' },
  error: { color: '#ef4444' },
  success: { color: '#10b981' },
};

// ✅ Componente individual de alerta
function AlertCard({ alert, onMarkAsRead, onDismiss }: AlertCardProps) {
  const config = alertConfig[alert.type];

  const renderIcon = () => {
    switch (alert.type) {
      case 'warning':
      case 'error':
        return <AlertTriangle color={config.color} size={24} style={styles.icon} />;
      case 'success':
        return <CheckCircle color={config.color} size={24} style={styles.icon} />;
      default:
        return <Info color={config.color} size={24} style={styles.icon} />;
    }
  };

  return (
    <View
      style={[
        styles.card,
        { borderColor: !alert.read ? config.color : '#e5e7eb' },
      ]}
    >
      <View style={styles.row}>
        {renderIcon()}
        <View style={styles.cardContent}>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>{alert.title}</Text>
            <Pressable onPress={() => onDismiss(alert.id)}>
              <X color="#6b7280" size={18} />
            </Pressable>
          </View>
          <Text style={styles.message}>{alert.message}</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.timestamp}>
              {alert.timestamp.toLocaleTimeString()}
            </Text>
            {!alert.read && (
              <Pressable
                style={styles.markRead}
                onPress={() => onMarkAsRead(alert.id)}
              >
                <Text style={styles.markReadText}>Marcar como leída</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ✅ Pantalla principal
export default function Alerts() {
  const router = useRouter();

  const [alerts, setAlerts] = useState<AlertItem[]>([
    {
      id: '1',
      type: 'info',
      title: 'Información',
      message: 'Mensaje de prueba',
      timestamp: new Date(),
      read: false,
    },
    {
      id: '2',
      type: 'error',
      title: 'Error',
      message: 'Ha ocurrido un problema',
      timestamp: new Date(),
      read: false,
    },
    {
      id: '3',
      type: 'warning',
      title: 'Advertencia',
      message: 'Revisa esto cuando puedas',
      timestamp: new Date(),
      read: true,
    },
    {
      id: '4',
      type: 'success',
      title: 'Éxito',
      message: 'Operación completada con éxito',
      timestamp: new Date(),
      read: false,
    },
  ]);

  const handleMarkAsRead = (id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
  };

  const handleDismiss = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')}>
          <Image
            source={require('../assets/images/LogoVigilIa2.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Pressable>
        <Text style={styles.titleHeader}>Sistema de Alertas</Text>
      </View>

      {/* Lista de alertas */}
      <ScrollView contentContainerStyle={styles.mainContent}>
        {alerts.length === 0 ? (
          <Text style={styles.noAlerts}>No hay alertas</Text>
        ) : (
          alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onMarkAsRead={handleMarkAsRead}
              onDismiss={handleDismiss}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// -------------------- STYLES --------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  logo: {
    position: 'absolute',
    left: 20,
    top: 25,
    width: 50,
    height: 50,
  },
  titleHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  mainContent: {
    padding: 20,
  },
  noAlerts: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
    marginTop: 40,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    borderWidth: 2,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  icon: {
    marginRight: 10,
    marginTop: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  message: {
    fontSize: 14,
    color: '#374151',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  markRead: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  markReadText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
});
