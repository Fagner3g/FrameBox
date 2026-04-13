import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Dashboard from '../screens/Dashboard';
import Settings from '../screens/Settings';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true, headerStyle: { backgroundColor: '#1E1E1E' }, headerTintColor: '#FFF', tabBarStyle: { backgroundColor: '#1E1E1E' }, tabBarActiveTintColor: '#007AFF' }}>
      <Tab.Screen name="Dashboard" component={Dashboard} />
      <Tab.Screen name="Configurações" component={Settings} />
    </Tab.Navigator>
  );
}
