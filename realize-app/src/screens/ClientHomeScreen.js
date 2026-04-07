import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Image } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ClientHomeScreen({ navigation }) {
  const [myProjects, setMyProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');

  useEffect(() => {
    loadUserAndProjects();
  }, []);

  const getInitials = (name) => {
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  const loadUserAndProjects = async () => {
    try {
      const userStr = await AsyncStorage.getItem('loggedUser');
      if (!userStr) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }]
        });
        return;
      }

      const user = JSON.parse(userStr);
      setUserName(user.name);
      setUserInitials(getInitials(user.name));

      // Buscar projetos do cliente
      const budgetsRef = collection(db, 'budgets');
      const q = query(budgetsRef, where('clientEmail', '==', user.email));

      const snapshot = await getDocs(q);
      const projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ordenar por data (mais recente primeiro)
      projectsData.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });

      setMyProjects(projectsData);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadUserAndProjects();
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('loggedUser');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }]
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'analyzing': return '#FFA726';
      case 'approved': return '#66BB6A';
      case 'rejected': return '#EF5350';
      default: return '#78909C';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'analyzing': return 'Em Análise';
      case 'approved': return 'Aprovado';
      case 'rejected': return 'Rejeitado';
      default: return 'Aguardando';
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  };

  const getProjectName = (project) => {
    // Prioridade: Nome personalizado > Nome do tipo de evento > "Evento"
    if (project.answers && project.answers['GApo1hcglkgdpAQGuSnn']) {
      return project.answers['GApo1hcglkgdpAQGuSnn']; // ID da pergunta "Nome do Evento"
    }
    return project.eventTypeName || 'Evento';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D9FF" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER COM PERFIL */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <View style={styles.logoContainer}>
              <Image 
                source={require('../../assets/logo.png')} 
                style={styles.logoImage}
              />
            </View>
          </View>
          
          <TouchableOpacity onPress={handleLogout} style={styles.profileButton}>
            <View style={styles.profileCircle}>
              <Text style={styles.profileInitials}>{userInitials}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.greeting}>Olá, {userName}!</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#00D9FF"
          />
        }
      >
        {/* BOTÃO NOVO ORÇAMENTO */}
        <TouchableOpacity
          style={styles.newBudgetButton}
          onPress={() => navigation.navigate('EventTypes')}
        >
          <LinearGradient
            colors={['#00FFAA', '#00BFFF', '#0040FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.newBudgetGradient}
          >
            <Text style={styles.newBudgetIcon}>+</Text>
            <Text style={styles.newBudgetText}>Solicitar Novo Orçamento</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* MEUS PROJETOS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meus Projetos</Text>
          <Text style={styles.sectionSubtitle}>{myProjects.length} projeto(s)</Text>

          {myProjects.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>Nenhum projeto ainda</Text>
              <Text style={styles.emptyText}>
                Clique em "Solicitar Novo Orçamento" para começar
              </Text>
            </View>
          ) : (
            myProjects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={styles.projectCard}
                onPress={() => {
                  // Por enquanto, mostrar informações básicas
                  alert(`Projeto: ${getProjectName(project)}\nStatus: ${getStatusText(project.status)}\n\nTela de detalhes em desenvolvimento!`);
                }}
              >
                <View style={styles.projectHeader}>
                  <View style={styles.projectTitleRow}>
                    <Text style={styles.projectName}>{getProjectName(project)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(project.status) }]}>
                      <Text style={styles.statusText}>{getStatusText(project.status)}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.projectType}>{project.eventTypeName}</Text>
                <Text style={styles.projectNumber}>#{project.budgetNumber}</Text>

                <View style={styles.projectInfo}>
                  <Text style={styles.projectInfoText}>
                    Solicitado em: {formatDate(project.createdAt)}
                  </Text>
                </View>

                <View style={styles.projectFooter}>
                  <Text style={styles.viewDetails}>Ver detalhes →</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A2E40',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A2E40',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8BA4B8',
  },
  
  // HEADER
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    backgroundColor: '#1A2E40',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 8,
  },
  logoImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
  profileButton: {
    padding: 4,
  },
  profileCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A4256',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00BFFF',
  },
  profileInitials: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00D9FF',
  },
  greeting: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  
  // CONTENT
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  
  // NOVO ORÇAMENTO
  newBudgetButton: {
    marginTop: 24,
    marginBottom: 32,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  newBudgetGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  newBudgetIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    marginRight: 10,
    fontWeight: 'bold',
  },
  newBudgetText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  
  // SECTION
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8BA4B8',
    marginBottom: 16,
  },
  
  // EMPTY STATE
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    backgroundColor: '#2A3E50',
    borderRadius: 16,
    marginTop: 16,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#8BA4B8',
    textAlign: 'center',
  },
  
  // PROJECT CARD
  projectCard: {
    backgroundColor: '#2A3E50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3A4E60',
  },
  projectHeader: {
    marginBottom: 8,
  },
  projectTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  projectName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 12,
  },
  projectType: {
    fontSize: 13,
    color: '#8BA4B8',
    marginBottom: 2,
  },
  projectNumber: {
    fontSize: 12,
    color: '#6B8499',
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  projectInfo: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#3A4E60',
  },
  projectInfoText: {
    fontSize: 12,
    color: '#8BA4B8',
  },
  projectFooter: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  viewDetails: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00D9FF',
  },
});
