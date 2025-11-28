import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { HelpCircle, ChevronDown, ChevronUp, Phone, Mail } from 'lucide-react-native'; 

export default function HelpScreen() { // Renombrado para claridad
  const router = useRouter();
  const [isContactOpen, setIsContactOpen] = useState(false); // Estado para desplegable

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>

      {/* Sección Centro de ayuda (Desplegable) */}
      <View style={styles.section}>
        <Pressable
          style={styles.sectionHeader}
          onPress={() => setIsContactOpen(!isContactOpen)} // Cambia el estado
        >
          <View style={styles.sectionHeaderLeft}>
              <HelpCircle size={20} color="#7c3aed" />
              <Text style={styles.sectionHeaderText}>Contacto de Soporte</Text>
          </View>
          {/* Muestra flecha arriba o abajo según el estado */}
          {isContactOpen ? <ChevronUp size={20} color="#6b7280"/> : <ChevronDown size={20} color="#6b7280"/>}
        </Pressable>

        {/* Contenido Desplegable */}
        {isContactOpen && (
          <View style={styles.sectionContent}>
            <View style={styles.contactRow}>
                <Phone size={16} color="#4b5563"/>
                <Text style={styles.contactText}>Teléfono 1: +56 9 1234 5678</Text>
            </View>
             <View style={styles.contactRow}>
                <Phone size={16} color="#4b5563"/>
                <Text style={styles.contactText}>Teléfono 2: +56 2 2345 6789</Text>
            </View>
             <View style={styles.contactRow}>
                <Phone size={16} color="#4b5563"/>
                <Text style={styles.contactText}>Teléfono 3: +56 2 3456 7890</Text>
            </View>
            <View style={styles.contactRow}>
                <Mail size={16} color="#4b5563"/>
                <Text style={styles.contactText}>Correo: soporte@vigilia.com</Text>
            </View>
          </View>
        )}
      </View>
      
      {/* Podrías añadir más secciones aquí, como "Preguntas Frecuentes (FAQ)" */}
      {/* <View style={styles.section}>
          <View style={styles.sectionHeader}> // Sin onPress si no es desplegable
              <Text style={styles.sectionHeaderText}>Preguntas Frecuentes</Text>
          </View>
          <View style={styles.sectionContent}>
              <Text style={styles.faqQuestion}>¿Cómo configuro mi dispositivo?</Text>
              <Text style={styles.faqAnswer}>Consulta nuestro manual en línea...</Text>
              // ... más preguntas ...
          </View>
      </View>
      */}

      </ScrollView>
    </View>
  );
}

// Estilos actualizados para consistencia
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb", // Fondo general
  },
  section: {
    borderRadius: 8,
    backgroundColor: "#fff",
    marginHorizontal: 16, // Márgenes laterales
    marginTop: 20, // Espacio entre secciones
    shadowColor: "#000", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 2,
    borderWidth: 1, borderColor: '#e5e7eb', // Borde sutil
    overflow: 'hidden', // Asegura que el borde redondeado se aplique al contenido
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14, // Padding vertical
    paddingHorizontal: 16, // Padding horizontal
    backgroundColor: "#f3f4f6", // Fondo ligeramente diferente para el header
  },
   sectionHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10, // Espacio entre icono y texto
  },
  sectionHeaderText: {
    fontSize: 17, // Ligeramente más pequeño que el título principal
    fontWeight: "600", // Semi-bold
    color: '#1f2937',
  },
  sectionContent: {
    paddingVertical: 15, // Padding arriba/abajo
    paddingHorizontal: 20, // Padding a los lados (un poco más)
    flexDirection: "column",
    gap: 12, // Espacio entre líneas de contacto
    borderTopWidth: 1, // Línea separadora
    borderTopColor: '#e5e7eb',
  },
  contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
  },
  contactText: {
      fontSize: 15,
      color: '#374151', // Gris oscuro
      flexShrink: 1, // Permite que el texto se ajuste
  },
   faqQuestion: {
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
      color: '#111827',
  },
   faqAnswer: {
      fontSize: 14,
      color: '#4b5563',
      marginBottom: 12, // Espacio entre preguntas
  },
});