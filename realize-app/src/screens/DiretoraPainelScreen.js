import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, FlatList, Image } from 'react-native';
import { collection, getDocs, query, where, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DiretoraPainelScreen({ navigation }) {
  const [pendingBudgets, setPendingBudgets] = useState([]);
  const [assignedBudgets, setAssignedBudgets] = useState([]);
  const [atendimentos, setAtendimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [showModal, setShowModal] = useState(false);
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
      if (userStr) {
        const user = JSON.parse(userStr);
        setUserName(user.name);
        setUserInitials(getInitials(user.name));
        setCurrentUserId(user.id);
      }
      await loadData();
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const loadData = async () => {
    try {
      await Promise.all([loadPendingBudgets(), loadAssignedBudgets(), loadAtendimentos()]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPendingBudgets = async () => {
    try {
      const q = query(
        collection(db, 'budgets'),
        where('status', '==', 'analyzing')
      );
      const snapshot = await getDocs(q);
      const budgetsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(budget => !budget.assignedTo) // Apenas não atribuídos
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
          return dateB - dateA;
        });
      setPendingBudgets(budgetsData);
    } catch (error) {
      console.error('Erro ao carregar pedidos pendentes:', error);
    }
  };

  const loadAssignedBudgets = async () => {
    try {
      const q = query(
        collection(db, 'budgets'),
        where('status', '==', 'analyzing')
      );
      const snapshot = await getDocs(q);
      const budgetsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(budget => budget.assignedTo) // Apenas atribuídos
        .sort((a, b) => {
          const dateA = a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(0);
          const dateB = b.assignedAt?.toDate ? b.assignedAt.toDate() : new Date(0);
          return dateB - dateA;
        });
      setAssignedBudgets(budgetsData);
    } catch (error) {
      console.error('Erro ao carregar pedidos atribuídos:', error);
    }
  };

  const loadAtendimentos = async () => {
    try {
      // Buscar usuários do tipo "equipe" com cargo de atendimento
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('userType', '==', 'equipe'));
      const snapshot = await getDocs(q);
      
      const atendimentosData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => 
          user.active && 
          (user.roleName?.toLowerCase().includes('atendimento') && 
           !user.roleName?.toLowerCase().includes('diretora'))
        );
      
      setAtendimentos(atendimentosData);
    } catch (error) {
      console.error('Erro ao carregar atendimentos:', error);
    }
  };

  const handleAtribuir = (budget) => {
    setSelectedBudget(budget);
    setShowModal(true);
  };

  const confirmAtribuir = async (atendimentoId, atendimentoName) => {
    try {
      const budgetRef = doc(db, 'budgets', selectedBudget.id);
      await updateDoc(budgetRef, {
        assignedTo: atendimentoId,
        assignedToName: atendimentoName,
        assignedBy: currentUserId,
        assignedByName: userName,
        assignedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      alert(`✓ Projeto atribuído para ${atendimentoName}!`);
      setShowModal(false);
      setSelectedBudget(null);
      loadData();
    } catch (error) {
      console.error('Erro ao atribuir:', error);
      alert('Erro ao atribuir projeto');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getProjectName = (project) => {
    if (project.answers && project.answers['GApo1hcglkgdpAQGuSnn']) {
      return project.answers['GApo1hcglkgdpAQGuSnn'];
    }
    return project.eventTypeName || 'Evento';
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('loggedUser');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }]
    });
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
        <Text style={styles.subtitle}>Painel da Diretora</Text>
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
        {/* NOVOS PEDIDOS (Não Atribuídos) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Novos Pedidos</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingBudgets.length}</Text>
            </View>
          </View>

          {pendingBudgets.length > 0 ? (
            pendingBudgets.map(budget => (
              <TouchableOpacity
                key={budget.id}
                style={styles.budgetCard}
                onPress={() => navigation.navigate('BudgetDetail', { budgetId: budget.id })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.projectName}>{getProjectName(budget)}</Text>
                    <View style={styles.statusBadgeNew}>
                      <Text style={styles.statusText}>NOVO</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.projectType}>{budget.eventTypeName}</Text>
                <Text style={styles.projectClient}>Cliente: {budget.clientName}</Text>
                <Text style={styles.projectNumber}>#{budget.budgetNumber}</Text>
                <Text style={styles.projectDate}>Recebido: {formatDate(budget.createdAt)}</Text>

                <TouchableOpacity 
                  style={styles.btnAtribuir}
                  onPress={(e) => {
                    e.stopPropagation(); // Evita abrir detalhes ao clicar em atribuir
                    handleAtribuir(budget);
                  }}
                >
                  <LinearGradient
                    colors={['#00FFAA', '#00BFFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.btnGradient}
                  >
                    <Text style={styles.btnText}>Atribuir Atendimento</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Todos os pedidos foram atribuídos!</Text>
            </View>
          )}
        </View>

        {/* PROJETOS ATRIBUÍDOS */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Atribuídos</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{assignedBudgets.length}</Text>
            </View>
          </View>

          {assignedBudgets.length > 0 ? (
            assignedBudgets.map(budget => (
              <TouchableOpacity
                key={budget.id}
                style={styles.assignedCard}
                onPress={() => navigation.navigate('BudgetDetail', { budgetId: budget.id })}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.projectName}>{getProjectName(budget)}</Text>
                </View>

                <Text style={styles.projectType}>{budget.eventTypeName}</Text>
                <Text style={styles.projectClient}>Cliente: {budget.clientName}</Text>
                
                <View style={styles.assignedInfo}>
                  <Text style={styles.assignedLabel}>Atendimento:</Text>
                  <Text style={styles.assignedName}>{budget.assignedToName}</Text>
                </View>
                
                <Text style={styles.projectDate}>
                  Atribuído: {formatDate(budget.assignedAt)}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhum projeto atribuído ainda</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* MODAL ESCOLHER ATENDIMENTO */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Escolher Atendimento</Text>
            <Text style={styles.modalSubtitle}>
              Projeto: {selectedBudget ? getProjectName(selectedBudget) : ''}
            </Text>

            <FlatList
              data={atendimentos}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.atendimentoItem}
                  onPress={() => confirmAtribuir(item.id, item.name)}
                >
                  <View style={styles.atendimentoCircle}>
                    <Text style={styles.atendimentoInitials}>
                      {getInitials(item.name)}
                    </Text>
                  </View>
                  <View style={styles.atendimentoInfo}>
                    <Text style={styles.atendimentoName}>{item.name}</Text>
                    <Text style={styles.atendimentoRole}>{item.roleName}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <Text style={styles.emptyListText}>
                  Nenhum atendimento disponível
                </Text>
              )}
            />

            <TouchableOpacity
              style={styles.btnCancel}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  assignedCard: {
    backgroundColor: '#2A3E50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3A4E60',
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
  statusBadgeNew: {
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
  projectDate: {
    fontSize: 12,
    color: '#6B8499',
    marginBottom: 12,
  },
  
  // BOTÃO ATRIBUIR
  btnAtribuir: {
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  btnGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  
  // INFO ATRIBUÍDO
  assignedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  assignedLabel: {
    fontSize: 13,
    color: '#8BA4B8',
    marginRight: 6,
  },
  assignedName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00FFAA',
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
    fontSize: 14,
    color: '#8BA4B8',
    textAlign: 'center',
  },
  
  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#2A3E50',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8BA4B8',
    marginBottom: 20,
  },
  atendimentoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E40',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3A4E60',
  },
  atendimentoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00BFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  atendimentoInitials: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  atendimentoInfo: {
    flex: 1,
  },
  atendimentoName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  atendimentoRole: {
    fontSize: 13,
    color: '#8BA4B8',
  },
  emptyListText: {
    fontSize: 14,
    color: '#8BA4B8',
    textAlign: 'center',
    marginTop: 20,
  },
  btnCancel: {
    marginTop: 16,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FF6B6B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
});
