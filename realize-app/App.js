import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Tela de Login (compartilhada)
import LoginScreen from './screens/LoginScreen';

// Screens Cliente
import ClientHomeScreen from './screens/ClientHomeScreen';
import HomeScreen from './screens/HomeScreen';
import EventTypesScreen from './screens/EventTypesScreen';
import QuestionsScreen from './screens/QuestionsScreen';
import SummaryScreen from './screens/SummaryScreen';

// Screens Equipe/Atendimento
import AtendimentoHomeScreen from './screens/AtendimentoHomeScreen';
import BudgetDetailScreen from './screens/BudgetDetailScreen';
import ProjectTimelineScreen from './screens/ProjectTimelineScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
        }}
      >
        {/* LOGIN (tela inicial compartilhada) */}
        <Stack.Screen name="Login" component={LoginScreen} />

        {/* ROTAS DO CLIENTE */}
        <Stack.Screen name="ClientHome" component={ClientHomeScreen} />
        <Stack.Screen name="EventTypes" component={EventTypesScreen} />
        <Stack.Screen name="Questions" component={QuestionsScreen} />
        <Stack.Screen name="Summary" component={SummaryScreen} />

        {/* ROTAS DA EQUIPE */}
        <Stack.Screen name="AtendimentoHome" component={AtendimentoHomeScreen} />
        <Stack.Screen name="BudgetDetail" component={BudgetDetailScreen} />
        <Stack.Screen name="ProjectDetail" component={BudgetDetailScreen} />
        <Stack.Screen name="ProjectTimeline" component={ProjectTimelineScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
