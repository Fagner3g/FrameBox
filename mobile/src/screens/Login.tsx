import React, { useState, useContext } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { colors } from '../theme/colors';

export default function Login() {
  const { signIn } = useContext(AuthContext);
  const [serverAddress, setServerAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!serverAddress || !username || !password) {
      Alert.alert("Erro", "Preencha todos os campos.");
      return;
    }

    // Garante que tenha http caso o usuário coloque só o IP (bom para dev local)
    const formattedUrl = serverAddress.startsWith('http') ? serverAddress : `http://${serverAddress}`;

    setLoading(true);
    try {
      const response = await fetch(`${formattedUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok && data.token) {
        await signIn(formattedUrl, data.token);
      } else {
        Alert.alert("Acesso Negado", data.error || "Credenciais inválidas.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Erro de Conexão", "Não foi possível conectar ao servidor FrameBox.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLabel}>FB</Text>
          </View>
          <Text style={styles.title}>FrameBox</Text>
          <Text style={styles.subtitle}>Conecte no seu NVR Pessoal</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Endereço do Servidor (IP:Porta)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: 192.168.1.10:3000"
            placeholderTextColor={colors.textLight}
            value={serverAddress}
            onChangeText={setServerAddress}
            keyboardType="url"
            autoCapitalize="none"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Usuário</Text>
          <TextInput
            style={styles.input}
            placeholder="admin"
            placeholderTextColor={colors.textLight}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.textLight}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Pressable 
            style={({pressed}) => [styles.button, pressed && styles.buttonPressed]} 
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>Conectar</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoBox: {
    width: 64,
    height: 64,
    backgroundColor: colors.primary,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoLabel: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.background,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.textWhite,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
    marginTop: 4,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 8,
    fontWeight: '600'
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    color: colors.textWhite,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  }
});
