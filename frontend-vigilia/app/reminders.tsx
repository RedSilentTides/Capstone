import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  ScrollView,
  StyleSheet,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";

export default function Reminders() {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [newReminder, setNewReminder] = useState<string>("");
  const [remindersList, setRemindersList] = useState<string[]>([]);
  const [selectedReminders, setSelectedReminders] = useState<string[]>([]);

  const handleAddReminder = () => {
    if (newReminder.trim() === "") return;
    setRemindersList([...remindersList, newReminder.trim()]);
    setNewReminder("");
  };

  const handleSelect = (reminder: string) => {
    if (selectedReminders.includes(reminder)) {
      setSelectedReminders(selectedReminders.filter((r) => r !== reminder));
    } else {
      setSelectedReminders([...selectedReminders, reminder]);
    }
  };

  const handleDelete = (reminder: string) => {
    setRemindersList(remindersList.filter((r) => r !== reminder));
    setSelectedReminders(selectedReminders.filter((r) => r !== reminder));
  };

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
        <Text style={styles.title}>Recordatorios</Text>
      </View>

      {/* Sección Personalizar */}
      <View style={styles.personalizeSection}>
        <Pressable
          style={styles.personalizeHeader}
          onPress={() => setIsOpen(!isOpen)}
        >
          <Text style={styles.headerText}>Personalizar recordatorios</Text>
          <Text style={styles.headerText}>{isOpen ? "▲" : "▼"}</Text>
        </Pressable>

        {isOpen && (
          <View style={styles.personalizeContent}>
            <Text>Nuevo recordatorio:</Text>
            <TextInput
              placeholder="Escribe tu recordatorio"
              value={newReminder}
              onChangeText={setNewReminder}
              style={styles.input}
            />
            <Pressable style={styles.btnSuccess} onPress={handleAddReminder}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Agregar</Text>
            </Pressable>

            {remindersList.length > 0 && (
              <FlatList
                data={remindersList}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <View style={styles.reminderItem}>
                    <Pressable onPress={() => handleSelect(item)}>
                      <Text style={{ fontSize: 18 }}>
                        {selectedReminders.includes(item) ? "☑️" : "⬜"}
                      </Text>
                    </Pressable>
                    <Text style={styles.reminderText}>{item}</Text>
                    <Pressable onPress={() => handleDelete(item)}>
                      <Text style={styles.btnDelete}>❌</Text>
                    </Pressable>
                  </View>
                )}
              />
            )}
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
    left: -98,
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
  personalizeSection: {
    borderRadius: 8,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  personalizeHeader: {
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
  personalizeContent: {
    flexDirection: "column",
    padding: 16,
    gap: 12,
  },
  input: {
    width: "100%",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    fontSize: 16,
    marginBottom: 8,
  },
  btnSuccess: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  reminderItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  reminderText: {
    flex: 1,
    fontSize: 16,
  },
  btnDelete: {
    color: "#ef4444",
    fontSize: 18,
  },
});
