import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Image, StyleSheet, Alert } from "react-native";
import { User, Phone, Mail, RefreshCcw, Trash2, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import { ReactNode } from "react";

interface MenuItemProps {
  icon: ReactNode;
  text: string;
  children?: ReactNode;
  open: boolean;
  onPress: () => void;
}


function MenuItem({ icon, text, children, open, onPress }: MenuItemProps) {
  return (
    <View style={styles.menuItem}>
      <Pressable onPress={onPress} style={styles.menuLeft}>
        {icon}
        <Text style={styles.menuText}>{text}</Text>
        <ChevronRight size={18} color="#9ca3af" style={[styles.chevron, open && styles.chevronOpen]} />
      </Pressable>
      {open && <View style={styles.dropdown}>{children}</View>}
    </View>
  );
}

export default function Profile() {
  const router = useRouter();
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const handleConfirm = (type: string) => Alert.alert(`${type} confirmada ✅`);
  const handleDelete = () => Alert.alert("Cuenta eliminada ✅");

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
        <View style={styles.header}>
        <Pressable onPress={() => router.push("/")}>
            <Image source={require("../assets/images/LogoVigilIa2.png")} style={styles.logo} />
        </Pressable>

        {/* Contenedor central */}
        <View style={styles.headerCenter}>
            <User size={28} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.title}>Mi Perfil</Text>
        </View>
        </View>


      {/* Menu */}
      <View style={styles.menu}>
        <MenuItem
          icon={<Phone size={20} color="#000" />}
          text="Número de teléfono"
          open={openPanel === "phone"}
          onPress={() => setOpenPanel(openPanel === "phone" ? null : "phone")}
        >
          <TextInput
            style={styles.input}
            placeholder="Ingresa tu número"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Pressable style={styles.button} onPress={() => handleConfirm("Número")}>
            <Text style={styles.buttonText}>Confirmar número</Text>
          </Pressable>
        </MenuItem>

        <MenuItem
          icon={<Mail size={20} color="#000" />}
          text="Correo electrónico"
          open={openPanel === "mail"}
          onPress={() => setOpenPanel(openPanel === "mail" ? null : "mail")}
        >
          <TextInput
            style={styles.input}
            placeholder="Ingresa tu correo"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />
          <Pressable style={styles.button} onPress={() => handleConfirm("Correo")}>
            <Text style={styles.buttonText}>Confirmar correo</Text>
          </Pressable>
        </MenuItem>

        <MenuItem
          icon={<RefreshCcw size={20} color="#000" />}
          text="Cambiar número"
          open={openPanel === "change"}
          onPress={() => setOpenPanel(openPanel === "change" ? null : "change")}
        >
          <TextInput
            style={styles.input}
            placeholder="Nuevo número"
            value={newPhone}
            onChangeText={setNewPhone}
            keyboardType="phone-pad"
          />
          <Pressable style={styles.button} onPress={() => handleConfirm("Nuevo número")}>
            <Text style={styles.buttonText}>Confirmar número</Text>
          </Pressable>
        </MenuItem>

        <MenuItem
          icon={<Trash2 size={20} color="#000" />}
          text="Eliminar cuenta"
          open={openPanel === "delete"}
          onPress={() => setOpenPanel(openPanel === "delete" ? null : "delete")}
        >
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.buttonText}>Confirmar eliminación</Text>
          </Pressable>
        </MenuItem>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    padding: 16,
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
  marginBottom: 16,
},
headerCenter: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
},
title: {
  fontSize: 22,
  fontWeight: "700",
  color: "#fff",
},
logo: {
  position: "absolute",
  left: -125,
  top: -20,
  width: 60,
  height: 40,
  resizeMode: "contain",
},

  menu: {
    flexDirection: "column",
  },
  menuItem: {
    flexDirection: "column",
    backgroundColor: "#fff",
    borderRadius: 8,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2, // Android shadow
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    width: "100%",
  },
  menuText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 17,
    fontWeight: "500",
  },
  chevron: {
    transform: [{ rotate: "0deg" }],
  },
  chevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  dropdown: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f9fafb",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  input: {
    width: "100%",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    fontSize: 16,
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#22c55e",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  deleteButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
