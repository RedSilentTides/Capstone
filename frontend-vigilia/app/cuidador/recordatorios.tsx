import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable,
    Platform, Image, Button, TextInput, Modal, FlatList
} from 'react-native';
import { useRouter } from 'expo-router';
import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlusCircle, Calendar, Clock, Repeat, Trash2, Edit2 } from 'lucide-react-native';
// Descomenta si instalaste el Date Time Picker
// import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
// Descomenta si instalaste el Picker Select
// import RNPickerSelect from 'react-native-picker-select';

// URL de tu API backend
const API_URL = 'https://api-backend-687053793381.southamerica-west1.run.app';

// Tipos (sin cambios)
interface Recordatorio {
  id: number;
  adulto_mayor_id: number;
  titulo: string;
  descripcion?: string | null;
  fecha_hora_programada: string;
  frecuencia: 'una_vez' | 'diario' | 'semanal' | 'mensual';
  estado?: string;
  fecha_creacion?: string;
}
interface ReminderFormData {
    id?: number;
    titulo: string;
    descripcion: string;
    fecha_hora_programada: Date;
    frecuencia: 'una_vez' | 'diario' | 'semanal' | 'mensual';
    adulto_mayor_id: number | null;
}
// Tipo para la lista de adultos mayores (simplificado)
interface AdultoMayorSimple {
    id: number;
    nombre_completo: string;
}


export default function RecordatoriosScreen() {
  const router = useRouter();
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentReminder, setCurrentReminder] = useState<Partial<ReminderFormData>>({});

  // Estado para adultos mayores y selección
  const [adultosMayores, setAdultosMayores] = useState<AdultoMayorSimple[]>([]); // Lista vacía inicialmente
  const [selectedAdultoMayorId, setSelectedAdultoMayorId] = useState<number | null>(null);

  // Estado para el DatePicker (si lo usas)
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Función reutilizable para obtener el token
  const getToken = useCallback(async (): Promise<string | null> => {
    const tokenKey = 'userToken';
     if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(tokenKey);
    } else {
      return await SecureStore.getItemAsync(tokenKey);
    }
  }, []);

  // --- Funciones API ---

  // Obtener la lista de adultos mayores asociados al cuidador
  const fetchAdultosMayores = useCallback(async () => {
      const token = await getToken();
      if (!token) return; // No hacer nada si no hay token

      try {
          console.log("Obteniendo lista de adultos mayores...");
          // --- LLAMADA API REAL (NECESITA ENDPOINT GET /adultos-mayores/mios) ---
          // Este endpoint debería devolver [{id: 1, nombre_completo: '...'}, ...]
          // const response = await axios.get<AdultoMayorSimple[]>(`${API_URL}/adultos-mayores/mios`, {
          //     headers: { Authorization: `Bearer ${token}` },
          // });
          // setAdultosMayores(response.data);

          // *** DATOS DE EJEMPLO POR AHORA ***
          const ejemploAM: AdultoMayorSimple[] = [{id: 1, nombre_completo: 'Abuela María'}];
          setAdultosMayores(ejemploAM);

          // Seleccionar el primero por defecto si no hay uno seleccionado
          if (!selectedAdultoMayorId && ejemploAM.length > 0) {
              setSelectedAdultoMayorId(ejemploAM[0].id);
              console.log(`Adulto mayor por defecto seleccionado: ${ejemploAM[0].id}`);
          } else if (ejemploAM.length === 0) {
              setSelectedAdultoMayorId(null); // No hay a quién asignar
          }
          console.log(`Adultos mayores obtenidos: ${ejemploAM.length}`);

      } catch (err) {
           console.error('Error al obtener adultos mayores:', err);
           setError('No se pudo cargar la lista de personas cuidadas.');
           // Manejo de error de sesión...
      }
  }, [getToken, selectedAdultoMayorId]);


  // Obtener los recordatorios
  const fetchRecordatorios = useCallback(async () => {
    // Solo busca si hay un adulto mayor seleccionado
    if (!selectedAdultoMayorId) {
        setRecordatorios([]); // Vacía la lista si no hay nadie seleccionado
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { router.replace('/login'); return; }

    try {
      console.log(`Obteniendo recordatorios para adulto_mayor_id: ${selectedAdultoMayorId}...`);
      // --- LLAMADA API REAL ---
      const response = await axios.get<Recordatorio[]>(`${API_URL}/recordatorios`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { adulto_mayor_id: selectedAdultoMayorId } // Filtramos por el adulto mayor seleccionado
      });
      setRecordatorios(response.data);
      console.log(`Recordatorios obtenidos: ${response.data.length}`);
    } catch (err) {
      console.error('Error al obtener recordatorios:', err);
      setError('No se pudo cargar la lista de recordatorios.');
      // Manejo error sesión expirada...
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
         setTimeout(() => router.replace('/login'), 1500);
      }
    } finally {
      setIsLoading(false);
    }
  // Dependemos ahora de selectedAdultoMayorId para re-buscar si cambia
  }, [getToken, router, selectedAdultoMayorId]);


  const handleAddOrUpdateReminder = async () => {
     if (!currentReminder.titulo || !currentReminder.fecha_hora_programada || !selectedAdultoMayorId) {
         Alert.alert('Error', 'Completa Título, Fecha/Hora y selecciona una persona.');
         return;
     }
     
     const token = await getToken();
     if (!token) { router.replace('/login'); return; }

     const dataToSend = {
         titulo: currentReminder.titulo,
         descripcion: currentReminder.descripcion || null, // Enviar null si está vacío
         adulto_mayor_id: selectedAdultoMayorId,
         fecha_hora_programada: currentReminder.fecha_hora_programada.toISOString(), // Enviar como string ISO
         frecuencia: currentReminder.frecuencia ?? 'una_vez', // Asegurar que tenga valor
     };

     setIsLoading(true); // Mostrar indicador mientras guarda

     try {
         if (isEditing && currentReminder.id) {
             console.log('Actualizando recordatorio:', currentReminder.id);
             // --- LLAMADA API REAL ---
             await axios.put(`${API_URL}/recordatorios/${currentReminder.id}`, dataToSend, { 
                 headers: { Authorization: `Bearer ${token}` } 
             });
             Alert.alert('Éxito', 'Recordatorio actualizado.');
         } else {
             console.log('Creando nuevo recordatorio...');
             // --- LLAMADA API REAL ---
             await axios.post(`${API_URL}/recordatorios`, dataToSend, { 
                 headers: { Authorization: `Bearer ${token}` } 
             });
              Alert.alert('Éxito', 'Recordatorio creado.');
         }
         setModalVisible(false); 
         fetchRecordatorios(); // Recarga la lista (ya no estará isLoading)
     } catch (err) {
         console.error('Error al guardar recordatorio:', err);
         const errorMsg = axios.isAxiosError(err) ? err.response?.data?.detail || err.message : 'Error desconocido';
         Alert.alert('Error', `No se pudo guardar el recordatorio: ${errorMsg}`);
         setIsLoading(false); // Quitar indicador si falla
         // Manejo de error de sesión...
     }
      // No ponemos finally setIsLoading(false) aquí porque fetchRecordatorios lo hará
  };
  
  const handleDeleteReminder = async (id: number) => {
       const token = await getToken();
       if (!token) { router.replace('/login'); return; }

       Alert.alert(
           "Confirmar Eliminación",
           "¿Estás seguro de que quieres eliminar este recordatorio?",
           [
               { text: "Cancelar", style: "cancel" },
               { text: "Eliminar", style: "destructive", onPress: async () => {
                    setIsLoading(true); // Mostrar indicador
                   try {
                       console.log('Eliminando recordatorio:', id);
                       // --- LLAMADA API REAL ---
                       await axios.delete(`${API_URL}/recordatorios/${id}`, { 
                           headers: { Authorization: `Bearer ${token}` } 
                       });
                       Alert.alert('Éxito', 'Recordatorio eliminado.');
                       fetchRecordatorios(); // Recarga la lista
                   } catch (err) {
                       console.error('Error al eliminar recordatorio:', err);
                       const errorMsg = axios.isAxiosError(err) ? err.response?.data?.detail || err.message : 'Error desconocido';
                       Alert.alert('Error', `No se pudo eliminar el recordatorio: ${errorMsg}`);
                       setIsLoading(false); // Quitar indicador si falla
                       // Manejo de error de sesión...
                   }
               }}
           ]
       );
  };


  // Abrir modal para crear
  const openAddModal = () => {
      // Asegurarse que haya un adulto mayor seleccionado
      if (!selectedAdultoMayorId) {
          Alert.alert("Selección Requerida", "Por favor, selecciona primero a la persona para añadirle un recordatorio.");
          // Aquí deberías tener una forma de seleccionar/añadir adultos mayores si la lista está vacía
          return;
      }
      setCurrentReminder({ 
          titulo: '',
          descripcion: '',
          fecha_hora_programada: new Date(),
          frecuencia: 'una_vez',
          adulto_mayor_id: selectedAdultoMayorId, // Pre-rellena con el actual
      });
      setIsEditing(false);
      setModalVisible(true);
  };

  // Abrir modal para editar
  const openEditModal = (reminder: Recordatorio) => {
      setCurrentReminder({
          id: reminder.id,
          titulo: reminder.titulo,
          descripcion: reminder.descripcion || '',
          fecha_hora_programada: new Date(reminder.fecha_hora_programada), // Convertir string a Date
          frecuencia: reminder.frecuencia,
          adulto_mayor_id: reminder.adulto_mayor_id,
      });
      // Asegura que el selector muestre el adulto mayor correcto (si hay varios)
      setSelectedAdultoMayorId(reminder.adulto_mayor_id); 
      setIsEditing(true);
      setModalVisible(true);
  };

  // Cargar lista de adultos mayores y luego recordatorios al montar
  useEffect(() => {
    fetchAdultosMayores().then(() => {
        // fetchRecordatorios se llamará automáticamente si selectedAdultoMayorId cambia
        // Pero lo llamamos una vez aquí por si ya había uno seleccionado
        if(selectedAdultoMayorId) fetchRecordatorios();
        else setIsLoading(false); // Si no hay AM, terminamos la carga inicial
    });
  }, [fetchAdultosMayores]); // Solo depende de la función

  // Efecto para recargar recordatorios cuando cambia el adulto mayor seleccionado
  useEffect(() => {
      if (selectedAdultoMayorId !== null) {
          fetchRecordatorios();
      } else {
           setRecordatorios([]); // Limpiar lista si no hay AM seleccionado
      }
  }, [selectedAdultoMayorId, fetchRecordatorios]);


  // Handler para el DatePicker (si lo usas)
  // const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
  //   const currentDate = selectedDate || currentReminder.fecha_hora_programada || new Date();
  //   setShowDatePicker(false); // Oculta el picker
  //   setCurrentReminder(prev => ({ ...prev, fecha_hora_programada: currentDate }));
  // };

  // --- Renderizado ---
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Image source={require('../assets/images/LogoVigilIa2.png')} style={styles.logo} resizeMode="contain"/>
        </Pressable>
        <Text style={styles.titleHeader}>Recordatorios</Text>
        <Pressable onPress={openAddModal} style={styles.addButton} disabled={!selectedAdultoMayorId}>
            <PlusCircle size={28} color={selectedAdultoMayorId ? "white" : "#a5b4fc"} /> 
            {/* Botón deshabilitado si no hay AM */}
        </Pressable>
      </View>

      {/* Selector de Adulto Mayor */}
      <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Recordatorios para:</Text>
          {adultosMayores.length === 0 ? (
              <Text style={styles.pickerValue}> (No hay personas cuidadas) </Text>
          ) : (
              /* Reemplaza este Text con tu componente RNPickerSelect */
              <Text style={styles.pickerValue}> 
                  {adultosMayores.find(am => am.id === selectedAdultoMayorId)?.nombre_completo ?? 'Selecciona...'} 
              </Text>
              /* <RNPickerSelect
                  value={selectedAdultoMayorId}
                  onValueChange={(value) => setSelectedAdultoMayorId(value)}
                  items={adultosMayores.map(am => ({ label: am.nombre_completo, value: am.id }))}
                  placeholder={{ label: "Selecciona una persona...", value: null }}
                  style={pickerSelectStyles} 
              /> */
          )}
      </View>


      {/* Lista de Recordatorios */}
      {isLoading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color="#1e3a8a" /></View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Reintentar" onPress={fetchRecordatorios} />
        </View>
      ) : (
        <FlatList
          data={recordatorios} // Ya no filtramos aquí, fetch lo hace por selectedAdultoMayorId
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.reminderCard}>
              <View style={{flex: 1, marginRight: 10}}> {/* Ocupa espacio disponible */}
                <Text style={styles.reminderTitle}>{item.titulo}</Text>
                {item.descripcion && <Text style={styles.reminderDesc}>{item.descripcion}</Text>}
                <View style={styles.reminderRow}>
                    <Calendar size={14} color="#6b7280"/> 
                    <Text style={styles.reminderDetailText}>{new Date(item.fecha_hora_programada).toLocaleDateString()}</Text>  
                </View>
                 <View style={styles.reminderRow}>
                    <Clock size={14} color="#6b7280"/> 
                    <Text style={styles.reminderDetailText}>{new Date(item.fecha_hora_programada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                 </View>
                 <View style={styles.reminderRow}>
                    <Repeat size={14} color="#6b7280"/> 
                    <Text style={styles.reminderDetailText}>{item.frecuencia.replace('_', ' ')}</Text> {/* Muestra más legible */}
                 </View>
              </View>
              <View style={styles.reminderActions}>
                  <Pressable onPress={() => openEditModal(item)}><Edit2 size={22} color="#3b82f6"/></Pressable>
                  <Pressable onPress={() => handleDeleteReminder(item.id)}><Trash2 size={22} color="#ef4444"/></Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.noReminders}>
              {selectedAdultoMayorId ? 'No hay recordatorios para esta persona.' : 'Selecciona una persona para ver sus recordatorios.'}
              </Text>}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* --- Modal para Añadir/Editar Recordatorio --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isEditing ? 'Editar Recordatorio' : 'Nuevo Recordatorio'}</Text>
            
             <Text style={styles.modalLabel}>Para:</Text>
             {/* Reemplaza con RNPickerSelect si tienes varios AM */}
              <Text style={styles.modalInfo}> {adultosMayores.find(am => am.id === selectedAdultoMayorId)?.nombre_completo} </Text> 

            <Text style={styles.modalLabel}>Título *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Tomar pastilla azul"
              value={currentReminder.titulo || ''}
              onChangeText={(text) => setCurrentReminder(prev => ({...prev, titulo: text}))}
            />
            
            <Text style={styles.modalLabel}>Descripción (Opcional):</Text>
            <TextInput
              style={[styles.modalInput, styles.textArea]}
              placeholder="Ej: Con el desayuno"
              value={currentReminder.descripcion || ''}
              onChangeText={(text) => setCurrentReminder(prev => ({...prev, descripcion: text}))}
              multiline
            />

            <Text style={styles.modalLabel}>Fecha y Hora *</Text>
            {/* Botón para abrir el DatePicker */}
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                <Text>
                    {(currentReminder.fecha_hora_programada ?? new Date()).toLocaleString([], {
                        year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                </Text>
            </Pressable>
            {/* El DatePicker (se muestra condicionalmente) */}
            {/* {showDatePicker && (
                 <DateTimePicker 
                    value={currentReminder.fecha_hora_programada ?? new Date()} 
                    mode="datetime" 
                    display="default" // o 'spinner', 'calendar', 'clock'
                    onChange={onDateChange} 
                />
            )} */}


            <Text style={styles.modalLabel}>Frecuencia *</Text>
            {/* Reemplaza con RNPickerSelect */}
             <Text style={styles.modalInfo}> {currentReminder.frecuencia?.replace('_', ' ')} </Text>
             {/* <RNPickerSelect
                 value={currentReminder.frecuencia}
                 onValueChange={(value) => setCurrentReminder(prev => ({...prev, frecuencia: value as any}))}
                 items={[
                     { label: 'Sólo una vez', value: 'una_vez' },
                     { label: 'Diariamente', value: 'diario' },
                     { label: 'Semanalmente', value: 'semanal' },
                     { label: 'Mensualmente', value: 'mensual' },
                 ]}
                 style={pickerSelectStyles} 
                 placeholder={{}} // Sin placeholder aquí
             /> */}

            <View style={styles.modalButtons}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={isEditing ? "Guardar Cambios" : "Crear Recordatorio"} 
                onPress={handleAddOrUpdateReminder} 
                disabled={isLoading} // Deshabilita mientras guarda
              />
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// --- Estilos --- (Añadimos/ajustamos estilos para modal y componentes)
const styles = StyleSheet.create({
  // ... (estilos de container, centerContainer, errorText, header, logo, titleHeader se mantienen) ...
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  header: {
    position: 'relative',        
    flexDirection: 'row', 
    alignItems: 'center',        
    justifyContent: 'center', 
    backgroundColor: '#8b5cf6', 
    paddingVertical: 15, 
    paddingHorizontal: 15,
  },
  logo: { width: 40, height: 40, position: 'absolute', left: 15, top: 15 },   
  titleHeader: { fontSize: 22, fontWeight: 'bold', color: 'white', textAlign: 'center' }, 
  addButton: { position: 'absolute', right: 15, top: 18 }, 
  pickerContainer: { 
      padding: 15, 
      backgroundColor: '#e5e7eb',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#d1d5db',
  },
   pickerLabel: {
      fontSize: 16,
      color: '#4b5563',
  },
   pickerValue: { // Estilo para el Text mientras no usas Picker
      fontSize: 16,
      fontWeight: '600',
  },
  listContent: { paddingVertical: 20, paddingHorizontal: 15 }, // Ajuste padding
  noReminders: { textAlign: 'center', color: '#6b7280', fontSize: 16, marginTop: 40 },
  reminderCard: {
    backgroundColor: 'white', borderRadius: 8, padding: 15, marginBottom: 15,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  reminderTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 5}, // Ligeramente más grande
  reminderDesc: { fontSize: 14, color: '#4b5563', marginBottom: 8},
  reminderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 }, // Para icono y texto
  reminderDetailText: { fontSize: 13, color: '#6b7280', marginLeft: 5 }, // Texto al lado del icono
  reminderActions: { flexDirection: 'row', gap: 18, paddingTop: 5, alignItems: 'center' }, 

  // Modal Styles
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalContent: { width: '90%', maxWidth: 400, backgroundColor: 'white', borderRadius: 10, padding: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 25, textAlign: 'center', color: '#1e3a8a' },
  modalLabel: { fontSize: 16, color: '#374151', marginBottom: 6, marginTop: 12, fontWeight: '500' },
   modalInfo: { // Para mostrar info no editable como el nombre del AM
      fontSize: 16, 
      marginBottom: 10, 
      paddingVertical: 10, 
      color: '#4b5563'
  },
  modalInput: { backgroundColor: '#f9fafb', height: 45, borderColor: '#d1d5db', borderWidth: 1, borderRadius: 8, marginBottom: 10, paddingHorizontal: 10, fontSize: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  dateButton: { // Estilo para el botón que abre el DatePicker
      backgroundColor: '#f9fafb', height: 45, borderColor: '#d1d5db', borderWidth: 1,
      borderRadius: 8, marginBottom: 10, paddingHorizontal: 10, justifyContent: 'center'
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 30 },
});

// Estilos para RNPickerSelect (si lo usas) - Ejemplo
/* const pickerSelectStyles = StyleSheet.create({
  inputIOS: { fontSize: 16, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, color: 'black', paddingRight: 30, backgroundColor: '#f9fafb', marginBottom: 10 },
  inputAndroid: { fontSize: 16, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, color: 'black', paddingRight: 30, backgroundColor: '#f9fafb', marginBottom: 10 },
  // Añade estilos para el contenedor del picker si es necesario
}); */