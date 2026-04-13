import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import CameraCard from '../components/CameraCard';

export default function Dashboard() {
  
  // Mock Data Temporário para você ver a interface nascer!
  const mockCameras = [
    {
      id: '1',
      name: 'Garagem Interna',
      status: 'online' as const,
      recording: true,
      snapshotUrl: 'https://images.unsplash.com/photo-1627448375005-cb6323dbbd5c?w=500&q=80',
    },
    {
      id: '2',
      name: 'Entrada Principal',
      status: 'offline' as const,
      recording: false,
      snapshotUrl: 'invalid_url',
    }
  ];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Monitoramento</Text>
      <Text style={styles.subtitle}>Visão geral do sistema</Text>

      <View style={styles.grid}>
        {mockCameras.map(cam => (
          <CameraCard 
            key={cam.id}
            {...cam}
            onPress={() => console.log('Abrir Player', cam.name)}
          />
        ))}
      </View>
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
