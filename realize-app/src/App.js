import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Login
import LoginScreen from './screens/LoginScreen';

// Cliente
import ClientHomeScreen from './screens/ClientHomeScreen';
import ChatIAScreen from './screens/ChatIAScreen';
import ProjectDetailScreen from './screens/ProjectDetailScreen';

// Equipe
import AtendimentoHomeScreen from './screens/AtendimentoHomeScreen';
import DiretoraPainelScreen from './screens/DiretoraPainelScreen';
import BudgetDetailScreen from './screens/BudgetDetailScreen';
import ProjectTimelineScreen from './screens/ProjectTimelineScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        {/* Login */}
        <Stack.Screen name="Login" component={LoginScreen} />

        {/* Cliente */}
        <Stack.Screen name="ClientHome" component={ClientHomeScreen} />
        <Stack.Screen name="ChatIA" component={ChatIAScreen} />
        <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />

        {/* Equipe */}
        <Stack.Screen name="DiretoraPainel" component={DiretoraPainelScreen} />
        <Stack.Screen name="AtendimentoHome" component={AtendimentoHomeScreen} />
        <Stack.Screen name="BudgetDetail" component={BudgetDetailScreen} />
        <Stack.Screen name="ProjectDetail_old" component={BudgetDetailScreen} />
        <Stack.Screen name="ProjectTimeline" component={ProjectTimelineScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
