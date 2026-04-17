import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useNavigate } from 'react-router-dom';


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
  ],
  'fixed-block-reuniao': [
    { id: 'fixed-reuniao',    label: 'Reunião de Briefing', type: 'fixed-reuniao' },
  ],
};

export default function AtendimentoHome({ user, userData, onLogout }) {
  const navigate = useNavigate();
  const [allBudgets, setAllBudgets] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [personalTasks, setPersonalTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`personal_tasks_${userId || 'user'}`) || '[]'); } catch { return []; }
  });
  const [showPersonalModal, setShowPersonalModal] = useState(false);
  const [personalForm, setPersonalForm] = useState({ name: '', descricao: '', data: '', hora: '' });
  const [loading, setLoading] = useState(true);
  const [taskView, setTaskView] = useState('kanban');

  // Briefing modal
  const [showBriefing, setShowBriefing] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [flowQuestions, setFlowQuestions] = useState([]);
  const [flowTemplateTasks, setFlowTemplateTasks] = useState([]);
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

  // Reunião de Briefing — simples: data, hora, local, participantes
  const [reuniaoBriefing, setReuniaosBriefing] = useState({ data: '', hora: '', local: '', participantes: [] });
  const [reuniaoFilterCargo, setReuniaoFilterCargo] = useState('');

  const [activeSection, setActiveSection] = React.useState('workspace');
  const [calendarDate, setCalendarDate] = React.useState(new Date());
  const [selectedCalendarEvent, setSelectedCalendarEvent] = React.useState(null);
  const [lastAgendaVisit, setLastAgendaVisit] = React.useState(() => {
    try { return localStorage.getItem(`agenda_visited_${userId || 'user'}`) || ''; } catch { return ''; }
  });

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
    loadCompaniesAndEventTypes();
    setLoading(false);
  }, [userId]);

  const loadData = async () => {
    try {
      await loadMyTasks();
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Listener em tempo real para budgets ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'budgets'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Kanban mostra só filhos
      setAllBudgets(data.filter(b => b.parentBudgetId));
      // Meus Jobs — todos os filhos onde o usuário aparece em qualquer papel
      if (userId) {
        const jobs = data.filter(b => {
          if (!b.parentBudgetId) return false;
          if (b.plannerUserId === userId) return true;
          if (b.atendimentoUserId === userId) return true;
          // Participante de alguma reunião ou tarefa
          if ((b.tasks || []).some(t => t.assignedTo === userId)) return true;
          if ((b.cronograma?.reuniao_briefing?.participantes || []).some(p => p.id === userId)) return true;
          return false;
        });
        setMyJobs(jobs);
      }
      // Atualiza tarefas do usuário em tempo real
      if (userId) {
        const tasks = [];
        data.forEach(budget => {
          if (budget.parentBudgetId && budget.plannerUserId === userId) {
            // Card de projeto sempre aparece no Kanban
            tasks.push({
              taskId: budget.id,
              type: 'planejamento',
              name: `Planejar: ${budget.feiraData?.nome || `Feira ${(budget.feiraIndex || 0) + 1}`}`,
              projectId: budget.parentBudgetId,
              projectName: budget.eventTypeName || 'Evento',
              clientName: budget.companyName || budget.clientName,
              assignedTo: budget.plannerUserId,
              assignedToName: budget.plannerUserName,
              roleId: budget.plannerRoleId,
              status: budget.kanbanStage === 'fechamento' ? 'done' : 'backlog',
              isBudgetChild: true,
              isMae: budget.feiraData?.isMae || false,
              budgetId: budget.id,
              // Flag para controlar exibição no To Do
              jobStageAtual: budget.jobStage || 'briefing',
            });
          }
          (budget.tasks || []).forEach(task => {
            if (task.status === 'blocked') return;
            if (task.type === 'reuniao' && task.assignedTo === userId) {
              // Reuniões só vão para a Agenda, não para o To Do
              tasks.push({ ...task, projectId: budget.id, projectName: getProjectName(budget), clientName: budget.companyName || budget.clientName, onlyAgenda: true });
            } else if (task.type !== 'planejamento' && task.type !== 'reuniao' && (task.assignedTo === userId || task.roleId === userRoleId)) {
              // Tarefas com gatilho de etapa — só aparecem se o job já chegou naquela etapa
              if (task.jobStage) {
                const ETAPA_ORDER = ['briefing','reuniao_briefing','kickoff','paper','planilha_inicial','apresentacao_interna','apresentacao_cliente','ajustes','aprovacao','finalizacoes','caderno_artes','book_producao','passadao_interno','producao','entrega_job','fechamento_financeiro','reuniao_encerramento','relatorio_cliente'];
                const budgetStageIdx = ETAPA_ORDER.indexOf(budget.jobStage || 'briefing');
                const taskStageIdx = ETAPA_ORDER.indexOf(task.jobStage);
                if (taskStageIdx > budgetStageIdx) return; // etapa ainda não chegou
              }
              tasks.push({ ...task, projectId: budget.id, projectName: getProjectName(budget), clientName: budget.companyName || budget.clientName });
            }
          });
        });
        setMyTasks(tasks);
      }
    });
    return () => unsub();
  }, [userId, userRoleId]);

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
      const templateTasks = [];

      for (const item of items.sort((a, b) => a.order - b.order)) {
        if (item.itemType === 'fixed-block') {
          const blockKey = item.itemId.startsWith('fixed-block-reuniao')
            ? 'fixed-block-reuniao'
            : item.itemId;
          const fields = FIXED_BLOCK_FIELDS[blockKey] || [];
          fields.forEach(f => result.push({
            ...f,
            id: item.itemId.startsWith('fixed-block-reuniao') ? item.itemId : f.id,
            label: item.label || f.label,
            isFixedBlockField: true,
          }));
        } else if (item.itemType === 'question') {
          const allQSnap = await getDocs(collection(db, 'questions'));
          const allQ = allQSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const found = allQ.find(q => q.id === item.itemId);
          if (found) {
            // Inclui linkedTasks do fluxo na pergunta
            const qLinkedTaskIds = (flow.linkedTasks || {})[item.itemId] || [];
            result.push({ ...found, linkedTaskIds: qLinkedTaskIds });
          }
        } else if (item.itemType === 'task') {
          // Tarefa template do fluxo
          const taskSnap = await getDocs(collection(db, 'tasks'));
          const allTasks = taskSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const found = allTasks.find(t => t.id === item.itemId);
          if (found) templateTasks.push(found);
        }
      }

      setFlowQuestions(result);
      // Salva as tarefas template para usar na criação do budget
      setFlowTemplateTasks(templateTasks);
    } catch (err) {
      console.error('Erro ao carregar perguntas do fluxo:', err);
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
      const anoAtual = new Date().getFullYear().toString().slice(-2); // "26"
      const prefixo = (briefingForm.companyName || 'XXX').slice(0, 3).toUpperCase(); // "FOR"

      // Buscar quantos jobs esse cliente já tem neste ano
      const allBudgetsSnap = await getDocs(collection(db, 'budgets'));
      const jobsDoClienteNoAno = allBudgetsSnap.docs
        .map(d => d.data())
        .filter(d => !d.parentBudgetId && d.clientId === briefingForm.companyId && d.jobCode?.endsWith(`- ${anoAtual}`));
      const proximoNum = (jobsDoClienteNoAno.length + 1).toString().padStart(4, '0'); // "0005"
      const jobCode = `${prefixo} - ${proximoNum} - ${anoAtual}`; // "FOR - 0005 - 26"
      console.log('🔑 jobCode gerado:', jobCode, '| jobs encontrados:', jobsDoClienteNoAno.length);

      const commonAnswers = {
        ...briefingForm.answers,
        'fixed-events': feiras,
        'fixed-envio': { userId: envioUser.id, userName: envioUser.name, roleId: envioUser.roleId, roleName: envioUser.roleName },
      };

      const baseData = {
        jobCode,
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
        isMae: true,
        parentBudgetId: null,
        feiraIndex: null,
        feiraData: null,
        answers: commonAnswers,
      });

      // ── 2. Criar N budgets FILHOS (um por feira) ──
      const feiraPromises = feiras.map((feira, i) => {
        // Cards de reunião de briefing — inclui o Atendimento automaticamente
        const todosParticipantes = [
          { id: userId, name: userName, roleName: userData?.roleName || '' },
          ...reuniaoBriefing.participantes.filter(p => p.id !== userId),
        ];
        const cardsReuniao = todosParticipantes.map(p => ({
          taskId: `reuniao-briefing-${p.id}-${Date.now()}-${i}`,
          type: 'reuniao',
          etapaId: 'reuniao_briefing',
          name: 'Reunião de Briefing',
          feiraNome: feira.nome || `Feira ${i + 1}`,
          clientName: briefingForm.companyName,
          data: reuniaoBriefing.data,
          hora: reuniaoBriefing.hora,
          sala: reuniaoBriefing.local,
          assignedTo: p.id,
          assignedToName: p.name,
          status: 'backlog',
          createdAt: new Date(),
        }));

        // Tarefas template do fluxo — entram invisíveis, status 'template'
        const tarefasTemplate = flowTemplateTasks.map(t => ({
          taskId: `template-${t.id}-${i}`,
          type: 'template',
          templateId: t.id,
          name: t.name,
          descricao: t.description || '',
          roleId: t.roleId || '',
          cargoNome: t.roleName || '',
          requisicaoId: t.requisicaoId || '',
          requisicaoCodigo: t.requisicaoCodigo || '',
          requisicaoNome: t.requisicaoNome || '',
          jobStage: t.jobStage || '',
          isComum: t.isComum || false,
          prioridade: t.priority || 'normal',
          periodo: t.periodo || '',
          quantidade: t.quantidade || '',
          custoUnitario: t.custoUnitario || '',
          bvPct: t.bvPct || '',
          campos: t.campos || [],
          status: 'template',
          createdAt: new Date(),
        }));

        return addDoc(collection(db, 'budgets'), {
          ...baseData,
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
          answers: commonAnswers,
          tasks: [...cardsReuniao, ...tarefasTemplate],
          // Salva dados da reunião no cronograma
          cronograma: reuniaoBriefing.data || reuniaoBriefing.participantes.length > 0 ? {
            reuniao_briefing: {
              data: reuniaoBriefing.data,
              hora: reuniaoBriefing.hora,
              sala: reuniaoBriefing.local,
              participantes: todosParticipantes,
              agendada: todosParticipantes.length > 0,
            }
          } : {},
        });
      });

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
    // Filho: usar feiraData.nome
    if (item.feiraData?.nome) return item.feiraData.nome;
    // Mãe: usar feira mãe de fixed-events
    const feiras = item.answers?.['fixed-events'];
    if (Array.isArray(feiras) && feiras.length > 0) {
      const mae = feiras.find(f => f.isMae) || feiras[0];
      if (mae?.nome) return mae.nome;
    }
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
        <input type="date" lang="pt-BR"
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
                  <input type="date" lang="pt-BR" value={f.dataInicio || ''}
                    onChange={e => handleFeiraChange(i, 'dataInicio', e.target.value)} style={base} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, color: '#7BAFD4', letterSpacing: 0.5 }}>
                    DATA FINAL{f.dataInicio ? ` (a partir de ${f.dataInicio.split('-').reverse().join('/')})` : ''}
                  </span>
                  <input type="date" lang="pt-BR" value={f.dataFim || ''}
                    min={f.dataInicio || ''}
                    onChange={e => {
                      if (f.dataInicio && e.target.value < f.dataInicio) return;
                      handleFeiraChange(i, 'dataFim', e.target.value);
                    }} style={base} />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // ── Bloco de Reunião de Briefing (simplificado) ──
    if (q.type === 'fixed-reuniao') {
      const cargosR = [...new Set(agencyUsers.map(u => u.roleName).filter(Boolean))].sort();
      const usersR = reuniaoFilterCargo ? agencyUsers.filter(u => u.roleName === reuniaoFilterCargo) : agencyUsers;
      const participantes = reuniaoBriefing.participantes;
      const toggleP = (u) => {
        const existe = participantes.find(p => p.id === u.id);
        setReuniaosBriefing(prev => ({
          ...prev,
          participantes: existe ? participantes.filter(p => p.id !== u.id) : [...participantes, { id: u.id, name: u.name, roleName: u.roleName }]
        }));
      };
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: '#00E5C4', fontWeight: 600, letterSpacing: 0.5 }}>REUNIÃO DE BRIEFING</div>
          {/* Data, Hora, Local */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#7BAFD4', marginBottom: 4 }}>DATA</div>
              <input type="date" lang="pt-BR" value={reuniaoBriefing.data} onChange={e => setReuniaosBriefing(p => ({ ...p, data: e.target.value }))} style={base} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#7BAFD4', marginBottom: 4 }}>HORA</div>
              <select value={reuniaoBriefing.hora} onChange={e => setReuniaosBriefing(p => ({ ...p, hora: e.target.value }))}
                style={{ ...base, color: '#E8F4FF', background: 'rgba(255,255,255,0.04)' }}>
                <option value="" style={{ background: '#111f30', color: '#E8F4FF' }}>Selecione...</option>
                {Array.from({ length: 48 }, (_, i) => {
                  const h = String(Math.floor(i / 2)).padStart(2, '0');
                  const m = i % 2 === 0 ? '00' : '30';
                  return <option key={i} value={`${h}:${m}`} style={{ background: '#111f30', color: '#E8F4FF' }}>{`${h}:${m}`}</option>;
                })}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#7BAFD4', marginBottom: 4 }}>LOCAL</div>
              <input type="text" value={reuniaoBriefing.local} onChange={e => setReuniaosBriefing(p => ({ ...p, local: e.target.value }))} placeholder="Sala, Meet..." style={base} />
            </div>
          </div>
          {/* Chips dos selecionados */}
          {participantes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {participantes.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(0,229,196,0.15)', border: '1px solid rgba(0,229,196,0.3)' }}>
                  <span style={{ fontSize: 12, color: '#00E5C4' }}>{p.name}</span>
                  <button onClick={() => toggleP(p)} style={{ background: 'none', border: 'none', color: '#00E5C4', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          {/* Filtro cargo + lista */}
          <select value={reuniaoFilterCargo} onChange={e => setReuniaoFilterCargo(e.target.value)} style={{ ...base, color: '#E8F4FF' }}>
            <option value="" style={{ background: '#111f30' }}>Filtrar por cargo...</option>
            {cargosR.map(c => <option key={c} value={c} style={{ background: '#111f30' }}>{c}</option>)}
          </select>
          {reuniaoFilterCargo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {usersR.map(u => {
                const sel = participantes.some(p => p.id === u.id);
                return (
                  <button key={u.id} onClick={() => toggleP(u)} style={{
                    ...base, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    background: sel ? 'rgba(0,229,196,0.15)' : 'rgba(255,255,255,0.04)',
                    borderColor: sel ? '#00E5C4' : 'rgba(0,180,255,0.15)',
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: sel ? 'rgba(0,229,196,0.3)' : 'rgba(0,180,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: sel ? '#00E5C4' : '#7BAFD4' }}>
                      {(u.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: sel ? '#00E5C4' : '#E8F4FF', fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 10, color: '#7BAFD4' }}>{u.roleName}</div>
                    </div>
                    {sel && <span style={{ marginLeft: 'auto', color: '#00E5C4' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
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
          {/* Lista de pessoas — só aparece após selecionar cargo ou se já houver selecionado */}
          {(envioFilterCargo || envioUser) && (
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
          )}
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

  // Renderiza subperguntas condicionais recursivamente
  const renderSubQuestions = (subQuestions, parentId, parentOptions = [], depth = 0) => {
    if (!subQuestions || subQuestions.length === 0) return null;
    const parentVal = briefingForm.answers[parentId];

    const activeSubs = subQuestions.filter(sub => {
      if (!sub.trigger) return true;
      // yesno: trigger é 'yes' ou 'no', resposta é 'Sim' ou 'Não'
      if (sub.trigger === 'yes') return parentVal === 'Sim';
      if (sub.trigger === 'no') return parentVal === 'Não';
      // múltipla escolha: trigger é opt.id, resposta é opt.label — precisa mapear
      if (parentOptions && parentOptions.length > 0) {
        const triggerOpt = parentOptions.find(o => o.id === sub.trigger);
        const triggerLabel = triggerOpt?.label;
        if (triggerLabel) {
          if (Array.isArray(parentVal)) return parentVal.includes(triggerLabel);
          return parentVal === triggerLabel;
        }
      }
      // texto livre: trigger é o valor digitado
      if (Array.isArray(parentVal)) return parentVal.includes(sub.trigger);
      return parentVal === sub.trigger;
    });

    if (activeSubs.length === 0) return null;

    const depthColors = ['#667eea', '#00bcd4', '#ff9800', '#4caf50', '#e91e63'];
    const color = depthColors[Math.min(depth, depthColors.length - 1)];
    const base = {
      width: '100%', padding: '10px 14px', borderRadius: 8,
      border: '1px solid rgba(0,180,255,0.15)',
      background: 'rgba(255,255,255,0.04)', color: '#E8F4FF',
      fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none'
    };

    return activeSubs.map(sub => {
      const subVal = briefingForm.answers[sub.id] || '';
      const needsOptions = sub.type === 'multiple' || sub.type === 'multiselect';
      const uploading = uploadingFiles[sub.id];
      return (
        <div key={sub.id} style={{ marginTop: 10, marginLeft: 16, paddingLeft: 12, borderLeft: `2px solid ${color}55` }}>
          <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 6, fontWeight: 400 }}>
            {sub.text}{sub.required && <span style={{ color: '#E74C3C', marginLeft: 3 }}>*</span>}
          </div>
          {/* Input da subpergunta */}
          {(sub.type === 'text' || sub.type === 'number' || sub.type === 'date' || sub.type === 'currency') && (
            <input type={sub.type === 'currency' ? 'number' : sub.type} value={subVal} onChange={e => handleAnswerChange(sub.id, e.target.value)} style={base} placeholder="Sua resposta..." />
          )}
          {sub.type === 'textarea' && (
            <textarea value={subVal} onChange={e => handleAnswerChange(sub.id, e.target.value)} rows={3} style={{ ...base, resize: 'vertical' }} />
          )}
          {sub.type === 'yesno' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {['Sim', 'Não'].map(opt => (
                <button key={opt} onClick={() => handleAnswerChange(sub.id, opt)} style={{
                  ...base, width: 'auto', padding: '8px 20px', cursor: 'pointer',
                  background: subVal === opt ? 'rgba(0,229,196,0.15)' : 'rgba(255,255,255,0.04)',
                  borderColor: subVal === opt ? '#00E5C4' : 'rgba(0,180,255,0.15)',
                  color: subVal === opt ? '#00E5C4' : '#E8F4FF'
                }}>{opt}</button>
              ))}
            </div>
          )}
          {needsOptions && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(sub.options || []).map(opt => {
                const selected = sub.type === 'multiple' ? subVal === opt.label : (Array.isArray(subVal) ? subVal.includes(opt.label) : false);
                return (
                  <button key={opt.id} onClick={() => {
                    if (sub.type === 'multiple') handleAnswerChange(sub.id, opt.label);
                    else {
                      const arr = Array.isArray(subVal) ? subVal : [];
                      handleAnswerChange(sub.id, selected ? arr.filter(v => v !== opt.label) : [...arr, opt.label]);
                    }
                  }} style={{
                    ...base, textAlign: 'left', cursor: 'pointer',
                    background: selected ? 'rgba(0,229,196,0.1)' : 'rgba(255,255,255,0.04)',
                    borderColor: selected ? '#00E5C4' : 'rgba(0,180,255,0.15)',
                    color: selected ? '#00E5C4' : '#E8F4FF'
                  }}>{opt.label}</button>
                );
              })}
            </div>
          )}
          {sub.type === 'upload' && (
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
                  disabled={uploading} onChange={e => handleUpload(sub.id, e.target.files[0])} />
              </label>
              {subVal && (
                <a href={subVal} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#7BAFD4', textDecoration: 'underline' }}>
                  ✓ Arquivo enviado — clique para visualizar
                </a>
              )}
            </div>
          )}
          {sub.type === 'checklist' && (() => {
            const items = Array.isArray(subVal) ? subVal : [];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="text" value={item}
                      onChange={e => {
                        const updated = [...items];
                        updated[i] = e.target.value;
                        handleAnswerChange(sub.id, updated);
                      }}
                      style={{ ...base, flex: 1 }} placeholder={`Item ${i + 1}...`} />
                    <button onClick={() => handleAnswerChange(sub.id, items.filter((_, idx) => idx !== i))}
                      style={{ ...base, width: 36, padding: 0, color: '#E74C3C', borderColor: 'rgba(231,76,60,0.3)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                  </div>
                ))}
                <button onClick={() => handleAnswerChange(sub.id, [...items, ''])}
                  style={{ ...base, cursor: 'pointer', color: '#00E5C4', borderColor: 'rgba(0,229,196,0.4)', borderStyle: 'dashed', textAlign: 'left' }}>
                  + Adicionar item
                </button>
              </div>
            );
          })()}
          {/* Fallback: se nenhum tipo acima bateu, renderiza text */}
          {!['text','number','date','currency','textarea','yesno','multiple','multiselect','upload','checklist'].includes(sub.type) && (
            <input type="text" value={subVal} onChange={e => handleAnswerChange(sub.id, e.target.value)} style={base} placeholder="Sua resposta..." />
          )}
          {/* Recursivo: subperguntas das subperguntas — passa as options do sub atual para resolver trigger */}
          {sub.subQuestions && sub.subQuestions.length > 0 && renderSubQuestions(sub.subQuestions, sub.id, sub.options || [], depth + 1)}
        </div>
      );
    });
  };

  // Navegação para projeto via URL

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={{ color: '#7BAFD4', fontSize: 14, marginTop: 12 }}>Carregando...</p>
      </div>
    );
  }

  // Etapas onde o Planner ainda está no Backlog (antes da Reunião de Briefing ser concluída)
  const stagesBloqueadosPlanner = ['briefing', 'reuniao_briefing', '', null, undefined];
  const tasksByStage = (stageId) => {
    const personal = personalTasks.filter(t => (t.status || 'todo') === stageId);
    const job = myTasks.filter(t => {
      if (t.onlyAgenda) return false;
      const taskStatus = t.taskStatus || t.status || 'backlog';
      if (t.isBudgetChild) {
        // Concluído sempre vai para done independente da etapa
        if (taskStatus === 'done') return stageId === 'done';
        // Antes de kickoff → backlog
        if (stagesBloqueadosPlanner.includes(t.jobStageAtual)) return stageId === 'backlog';
        // A partir do kickoff → todo
        return stageId === 'todo';
      }
      return taskStatus === stageId;
    });
    return [...personal, ...job];
  };

  const handleAddPersonalTask = () => {
    if (!personalForm.name.trim()) { alert('Digite o nome da tarefa'); return; }
    const newTask = {
      taskId: `personal-${Date.now()}`,
      type: 'personal',
      name: personalForm.name.trim(),
      descricao: personalForm.descricao.trim(),
      data: personalForm.data,
      hora: personalForm.hora,
      status: 'todo',
      createdAt: new Date().toISOString(),
    };
    const updated = [...personalTasks, newTask];
    setPersonalTasks(updated);
    try { localStorage.setItem(`personal_tasks_${userId || 'user'}`, JSON.stringify(updated)); } catch {}
    setPersonalForm({ name: '', descricao: '', data: '', hora: '' });
    setShowPersonalModal(false);
  };

  const handlePersonalTaskStatus = (taskId, newStatus) => {
    const updated = personalTasks.map(t => t.taskId === taskId ? { ...t, status: newStatus } : t);
    setPersonalTasks(updated);
    try { localStorage.setItem(`personal_tasks_${userId || 'user'}`, JSON.stringify(updated)); } catch {}
  };

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
          margin-bottom: 6px; padding: 0 2px;
        }
        .ws-proj-col-name { font-size: 11px; font-weight: 500; color: #7BAFD4; letter-spacing: 0.5px; }
        .ws-proj-col-count {
          width: 18px; height: 18px; border-radius: 50%;
          background: rgba(0,180,255,0.1); color: #7BAFD4;
          font-size: 10px; display: flex; align-items: center; justify-content: center;
        }
        .ws-proj-col.active .ws-proj-col-name { color: #00E5C4; }
        .ws-proj-col.active .ws-proj-col-count { background: rgba(0,229,196,0.15); color: #00E5C4; }

        .ws-proj-col-cards { max-height: 220px; overflow-y: auto; }
        .ws-proj-col-cards::-webkit-scrollbar { width: 3px; }
        .ws-proj-col-cards::-webkit-scrollbar-thumb { background: rgba(0,180,255,0.2); border-radius: 2px; }

        .ws-proj-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(0,180,255,0.1);
          border-radius: 6px; padding: 6px 8px; margin-bottom: 4px; cursor: pointer;
          transition: all 0.15s; display: flex; align-items: center; gap: 5px;
        }
        .ws-proj-card:hover { background: rgba(255,255,255,0.06); border-color: rgba(0,229,196,0.3); transform: translateY(-1px); }
        .ws-proj-card-name { font-size: 11px; font-weight: 500; color: #E8F4FF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
        .ws-proj-card-sep { font-size: 10px; color: rgba(123,175,212,0.3); flex-shrink: 0; }
        .ws-proj-card-client { font-size: 10px; color: rgba(123,175,212,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; max-width: 45%; }
        .ws-proj-col-empty { font-size: 11px; color: rgba(123,175,212,0.2); text-align: center; padding: 8px 0; }

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
          border-radius: 8px; padding: 8px 10px; margin-bottom: 6px;
          transition: all 0.15s; position: relative;
        }
        .ws-task-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(0,180,255,0.2); }
        .ws-task-card-name { font-size: 12px; font-weight: 500; color: #E8F4FF; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-task-card-project { font-size: 10px; color: #00E5C4; margin-bottom: 0; }
        .ws-task-card-client { font-size: 10px; color: rgba(123,175,212,0.5); margin-bottom: 6px; }
        .ws-task-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .ws-task-card-mae-dot {
          position: absolute; top: 7px; right: 8px;
          width: 7px; height: 7px; border-radius: 50%;
          background: #00E5C4; box-shadow: 0 0 4px rgba(0,229,196,0.6);
        }
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
            <button className={`ws-nav-item ${activeSection === 'workspace' ? 'active' : ''}`} onClick={() => setActiveSection('workspace')}>
              <span className="ws-nav-dot" /><span>Workspace</span>
            </button>
            <button className={`ws-nav-item ${activeSection === 'jobs' ? 'active' : ''}`} onClick={() => setActiveSection('jobs')}>
              <span className="ws-nav-dot" /><span>Meus Jobs</span>
              {myJobs.length > 0 && activeSection !== 'jobs' && (
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#00E5C4', background: 'rgba(0,229,196,0.1)', padding: '1px 7px', borderRadius: 10 }}>{myJobs.length}</span>
              )}
            </button>
            <button className={`ws-nav-item ${activeSection === 'agenda' ? 'active' : ''}`} onClick={() => {
              setActiveSection('agenda');
              const now = new Date().toISOString();
              setLastAgendaVisit(now);
              try { localStorage.setItem(`agenda_visited_${userId || 'user'}`, now); } catch {}
            }} style={{ position: 'relative' }}>
              <span className="ws-nav-dot" /><span>Agenda</span>
              {/* Ponto de notificação — aparece só se tiver reunião futura criada após a última visita */}
              {activeSection !== 'agenda' && myTasks.some(t =>
                t.type === 'reuniao' &&
                t.data && t.data >= new Date().toISOString().split('T')[0] &&
                (!lastAgendaVisit || (t.createdAt && new Date(t.createdAt?.toDate ? t.createdAt.toDate() : t.createdAt) > new Date(lastAgendaVisit)))
              ) && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 7, height: 7, borderRadius: '50%', background: '#FFA726', boxShadow: '0 0 6px #FFA726' }} />
              )}
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
            {activeSection === 'workspace' && canOpenBriefing && (
              <button className="ws-btn-briefing" onClick={() => setShowBriefing(true)}>
                + Abrir novo briefing
              </button>
            )}
          </div>

          {/* ── AGENDA ── */}
          {activeSection === 'agenda' && (() => {
            const hoje = new Date();
            const ano = calendarDate.getFullYear();
            const mes = calendarDate.getMonth();
            const diasNoMes = new Date(ano, mes + 1, 0).getDate();
            const primeiroDia = new Date(ano, mes, 1).getDay();
            const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

            // Montar eventos: reuniões + prazos de tarefas
            const eventos = {};
            const addEvento = (dateStr, evento) => {
              if (!dateStr) return;
              if (!eventos[dateStr]) eventos[dateStr] = [];
              eventos[dateStr].push(evento);
            };

            myTasks.forEach(t => {
              if (t.type === 'reuniao' && t.data) {
                addEvento(t.data, { type: 'reuniao', name: t.name, hora: t.hora, sala: t.sala, feiraNome: t.feiraNome, clientName: t.clientName, task: t });
              }
              if (t.prazo && t.type !== 'reuniao') {
                addEvento(t.prazo, { type: 'prazo', name: t.name, feiraNome: t.projectName, clientName: t.clientName, task: t });
              }
            });
            // Tarefas pessoais com data
            personalTasks.filter(t => t.data).forEach(t => {
              addEvento(t.data, { type: 'personal', name: t.name, hora: t.hora, descricao: t.descricao, task: t });
            });

            const cells = [];
            // Células vazias antes do dia 1
            for (let i = 0; i < primeiroDia; i++) cells.push(null);
            for (let d = 1; d <= diasNoMes; d++) cells.push(d);

            const toDateStr = (d) => `${ano}-${String(mes + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isHoje = (d) => d === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();

            return (
              <div style={{ padding: '0 0 32px' }}>
                {/* Navegação do mês */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                  <button onClick={() => setCalendarDate(new Date(ano, mes - 1, 1))} style={{ background: 'none', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 8, color: '#7BAFD4', fontSize: 16, cursor: 'pointer', padding: '4px 12px' }}>‹</button>
                  <span style={{ fontSize: 18, fontWeight: 600, color: '#E8F4FF', minWidth: 180, textAlign: 'center' }}>{meses[mes]} {ano}</span>
                  <button onClick={() => setCalendarDate(new Date(ano, mes + 1, 1))} style={{ background: 'none', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 8, color: '#7BAFD4', fontSize: 16, cursor: 'pointer', padding: '4px 12px' }}>›</button>
                  <button onClick={() => setCalendarDate(new Date())} style={{ background: 'rgba(0,229,196,0.08)', border: '1px solid rgba(0,229,196,0.2)', borderRadius: 8, color: '#00E5C4', fontSize: 12, cursor: 'pointer', padding: '5px 14px', fontFamily: 'Outfit, sans-serif', marginLeft: 8 }}>Hoje</button>
                </div>

                {/* Grid do calendário */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'rgba(0,180,255,0.06)', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,180,255,0.1)' }}>
                  {/* Cabeçalho dias da semana */}
                  {diasSemana.map(d => (
                    <div key={d} style={{ background: 'rgba(10,22,38,0.97)', padding: '10px 0', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'rgba(123,175,212,0.5)', letterSpacing: 1 }}>{d}</div>
                  ))}
                  {/* Células dos dias */}
                  {cells.map((d, i) => {
                    const dateStr = d ? toDateStr(d) : null;
                    const evts = dateStr ? (eventos[dateStr] || []) : [];
                    const reunioes = evts.filter(e => e.type === 'reuniao');
                    const prazos = evts.filter(e => e.type === 'prazo');
                    const personais = evts.filter(e => e.type === 'personal');
                    return (
                      <div key={i} onClick={() => d && evts.length > 0 && setSelectedCalendarEvent({ date: dateStr, eventos: evts })}
                        style={{ background: 'rgba(10,22,38,0.97)', minHeight: 80, padding: '8px 6px', cursor: d && evts.length > 0 ? 'pointer' : 'default', transition: 'background 0.15s', position: 'relative' }}
                        onMouseEnter={e => { if (d && evts.length > 0) e.currentTarget.style.background = 'rgba(0,229,196,0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(10,22,38,0.97)'; }}>
                        {d && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: isHoje(d) ? 700 : 400, color: isHoje(d) ? '#0D1B2A' : evts.length > 0 ? '#E8F4FF' : 'rgba(123,175,212,0.4)', width: 24, height: 24, borderRadius: '50%', background: isHoje(d) ? '#00E5C4' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>{d}</div>
                            {reunioes.slice(0, 1).map((e, j) => (
                              <div key={j} style={{ fontSize: 10, background: 'rgba(255,167,38,0.15)', border: '1px solid rgba(255,167,38,0.3)', color: '#FFA726', borderRadius: 4, padding: '2px 5px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                                {e.hora && `${e.hora} `}{e.name}
                              </div>
                            ))}
                            {prazos.slice(0, 1).map((e, j) => (
                              <div key={j} style={{ fontSize: 10, background: 'rgba(0,128,255,0.12)', border: '1px solid rgba(0,128,255,0.25)', color: '#60a5fa', borderRadius: 4, padding: '2px 5px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {e.name}
                              </div>
                            ))}
                            {personais.slice(0, 1).map((e, j) => (
                              <div key={j} style={{ fontSize: 10, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', borderRadius: 4, padding: '2px 5px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {e.hora && `${e.hora} `}{e.name}
                              </div>
                            ))}
                            {evts.length > 3 && <div style={{ fontSize: 9, color: 'rgba(123,175,212,0.5)', marginTop: 2 }}>+{evts.length - 3} mais</div>}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Modal de evento do dia */}
                {selectedCalendarEvent && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
                    onClick={() => setSelectedCalendarEvent(null)}>
                    <div style={{ background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 16, padding: 28, minWidth: 340, maxWidth: 480, width: '90%' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#E8F4FF' }}>
                          {selectedCalendarEvent.date.split('-').reverse().join('/')}
                        </span>
                        <button onClick={() => setSelectedCalendarEvent(null)} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 18, cursor: 'pointer' }}>✕</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {selectedCalendarEvent.eventos.map((e, i) => (
                          <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: e.type === 'reuniao' ? 'rgba(255,167,38,0.08)' : e.type === 'personal' ? 'rgba(16,185,129,0.08)' : 'rgba(0,128,255,0.08)', border: `1px solid ${e.type === 'reuniao' ? 'rgba(255,167,38,0.25)' : e.type === 'personal' ? 'rgba(16,185,129,0.25)' : 'rgba(0,128,255,0.2)'}` }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: e.type === 'reuniao' ? '#FFA726' : e.type === 'personal' ? '#10b981' : '#60a5fa', marginBottom: 6 }}>{e.name}</div>
                            {e.feiraNome && <div style={{ fontSize: 12, color: '#E8F4FF', marginBottom: 2 }}>{e.feiraNome}{e.clientName ? ` — ${e.clientName}` : ''}</div>}
                            {e.hora && <div style={{ fontSize: 11, color: '#7BAFD4' }}>{e.hora}{e.sala ? ` · ${e.sala}` : ''}</div>}
                            {e.descricao && <div style={{ fontSize: 11, color: '#7BAFD4' }}>{e.descricao}</div>}
                            {e.type === 'prazo' && <div style={{ fontSize: 11, color: '#7BAFD4' }}>Prazo da tarefa</div>}
                            {e.type === 'personal' && <div style={{ fontSize: 10, color: 'rgba(16,185,129,0.6)', marginTop: 4 }}>Tarefa pessoal</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── MEUS JOBS ── */}
          {activeSection === 'jobs' && (() => {
            const ETAPA_LABELS = { briefing:'Briefing', reuniao_briefing:'Reunião de Briefing', kickoff:'Kick-off', paper:'Paper', planilha_inicial:'Planilha Inicial', apresentacao_interna:'Pré-Apresentação', apresentacao_cliente:'Apresentação', ajustes:'Ajustes', aprovacao:'Aprovação', finalizacoes:'Finalizações', caderno_artes:'Caderno de Artes', book_producao:'Book de Produção', passadao_interno:'Passadão Interno', producao:'Produção', entrega_job:'Entrega', fechamento_financeiro:'Fechamento', reuniao_encerramento:'Encerramento', relatorio_cliente:'Relatório' };
            const STATUS_COLOR = { approved: '#10b981', rejected: '#ef4444', analyzing: '#f59e0b' };

            return (
              <div style={{ padding: '0 0 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#E8F4FF' }}>Meus Jobs</span>
                  <span style={{ fontSize: 12, color: 'rgba(123,175,212,0.5)' }}>{myJobs.length} {myJobs.length === 1 ? 'job' : 'jobs'}</span>
                </div>
                {myJobs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'rgba(123,175,212,0.3)', fontSize: 13, padding: '48px 0' }}>Nenhum job encontrado</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {myJobs.map(b => {
                      const etapaAtual = ETAPA_LABELS[b.jobStage || 'briefing'] || b.jobStage || 'Briefing';
                      const proximaReuniao = (b.tasks || []).filter(t => t.type === 'reuniao' && t.data >= new Date().toISOString().split('T')[0]).sort((a, z) => a.data.localeCompare(z.data))[0];
                      const tarefasPendentes = (b.tasks || []).filter(t => t.assignedTo === userId && ['backlog','todo','in_progress'].includes(t.status)).length;
                      return (
                        <div key={b.id} onClick={() => navigate(`/projeto/${b.id}`)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,180,255,0.1)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,196,0.05)'; e.currentTarget.style.borderColor = 'rgba(0,229,196,0.2)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(0,180,255,0.1)'; }}>
                          {/* Header do card */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#E8F4FF', marginBottom: 2 }}>{getProjectName(b)}</div>
                              <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.6)' }}>{b.companyName || b.clientName || '—'} · {b.jobCode || ''}</div>
                            </div>
                            {b.status && STATUS_COLOR[b.status] && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: STATUS_COLOR[b.status] + '22', color: STATUS_COLOR[b.status], flexShrink: 0 }}>
                                {b.status === 'approved' ? 'Aprovado' : b.status === 'rejected' ? 'Reprovado' : 'Em análise'}
                              </span>
                            )}
                          </div>
                          {/* Info row */}
                          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFA726', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: '#FFA726', fontWeight: 500 }}>{etapaAtual}</span>
                            </div>
                            {tarefasPendentes > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 11, color: '#60a5fa' }}>{tarefasPendentes} tarefa{tarefasPendentes > 1 ? 's' : ''} pendente{tarefasPendentes > 1 ? 's' : ''}</span>
                              </div>
                            )}
                            {proximaReuniao && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)' }}>Próx. reunião: {proximaReuniao.data.split('-').reverse().join('/')} {proximaReuniao.hora && `às ${proximaReuniao.hora}`}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── KANBAN PROJETOS + TAREFAS ── */}
          {activeSection === 'workspace' && <>

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
                        task.type === 'personal' ? (
                          <div key={i} style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, borderLeft: '3px solid #10b981' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF', marginBottom: 2 }}>{task.name}</div>
                              <button onClick={() => {
                                const updated = personalTasks.filter(t => t.taskId !== task.taskId);
                                setPersonalTasks(updated);
                                try { localStorage.setItem(`personal_tasks_${userId || 'user'}`, JSON.stringify(updated)); } catch {}
                              }} style={{ background: 'none', border: 'none', color: 'rgba(123,175,212,0.4)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}
                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                onMouseLeave={e => e.currentTarget.style.color = 'rgba(123,175,212,0.4)'}>✕</button>
                            </div>
                            {task.descricao && <div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4 }}>{task.descricao}</div>}
                            {(task.data || task.hora) && (
                              <div style={{ fontSize: 11, color: '#10b981', marginBottom: 6 }}>
                                {task.data && <span>{task.data.split('-').reverse().join('/')}</span>}
                                {task.hora && <span> às {task.hora}</span>}
                              </div>
                            )}
                            {task.status !== 'done' && (
                              <button onClick={() => handlePersonalTaskStatus(task.taskId, 'done')}
                                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #10b981', background: 'none', color: '#10b981', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>
                                ✓ Concluir
                              </button>
                            )}
                          </div>
                        ) : (
                          <div key={i} className={`ws-task-card ${task.isBudgetChild ? 'ws-task-card--planner' : ''}`}
                          onClick={() => navigate(`/projeto/${task.isBudgetChild ? task.budgetId : task.projectId}?tab=tasks&user=${userId}`)}
                          style={{ cursor: 'pointer' }}>
                          {task.isMae && <div className="ws-task-card-mae-dot" title="Feira Mãe" />}
                          <div className="ws-task-card-name">{task.name}</div>
                          <div className="ws-task-card-project">{task.projectName}</div>
                          <div className="ws-task-card-client">{task.clientName}</div>
                          {task.isBudgetChild && stage.id !== 'done' && (
                            <div className="ws-task-card-actions">
                              <button className="ws-task-btn done" onClick={async e => {
                                e.stopPropagation();
                                if (!window.confirm('Marcar sessão de planejamento como concluída?')) return;
                                try {
                                  await updateDoc(doc(db, 'budgets', task.budgetId), { kanbanStage: 'fechamento', updatedAt: new Date() });
                                } catch(err) { console.error(err); }
                              }}>✓ Concluir</button>
                            </div>
                          )}
                          {!task.isBudgetChild && stage.id === 'todo' && (
                            <div className="ws-task-card-actions">
                              <button className="ws-task-btn done" onClick={e => { e.stopPropagation(); handleTaskStatusChange(task, 'done'); }}>✓ Concluir</button>
                            </div>
                          )}
                          {!task.isBudgetChild && stage.id === 'done' && (
                            <div className="ws-task-card-actions">
                              <button className="ws-task-btn todo" onClick={e => { e.stopPropagation(); handleTaskStatusChange(task, 'todo'); }}>↩ Reabrir</button>
                            </div>
                          )}
                          {!task.isBudgetChild && stage.id === 'backlog' && (
                            <div style={{ fontSize: 10, color: 'rgba(123,175,212,0.35)', fontStyle: 'italic', marginTop: 4 }}>Aguardando liberação</div>
                          )}
                        </div>
                        )
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

          </>}

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
                                {renderSubQuestions(group[0].subQuestions, group[0].id, group[0].options || [])}
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

        {/* BOTÃO + FLUTUANTE — tarefa pessoal */}
        <button onClick={() => setShowPersonalModal(true)} style={{
          position: 'fixed', bottom: 28, right: 28, width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none',
          color: 'white', fontSize: 24, cursor: 'pointer', zIndex: 50,
          boxShadow: '0 4px 20px rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Adicionar tarefa pessoal">
          +
        </button>

        {/* MODAL TAREFA PESSOAL */}
        {showPersonalModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
            onClick={e => e.target === e.currentTarget && setShowPersonalModal(false)}>
            <div style={{ background: '#0D1B2A', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 28, width: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#E8F4FF' }}>Tarefa pessoal</span>
                <button onClick={() => setShowPersonalModal(false)} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#7BAFD4', marginBottom: 4, letterSpacing: 0.5 }}>TAREFA *</div>
                  <input autoFocus value={personalForm.name} onChange={e => setPersonalForm(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddPersonalTask()}
                    placeholder="O que você precisa fazer?"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#7BAFD4', marginBottom: 4, letterSpacing: 0.5 }}>DESCRIÇÃO</div>
                  <input value={personalForm.descricao} onChange={e => setPersonalForm(p => ({ ...p, descricao: e.target.value }))}
                    placeholder="Detalhes opcionais..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.15)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#7BAFD4', marginBottom: 4, letterSpacing: 0.5 }}>DATA</div>
                    <input type="date" lang="pt-BR" value={personalForm.data} onChange={e => setPersonalForm(p => ({ ...p, data: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.15)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#7BAFD4', marginBottom: 4, letterSpacing: 0.5 }}>HORA</div>
                    <select value={personalForm.hora} onChange={e => setPersonalForm(p => ({ ...p, hora: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.15)', background: 'rgba(10,22,38,0.97)', color: personalForm.hora ? '#E8F4FF' : '#7BAFD4', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }}>
                      <option value="">Sem hora</option>
                      {Array.from({ length: 48 }, (_, i) => {
                        const h = String(Math.floor(i / 2)).padStart(2, '0');
                        const m = i % 2 === 0 ? '00' : '30';
                        return <option key={i} value={`${h}:${m}`} style={{ background: '#0D1B2A' }}>{`${h}:${m}`}</option>;
                      })}
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowPersonalModal(false)}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  Cancelar
                </button>
                <button onClick={handleAddPersonalTask}
                  style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  Adicionar
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
