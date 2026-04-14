import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/QuestionForm.css';

const KANBAN_STAGES = [
  { value: 'novo_pedido',  label: 'Novo Pedido' },
  { value: 'orcamento',    label: 'Orçamento' },
  { value: 'cliente',      label: 'Cliente' },
  { value: 'kickoff',      label: 'Kick Off' },
  { value: 'criacao',      label: 'Criação' },
  { value: 'producao',     label: 'Produção' },
  { value: 'montagem',     label: 'Montagem' },
  { value: 'evento',       label: 'Evento' },
  { value: 'desmontagem',  label: 'Desmontagem' },
  { value: 'fechamento',   label: 'Fechamento' },
];

const QUESTION_TYPES = [
  { value: 'multiple',    label: 'Múltipla Escolha' },
  { value: 'multiselect', label: 'Seleção Múltipla' },
  { value: 'text',        label: 'Texto Curto' },
  { value: 'textarea',    label: 'Texto Longo' },
  { value: 'number',      label: 'Número' },
  { value: 'date',        label: 'Data' },
  { value: 'currency',    label: 'Valor em Reais' },
  { value: 'yesno',       label: 'Sim/Não' },
  { value: 'upload',      label: '📎 Upload de Arquivo' },
  { value: 'checklist',   label: '☑ Checklist (itens livres)' },
  // ── Perguntas Fixas ──
  { value: 'fixed-client',      label: '⚙ Cliente (Fixa)', fixed: true },
  { value: 'fixed-responsible', label: '⚙ Responsável (Fixa)', fixed: true },
  { value: 'fixed-attendant',   label: '⚙ Atendimento (Fixa)', fixed: true },
  { value: 'fixed-date',        label: '⚙ Data do Evento (Fixa)', fixed: true },
  { value: 'fixed-events',      label: '⚙ Múltiplos Eventos (Fixa)', fixed: true },
];

const FIXED_TYPES = ['fixed-client', 'fixed-responsible', 'fixed-attendant', 'fixed-date', 'fixed-events'];
const isFixedType = (type) => FIXED_TYPES.includes(type);

const newSubQuestion = (trigger = '') => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  trigger,
  text: '',
  type: 'text',
  required: false,
  options: [],
  subQuestions: [],
});

const newOption = () => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  label: '',
  basePrice: 0,
  pricePerPerson: 0,
});

// ─── Componente recursivo de subpergunta ───────────────────────────────────
function SubQuestionNode({ sub, depth, parentOptions, parentType, onChange, onRemove }) {
  const needsOptions = sub.type === 'multiple' || sub.type === 'multiselect';
  const canHaveChildren = !isFixedType(sub.type); // ✅ todos os tipos

  const depthColors = [
    { border: '#667eea', bg: '#f0f3ff', badge: '#667eea' },
    { border: '#00bcd4', bg: '#e0f7fa', badge: '#00bcd4' },
    { border: '#ff9800', bg: '#fff3e0', badge: '#ff9800' },
    { border: '#4caf50', bg: '#e8f5e9', badge: '#4caf50' },
    { border: '#e91e63', bg: '#fce4ec', badge: '#e91e63' },
  ];
  const color = depthColors[Math.min(depth, depthColors.length - 1)];

  const updateField = (field, value) => onChange({ ...sub, [field]: value });
  const updateOption = (optId, field, value) => onChange({ ...sub, options: sub.options.map(o => o.id === optId ? { ...o, [field]: value } : o) });
  const removeOption = (optId) => onChange({ ...sub, options: sub.options.filter(o => o.id !== optId) });
  const addOption = () => onChange({ ...sub, options: [...(sub.options || []), newOption()] });
  const addChild = () => {
    const trigger = sub.type === 'yesno' ? 'yes' : (sub.options[0]?.id || '');
    onChange({ ...sub, subQuestions: [...(sub.subQuestions || []), newSubQuestion(trigger)] });
  };
  const updateChild = (childId, updatedChild) => onChange({ ...sub, subQuestions: sub.subQuestions.map(c => c.id === childId ? updatedChild : c) });
  const removeChild = (childId) => onChange({ ...sub, subQuestions: sub.subQuestions.filter(c => c.id !== childId) });

  return (
    <div className="sq-node" style={{ borderLeftColor: color.border, background: color.bg }}>
      <div className="sq-node-header">
        <span className="sq-depth-badge" style={{ background: color.badge }}>
          {depth === 0 ? 'Subpergunta' : `Nível ${depth + 1}`}
        </span>
        <div className="sq-trigger-row">
          <span className="sq-trigger-label">Exibir se resposta for:</span>
          {parentType === 'yesno' ? (
            <select className="sq-trigger-select" value={sub.trigger} onChange={e => updateField('trigger', e.target.value)}>
              <option value="yes">SIM</option>
              <option value="no">NÃO</option>
            </select>
          ) : (parentType === 'multiple' || parentType === 'multiselect') ? (
            <select className="sq-trigger-select" value={sub.trigger} onChange={e => updateField('trigger', e.target.value)}>
              {parentOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label || '(sem nome)'}</option>
              ))}
            </select>
          ) : (
            // ✅ Tipos livres (number, text, date, etc.) — input de texto
            <input className="sq-trigger-select" type="text" value={sub.trigger}
              placeholder="Digite o valor que ativa..."
              onChange={e => updateField('trigger', e.target.value)} />
          )}
        </div>
        <button type="button" className="sq-remove-btn" onClick={onRemove}>✕ Remover</button>
      </div>

      <div className="sq-fields">
        <div className="sq-field-row">
          <div className="sq-field">
            <label>Texto da pergunta *</label>
            <input type="text" value={sub.text} placeholder="Ex: Qual nível de serviço?"
              onChange={e => updateField('text', e.target.value)} />
          </div>
          <div className="sq-field sq-field-sm">
            <label>Tipo de resposta</label>
            {/* ✅ Filtra fixas do select de subs */}
            <select value={sub.type} onChange={e => {
              const newType = e.target.value;
              const needsOpts = newType === 'multiple' || newType === 'multiselect';
              if (!needsOpts) onChange({ ...sub, type: newType, options: [] });
              else onChange({ ...sub, type: newType });
            }}>
              {QUESTION_TYPES.filter(t => !t.fixed).map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="sq-field sq-field-xs">
            <label>Obrigatória</label>
            <input type="checkbox" checked={sub.required} onChange={e => updateField('required', e.target.checked)} />
          </div>
        </div>

        {needsOptions && (
          <div className="sq-options">
            <div className="sq-options-header">
              <span>Opções</span>
              <button type="button" className="sq-add-option-btn" onClick={addOption}>+ Opção</button>
            </div>
            {(sub.options || []).map(opt => (
              <div key={opt.id} className="sq-option-row">
                <input type="text" placeholder="Nome da opção" value={opt.label}
                  onChange={e => updateOption(opt.id, 'label', e.target.value)} />
                <input type="number" placeholder="Preço fixo" value={opt.basePrice}
                  onChange={e => updateOption(opt.id, 'basePrice', e.target.value)} min="0" step="0.01" />
                <input type="number" placeholder="Por pessoa" value={opt.pricePerPerson}
                  onChange={e => updateOption(opt.id, 'pricePerPerson', e.target.value)} min="0" step="0.01" />
                <button type="button" className="sq-remove-opt-btn" onClick={() => removeOption(opt.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

        {canHaveChildren && depth < 4 && (
          <div className="sq-children">
            {(sub.subQuestions || []).map(child => (
              <SubQuestionNode
                key={child.id}
                sub={child}
                depth={depth + 1}
                parentOptions={sub.options || []}
                parentType={sub.type}
                onChange={updated => updateChild(child.id, updated)}
                onRemove={() => removeChild(child.id)}
              />
            ))}
            <button type="button" className="sq-add-child-btn" onClick={addChild}>
              + Adicionar subpergunta nível {depth + 2}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────
function QuestionForm({ onClose, onSave, editQuestion = null, specialType = null }) {
  const isEditMode = editQuestion !== null;
  const isSpecialMode = specialType !== null || (editQuestion && editQuestion.specialType);

  const [areas, setAreas] = useState([]);
  const [roles, setRoles] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    text: '', type: 'multiple',
    areaId: '', areaName: '',
    roleId: '', roleName: '',
    requisicaoId: '', requisicaoCodigo: '',
    kanbanStage: '',
    required: true, active: true, isShared: false,
    order: 1, specialType: specialType || null
  });

  const [options, setOptions] = useState([]);
  const [subQuestions, setSubQuestions] = useState([]);
  const showOptions = formData.type === 'multiple' || formData.type === 'multiselect';

  useEffect(() => {
    loadAreasRoles();
    if (isEditMode) {
      setFormData({
        text: editQuestion.text || '',
        type: editQuestion.type || 'multiple',
        areaId: editQuestion.areaId || '',
        areaName: editQuestion.areaName || '',
        roleId: editQuestion.roleId || '',
        roleName: editQuestion.roleName || '',
        requisicaoId: editQuestion.requisicaoId || '',
        requisicaoCodigo: editQuestion.requisicaoCodigo || '',
        kanbanStage: editQuestion.kanbanStage || '',
        required: editQuestion.required !== undefined ? editQuestion.required : true,
        active: editQuestion.active !== undefined ? editQuestion.active : true,
        isShared: editQuestion.isShared || false,
        order: editQuestion.order || 1,
        specialType: editQuestion.specialType || null
      });
      setOptions(editQuestion.options || []);
      setSubQuestions(editQuestion.subQuestions || []);
    } else if (specialType === 'initial') {
      setFormData(prev => ({ ...prev, text: 'Qual tipo de evento você deseja realizar?', type: 'multiple', specialType: 'initial', required: true, active: true, order: 0 }));
    } else if (specialType === 'finalization') {
      setFormData(prev => ({ ...prev, text: 'Finalizar e Enviar Orçamento', type: 'finalization', specialType: 'finalization', required: true, active: true, order: 999 }));
    } else {
      loadQuestionsForOrder();
    }
  }, [isEditMode, editQuestion, specialType]);

  const loadAreasRoles = async () => {
    try {
      const [areasSnap, rolesSnap, utSnap, reqSnap] = await Promise.all([
        getDocs(collection(db, 'areas')),
        getDocs(collection(db, 'roles')),
        getDocs(collection(db, 'userTypes')),
        getDocs(collection(db, 'requisitions')),
      ]);
      const agenciaTypeIds = utSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.systemRole === 'workspace' || t.systemRole === 'admin')
        .map(t => t.id);
      const allAreas = areasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const allRoles = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAreas(allAreas.filter(a => agenciaTypeIds.includes(a.userTypeId)).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setRoles(allRoles.filter(r => agenciaTypeIds.includes(r.userTypeId)).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setRequisitions(reqSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.ativo !== false).sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '')));
    } catch (error) {
      console.error('Erro ao carregar áreas/cargos:', error);
    }
  };

  const loadQuestionsForOrder = async () => {
    try {
      const q = query(collection(db, 'questions'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => (q.order || 0) < 999);
      const maxOrder = data.length > 0 ? Math.max(...data.map(q => q.order || 0)) : 0;
      setFormData(prev => ({ ...prev, order: maxOrder + 1 }));
    } catch (error) {
      console.error('Erro ao carregar ordem:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type: inputType, checked } = e.target;
    if (name === 'areaId') {
      const selected = areas.find(a => a.id === value);
      setFormData({ ...formData, areaId: value, areaName: selected?.name || '', roleId: '', roleName: '' });
    } else if (name === 'roleId') {
      const selected = roles.find(r => r.id === value);
      setFormData({ ...formData, roleId: value, roleName: selected?.name || '' });
    } else if (name === 'type') {
      setFormData({ ...formData, type: value });
      // ✅ Só limpa options, NUNCA subQuestions
      if (value !== 'multiple' && value !== 'multiselect') setOptions([]);
    } else {
      setFormData({ ...formData, [name]: inputType === 'checkbox' ? checked : value });
    }
  };

  const addOption = () => setOptions([...options, newOption()]);
  const updateOption = (id, field, value) => setOptions(options.map(o => o.id === id ? { ...o, [field]: value } : o));
  const removeOption = (id) => setOptions(options.filter(o => o.id !== id));
  const addSubQuestion = () => {
    const trigger = formData.type === 'yesno' ? 'yes' : (options[0]?.id || '');
    setSubQuestions([...subQuestions, newSubQuestion(trigger)]);
  };
  const updateSubQuestion = (id, updated) => setSubQuestions(subQuestions.map(s => s.id === id ? updated : s));
  const removeSubQuestion = (id) => setSubQuestions(subQuestions.filter(s => s.id !== id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const questionData = {
        ...formData,
        order: Number(formData.order),
        options: showOptions ? options.map(o => ({ ...o, basePrice: Number(o.basePrice), pricePerPerson: Number(o.pricePerPerson) })) : [],
        subQuestions,
        updatedAt: new Date()
      };
      if (isEditMode) {
        await updateDoc(doc(db, 'questions', editQuestion.id), questionData);
        alert('Pergunta atualizada com sucesso!');
      } else {
        questionData.createdAt = new Date();
        await addDoc(collection(db, 'questions'), questionData);
        alert('Pergunta criada com sucesso!');
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar pergunta');
    } finally {
      setLoading(false);
    }
  };

  const getModalTitle = () => {
    if (isEditMode) return formData.specialType === 'initial' ? 'Editar Pergunta Inicial' : formData.specialType === 'finalization' ? 'Editar Finalização' : 'Editar Pergunta';
    if (specialType === 'initial') return 'Criar Pergunta Inicial';
    if (specialType === 'finalization') return 'Criar Finalização';
    return 'Nova Pergunta';
  };

  const filteredRoles = roles.filter(r => r.areaId === formData.areaId);
  const isFixed = isFixedType(formData.type);
  const canHaveSubs = !isSpecialMode && !isFixed; // ✅ todos os tipos

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2>{getModalTitle()}</h2>
            {isFixed && <span className="qf-fixed-badge">⚙ FIXA</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {!isSpecialMode && !isFixed && (
              <>
                <label className={`qf-header-toggle ${formData.isShared ? 'qf-header-toggle--on' : ''}`}>
                  <input type="checkbox" name="isShared" checked={formData.isShared} onChange={handleChange} />
                  <span>🔗</span>
                  <span>Comum a todos os eventos</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>Requisição padrão:</span>
                  <select
                    value={formData.requisicaoId}
                    onChange={e => {
                      const req = requisitions.find(r => r.id === e.target.value);
                      setFormData(prev => ({ ...prev, requisicaoId: e.target.value, requisicaoCodigo: req?.codigo || '' }));
                    }}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', background: 'white', color: '#1a2e40' }}
                  >
                    <option value="">Nenhuma</option>
                    {requisitions.map(r => (
                      <option key={r.id} value={r.id}>{r.codigo} — {r.nome}</option>
                    ))}
                  </select>
                  {formData.requisicaoCodigo && (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: requisitions.find(r => r.id === formData.requisicaoId)?.cor + '22' || '#667eea22', color: requisitions.find(r => r.id === formData.requisicaoId)?.cor || '#667eea' }}>
                      {formData.requisicaoCodigo}
                    </span>
                  )}
                </div>
              </>
            )}
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {isSpecialMode && (
            <div className="special-notice">
              {formData.specialType === 'initial' && <p><strong>Pergunta Inicial:</strong> Primeira pergunta do questionário.</p>}
              {formData.specialType === 'finalization' && <p><strong>Finalização:</strong> Tela final de envio do orçamento.</p>}
            </div>
          )}

          {/* LINHA 1: Texto + Ordem */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Texto da Pergunta *</label>
              <input type="text" name="text" value={formData.text} onChange={handleChange}
                placeholder="Ex: Quantas pessoas vão participar?" required />
            </div>
            {!isSpecialMode && (
              <div className="form-group" style={{ flex: '0 0 100px' }}>
                <label>Ordem *</label>
                <input type="number" name="order" value={formData.order} onChange={handleChange} min="1" required />
              </div>
            )}
          </div>

          {!isSpecialMode && (
            <>
              {/* LINHA 2: Tipo + Área + Cargo */}
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Tipo de Resposta *</label>
                  <select name="type" value={formData.type} onChange={handleChange}>
                    {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Área Responsável</label>
                  <select name="areaId" value={formData.areaId} onChange={handleChange}>
                    <option value="">Selecione uma área...</option>
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
              </div>

              {/* LINHA 3: Etapa Kanban */}
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Etapa do Kanban</label>
                  <select name="kanbanStage" value={formData.kanbanStage} onChange={handleChange}>
                    <option value="">Selecione uma etapa...</option>
                    {KANBAN_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* PREVIEW PERGUNTA FIXA */}
          {isFixed && (
            <div className="qf-fixed-preview">
              {formData.type === 'fixed-client' && <><span>🏢</span><span>Abre lista dos <strong>clientes cadastrados</strong> para seleção</span></>}
              {formData.type === 'fixed-responsible' && <><span>👤</span><span>Abre lista dos <strong>usuários da equipe</strong> para seleção</span></>}
              {formData.type === 'fixed-attendant' && <><span>🎯</span><span>Preenchido automaticamente com o <strong>atendimento logado</strong> (editável)</span></>}
              {formData.type === 'fixed-date' && <><span>📅</span><span>Preenchido automaticamente com a <strong>data de hoje</strong> (editável)</span></>}
              {formData.type === 'fixed-events' && <><span>✂️</span><span>Define <strong>quantos eventos</strong> o briefing vai gerar — abre boxes de nome, local e data para cada um</span></>}
            </div>
          )}

          {/* PREVIEW UPLOAD */}
          {formData.type === 'upload' && (
            <div className="qf-upload-preview">
              <span>📎</span>
              <div>
                <strong>Upload de Arquivo</strong>
                <small>O atendimento poderá subir imagens ou documentos (PDF, JPG, PNG). Os arquivos serão salvos no Firebase Storage.</small>
              </div>
            </div>
          )}

          {/* PREVIEW CHECKLIST */}
          {formData.type === 'checklist' && (
            <div className="qf-upload-preview" style={{ background: '#f0fff4', border: '2px solid #86efac', color: '#166534' }}>
              <span>☑</span>
              <div>
                <strong>Checklist de Itens Livres</strong>
                <small>O atendimento cria os itens na hora. Ex: "100 pães de forma", "50 ovos". Cada item pode virar uma tarefa.</small>
              </div>
            </div>
          )}

          {/* CHECKBOXES */}
          <div className="form-row" style={{ gap: '2rem', marginBottom: '1rem' }}>
            <label className="qf-checkbox">
              <input type="checkbox" name="required" checked={formData.required} onChange={handleChange} />
              Obrigatória
            </label>
            <label className="qf-checkbox">
              <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} />
              Ativa
            </label>
          </div>

          {/* OPÇÕES DE RESPOSTA */}
          {showOptions && (
            <div className="options-section">
              <div className="options-header">
                <h3>Opções de Resposta</h3>
                <button type="button" className="btn-add-option" onClick={addOption}>+ Adicionar Opção</button>
              </div>
              {options.length === 0 && <p className="empty-options">Nenhuma opção adicionada.</p>}
              {options.map(opt => (
                <div key={opt.id} className="option-item">
                  <div className="option-field">
                    <label>Nome da Opção *</label>
                    <input type="text" placeholder="Ex: Buffet Completo" value={opt.label}
                      onChange={e => updateOption(opt.id, 'label', e.target.value)} />
                  </div>
                  <div className="option-field">
                    <label>Preço Fixo (R$)</label>
                    <input type="number" placeholder="0.00" value={opt.basePrice}
                      onChange={e => updateOption(opt.id, 'basePrice', e.target.value)} min="0" step="0.01" />
                  </div>
                  <div className="option-field">
                    <label>Por Pessoa (R$)</label>
                    <input type="number" placeholder="0.00" value={opt.pricePerPerson}
                      onChange={e => updateOption(opt.id, 'pricePerPerson', e.target.value)} min="0" step="0.01" />
                  </div>
                  <button type="button" className="btn-remove-option" onClick={() => removeOption(opt.id)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* SUBPERGUNTAS RECURSIVAS — ✅ para todos os tipos */}
          {canHaveSubs && (
            <div className="sq-section">
              <div className="sq-section-header">
                <div>
                  <h3>Perguntas Condicionais</h3>
                  <p className="sq-section-sub">Perguntas que aparecem dependendo da resposta. Cada uma pode ter suas próprias subperguntas.</p>
                </div>
                <button type="button" className="sq-add-root-btn" onClick={addSubQuestion}>
                  + Nova subpergunta
                </button>
              </div>
              {subQuestions.length === 0 && (
                <div className="sq-empty">Nenhuma subpergunta adicionada ainda.</div>
              )}
              {subQuestions.map(sub => (
                <SubQuestionNode
                  key={sub.id}
                  sub={sub}
                  depth={0}
                  parentOptions={options}
                  parentType={formData.type}
                  onChange={updated => updateSubQuestion(sub.id, updated)}
                  onRemove={() => removeSubQuestion(sub.id)}
                />
              ))}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-save" disabled={loading}>
              {loading ? 'Salvando...' : (isEditMode ? 'Atualizar Pergunta' : 'Salvar Pergunta')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuestionForm;
