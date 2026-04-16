import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/TaskForm.css';

const ETAPAS_JOB = [
  { id: 'briefing',             label: '1. Briefing' },
  { id: 'reuniao_briefing',     label: '2. Reunião de Briefing' },
  { id: 'kickoff',              label: '3. Kick-off' },
  { id: 'paper',                label: '4. Reunião de Paper' },
  { id: 'planilha_inicial',     label: '5. Planilha Inicial' },
  { id: 'apresentacao_interna', label: '6. Reunião Pré-Apresentação' },
  { id: 'apresentacao_cliente', label: '7. Reunião de Apresentação' },
  { id: 'ajustes',              label: '8. Reunião de Ajustes' },
  { id: 'aprovacao',            label: '9. Aprovação' },
  { id: 'finalizacoes',         label: '10. Finalizações' },
  { id: 'caderno_artes',        label: '11. Caderno de Artes' },
  { id: 'book_producao',        label: '12. Book de Produção' },
  { id: 'passadao_interno',     label: '13. Passadão Interno' },
  { id: 'producao',             label: '14. Produção' },
  { id: 'entrega_job',          label: '15. Entrega do Job' },
  { id: 'fechamento_financeiro',label: '16. Fechamento Financeiro' },
  { id: 'reuniao_encerramento', label: '17. Reunião Encerramento' },
  { id: 'relatorio_cliente',    label: '18. Relatório Cliente' },
];

function TaskForm({ onClose, onSave, editTask }) {
  const [areas, setAreas] = useState([]);
  const [roles, setRoles] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [nextOrderNumber, setNextOrderNumber] = useState(1);

  const [formData, setFormData] = useState({
    name: '', description: '',
    areaId: '', areaName: '', roleId: '', roleName: '',
    requisicaoId: '', requisicaoCodigo: '', requisicaoNome: '',
    jobStage: '',
    isComum: false,
    priority: 'normal', deadlineDays: 7,
    required: true, active: true, order: 1,
    // Campos do Planner
    periodo: '', quantidade: '', custoUnitario: '',
    bvPct: '', credito: '', justificativa: '', observacao: '',
    campos: [], // campos dinâmicos habilitados
  });

  useEffect(() => {
    loadData();
    if (editTask) {
      setFormData({
        name: editTask.name || '',
        description: editTask.description || '',
        areaId: editTask.areaId || '',
        areaName: editTask.areaName || '',
        roleId: editTask.roleId || '',
        roleName: editTask.roleName || '',
        requisicaoId: editTask.requisicaoId || '',
        requisicaoCodigo: editTask.requisicaoCodigo || '',
        requisicaoNome: editTask.requisicaoNome || '',
        jobStage: editTask.jobStage || '',
        isComum: editTask.isComum || false,
        priority: editTask.priority || 'normal',
        deadlineDays: editTask.deadlineDays || 7,
        required: editTask.required !== undefined ? editTask.required : true,
        active: editTask.active !== undefined ? editTask.active : true,
        order: editTask.order || 1,
        periodo: editTask.periodo || '',
        quantidade: editTask.quantidade || '',
        custoUnitario: editTask.custoUnitario || '',
        bvPct: editTask.bvPct || '',
        credito: editTask.credito || '',
        justificativa: editTask.justificativa || '',
        observacao: editTask.observacao || '',
        campos: editTask.campos || [],
      });
    } else {
      loadNextOrder();
    }
  }, [editTask]);

  const loadData = async () => {
    try {
      const [areasSnap, rolesSnap, reqSnap] = await Promise.all([
        getDocs(collection(db, 'areas')),
        getDocs(collection(db, 'roles')),
        getDocs(collection(db, 'requisitions')),
      ]);
      setAreas(areasSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order||0)-(b.order||0)));
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order||0)-(b.order||0)));
      setRequisitions(reqSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.ativo !== false).sort((a, b) => (a.codigo||'').localeCompare(b.codigo||'')));
    } catch (e) { console.error(e); }
  };

  const loadNextOrder = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'tasks'), orderBy('order', 'desc')));
      const highest = snap.empty ? 0 : (snap.docs[0].data().order || 0);
      setNextOrderNumber(highest + 1);
      setFormData(prev => ({ ...prev, order: highest + 1 }));
    } catch (e) { console.error(e); }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'areaId') {
      const sel = areas.find(a => a.id === value);
      setFormData(p => ({ ...p, areaId: value, areaName: sel?.name || '', roleId: '', roleName: '' }));
    } else if (name === 'roleId') {
      const sel = roles.find(r => r.id === value);
      setFormData(p => ({ ...p, roleId: value, roleName: sel?.name || '' }));
    } else if (name === 'requisicaoId') {
      const req = requisitions.find(r => r.id === value);
      setFormData(p => ({ ...p, requisicaoId: value, requisicaoCodigo: req?.codigo || '', requisicaoNome: req?.nome || '', campos: req?.campos || [], bvPct: req?.defaults?.bvPct?.toString() || p.bvPct }));
    } else {
      setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const taskData = {
        name: formData.name, description: formData.description,
        areaId: formData.areaId, areaName: formData.areaName,
        roleId: formData.roleId, roleName: formData.roleName,
        requisicaoId: formData.requisicaoId, requisicaoCodigo: formData.requisicaoCodigo, requisicaoNome: formData.requisicaoNome,
        jobStage: formData.jobStage,
        isComum: formData.isComum,
        priority: formData.priority,
        deadlineDays: parseInt(formData.deadlineDays),
        required: formData.required, active: formData.active, order: formData.order,
        periodo: formData.periodo, quantidade: formData.quantidade, custoUnitario: formData.custoUnitario,
        bvPct: formData.bvPct, credito: formData.credito,
        justificativa: formData.justificativa, observacao: formData.observacao,
        campos: formData.campos,
        updatedAt: new Date(),
      };
      if (editTask) {
        await updateDoc(doc(db, 'tasks', editTask.id), taskData);
        alert('✓ Tarefa atualizada!');
      } else {
        taskData.createdAt = new Date();
        await addDoc(collection(db, 'tasks'), taskData);
        alert('✓ Tarefa criada!');
      }
      onSave();
    } catch (e) { console.error(e); alert('Erro ao salvar tarefa'); }
    finally { setSaving(false); }
  };

  const filteredRoles = roles.filter(r => r.areaId === formData.areaId);
  const reqSel = requisitions.find(r => r.id === formData.requisicaoId);
  const inp = { padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-with-number">
            <h2>{editTask ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
            {!editTask && <span className="task-number-badge">Tarefa #{nextOrderNumber}</span>}
          </div>
          {/* Comum a todos os jobs + Ativa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: formData.isComum ? '#00E5C4' : '#64748b', cursor: 'pointer' }}>
              <input type="checkbox" name="isComum" checked={formData.isComum} onChange={handleChange} />
              Comum a todos os jobs
            </label>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          {/* LINHA 1: Nome + Ordem */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Nome da Tarefa *</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Ex: Solicitar orçamento de buffet" required />
            </div>
            <div className="form-group" style={{ flex: '0 0 80px' }}>
              <label>Ordem</label>
              <input type="number" name="order" value={formData.order} onChange={handleChange} min="1" />
            </div>
          </div>

          {/* Descrição */}
          <div className="form-group">
            <label>Descrição / Instrução</label>
            <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Detalhes para quem vai executar..." rows="2" />
          </div>

          {/* LINHA 2: Requisição */}
          <div className="form-group">
            <label>Tipo de Requisição</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <button type="button" onClick={() => setFormData(p => ({ ...p, requisicaoId: '', requisicaoCodigo: '', requisicaoNome: '', campos: [] }))}
                style={{ padding: '4px 12px', borderRadius: 20, border: '1.5px solid #e2e8f0', background: !formData.requisicaoId ? '#f1f5f9' : 'white', color: !formData.requisicaoId ? '#64748b' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Nenhuma
              </button>
              {requisitions.map(r => (
                <button key={r.id} type="button" onClick={() => handleChange({ target: { name: 'requisicaoId', value: r.id } })}
                  style={{ padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${r.cor || '#667eea'}`, background: formData.requisicaoId === r.id ? (r.cor || '#667eea') : 'white', color: formData.requisicaoId === r.id ? 'white' : (r.cor || '#667eea'), fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {r.codigo}
                </button>
              ))}
              {reqSel && <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>{reqSel.nome}</span>}
            </div>
          </div>

          {/* LINHA 3: Área + Cargo + Prioridade */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Área Responsável</label>
              <select name="areaId" value={formData.areaId} onChange={handleChange}>
                <option value="">Selecione...</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Cargo Responsável</label>
              <select name="roleId" value={formData.roleId} onChange={handleChange} disabled={!formData.areaId}>
                <option value="">{!formData.areaId ? 'Selecione área...' : 'Selecione cargo...'}</option>
                {filteredRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '0 0 120px' }}>
              <label>Prioridade</label>
              <select name="priority" value={formData.priority} onChange={handleChange}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>

          {/* LINHA 4: Etapa do job + Prazo */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Etapa do Job (dispara a tarefa)</label>
              <select name="jobStage" value={formData.jobStage} onChange={handleChange}>
                <option value="">Sem etapa definida (manual)</option>
                {ETAPAS_JOB.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '0 0 110px' }}>
              <label>Prazo (dias)</label>
              <input type="number" name="deadlineDays" value={formData.deadlineDays} onChange={handleChange} min="1" />
            </div>
          </div>

          {/* Campos dinâmicos da requisição */}
          {reqSel && formData.campos.length > 0 && (
            <div style={{ background: '#f8faff', borderRadius: 8, padding: 14, border: `1px solid ${reqSel.cor || '#667eea'}33` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: reqSel.cor || '#667eea', marginBottom: 10, letterSpacing: 1 }}>
                REQUISIÇÃO {reqSel.codigo} — VALORES PADRÃO
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                {formData.campos.includes('periodo') && <div><label style={lbl}>Período (dias)</label><input type="number" name="periodo" min="0" value={formData.periodo} onChange={handleChange} style={inp} /></div>}
                {formData.campos.includes('quantidade') && <div><label style={lbl}>Quantidade</label><input type="number" name="quantidade" min="0" value={formData.quantidade} onChange={handleChange} style={inp} /></div>}
                {formData.campos.includes('custoUnitario') && <div><label style={lbl}>Custo Unitário (R$)</label><input type="number" name="custoUnitario" min="0" value={formData.custoUnitario} onChange={handleChange} style={inp} /></div>}
                {formData.campos.includes('bv') && <div><label style={lbl}>BV %</label><input type="number" name="bvPct" min="0" max="100" value={formData.bvPct} onChange={handleChange} style={inp} /></div>}
                {formData.campos.includes('credito') && <div><label style={lbl}>Crédito (R$)</label><input type="number" name="credito" min="0" value={formData.credito} onChange={handleChange} style={inp} /></div>}
              </div>
              {formData.campos.includes('justificativa') && <div style={{ marginTop: 8 }}><label style={lbl}>Justificativa padrão</label><input type="text" name="justificativa" value={formData.justificativa} onChange={handleChange} style={inp} /></div>}
              {formData.campos.includes('observacao') && <div style={{ marginTop: 8 }}><label style={lbl}>Observação padrão</label><input type="text" name="observacao" value={formData.observacao} onChange={handleChange} style={inp} /></div>}
            </div>
          )}

          {/* Checkboxes */}
          <div className="form-row" style={{ gap: '2rem' }}>
            <label className="qf-checkbox"><input type="checkbox" name="required" checked={formData.required} onChange={handleChange} /> Obrigatória</label>
            <label className="qf-checkbox"><input type="checkbox" name="active" checked={formData.active} onChange={handleChange} /> Ativa</label>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Salvando...' : (editTask ? 'Atualizar' : 'Criar Tarefa')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TaskForm;


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
