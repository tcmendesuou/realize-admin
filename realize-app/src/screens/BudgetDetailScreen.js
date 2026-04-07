import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function BudgetDetailScreen({ route, navigation }) {
  const { budgetId } = route.params;
  const [budget, setBudget] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadUserAndBudget();
  }, []);

  const loadUserAndBudget = async () => {
    try {
      const userStr = await AsyncStorage.getItem('loggedUser');
      if (userStr) {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
      }
      await loadBudgetDetails();
    } catch (error) {
      console.error('Erro ao carregar:', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados');
    }
  };

  const loadBudgetDetails = async () => {
    try {
      // Carregar budget
      const budgetDoc = await getDoc(doc(db, 'budgets', budgetId));
      if (!budgetDoc.exists()) {
        Alert.alert('Erro', 'Orçamento não encontrado');
        navigation.goBack();
        return;
      }

      const budgetData = { id: budgetDoc.id, ...budgetDoc.data() };
      setBudget(budgetData);

      // Carregar perguntas do fluxo
      const eventTypeId = budgetData.eventTypeId;
      if (eventTypeId) {
        const flowDoc = await getDoc(doc(db, 'eventFlows', eventTypeId));
        if (flowDoc.exists()) {
          const flowData = flowDoc.data();
          
          // Buscar apenas perguntas do fluxo
          const questionIds = flowData.items
            ?.filter(item => item.itemType === 'question')
            .map(item => item.itemId) || [];

          const questionsData = [];
          for (const qId of questionIds) {
            const qDoc = await getDoc(doc(db, 'questions', qId));
            if (qDoc.exists()) {
              questionsData.push({ id: qDoc.id, ...qDoc.data() });
            }
          }
          
          // Ordenar por ordem do fluxo
          questionsData.sort((a, b) => {
            const orderA = flowData.items.find(i => i.itemId === a.id)?.order || 0;
            const orderB = flowData.items.find(i => i.itemId === b.id)?.order || 0;
            return orderA - orderB;
          });

          setQuestions(questionsData);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
      Alert.alert('Erro', 'Não foi possível carregar detalhes');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    Alert.alert(
      'Aprovar Orçamento',
      'Tem certeza que deseja aprovar este orçamento? O projeto será iniciado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprovar',
          style: 'default',
          onPress: confirmApprove
        }
      ]
    );
  };

  const confirmApprove = async () => {
    setProcessing(true);
    try {
      const budgetRef = doc(db, 'budgets', budgetId);
      await updateDoc(budgetRef, {
        status: 'approved',
        approvedAt: Timestamp.now(),
        approvedBy: currentUser.id,
        approvedByName: currentUser.name,
        updatedAt: Timestamp.now()
      });

      Alert.alert(
        'Sucesso!',
        'Orçamento aprovado! O projeto foi iniciado.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error) {
      console.error('Erro ao aprovar:', error);
      Alert.alert('Erro', 'Não foi possível aprovar o orçamento');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = () => {
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert('Atenção', 'Por favor, informe o motivo da rejeição');
      return;
    }

    setProcessing(true);
    try {
      const budgetRef = doc(db, 'budgets', budgetId);
      await updateDoc(budgetRef, {
        status: 'rejected',
        rejectedAt: Timestamp.now(),
        rejectedBy: currentUser.id,
        rejectedByName: currentUser.name,
        rejectionReason: rejectReason,
        updatedAt: Timestamp.now()
      });

      setShowRejectModal(false);
      Alert.alert(
        'Orçamento Rejeitado',
        'O orçamento foi rejeitado e o cliente será notificado.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error) {
      console.error('Erro ao rejeitar:', error);
      Alert.alert('Erro', 'Não foi possível rejeitar o orçamento');
    } finally {
      setProcessing(false);
    }
  };

  const getAnswerDisplay = (question, answer) => {
    if (!answer) return 'Não respondido';

    switch (question.type) {
      case 'text':
      case 'number':
        return answer;
      
      case 'date':
        if (typeof answer === 'string') {
          return answer;
        }
        if (answer.toDate) {
          return answer.toDate().toLocaleDateString('pt-BR');
        }
        return answer;
      
      case 'yesno':
        return answer === 'yes' ? 'Sim' : 'Não';
      
      case 'multiple':
        const option = question.options?.find(opt => opt.id === answer);
        return option?.label || 'Não selecionado';
      
      case 'multiselect':
        if (!Array.isArray(answer)) return 'Não selecionado';
        const selectedOptions = question.options?.filter(opt => answer.includes(opt.id));
        return selectedOptions?.map(opt => opt.label).join(', ') || 'Não selecionado';
      
      default:
        return answer || 'Não informado';
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getProjectName = () => {
    if (budget?.answers && budget.answers['GApo1hcglkgdpAQGuSnn']) {
      return budget.answers['GApo1hcglkgdpAQGuSnn'];
    }
    return budget?.eventTypeName || 'Evento';
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
      case 'analyzing': return 'EM ANÁLISE';
      case 'approved': return 'APROVADO';
      case 'rejected': return 'REJEITADO';
      default: return 'AGUARDANDO';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D9FF" />
        <Text style={styles.loadingText}>Carregando detalhes...</Text>
      </View>
    );
  }

  if (!budget) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Orçamento não encontrado</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isApproved = budget.status === 'approved';
  const isRejected = budget.status === 'rejected';
  const canEdit = budget.status === 'analyzing';

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Voltar</Text>
          </TouchableOpacity>
          
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(budget.status) }]}>
            <Text style={styles.statusText}>{getStatusText(budget.status)}</Text>
          </View>
        </View>

        <Text style={styles.headerTitle}>{getProjectName()}</Text>
        <Text style={styles.headerSubtitle}>#{budget.budgetNumber}</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* INFORMAÇÕES DO CLIENTE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações do Cliente</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nome:</Text>
              <Text style={styles.infoValue}>{budget.clientName || 'Não informado'}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email:</Text>
              <Text style={styles.infoValue}>{budget.clientEmail || 'Não informado'}</Text>
            </View>
            
            {budget.clientPhone && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Telefone:</Text>
                <Text style={styles.infoValue}>{budget.clientPhone}</Text>
              </View>
            )}
            
            {budget.companyName && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Empresa:</Text>
                <Text style={styles.infoValue}>{budget.companyName}</Text>
              </View>
            )}
          </View>
        </View>

        {/* INFORMAÇÕES DO EVENTO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações do Evento</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tipo:</Text>
              <Text style={styles.infoValue}>{budget.eventTypeName}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Solicitado em:</Text>
              <Text style={styles.infoValue}>{formatDate(budget.createdAt)}</Text>
            </View>
            
            {budget.assignedToName && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Atendimento:</Text>
                <Text style={styles.infoValue}>{budget.assignedToName}</Text>
              </View>
            )}
            
            {budget.estimatedTotal > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Valor estimado:</Text>
                <Text style={styles.infoValueHighlight}>
                  R$ {budget.estimatedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* RESPOSTAS DO CLIENTE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Respostas do Cliente</Text>
          
          {questions.map((question) => (
            <View key={question.id} style={styles.answerCard}>
              <Text style={styles.questionText}>{question.text}</Text>
              <Text style={styles.answerText}>
                {getAnswerDisplay(question, budget.answers?.[question.id])}
              </Text>
            </View>
          ))}

          {questions.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhuma resposta disponível</Text>
            </View>
          )}
        </View>

        {/* INFO SE APROVADO */}
        {isApproved && (
          <View style={styles.section}>
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>Orçamento Aprovado</Text>
              <Text style={styles.successText}>
                Aprovado por {budget.approvedByName} em {formatDate(budget.approvedAt)}
              </Text>
            </View>
          </View>
        )}

        {/* INFO SE REJEITADO */}
        {isRejected && (
          <View style={styles.section}>
            <View style={styles.rejectCard}>
              <Text style={styles.rejectTitle}>Orçamento Rejeitado</Text>
              <Text style={styles.rejectText}>
                Rejeitado por {budget.rejectedByName} em {formatDate(budget.rejectedAt)}
              </Text>
              {budget.rejectionReason && (
                <>
                  <Text style={styles.rejectLabel}>Motivo:</Text>
                  <Text style={styles.rejectReason}>{budget.rejectionReason}</Text>
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* BOTÕES DE AÇÃO (só aparece se estiver em análise) */}
      {canEdit && (
        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.rejectButton}
            onPress={handleReject}
            disabled={processing}
          >
            <Text style={styles.rejectButtonText}>Rejeitar</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.approveButton}
            onPress={handleApprove}
            disabled={processing}
          >
            <LinearGradient
              colors={['#66BB6A', '#43A047']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.approveGradient}
            >
              {processing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.approveButtonText}>Aprovar Orçamento</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL DE REJEIÇÃO */}
      <Modal
        visible={showRejectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRejectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rejeitar Orçamento</Text>
            <Text style={styles.modalSubtitle}>
              Informe o motivo da rejeição para o cliente:
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Orçamento fora do prazo disponível..."
              placeholderTextColor="#8BA4B8"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmReject}
              >
                <Text style={styles.modalConfirmText}>Confirmar Rejeição</Text>
              </TouchableOpacity>
            </View>
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
  errorText: {
    fontSize: 18,
    color: '#EF5350',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // HEADER
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    backgroundColor: '#1A2E40',
    borderBottomWidth: 1,
    borderBottomColor: '#2A4256',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    color: '#00D9FF',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  
  // INFO CARD
  infoCard: {
    backgroundColor: '#2A3E50',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#3A4E60',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#8BA4B8',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  infoValueHighlight: {
    fontSize: 16,
    color: '#00FFAA',
    fontWeight: '700',
    flex: 2,
    textAlign: 'right',
  },
  
  // ANSWER CARD
  answerCard: {
    backgroundColor: '#2A3E50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3A4E60',
  },
  questionText: {
    fontSize: 14,
    color: '#8BA4B8',
    marginBottom: 8,
  },
  answerText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  
  // SUCCESS/REJECT CARDS
  successCard: {
    backgroundColor: '#2A3E50',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#66BB6A',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#66BB6A',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  rejectCard: {
    backgroundColor: '#2A3E50',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#EF5350',
  },
  rejectTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF5350',
    marginBottom: 8,
  },
  rejectText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  rejectLabel: {
    fontSize: 13,
    color: '#8BA4B8',
    marginBottom: 4,
  },
  rejectReason: {
    fontSize: 15,
    color: '#FFFFFF',
    fontStyle: 'italic',
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
  },
  
  // FOOTER BUTTONS
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    backgroundColor: '#1A2E40',
    borderTopWidth: 1,
    borderTopColor: '#2A4256',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#EF5350',
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF5350',
  },
  approveButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  approveGradient: {
    padding: 16,
    alignItems: 'center',
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  
  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#2A3E50',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8BA4B8',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#1A2E40',
    borderWidth: 1,
    borderColor: '#3A4E60',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#FFFFFF',
    minHeight: 100,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#8BA4B8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8BA4B8',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#EF5350',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
