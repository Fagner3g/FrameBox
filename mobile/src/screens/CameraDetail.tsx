import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import { AuthContext } from '../context/AuthContext';
import VideoPlayer from '../components/VideoPlayer';

export default function CameraDetail({ route, navigation }: any) {
  const { cameraId, name } = route.params;
  const { serverUrl, token } = useContext(AuthContext);

  const liveUrl = `${serverUrl}/live/${cameraId}/stream.m3u8`;

  const [currentUrl, setCurrentUrl] = useState(liveUrl);
  const [isLive, setIsLive] = useState(true);

  const [calendar, setCalendar] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Busca calendário das datas que possuem gravações
  useEffect(() => {
    async function fetchCalendar() {
      try {
        const res = await fetch(`${serverUrl}/api/recordings/calendar/${cameraId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const dates = await res.json();
          setCalendar(dates);
          if (dates.length > 0) setSelectedDate(dates[0]); // Seleciona o log mais recente que vier primeiro
        }
      } catch (err) {
        console.error("Falha ao buscar calendario", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCalendar();
  }, [serverUrl, cameraId, token]);

  // Se o selecionador de datas mudou, busca a listagem daquelas 24 horas.
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
    // Nós podemos servir streaming com query token mas react-native-video aceita headers em algumas versões via modifier.
    // Como estamos na rede local / JWT backend, vamos embutir ou fazer fetch direto. 
    // Assumimos que route /stream envia Partial 206! 
    // Obs: A rota do backend /api/recordings/:id/stream/:filename está blindada por token. O RN Video Player usa `serverUrl` apenas se ele injetar Headers! 
    // Pra contornar limites em players iOS sem hook custom do RNVideo, geramos essa URL e mandamos para o player, que seria ideal se recebesse headers. RN Video Source possui `headers: {Authorization:...}`
    const recUrl = `${serverUrl}/api/recordings/${cameraId}/stream/${filename}`;
    setCurrentUrl(recUrl);
    setIsLive(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>{"<"} </Text>
        </Pressable>
        <Text style={styles.title}>{name}</Text>
      </View>

      <VideoPlayer streamUrl={currentUrl} isLive={isLive} />

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
    padding: 16,
    paddingTop: 50,
    backgroundColor: colors.surface
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
    fontWeight: 'bold'
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
