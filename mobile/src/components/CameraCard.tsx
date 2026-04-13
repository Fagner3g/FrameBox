import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { colors } from '../theme/colors';

interface CameraCardProps {
  id: string;
  name: string;
  status: 'online' | 'offline';
  recording: boolean;
  snapshotUrl: string;
  onPress: () => void;
}

export default function CameraCard({ name, status, recording, snapshotUrl, onPress }: CameraCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <Pressable onPress={onPress} style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.imageContainer}>
        {!imgError ? (
          <Image
            source={{ uri: snapshotUrl }}
            style={styles.image}
            onError={() => setImgError(true)}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>S/ SINAL</Text>
          </View>
        )}
        
        {/* Badges Ovelay */}
        <View style={styles.badgesContainer}>
          <View style={[styles.badge, { backgroundColor: status === 'online' ? colors.success : colors.danger }]}>
            <Text style={styles.badgeText}>{status.toUpperCase()}</Text>
          </View>
          {recording && (
             <View style={[styles.badge, { backgroundColor: colors.danger, marginLeft: 8 }]}>
               <View style={styles.recDot} />
               <Text style={styles.badgeText}>REC</Text>
             </View>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.name}>{name}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }]
  },
  imageContainer: {
    height: 200,
    width: '100%',
    backgroundColor: '#000',
    position: 'relative'
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  placeholderText: {
    color: colors.danger,
    fontWeight: 'bold',
    letterSpacing: 2
  },
  badgesContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row'
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  badgeText: {
    color: colors.textWhite,
    fontSize: 10,
    fontWeight: 'bold'
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 4
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)'
  },
  name: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: 'bold'
  }
});
