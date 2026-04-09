import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import FlowBuilder from './FlowBuilder';
import '../styles/FlowBuilder.css';

function FlowBuilderWrapper() {
  const [eventTypes, setEventTypes] = useState([]);
  const [selectedEventType, setSelectedEventType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal novo/editar tipo
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null); // null = novo
  const [typeForm, setTypeForm] = useState({ name: '', description: '' });

  useEffect(() => {
    loadEventTypes();
  }, []);

  const loadEventTypes = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'eventTypes'));
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setEventTypes(data);
    } catch (error) {
      console.error('Erro ao carregar tipos de evento:', error);
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditingType(null);
    setTypeForm({ name: '', description: '' });
    setShowModal(true);
  };

  const openEditModal = (et, e) => {
    e.stopPropagation();
    setEditingType(et);
    setTypeForm({ name: et.name || '', description: et.description || '' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingType(null);
    setTypeForm({ name: '', description: '' });
  };

  const handleSaveType = async () => {
    if (!typeForm.name.trim()) { alert('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      if (editingType) {
        await updateDoc(doc(db, 'eventTypes', editingType.id), {
          name: typeForm.name.trim(),
          description: typeForm.description.trim(),
          updatedAt: new Date()
        });
      } else {
        await addDoc(collection(db, 'eventTypes'), {
          name: typeForm.name.trim(),
          description: typeForm.description.trim(),
          active: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      await loadEventTypes();
      closeModal();
    } catch (error) {
      console.error('Erro ao salvar tipo:', error);
      alert('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteType = async (et, e) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir o tipo "${et.name}"? O fluxo vinculado também será removido.`)) return;
    try {
      await deleteDoc(doc(db, 'eventTypes', et.id));
      // tenta excluir o fluxo vinculado também
      try { await deleteDoc(doc(db, 'eventFlows', et.id)); } catch (_) {}
      await loadEventTypes();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir tipo');
    }
  };

  if (loading) {
    return <div className="flow-wrapper-container"><div className="loading">Carregando...</div></div>;
  }

  if (selectedEventType) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#fff' }}>
        <FlowBuilder eventType={selectedEventType} onClose={() => setSelectedEventType(null)} />
      </div>
    );
  }

  return (
    <div className="flow-wrapper-container">
      <div className="flow-wrapper-header">
        <div>
          <h2>Fluxos de Eventos</h2>
          <p className="subtitle">Gerencie os tipos de evento e configure seus fluxos de perguntas e tarefas</p>
        </div>
        <button className="btn-new-type" onClick={openNewModal}>+ Novo Tipo de Evento</button>
      </div>

      <div className="event-types-grid">
        {eventTypes.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum tipo de evento cadastrado</p>
            <p className="helper-text">Clique em "Novo Tipo de Evento" para começar</p>
            <button className="btn-configure" onClick={openNewModal} style={{ marginTop: 12 }}>
              + Criar primeiro tipo
            </button>
          </div>
        ) : (
          eventTypes.map(et => (
            <div key={et.id} className="event-type-card" onClick={() => setSelectedEventType(et)}>
              <div className="event-type-card-header">
                <h3>{et.name}</h3>
                <div className="event-type-card-actions">
                  <button className="btn-edit-type" onClick={e => openEditModal(et, e)} title="Editar">✏️</button>
                  <button className="btn-delete-type" onClick={e => handleDeleteType(et, e)} title="Excluir">🗑️</button>
                </div>
              </div>
              {et.description && <p className="description">{et.description}</p>}
              <button className="btn-configure">Configurar Fluxo →</button>
            </div>
          ))
        )}
      </div>

      {/* MODAL CRIAR/EDITAR TIPO */}
      {showModal && (
        <div className="fw-modal-overlay" onClick={closeModal}>
          <div className="fw-modal" onClick={e => e.stopPropagation()}>
            <div className="fw-modal-header">
              <h3>{editingType ? 'Editar Tipo de Evento' : 'Novo Tipo de Evento'}</h3>
              <button className="fw-modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="fw-modal-body">
              <div className="fw-field">
                <label>Nome *</label>
                <input
                  type="text"
                  value={typeForm.name}
                  onChange={e => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="Ex: Feira, Lançamento, Congresso..."
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveType()}
                />
              </div>
              <div className="fw-field">
                <label>Descrição</label>
                <textarea
                  value={typeForm.description}
                  onChange={e => setTypeForm({ ...typeForm, description: e.target.value })}
                  placeholder="Descreva brevemente este tipo de evento..."
                  rows={3}
                />
              </div>
            </div>
            <div className="fw-modal-footer">
              <button className="fw-btn-cancel" onClick={closeModal}>Cancelar</button>
              <button className="fw-btn-save" onClick={handleSaveType} disabled={saving}>
                {saving ? 'Salvando...' : (editingType ? 'Atualizar' : 'Criar Tipo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FlowBuilderWrapper;
