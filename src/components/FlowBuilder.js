import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/FlowBuilder.css';

// ─── Blocos Fixos do Sistema ───────────────────────────────────────────────────
const FIXED_BLOCKS = [
  {
    id: 'fixed-block-briefing',
    itemType: 'fixed-block',
    text: 'Briefing Inicial',
    description: 'Cliente, Responsável, Atendimento, Data, Propósito e Feiras',
    fields: [
      { label: 'Cliente', type: 'fixed-client' },
      { label: 'Responsável', type: 'fixed-responsible' },
      { label: 'Atendimento', type: 'fixed-attendant' },
      { label: 'Data', type: 'fixed-date' },
      { label: 'Propósito', type: 'textarea' },
      { label: 'Feiras', type: 'fixed-events' },
    ],
  },
  {
    id: 'fixed-block-envio',
    itemType: 'fixed-block',
    text: 'Envio',
    description: 'Seleciona o responsável da agência que vai receber o briefing',
    fields: [
      { label: 'Encaminhar para', type: 'fixed-envio' },
    ],
  },
  {
    id: 'fixed-block-reuniao',
    itemType: 'fixed-block',
    text: 'Reunião',
    description: 'Tipo de reunião, data, hora, sala e participantes por cargo',
    fields: [
      { label: 'Reunião', type: 'fixed-reuniao' },
    ],
  },
];

function FlowBuilder({ eventType, onClose }) {
  const [availableItems, setAvailableItems] = useState([]);
  const [flowItems, setFlowItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState(null);
  const [flowExists, setFlowExists] = useState(false);
  const [filterFixas, setFilterFixas] = useState(true);
  const [filterVariaveis, setFilterVariaveis] = useState(true);
  const [filterTarefas, setFilterTarefas] = useState(true);
  const [filterEtapa, setFilterEtapa] = useState('');

  useEffect(() => {
    loadData();
  }, [eventType]);

  const loadData = async () => {
    try {
      // 1. Carregar PERGUNTAS
      const questionsQuery = query(collection(db, 'questions'), orderBy('order', 'asc'));
      const questionsSnapshot = await getDocs(questionsQuery);
      const questionsData = questionsSnapshot.docs.map(doc => ({
        id: doc.id,
        itemType: 'question',
        ...doc.data()
      }));

      // 2. Carregar TAREFAS
      const tasksQuery = query(collection(db, 'tasks'), orderBy('order', 'asc'));
      const tasksSnapshot = await getDocs(tasksQuery);
      const tasksData = tasksSnapshot.docs.map(doc => ({
        id: doc.id,
        itemType: 'task',
        ...doc.data()
      }));

      // 3. COMBINAR: blocos fixos primeiro, depois perguntas e tarefas
      const allItems = [...FIXED_BLOCKS, ...questionsData, ...tasksData];
      setAvailableItems(allItems);

      // 4. Carregar fluxo existente (se houver)
      const flowDoc = await getDoc(doc(db, 'eventFlows', eventType.id));

      if (flowDoc.exists()) {
        setFlowExists(true);
        const flowData = flowDoc.data();

        const orderedItems = flowData.items
          .sort((a, b) => a.order - b.order)
          .map(flowItem => {
            // Verificar primeiro nos blocos fixos
            if (flowItem.itemType === 'fixed-block') {
              return FIXED_BLOCKS.find(b => b.id === flowItem.itemId);
            }
            return allItems.find(item =>
              item.id === flowItem.itemId && item.itemType === flowItem.itemType
            );
          })
          .filter(item => item !== undefined);

        setFlowItems(orderedItems);
      } else {
        setFlowExists(false);
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
      const flowData = {
        eventTypeId: eventType.id,
        eventTypeName: eventType.name,
        items: flowItems.map((item, index) => ({
          itemId: item.id,
          itemType: item.itemType,
          order: index + 1
        })),
        updatedAt: new Date()
      };

      await setDoc(doc(db, 'eventFlows', eventType.id), flowData);
      alert(`✓ Fluxo salvo com sucesso!\n\n${flowItems.length} itens no fluxo de ${eventType.name}`);
      setFlowExists(true);
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
    } catch (error) {
      console.error('Erro ao excluir fluxo:', error);
      alert('Erro ao excluir fluxo. Verifique o console.');
    } finally {
      setDeleting(false);
    }
  };

  const getItemDisplayText = (item) => {
    if (item.itemType === 'fixed-block') return item.text;
    if (item.itemType === 'question') return item.text;
    return item.name;
  };

  const getItemBadgeType = (item) => {
    if (item.itemType === 'fixed-block') return 'BLOCO FIXO';
    if (item.itemType === 'task') return 'TAREFA';
    return item.type;
  };

  const getItemBadgeRole = (item) => {
    if (item.itemType === 'fixed-block') return item.description;
    if (item.itemType === 'question') return item.responsibleRole;
    return item.responsibleType;
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

            {/* ── FILTROS ── */}
            <div className="fb-filters">
              <div className="fb-filter-checks">
                <label className={`fb-check ${filterFixas ? 'on' : ''}`}>
                  <input type="checkbox" checked={filterFixas} onChange={e => setFilterFixas(e.target.checked)} />
                  Fixas
                </label>
                <label className={`fb-check ${filterVariaveis ? 'on' : ''}`}>
                  <input type="checkbox" checked={filterVariaveis} onChange={e => setFilterVariaveis(e.target.checked)} />
                  Variáveis
                </label>
                <label className={`fb-check ${filterTarefas ? 'on' : ''}`}>
                  <input type="checkbox" checked={filterTarefas} onChange={e => setFilterTarefas(e.target.checked)} />
                  Tarefas
                </label>
              </div>
              <select className="fb-filter-etapa" value={filterEtapa} onChange={e => setFilterEtapa(e.target.value)}>
                <option value="">Todas as etapas</option>
                {['novo_pedido','orcamento','cliente','kickoff','criacao','producao','montagem','evento','desmontagem','fechamento'].map(e => (
                  <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1).replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className="questions-list">
              {(() => {
                const filtered = availableItems.filter(item => {
                  if (item.itemType === 'fixed-block') return filterFixas;
                  if (item.itemType === 'task') return filterTarefas;
                  if (item.itemType === 'question') {
                    if (!filterVariaveis) return false;
                    if (filterEtapa && item.kanbanStage !== filterEtapa) return false;
                    return true;
                  }
                  return true;
                });
                if (filtered.length === 0) return (
                  <div className="empty-state"><p>Nenhum item</p><small>Ajuste os filtros</small></div>
                );
                return filtered.map((item) => {
                  const isInFlow = flowItems.find(i => i.id === item.id && i.itemType === item.itemType);
                  const isFixedBlock = item.itemType === 'fixed-block';

                  return (
                    <div
                      key={`${item.itemType}-${item.id}`}
                      className={`question-item ${isInFlow ? 'in-flow' : ''} ${isFixedBlock ? 'fixed-block-item' : ''}`}
                    >
                      <div className="question-drag-handle">⋮⋮</div>
                      <div className="question-content">
                        <span className="question-text">{getItemDisplayText(item)}</span>
                        <div className="question-badges">
                          <span className={`badge ${isFixedBlock ? 'badge-fixed-block-flow' : item.itemType === 'task' ? 'badge-task' : 'badge-type'}`}>
                            {getItemBadgeType(item)}
                          </span>
                          {getItemBadgeRole(item) && (
                            <span className="badge badge-role">{getItemBadgeRole(item)}</span>
                          )}
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
                });
              })()}
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
                    className={`flow-item ${draggedOverIndex === index ? 'drag-over' : ''} ${item.itemType === 'fixed-block' ? 'flow-item--fixed-block' : ''}`}
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
                        <span className={`badge ${item.itemType === 'fixed-block' ? 'badge-fixed-block-flow' : item.itemType === 'task' ? 'badge-task' : 'badge-type'}`}>
                          {getItemBadgeType(item)}
                        </span>
                        {getItemBadgeRole(item) && (
                          <span className="badge badge-role">{getItemBadgeRole(item)}</span>
                        )}
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
            <button className="btn-cancel" onClick={onClose}>Fechar</button>
            {flowExists && (
              <button className="btn-delete-flow" onClick={handleDeleteFlow} disabled={deleting}>
                {deleting ? 'Excluindo...' : '🗑️ Excluir Fluxo'}
              </button>
            )}
          </div>
          <button className="btn-save" onClick={handleSave} disabled={flowItems.length === 0 || saving}>
            {saving ? 'Salvando...' : `💾 Salvar Fluxo (${flowItems.length} itens)`}
          </button>
        </div>

      </div>
    </div>
  );
}

export default FlowBuilder;
