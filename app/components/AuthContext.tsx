"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  username: string;
  email: string;
  token: string;
  active: boolean;
}

interface AuthContextType {
  user: User | null;
  signup: (username: string, email: string, password: string) => void;
  login: (email: string, password: string) => void;
  logout: () => void;
  toggleActive: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  // ✅ Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const signup = (username: string, email: string, password: string) => {
    const mockToken = Math.random().toString(36).substring(2, 12);
    const newUser: User = { username, email, token: mockToken, active: true };
    setUser(newUser);
    localStorage.setItem("user", JSON.stringify(newUser));
  };

  const login = (email: string, password: string) => {
    // ✅ For now, just reload stored user or mock login
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      const mockToken = Math.random().toString(36).substring(2, 12);
      const loggedUser: User = { username: "DemoUser", email, token: mockToken, active: true };
      setUser(loggedUser);
      localStorage.setItem("user", JSON.stringify(loggedUser));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
  };

  const toggleActive = () => {
    if (!user) return;
    const updatedUser = { ...user, active: !user.active };
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, signup, login, logout, toggleActive }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
