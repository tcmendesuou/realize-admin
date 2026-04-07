import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/FlowBuilder.css';

function FlowBuilder({ eventType, onClose }) {
  const [availableItems, setAvailableItems] = useState([]); // Perguntas + Tarefas
  const [flowItems, setFlowItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState(null);
  const [flowExists, setFlowExists] = useState(false);

  useEffect(() => {
    loadData();
  }, [eventType]);

  const loadData = async () => {
    try {
      // 1. Carregar PERGUNTAS
      const questionsQuery = query(
        collection(db, 'questions'),
        orderBy('order', 'asc')
      );
      
      const questionsSnapshot = await getDocs(questionsQuery);
      const questionsData = questionsSnapshot.docs.map(doc => ({
        id: doc.id,
        itemType: 'question', // Identificador do tipo
        ...doc.data()
      }));

      // Não filtrar mais por eventTypeId - mostrar TODAS as perguntas
      const relevantQuestions = questionsData;

      // 2. Carregar TAREFAS
      const tasksQuery = query(
        collection(db, 'tasks'),
        orderBy('order', 'asc')
      );
      
      const tasksSnapshot = await getDocs(tasksQuery);
      const tasksData = tasksSnapshot.docs.map(doc => ({
        id: doc.id,
        itemType: 'task', // Identificador do tipo
        ...doc.data()
      }));

      // 3. COMBINAR perguntas + tarefas
      const allItems = [...relevantQuestions, ...tasksData];
      setAvailableItems(allItems);

      // 4. Carregar fluxo existente (se houver)
      const flowDoc = await getDoc(doc(db, 'eventFlows', eventType.id));
      
      if (flowDoc.exists()) {
        setFlowExists(true);
        const flowData = flowDoc.data();
        
        // Montar array de itens na ordem do fluxo
        const orderedItems = flowData.items
          .sort((a, b) => a.order - b.order)
          .map(flowItem => {
            // Buscar o item completo (pergunta ou tarefa)
            return allItems.find(item => 
              item.id === flowItem.itemId && item.itemType === flowItem.itemType
            );
          })
          .filter(item => item !== undefined);

        setFlowItems(orderedItems);
        console.log('Fluxo carregado:', orderedItems.length, 'itens');
      } else {
        setFlowExists(false);
        console.log('Nenhum fluxo salvo para este tipo de evento');
      }

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar dados. Verifique o console.');
    } finally {
      setLoading(false);
    }
  };

  const addToFlow = (item) => {
    const alreadyInFlow = flowItems.find(i => i.id === item.id && i.itemType === item.itemType);
    if (alreadyInFlow) {
      alert('Este item já está no fluxo!');
      return;
    }
    setFlowItems([...flowItems, item]);
  };

  const removeFromFlow = (itemId, itemType) => {
    setFlowItems(flowItems.filter(i => !(i.id === itemId && i.itemType === itemType)));
  };

  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setDraggedOverIndex(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    
    if (draggedItem === null || draggedItem === dropIndex) {
      setDraggedItem(null);
      setDraggedOverIndex(null);
      return;
    }

    const newFlow = [...flowItems];
    const draggedFlowItem = newFlow[draggedItem];
    
    newFlow.splice(draggedItem, 1);
    newFlow.splice(dropIndex, 0, draggedFlowItem);
    
    setFlowItems(newFlow);
    setDraggedItem(null);
    setDraggedOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDraggedOverIndex(null);
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      // Preparar dados do fluxo (agora com perguntas E tarefas)
      const flowData = {
        eventTypeId: eventType.id,
        eventTypeName: eventType.name,
        items: flowItems.map((item, index) => ({
          itemId: item.id,
          itemType: item.itemType, // 'question' ou 'task'
          order: index + 1
        })),
        updatedAt: new Date()
      };

      await setDoc(doc(db, 'eventFlows', eventType.id), flowData);

      alert(`✓ Fluxo salvo com sucesso!\n\n${flowItems.length} itens no fluxo de ${eventType.name}`);
      
      setFlowExists(true);
      console.log('Fluxo salvo:', flowData);
      
    } catch (error) {
      console.error('Erro ao salvar fluxo:', error);
      alert('Erro ao salvar fluxo. Verifique o console.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFlow = async () => {
    if (!flowExists) {
      alert('Não há fluxo para excluir!');
      return;
    }

    const confirmDelete = window.confirm(
      `⚠️ ATENÇÃO!\n\nDeseja realmente EXCLUIR o fluxo de "${eventType.name}"?\n\nEsta ação NÃO pode ser desfeita!\n\nTodos os ${flowItems.length} itens do fluxo serão removidos.`
    );

    if (!confirmDelete) return;

    setDeleting(true);

    try {
      await deleteDoc(doc(db, 'eventFlows', eventType.id));
      
      alert(`✓ Fluxo de "${eventType.name}" excluído com sucesso!`);
      
      setFlowItems([]);
      setFlowExists(false);
      
      console.log('Fluxo excluído do Firestore');
      
    } catch (error) {
      console.error('Erro ao excluir fluxo:', error);
      alert('Erro ao excluir fluxo. Verifique o console.');
    } finally {
      setDeleting(false);
    }
  };

  const getItemDisplayText = (item) => {
    if (item.itemType === 'question') {
      return item.text;
    } else {
      return item.name;
    }
  };

  const getItemBadgeType = (item) => {
    if (item.itemType === 'question') {
      return item.type;
    } else {
      return 'task';
    }
  };

  const getItemBadgeRole = (item) => {
    if (item.itemType === 'question') {
      return item.responsibleRole;
    } else {
      return item.responsibleType;
    }
  };

  if (loading) {
    return (
      <div className="flow-builder-overlay">
        <div className="flow-builder-container">
          <div className="loading-message">
            <h2>Carregando...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-builder-overlay" onClick={onClose}>
      <div className="flow-builder-container" onClick={(e) => e.stopPropagation()}>
        
        <div className="flow-builder-header">
          <div className="header-info">
            <span className="event-icon">{eventType.icon}</span>
            <div>
              <h2>Editor de Fluxo: {eventType.name}</h2>
              <p>Arraste perguntas e tarefas do banco para o fluxo</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="flow-builder-body">
          
          <div className="questions-bank">
            <div className="column-header">
              <h3>Banco de Perguntas e Tarefas</h3>
              <span className="count">{availableItems.length} disponíveis</span>
            </div>
            
            <div className="questions-list">
              {availableItems.length === 0 ? (
                <div className="empty-state">
                  <p>Nenhum item disponível</p>
                  <small>Crie perguntas ou tarefas primeiro</small>
                </div>
              ) : (
                availableItems.map((item) => {
                  const isInFlow = flowItems.find(i => i.id === item.id && i.itemType === item.itemType);
                  
                  return (
                    <div 
                      key={`${item.itemType}-${item.id}`}
                      className={`question-item ${isInFlow ? 'in-flow' : ''}`}
                    >
                      <div className="question-drag-handle">⋮⋮</div>
                      <div className="question-content">
                        <span className="question-text">{getItemDisplayText(item)}</span>
                        <div className="question-badges">
                          <span className={`badge ${item.itemType === 'task' ? 'badge-task' : 'badge-type'}`}>
                            {item.itemType === 'task' ? 'TAREFA' : getItemBadgeType(item)}
                          </span>
                          <span className="badge badge-role">{getItemBadgeRole(item)}</span>
                        </div>
                      </div>
                      <button 
                        className="btn-add-to-flow"
                        onClick={() => addToFlow(item)}
                        disabled={isInFlow}
                        title={isInFlow ? 'Já está no fluxo' : 'Adicionar ao fluxo'}
                      >
                        {isInFlow ? '✓' : '→'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="event-flow">
            <div className="column-header">
              <h3>Fluxo do Evento</h3>
              <span className="count">{flowItems.length} itens</span>
            </div>
            
            <div className="flow-list">
              {flowItems.length === 0 ? (
                <div className="empty-state">
                  <p>O fluxo está vazio</p>
                  <small>Clique no botão → para adicionar itens</small>
                </div>
              ) : (
                flowItems.map((item, index) => (
                  <div 
                    key={`${item.itemType}-${item.id}`}
                    className={`flow-item ${draggedOverIndex === index ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flow-order">#{index + 1}</div>
                    <div className="flow-drag-handle">⋮⋮</div>
                    <div className="flow-content">
                      <span className="question-text">{getItemDisplayText(item)}</span>
                      <div className="question-badges">
                        <span className={`badge ${item.itemType === 'task' ? 'badge-task' : 'badge-type'}`}>
                          {item.itemType === 'task' ? 'TAREFA' : getItemBadgeType(item)}
                        </span>
                        <span className="badge badge-role">{getItemBadgeRole(item)}</span>
                      </div>
                    </div>
                    <button 
                      className="btn-remove-from-flow"
                      onClick={() => removeFromFlow(item.id, item.itemType)}
                      title="Remover do fluxo"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        <div className="flow-builder-footer">
          <div className="footer-left">
            <button className="btn-cancel" onClick={onClose}>
              Fechar
            </button>
            {flowExists && (
              <button 
                className="btn-delete-flow" 
                onClick={handleDeleteFlow}
                disabled={deleting}
              >
                {deleting ? 'Excluindo...' : '🗑️ Excluir Fluxo'}
              </button>
            )}
          </div>
          
          <button 
            className="btn-save" 
            onClick={handleSave}
            disabled={flowItems.length === 0 || saving}
          >
            {saving ? 'Salvando...' : `💾 Salvar Fluxo (${flowItems.length} itens)`}
          </button>
        </div>

      </div>
    </div>
  );
}

export default FlowBuilder;
