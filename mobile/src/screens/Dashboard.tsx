import React, { useContext, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import CameraCard from '../components/CameraCard';
import { AuthContext } from '../context/AuthContext';

export default function Dashboard({ navigation }: any) {
  const { serverUrl, token } = useContext(AuthContext);
  const [cameras, setCameras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCameras = useCallback(async () => {
    try {
      const resp = await fetch(`${serverUrl}/api/cameras`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setCameras(data);
      }
    } catch (e) {
      console.warn("Falha ao carregar as cameras", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverUrl, token]);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadCameras();
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <Text style={styles.title}>Monitoramento</Text>
      <Text style={styles.subtitle}>Visão geral do sistema</Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      ) : cameras.length === 0 ? (
        <Text style={{ color: colors.textLight, textAlign: 'center', marginTop: 40 }}>
          Nenhuma câmera cadastrada no servidor ainda.
        </Text>
      ) : (
        <View style={styles.grid}>
          {cameras.map(cam => (
            <CameraCard 
              key={cam.id}
              id={cam.id}
              name={cam.name}
              status={cam.enabled === 1 ? 'online' : 'offline'}
              recording={cam.recording === 1}
              // Anexamos token via url fetch nativo ou query. 
              // O Snapshot não exige authorization se abrirmos furo ou podemos usar cache. Mas como a rota exige token:
              // Para images native fetch com auth headers:
              snapshotUrl={`${serverUrl}/api/cameras/${cam.id}/snapshot?t=${Date.now()}`}
              onPress={() => navigation.navigate('CameraDetail', { cameraId: cam.id, name: cam.name })}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 24,
  },
  grid: {
    paddingBottom: 40
  }
});
