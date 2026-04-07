import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AtendimentoHomeScreen({ navigation }) {
  const [myBudgets, setMyBudgets] = useState([]);
  const [myProjects, setMyProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    loadUserAndData();
  }, []);

  const getInitials = (name) => {
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  const loadUserAndData = async () => {
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
      setCurrentUserId(user.id);
      
      await loadData(user.id);
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const loadData = async (userId) => {
    try {
      await Promise.all([loadMyBudgets(userId), loadMyProjects(userId)]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMyBudgets = async (userId) => {
    try {
      // Buscar budgets atribuídos a mim e ainda em análise
      const q = query(
        collection(db, 'budgets'),
        where('assignedTo', '==', userId),
        where('status', '==', 'analyzing')
      );
      const snapshot = await getDocs(q);
      const budgetsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          const dateA = a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(0);
          const dateB = b.assignedAt?.toDate ? b.assignedAt.toDate() : new Date(0);
          return dateB - dateA;
        });
      setMyBudgets(budgetsData);
    } catch (error) {
      console.error('Erro ao carregar meus orçamentos:', error);
    }
  };

  const loadMyProjects = async (userId) => {
    try {
      // Buscar projetos atribuídos a mim e aprovados
      const q = query(
        collection(db, 'budgets'),
        where('assignedTo', '==', userId),
        where('status', '==', 'approved')
      );
      const snapshot = await getDocs(q);
      const projectsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          const dateA = a.approvedAt?.toDate ? a.approvedAt.toDate() : new Date(0);
          const dateB = b.approvedAt?.toDate ? b.approvedAt.toDate() : new Date(0);
          return dateB - dateA;
        });
      setMyProjects(projectsData);
    } catch (error) {
      console.error('Erro ao carregar meus projetos:', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData(currentUserId);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('loggedUser');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }]
    });
  };

  const getProjectName = (project) => {
    if (project.answers && project.answers['GApo1hcglkgdpAQGuSnn']) {
      return project.answers['GApo1hcglkgdpAQGuSnn'];
    }
    return project.eventTypeName || 'Evento';
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Image 
              source={require('../../assets/logo.png')} 
              style={styles.logoImage}
            />
          </View>
          
          <TouchableOpacity onPress={handleLogout} style={styles.profileButton}>
            <View style={styles.profileCircle}>
              <Text style={styles.profileInitials}>{userInitials}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.greeting}>Olá, {userName}!</Text>
        <Text style={styles.subtitle}>Meus Projetos</Text>
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
        {/* MEUS ORÇAMENTOS (Em Análise) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Para Analisar</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{myBudgets.length}</Text>
            </View>
          </View>

          {myBudgets.length > 0 ? (
            myBudgets.map(budget => (
              <TouchableOpacity
                key={budget.id}
                style={styles.budgetCard}
                onPress={() => navigation.navigate('BudgetDetail', { budgetId: budget.id })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.projectName}>{getProjectName(budget)}</Text>
                    <View style={styles.statusBadgeAnalyzing}>
                      <Text style={styles.statusText}>EM ANÁLISE</Text>
                    </View>
                  </View>
                </View>
                
                <Text style={styles.projectType}>{budget.eventTypeName}</Text>
                <Text style={styles.projectClient}>Cliente: {budget.clientName || 'Não informado'}</Text>
                <Text style={styles.projectNumber}>#{budget.budgetNumber}</Text>
                
                {budget.assignedAt && (
                  <Text style={styles.dateText}>
                    Atribuído: {formatDate(budget.assignedAt)}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhum orçamento para analisar</Text>
              <Text style={styles.emptySubtext}>Aguardando novos projetos</Text>
            </View>
          )}
        </View>

        {/* MEUS PROJETOS (Aprovados - Em Andamento) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Em Andamento</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{myProjects.length}</Text>
            </View>
          </View>

          {myProjects.length > 0 ? (
            myProjects.map(project => (
              <TouchableOpacity
                key={project.id}
                style={styles.projectCard}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: project.id })}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.projectName}>{getProjectName(project)}</Text>
                </View>
                
                <Text style={styles.projectType}>{project.eventTypeName}</Text>
                <Text style={styles.projectClient}>Cliente: {project.clientName || 'Não informado'}</Text>
                <Text style={styles.projectNumber}>#{project.budgetNumber}</Text>

                {project.approvedAt && (
                  <Text style={styles.dateText}>
                    Aprovado: {formatDate(project.approvedAt)}
                  </Text>
                )}

                {/* Progress Bar */}
                {project.taskProgress && (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${project.taskProgress.percentage || 0}%` }
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>
                      {project.taskProgress.completed || 0}/{project.taskProgress.total || 0}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhum projeto em andamento</Text>
              <Text style={styles.emptySubtext}>Projetos aprovados aparecerão aqui</Text>
            </View>
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
    marginBottom: 20,
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#8BA4B8',
  },
  
  // CONTENT
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  
  // SECTION
  section: {
    marginTop: 24,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: 8,
  },
  badge: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    minWidth: 28,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  
  // CARDS
  budgetCard: {
    backgroundColor: '#2A3E50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFA726',
  },
  projectCard: {
    backgroundColor: '#2A3E50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#66BB6A',
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  projectName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  statusBadgeAnalyzing: {
    backgroundColor: '#FFA726',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  projectType: {
    fontSize: 13,
    color: '#8BA4B8',
    marginBottom: 2,
  },
  projectClient: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  projectNumber: {
    fontSize: 12,
    color: '#6B8499',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#6B8499',
    marginTop: 4,
  },
  
  // PROGRESS
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#3A4E60',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#66BB6A',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#66BB6A',
    minWidth: 40,
  },
  
  // EMPTY STATE
  emptyState: {
    backgroundColor: '#2A3E50',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3A4E60',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8BA4B8',
    textAlign: 'center',
  },
});
