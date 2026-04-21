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
    text: 'Reunião de Briefing',
    description: 'Data, hora, local e participantes da Reunião de Briefing',
    fields: [
      { label: 'Reunião de Briefing', type: 'fixed-reuniao' },
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
  // linkedTasks: { [itemId]: [taskId, ...] } — tarefas vinculadas a cada pergunta
  const [linkedTasks, setLinkedTasks] = useState({});
  const [linkingItemId, setLinkingItemId] = useState(null); // id da pergunta sendo editada

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
            // Divisor visual
            if (flowItem.itemType === 'divider') {
              return { id: flowItem.itemId, itemType: 'divider', text: flowItem.label || 'APROVAÇÃO DO CLIENTE' };
            }
            // Verificar primeiro nos blocos fixos
            if (flowItem.itemType === 'fixed-block') {
              // Bloco de reunião pode ter id dinâmico (fixed-block-reuniao-timestamp)
              if (flowItem.itemId.startsWith('fixed-block-reuniao')) {
                const base = FIXED_BLOCKS.find(b => b.id === 'fixed-block-reuniao');
                return base ? { ...base, id: flowItem.itemId, text: flowItem.label || base.text } : undefined;
              }
              return FIXED_BLOCKS.find(b => b.id === flowItem.itemId);
            }
            return allItems.find(item =>
              item.id === flowItem.itemId && item.itemType === flowItem.itemType
            );
          })
          .filter(item => item !== undefined);

        setFlowItems(orderedItems);
        // Carregar linkedTasks existentes
        setLinkedTasks(flowData.linkedTasks || {});
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

  const addDivider = () => {
    const divider = {
      id: `divider-${Date.now()}`,
      itemType: 'divider',
      text: 'APROVAÇÃO DO CLIENTE',
    };
    setFlowItems([...flowItems, divider]);
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
          label: item.text || item.name || '',
          order: index + 1
        })),
        updatedAt: new Date(),
        linkedTasks,
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
                  item.itemType === 'divider' ? (
                    <div key={`divider-${item.id}`}
                      className={`flow-item ${draggedOverIndex === index ? 'drag-over' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      style={{ padding: '0 8px', background: 'none', border: 'none', boxShadow: 'none', cursor: 'grab' }}>
                      <div className="flow-drag-handle" style={{ color: '#FFA726', opacity: 0.6 }}>⋮⋮</div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, #FFA72644, #FFA726, #FFA72644)', borderRadius: 2 }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#FFA726', letterSpacing: 1.5, whiteSpace: 'nowrap', padding: '2px 10px', borderRadius: 20, border: '1.5px solid #FFA72666', background: 'rgba(255,167,38,0.06)' }}>
                          ✓ {item.text}
                        </span>
                        <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, #FFA726, #FFA72644)', borderRadius: 2 }} />
                      </div>
                      <button className="btn-remove-from-flow" onClick={() => removeFromFlow(item.id, 'divider')} title="Remover divisor">✕</button>
                    </div>
                  ) : (
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
                        {/* Tarefas vinculadas — só para perguntas */}
                        {item.itemType === 'question' && (linkedTasks[item.id] || []).length > 0 && (
                          <span className="badge" style={{ background: 'rgba(102,126,234,0.15)', color: '#667eea' }}>
                            {(linkedTasks[item.id] || []).length} tarefa{(linkedTasks[item.id] || []).length > 1 ? 's' : ''} vinculada{(linkedTasks[item.id] || []).length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Botão vincular — só para perguntas */}
                    {item.itemType === 'question' && (
                      <button onClick={() => setLinkingItemId(item.id)} title="Vincular tarefas"
                        style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(102,126,234,0.3)', background: linkingItemId === item.id ? 'rgba(102,126,234,0.15)' : 'none', color: '#667eea', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontFamily: 'Outfit, sans-serif' }}>
                        ⚡
                      </button>
                    )}
                    <button
                      className="btn-remove-from-flow"
                      onClick={() => removeFromFlow(item.id, item.itemType)}
                      title="Remover do fluxo"
                    >
                      ✕
                    </button>
                  </div>
                  )
                ))
              )}
            </div>
            {/* Botão adicionar divisor */}
            <button onClick={addDivider}
              style={{ marginTop: 10, width: '100%', padding: '7px', borderRadius: 8, border: '1.5px dashed #FFA72666', background: 'none', color: '#FFA726', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              + Adicionar divisor "Aprovação do Cliente"
            </button>

            {/* Painel de vincular tarefas */}
            {linkingItemId && (() => {
              const question = flowItems.find(i => i.id === linkingItemId);
              const tasks = availableItems.filter(i => i.itemType === 'task');
              const selected = linkedTasks[linkingItemId] || [];
              return (
                <div style={{ marginTop: 12, padding: 14, background: 'rgba(102,126,234,0.06)', borderRadius: 10, border: '1px solid rgba(102,126,234,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#667eea' }}>Tarefas vinculadas a: <em style={{ fontWeight: 400 }}>{question?.text || question?.name}</em></span>
                    <button onClick={() => setLinkingItemId(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                  {tasks.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Nenhuma tarefa no banco. Crie tarefas na aba Tarefas do admin.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                      {tasks.map(t => {
                        const isSel = selected.includes(t.id);
                        return (
                          <button key={t.id} onClick={() => {
                            const updated = isSel ? selected.filter(id => id !== t.id) : [...selected, t.id];
                            setLinkedTasks(prev => ({ ...prev, [linkingItemId]: updated }));
                          }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, border: `1px solid ${isSel ? '#667eea' : 'rgba(102,126,234,0.15)'}`, background: isSel ? 'rgba(102,126,234,0.1)' : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif' }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSel ? '#667eea' : '#cbd5e1'}`, background: isSel ? '#667eea' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {isSel && <span style={{ color: 'white', fontSize: 10, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, color: isSel ? '#667eea' : '#1a2e40', fontWeight: isSel ? 600 : 400 }}>{t.name}</div>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{t.roleName || ''}{t.jobStage ? ` · Etapa: ${t.jobStage.replace(/_/g,' ')}` : ''}</div>
                            </div>
                            {t.requisicaoCodigo && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: '#667eea22', color: '#667eea' }}>{t.requisicaoCodigo}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div> {/* fecha event-flow */}

        </div> {/* fecha flow-builder-body */}

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
