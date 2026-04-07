import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function ProjectTimelineScreen({ route, navigation }) {
  const { projectId } = route.params;
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadProject();
  }, []);

  const loadProject = async () => {
    try {
      const projectDoc = await getDoc(doc(db, 'budgets', projectId));
      if (projectDoc.exists()) {
        setProject({ id: projectDoc.id, ...projectDoc.data() });
      } else {
        Alert.alert('Erro', 'Projeto não encontrado');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Erro ao carregar projeto:', error);
      Alert.alert('Erro', 'Não foi possível carregar o projeto');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async (taskId) => {
    Alert.alert(
      'Concluir Tarefa',
      'Tem certeza que deseja marcar esta tarefa como concluída?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Concluir',
          onPress: async () => {
            setUpdating(true);
            try {
              const updatedTimeline = project.timeline.map(task => {
                if (task.taskId === taskId) {
                  return {
                    ...task,
                    status: 'completed',
                    completedDate: new Date(),
                    history: [
                      ...(task.history || []),
                      {
                        action: 'completed',
                        date: new Date(),
                        by: 'currentUser' // TODO: Pegar usuário logado
                      }
                    ]
                  };
                }
                return task;
              });

              // Recalcular progresso
              const completed = updatedTimeline.filter(t => t.status === 'completed').length;
              const inProgress = updatedTimeline.filter(t => t.status === 'in_progress').length;
              const pending = updatedTimeline.filter(t => t.status === 'pending').length;
              const percentage = Math.round((completed / updatedTimeline.length) * 100);

              await updateDoc(doc(db, 'budgets', projectId), {
                timeline: updatedTimeline,
                progress: {
                  total: updatedTimeline.length,
                  completed,
                  inProgress,
                  pending,
                  percentage
                },
                updatedAt: new Date()
              });

              await loadProject();
              Alert.alert('Sucesso', 'Tarefa marcada como concluída!');
            } catch (error) {
              console.error('Erro ao atualizar:', error);
              Alert.alert('Erro', 'Não foi possível atualizar a tarefa');
            } finally {
              setUpdating(false);
            }
          }
        }
      ]
    );
  };

  const handleStartTask = async (taskId) => {
    setUpdating(true);
    try {
      const updatedTimeline = project.timeline.map(task => {
        if (task.taskId === taskId) {
          return {
            ...task,
            status: 'in_progress',
            startDate: new Date(),
            history: [
              ...(task.history || []),
              {
                action: 'started',
                date: new Date(),
                by: 'currentUser'
              }
            ]
          };
        }
        return task;
      });

      const completed = updatedTimeline.filter(t => t.status === 'completed').length;
      const inProgress = updatedTimeline.filter(t => t.status === 'in_progress').length;
      const pending = updatedTimeline.filter(t => t.status === 'pending').length;
      const percentage = Math.round((completed / updatedTimeline.length) * 100);

      await updateDoc(doc(db, 'budgets', projectId), {
        timeline: updatedTimeline,
        progress: {
          total: updatedTimeline.length,
          completed,
          inProgress,
          pending,
          percentage
        },
        updatedAt: new Date()
      });

      await loadProject();
      Alert.alert('Sucesso', 'Tarefa iniciada!');
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      Alert.alert('Erro', 'Não foi possível iniciar a tarefa');
    } finally {
      setUpdating(false);
    }
  };

  const handleAddNote = async (taskId) => {
    if (!noteText.trim()) {
      Alert.alert('Atenção', 'Digite uma observação');
      return;
    }

    setUpdating(true);
    try {
      const updatedTimeline = project.timeline.map(task => {
        if (task.taskId === taskId) {
          return {
            ...task,
            notes: task.notes ? `${task.notes}\n\n${noteText}` : noteText,
            history: [
              ...(task.history || []),
              {
                action: 'note_added',
                date: new Date(),
                by: 'currentUser',
                note: noteText
              }
            ]
          };
        }
        return task;
      });

      await updateDoc(doc(db, 'budgets', projectId), {
        timeline: updatedTimeline,
        updatedAt: new Date()
      });

      setNoteText('');
      await loadProject();
      Alert.alert('Sucesso', 'Observação adicionada!');
    } catch (error) {
      console.error('Erro ao adicionar nota:', error);
      Alert.alert('Erro', 'Não foi possível adicionar a observação');
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '●';
      case 'in_progress': return '●';
      case 'pending': return '○';
      default: return '○';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#27ae60';
      case 'in_progress': return '#3498db';
      case 'pending': return '#95a5a6';
      default: return '#95a5a6';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed': return 'Concluído';
      case 'in_progress': return 'Em Andamento';
      case 'pending': return 'Pendente';
      default: return 'Pendente';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Carregando timeline...</Text>
      </View>
    );
  }

  if (!project || !project.timeline) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Timeline não disponível</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonTop}>
          <Text style={styles.backButtonText}>← Voltar</Text>
        </TouchableOpacity>
        
        <View style={styles.projectInfo}>
          <Text style={styles.projectTitle}>{project.eventTypeName || 'Projeto'}</Text>
          <Text style={styles.projectNumber}>#{project.budgetNumber}</Text>
          <Text style={styles.projectClient}>{project.clientName}</Text>
        </View>

        {/* PROGRESS BAR */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progresso Geral</Text>
            <Text style={styles.progressPercentage}>{project.progress?.percentage || 0}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View 
              style={[
                styles.progressBarFill, 
                { width: `${project.progress?.percentage || 0}%` }
              ]} 
            />
          </View>
          <View style={styles.progressStats}>
            <Text style={styles.statCompleted}>{project.progress?.completed || 0} concluídas</Text>
            <Text style={styles.statInProgress}>{project.progress?.inProgress || 0} em andamento</Text>
            <Text style={styles.statPending}>{project.progress?.pending || 0} pendentes</Text>
          </View>
        </View>
      </View>

      {/* TIMELINE */}
      <ScrollView style={styles.timeline}>
        {project.timeline.map((task, index) => {
          const isExpanded = expandedTask === task.taskId;
          const isLast = index === project.timeline.length - 1;

          return (
            <View key={task.taskId} style={styles.timelineItem}>
              {/* LINHA VERTICAL */}
              {!isLast && <View style={styles.timelineLine} />}

              {/* CÍRCULO DE STATUS */}
              <View style={[styles.statusCircle, { backgroundColor: getStatusColor(task.status) }]}>
                <Text style={styles.statusIcon}>{getStatusIcon(task.status)}</Text>
              </View>

              {/* CARD DA TAREFA */}
              <TouchableOpacity 
                style={styles.taskCard}
                onPress={() => setExpandedTask(isExpanded ? null : task.taskId)}
                activeOpacity={0.7}
              >
                <View style={styles.taskHeader}>
                  <View style={styles.taskTitleContainer}>
                    <Text style={styles.taskOrder}>{task.order}.</Text>
                    <Text style={styles.taskName}>{task.taskName}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(task.status) }]}>
                    <Text style={styles.statusBadgeText}>{getStatusText(task.status)}</Text>
                  </View>
                </View>

                {/* INFO BÁSICA (SEMPRE VISÍVEL) */}
                <View style={styles.taskBasicInfo}>
                  {task.assignedTo && (
                    <Text style={styles.taskAssigned}>
                      {task.assignedTo.userName} ({task.assignedTo.userRole})
                    </Text>
                  )}
                  {task.dueDate && (
                    <Text style={styles.taskDueDate}>
                      Prazo: {formatDate(task.dueDate)}
                    </Text>
                  )}
                  {task.completedDate && (
                    <Text style={styles.taskCompletedDate}>
                      Concluído em: {formatDate(task.completedDate)}
                    </Text>
                  )}
                </View>

                {/* DETALHES EXPANDIDOS */}
                {isExpanded && (
                  <View style={styles.taskDetails}>
                    {task.notes && (
                      <View style={styles.notesSection}>
                        <Text style={styles.notesTitle}>Observações:</Text>
                        <Text style={styles.notesText}>{task.notes}</Text>
                      </View>
                    )}

                    {task.documents && task.documents.length > 0 && (
                      <View style={styles.documentsSection}>
                        <Text style={styles.documentsTitle}>Documentos:</Text>
                        {task.documents.map((doc, idx) => (
                          <Text key={idx} style={styles.documentItem}>{doc.name}</Text>
                        ))}
                      </View>
                    )}

                    {/* AÇÕES */}
                    <View style={styles.actionsSection}>
                      {task.status === 'pending' && (
                        <TouchableOpacity 
                          style={styles.btnStart}
                          onPress={() => handleStartTask(task.taskId)}
                          disabled={updating}
                        >
                          <Text style={styles.btnStartText}>Iniciar Tarefa</Text>
                        </TouchableOpacity>
                      )}

                      {task.status === 'in_progress' && (
                        <TouchableOpacity 
                          style={styles.btnComplete}
                          onPress={() => handleMarkComplete(task.taskId)}
                          disabled={updating}
                        >
                          <Text style={styles.btnCompleteText}>Marcar como Concluída</Text>
                        </TouchableOpacity>
                      )}

                      {task.status !== 'completed' && (
                        <View style={styles.addNoteSection}>
                          <TextInput
                            style={styles.noteInput}
                            placeholder="Adicionar observação..."
                            placeholderTextColor="#95a5a6"
                            value={noteText}
                            onChangeText={setNoteText}
                            multiline
                          />
                          <TouchableOpacity 
                            style={styles.btnAddNote}
                            onPress={() => handleAddNote(task.taskId)}
                            disabled={updating}
                          >
                            <Text style={styles.btnAddNoteText}>+ Adicionar</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* INDICADOR DE EXPANDIR */}
                <Text style={styles.expandIndicator}>
                  {isExpanded ? '▲ Recolher' : '▼ Ver detalhes'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#7f8c8d',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#e74c3c',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '600',
  },
  
  // HEADER
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButtonTop: {
    marginBottom: 16,
  },
  projectInfo: {
    marginBottom: 20,
  },
  projectTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  projectNumber: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  projectClient: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '600',
  },
  
  // PROGRESS
  progressContainer: {
    marginTop: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  progressPercentage: {
    fontSize: 16,
    fontWeight: '700',
    color: '#27ae60',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#27ae60',
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statCompleted: {
    fontSize: 12,
    color: '#27ae60',
  },
  statInProgress: {
    fontSize: 12,
    color: '#3498db',
  },
  statPending: {
    fontSize: 12,
    color: '#95a5a6',
  },
  
  // TIMELINE
  timeline: {
    flex: 1,
    padding: 24,
  },
  timelineItem: {
    position: 'relative',
    marginBottom: 24,
  },
  timelineLine: {
    position: 'absolute',
    left: 15,
    top: 40,
    bottom: -24,
    width: 2,
    backgroundColor: '#E0E0E0',
  },
  statusCircle: {
    position: 'absolute',
    left: 0,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  statusIcon: {
    fontSize: 14,
  },
  
  // TASK CARD
  taskCard: {
    marginLeft: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  taskTitleContainer: {
    flexDirection: 'row',
    flex: 1,
    marginRight: 8,
  },
  taskOrder: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3498db',
    marginRight: 6,
  },
  taskName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  taskBasicInfo: {
    marginBottom: 8,
  },
  taskAssigned: {
    fontSize: 14,
    color: '#2c3e50',
    marginBottom: 4,
  },
  taskDueDate: {
    fontSize: 14,
    color: '#e67e22',
    marginBottom: 4,
  },
  taskCompletedDate: {
    fontSize: 14,
    color: '#27ae60',
  },
  expandIndicator: {
    fontSize: 12,
    color: '#3498db',
    textAlign: 'center',
    marginTop: 8,
  },
  
  // DETALHES
  taskDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  notesSection: {
    marginBottom: 12,
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: 6,
  },
  notesText: {
    fontSize: 14,
    color: '#2c3e50',
    lineHeight: 20,
  },
  documentsSection: {
    marginBottom: 12,
  },
  documentsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: 6,
  },
  documentItem: {
    fontSize: 14,
    color: '#3498db',
    marginBottom: 4,
  },
  
  // AÇÕES
  actionsSection: {
    marginTop: 12,
  },
  btnStart: {
    backgroundColor: '#3498db',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnStartText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnComplete: {
    backgroundColor: '#27ae60',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnCompleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  addNoteSection: {
    marginTop: 8,
  },
  noteInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#2c3e50',
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  btnAddNote: {
    backgroundColor: '#95a5a6',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnAddNoteText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
