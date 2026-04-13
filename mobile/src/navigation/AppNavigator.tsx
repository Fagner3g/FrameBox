import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Dashboard from '../screens/Dashboard';
import Settings from '../screens/Settings';
import CameraDetail from '../screens/CameraDetail';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function BottomTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true, headerStyle: { backgroundColor: '#1E1E1E' }, headerTintColor: '#FFF', tabBarStyle: { backgroundColor: '#1E1E1E', borderTopWidth: 0 }, tabBarActiveTintColor: '#66FCF1' }}>
      <Tab.Screen name="Dashboard" component={Dashboard} />
      <Tab.Screen name="Configurações" component={Settings} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={BottomTabs} />
      <Stack.Screen name="CameraDetail" component={CameraDetail} />
    </Stack.Navigator>
  )
}
