import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { AuthContext } from '../context/AuthContext';
import VideoPlayer from '../components/VideoPlayer';

export default function CameraDetail({ route, navigation }: any) {
  const { cameraId, name } = route.params;
  const { serverUrl, token } = useContext(AuthContext);

  const liveUrl = `${serverUrl}/live/${cameraId}/stream.m3u8`;

  // WebRTC via proxy Express (porta 3000) → go2rtc interno — latência < 1s para live
  const webrtcUrl = `${serverUrl}/api/cameras/${cameraId}/webrtc`;

  const [currentUrl, setCurrentUrl] = useState(liveUrl);
  const [isLive, setIsLive] = useState(true);

  const [calendar, setCalendar] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Busca calendário
  useEffect(() => {
    async function fetchCalendar() {
      try {
        const res = await fetch(`${serverUrl}/api/recordings/calendar/${cameraId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const dates = await res.json();
          setCalendar(dates);
          if (dates.length > 0) setSelectedDate(dates[0]); 
        }
      } catch (err) {
        console.error("Falha ao buscar calendario", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCalendar();
  }, [serverUrl, cameraId, token]);

  // Busca recordings da data
  useEffect(() => {
    async function fetchRecordings() {
      if (!selectedDate) return;
      try {
        const res = await fetch(`${serverUrl}/api/recordings?cameraId=${cameraId}&date=${selectedDate}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          setRecordings(await res.json());
        }
      } catch (err) {
        console.error("Falha ao buscar record list", err);
      }
    }
    fetchRecordings();
  }, [selectedDate, serverUrl, cameraId, token]);

  const handlePlayLive = () => {
    setCurrentUrl(liveUrl);
    setIsLive(true);
  };

  const handlePlayRecording = (filename: string) => {
    const recUrl = `${serverUrl}/api/recordings/${cameraId}/stream/${filename}`;
    setCurrentUrl(recUrl);
    setIsLive(false);
  };

  const handleDelete = () => {
    Alert.alert(
      "Excluir Câmera",
      `Tem certeza que deseja excluir '${name}' do sistema NVR permanentemente?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Excluir", 
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${serverUrl}/api/cameras/${cameraId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                navigation.goBack();
              } else {
                Alert.alert("Erro", "Não foi possível excluir");
              }
            } catch (err) {
              Alert.alert("Erro de Rede", "Falha ao se comunicar com o servidor");
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>{"<"} </Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{name}</Text>
        </View>
        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Excluir</Text>
        </Pressable>
      </View>

      <VideoPlayer
        streamUrl={currentUrl}
        isLive={isLive}
        hlsJsUrl={`${serverUrl}/public/hls.min.js`}
        webrtcUrl={isLive ? webrtcUrl : undefined}
        authToken={token ?? undefined}
      />

      <View style={styles.controlsBar}>
         <Pressable onPress={handlePlayLive} style={[styles.modeButton, isLive && styles.modeButtonActive]}>
           <Text style={styles.modeText}>VER AO VIVO</Text>
         </Pressable>
      </View>

      {/* TIMELINE DE HISTÓRICO */}
      <View style={styles.historyContainer}>
        <Text style={styles.sectionTitle}>Histórico de Gravações (Por Dia)</Text>

        {loading ? (
           <ActivityIndicator size="small" color={colors.primary} />
        ) : calendar.length === 0 ? (
           <Text style={styles.emptyText}>Nenhuma gravação recente para esta câmera.</Text>
        ) : (
          <View>
            <FlatList
               horizontal
               showsHorizontalScrollIndicator={false}
               data={calendar}
               keyExtractor={(item) => item}
               style={styles.calendarList}
               contentContainerStyle={{ paddingHorizontal: 16 }}
               renderItem={({item}) => (
                 <Pressable 
                   style={[styles.dateBubble, item === selectedDate && styles.dateBubbleActive]}
                   onPress={() => setSelectedDate(item)}
                 >
                   <Text style={[styles.dateText, item === selectedDate && styles.dateTextActive]}>
                     {item}
                   </Text>
                 </Pressable>
               )}
            />

            <FlatList 
               data={recordings}
               keyExtractor={(item) => item.id}
               contentContainerStyle={{ padding: 16, paddingBottom: 150 }}
               renderItem={({item}) => {
                 const isPlayingThis = !isLive && currentUrl.includes(item.id);
                 return (
                 <Pressable 
                   style={[styles.hourRow, isPlayingThis && styles.hourRowActive]}
                   onPress={() => handlePlayRecording(item.id)}
                 >
                   <View style={styles.hourInfo}>
                     <Text style={[styles.hourTitle, isPlayingThis && { color: colors.background }]}>
                       {item.hour}:00
                     </Text>
                     <Text style={[styles.hourSize, isPlayingThis && { color: colors.background }]}>
                       {(item.size_bytes / 1024 / 1024).toFixed(1)} MB
                     </Text>
                   </View>
                   {isPlayingThis && <Text style={styles.playIcon}>Rodando...</Text>}
                 </Pressable>
               )}}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 50,
    backgroundColor: colors.surface
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10
  },
  backButton: {
    paddingRight: 16,
  },
  backIcon: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: 'bold'
  },
  title: {
    color: colors.textWhite,
    fontSize: 20,
    fontWeight: 'bold',
    flexShrink: 1
  },
  deleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,50,50,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,50,50,0.4)',
  },
  deleteText: {
    color: '#ff4d4d',
    fontWeight: 'bold',
    fontSize: 12
  },
  controlsBar: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A'
  },
  modeButton: {
    backgroundColor: colors.surface,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  modeButtonActive: {
    backgroundColor: colors.primary
  },
  modeText: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 1
  },
  historyContainer: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.textLight,
    padding: 16,
    paddingBottom: 8,
    fontSize: 14,
    fontWeight: 'bold'
  },
  emptyText: {
    color: colors.textLight,
    fontStyle: 'italic',
    padding: 16
  },
  calendarList: {
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    paddingBottom: 12,
    flexGrow: 0
  },
  dateBubble: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10
  },
  dateBubbleActive: {
    backgroundColor: colors.secondary
  },
  dateText: {
    color: colors.textLight,
    fontWeight: 'bold'
  },
  dateTextActive: {
    color: '#fff'
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8
  },
  hourRowActive: {
    backgroundColor: colors.primary
  },
  hourInfo: {
  },
  hourTitle: {
    color: colors.textWhite,
    fontSize: 16,
    fontWeight: 'bold'
  },
  hourSize: {
    color: colors.textLight,
    fontSize: 12
  },
  playIcon: {
    color: colors.background,
    fontWeight: 'bold'
  }
});
