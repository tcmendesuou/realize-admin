import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/TaskForm.css';

function TaskForm({ onClose, onSave, editTask, specialType }) {
  const [areas, setAreas] = useState([]);
  const [roles, setRoles] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    areaId: '',
    areaName: '',
    roleId: '',
    roleName: '',
    priority: 'neutral',
    deadlineDays: 7,
    documentsNeeded: [],
    required: true,
    active: true,
    order: 1,
    // Kickoff fields
    meetingDate: '',
    meetingTime: '',
    meetingLocation: '',
    meetingLink: '',
    agenda: ''
  });

  const [newDocument, setNewDocument] = useState('');
  const [saving, setSaving] = useState(false);
  const [nextOrderNumber, setNextOrderNumber] = useState(1);

  useEffect(() => {
    loadAreas();
    if (editTask) {
      setFormData({
        name: editTask.name || '',
        description: editTask.description || '',
        areaId: editTask.areaId || '',
        areaName: editTask.areaName || '',
        roleId: editTask.roleId || '',
        roleName: editTask.roleName || '',
        priority: editTask.priority || 'neutral',
        deadlineDays: editTask.deadlineDays || 7,
        documentsNeeded: editTask.documentsNeeded || [],
        required: editTask.required !== undefined ? editTask.required : true,
        active: editTask.active !== undefined ? editTask.active : true,
        order: editTask.order || 1,
        meetingDate: editTask.meetingDate || '',
        meetingTime: editTask.meetingTime || '',
        meetingLocation: editTask.meetingLocation || '',
        meetingLink: editTask.meetingLink || '',
        agenda: editTask.agenda || ''
      });
    } else if (specialType === 'kickoff') {
      setFormData(prev => ({
        ...prev,
        name: 'Reunião de Kickoff',
        description: 'Primeira reunião com o cliente para alinhamento inicial do projeto',
        priority: 'high',
        required: false
      }));
    } else {
      loadNextOrder();
    }
  }, [editTask, specialType]);

  const loadAreas = async () => {
    try {
      const [areasSnap, rolesSnap] = await Promise.all([
        getDocs(collection(db, 'areas')),
        getDocs(collection(db, 'roles')),
      ]);
      setAreas(areasSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (error) {
      console.error('Erro ao carregar áreas/cargos:', error);
    }
  };

  const loadNextOrder = async () => {
    try {
      const q = query(collection(db, 'tasks'), orderBy('order', 'desc'));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const highestOrder = querySnapshot.docs[0].data().order || 0;
        const nextOrder = highestOrder + 1;
        setNextOrderNumber(nextOrder);
        setFormData(prev => ({ ...prev, order: nextOrder }));
      }
    } catch (error) {
      console.error('Erro ao carregar próxima ordem:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'areaId') {
      const selected = areas.find(a => a.id === value);
      setFormData({ ...formData, areaId: value, areaName: selected?.name || '', roleId: '', roleName: '' });
    } else if (name === 'roleId') {
      const selected = roles.find(r => r.id === value);
      setFormData({ ...formData, roleId: value, roleName: selected?.name || '' });
    } else {
      setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    }
  };

  const addDocument = () => {
    if (newDocument.trim()) {
      setFormData({ ...formData, documentsNeeded: [...formData.documentsNeeded, newDocument.trim()] });
      setNewDocument('');
    }
  };

  const removeDocument = (index) => {
    setFormData({ ...formData, documentsNeeded: formData.documentsNeeded.filter((_, i) => i !== index) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const taskData = {
        name: formData.name,
        description: formData.description,
        areaId: formData.areaId,
        areaName: formData.areaName,
        roleId: formData.roleId,
        roleName: formData.roleName,
        priority: formData.priority,
        deadlineDays: parseInt(formData.deadlineDays),
        documentsNeeded: formData.documentsNeeded,
        required: formData.required,
        active: formData.active,
        order: formData.order,
        updatedAt: new Date()
      };

      if (specialType === 'kickoff' || (editTask && editTask.specialType === 'kickoff')) {
        taskData.specialType = 'kickoff';
        taskData.meetingDate = formData.meetingDate;
        taskData.meetingTime = formData.meetingTime;
        taskData.meetingLocation = formData.meetingLocation;
        taskData.meetingLink = formData.meetingLink;
        taskData.agenda = formData.agenda;
      }

      if (editTask) {
        await updateDoc(doc(db, 'tasks', editTask.id), taskData);
        alert('✓ Tarefa atualizada com sucesso!');
      } else {
        taskData.createdAt = new Date();
        await addDoc(collection(db, 'tasks'), taskData);
        alert('✓ Tarefa criada com sucesso!');
      }

      onSave();
    } catch (error) {
      console.error('Erro ao salvar tarefa:', error);
      alert('Erro ao salvar tarefa');
    } finally {
      setSaving(false);
    }
  };

  const isKickoff = specialType === 'kickoff' || (editTask && editTask.specialType === 'kickoff');
  const filteredRoles = roles.filter(r => r.areaId === formData.areaId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-with-number">
            <h2>{editTask ? 'Editar Tarefa' : (isKickoff ? 'Criar Reunião de Kickoff' : 'Nova Tarefa')}</h2>
            {!editTask && !isKickoff && (
              <span className="task-number-badge">Tarefa #{nextOrderNumber}</span>
            )}
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          {isKickoff && (
            <div className="special-notice kickoff-notice">
              <p><strong>⚠️ Tarefa Especial:</strong> Esta é a tarefa de Reunião de Kickoff.</p>
            </div>
          )}

          {/* INFORMAÇÕES BÁSICAS */}
          <div className="form-section">
            <h3 className="section-title">Informações Básicas</h3>

            <div className="form-group">
              <label>Nome da Tarefa *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ex: Escolher Buffet"
                required
                readOnly={isKickoff && !editTask}
              />
            </div>

            <div className="form-group">
              <label>Descrição</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Descreva os detalhes da tarefa..."
                rows="3"
              />
            </div>

            {/* RESPONSÁVEL: Área → Cargo */}
            <div className="form-row">
              <div className="form-group">
                <label>Área Responsável *</label>
                <select name="areaId" value={formData.areaId} onChange={handleChange} required={!isKickoff}>
                  <option value="">Selecione uma área...</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Cargo Responsável *</label>
                <select
                  name="roleId"
                  value={formData.roleId}
                  onChange={handleChange}
                  disabled={!formData.areaId}
                  required={!isKickoff}
                >
                  <option value="">
                    {!formData.areaId ? 'Selecione uma área primeiro...' : 'Selecione um cargo...'}
                  </option>
                  {filteredRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {formData.areaId && filteredRoles.length === 0 && (
                  <small className="helper-text">Nenhum cargo nesta área.</small>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Prioridade *</label>
                <select name="priority" value={formData.priority} onChange={handleChange} required>
                  <option value="neutral">Neutro</option>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>

              <div className="form-group">
                <label>Prazo (dias) *</label>
                <input
                  type="number"
                  name="deadlineDays"
                  value={formData.deadlineDays}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </div>
            </div>

            <div className="checkbox-group">
              <label>
                <input type="checkbox" name="required" checked={formData.required} onChange={handleChange} />
                Tarefa obrigatória
              </label>
            </div>

            <div className="checkbox-group">
              <label>
                <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} />
                Ativa (visível no app)
              </label>
            </div>
          </div>

          {/* SEÇÃO KICKOFF */}
          {isKickoff && (
            <div className="form-section kickoff-section">
              <h3 className="section-title">Detalhes da Reunião</h3>

              <div className="form-row">
                <div className="form-group">
                  <label>Data da Reunião</label>
                  <input type="date" name="meetingDate" value={formData.meetingDate} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Horário</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="time" name="meetingTime" value={formData.meetingTime} onChange={handleChange} style={{ flex: 1 }} />
                    <button type="button" onClick={() => setFormData({ ...formData, meetingTime: '' })}
                      className="btn-add-item" style={{ background: '#95a5a6', padding: '0 16px', fontSize: '12px' }}>
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Local da Reunião</label>
                <input type="text" name="meetingLocation" value={formData.meetingLocation} onChange={handleChange}
                  placeholder="Ex: Escritório, Restaurante X, etc." />
              </div>

              <div className="form-group">
                <label>Link da Reunião (Zoom, Meet, etc.)</label>
                <input type="url" name="meetingLink" value={formData.meetingLink} onChange={handleChange}
                  placeholder="https://..." />
              </div>

              <div className="form-group">
                <label>Pauta da Reunião</label>
                <textarea name="agenda" value={formData.agenda} onChange={handleChange}
                  placeholder="Liste os tópicos que serão discutidos na reunião..." rows="4" />
              </div>
            </div>
          )}

          {/* DOCUMENTOS NECESSÁRIOS */}
          <div className="form-section">
            <h3 className="section-title">Documentos Necessários</h3>
            <div className="add-item-group">
              <input
                type="text"
                value={newDocument}
                onChange={(e) => setNewDocument(e.target.value)}
                placeholder="Ex: Contrato assinado, RG, etc."
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addDocument())}
              />
              <button type="button" onClick={addDocument} className="btn-add-item">+ Adicionar</button>
            </div>
            {formData.documentsNeeded.length > 0 && (
              <ul className="items-list">
                {formData.documentsNeeded.map((doc, index) => (
                  <li key={index}>
                    <span>{doc}</span>
                    <button type="button" onClick={() => removeDocument(index)} className="btn-remove-item">Remover</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* BOTÕES */}
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Salvando...' : (editTask ? 'Atualizar Tarefa' : 'Criar Tarefa')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TaskForm;
