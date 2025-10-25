import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Menu, Info, AlertTriangle, CheckCircle } from 'lucide-react-native';
import SlidingPanel from './Slidingpanel';


// Tipos de alerta
type AlertType = 'info' | 'warning' | 'error' | 'success';

interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

// Datos de alertas
const alertsData: AlertItem[] = [
  { id: '1', type: 'info', title: 'Información', message: 'Mensaje de prueba', timestamp: new Date(), read: false },
  { id: '2', type: 'error', title: 'Error', message: 'Ha ocurrido un problema', timestamp: new Date(), read: false },
  { id: '3', type: 'warning', title: 'Advertencia', message: 'Revisa esto cuando puedas', timestamp: new Date(), read: true },
  { id: '4', type: 'success', title: 'Éxito', message: 'Operación completada con éxito', timestamp: new Date(), read: false },
];

// Detalle de los planes
const planDetails = {
  basico: ['Reconocimiento de imagen', 'Recordatorios', 'Alertas'],
  plus: ['Todo Plan Básico', 'Acelerómetro', 'Giroscopio', 'Reportería'],
  premium: [
    'Todo Plan Plus+',
    'Monitoreo Inteligente',
    'Sensor de movimiento',
    'Sensor de temperatura',
    'Contador de pasos',
  ],
};

// Configuración de colores
const alertConfig: Record<AlertType, { color: string }> = {
  info: { color: '#3b82f6' },
  warning: { color: '#f59e0b' },
  error: { color: '#ef4444' },
  success: { color: '#10b981' },
};

// Componente de tarjeta de alerta
function AlertCard({ alert, preview }: { alert: AlertItem; preview?: boolean }) {
  const config = alertConfig[alert.type];

  const renderIcon = () => {
    switch (alert.type) {
      case 'warning':
      case 'error':
        return <AlertTriangle color={config.color} size={22} style={{ marginRight: 10 }} />;
      case 'success':
        return <CheckCircle color={config.color} size={22} style={{ marginRight: 10 }} />;
      default:
        return <Info color={config.color} size={22} style={{ marginRight: 10 }} />;
    }
  };

  return (
    <View
      style={[
        styles.card,
        preview && styles.previewCard,
        { borderColor: !alert.read ? config.color : '#e5e7eb' },
      ]}
    >
      <View style={styles.row}>
        {renderIcon()}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{alert.title}</Text>
          <Text style={styles.cardMessage}>{alert.message}</Text>
        </View>
      </View>
    </View>
  );
}

// Componente principal (Home)
function Home() {
  const router = useRouter();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const previewAlerts = alertsData.slice(0, 2);

  return (
    <View style={styles.container}>
      {/* Botón de menú */}
      {!isPanelOpen && (
        <Pressable style={styles.menuButton} onPress={() => setIsPanelOpen(true)}>
          <Menu size={28} color="#111827" />
        </Pressable>
      )}

      {/* Panel lateral */}
      {isPanelOpen && <SlidingPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />}

      {/* Contenido principal */}
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.hero}>
          <Bell size={42} color="white" />
          <Text style={styles.heroTitle}>VigilIA</Text>
          <Text style={styles.heroSubtitle}>Planes imperdibles, tranquilidad para tu familia</Text>

          {/* Opciones de planes */}
          <View style={styles.planOptions}>
            {['basico', 'plus', 'premium'].map((plan) => (
              <Pressable
                key={plan}
                style={[styles.option, openPlan === plan && styles.optionActive]}
                onPress={() => setOpenPlan(openPlan === plan ? null : plan)}
              >
                <Text style={styles.optionIcon}>
                  {plan === 'basico' ? '🟢' : plan === 'plus' ? '⭐' : '💎'}
                </Text>
                <Text style={styles.optionText}>
                  {plan === 'basico' ? 'Plan Básico' : plan === 'plus' ? 'Plan Plus+' : 'Plan Premium'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Lista de beneficios */}
          {openPlan && (
            <View style={styles.planDropdown}>
              {planDetails[openPlan as keyof typeof planDetails].map((item, idx) => (
                <Text key={idx} style={styles.planItem}>
                  • {item}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Botón para alertas */}
        <Pressable style={styles.alertButton} onPress={() => router.push('/alerts')}>
          <Bell size={18} color="white" style={{ marginRight: 8 }} />
          <Text style={styles.alertButtonText}>Ver todas las alertas</Text>
        </Pressable>

        {/* Vista previa de alertas */}
        <View style={styles.alertsPreview}>
          {previewAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} preview />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export default function App() {
  return <Home />;
}

// ------------------ ESTILOS ------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContainer: { paddingBottom: 40 },
  menuButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderRadius: 8,
  },
  hero: {
    backgroundColor: '#2563eb',
    paddingVertical: 40,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  heroTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 10,
  },
  heroSubtitle: {
    color: 'white',
    fontSize: 16,
    marginTop: 4,
  },
  planOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  option: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  optionActive: {
    backgroundColor: '#fbbf24',
  },
  optionIcon: { fontSize: 22, marginBottom: 4 },
  optionText: { fontWeight: '600', fontSize: 14 },
  planDropdown: {
    marginTop: 10,
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 12,
  },
  planItem: { fontSize: 14, marginVertical: 2 },
  alertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 12,
  },
  alertButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  alertsPreview: { marginTop: 20, paddingHorizontal: 20 },
  card: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  previewCard: { opacity: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontWeight: '600', fontSize: 16, marginBottom: 2 },
  cardMessage: { fontSize: 14, color: '#4b5563' },
});
