import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import Video from 'react-native-video';
import { colors } from '../theme/colors';

interface VideoPlayerProps {
  streamUrl: string;
  isLive?: boolean;
}

export default function VideoPlayer({ streamUrl, isLive = true }: VideoPlayerProps) {
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError] = useState(false);

  return (
    <View style={styles.container}>
      <Video
        source={{ uri: streamUrl }}
        style={styles.videoElement}
        resizeMode="contain"
        controls={!isLive} // Se for gravação MP4, mostra scroll bar no player iOS/Android. Se for ao vivo, esconde.
        onBuffer={({ isBuffering }) => setIsBuffering(isBuffering)}
        onReadyForDisplay={() => setIsBuffering(false)}
        onError={(e) => {
          console.error("Video player err", e);
          setError(true);
        }}
      />
      
      {isBuffering && !error && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {error && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>Erro ao carregar o vídeo</Text>
        </View>
      )}

      {isLive && !error && (
        <View style={styles.liveBadge}>
          <View style={styles.recDot} />
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 250,
    backgroundColor: '#000',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  videoElement: {
    ...StyleSheet.absoluteFillObject
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)'
  },
  errorText: {
    color: colors.danger,
    fontWeight: 'bold',
    fontSize: 16
  },
  liveBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 6
  },
  liveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1
  }
});
