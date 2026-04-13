import React, { createContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthContextData {
  serverUrl: string | null;
  token: string | null;
  isLoading: boolean;
  signIn: (url: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStorageData() {
      try {
        const storedUrl = await AsyncStorage.getItem('@FrameBox:serverUrl');
        const storedToken = await AsyncStorage.getItem('@FrameBox:token');

        if (storedUrl && storedToken) {
          setServerUrl(storedUrl);
          setToken(storedToken);
        }
      } catch (err) {
        console.error("Storage load error", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadStorageData();
  }, []);

  const signIn = async (url: string, tokenString: string) => {
    // Sanitize URL
    const cleanedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    
    await AsyncStorage.setItem('@FrameBox:serverUrl', cleanedUrl);
    await AsyncStorage.setItem('@FrameBox:token', tokenString);
    setServerUrl(cleanedUrl);
    setToken(tokenString);
  };

  const signOut = async () => {
    await AsyncStorage.removeItem('@FrameBox:token');
    await AsyncStorage.removeItem('@FrameBox:serverUrl');
    setToken(null);
    setServerUrl(null);
  };

  return (
    <AuthContext.Provider value={{ serverUrl, token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
