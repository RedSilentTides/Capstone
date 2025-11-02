import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebaseConfig';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('AuthProvider: Suscribiendo a cambios de auth...');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('AuthProvider: Estado de auth cambiado. Usuario:', user ? user.uid : 'null');
      setUser(user);
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      console.log('AuthProvider: Desuscribiendo de cambios de auth.');
      unsubscribe();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
}
