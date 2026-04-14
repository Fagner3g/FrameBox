import React, { useState, useContext, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Modal, FlatList } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { colors } from '../theme/colors';

interface Protocol {
  id: string;
  label: string;
  defaultPort: number;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'failed';

export default function Settings() {
  const { serverUrl, token } = useContext(AuthContext);
  
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState('rtsp');
  const [loading, setLoading] = useState(false);
  const [loadingProtocols, setLoadingProtocols] = useState(true);

  // Estado do teste de conexão
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [testedUrl, setTestedUrl] = useState('');

  // Estado do scan de rede
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ip: string; protocol: string; port: number}[]>([]);
  const [showScanModal, setShowScanModal] = useState(false);

  // Carrega protocolos disponíveis do backend
  useEffect(() => {
    async function fetchProtocols() {
      try {
        const res = await fetch(`${serverUrl}/api/cameras/protocols`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProtocols(data);
          if (data.length > 0) {
            setSelectedProtocol(data[0].id);
            setPort(String(data[0].defaultPort));
          }
        }
      } catch (e) {
        const fallback = [
          { id: 'rtsp', label: 'RTSP', defaultPort: 554 },
          { id: 'dvrip', label: 'DVRIP', defaultPort: 34567 },
          { id: 'onvif', label: 'ONVIF', defaultPort: 80 },
          { id: 'http', label: 'HTTP', defaultPort: 80 },
        ];
        setProtocols(fallback);
        setPort('554');
      } finally {
        setLoadingProtocols(false);
      }
    }
    fetchProtocols();
  }, [serverUrl, token]);

  // Reseta o teste quando os dados de conexão mudam
  useEffect(() => {
    if (testStatus !== 'idle') {
      setTestStatus('idle');
      setTestMessage('');
      setTestedUrl('');
    }
  }, [ip, port, username, password, selectedProtocol]);

  const handleSelectProtocol = (proto: Protocol) => {
    setSelectedProtocol(proto.id);
    setPort(String(proto.defaultPort));
  };

  const handleScan = async () => {
    setScanning(true);
    setScanResults([]);
    setShowScanModal(true);
    try {
      const res = await fetch(`${serverUrl}/api/cameras/scan`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setScanResults(await res.json());
      } else {
        Alert.alert('Erro', 'Falha ao escanear a rede.');
        setShowScanModal(false);
      }
    } catch (e) {
      Alert.alert('Erro de Rede', 'Não foi possível conectar ao servidor.');
      setShowScanModal(false);
    } finally {
      setScanning(false);
    }
  };

  const handleSelectScanResult = (result: {ip: string; protocol: string; port: number}) => {
    setIp(result.ip);
    setSelectedProtocol(result.protocol);
    setPort(String(result.port));
    setTestStatus('idle');
    setTestMessage('');
    setTestedUrl('');
    setShowScanModal(false);
  };

  const handleTestConnection = async () => {
    if (!ip.trim()) {
      Alert.alert('Campo Obrigatório', 'Informe o endereço IP para testar.');
      return;
    }

    setTestStatus('testing');
    setTestMessage('Conectando à câmera...');

    try {
      const body: any = {
        ip: ip.trim(),
        port: Number(port) || undefined,
        protocol: selectedProtocol,
      };
      if (username.trim()) body.username = username.trim();
      if (password.trim()) body.password = password.trim();

      const resp = await fetch(`${serverUrl}/api/cameras/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await resp.json();
      
      if (data.success) {
        setTestStatus('success');
        setTestMessage(data.message || 'Conexão OK!');
        setTestedUrl(data.source_url || '');
      } else {
        setTestStatus('failed');
        setTestMessage(data.error || 'Falha na conexão');
        setTestedUrl(data.source_url || '');
      }
    } catch (e) {
      setTestStatus('failed');
      setTestMessage('Erro de rede ao testar conexão.');
    }
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert('Campo Obrigatório', 'Informe o nome da câmera.');
      return;
    }
    if (testStatus !== 'success') {
      Alert.alert('Teste Necessário', 'Você precisa testar a conexão com sucesso antes de cadastrar.');
      return;
    }

    setLoading(true);
    try {
      const body: any = {
        name: name.trim(),
        ip: ip.trim(),
        port: Number(port) || undefined,
        protocol: selectedProtocol,
        enabled: true,
        recording: true
      };

      if (username.trim()) body.username = username.trim();
      if (password.trim()) body.password = password.trim();

      const resp = await fetch(`${serverUrl}/api/cameras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (resp.ok) {
        Alert.alert(
          '✅ Câmera Cadastrada!', 
          `"${name}" foi adicionada ao NVR.\nVá ao Dashboard e puxe para atualizar.`,
          [{ text: 'OK' }]
        );
        setName('');
        setIp('');
        setUsername('');
        setPassword('');
        setTestStatus('idle');
        setTestMessage('');
        setTestedUrl('');
      } else {
        const err = await resp.json();
        Alert.alert('Falha', err.error || 'Não foi possível cadastrar');
      }
    } catch (e) {
      Alert.alert('Erro de Rede', 'Não foi possível conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingProtocols) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const testStatusColor = testStatus === 'success' ? '#00E676' : testStatus === 'failed' ? '#ff4d4d' : colors.textLight;

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Adicionar Câmera</Text>
        <Text style={styles.subtitle}>
          Preencha os dados do equipamento e teste a conexão antes de cadastrar.
        </Text>

        {/* SELETOR DE PROTOCOLO */}
        <Text style={styles.sectionLabel}>Protocolo de Conexão</Text>
        <View style={styles.protocolRow}>
          {protocols.map((proto) => (
            <Pressable 
              key={proto.id}
              style={[
                styles.protocolChip,
                selectedProtocol === proto.id && styles.protocolChipActive
              ]}
              onPress={() => handleSelectProtocol(proto)}
            >
              <Text style={[
                styles.protocolChipText,
                selectedProtocol === proto.id && styles.protocolChipTextActive
              ]}>
                {proto.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* BOTÃO DE SCAN */}
        <Pressable
          style={[styles.scanButton, scanning && styles.buttonDisabled]}
          onPress={handleScan}
          disabled={scanning}
        >
          {scanning ? (
            <View style={styles.testButtonContent}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.scanButtonText}>  Escaneando rede...</Text>
            </View>
          ) : (
            <Text style={styles.scanButtonText}>Buscar Câmeras na Rede</Text>
          )}
        </Pressable>

        {/* MODAL DE RESULTADOS DO SCAN */}
        <Modal
          visible={showScanModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowScanModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Câmeras Encontradas</Text>
              {scanning ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.modalLoadingText}>Escaneando subnet...</Text>
                </View>
              ) : scanResults.length === 0 ? (
                <Text style={styles.modalEmpty}>Nenhum dispositivo encontrado na rede.</Text>
              ) : (
                <FlatList
                  data={scanResults}
                  keyExtractor={(item) => `${item.ip}:${item.port}`}
                  style={styles.scanList}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.scanResultRow}
                      onPress={() => handleSelectScanResult(item)}
                    >
                      <Text style={styles.scanResultIp}>{item.ip}</Text>
                      <View style={styles.scanResultBadge}>
                        <Text style={styles.scanResultProto}>{item.protocol.toUpperCase()} :{item.port}</Text>
                      </View>
                    </Pressable>
                  )}
                />
              )}
              <Pressable style={styles.modalCloseBtn} onPress={() => setShowScanModal(false)}>
                <Text style={styles.modalCloseTxt}>Fechar</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* FORMULÁRIO */}
        <View style={styles.formCard}>
          <View style={styles.row}>
            <View style={styles.colLarge}>
              <Text style={styles.label}>Endereço IP</Text>
              <TextInput
                style={styles.input}
                placeholder="192.168.1.100"
                placeholderTextColor="#555"
                value={ip}
                onChangeText={setIp}
                keyboardType="decimal-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.colSmall}>
              <Text style={styles.label}>Porta</Text>
              <TextInput
                style={styles.input}
                placeholder="554"
                placeholderTextColor="#555"
                value={port}
                onChangeText={setPort}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Text style={styles.label}>Usuário</Text>
          <TextInput
            style={styles.input}
            placeholder="admin"
            placeholderTextColor="#555"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* BOTÃO DE TESTE */}
          <Pressable 
            style={[
              styles.testButton, 
              testStatus === 'testing' && styles.buttonDisabled,
              testStatus === 'success' && styles.testButtonSuccess,
              testStatus === 'failed' && styles.testButtonFailed,
            ]} 
            onPress={handleTestConnection}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? (
              <View style={styles.testButtonContent}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.testButtonText}>  Testando...</Text>
              </View>
            ) : (
              <Text style={styles.testButtonText}>
                {testStatus === 'success' ? '✓ Conectado!' : 
                 testStatus === 'failed' ? '✗ Testar Novamente' : 
                 '⚡ Testar Conexão'}
              </Text>
            )}
          </Pressable>

          {/* RESULTADO DO TESTE */}
          {testMessage !== '' && (
            <View style={[styles.testResult, { borderLeftColor: testStatusColor }]}>
              <Text style={[styles.testResultText, { color: testStatusColor }]}>
                {testMessage}
              </Text>
              {testedUrl !== '' && (
                <Text style={styles.testResultUrl} numberOfLines={2}>
                  URL: {testedUrl}
                </Text>
              )}
            </View>
          )}

          <View style={styles.divider} />

          {/* NOME (só aparece após teste com sucesso) */}
          <Text style={styles.label}>Nome da Câmera</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Garagem Frontal"
            placeholderTextColor="#555"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Pressable
            style={[
              styles.button,
              (loading || testStatus !== 'success') && styles.buttonDisabled
            ]}
            onPress={handleRegister}
            disabled={loading || testStatus !== 'success'}
          >
            {loading ? (
              <View style={styles.testButtonContent}>
                <ActivityIndicator size="small" color={colors.background} />
                <Text style={[styles.buttonText, { marginLeft: 8 }]}>Cadastrando...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>+ Cadastrar Câmera</Text>
            )}
          </Pressable>

          {testStatus !== 'success' && (
            <Text style={styles.hint}>
              Teste a conexão acima para habilitar o cadastro.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 80,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.textWhite,
  },
  subtitle: {
    color: colors.textLight,
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 20,
    fontSize: 13,
  },
  sectionLabel: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  protocolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  protocolChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#333',
  },
  protocolChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  protocolChipText: {
    color: colors.textLight,
    fontWeight: 'bold',
    fontSize: 13
  },
  protocolChipTextActive: {
    color: colors.background,
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2833'
  },
  label: {
    color: colors.textWhite,
    fontWeight: '600',
    marginBottom: 6,
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.background,
    color: colors.textWhite,
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  colLarge: {
    flex: 2,
  },
  colSmall: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 16,
  },
  testButton: {
    backgroundColor: '#1A3A4A',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  testButtonSuccess: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderColor: '#00E676',
  },
  testButtonFailed: {
    backgroundColor: 'rgba(255, 77, 77, 0.1)',
    borderColor: '#ff4d4d',
  },
  testButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  testResult: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderLeftWidth: 3,
  },
  testResultText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  testResultUrl: {
    color: '#555',
    fontSize: 11,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.4
  },
  buttonText: {
    color: colors.background,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5
  },
  hint: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
  scanButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(0, 230, 210, 0.07)',
  },
  scanButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    color: colors.textWhite,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalLoading: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  modalLoadingText: {
    color: colors.textLight,
    marginTop: 12,
    fontSize: 13,
  },
  modalEmpty: {
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: 32,
    fontStyle: 'italic',
  },
  scanList: {
    maxHeight: 300,
  },
  scanResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  scanResultIp: {
    color: colors.textWhite,
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scanResultBadge: {
    backgroundColor: 'rgba(0,230,210,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  scanResultProto: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  modalCloseTxt: {
    color: colors.textLight,
    fontWeight: 'bold',
    fontSize: 14,
  },
});
