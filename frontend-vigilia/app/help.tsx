import React, { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";

export default function Help() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/")}>
          <Image
            source={require("../assets/images/LogoVigilIa.png")}
            style={styles.logo}
          />
        </Pressable>
        <Text style={styles.title}>Ayuda</Text>
      </View>

      {/* Sección Centro de ayuda */}
      <View style={styles.helpSection}>
        <Pressable
          style={styles.helpHeaderSection}
          onPress={() => setIsOpen(!isOpen)}
        >
          <Text style={styles.headerText}>Centro de ayuda</Text>
          <Text style={styles.headerText}>{isOpen ? "▲" : "▼"}</Text>
        </Pressable>

        {isOpen && (
          <View style={styles.helpContent}>
            <Text>📞 Teléfono 1: +56 9 1234 5678</Text>
            <Text>📞 Teléfono 2: +56 2 2345 6789</Text>
            <Text>📞 Teléfono 3: +56 2 3456 7890</Text>
            <Text>✉️ Correo: soporte@vigilia.com</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
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
    borderRadius: 8,
    marginBottom: 20,
  },
  logo: {
    position: "absolute",
    left: -135,
    top: -20,
    height: 40,
    width: 40,
    resizeMode: "contain",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  helpSection: {
    borderRadius: 8,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  helpHeaderSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f9fafb",
  },
  headerText: {
    fontSize: 18,
    fontWeight: "600",
  },
  helpContent: {
    padding: 16,
    flexDirection: "column",
    gap: 8,
  },
});
