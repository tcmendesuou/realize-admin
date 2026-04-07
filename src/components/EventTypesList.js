import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/EventTypesList.css';

function EventTypesList() {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    active: true
  });

  useEffect(() => {
    loadEventTypes();
  }, []);

  const loadEventTypes = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'eventTypes'));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEventTypes(data);
    } catch (error) {
      console.error('Erro ao carregar tipos de eventos:', error);
      alert('Erro ao carregar tipos de eventos');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectType = (type) => {
    setSelectedType(type);
    setFormData({
      name: type.name || '',
      description: type.description || '',
      active: type.active !== undefined ? type.active : true
    });
  };

  const handleNewType = () => {
    setSelectedType(null);
    setFormData({
      name: '',
      description: '',
      active: true
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const typeData = {
        name: formData.name,
        description: formData.description,
        active: formData.active,
        updatedAt: new Date()
      };

      if (selectedType) {
        await updateDoc(doc(db, 'eventTypes', selectedType.id), typeData);
        alert('Tipo de evento atualizado!');
      } else {
        typeData.createdAt = new Date();
        await addDoc(collection(db, 'eventTypes'), typeData);
        alert('Tipo de evento criado!');
      }

      await loadEventTypes();
      handleNewType();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar tipo de evento');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedType) return;
    
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedType.name}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'eventTypes', selectedType.id));
      alert('Tipo de evento excluído!');
      await loadEventTypes();
      handleNewType();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir tipo de evento');
    }
  };

  const filteredTypes = eventTypes.filter(type =>
    type.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    type.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="event-types-container">
        <div className="loading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="event-types-container">
      <div className="event-types-header">
        <h1>Tipos de Eventos</h1>
        <p className="subtitle">Gerencie os tipos de eventos disponíveis</p>
      </div>

      <div className="two-panel-layout">
        {/* PAINEL 1: LISTA */}
        <div className="panel panel-list">
          <div className="panel-header">
            <h2>Tipos</h2>
            <button className="btn-new" onClick={handleNewType}>
              + Novo
            </button>
          </div>

          <div className="search-filters">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="types-list">
            {filteredTypes.length === 0 ? (
              <div className="empty-state">
                <p>Nenhum tipo encontrado</p>
              </div>
            ) : (
              filteredTypes.map(type => (
                <div
                  key={type.id}
                  className={`type-card ${selectedType?.id === type.id ? 'selected' : ''}`}
                  onClick={() => handleSelectType(type)}
                >
                  <div className="type-card-header">
                    <h3>{type.name}</h3>
                    <span className={`status-badge ${type.active ? 'active' : 'inactive'}`}>
                      {type.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {type.description && (
                    <p className="type-description">{type.description}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* PAINEL 2: FORMULÁRIO */}
        <div className="panel panel-form">
          <div className="panel-header">
            <h2>{selectedType ? 'Editar Tipo' : 'Novo Tipo'}</h2>
          </div>

          <div className="form-content">
            <div className="form-section">
              <div className="form-group">
                <label>Nome *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ex: Feira Regional"
                />
              </div>

              <div className="form-group">
                <label>Descrição</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Descrição do tipo de evento"
                  rows="4"
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="active"
                    checked={formData.active}
                    onChange={handleChange}
                  />
                  Tipo ativo
                </label>
              </div>
            </div>

            <div className="form-actions">
              {selectedType && (
                <button className="btn-delete" onClick={handleDelete} disabled={saving}>
                  Excluir
                </button>
              )}
              <button className="btn-cancel" onClick={handleNewType} disabled={saving}>
                Cancelar
              </button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EventTypesList;
