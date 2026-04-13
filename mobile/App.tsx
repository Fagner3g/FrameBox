import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import Login from './src/screens/Login';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { colors } from './src/theme/colors';

function RootRouter() {
  const { token, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Se o token existe, AppPrincipal (com tabs). Se não, Tela de Login Pura.
  return token ? <AppNavigator /> : <Login />;
}

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootRouter />
      </NavigationContainer>
    </AuthProvider>
  );
}

export default App;
