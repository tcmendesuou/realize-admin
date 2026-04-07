// timelineHelpers.js - Funções para gerenciar timeline de projetos

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Cria timeline a partir do fluxo do evento
 * @param {string} eventTypeId - ID do tipo de evento
 * @returns {Array} Timeline de tarefas
 */
export const createTimelineFromFlow = async (eventTypeId) => {
  try {
    // 1. Buscar fluxo do evento
    const flowDoc = await getDoc(doc(db, 'eventFlows', eventTypeId));
    if (!flowDoc.exists()) {
      throw new Error('Fluxo não encontrado');
    }

    const flowData = flowDoc.data();
    
    // 2. Buscar todas as tarefas
    const tasksSnapshot = await getDocs(collection(db, 'tasks'));
    const allTasks = tasksSnapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    }));

    // 3. Filtrar apenas tarefas do fluxo
    let flowTasks = [];
    
    if (flowData.items) {
      // Nova estrutura
      flowTasks = flowData.items
        .filter(item => item.itemType === 'task')
        .sort((a, b) => a.order - b.order)
        .map(flowItem => allTasks.find(t => t.id === flowItem.itemId))
        .filter(t => t !== undefined);
    }

    // 4. Criar timeline com datas calculadas
    const timeline = [];
    let currentDate = new Date();

    flowTasks.forEach((task, index) => {
      const timelineItem = {
        taskId: task.id,
        taskName: task.name,
        taskDescription: task.description || '',
        order: index + 1,
        status: index === 0 ? 'in_progress' : 'pending', // Primeira tarefa já inicia
        
        // Responsável (se definido)
        assignedTo: task.assignedTo || null,
        responsibleType: task.responsibleType,
        
        // Datas
        startDate: index === 0 ? currentDate : null,
        dueDate: new Date(currentDate.getTime() + (task.deadlineDays || 7) * 24 * 60 * 60 * 1000),
        completedDate: null,
        
        // Documentos necessários
        documentsNeeded: task.documentsNeeded || [],
        documents: [],
        
        // Prioridade
        priority: task.priority || 'neutral',
        
        // Observações
        notes: '',
        
        // Histórico
        history: [
          {
            action: 'created',
            date: currentDate,
            by: 'system'
          }
        ]
      };

      // Avançar data para próxima tarefa
      currentDate = new Date(currentDate.getTime() + (task.deadlineDays || 7) * 24 * 60 * 60 * 1000);
      
      timeline.push(timelineItem);
    });

    return timeline;
  } catch (error) {
    console.error('Erro ao criar timeline:', error);
    throw error;
  }
};

/**
 * Calcula progresso da timeline
 * @param {Array} timeline - Timeline de tarefas
 * @returns {Object} Objeto com estatísticas
 */
export const calculateProgress = (timeline) => {
  if (!timeline || timeline.length === 0) {
    return {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
      percentage: 0
    };
  }

  const total = timeline.length;
  const completed = timeline.filter(t => t.status === 'completed').length;
  const inProgress = timeline.filter(t => t.status === 'in_progress').length;
  const pending = timeline.filter(t => t.status === 'pending').length;
  const percentage = Math.round((completed / total) * 100);

  return {
    total,
    completed,
    inProgress,
    pending,
    percentage
  };
};

/**
 * Atribui responsável automaticamente baseado no tipo
 * @param {Object} timeline - Timeline
 * @param {Object} assignments - Mapa de atribuições { producer: userId, attendant: userId, ... }
 * @param {Array} users - Lista de usuários
 * @returns {Array} Timeline atualizada
 */
export const assignResponsibles = async (timeline, assignments, users) => {
  return timeline.map(task => {
    const userId = assignments[task.responsibleType];
    
    if (userId) {
      const user = users.find(u => u.id === userId);
      
      if (user) {
        return {
          ...task,
          assignedTo: {
            userId: user.id,
            userName: user.name,
            userRole: user.roleName
          }
        };
      }
    }
    
    return task;
  });
};

/**
 * Verifica se tarefa pode ser iniciada (dependências)
 * @param {Array} timeline - Timeline completa
 * @param {number} taskIndex - Índice da tarefa
 * @returns {boolean} Se pode iniciar
 */
export const canStartTask = (timeline, taskIndex) => {
  if (taskIndex === 0) return true; // Primeira tarefa sempre pode iniciar
  
  // Verifica se tarefa anterior está concluída
  const previousTask = timeline[taskIndex - 1];
  return previousTask.status === 'completed';
};

/**
 * Atualiza próxima tarefa ao concluir uma
 * @param {Array} timeline - Timeline
 * @param {number} completedTaskIndex - Índice da tarefa concluída
 * @returns {Array} Timeline atualizada
 */
export const updateNextTask = (timeline, completedTaskIndex) => {
  return timeline.map((task, index) => {
    // Se é a próxima tarefa e está pendente
    if (index === completedTaskIndex + 1 && task.status === 'pending') {
      return {
        ...task,
        status: 'in_progress',
        startDate: new Date(),
        history: [
          ...(task.history || []),
          {
            action: 'auto_started',
            date: new Date(),
            by: 'system',
            reason: 'previous_task_completed'
          }
        ]
      };
    }
    return task;
  });
};

/**
 * Gera resumo da timeline para exibição
 * @param {Array} timeline - Timeline
 * @returns {string} Texto do resumo
 */
export const getTimelineSummary = (timeline) => {
  const progress = calculateProgress(timeline);
  const currentTask = timeline.find(t => t.status === 'in_progress');
  
  let summary = `${progress.completed}/${progress.total} tarefas concluídas (${progress.percentage}%)`;
  
  if (currentTask) {
    summary += `\nAtual: ${currentTask.taskName}`;
  }
  
  return summary;
};

/**
 * Calcula se tarefa está atrasada
 * @param {Object} task - Tarefa
 * @returns {boolean} Se está atrasada
 */
export const isTaskOverdue = (task) => {
  if (task.status === 'completed') return false;
  if (!task.dueDate) return false;
  
  const now = new Date();
  const dueDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
  
  return now > dueDate;
};

/**
 * Calcula dias restantes até o prazo
 * @param {Object} task - Tarefa
 * @returns {number} Dias restantes (negativo se atrasado)
 */
export const getDaysUntilDue = (task) => {
  if (!task.dueDate) return null;
  
  const now = new Date();
  const dueDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
  
  const diffTime = dueDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
};
