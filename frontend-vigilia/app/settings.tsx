import React, { useState } from "react";
import { View, Text, TextInput, Image, Pressable, ScrollView, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";

export default function Settings() {
  const router = useRouter();

  const fields = [
    "Hora de levantarse",
    "Hora de desayunar",
    "Hora de almorzar",
    "Hora de cenar",
    "Hora de dormir",
    "Medicamentos",
    "Actividad física",
    "Visitas",
    "Chequeos médicos",
    "Control de hidratación",
  ];

  // Para guardar los valores de cada input
  const [values, setValues] = useState(Array(fields.length).fill(""));

    const handleChange = (text: string, index: number) => {
    const newValues = [...values];
    newValues[index] = text;
    setValues(newValues);
    };


  const handleSave = () => {
    Alert.alert("Cambios guardados correctamente ✅");
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/")}>
          <Image source={require("../assets/images/LogoVigilIa.png")} style={styles.logo} />
        </Pressable>
        <Text style={styles.title}>Configuración</Text>
      </View>

      {/* Contenido */}
      <View style={styles.content}>
        {fields.map((label, index) => (
          <View style={styles.inputGroup} key={index}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              placeholder={`Ingresa ${label.toLowerCase()}`}
              value={values[index]}
              onChangeText={(text) => handleChange(text, index)}
            />
          </View>
        ))}

        <Pressable style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Guardar cambios</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8b5cf6",
    paddingVertical: 24,
    paddingHorizontal: 16,
    position: "relative",
    marginBottom: 16,
  },
  logo: {
    position: 'absolute',
    left: -100,
    top: -25,
    width: 50,
    height: 50,
  },   
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  content: {
    flex: 1,
    gap: 16, // funciona en RN >= 0.70, sino usar marginBottom
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    padding: 10,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  button: {
    backgroundColor: "#22c55e",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 6,
    marginTop: 12,
    alignSelf: "flex-start",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
