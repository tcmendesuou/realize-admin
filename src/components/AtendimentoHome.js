import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import ProjetoScreen from './ProjetoScreen';

const KANBAN_STAGES = [
  { id: 'novo_pedido',  label: 'Novo Pedido' },
  { id: 'orcamento',    label: 'Orçamento' },
  { id: 'cliente',      label: 'Cliente' },
  { id: 'kickoff',      label: 'Kick Off' },
  { id: 'criacao',      label: 'Criação' },
  { id: 'producao',     label: 'Produção' },
  { id: 'montagem',     label: 'Montagem' },
  { id: 'evento',       label: 'Evento' },
  { id: 'desmontagem',  label: 'Desmontagem' },
  { id: 'fechamento',   label: 'Fechamento' },
];

const TASK_STAGES = [
  { id: 'backlog',    label: 'Backlog',   color: '#7BAFD4' },
  { id: 'todo',       label: 'To Do',     color: '#FFA726' },
  { id: 'done',       label: 'Concluído', color: '#66BB6A' },
];

// ─── Definição dos campos do bloco fixo (espelho do FlowBuilder) ───────────
const FIXED_BLOCK_FIELDS = {
  'fixed-block-briefing': [
    { id: 'fixed-client',     label: 'Empresa Cliente',   type: 'fixed-client' },
    { id: 'fixed-responsible',label: 'Responsável',        type: 'fixed-responsible' },
    { id: 'fixed-attendant',  label: 'Atendimento',        type: 'fixed-attendant' },
    { id: 'fixed-date',       label: 'Data',               type: 'fixed-date' },
    { id: 'fixed-purpose',    label: 'Propósito',          type: 'textarea' },
    { id: 'fixed-events',     label: 'Quantas feiras?',    type: 'fixed-events' },
  ],
  'fixed-block-envio': [
    { id: 'fixed-envio',      label: 'Encaminhar para',    type: 'fixed-envio' },
  ]
};

export default function AtendimentoHome({ user, userData, onLogout }) {
  const [allBudgets, setAllBudgets] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskView, setTaskView] = useState('kanban');
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Briefing modal
  const [showBriefing, setShowBriefing] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [flowQuestions, setFlowQuestions] = useState([]);
  const [savingBriefing, setSavingBriefing] = useState(false);

  // Estado para feiras (bloco fixo-events)
  const [numFeiras, setNumFeiras] = useState('');
  const [feiras, setFeiras] = useState([]); // [{ nome, local, dataInicio, dataFim }]

  // Usuários clientes da empresa selecionada
  const [clientUsers, setClientUsers] = useState([]);

  // Controle de uploads em andamento por questionId
  const [uploadingFiles, setUploadingFiles] = useState({});

  // Envio — usuário da agência selecionado para receber o briefing
  const [agencyUsers, setAgencyUsers] = useState([]);
  const [envioFilterCargo, setEnvioFilterCargo] = useState('');
  const [envioUser, setEnvioUser] = useState(null); // { id, name, roleId, roleName }

  const [briefingForm, setBriefingForm] = useState({
    companyId: '', companyName: '',
    clientName: '', clientEmail: '', clientPhone: '',
    eventTypeId: '', eventTypeName: '',
    answers: {}
  });

  const userName = userData?.name || user?.email?.split('@')[0] || 'Usuário';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const userId = userData?.id;
  const userRoleId = userData?.roleId;
  const canOpenBriefing = userData?.permissions?.briefing?.create !== false;

  useEffect(() => {
    loadData();
    loadCompaniesAndEventTypes();
  }, [userId]);

  const loadData = async () => {
    try {
      await Promise.all([loadAllBudgets(), loadMyTasks()]);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllBudgets = async () => {
    const snap = await getDocs(collection(db, 'budgets'));
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Kanban de projetos mostra só os budgets mãe (isMae: true ou sem parentBudgetId)
    setAllBudgets(data.filter(b => b.isMae === true || !b.parentBudgetId));
  };

  const loadMyTasks = async () => {
    if (!userId) return;
    const snap = await getDocs(collection(db, 'budgets'));
    const tasks = [];
    snap.docs.forEach(d => {
      const budget = { id: d.id, ...d.data() };

      // Budgets filhos (feiras) atribuídos ao planner aparecem como tasks
      if (budget.parentBudgetId && budget.plannerUserId === userId) {
        tasks.push({
          taskId: budget.id,
          type: 'planejamento',
          name: budget.feiraData?.nome || `Feira ${(budget.feiraIndex || 0) + 1}`,
          projectId: budget.parentBudgetId,
          projectName: budget.eventTypeName || 'Evento',
          clientName: budget.companyName || budget.clientName,
          assignedTo: budget.plannerUserId,
          assignedToName: budget.plannerUserName,
          roleId: budget.plannerRoleId,
          status: budget.kanbanStage === 'fechamento' ? 'done' : budget.tasks?.[0]?.status || 'backlog',
          isBudgetChild: true,
          budgetId: budget.id,
        });
      }

      // Tasks normais dentro de qualquer budget
      (budget.tasks || []).forEach(task => {
        if (task.type !== 'planejamento' && (task.assignedTo === userId || task.roleId === userRoleId)) {
          tasks.push({ ...task, projectId: budget.id, projectName: getProjectName(budget), clientName: budget.companyName || budget.clientName });
        }
      });
    });
    setMyTasks(tasks);
  };

  const loadCompaniesAndEventTypes = async () => {
    try {
      const [compSnap, etSnap, utSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(query(collection(db, 'eventTypes'), where('active', '==', true))),
        getDocs(collection(db, 'userTypes')),
        getDocs(collection(db, 'users')),
      ]);
      const allUserTypes = utSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const clientTypeIds = allUserTypes
        .filter(t => t.systemRole !== 'workspace' && t.systemRole !== 'admin')
        .map(t => t.id);
      const agencyTypeIds = allUserTypes
        .filter(t => t.systemRole === 'workspace' || t.systemRole === 'admin')
        .map(t => t.id);
      const allCompanies = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCompanies(allCompanies.filter(c => clientTypeIds.includes(c.typeId)));
      setAgencyUsers(allUsers.filter(u => agencyTypeIds.includes(u.userTypeId) && u.active !== false));
      setEventTypes(etSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Erro ao carregar empresas/tipos:', err);
    }
  };

  const loadFlowQuestions = async (eventTypeId) => {
    try {
      const flowSnap = await getDocs(query(collection(db, 'eventFlows'), where('eventTypeId', '==', eventTypeId)));
      if (flowSnap.empty) { setFlowQuestions([]); return; }
      const flow = flowSnap.docs[0].data();
      const items = flow.items || [];

      const result = [];

      for (const item of items.sort((a, b) => a.order - b.order)) {
        if (item.itemType === 'fixed-block') {
          // Expande os campos do bloco fixo como perguntas virtuais
          const fields = FIXED_BLOCK_FIELDS[item.itemId] || [];
          fields.forEach(f => result.push({ ...f, isFixedBlockField: true }));
        } else if (item.itemType === 'question') {
          // Pergunta normal do Firestore
          const allQSnap = await getDocs(collection(db, 'questions'));
          const allQ = allQSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const found = allQ.find(q => q.id === item.itemId);
          if (found) result.push(found);
        }
      }

      setFlowQuestions(result);
    } catch (err) {
      console.error('Erro ao carregar fluxo:', err);
      setFlowQuestions([]);
    }
  };

  const handleEventTypeChange = async (eventTypeId) => {
    const et = eventTypes.find(e => e.id === eventTypeId);
    setBriefingForm(f => ({ ...f, eventTypeId, eventTypeName: et?.name || '', answers: {} }));
    setNumFeiras('');
    setFeiras([]);
    if (eventTypeId) await loadFlowQuestions(eventTypeId);
    else setFlowQuestions([]);
  };

  const handleAnswerChange = (questionId, value) => {
    setBriefingForm(f => ({ ...f, answers: { ...f.answers, [questionId]: value } }));
  };

  // Resposta por feira: answers[questionId] = { 0: 'Sim', 1: 'Não', ... }
  const handleAnswerFeiraChange = (questionId, feiraIndex, value) => {
    setBriefingForm(f => ({
      ...f,
      answers: {
        ...f.answers,
        [questionId]: { ...(f.answers[questionId] || {}), [feiraIndex]: value }
      }
    }));
  };

  const handleNumFeirasChange = (n) => {
    const num = parseInt(n) || 0;
    setNumFeiras(n);
    setFeiras(Array.from({ length: num }, (_, i) => feiras[i] || { nome: '', local: '', dataInicio: '', dataFim: '', isMae: i === 0 }));
  };

  const handleFeiraChange = (index, field, value) => {
    setFeiras(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  const handleSaveBriefing = async () => {
    if (!briefingForm.eventTypeId) { alert('Selecione o tipo de evento'); return; }
    if (!briefingForm.companyId) { alert('Selecione a empresa cliente'); return; }
    if (!briefingForm.clientName) { alert('Informe o nome do responsável'); return; }
    if (!envioUser) { alert('Selecione para quem enviar o briefing'); return; }

    setSavingBriefing(true);
    try {
      const allBudgetsSnap = await getDocs(collection(db, 'budgets'));
      const maxNum = allBudgetsSnap.docs.reduce((max, d) => Math.max(max, d.data().budgetNumber || 0), 1000);

      const commonAnswers = {
        ...briefingForm.answers,
        'fixed-events': feiras,
        'fixed-envio': { userId: envioUser.id, userName: envioUser.name, roleId: envioUser.roleId, roleName: envioUser.roleName },
      };

      const baseData = {
        clientId: briefingForm.companyId,
        clientName: briefingForm.clientName,
        clientEmail: briefingForm.clientEmail,
        clientPhone: briefingForm.clientPhone,
        companyName: briefingForm.companyName,
        eventTypeId: briefingForm.eventTypeId,
        eventTypeName: briefingForm.eventTypeName,
        status: 'analyzing',
        kanbanStage: 'novo_pedido',
        assignedTo: userId,
        assignedToName: userName,
        assignedBy: userId,
        assignedAt: serverTimestamp(),
        createdBy: 'atendimento',
        plannerUserId: envioUser.id,
        plannerUserName: envioUser.name,
        plannerRoleId: envioUser.roleId,
        plannerRoleName: envioUser.roleName,
        tasks: [],
        timeline: [{
          action: 'created',
          description: `Briefing aberto por ${userName} — encaminhado para ${envioUser.name}`,
          userId, userName,
          timestamp: new Date()
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // ── 1. Criar budget MÃE ──
      const maeRef = await addDoc(collection(db, 'budgets'), {
        ...baseData,
        budgetNumber: maxNum + 1,
        isMae: true,
        parentBudgetId: null,
        feiraIndex: null,
        feiraData: null,
        answers: commonAnswers,
      });

      // ── 2. Criar N budgets FILHOS (um por feira) ──
      const feiraPromises = feiras.map((feira, i) =>
        addDoc(collection(db, 'budgets'), {
          ...baseData,
          budgetNumber: maxNum + 2 + i,
          isMae: feira.isMae || false,
          parentBudgetId: maeRef.id,
          feiraIndex: i,
          feiraData: {
            nome: feira.nome || `Feira ${i + 1}`,
            local: feira.local || '',
            dataInicio: feira.dataInicio || '',
            dataFim: feira.dataFim || '',
            isMae: feira.isMae || false,
          },
          // Filhos herdam as answers comuns mas sem fixed-events (pertencem à mãe)
          answers: commonAnswers,
          tasks: [{
            taskId: `planner-${Date.now()}-${i}`,
            type: 'planejamento',
            name: `Planejar: ${feira.nome || `Feira ${i + 1}`}`,
            description: `Sessão de planejamento para ${feira.nome || `Feira ${i + 1}`}`,
            assignedTo: envioUser.id,
            assignedToName: envioUser.name,
            roleId: envioUser.roleId,
            roleName: envioUser.roleName,
            status: 'backlog',
            createdAt: new Date(),
          }],
        })
      );

      await Promise.all(feiraPromises);

      alert(`Briefing criado! ${feiras.length} feira(s) encaminhada(s) para ${envioUser.name}.`);
      setShowBriefing(false);
      setBriefingForm({ companyId: '', companyName: '', clientName: '', clientEmail: '', clientPhone: '', eventTypeId: '', eventTypeName: '', answers: {} });
      setFlowQuestions([]);
      setNumFeiras('');
      setFeiras([]);
      setEnvioUser(null);
      setEnvioFilterCargo('');
      await loadData();
    } catch (err) {
      console.error('Erro ao salvar briefing:', err);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSavingBriefing(false);
    }
  };

  const handleTaskStatusChange = async (task, newStatus) => {
    try {
      const budgetRef = doc(db, 'budgets', task.projectId);
      const budgetSnap = await getDocs(query(collection(db, 'budgets'), where('__name__', '==', task.projectId)));
      if (budgetSnap.empty) return;
      const budget = budgetSnap.docs[0].data();
      const updatedTasks = (budget.tasks || []).map(t =>
        t.taskId === task.taskId ? { ...t, status: newStatus } : t
      );
      await updateDoc(budgetRef, { tasks: updatedTasks, updatedAt: new Date() });
      await loadMyTasks();
    } catch (err) {
      console.error('Erro ao atualizar tarefa:', err);
    }
  };

  const getProjectName = (item) => {
    // Pega o nome da feira mãe de fixed-events
    const feiras = item.answers?.['fixed-events'];
    if (Array.isArray(feiras) && feiras.length > 0) {
      const mae = feiras.find(f => f.isMae) || feiras[0];
      if (mae?.nome) return mae.nome;
    }
    // Fallback legado
    if (item.answers?.['GApo1hcglkgdpAQGuSnn']) return item.answers['GApo1hcglkgdpAQGuSnn'];
    return item.eventTypeName || 'Evento';
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // ── Renderiza pergunta variável replicada por feira ─────────────────────────
  const renderQuestionPorFeira = (q) => {
    const base = {
      width: '100%', padding: '10px 14px', borderRadius: 8,
      border: '1px solid rgba(0,180,255,0.15)',
      background: 'rgba(255,255,255,0.04)', color: '#E8F4FF',
      fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none'
    };

    const renderInput = (feiraIndex) => {
      const val = (briefingForm.answers[q.id] || {})[feiraIndex] || '';

      if (q.type === 'yesno') {
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            {['Sim', 'Não'].map(opt => (
              <button key={opt} onClick={() => handleAnswerFeiraChange(q.id, feiraIndex, opt)} style={{
                ...base, width: 'auto', padding: '7px 18px', cursor: 'pointer',
                background: val === opt ? 'rgba(0,229,196,0.15)' : 'rgba(255,255,255,0.04)',
                borderColor: val === opt ? '#00E5C4' : 'rgba(0,180,255,0.15)',
                color: val === opt ? '#00E5C4' : '#E8F4FF'
              }}>{opt}</button>
            ))}
          </div>
        );
      }
      if (q.type === 'text' || q.type === 'number' || q.type === 'date') {
        return <input type={q.type} value={val}
          onChange={e => handleAnswerFeiraChange(q.id, feiraIndex, e.target.value)}
          style={base} placeholder="Sua resposta..." />;
      }
      if (q.type === 'textarea') {
        return <textarea value={val} rows={3}
          onChange={e => handleAnswerFeiraChange(q.id, feiraIndex, e.target.value)}
          style={{ ...base, resize: 'vertical', lineHeight: 1.5 }} />;
      }
      if (q.type === 'multiple' || q.type === 'multiselect') {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(q.options || []).map(opt => {
              const selected = q.type === 'multiple'
                ? val === opt.label
                : (Array.isArray(val) ? val.includes(opt.label) : false);
              return (
                <button key={opt.id} onClick={() => {
                  if (q.type === 'multiple') handleAnswerFeiraChange(q.id, feiraIndex, opt.label);
                  else {
                    const arr = Array.isArray(val) ? val : [];
                    handleAnswerFeiraChange(q.id, feiraIndex, selected ? arr.filter(v => v !== opt.label) : [...arr, opt.label]);
                  }
                }} style={{
                  ...base, width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: selected ? 'rgba(0,229,196,0.1)' : 'rgba(255,255,255,0.04)',
                  borderColor: selected ? '#00E5C4' : 'rgba(0,180,255,0.15)',
                  color: selected ? '#00E5C4' : '#E8F4FF'
                }}>{opt.label}</button>
              );
            })}
          </div>
        );
      }
      if (q.type === 'checklist') {
        const items = Array.isArray(val) ? val : [];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="text" value={item}
                  onChange={e => {
                    const updated = [...items];
                    updated[i] = e.target.value;
                    handleAnswerFeiraChange(q.id, feiraIndex, updated);
                  }}
                  style={{ ...base, flex: 1 }} placeholder={`Item ${i + 1}...`} />
                <button onClick={() => handleAnswerFeiraChange(q.id, feiraIndex, items.filter((_, idx) => idx !== i))}
                  style={{ ...base, width: 36, padding: 0, color: '#E74C3C', borderColor: 'rgba(231,76,60,0.3)', cursor: 'pointer', flexShrink: 0 }}>
                  ✕
                </button>
              </div>
            ))}
            <button onClick={() => handleAnswerFeiraChange(q.id, feiraIndex, [...items, ''])}
              style={{ ...base, cursor: 'pointer', color: '#00E5C4', borderColor: 'rgba(0,229,196,0.4)', borderStyle: 'dashed', textAlign: 'left' }}>
              + Adicionar item
            </button>
          </div>
        );
      }
      if (q.type === 'upload') {
        const key = `${q.id}_${feiraIndex}`;
        const uploading = uploadingFiles[key];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
              border: '1px dashed rgba(0,229,196,0.4)', background: 'rgba(0,229,196,0.04)',
              color: '#00E5C4', fontSize: 13, opacity: uploading ? 0.6 : 1
            }}>
              <span>📎</span>
              <span>{uploading ? 'Enviando...' : 'Clique para selecionar arquivo'}</span>
              <input type="file" accept="image/*,.pdf,.doc,.docx" style={{ display: 'none' }}
                disabled={uploading}
                onChange={e => handleUpload(q.id, e.target.files[0], feiraIndex)} />
            </label>
            {val && (
              <a href={val} target="_blank" rel="noopener noreferrer" style={{
                fontSize: 12, color: '#7BAFD4', textDecoration: 'underline',
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                ✓ Arquivo enviado — clique para visualizar
              </a>
            )}
          </div>
        );
      }
      return <input type="text" value={val}
        onChange={e => handleAnswerFeiraChange(q.id, feiraIndex, e.target.value)}
        style={base} placeholder="Sua resposta..." />;
    };

    // Subperguntas visíveis por feira
    const renderSubs = (feiraIndex) => {
      const val = (briefingForm.answers[q.id] || {})[feiraIndex] || '';
      if (!q.subQuestions || q.subQuestions.length === 0) return null;

      const activeSubs = q.subQuestions.filter(sub => {
        if (!sub.trigger) return false;
        if (q.type === 'yesno') return sub.trigger === 'yes' ? val === 'Sim' : val === 'Não';
        if (q.type === 'multiple' || q.type === 'multiselect') return sub.trigger === val || sub.trigger === (q.options?.find(o => o.label === val)?.id);
        // Tipos livres (text, number, etc.) — compara valor digitado com trigger
        return val.toString().trim().toLowerCase() === sub.trigger.toString().trim().toLowerCase();
      });

      if (activeSubs.length === 0) return null;

      const renderSubInput = (sub, subVal, feiraIdx) => {
        if (sub.type === 'yesno') {
          return (
            <div style={{ display: 'flex', gap: 8 }}>
              {['Sim', 'Não'].map(opt => (
                <button key={opt} onClick={() => handleAnswerFeiraChange(sub.id, feiraIdx, opt)} style={{
                  ...base, width: 'auto', padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                  background: subVal === opt ? 'rgba(0,229,196,0.15)' : 'rgba(255,255,255,0.04)',
                  borderColor: subVal === opt ? '#00E5C4' : 'rgba(0,180,255,0.15)',
                  color: subVal === opt ? '#00E5C4' : '#E8F4FF'
                }}>{opt}</button>
              ))}
            </div>
          );
        }
        if (sub.type === 'multiple' || sub.type === 'multiselect') {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(sub.options || []).map(opt => {
                const sel = sub.type === 'multiple' ? subVal === opt.label : (Array.isArray(subVal) ? subVal.includes(opt.label) : false);
                return (
                  <button key={opt.id} onClick={() => {
                    if (sub.type === 'multiple') handleAnswerFeiraChange(sub.id, feiraIdx, opt.label);
                    else {
                      const arr = Array.isArray(subVal) ? subVal : [];
                      handleAnswerFeiraChange(sub.id, feiraIdx, sel ? arr.filter(v => v !== opt.label) : [...arr, opt.label]);
                    }
                  }} style={{
                    ...base, width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: 12,
                    background: sel ? 'rgba(0,229,196,0.1)' : 'rgba(255,255,255,0.04)',
                    borderColor: sel ? '#00E5C4' : 'rgba(0,180,255,0.15)',
                    color: sel ? '#00E5C4' : '#E8F4FF'
                  }}>{opt.label}</button>
                );
              })}
            </div>
          );
        }
        if (sub.type === 'checklist') {
          const items = Array.isArray(subVal) ? subVal : [];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="text" value={item}
                    onChange={e => {
                      const updated = [...items];
                      updated[i] = e.target.value;
                      handleAnswerFeiraChange(sub.id, feiraIdx, updated);
                    }}
                    style={{ ...base, flex: 1, fontSize: 12 }} placeholder={`Item ${i + 1}...`} />
                  <button onClick={() => handleAnswerFeiraChange(sub.id, feiraIdx, items.filter((_, idx) => idx !== i))}
                    style={{ ...base, width: 30, padding: 0, color: '#E74C3C', borderColor: 'rgba(231,76,60,0.3)', cursor: 'pointer', flexShrink: 0, fontSize: 11 }}>
                    ✕
                  </button>
                </div>
              ))}
              <button onClick={() => handleAnswerFeiraChange(sub.id, feiraIdx, [...items, ''])}
                style={{ ...base, cursor: 'pointer', color: '#00E5C4', borderColor: 'rgba(0,229,196,0.4)', borderStyle: 'dashed', textAlign: 'left', fontSize: 12 }}>
                + Adicionar item
              </button>
            </div>
          );
        }
        if (sub.type === 'upload') {
          const key = `${sub.id}_${feiraIdx}`;
          const uploading = uploadingFiles[key];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
                border: '1px dashed rgba(0,229,196,0.4)', background: 'rgba(0,229,196,0.04)',
                color: '#00E5C4', fontSize: 12, opacity: uploading ? 0.6 : 1
              }}>
                <span>📎</span>
                <span>{uploading ? 'Enviando...' : 'Clique para selecionar arquivo'}</span>
                <input type="file" accept="image/*,.pdf,.doc,.docx" style={{ display: 'none' }}
                  disabled={uploading}
                  onChange={e => handleUpload(sub.id, e.target.files[0], feiraIdx)} />
              </label>
              {subVal && (
                <a href={subVal} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 11, color: '#7BAFD4', textDecoration: 'underline',
                  display: 'flex', alignItems: 'center', gap: 6
                }}>✓ Arquivo enviado — clique para visualizar</a>
              )}
            </div>
          );
        }
        return (
          <input type={sub.type === 'textarea' ? 'text' : (sub.type === 'currency' ? 'number' : sub.type)}
            value={subVal} onChange={e => handleAnswerFeiraChange(sub.id, feiraIdx, e.target.value)}
            style={{ ...base, fontSize: 12 }} placeholder="Sua resposta..." />
        );
      };

      return (
        <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid rgba(0,229,196,0.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeSubs.map(sub => {
            const subVal = (briefingForm.answers[sub.id] || {})[feiraIndex] || '';
            return (
              <div key={sub.id}>
                <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 6 }}>
                  {sub.text}{sub.required && <span style={{ color: '#E74C3C' }}> *</span>}
                </div>
                {renderSubInput(sub, subVal, feiraIndex)}
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div className="ws-question-item">
        <div className="ws-question-text">
          {q.text}{q.required && <span className="ws-question-required">*</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          {feiras.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.4)', fontStyle: 'italic' }}>
              Defina as feiras no bloco anterior para responder esta pergunta
            </div>
          ) : feiras.map((feira, feiraIndex) => (
            <div key={feiraIndex} style={{
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${feira.isMae ? 'rgba(0,229,196,0.2)' : 'rgba(0,180,255,0.08)'}`,
              borderRadius: 8, padding: '10px 12px'
            }}>
              <div style={{ fontSize: 11, color: feira.isMae ? '#00E5C4' : '#7BAFD4', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
                FEIRA {feiraIndex + 1}{feira.isMae ? ' — MÃE' : ''}{feira.nome ? ` — ${feira.nome}` : ''}
              </div>
              {renderInput(feiraIndex)}
              {renderSubs(feiraIndex)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const handleUpload = async (questionId, file, feiraIndex = null) => {
    if (!file) return;
    const key = feiraIndex !== null ? `${questionId}_${feiraIndex}` : questionId;
    setUploadingFiles(prev => ({ ...prev, [key]: true }));
    try {
      const path = `briefings/${briefingForm.eventTypeId}/${questionId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      if (feiraIndex !== null) {
        handleAnswerFeiraChange(questionId, feiraIndex, url);
      } else {
        handleAnswerChange(questionId, url);
      }
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      alert('Erro ao subir o arquivo. Tente novamente.');
    } finally {
      setUploadingFiles(prev => ({ ...prev, [key]: false }));
    }
  };

  const renderQuestionInput = (q) => {
    const val = briefingForm.answers[q.id] || '';
    const base = {
      width: '100%', padding: '10px 14px', borderRadius: 8,
      border: '1px solid rgba(0,180,255,0.15)',
      background: 'rgba(255,255,255,0.04)', color: '#E8F4FF',
      fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none'
    };

    // ── Campos do bloco fixo ──
    if (q.type === 'fixed-client') {
      return (
        <select value={briefingForm.companyId} onChange={async e => {
          const c = companies.find(x => x.id === e.target.value);
          setBriefingForm(f => ({ ...f, companyId: e.target.value, companyName: c?.name || '', clientName: '', clientUserId: '' }));
          // Busca usuários clientes da empresa selecionada
          if (e.target.value) {
            try {
              const usersSnap = await getDocs(query(collection(db, 'users'), where('companyId', '==', e.target.value)));
              setClientUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch { setClientUsers([]); }
          } else {
            setClientUsers([]);
          }
        }} style={{ ...base, color: '#E8F4FF' }}>
          <option value="" style={{ background: '#111f30', color: '#E8F4FF' }}>Selecione a empresa...</option>
          {companies.map(c => <option key={c.id} value={c.id} style={{ background: '#111f30', color: '#E8F4FF' }}>{c.name}</option>)}
        </select>
      );
    }
    if (q.type === 'fixed-responsible') {
      return (
        <select value={briefingForm.clientName} onChange={e => {
          setBriefingForm(f => ({ ...f, clientName: e.target.value }));
        }} style={{ ...base, color: '#E8F4FF' }} disabled={!briefingForm.companyId}>
          <option value="" style={{ background: '#111f30', color: '#E8F4FF' }}>
            {!briefingForm.companyId ? 'Selecione a empresa primeiro...' : 'Selecione o responsável...'}
          </option>
          {clientUsers.map(u => <option key={u.id} value={u.name} style={{ background: '#111f30', color: '#E8F4FF' }}>{u.name}</option>)}
        </select>
      );
    }
    if (q.type === 'fixed-attendant') {
      return (
        <input type="text" value={userName} readOnly
          style={{ ...base, opacity: 0.6, cursor: 'default' }} />
      );
    }
    if (q.type === 'fixed-date') {
      return (
        <input type="date"
          value={briefingForm.answers['fixed-date'] || new Date().toISOString().split('T')[0]}
          onChange={e => handleAnswerChange('fixed-date', e.target.value)}
          style={base} />
      );
    }
    if (q.type === 'fixed-events') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="number" min="1" max="20"
            value={numFeiras}
            onChange={e => handleNumFeirasChange(e.target.value)}
            placeholder="Quantas feiras?"
            style={base}
          />
          {feiras.map((f, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${f.isMae ? 'rgba(0,229,196,0.4)' : 'rgba(0,180,255,0.1)'}`, borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Header com label e checkbox feira mãe */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: f.isMae ? '#00E5C4' : '#7BAFD4', letterSpacing: 1, fontWeight: 600 }}>
                  FEIRA {i + 1}{f.isMae ? ' — MÃE' : ''}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7BAFD4', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!f.isMae}
                    onChange={() => {
                      // Só uma pode ser mãe — desmarca as outras
                      setFeiras(prev => prev.map((item, idx) => ({ ...item, isMae: idx === i })));
                    }}
                    style={{ accentColor: '#00E5C4', cursor: 'pointer' }}
                  />
                  Feira mãe
                </label>
              </div>
              {/* Nome */}
              <input type="text" placeholder="Nome da feira" value={f.nome}
                onChange={e => handleFeiraChange(i, 'nome', e.target.value)} style={base} />
              {/* Local */}
              <input type="text" placeholder="Local" value={f.local}
                onChange={e => handleFeiraChange(i, 'local', e.target.value)} style={base} />
              {/* Datas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, color: '#7BAFD4', letterSpacing: 0.5 }}>DATA INICIAL</span>
                  <input type="date" value={f.dataInicio || ''}
                    onChange={e => handleFeiraChange(i, 'dataInicio', e.target.value)} style={base} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, color: '#7BAFD4', letterSpacing: 0.5 }}>DATA FINAL</span>
                  <input type="date" value={f.dataFim || ''}
                    onChange={e => handleFeiraChange(i, 'dataFim', e.target.value)} style={base} />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // ── Bloco de Envio ──
    if (q.type === 'fixed-envio') {
      // Cargos únicos dos usuários da agência
      const cargos = [...new Set(agencyUsers.map(u => u.roleName).filter(Boolean))].sort();
      const filteredUsers = envioFilterCargo
        ? agencyUsers.filter(u => u.roleName === envioFilterCargo)
        : agencyUsers;

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Filtro de cargo */}
          <select value={envioFilterCargo} onChange={e => setEnvioFilterCargo(e.target.value)}
            style={{ ...base, color: '#E8F4FF' }}>
            <option value="" style={{ background: '#111f30' }}>Todos os cargos...</option>
            {cargos.map(c => <option key={c} value={c} style={{ background: '#111f30' }}>{c}</option>)}
          </select>
          {/* Lista de pessoas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredUsers.map(u => (
              <button key={u.id} onClick={() => setEnvioUser(u)} style={{
                ...base, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                background: envioUser?.id === u.id ? 'rgba(0,229,196,0.15)' : 'rgba(255,255,255,0.04)',
                borderColor: envioUser?.id === u.id ? '#00E5C4' : 'rgba(0,180,255,0.15)',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: envioUser?.id === u.id ? 'rgba(0,229,196,0.3)' : 'rgba(0,180,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: envioUser?.id === u.id ? '#00E5C4' : '#7BAFD4'
                }}>
                  {(u.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, color: envioUser?.id === u.id ? '#00E5C4' : '#E8F4FF', fontWeight: 500 }}>{u.name}</span>
                  <span style={{ fontSize: 11, color: '#7BAFD4' }}>{u.roleName || u.areaName || ''}</span>
                </div>
                {envioUser?.id === u.id && <span style={{ marginLeft: 'auto', color: '#00E5C4', fontSize: 16 }}>✓</span>}
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.4)', textAlign: 'center', padding: 12 }}>
                Nenhum usuário encontrado
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── Perguntas normais ──
    if (q.type === 'text' || q.type === 'number' || q.type === 'date') {
      return <input type={q.type} value={val} onChange={e => handleAnswerChange(q.id, e.target.value)} style={base} placeholder="Sua resposta..." />;
    }
    if (q.type === 'textarea') {
      return <textarea value={val} onChange={e => handleAnswerChange(q.id, e.target.value)}
        rows={4} placeholder="Descreva o propósito do evento..."
        style={{ ...base, resize: 'vertical', lineHeight: 1.5 }} />;
    }
    if (q.type === 'yesno') {
      return (
        <div style={{ display: 'flex', gap: 10 }}>
          {['Sim', 'Não'].map(opt => (
            <button key={opt} onClick={() => handleAnswerChange(q.id, opt)} style={{
              ...base, width: 'auto', padding: '8px 20px', cursor: 'pointer',
              background: val === opt ? 'rgba(0,229,196,0.15)' : 'rgba(255,255,255,0.04)',
              borderColor: val === opt ? '#00E5C4' : 'rgba(0,180,255,0.15)',
              color: val === opt ? '#00E5C4' : '#E8F4FF'
            }}>{opt}</button>
          ))}
        </div>
      );
    }
    if (q.type === 'multiple' || q.type === 'multiselect') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(q.options || []).map(opt => {
            const selected = q.type === 'multiple' ? val === opt.label : (Array.isArray(val) ? val.includes(opt.label) : false);
            return (
              <button key={opt.id} onClick={() => {
                if (q.type === 'multiple') handleAnswerChange(q.id, opt.label);
                else {
                  const arr = Array.isArray(val) ? val : [];
                  handleAnswerChange(q.id, selected ? arr.filter(v => v !== opt.label) : [...arr, opt.label]);
                }
              }} style={{
                ...base, width: '100%', textAlign: 'left', cursor: 'pointer',
                background: selected ? 'rgba(0,229,196,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: selected ? '#00E5C4' : 'rgba(0,180,255,0.15)',
                color: selected ? '#00E5C4' : '#E8F4FF'
              }}>{opt.label}</button>
            );
          })}
        </div>
      );
    }
    if (q.type === 'checklist') {
      const items = Array.isArray(val) ? val : [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="text" value={item}
                onChange={e => {
                  const updated = [...items];
                  updated[i] = e.target.value;
                  handleAnswerChange(q.id, updated);
                }}
                style={{ ...base, flex: 1 }} placeholder={`Item ${i + 1}...`} />
              <button onClick={() => handleAnswerChange(q.id, items.filter((_, idx) => idx !== i))}
                style={{ ...base, width: 36, padding: 0, color: '#E74C3C', borderColor: 'rgba(231,76,60,0.3)', cursor: 'pointer', flexShrink: 0 }}>
                ✕
              </button>
            </div>
          ))}
          <button onClick={() => handleAnswerChange(q.id, [...items, ''])}
            style={{ ...base, cursor: 'pointer', color: '#00E5C4', borderColor: 'rgba(0,229,196,0.4)', borderStyle: 'dashed', textAlign: 'left' }}>
            + Adicionar item
          </button>
        </div>
      );
    }
    if (q.type === 'upload') {
      const uploading = uploadingFiles[q.id];
      const url = val;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
            border: '1px dashed rgba(0,229,196,0.4)', background: 'rgba(0,229,196,0.04)',
            color: '#00E5C4', fontSize: 13, opacity: uploading ? 0.6 : 1
          }}>
            <span>📎</span>
            <span>{uploading ? 'Enviando...' : 'Clique para selecionar arquivo'}</span>
            <input type="file" accept="image/*,.pdf,.doc,.docx" style={{ display: 'none' }}
              disabled={uploading}
              onChange={e => handleUpload(q.id, e.target.files[0])} />
          </label>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12, color: '#7BAFD4', textDecoration: 'underline',
              display: 'flex', alignItems: 'center', gap: 6
            }}>
              ✓ Arquivo enviado — clique para visualizar
            </a>
          )}
        </div>
      );
    }
    return <input type="text" value={val} onChange={e => handleAnswerChange(q.id, e.target.value)} style={base} placeholder="Sua resposta..." />;
  };

  if (selectedProjectId) {
    return <ProjetoScreen projectId={selectedProjectId} onBack={() => setSelectedProjectId(null)} userData={userData} />;
  }

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={{ color: '#7BAFD4', fontSize: 14, marginTop: 12 }}>Carregando...</p>
      </div>
    );
  }

  const tasksByStage = (stageId) => myTasks.filter(t => (t.taskStatus || t.status || 'backlog') === stageId);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D1B2A; }
        .ws-wrap { min-height: 100vh; background: #0D1B2A; font-family: 'Outfit', sans-serif; color: #E8F4FF; display: flex; }

        /* SIDEBAR */
        .ws-sidebar {
          position: fixed; top: 0; left: 0; bottom: 0; width: 220px;
          background: rgba(10,22,38,0.97); border-right: 1px solid rgba(0,180,255,0.1);
          display: flex; flex-direction: column; z-index: 10; padding: 24px 0;
        }
        .ws-logo { padding: 0 20px 24px; border-bottom: 1px solid rgba(0,180,255,0.08); }
        .ws-logo-name { font-size: 17px; font-weight: 300; letter-spacing: 3px; color: #E8F4FF; }
        .ws-logo-name span { color: #00E5C4; font-weight: 500; }
        .ws-logo-sub { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: rgba(123,175,212,0.4); margin-top: 3px; }
        .ws-nav { flex: 1; padding: 16px 10px; display: flex; flex-direction: column; gap: 3px; }
        .ws-nav-item {
          display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px;
          font-size: 13px; font-weight: 300; color: #7BAFD4; cursor: pointer; transition: all 0.15s;
          border: none; background: none; width: 100%; text-align: left; font-family: 'Outfit', sans-serif;
        }
        .ws-nav-item:hover { background: rgba(0,229,196,0.06); color: #E8F4FF; }
        .ws-nav-item.active { background: rgba(0,229,196,0.1); color: #00E5C4; }
        .ws-nav-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .ws-sidebar-user {
          padding: 16px 14px 0; border-top: 1px solid rgba(0,180,255,0.08);
          display: flex; align-items: center; gap: 10px;
        }
        .ws-avatar {
          width: 34px; height: 34px; border-radius: 50%; background: rgba(0,229,196,0.15);
          border: 1.5px solid rgba(0,229,196,0.4); display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 500; color: #00E5C4; flex-shrink: 0;
        }
        .ws-user-name { font-size: 13px; font-weight: 400; color: #E8F4FF; }
        .ws-user-role { font-size: 10px; color: rgba(123,175,212,0.5); }
        .ws-logout {
          margin-left: auto; padding: 5px 8px; border-radius: 6px; background: none;
          border: 1px solid rgba(231,76,60,0.3); color: rgba(231,76,60,0.7); font-size: 11px;
          cursor: pointer; transition: all 0.15s; font-family: 'Outfit', sans-serif; white-space: nowrap;
        }
        .ws-logout:hover { background: rgba(231,76,60,0.1); color: #E74C3C; }

        /* MAIN */
        .ws-main { margin-left: 220px; min-height: 100vh; display: flex; flex-direction: column; width: calc(100vw - 220px); overflow-x: hidden; }

        /* HEADER */
        .ws-header {
          padding: 20px 32px; border-bottom: 1px solid rgba(0,180,255,0.08);
          background: rgba(10,22,38,0.6); backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: space-between;
          position: sticky; top: 0; z-index: 5;
        }
        .ws-header-left h1 { font-size: 20px; font-weight: 300; }
        .ws-header-left h1 strong { color: #00E5C4; font-weight: 500; }
        .ws-header-left p { font-size: 12px; color: #7BAFD4; margin-top: 2px; }
        .ws-btn-briefing {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 16px; border-radius: 10px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #00E5C4 0%, #0080FF 100%);
          color: #fff; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          transition: opacity 0.2s, transform 0.15s;
        }
        .ws-btn-briefing:hover { opacity: 0.9; transform: translateY(-1px); }

        /* SECTION TITLES */
        .ws-section { padding: 24px 32px; }
        .ws-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .ws-section-title { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #7BAFD4; }

        /* ─── KANBAN PROJETOS ─── */
        .ws-projects-kanban { display: grid; grid-template-columns: repeat(10, 1fr); gap: 10px; padding-bottom: 4px; }

        .ws-proj-col { min-width: 0; }
        .ws-proj-col-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px; padding: 0 2px;
        }
        .ws-proj-col-name { font-size: 11px; font-weight: 500; color: #7BAFD4; letter-spacing: 0.5px; }
        .ws-proj-col-count {
          width: 18px; height: 18px; border-radius: 50%;
          background: rgba(0,180,255,0.1); color: #7BAFD4;
          font-size: 10px; display: flex; align-items: center; justify-content: center;
        }
        .ws-proj-col.active .ws-proj-col-name { color: #00E5C4; }
        .ws-proj-col.active .ws-proj-col-count { background: rgba(0,229,196,0.15); color: #00E5C4; }

        .ws-proj-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(0,180,255,0.1);
          border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer;
          transition: all 0.15s;
        }
        .ws-proj-card:hover { background: rgba(255,255,255,0.06); border-color: rgba(0,229,196,0.3); transform: translateY(-1px); }
        .ws-proj-card-name { font-size: 12px; font-weight: 500; color: #E8F4FF; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-proj-card-client { font-size: 11px; color: rgba(123,175,212,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-proj-col-empty { font-size: 11px; color: rgba(123,175,212,0.2); text-align: center; padding: 12px 0; }

        /* ─── DIVISOR ─── */
        .ws-divider { height: 1px; background: rgba(0,180,255,0.06); margin: 0 32px; }

        /* ─── TOGGLE LISTA/KANBAN ─── */
        .ws-view-toggle { display: flex; gap: 6px; }
        .ws-toggle-btn {
          padding: 5px 12px; border-radius: 6px; border: 1px solid rgba(0,180,255,0.15);
          background: none; color: #7BAFD4; font-family: 'Outfit', sans-serif; font-size: 12px;
          cursor: pointer; transition: all 0.15s;
        }
        .ws-toggle-btn.active { background: rgba(0,229,196,0.1); border-color: rgba(0,229,196,0.3); color: #00E5C4; }

        /* ─── KANBAN TAREFAS ─── */
        .ws-tasks-kanban { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

        .ws-task-col { display: flex; flex-direction: column; }
        .ws-task-col-header {
          display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
          padding-bottom: 10px; border-bottom: 2px solid;
        }
        .ws-task-col-header.backlog { border-color: rgba(123,175,212,0.3); }
        .ws-task-col-header.todo { border-color: rgba(255,167,38,0.4); }
        .ws-task-col-header.done { border-color: rgba(102,187,106,0.4); }
        .ws-task-col-name { font-size: 13px; font-weight: 500; }
        .ws-task-col-name.backlog { color: #7BAFD4; }
        .ws-task-col-name.todo { color: #FFA726; }
        .ws-task-col-name.done { color: #66BB6A; }
        .ws-task-col-badge {
          padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500;
        }
        .ws-task-col-badge.backlog { background: rgba(123,175,212,0.1); color: #7BAFD4; }
        .ws-task-col-badge.todo { background: rgba(255,167,38,0.1); color: #FFA726; }
        .ws-task-col-badge.done { background: rgba(102,187,106,0.1); color: #66BB6A; }

        .ws-task-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(0,180,255,0.1);
          border-radius: 10px; padding: 14px 16px; margin-bottom: 10px;
          transition: all 0.15s;
        }
        .ws-task-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(0,180,255,0.2); }
        .ws-task-card-name { font-size: 13px; font-weight: 500; color: #E8F4FF; margin-bottom: 6px; }
        .ws-task-card-project { font-size: 11px; color: #00E5C4; margin-bottom: 8px; }
        .ws-task-card-client { font-size: 11px; color: rgba(123,175,212,0.5); margin-bottom: 10px; }
        .ws-task-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .ws-task-btn {
          padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer;
          border: 1px solid; background: none; font-family: 'Outfit', sans-serif; transition: all 0.15s;
        }
        .ws-task-btn.backlog { border-color: rgba(123,175,212,0.3); color: #7BAFD4; }
        .ws-task-btn.backlog:hover { background: rgba(123,175,212,0.1); }
        .ws-task-btn.todo { border-color: rgba(255,167,38,0.3); color: #FFA726; }
        .ws-task-btn.todo:hover { background: rgba(255,167,38,0.1); }
        .ws-task-btn.done { border-color: rgba(102,187,106,0.3); color: #66BB6A; }
        .ws-task-btn.done:hover { background: rgba(102,187,106,0.1); }

        .ws-task-empty {
          border: 1px dashed rgba(0,180,255,0.1); border-radius: 10px;
          padding: 24px; text-align: center; color: rgba(123,175,212,0.25); font-size: 12px;
        }

        /* ─── LISTA TAREFAS ─── */
        .ws-task-list { display: flex; flex-direction: column; gap: 8px; }
        .ws-task-list-item {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(0,180,255,0.1);
          border-radius: 10px; padding: 14px 18px;
          display: flex; align-items: center; gap: 16px;
        }
        .ws-task-list-status {
          width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
        }
        .ws-task-list-status.backlog { background: #7BAFD4; }
        .ws-task-list-status.todo { background: #FFA726; }
        .ws-task-list-status.done { background: #66BB6A; }
        .ws-task-list-info { flex: 1; min-width: 0; }
        .ws-task-list-name { font-size: 13px; font-weight: 500; color: #E8F4FF; }
        .ws-task-list-meta { font-size: 11px; color: rgba(123,175,212,0.5); margin-top: 3px; }
        .ws-task-list-actions { display: flex; gap: 6px; flex-shrink: 0; }

        /* MODAL BRIEFING */
        .ws-modal-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 40px 20px; overflow-y: auto;
        }
        .ws-modal {
          background: #111f30; border: 1px solid rgba(0,180,255,0.15);
          border-radius: 16px; width: 100%; max-width: 620px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .ws-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 22px 28px; border-bottom: 1px solid rgba(0,180,255,0.1);
        }
        .ws-modal-title { font-size: 17px; font-weight: 400; }
        .ws-modal-title span { color: #00E5C4; }
        .ws-modal-close {
          width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(0,180,255,0.15);
          background: none; color: #7BAFD4; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: all 0.15s;
          font-family: 'Outfit', sans-serif;
        }
        .ws-modal-close:hover { background: rgba(231,76,60,0.1); color: #E74C3C; border-color: rgba(231,76,60,0.3); }
        .ws-modal-body { padding: 24px 28px; display: flex; flex-direction: column; gap: 22px; }
        .ws-modal-section { display: flex; flex-direction: column; gap: 14px; }
        .ws-modal-section-title {
          font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase;
          color: #00E5C4; padding-bottom: 10px; border-bottom: 1px solid rgba(0,229,196,0.1);
        }
        .ws-field { display: flex; flex-direction: column; gap: 7px; }
        .ws-field label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #7BAFD4; }
        .ws-field input, .ws-field select {
          width: 100%; padding: 10px 14px; border-radius: 8px;
          border: 1px solid rgba(0,180,255,0.15); background: rgba(255,255,255,0.04);
          color: #E8F4FF; font-family: 'Outfit', sans-serif; font-size: 13px; outline: none;
        }
        .ws-field input:focus, .ws-field select:focus { border-color: rgba(0,229,196,0.4); }
        .ws-field select option { background: #111f30; color: #E8F4FF; }
        .ws-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ws-question-item { display: flex; flex-direction: column; gap: 8px; padding: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(0,180,255,0.08); border-radius: 10px; }
        .ws-question-text { font-size: 13px; color: #E8F4FF; line-height: 1.4; }
        .ws-question-required { color: #E74C3C; margin-left: 3px; }
        .ws-modal-footer {
          display: flex; gap: 12px; padding: 18px 28px;
          border-top: 1px solid rgba(0,180,255,0.1);
        }
        .ws-btn-cancel-modal {
          flex: 1; padding: 11px; border-radius: 10px; border: 1px solid rgba(0,180,255,0.15);
          background: none; color: #7BAFD4; font-family: 'Outfit', sans-serif; font-size: 14px; cursor: pointer;
        }
        .ws-btn-save {
          flex: 2; padding: 11px; border-radius: 10px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #00E5C4 0%, #0080FF 100%);
          color: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
        }
        .ws-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .ws-no-questions { padding: 16px; text-align: center; color: rgba(123,175,212,0.4); font-size: 13px; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .ws-sidebar { width: 56px; }
          .ws-logo-name, .ws-logo-sub, .ws-nav-item span, .ws-user-name, .ws-user-role { display: none; }
          .ws-main { margin-left: 56px; }
          .ws-tasks-kanban { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ws-wrap">

        {/* SIDEBAR */}
        <aside className="ws-sidebar">
          <div className="ws-logo">
            <div className="ws-logo-name">realize<span>hub</span></div>
            <div className="ws-logo-sub">{userData?.roleName || 'Workspace'}</div>
          </div>
          <nav className="ws-nav">
            <button className="ws-nav-item active">
              <span className="ws-nav-dot" /><span>Workspace</span>
            </button>
            <button className="ws-nav-item" style={{ opacity: 0.35, cursor: 'not-allowed' }}>
              <span className="ws-nav-dot" /><span>Propostas</span>
            </button>
          </nav>
          <div className="ws-sidebar-user">
            <div className="ws-avatar">{userInitials}</div>
            <div>
              <div className="ws-user-name">{userName.split(' ')[0]}</div>
              <div className="ws-user-role">{userData?.roleName || ''}</div>
            </div>
            <button className="ws-logout" onClick={onLogout}>Sair</button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="ws-main">

          {/* HEADER */}
          <div className="ws-header">
            <div className="ws-header-left">
              <h1>Olá, <strong>{userName.split(' ')[0]}</strong>!</h1>
              <p>{userData?.areaName} · {userData?.roleName}</p>
            </div>
            {canOpenBriefing && (
              <button className="ws-btn-briefing" onClick={() => setShowBriefing(true)}>
                + Abrir novo briefing
              </button>
            )}
          </div>

          {/* ── KANBAN PROJETOS ── */}
          <div className="ws-section">
            <div className="ws-section-header">
              <span className="ws-section-title">Projetos</span>
              <span style={{ fontSize: 11, color: 'rgba(123,175,212,0.4)' }}>{allBudgets.length} projetos</span>
            </div>
            <div className="ws-projects-kanban">
              {KANBAN_STAGES.map(stage => {
                const cards = allBudgets.filter(b => (b.kanbanStage || 'novo_pedido') === stage.id);
                const hasCards = cards.length > 0;
                return (
                  <div key={stage.id} className={`ws-proj-col ${hasCards ? 'active' : ''}`}>
                    <div className="ws-proj-col-header">
                      <span className="ws-proj-col-name">{stage.label}</span>
                      <span className="ws-proj-col-count">{cards.length}</span>
                    </div>
                    {cards.length === 0 ? (
                      <div className="ws-proj-col-empty">—</div>
                    ) : cards.map(b => (
                      <div key={b.id} className="ws-proj-card" onClick={() => setSelectedProjectId(b.id)}>
                        <div className="ws-proj-card-name">{getProjectName(b)}</div>
                        <div className="ws-proj-card-client">{b.companyName || b.clientName || '—'}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ws-divider" />

          {/* ── KANBAN/LISTA TAREFAS ── */}
          <div className="ws-section">
            <div className="ws-section-header">
              <span className="ws-section-title">Minhas Tarefas</span>
              <div className="ws-view-toggle">
                <button className={`ws-toggle-btn ${taskView === 'kanban' ? 'active' : ''}`} onClick={() => setTaskView('kanban')}>
                  Kanban
                </button>
                <button className={`ws-toggle-btn ${taskView === 'list' ? 'active' : ''}`} onClick={() => setTaskView('list')}>
                  Lista
                </button>
              </div>
            </div>

            {myTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(123,175,212,0.3)', fontSize: 13 }}>
                Nenhuma tarefa atribuída a você ainda
              </div>
            ) : taskView === 'kanban' ? (
              <div className="ws-tasks-kanban">
                {TASK_STAGES.map(stage => {
                  const tasks = tasksByStage(stage.id);
                  return (
                    <div key={stage.id} className="ws-task-col">
                      <div className={`ws-task-col-header ${stage.id}`}>
                        <span className={`ws-task-col-name ${stage.id}`}>{stage.label}</span>
                        <span className={`ws-task-col-badge ${stage.id}`}>{tasks.length}</span>
                      </div>
                      {tasks.length === 0 ? (
                        <div className="ws-task-empty">Nenhuma tarefa</div>
                      ) : tasks.map((task, i) => (
                        <div key={i} className={`ws-task-card ${task.isBudgetChild ? 'ws-task-card--planner' : ''}`}
                          onClick={task.isBudgetChild ? () => setSelectedProjectId(task.budgetId) : undefined}
                          style={task.isBudgetChild ? { cursor: 'pointer' } : {}}>
                          <div className="ws-task-card-name">
                            {task.isBudgetChild && <span style={{ fontSize: 10, color: '#00E5C4', marginRight: 4 }}>⚡ FEIRA</span>}
                            {task.name}
                          </div>
                          <div className="ws-task-card-project">{task.projectName}</div>
                          <div className="ws-task-card-client">{task.clientName}</div>
                          {!task.isBudgetChild && (
                            <div className="ws-task-card-actions">
                              {stage.id !== 'backlog' && (
                                <button className="ws-task-btn backlog" onClick={e => { e.stopPropagation(); handleTaskStatusChange(task, 'backlog'); }}>← Backlog</button>
                              )}
                              {stage.id !== 'todo' && (
                                <button className="ws-task-btn todo" onClick={e => { e.stopPropagation(); handleTaskStatusChange(task, 'todo'); }}>To Do</button>
                              )}
                              {stage.id !== 'done' && (
                                <button className="ws-task-btn done" onClick={e => { e.stopPropagation(); handleTaskStatusChange(task, 'done'); }}>✓ Concluir</button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ws-task-list">
                {myTasks.map((task, i) => {
                  const stage = task.taskStatus || task.status || 'backlog';
                  return (
                    <div key={i} className="ws-task-list-item">
                      <div className={`ws-task-list-status ${stage}`} />
                      <div className="ws-task-list-info">
                        <div className="ws-task-list-name">{task.name}</div>
                        <div className="ws-task-list-meta">{task.projectName} · {task.clientName}</div>
                      </div>
                      <div className="ws-task-list-actions">
                        {stage !== 'todo' && (
                          <button className="ws-task-btn todo" onClick={() => handleTaskStatusChange(task, 'todo')}>To Do</button>
                        )}
                        {stage !== 'done' && (
                          <button className="ws-task-btn done" onClick={() => handleTaskStatusChange(task, 'done')}>✓ Concluir</button>
                        )}
                        {stage !== 'backlog' && (
                          <button className="ws-task-btn backlog" onClick={() => handleTaskStatusChange(task, 'backlog')}>Backlog</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </main>

        {/* MODAL BRIEFING */}
        {showBriefing && (
          <div className="ws-modal-overlay" onClick={e => e.target === e.currentTarget && setShowBriefing(false)}>
            <div className="ws-modal">
              <div className="ws-modal-header">
                <div className="ws-modal-title">Abrir novo <span>briefing</span></div>
                <button className="ws-modal-close" onClick={() => setShowBriefing(false)}>×</button>
              </div>
              <div className="ws-modal-body">

                {/* 1. TIPO DE EVENTO — primeiro */}
                <div className="ws-modal-section">
                  <div className="ws-modal-section-title">Tipo de evento</div>
                  <div className="ws-field">
                    <label>Selecione o tipo *</label>
                    <select value={briefingForm.eventTypeId} onChange={e => handleEventTypeChange(e.target.value)}>
                      <option value="">Selecione o tipo de evento...</option>
                      {eventTypes.map(et => <option key={et.id} value={et.id}>{et.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* 2. PERGUNTAS DO BRIEFING — aparecem após selecionar tipo */}
                {briefingForm.eventTypeId && (
                  <div className="ws-modal-section">
                    <div className="ws-modal-section-title">Perguntas do briefing</div>
                    {flowQuestions.length === 0 ? (
                      <div className="ws-no-questions">Nenhuma pergunta cadastrada para este tipo</div>
                    ) : (() => {
                      // Agrupa em pares: [fixed-client + fixed-responsible], [fixed-attendant + fixed-date], resto individual
                      const pairs = [];
                      let i = 0;
                      while (i < flowQuestions.length) {
                        const cur = flowQuestions[i];
                        const next = flowQuestions[i + 1];
                        const isPair =
                          (cur.type === 'fixed-client' && next?.type === 'fixed-responsible') ||
                          (cur.type === 'fixed-attendant' && next?.type === 'fixed-date');
                        if (isPair) {
                          pairs.push([cur, next]);
                          i += 2;
                        } else {
                          pairs.push([cur]);
                          i += 1;
                        }
                      }
                      return pairs.map((group, gi) =>
                        group.length === 2 ? (
                          <div key={gi} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {group.map(q => (
                              <div key={q.id} className="ws-question-item">
                                <div className="ws-question-text">
                                  {q.label || q.text}{q.required && <span className="ws-question-required">*</span>}
                                </div>
                                {renderQuestionInput(q)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          // Pergunta individual: se não for fixa e não for shared → replica por feira
                          (!group[0].isFixedBlockField && group[0].isShared === false && feiras.length > 0)
                            ? renderQuestionPorFeira(group[0])
                            : (
                              <div key={gi} className="ws-question-item">
                                <div className="ws-question-text">
                                  {group[0].label || group[0].text}{group[0].required && <span className="ws-question-required">*</span>}
                                </div>
                                {renderQuestionInput(group[0])}
                              </div>
                            )
                        )
                      );
                    })()}
                  </div>
                )}

              </div>
              <div className="ws-modal-footer">
                <button className="ws-btn-cancel-modal" onClick={() => setShowBriefing(false)}>Cancelar</button>
                <button className="ws-btn-save" onClick={handleSaveBriefing} disabled={savingBriefing}>
                  {savingBriefing ? 'Salvando...' : 'Criar briefing'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

const styles = {
  loadingWrap: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', background: '#0D1B2A',
    fontFamily: 'sans-serif', gap: 16,
  },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: '3px solid rgba(0,229,196,0.15)',
    borderTopColor: '#00E5C4',
    animation: 'spin 0.8s linear infinite',
  },
};
