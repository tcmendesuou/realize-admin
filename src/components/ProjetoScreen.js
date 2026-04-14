import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, query, where, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function ProjetoScreen({ projectId, onBack, userData }) {
  const [project, setProject] = useState(null);
  const [parentProject, setParentProject] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [taskFilterUser, setTaskFilterUser] = useState('');
  const [selectedTask, setSelectedTask] = useState(null); // tarefa aberta no modal

  // Sessão de planejamento
  const [modoEdicao, setModoEdicao] = useState(false);
  const [agencyUsers, setAgencyUsers] = useState([]);
  const [agencyRoles, setAgencyRoles] = useState([]);
  const [savingSession, setSavingSession] = useState(false);
  // taskForms: { [questionId]: { open, tarefa, cargoId, cargoNome, pessoaId, pessoaNome, valor } }
  const [taskForms, setTaskForms] = useState({});
  // tarefas geradas nesta sessão: [{ questionId, questionText, tarefa, cargoId, cargoNome, pessoaId, pessoaNome, valor }]
  const [newTasks, setNewTasks] = useState([]);
  // nova tarefa do zero
  const [showNovaTask, setShowNovaTask] = useState(false);
  const [novaTask, setNovaTask] = useState({ tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' });

  const canPlan = userData?.permissions?.briefing?.planning !== false;
  const canEdit = userData?.permissions?.briefing?.edit !== false;
  const [requisitions, setRequisitions] = useState([]);

  // Modo editar briefing (filho)
  const [modoEditarBriefing, setModoEditarBriefing] = useState(false);
  const [editedAnswers, setEditedAnswers] = useState({});
  const [allQuestions, setAllQuestions] = useState([]);
  const [extraQuestions, setExtraQuestions] = useState([]);
  const [showAddPergunta, setShowAddPergunta] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Briefing Geral — editar e sessão de planejamento
  const [modoEditarGeral, setModoEditarGeral] = useState(false);
  const [editedAnswersGeral, setEditedAnswersGeral] = useState({});
  const [extraQuestionsGeral, setExtraQuestionsGeral] = useState([]);
  const [showAddPerguntaGeral, setShowAddPerguntaGeral] = useState(false);
  const [savingEditGeral, setSavingEditGeral] = useState(false);
  const [modoPlanejarGeral, setModoPlanejarGeral] = useState(false);
  const [taskFormsGeral, setTaskFormsGeral] = useState({});
  const [newTasksGeral, setNewTasksGeral] = useState([]);
  const [showNovaTaskGeral, setShowNovaTaskGeral] = useState(false);
  const [novaTaskGeral, setNovaTaskGeral] = useState({ tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' });
  const [savingSessionGeral, setSavingSessionGeral] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    let unsubMae = null;

    // onSnapshot cuida de manter o project atualizado em tempo real
    const unsub = onSnapshot(doc(db, 'budgets', projectId), async (snap) => {
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() };
      setProject(data);

      // Se for filho, inicia listener no budget mãe (uma vez só)
      if (data.parentBudgetId && !unsubMae) {
        unsubMae = onSnapshot(doc(db, 'budgets', data.parentBudgetId), (maeSnap) => {
          if (maeSnap.exists()) {
            setParentProject({ id: maeSnap.id, ...maeSnap.data() });
          }
        });
      }

      setLoading(false);
    });

    // Carrega perguntas e usuários uma vez (não precisam de tempo real)
    loadExtras();

    return () => {
      unsub();
      if (unsubMae) unsubMae();
    };
  }, [projectId]);

  const loadExtras = async () => {
    try {
      // Carregar usuários da agência para a sessão de planejamento
      const [usersSnap, utSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'userTypes')),
      ]);
      const agenciaTypeIds = utSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.systemRole === 'workspace' || t.systemRole === 'admin')
        .map(t => t.id);
      const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const agency = allUsers.filter(u => agenciaTypeIds.includes(u.userTypeId) && u.active !== false);
      setAgencyUsers(agency);
      const roles = [...new Map(agency.filter(u => u.roleId).map(u => [u.roleId, { id: u.roleId, name: u.roleName }])).values()];
      setAgencyRoles(roles);

      // Banco completo de perguntas para o modo editar
      const allQSnap = await getDocs(collection(db, 'questions'));
      setAllQuestions(allQSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));

      const reqSnap = await getDocs(collection(db, 'requisitions'));
      setRequisitions(reqSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.ativo !== false).sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '')));

      // Busca perguntas do fluxo (eventTypeId vem do snapshot depois, tentamos pegar do doc direto)
      const docSnap = await getDoc(doc(db, 'budgets', projectId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.eventTypeId) {
          const flowSnap = await getDocs(query(collection(db, 'eventFlows'), where('eventTypeId', '==', data.eventTypeId)));
          if (!flowSnap.empty) {
            const flow = flowSnap.docs[0].data();
            const qIds = (flow.items || []).filter(i => i.itemType === 'question').map(i => i.itemId);
            if (qIds.length > 0) {
              const allQ = await getDocs(collection(db, 'questions'));
              const qData = allQ.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(q => qIds.includes(q.id))
                .sort((a, b) => (a.order || 0) - (b.order || 0));
              setQuestions(qData);
            }
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar extras:', err);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDateShort = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const isFilho = !!project?.parentBudgetId;

  const toggleTaskForm = (qId) => {
    setTaskForms(prev => ({
      ...prev,
      [qId]: prev[qId]?.open
        ? { ...prev[qId], open: false }
        : {
            open: true, tarefa: '', descricao: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '',
            prazo: '', prioridade: 'normal',
            requisicaoId: '', requisicaoCodigo: '', requisicaoNome: '',
            periodo: '', quantidade: '', custoUnitario: '',
            fornecedor1: '', fornecedor1Valor: '', fornecedor1Status: '',
            fornecedor2: '', fornecedor2Valor: '', fornecedor2Status: '',
            fornecedor3: '', fornecedor3Valor: '', fornecedor3Status: '',
            justificativa: '', bvPct: '', credito: '', observacao: '',
          }
    }));
  };

  const updateTaskForm = (qId, field, value) => {
    setTaskForms(prev => ({ ...prev, [qId]: { ...prev[qId], [field]: value } }));
    if (field === 'cargoId') {
      const cargo = agencyRoles.find(r => r.id === value);
      setTaskForms(prev => ({ ...prev, [qId]: { ...prev[qId], cargoId: value, cargoNome: cargo?.name || '', pessoaId: '', pessoaNome: '' } }));
    }
    if (field === 'pessoaId') {
      const pessoa = agencyUsers.find(u => u.id === value);
      setTaskForms(prev => ({ ...prev, [qId]: { ...prev[qId], pessoaId: value, pessoaNome: pessoa?.name || '' } }));
    }
  };

  const gerarTarefa = (q, display) => {
    const form = taskForms[q.id];
    if (!form?.tarefa) { alert('Descreva a tarefa'); return; }
    if (!form?.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    setNewTasks(prev => [...prev, {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: q.id, questionText: q.text, briefingAnswer: display,
      name: form.tarefa, descricao: form.descricao || '',
      cargoId: form.cargoId, cargoNome: form.cargoNome,
      assignedTo: form.pessoaId, assignedToName: form.pessoaNome,
      prazo: form.prazo || '', prioridade: form.prioridade || 'normal',
      requisicaoId: form.requisicaoId || '', requisicaoCodigo: form.requisicaoCodigo || '', requisicaoNome: form.requisicaoNome || '',
      periodo: form.periodo || '', quantidade: form.quantidade || '', custoUnitario: form.custoUnitario || '',
      fornecedor1: form.fornecedor1 || '', fornecedor1Valor: form.fornecedor1Valor || '', fornecedor1Status: form.fornecedor1Status || '',
      fornecedor2: form.fornecedor2 || '', fornecedor2Valor: form.fornecedor2Valor || '', fornecedor2Status: form.fornecedor2Status || '',
      fornecedor3: form.fornecedor3 || '', fornecedor3Valor: form.fornecedor3Valor || '', fornecedor3Status: form.fornecedor3Status || '',
      fornecedor2: form.fornecedor2 || '', fornecedor2Valor: form.fornecedor2Valor || '',
      fornecedor3: form.fornecedor3 || '', fornecedor3Valor: form.fornecedor3Valor || '',
      justificativa: form.justificativa || '', bvPct: form.bvPct || '',
      credito: form.credito || '', observacao: form.observacao || '',
      status: 'backlog', createdAt: new Date(),
    }]);
    setTaskForms(prev => ({ ...prev, [q.id]: { ...prev[q.id], open: false } }));
  };

  const gerarNovaTask = () => {
    if (!novaTask.tarefa) { alert('Descreva a tarefa'); return; }
    if (!novaTask.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    setNewTasks(prev => [...prev, {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: null, questionText: null, briefingAnswer: null,
      name: novaTask.tarefa,
      cargoId: novaTask.cargoId, cargoNome: novaTask.cargoNome,
      assignedTo: novaTask.pessoaId, assignedToName: novaTask.pessoaNome,
      valor: novaTask.valor || '',
      status: 'backlog', createdAt: new Date(),
    }]);
    setNovaTask({ tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' });
    setShowNovaTask(false);
  };

  const removerNewTask = (taskId) => setNewTasks(prev => prev.filter(t => t.taskId !== taskId));

  // Mini-form com seletor de requisição e campos dinâmicos
  const renderMiniForm = (qId, onCriar) => {
    const form = taskForms[qId] || {};
    const setF = (updater) => setTaskForms(prev => ({ ...prev, [qId]: { ...prev[qId], ...(typeof updater === 'function' ? updater(prev[qId] || {}) : updater) } }));
    const reqSel = requisitions.find(r => r.id === form.requisicaoId);
    const campos = reqSel?.campos || [];
    const filteredUsers = form.cargoId ? agencyUsers.filter(u => u.roleId === form.cargoId) : agencyUsers;
    const inp = { padding: '7px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 12, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box' };
    const lbl = { fontSize: 11, fontWeight: 600, color: '#5a6a7a', display: 'block', marginBottom: 3 };

    return (
      <div style={{ marginTop: 10, padding: 16, background: '#f8faff', borderRadius: 10, border: '1px solid #e0e8ff', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Seletor de requisição */}
        <div>
          <label style={lbl}>Tipo de Requisição</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {requisitions.length === 0 && <span style={{ fontSize: 12, color: '#aaa' }}>Nenhuma requisição cadastrada no admin.</span>}
            {requisitions.map(r => (
              <button key={r.id} onClick={() => setF({ requisicaoId: r.id, requisicaoCodigo: r.codigo, requisicaoNome: r.nome, bvPct: r.defaults?.bvPct?.toString() || '' })}
                style={{ padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${r.cor || '#667eea'}`, background: form.requisicaoId === r.id ? (r.cor || '#667eea') : 'white', color: form.requisicaoId === r.id ? 'white' : (r.cor || '#667eea'), fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
                {r.codigo}
              </button>
            ))}
            {form.requisicaoId && <span style={{ fontSize: 11, color: '#667', alignSelf: 'center' }}>{reqSel?.nome}</span>}
          </div>
        </div>

        {/* Tarefa + Descrição */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Tarefa *</label><input placeholder="Nome da tarefa..." value={form.tarefa || ''} onChange={e => setF({ tarefa: e.target.value })} style={inp} /></div>
          <div><label style={lbl}>Instrução / Descrição</label><input placeholder="Detalhes para quem executa..." value={form.descricao || ''} onChange={e => setF({ descricao: e.target.value })} style={inp} /></div>
        </div>

        {/* Cargo + Pessoa + Prazo + Prioridade */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px 120px', gap: 10 }}>
          <div>
            <label style={lbl}>Cargo</label>
            <select value={form.cargoId || ''} onChange={e => { const c = agencyRoles.find(r => r.id === e.target.value); setF({ cargoId: e.target.value, cargoNome: c?.name || '', pessoaId: '', pessoaNome: '' }); }} style={inp}>
              <option value="">Cargo...</option>
              {agencyRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Pessoa *</label>
            <select value={form.pessoaId || ''} onChange={e => { const p = agencyUsers.find(u => u.id === e.target.value); setF({ pessoaId: e.target.value, pessoaNome: p?.name || '' }); }} style={inp}>
              <option value="">Pessoa...</option>
              {filteredUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Prazo</label><input type="date" value={form.prazo || ''} onChange={e => setF({ prazo: e.target.value })} style={inp} /></div>
          <div>
            <label style={lbl}>Prioridade</label>
            <select value={form.prioridade || 'normal'} onChange={e => setF({ prioridade: e.target.value })} style={inp}>
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
        </div>

        {/* Campos dinâmicos da requisição */}
        {reqSel && (
          <div style={{ borderTop: `2px solid ${reqSel.cor || '#667eea'}33`, paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: reqSel.cor || '#667eea', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
              Requisição {reqSel.codigo} — {reqSel.nome}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {campos.includes('periodo')       && <div><label style={lbl}>Período (dias)</label><input type="number" min="0" value={form.periodo || ''} onChange={e => setF({ periodo: e.target.value })} style={inp} /></div>}
              {campos.includes('quantidade')    && <div><label style={lbl}>Quantidade</label><input type="number" min="0" value={form.quantidade || ''} onChange={e => setF({ quantidade: e.target.value })} style={inp} /></div>}
              {campos.includes('custoUnitario') && <div><label style={lbl}>Custo Unitário (R$)</label><input type="number" min="0" value={form.custoUnitario || ''} onChange={e => setF({ custoUnitario: e.target.value })} style={inp} /></div>}
              {campos.includes('bv')            && <div><label style={lbl}>BV % (padrão: {reqSel.defaults?.bvPct || 0}%)</label><input type="number" min="0" max="100" value={form.bvPct || ''} onChange={e => setF({ bvPct: e.target.value })} style={inp} /></div>}
              {campos.includes('credito')       && <div><label style={lbl}>Crédito (R$)</label><input type="number" min="0" value={form.credito || ''} onChange={e => setF({ credito: e.target.value })} style={inp} /></div>}
              {/* Custo Total calculado */}
              {campos.includes('custoUnitario') && campos.includes('periodo') && campos.includes('quantidade') && (() => {
                const total = (parseFloat(form.periodo) || 0) * (parseFloat(form.quantidade) || 0) * (parseFloat(form.custoUnitario) || 0);
                return (
                  <div style={{ background: '#f0fff4', border: '1px solid #86efac', borderRadius: 6, padding: '7px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label style={{ ...lbl, color: '#166534' }}>Custo Total</label>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>
                      {total > 0 ? `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>
                );
              })()}
            </div>

            {campos.includes('fornecedores') && (
              <div style={{ marginTop: 10 }}>
                <label style={{ ...lbl, marginBottom: 8 }}>3 Fornecedores para Orçar</label>
                {[1,2,3].map(n => {
                  const status = form[`fornecedor${n}Status`] || '';
                  const statusColor = status === 'recebido' ? '#16a34a' : status === 'aguardando' ? '#d97706' : '#94a3b8';
                  return (
                    <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 160px', gap: 8, marginBottom: 6 }}>
                      <input placeholder={`Fornecedor ${n} — nome`} value={form[`fornecedor${n}`] || ''} onChange={e => setF({ [`fornecedor${n}`]: e.target.value })} style={inp} />
                      <input type="number" placeholder="Valor est." value={form[`fornecedor${n}Valor`] || ''} onChange={e => setF({ [`fornecedor${n}Valor`]: e.target.value })} style={inp} />
                      <select value={status} onChange={e => setF({ [`fornecedor${n}Status`]: e.target.value })}
                        style={{ ...inp, color: statusColor, fontWeight: status ? 600 : 400, border: `1px solid ${statusColor}66` }}>
                        <option value="">Status...</option>
                        <option value="aguardando">Aguardando orçamento</option>
                        <option value="recebido">Orçamento recebido</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {campos.includes('justificativa') && <div style={{ marginTop: 6 }}><label style={lbl}>Justificativa</label><input placeholder="Ex: Fornecedor parceiro..." value={form.justificativa || ''} onChange={e => setF({ justificativa: e.target.value })} style={inp} /></div>}
            {campos.includes('observacao')    && <div style={{ marginTop: 6 }}><label style={lbl}>Observação</label><input placeholder="Observações adicionais..." value={form.observacao || ''} onChange={e => setF({ observacao: e.target.value })} style={inp} /></div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => toggleTaskForm(qId)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
          <button onClick={onCriar} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>Criar Tarefa</button>
        </div>
      </div>
    );
  };

  const abrirEdicao = () => {
    setEditedAnswers({ ...(project.answers || {}) });
    setExtraQuestions([]);
    setModoEditarBriefing(true);
  };

  const salvarEdicao = async () => {
    setSavingEdit(true);
    try {
      const timelineEntry = {
        action: 'briefing_edited',
        description: `Briefing editado por ${userData?.name || 'Usuário'}`,
        userId: userData?.id,
        userName: userData?.name,
        timestamp: new Date()
      };

      // Salva no filho
      await updateDoc(doc(db, 'budgets', projectId), {
        answers: editedAnswers,
        updatedAt: new Date(),
        timeline: [...(project.timeline || []), timelineEntry]
      });

      // Se for filho, sincroniza com o budget mãe
      if (project.parentBudgetId) {
        const maeSnap = await getDoc(doc(db, 'budgets', project.parentBudgetId));
        if (maeSnap.exists()) {
          const maeData = maeSnap.data();
          const maeAnswers = { ...(maeData.answers || {}) };
          const feiraIdx = project.feiraIndex ?? 0;

          // Para cada resposta editada no filho
          Object.entries(editedAnswers).forEach(([qId, val]) => {
            const originalMae = maeAnswers[qId];
            const isFeiraAnswer = (v) =>
              v && typeof v === 'object' && !Array.isArray(v) &&
              Object.keys(v).every(k => !isNaN(k));

            if (isFeiraAnswer(originalMae)) {
              // Resposta por feira — atualiza só o índice desta feira na mãe
              maeAnswers[qId] = { ...(originalMae || {}), [feiraIdx]: val[feiraIdx] ?? val };
            } else if (typeof val !== 'object' || Array.isArray(val)) {
              // Resposta simples (isShared) — atualiza direto na mãe
              maeAnswers[qId] = val;
            }
          });

          // Perguntas extras adicionadas — só registra na mãe se for isShared
          // (perguntas individuais ficam só no filho)

          await updateDoc(doc(db, 'budgets', project.parentBudgetId), {
            answers: maeAnswers,
            updatedAt: new Date(),
            timeline: [...(maeData.timeline || []), timelineEntry]
          });
        }
      }

      setModoEditarBriefing(false);
      setExtraQuestions([]);
      alert('Briefing atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar edição:', err);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSavingEdit(false);
    }
  };

  const salvarSessao = async () => {
    if (newTasks.length === 0) { alert('Nenhuma tarefa criada nesta sessão'); return; }
    setSavingSession(true);
    try {
      const existingTasks = project.tasks || [];
      const updatedTasks = [...existingTasks, ...newTasks];
      await updateDoc(doc(db, 'budgets', projectId), {
        tasks: updatedTasks,
        updatedAt: new Date(),
        timeline: [...(project.timeline || []), {
          action: 'planning_session',
          description: `Sessão de planejamento: ${newTasks.length} tarefa(s) criada(s) por ${userData?.name || 'Planner'}`,
          userId: userData?.id,
          userName: userData?.name,
          timestamp: new Date()
        }]
      });
      setProject(prev => ({ ...prev, tasks: updatedTasks }));
      setNewTasks([]);
      setModoEdicao(false);
      setTaskForms({});
      alert(`✓ Sessão salva! ${newTasks.length} tarefa(s) enviada(s).`);
    } catch (err) {
      console.error('Erro ao salvar sessão:', err);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSavingSession(false);
    }
  };

  // ── BRIEFING GERAL — Editar ──
  const abrirEdicaoGeral = () => {
    setEditedAnswersGeral({ ...(parentProject?.answers || {}) });
    setExtraQuestionsGeral([]);
    setModoEditarGeral(true);
  };

  const salvarEdicaoGeral = async () => {
    if (!parentProject) return;
    setSavingEditGeral(true);
    try {
      const timelineEntry = {
        action: 'briefing_geral_edited',
        description: `Briefing Geral editado por ${userData?.name || 'Usuário'}`,
        userId: userData?.id, userName: userData?.name, timestamp: new Date()
      };
      await updateDoc(doc(db, 'budgets', parentProject.id), {
        answers: editedAnswersGeral,
        updatedAt: new Date(),
        timeline: [...(parentProject.timeline || []), timelineEntry]
      });
      setModoEditarGeral(false);
      setExtraQuestionsGeral([]);
      alert('Briefing Geral atualizado!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar.');
    } finally {
      setSavingEditGeral(false);
    }
  };

  // ── BRIEFING GERAL — Sessão de Planejamento ──
  const toggleTaskFormGeral = (qId) => {
    setTaskFormsGeral(prev => ({
      ...prev,
      [qId]: prev[qId]?.open
        ? { ...prev[qId], open: false }
        : { open: true, tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' }
    }));
  };

  const updateTaskFormGeral = (qId, field, value) => {
    setTaskFormsGeral(prev => ({ ...prev, [qId]: { ...prev[qId], [field]: value } }));
    if (field === 'cargoId') {
      const cargo = agencyRoles.find(r => r.id === value);
      setTaskFormsGeral(prev => ({ ...prev, [qId]: { ...prev[qId], cargoId: value, cargoNome: cargo?.name || '', pessoaId: '', pessoaNome: '' } }));
    }
    if (field === 'pessoaId') {
      const pessoa = agencyUsers.find(u => u.id === value);
      setTaskFormsGeral(prev => ({ ...prev, [qId]: { ...prev[qId], pessoaId: value, pessoaNome: pessoa?.name || '' } }));
    }
  };

  const gerarTarefaGeral = (qId, qLabel, display, isFeiraAnswer) => {
    const form = taskFormsGeral[qId];
    if (!form?.tarefa) { alert('Descreva a tarefa'); return; }
    if (!form?.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    setNewTasksGeral(prev => [...prev, {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: qId,
      questionLabel: qLabel,
      briefingAnswer: display,
      isFeiraAnswer, // true = cria N tarefas (uma por filho), false = cria 1 na mãe
      name: form.tarefa,
      cargoId: form.cargoId,
      cargoNome: form.cargoNome,
      assignedTo: form.pessoaId,
      assignedToName: form.pessoaNome,
      valor: form.valor || '',
      status: 'backlog',
      createdAt: new Date(),
    }]);
    setTaskFormsGeral(prev => ({ ...prev, [qId]: { open: false, tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' } }));
  };

  const gerarNovaTaskGeral = () => {
    if (!novaTaskGeral.tarefa) { alert('Descreva a tarefa'); return; }
    if (!novaTaskGeral.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    setNewTasksGeral(prev => [...prev, {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: null, questionLabel: null, briefingAnswer: null,
      isFeiraAnswer: false,
      name: novaTaskGeral.tarefa,
      cargoId: novaTaskGeral.cargoId, cargoNome: novaTaskGeral.cargoNome,
      assignedTo: novaTaskGeral.pessoaId, assignedToName: novaTaskGeral.pessoaNome,
      valor: novaTaskGeral.valor || '',
      status: 'backlog', createdAt: new Date(),
    }]);
    setNovaTaskGeral({ tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' });
    setShowNovaTaskGeral(false);
  };

  const salvarSessaoGeral = async () => {
    if (newTasksGeral.length === 0) { alert('Nenhuma tarefa criada nesta sessão'); return; }
    if (!parentProject) return;
    setSavingSessionGeral(true);
    try {
      const timelineEntry = {
        action: 'planning_session_geral',
        description: `Sessão de planejamento geral: ${newTasksGeral.length} tarefa(s) por ${userData?.name || 'Planner'}`,
        userId: userData?.id, userName: userData?.name, timestamp: new Date()
      };

      // Buscar todos os filhos do budget mãe
      const filhosSnap = await getDocs(query(collection(db, 'budgets'), where('parentBudgetId', '==', parentProject.id)));
      const filhos = filhosSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.feiraIndex || 0) - (b.feiraIndex || 0));

      // Tarefas para a mãe (isShared ou sem vínculo)
      const tasksParaMae = newTasksGeral.filter(t => !t.isFeiraAnswer);
      // Tarefas por feira
      const tasksParaFeiras = newTasksGeral.filter(t => t.isFeiraAnswer);

      // Salva na mãe
      if (tasksParaMae.length > 0) {
        await updateDoc(doc(db, 'budgets', parentProject.id), {
          tasks: [...(parentProject.tasks || []), ...tasksParaMae],
          updatedAt: new Date(),
          timeline: [...(parentProject.timeline || []), timelineEntry]
        });
      }

      // Para cada filho, cria uma cópia das tarefas por feira
      for (const filho of filhos) {
        const tasksParaFilho = tasksParaFeiras.map(t => ({
          ...t,
          taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          feiraIndex: filho.feiraIndex,
          feiraNome: filho.feiraData?.nome || `Feira ${(filho.feiraIndex || 0) + 1}`,
          name: `${t.name} — ${filho.feiraData?.nome || `Feira ${(filho.feiraIndex || 0) + 1}`}`,
        }));
        if (tasksParaFilho.length > 0) {
          await updateDoc(doc(db, 'budgets', filho.id), {
            tasks: [...(filho.tasks || []), ...tasksParaFilho],
            updatedAt: new Date(),
            timeline: [...(filho.timeline || []), timelineEntry]
          });
        }
      }

      const totalCriadas = tasksParaMae.length + (tasksParaFeiras.length * filhos.length);
      setNewTasksGeral([]);
      setModoPlanejarGeral(false);
      setTaskFormsGeral({});
      alert(`✓ Sessão salva! ${totalCriadas} tarefa(s) criada(s) em ${filhos.length} feira(s).`);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar sessão.');
    } finally {
      setSavingSessionGeral(false);
    }
  };

  const getProjectName = () => {
    // Filho: usar nome da feira específica
    if (isFilho && project?.feiraData?.nome) return project.feiraData.nome;
    // Mãe: usar nome da feira mãe de fixed-events
    const feiras = project?.answers?.['fixed-events'];
    if (Array.isArray(feiras) && feiras.length > 0) {
      const mae = feiras.find(f => f.isMae) || feiras[0];
      if (mae?.nome) return mae.nome;
    }
    if (project?.answers?.['GApo1hcglkgdpAQGuSnn']) return project.answers['GApo1hcglkgdpAQGuSnn'];
    return project?.eventTypeName || 'Evento';
  };

  const getAnswerDisplay = (question, answer, feiras = []) => {
    if (answer === null || answer === undefined || answer === '') return 'Não respondido';

    const safeString = (val) => {
      if (val === null || val === undefined) return '—';
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    };

    // ── Resposta por feira: objeto com chaves numéricas {"0":"val","1":"val"} ──
    const isFeiraAnswer = (val) =>
      val && typeof val === 'object' && !Array.isArray(val) &&
      Object.keys(val).every(k => !isNaN(k));

    if (isFeiraAnswer(answer)) {
      return Object.entries(answer).map(([idx, val]) => {
        const feira = feiras[parseInt(idx)];
        const feiraLabel = feira?.nome ? feira.nome : `Feira ${parseInt(idx) + 1}`;
        return `${feiraLabel}: ${safeString(val)}`;
      }).join(' | ');
    }

    switch (question?.type) {
      case 'text': case 'number': case 'currency': return safeString(answer);
      case 'date':
        if (typeof answer === 'string') return answer;
        if (answer?.toDate) return answer.toDate().toLocaleDateString('pt-BR');
        return safeString(answer);
      case 'yesno': return answer === 'yes' || answer === 'Sim' ? 'Sim' : 'Não';
      case 'multiple': {
        const opt = question.options?.find(o => o.id === answer || o.label === answer);
        return opt?.label || safeString(answer);
      }
      case 'multiselect':
        if (!Array.isArray(answer)) return safeString(answer);
        return answer.join(', ');
      case 'fixed-events':
        if (!Array.isArray(answer)) return safeString(answer);
        return answer.map((f, i) => `Feira ${i + 1}: ${f.nome || ''}${f.local ? ` — ${f.local}` : ''}`).join(' | ');
      case 'fixed-envio':
        if (typeof answer === 'object') return answer.userName || '—';
        return safeString(answer);
      default: return safeString(answer);
    }
  };

  // Retorna array de { key, label, value } para renderizar linha a linha
  const getAnswerLines = (question, answer, feiras = []) => {
    if (answer === null || answer === undefined || answer === '') return [{ key: 'single', value: 'Não respondido' }];

    // Array genérico — checklist extraído do feiraIndex já vem como array
    if (Array.isArray(answer)) {
      if (answer.length === 0) return [{ key: 'single', value: 'Nenhum item' }];
      return answer.map((item, i) => ({ key: `item-${i}`, label: null, value: String(item) }));
    }

    // Checklist salvo como string separada por vírgula (dados legados)
    if (question?.type === 'checklist' && typeof answer === 'string') {
      const items = answer.split(',').map(s => s.trim()).filter(Boolean);
      if (items.length <= 1) return [{ key: 'single', label: null, value: answer }];
      return items.map((item, i) => ({ key: `item-${i}`, label: null, value: item }));
    }

    // Resposta por feira (objeto com índices numéricos)
    const isFeiraAnswer = (val) =>
      val && typeof val === 'object' && !Array.isArray(val) &&
      Object.keys(val).every(k => !isNaN(k));

    if (isFeiraAnswer(answer)) {
      return Object.entries(answer).map(([idx, v]) => {
        const feira = feiras[parseInt(idx)];
        const value = Array.isArray(v) ? v.join(', ') : String(v);
        return { key: `feira-${idx}`, label: feira?.nome || `Feira ${parseInt(idx) + 1}`, value };
      });
    }

    // Default — linha única
    return [{ key: 'single', label: null, value: getAnswerDisplay(question, answer, feiras) }];
  };

  const STATUS_MAP = {
    analyzing: { label: 'EM ANÁLISE', color: '#FFA726', bg: 'rgba(255,167,38,0.15)' },
    approved:  { label: 'APROVADO',   color: '#66BB6A', bg: 'rgba(102,187,106,0.15)' },
    rejected:  { label: 'REJEITADO',  color: '#EF5350', bg: 'rgba(239,83,80,0.15)' },
  };
  const statusInfo = STATUS_MAP[project?.status] || { label: 'AGUARDANDO', color: '#78909C', bg: 'rgba(120,144,156,0.15)' };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={{ color: '#7BAFD4', fontSize: 14, marginTop: 12 }}>Carregando projeto...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={styles.loadingWrap}>
        <p style={{ color: '#7BAFD4' }}>Projeto não encontrado.</p>
        <button onClick={onBack} style={styles.backBtnAlt}>Voltar</button>
      </div>
    );
  }

  const tabs = isFilho ? [
    { id: 'info',           label: 'Briefing da Feira' },
    { id: 'briefing-geral', label: 'Briefing Geral' },
    { id: 'tasks',          label: `Tarefas${project.tasks?.length ? ` (${project.tasks.length})` : ''}` },
    { id: 'timeline',       label: 'Histórico' },
  ] : [
    { id: 'info',     label: 'Visão Geral' },
    { id: 'briefing', label: 'Briefing' },
    { id: 'tasks',    label: `Tarefas${project.tasks?.length ? ` (${project.tasks.length})` : ''}` },
    { id: 'timeline', label: 'Histórico' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D1B2A; }
        .ps-wrap { min-height: 100vh; background: #f0f2f5; font-family: 'Outfit', sans-serif; color: #1a2e40; }

        /* TOPBAR */
        .ps-topbar {
          background: #0D1B2A; padding: 0 36px;
          display: flex; align-items: center; justify-content: space-between;
          height: 60px; border-bottom: 1px solid rgba(0,180,255,0.1);
          position: sticky; top: 0; z-index: 10;
        }
        .ps-back {
          display: flex; align-items: center; gap: 8px; cursor: pointer;
          color: #7BAFD4; font-size: 13px; font-weight: 300; background: none; border: none;
          font-family: 'Outfit', sans-serif; transition: color 0.15s; padding: 0;
        }
        .ps-back:hover { color: #00E5C4; }
        .ps-back-arrow { font-size: 18px; line-height: 1; }
        .ps-topbar-center {
          display: flex; align-items: center; gap: 12px;
        }
        .ps-topbar-name { font-size: 15px; font-weight: 400; color: #E8F4FF; }
        .ps-topbar-num { font-size: 12px; color: rgba(123,175,212,0.5); }
        .ps-status-pill {
          padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 500; letter-spacing: 1px;
        }
        .ps-btn-print {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(0,229,196,0.3);
          background: none; color: #00E5C4; font-family: 'Outfit', sans-serif;
          font-size: 12px; cursor: pointer; transition: all 0.15s; letter-spacing: 0.5px;
        }
        .ps-btn-print:hover { background: rgba(0,229,196,0.1); }

        /* HERO */
        .ps-hero {
          background: #0D1B2A; padding: 28px 36px 0;
          border-bottom: 1px solid rgba(0,180,255,0.08);
        }
        .ps-hero-title { font-size: 26px; font-weight: 300; color: #E8F4FF; margin-bottom: 6px; }
        .ps-hero-meta { display: flex; gap: 20px; font-size: 13px; color: #7BAFD4; margin-bottom: 20px; flex-wrap: wrap; }
        .ps-hero-meta span { display: flex; align-items: center; gap: 5px; }

        /* TABS */
        .ps-tabs { display: flex; gap: 4px; }
        .ps-tab {
          padding: 10px 20px; border: none; background: none; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 300;
          color: rgba(123,175,212,0.6); border-bottom: 2px solid transparent;
          transition: all 0.15s; letter-spacing: 0.3px;
        }
        .ps-tab:hover { color: #7BAFD4; }
        .ps-tab.active { color: #00E5C4; border-bottom-color: #00E5C4; font-weight: 400; }

        /* BODY */
        .ps-body { padding: 28px 36px; max-width: 900px; }

        /* CARDS */
        .ps-card {
          background: white; border-radius: 12px; padding: 24px;
          margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          border: 1px solid #e8eaed;
        }
        .ps-card-title {
          font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase;
          color: #00E5C4; margin-bottom: 16px; padding-bottom: 12px;
          border-bottom: 1px solid #f0f2f5;
        }

        /* INFO GRID */
        .ps-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ps-info-item { display: flex; flex-direction: column; gap: 3px; }
        .ps-info-label { font-size: 11px; color: #8a9bb0; letter-spacing: 0.5px; text-transform: uppercase; }
        .ps-info-value { font-size: 14px; color: #1a2e40; font-weight: 400; }
        .ps-info-item.full { grid-column: 1 / -1; }

        /* HIGHLIGHT */
        .ps-highlight {
          background: rgba(0,229,196,0.06); border: 1px solid rgba(0,229,196,0.2);
          border-radius: 8px; padding: 12px 16px;
        }
        .ps-highlight .ps-info-value { color: #00875A; font-weight: 500; font-size: 16px; }

        /* BRIEFING */
        .ps-answer-item {
          padding: 14px 0; border-bottom: 1px solid #f0f2f5;
          display: flex; flex-direction: column; gap: 6px;
        }
        .ps-answer-item:last-child { border-bottom: none; }
        .ps-question-text { font-size: 13px; color: #8a9bb0; font-weight: 400; }
        .ps-answer-text { font-size: 14px; color: #1a2e40; font-weight: 400; line-height: 1.5; }

        /* TASKS */
        .ps-task-item {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 14px 0; border-bottom: 1px solid #f0f2f5;
        }
        .ps-task-item:last-child { border-bottom: none; }
        .ps-task-num {
          width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
          background: #f0f2f5; display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 500; color: #8a9bb0;
        }
        .ps-task-body { flex: 1; }
        .ps-task-name { font-size: 14px; font-weight: 500; color: #1a2e40; margin-bottom: 3px; }
        .ps-task-desc { font-size: 12px; color: #8a9bb0; margin-bottom: 6px; }
        .ps-task-footer { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .ps-task-status {
          font-size: 10px; font-weight: 600; letter-spacing: 1px; padding: 3px 9px; border-radius: 20px;
        }
        .ps-task-status.pending     { background: rgba(255,167,38,0.12); color: #FFA726; }
        .ps-task-status.in_progress { background: rgba(55,138,221,0.12); color: #378ADD; }
        .ps-task-status.completed   { background: rgba(102,187,106,0.12); color: #66BB6A; }
        .ps-task-assigned { font-size: 12px; color: #8a9bb0; }

        /* TIMELINE */
        .ps-timeline { display: flex; flex-direction: column; gap: 0; }
        .ps-tl-item { display: flex; gap: 16px; padding: 14px 0; position: relative; }
        .ps-tl-item:not(:last-child)::after {
          content: ''; position: absolute; left: 15px; top: 42px; bottom: 0;
          width: 1px; background: #e8eaed;
        }
        .ps-tl-dot {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          background: rgba(0,229,196,0.1); border: 2px solid rgba(0,229,196,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; color: #00E5C4; z-index: 1;
        }
        .ps-tl-body { flex: 1; padding-top: 4px; }
        .ps-tl-desc { font-size: 14px; color: #1a2e40; font-weight: 400; margin-bottom: 3px; }
        .ps-tl-meta { font-size: 12px; color: #8a9bb0; }

        /* EMPTY */
        .ps-empty { padding: 32px; text-align: center; color: #8a9bb0; font-size: 14px; }

        /* STATUS CARDS */
        .ps-status-card {
          border-radius: 10px; padding: 16px 20px; margin-bottom: 20px;
          border: 1px solid;
        }
        .ps-status-card.approved { background: rgba(102,187,106,0.06); border-color: rgba(102,187,106,0.2); }
        .ps-status-card.rejected { background: rgba(239,83,80,0.06); border-color: rgba(239,83,80,0.2); }
        .ps-status-card-title { font-size: 11px; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px; }
        .ps-status-card.approved .ps-status-card-title { color: #66BB6A; }
        .ps-status-card.rejected .ps-status-card-title { color: #EF5350; }

        /* PRINT */
        @media print {
          .ps-topbar, .ps-tabs, .ps-btn-print { display: none !important; }
          .ps-hero { background: white !important; padding: 20px !important; }
          .ps-hero-title, .ps-hero-meta { color: #1a2e40 !important; }
          .ps-body { padding: 0 !important; }
          .ps-card { box-shadow: none !important; border: 1px solid #e0e0e0 !important; break-inside: avoid; }
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          .ps-topbar { padding: 0 16px; }
          .ps-hero { padding: 20px 16px 0; }
          .ps-body { padding: 16px; }
          .ps-info-grid { grid-template-columns: 1fr; }
          .ps-topbar-center { display: none; }
        }
      `}</style>

      <div className="ps-wrap">

        {/* TOPBAR */}
        <div className="ps-topbar">
          <button className="ps-back" onClick={onBack}>
            <span className="ps-back-arrow">←</span>
            Voltar
          </button>
          <div className="ps-topbar-center">
            <span className="ps-topbar-name">{getProjectName()}</span>
            <span className="ps-topbar-num">{project.jobCode || `#${project.budgetNumber || ''}`}</span>
            <span className="ps-status-pill" style={{ background: statusInfo.bg, color: statusInfo.color }}>
              {statusInfo.label}
            </span>
          </div>
          <button className="ps-btn-print" onClick={handlePrint}>
            Imprimir / PDF
          </button>
        </div>

        {/* HERO */}
        <div className="ps-hero">
          <h1 className="ps-hero-title">{getProjectName()}</h1>
          <div className="ps-hero-meta">
            <span>{project.jobCode || `Projeto #${project.budgetNumber || ''}`}</span>
            <span>{project.eventTypeName}</span>
            {project.companyName && <span>{project.companyName}</span>}
            <span>Criado em {formatDateShort(project.createdAt)}</span>
            {project.assignedToName && <span>Atendimento: {project.assignedToName}</span>}
          </div>

          {/* TABS */}
          <div className="ps-tabs">
            {tabs.map(t => (
              <button key={t.id} className={`ps-tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* BODY */}
        <div className="ps-body">

          {/* ── VISÃO GERAL / BRIEFING DA FEIRA ── */}
          {activeTab === 'info' && (
            <>
              {/* FILHO: Briefing completo desta feira */}
              {isFilho ? (
                <>
                  {/* Cabeçalho da feira */}
                  {project.feiraData && (
                    <div className="ps-card" style={{ borderLeft: '3px solid #00E5C4' }}>
                      <div className="ps-info-grid">
                        <div className="ps-info-item">
                          <span className="ps-info-label">Empresa</span>
                          <span className="ps-info-value">{project.companyName || '—'}</span>
                        </div>
                        <div className="ps-info-item">
                          <span className="ps-info-label">Responsável</span>
                          <span className="ps-info-value">{project.clientName || '—'}</span>
                        </div>
                        <div className="ps-info-item">
                          <span className="ps-info-label">Local</span>
                          <span className="ps-info-value">{project.feiraData.local || '—'}</span>
                        </div>
                        <div className="ps-info-item">
                          <span className="ps-info-label">Período</span>
                          <span className="ps-info-value">
                            {project.feiraData.dataInicio || '—'}{project.feiraData.dataFim ? ` até ${project.feiraData.dataFim}` : ''}
                          </span>
                        </div>
                        <div className="ps-info-item">
                          <span className="ps-info-label">Atendimento</span>
                          <span className="ps-info-value">{project.assignedToName || '—'}</span>
                        </div>
                        <div className="ps-info-item">
                          <span className="ps-info-label">Planner</span>
                          <span className="ps-info-value">{project.plannerUserName || '—'}</span>
                        </div>
                        {project.feiraData.isMae && (
                          <div className="ps-info-item">
                            <span className="ps-info-label" style={{ color: '#00E5C4' }}>⭐ Feira Mãe</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Respostas filtradas por feiraIndex */}
                  <div className="ps-card">
                    <div className="ps-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Respostas do Briefing</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {/* Botão Editar Briefing */}
                        {canEdit && !modoEdicao && !modoEditarBriefing && (
                          <button onClick={abrirEdicao} style={{
                            padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,167,38,0.4)',
                            background: 'none', color: '#FFA726', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                          }}>Editar Briefing</button>
                        )}
                        {modoEditarBriefing && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={salvarEdicao} disabled={savingEdit} style={{
                              padding: '5px 14px', borderRadius: 6, border: 'none',
                              background: 'linear-gradient(135deg,#FFA726,#f57c00)',
                              color: 'white', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600
                            }}>{savingEdit ? 'Salvando...' : 'Salvar Edição'}</button>
                            <button onClick={() => setModoEditarBriefing(false)} style={{
                              padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd',
                              background: 'none', color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                            }}>Cancelar</button>
                          </div>
                        )}
                        {/* Botão Sessão de Planejamento */}
                        {canPlan && !modoEdicao && !modoEditarBriefing && (
                          <button onClick={() => setModoEdicao(true)} style={{
                            padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(0,229,196,0.4)',
                            background: 'none', color: '#00E5C4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                          }}>Sessão de Planejamento</button>
                        )}
                        {modoEdicao && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <span style={{ fontSize: 11, color: '#FFA726', alignSelf: 'center' }}>
                              {newTasks.length} tarefa(s) criada(s)
                            </span>
                            <button onClick={salvarSessao} disabled={savingSession} style={{
                              padding: '5px 14px', borderRadius: 6, border: 'none',
                              background: newTasks.length > 0 ? 'linear-gradient(135deg,#00E5C4,#0080FF)' : '#ccc',
                              color: 'white', fontSize: 11, cursor: newTasks.length > 0 ? 'pointer' : 'not-allowed',
                              fontFamily: 'Outfit, sans-serif', fontWeight: 600
                            }}>{savingSession ? 'Salvando...' : 'Salvar Sessão'}</button>
                            <button onClick={() => { setModoEdicao(false); setNewTasks([]); setTaskForms({}); }} style={{
                              padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd',
                              background: 'none', color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                            }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const allQsToShow = [...questions, ...extraQuestions];
                      const feiraIdx = project.feiraIndex ?? 0;
                      const isFeiraAnswer = (val) =>
                        val && typeof val === 'object' && !Array.isArray(val) &&
                        Object.keys(val).every(k => !isNaN(k));

                      const inputStyle = {
                        width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif',
                        background: '#fff', color: '#1a2e40', outline: 'none'
                      };

                      const renderEditInput = (q) => {
                        const cur = editedAnswers[q.id];
                        if (q.type === 'yesno') return (
                          <div style={{ display: 'flex', gap: 8 }}>
                            {['Sim', 'Não'].map(opt => (
                              <button key={opt} onClick={() => setEditedAnswers(p => ({ ...p, [q.id]: opt }))} style={{
                                ...inputStyle, width: 'auto', padding: '6px 16px', cursor: 'pointer',
                                background: cur === opt ? '#e8f5e9' : '#fff',
                                borderColor: cur === opt ? '#66BB6A' : '#dde', color: cur === opt ? '#27ae60' : '#666'
                              }}>{opt}</button>
                            ))}
                          </div>
                        );
                        if (q.type === 'textarea') return (
                          <textarea value={isFeiraAnswer(cur) ? (cur[feiraIdx] || '') : (cur || '')}
                            onChange={e => {
                              if (isFeiraAnswer(cur)) setEditedAnswers(p => ({ ...p, [q.id]: { ...cur, [feiraIdx]: e.target.value } }));
                              else setEditedAnswers(p => ({ ...p, [q.id]: e.target.value }));
                            }}
                            rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                        );
                        if (q.type === 'multiple') return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(q.options || []).map(opt => {
                              const val = isFeiraAnswer(cur) ? (cur[feiraIdx] || '') : (cur || '');
                              return (
                                <button key={opt.id} onClick={() => {
                                  if (isFeiraAnswer(cur)) setEditedAnswers(p => ({ ...p, [q.id]: { ...cur, [feiraIdx]: opt.label } }));
                                  else setEditedAnswers(p => ({ ...p, [q.id]: opt.label }));
                                }} style={{
                                  ...inputStyle, textAlign: 'left', cursor: 'pointer',
                                  background: val === opt.label ? '#e8f5e9' : '#fff',
                                  borderColor: val === opt.label ? '#66BB6A' : '#dde'
                                }}>{opt.label}</button>
                              );
                            })}
                          </div>
                        );
                        // text, number, date, currency, checklist
                        const val = isFeiraAnswer(cur) ? (cur[feiraIdx] || '') : (cur || '');
                        return (
                          <input type={q.type === 'currency' || q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text'}
                            value={Array.isArray(val) ? val.join(', ') : val}
                            onChange={e => {
                              if (isFeiraAnswer(cur)) setEditedAnswers(p => ({ ...p, [q.id]: { ...cur, [feiraIdx]: e.target.value } }));
                              else setEditedAnswers(p => ({ ...p, [q.id]: e.target.value }));
                            }}
                            style={inputStyle} />
                        );
                      };

                      if (allQsToShow.length === 0) return <div className="ps-empty">Nenhuma pergunta no fluxo</div>;

                      return allQsToShow.map(q => {
                        const raw = modoEditarBriefing ? editedAnswers[q.id] : project.answers?.[q.id];
                        const isFeiraAnswerVal = raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).every(k => !isNaN(k));
                        const rawForFeira = isFeiraAnswerVal ? (raw[feiraIdx] !== undefined ? raw[feiraIdx] : '') : raw;
                        const answerLines = !modoEditarBriefing ? getAnswerLines(q, rawForFeira, project.answers?.['fixed-events'] || []) : null;
                        const isMultiLine = answerLines && answerLines.length > 1;
                        const form = taskForms[q.id] || {};
                        const tasksCriadas = newTasks.filter(t => t.questionId === q.id);
                        const filteredUsers = form.cargoId ? agencyUsers.filter(u => u.roleId === form.cargoId) : agencyUsers;

                        return (
                          <div key={q.id} style={{ padding: '14px 0', borderBottom: '1px solid #f0f2f5' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                              <div style={{ flex: 1 }}>
                                <span className="ps-question-text">
                                  {q.text}
                                  {q.isShared && <span style={{ fontSize: 10, color: '#00E5C4', marginLeft: 6 }}>comum</span>}
                                  {extraQuestions.find(eq => eq.id === q.id) && <span style={{ fontSize: 10, color: '#FFA726', marginLeft: 6 }}>nova</span>}
                                </span>
                                {modoEditarBriefing ? (
                                  <div style={{ marginTop: 6 }}>{renderEditInput(q)}</div>
                                ) : (
                                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {answerLines.map(line => (
                                      <div key={line.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMultiLine ? '4px 8px' : 0, background: isMultiLine ? '#fafafa' : 'none', borderRadius: isMultiLine ? 6 : 0, border: isMultiLine ? '1px solid #f0f2f5' : 'none' }}>
                                        <span className="ps-answer-text">
                                          {line.label && <span style={{ color: '#8a9bb0', marginRight: 6, fontSize: 12, fontWeight: 500 }}>{line.label}:</span>}
                                          {line.value}
                                        </span>
                                        {modoEdicao && isMultiLine && (
                                          <button onClick={() => { const k = `${q.id}__${line.key}`; setTaskForms(prev => ({ ...prev, [k]: prev[k]?.open ? { ...prev[k], open: false } : { open: true, tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '', lineLabel: line.label, lineValue: line.value } })); }} style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 5, fontSize: 10, border: '1px solid rgba(0,229,196,0.4)', background: 'none', color: '#00E5C4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', marginLeft: 8 }}>
                                            Gerar Tarefa
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {modoEdicao && !modoEditarBriefing && !isMultiLine && (
                                <button onClick={() => toggleTaskForm(q.id)} style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 6, fontSize: 11, border: '1px solid rgba(0,229,196,0.4)', background: form.open ? 'rgba(0,229,196,0.1)' : 'none', color: '#00E5C4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' }}>Gerar Tarefa</button>
                              )}
                              {modoEditarBriefing && extraQuestions.find(eq => eq.id === q.id) && (
                                <button onClick={() => setExtraQuestions(prev => prev.filter(eq => eq.id !== q.id))} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>✕</button>
                              )}
                            </div>

                            {/* Mini-forms por linha (checklist/itens múltiplos) */}
                            {modoEdicao && isMultiLine && answerLines.map(line => {
                              const k = `${q.id}__${line.key}`;
                              const lf = taskForms[k] || {};
                              const lu = lf.cargoId ? agencyUsers.filter(u => u.roleId === lf.cargoId) : agencyUsers;
                              const lt = newTasks.filter(t => t.questionId === k);
                              if (!lf.open && lt.length === 0) return null;
                              return (
                                <div key={k}>
                                  {lf.open && (
                                    <div style={{ margin: '6px 0 6px 8px', padding: 12, background: '#f8faff', borderRadius: 8, border: '1px solid #e0e8ff', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      <span style={{ fontSize: 11, color: '#667eea', fontWeight: 600 }}>{line.label ? `${line.label}: ` : ''}{line.value}</span>
                                      <input placeholder="Tarefa *" value={lf.tarefa||''} onChange={e => setTaskForms(prev => ({...prev,[k]:{...prev[k],tarefa:e.target.value}}))} style={{ padding:'7px 10px', borderRadius:6, border:'1px solid #dde', fontSize:12, fontFamily:'Outfit, sans-serif' }} />
                                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                        <select value={lf.cargoId||''} onChange={e => { const c=agencyRoles.find(r=>r.id===e.target.value); setTaskForms(prev=>({...prev,[k]:{...prev[k],cargoId:e.target.value,cargoNome:c?.name||'',pessoaId:'',pessoaNome:''}})); }} style={{ padding:'7px 8px', borderRadius:6, border:'1px solid #dde', fontSize:12, fontFamily:'Outfit, sans-serif' }}>
                                          <option value="">Cargo...</option>
                                          {agencyRoles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                                        </select>
                                        <select value={lf.pessoaId||''} onChange={e => { const p=agencyUsers.find(u=>u.id===e.target.value); setTaskForms(prev=>({...prev,[k]:{...prev[k],pessoaId:e.target.value,pessoaNome:p?.name||''}})); }} style={{ padding:'7px 8px', borderRadius:6, border:'1px solid #dde', fontSize:12, fontFamily:'Outfit, sans-serif' }}>
                                          <option value="">Pessoa *</option>
                                          {lu.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                      </div>
                                      <input placeholder="Valor (opcional)" value={lf.valor||''} onChange={e=>setTaskForms(prev=>({...prev,[k]:{...prev[k],valor:e.target.value}}))} type="number" min="0" style={{ padding:'7px 10px', borderRadius:6, border:'1px solid #dde', fontSize:12, fontFamily:'Outfit, sans-serif' }} />
                                      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                                        <button onClick={()=>setTaskForms(prev=>({...prev,[k]:{...prev[k],open:false}}))} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #ddd', background:'none', color:'#666', fontSize:11, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>Cancelar</button>
                                        <button onClick={()=>{
                                          if(!lf.tarefa){alert('Descreva a tarefa');return;}
                                          if(!lf.pessoaId){alert('Selecione a pessoa');return;}
                                          setNewTasks(prev=>[...prev,{taskId:`task-${Date.now()}-${Math.random().toString(36).slice(2)}`,questionId:k,questionText:`${q.text}${line.label?` — ${line.label}`:''}`,briefingAnswer:line.value,name:lf.tarefa,cargoId:lf.cargoId,cargoNome:lf.cargoNome,assignedTo:lf.pessoaId,assignedToName:lf.pessoaNome,valor:lf.valor||'',status:'backlog',createdAt:new Date()}]);
                                          setTaskForms(prev=>({...prev,[k]:{open:false,tarefa:'',cargoId:'',cargoNome:'',pessoaId:'',pessoaNome:'',valor:''}}));
                                        }} style={{ padding:'5px 12px', borderRadius:6, border:'none', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'white', fontSize:11, cursor:'pointer', fontFamily:'Outfit, sans-serif', fontWeight:600 }}>Criar</button>
                                      </div>
                                    </div>
                                  )}
                                  {lt.map(t=>(
                                    <div key={t.taskId} style={{ margin:'4px 0 4px 8px', display:'flex', alignItems:'center', gap:8, padding:'5px 8px', background:'rgba(102,126,234,0.06)', borderRadius:6, border:'1px solid rgba(102,126,234,0.2)' }}>
                                      <span style={{ fontSize:10, color:'#667eea' }}>✓</span>
                                      <span style={{ fontSize:11, flex:1, color:'#2c3e50' }}>{t.name}</span>
                                      <span style={{ fontSize:10, color:'#1976d2' }}>{t.assignedToName}</span>
                                      {t.valor&&<span style={{ fontSize:10, color:'#27ae60' }}>R$ {t.valor}</span>}
                                      <button onClick={()=>setNewTasks(prev=>prev.filter(x=>x.taskId!==t.taskId))} style={{ background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:11 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}

                            {/* Mini-form tarefa resposta única */}
                            {modoEdicao && !isMultiLine && form.open && renderMiniForm(q.id, () => gerarTarefa(q, answerLines?.[0]?.value || ''))}

                            {tasksCriadas.map(t => (
                              <div key={t.taskId} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(102,126,234,0.06)', borderRadius: 6, border: '1px solid rgba(102,126,234,0.2)' }}>
                                <span style={{ fontSize: 11, color: '#667eea' }}>✓</span>
                                {t.requisicaoCodigo && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#667eea22', color: '#667eea' }}>{t.requisicaoCodigo}</span>}
                                <span style={{ fontSize: 12, flex: 1, color: '#2c3e50' }}>{t.name}</span>
                                <span style={{ fontSize: 11, color: '#7b1fa2' }}>{t.cargoNome}</span>
                                <span style={{ fontSize: 11, color: '#1976d2' }}>{t.assignedToName}</span>
                                {t.prazo && <span style={{ fontSize: 10, color: '#e67e22' }}>{t.prazo}</span>}
                                {modoEdicao && <button onClick={() => removerNewTask(t.taskId)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 13 }}>✕</button>}
                              </div>
                            ))}
                          </div>
                        );
                      });
                    })()}

                    {/* Adicionar pergunta (modo editar) */}
                    {modoEditarBriefing && (
                      <div style={{ marginTop: 16 }}>
                        {!showAddPergunta ? (
                          <button onClick={() => setShowAddPergunta(true)} style={{
                            width: '100%', padding: '10px', borderRadius: 8, border: '1.5px dashed #FFA726',
                            background: 'none', color: '#FFA726', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                          }}>+ Adicionar Pergunta</button>
                        ) : (
                          <div style={{ padding: 14, background: '#fffbf0', borderRadius: 8, border: '1px solid #ffe0a0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#FFA726' }}>ADICIONAR PERGUNTA DO BANCO</span>
                            <select onChange={e => {
                              const q = allQuestions.find(q => q.id === e.target.value);
                              if (q && !questions.find(eq => eq.id === q.id) && !extraQuestions.find(eq => eq.id === q.id)) {
                                setExtraQuestions(prev => [...prev, q]);
                              }
                              setShowAddPergunta(false);
                            }} defaultValue="" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #ffe0a0', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                              <option value="">Selecione uma pergunta...</option>
                              {allQuestions
                                .filter(q => !questions.find(eq => eq.id === q.id) && !extraQuestions.find(eq => eq.id === q.id))
                                .map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
                            </select>
                            <button onClick={() => setShowAddPergunta(false)} style={{ alignSelf: 'flex-end', padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nova tarefa do zero (sessão planejamento) */}
                    {modoEdicao && (
                      <div style={{ marginTop: 16 }}>
                        {!showNovaTask ? (
                          <button onClick={() => setShowNovaTask(true)} style={{
                            width: '100%', padding: '10px', borderRadius: 8, border: '1.5px dashed #667eea',
                            background: 'none', color: '#667eea', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                          }}>+ Nova Tarefa (sem vínculo com pergunta)</button>
                        ) : (
                          <div style={{ padding: 14, background: '#f8faff', borderRadius: 8, border: '1px solid #e0e8ff', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#667eea' }}>NOVA TAREFA</span>
                            <input placeholder="Tarefa *" value={novaTask.tarefa} onChange={e => setNovaTask(p => ({ ...p, tarefa: e.target.value }))}
                              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif' }} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <select value={novaTask.cargoId} onChange={e => {
                                const cargo = agencyRoles.find(r => r.id === e.target.value);
                                setNovaTask(p => ({ ...p, cargoId: e.target.value, cargoNome: cargo?.name || '', pessoaId: '', pessoaNome: '' }));
                              }} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                                <option value="">Cargo...</option>
                                {agencyRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                              <select value={novaTask.pessoaId} onChange={e => {
                                const pessoa = agencyUsers.find(u => u.id === e.target.value);
                                setNovaTask(p => ({ ...p, pessoaId: e.target.value, pessoaNome: pessoa?.name || '' }));
                              }} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                                <option value="">Pessoa *</option>
                                {(novaTask.cargoId ? agencyUsers.filter(u => u.roleId === novaTask.cargoId) : agencyUsers).map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            </div>
                            <input placeholder="Valor estimado (opcional)" value={novaTask.valor} onChange={e => setNovaTask(p => ({ ...p, valor: e.target.value }))}
                              type="number" min="0"
                              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif' }} />
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button onClick={() => setShowNovaTask(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                              <button onClick={gerarNovaTask} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>Criar Tarefa</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tarefas do zero criadas nesta sessão */}
                    {newTasks.filter(t => !t.questionId).map(t => (
                      <div key={t.taskId} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(102,126,234,0.06)', borderRadius: 6, border: '1px solid rgba(102,126,234,0.2)' }}>
                        <span style={{ fontSize: 11, color: '#667eea' }}>✓</span>
                        <span style={{ fontSize: 12, flex: 1, color: '#2c3e50' }}>{t.name}</span>
                        <span style={{ fontSize: 11, color: '#7b1fa2' }}>{t.cargoNome}</span>
                        <span style={{ fontSize: 11, color: '#1976d2' }}>{t.assignedToName}</span>
                        {t.valor && <span style={{ fontSize: 11, color: '#27ae60' }}>R$ {t.valor}</span>}
                        {modoEdicao && <button onClick={() => removerNewTask(t.taskId)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 13 }}>✕</button>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                // MÃE: visão geral normal
                <>
                  {/* Cliente */}
                  <div className="ps-card">
                    <div className="ps-card-title">Cliente</div>
                    <div className="ps-info-grid">
                      <div className="ps-info-item">
                        <span className="ps-info-label">Nome</span>
                        <span className="ps-info-value">{project.clientName || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Empresa</span>
                        <span className="ps-info-value">{project.companyName || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Email</span>
                        <span className="ps-info-value">{project.clientEmail || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Telefone</span>
                        <span className="ps-info-value">{project.clientPhone || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Evento */}
                  <div className="ps-card">
                    <div className="ps-card-title">Evento</div>
                    <div className="ps-info-grid">
                      <div className="ps-info-item">
                        <span className="ps-info-label">Tipo de evento</span>
                        <span className="ps-info-value">{project.eventTypeName || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Solicitado em</span>
                        <span className="ps-info-value">{formatDate(project.createdAt)}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Atendimento responsável</span>
                        <span className="ps-info-value">{project.assignedToName || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Atribuído em</span>
                        <span className="ps-info-value">{formatDate(project.assignedAt)}</span>
                      </div>
                      {project.estimatedTotal > 0 && (
                        <div className="ps-info-item full ps-highlight">
                          <span className="ps-info-label">Valor estimado</span>
                          <span className="ps-info-value">
                            R$ {project.estimatedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── BRIEFING ── */}
          {activeTab === 'briefing' && (
            <div className="ps-card">
              <div className="ps-card-title">Respostas do Briefing</div>
              {questions.length > 0 ? (
                questions.map(q => (
                  <div key={q.id} className="ps-answer-item">
                    <span className="ps-question-text">{q.text}</span>
                    <span className="ps-answer-text">
                      {getAnswerDisplay(q, project.answers?.[q.id], project.answers?.['fixed-events'] || [])}
                    </span>
                  </div>
                ))
              ) : project.answers && Object.keys(project.answers).length > 0 ? (
                (() => {
                  const feiras = project.answers['fixed-events'] || [];
                  const isFeiraAnswer = (val) =>
                    val && typeof val === 'object' && !Array.isArray(val) &&
                    Object.keys(val).every(k => !isNaN(k));

                  return Object.entries(project.answers).map(([key, val]) => {
                    let display = '';
                    if (val === null || val === undefined) {
                      display = '—';
                    } else if (key === 'fixed-events' && Array.isArray(val)) {
                      display = val.map((f, i) => `Feira ${i + 1}: ${f.nome || ''}${f.local ? ` — ${f.local}` : ''}${f.dataInicio ? ` (${f.dataInicio}${f.dataFim ? ` a ${f.dataFim}` : ''})` : ''}`).join(' | ');
                    } else if (key === 'fixed-envio' && typeof val === 'object' && !Array.isArray(val)) {
                      display = val.userName || '—';
                    } else if (isFeiraAnswer(val)) {
                      display = Object.entries(val).map(([idx, v]) => {
                        const feira = feiras[parseInt(idx)];
                        const label = feira?.nome ? feira.nome : `Feira ${parseInt(idx) + 1}`;
                        return `${label}: ${v}`;
                      }).join(' | ');
                    } else if (Array.isArray(val)) {
                      display = val.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', ');
                    } else if (typeof val === 'object') {
                      display = JSON.stringify(val);
                    } else {
                      display = String(val);
                    }
                    return (
                      <div key={key} className="ps-answer-item">
                        <span className="ps-question-text">{key}</span>
                        <span className="ps-answer-text">{display}</span>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="ps-empty">Nenhuma resposta disponível</div>
              )}
            </div>
          )}

          {/* ── BRIEFING GERAL (só filhos) ── */}
          {activeTab === 'briefing-geral' && (
            <div className="ps-card">
              <div className="ps-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Briefing Geral — Pacote Completo</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {canEdit && !modoEditarGeral && !modoPlanejarGeral && (
                    <button onClick={abrirEdicaoGeral} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,167,38,0.4)', background: 'none', color: '#FFA726', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar Briefing</button>
                  )}
                  {modoEditarGeral && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={salvarEdicaoGeral} disabled={savingEditGeral} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#FFA726,#f57c00)', color: 'white', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{savingEditGeral ? 'Salvando...' : 'Salvar Edição'}</button>
                      <button onClick={() => setModoEditarGeral(false)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                    </div>
                  )}
                  {canPlan && !modoPlanejarGeral && !modoEditarGeral && (
                    <button onClick={() => setModoPlanejarGeral(true)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(0,229,196,0.4)', background: 'none', color: '#00E5C4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Sessão de Planejamento</button>
                  )}
                  {modoPlanejarGeral && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#FFA726', alignSelf: 'center' }}>{newTasksGeral.length} tarefa(s)</span>
                      <button onClick={salvarSessaoGeral} disabled={savingSessionGeral} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: newTasksGeral.length > 0 ? 'linear-gradient(135deg,#00E5C4,#0080FF)' : '#ccc', color: 'white', fontSize: 11, cursor: newTasksGeral.length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{savingSessionGeral ? 'Salvando...' : 'Salvar Sessão'}</button>
                      <button onClick={() => { setModoPlanejarGeral(false); setNewTasksGeral([]); setTaskFormsGeral({}); }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                    </div>
                  )}
                </div>
              </div>

              {parentProject ? (() => {
                const answers = modoEditarGeral ? editedAnswersGeral : (parentProject.answers || {});
                const feiras = parentProject.answers?.['fixed-events'] || [];
                const isFeiraAnswerFn = (val) =>
                  val && typeof val === 'object' && !Array.isArray(val) &&
                  Object.keys(val).every(k => !isNaN(k));

                const getDisplay = (key, val) => {
                  if (val === null || val === undefined) return '—';
                  if (key === 'fixed-events' && Array.isArray(val))
                    return val.map((f, i) => `Feira ${i+1}: ${f.nome||''}${f.local?` — ${f.local}`:''}${f.dataInicio?` (${f.dataInicio}${f.dataFim?` a ${f.dataFim}`:''})`:''}` ).join(' | ');
                  if (key === 'fixed-envio' && typeof val === 'object' && !Array.isArray(val)) return val.userName || '—';
                  if (isFeiraAnswerFn(val))
                    return Object.entries(val).map(([idx, v]) => `${feiras[parseInt(idx)]?.nome || `Feira ${parseInt(idx)+1}`}: ${v}`).join(' | ');
                  if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
                  if (typeof val === 'object') return JSON.stringify(val);
                  return String(val);
                };

                const inputStyle = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif', background: '#fff', color: '#1a2e40', outline: 'none' };

                const renderEditInputGeral = (key, val) => {
                  const q = allQuestions.find(q => q.id === key);
                  if (q?.type === 'yesno') return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['Sim','Não'].map(opt => <button key={opt} onClick={() => setEditedAnswersGeral(p => ({...p,[key]:opt}))} style={{...inputStyle,width:'auto',padding:'6px 16px',cursor:'pointer',background:val===opt?'#e8f5e9':'#fff',borderColor:val===opt?'#66BB6A':'#dde',color:val===opt?'#27ae60':'#666'}}>{opt}</button>)}
                    </div>
                  );
                  if (q?.type === 'textarea') return <textarea value={typeof val==='object'?JSON.stringify(val):(val||'')} onChange={e=>setEditedAnswersGeral(p=>({...p,[key]:e.target.value}))} rows={3} style={{...inputStyle,resize:'vertical'}} />;
                  return <input type="text" value={typeof val==='object'?JSON.stringify(val):(val||'')} onChange={e=>setEditedAnswersGeral(p=>({...p,[key]:e.target.value}))} style={inputStyle} />;
                };

                const fixedLabels = { 'fixed-events':{label:'Feiras',order:-5}, 'fixed-purpose':{label:'Propósito',order:-4}, 'fixed-client':{label:'Empresa Cliente',order:-6}, 'fixed-responsible':{label:'Responsável',order:-3}, 'fixed-attendant':{label:'Atendimento',order:-2}, 'fixed-date':{label:'Data',order:-1}, 'fixed-envio':{label:'Encaminhado para',order:9999} };

                const allQsGeral = [
                  ...Object.entries(answers).map(([key, val]) => {
                    const fixed = fixedLabels[key];
                    const q = allQuestions.find(q => q.id === key);
                    return { key, label: fixed?.label || q?.text || key, order: fixed?.order ?? (q?.order||999), val, isFixed: !!fixed, isFeiraAnswer: isFeiraAnswerFn(val) };
                  }),
                  ...extraQuestionsGeral.filter(q => !Object.keys(answers).includes(q.id)).map(q => ({ key: q.id, label: q.text, order: q.order||998, val: undefined, isFixed: false, isFeiraAnswer: false, isExtra: true }))
                ].sort((a,b) => a.order - b.order);

                return (
                  <>
                    {allQsGeral.map(({ key, label, val, isFixed, isFeiraAnswer, isExtra }) => {
                      const q = allQuestions.find(q => q.id === key);
                      const geralLines = !modoEditarGeral ? getAnswerLines(q, val, feiras) : null;
                      const isMultiLineGeral = geralLines && geralLines.length > 1;
                      const formG = taskFormsGeral[key] || {};
                      const tasksCriadasG = newTasksGeral.filter(t => t.questionId === key);
                      const filteredUsersG = formG.cargoId ? agencyUsers.filter(u => u.roleId === formG.cargoId) : agencyUsers;
                      return (
                        <div key={key} style={{ padding: '14px 0', borderBottom: '1px solid #f0f2f5' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <span className="ps-question-text">
                                {label}
                                {isFeiraAnswer && <span style={{ fontSize:10, color:'#0080FF', marginLeft:6 }}>por feira</span>}
                                {isExtra && <span style={{ fontSize:10, color:'#FFA726', marginLeft:6 }}>nova</span>}
                              </span>
                              {modoEditarGeral && !isFixed
                                ? <div style={{ marginTop:6 }}>{renderEditInputGeral(key, val)}</div>
                                : (
                                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {geralLines?.map(line => (
                                      <div key={line.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMultiLineGeral ? '4px 8px' : 0, background: isMultiLineGeral ? '#fafafa' : 'none', borderRadius: isMultiLineGeral ? 6 : 0, border: isMultiLineGeral ? '1px solid #f0f2f5' : 'none' }}>
                                        <span className="ps-answer-text">
                                          {line.label && <span style={{ color: '#8a9bb0', marginRight: 6, fontSize: 12, fontWeight: 500 }}>{line.label}:</span>}
                                          {line.value}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              }
                            </div>
                            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                              {modoPlanejarGeral && !isMultiLineGeral && (
                                <button onClick={() => toggleTaskFormGeral(key)} style={{ padding:'4px 10px', borderRadius:6, fontSize:11, border:'1px solid rgba(0,229,196,0.4)', background: formG.open?'rgba(0,229,196,0.1)':'none', color:'#00E5C4', cursor:'pointer', fontFamily:'Outfit, sans-serif', whiteSpace:'nowrap' }}>
                                  {isFeiraAnswer ? `Gerar ${feiras.length}x` : 'Gerar Tarefa'}
                                </button>
                              )}
                              {modoPlanejarGeral && isMultiLineGeral && (
                                <button onClick={() => toggleTaskFormGeral(key)} style={{ padding:'4px 10px', borderRadius:6, fontSize:11, border:'1px solid rgba(0,229,196,0.4)', background: formG.open?'rgba(0,229,196,0.1)':'none', color:'#00E5C4', cursor:'pointer', fontFamily:'Outfit, sans-serif', whiteSpace:'nowrap' }}>
                                  Gerar {geralLines.length}x
                                </button>
                              )}
                              {modoEditarGeral && isExtra && (
                                <button onClick={() => setExtraQuestionsGeral(prev => prev.filter(q => q.id !== key))} style={{ background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:13 }}>✕</button>
                              )}
                            </div>
                          </div>

                          {modoPlanejarGeral && formG.open && (
                            <div style={{ marginTop:10, padding:14, background:'#f8faff', borderRadius:8, border:'1px solid #e0e8ff', display:'flex', flexDirection:'column', gap:10 }}>
                              {isFeiraAnswer && <div style={{ fontSize:11, color:'#0080FF', fontWeight:600 }}>Será criada 1 tarefa para cada feira ({feiras.length} no total)</div>}
                              <input placeholder="Tarefa *" value={formG.tarefa||''} onChange={e=>updateTaskFormGeral(key,'tarefa',e.target.value)} style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }} />
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                <select value={formG.cargoId||''} onChange={e=>updateTaskFormGeral(key,'cargoId',e.target.value)} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                                  <option value="">Cargo...</option>
                                  {agencyRoles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                                <select value={formG.pessoaId||''} onChange={e=>updateTaskFormGeral(key,'pessoaId',e.target.value)} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                                  <option value="">Pessoa *</option>
                                  {filteredUsersG.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                              </div>
                              <input placeholder="Valor estimado (opcional)" value={formG.valor||''} onChange={e=>updateTaskFormGeral(key,'valor',e.target.value)} type="number" min="0" style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }} />
                              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                                <button onClick={()=>toggleTaskFormGeral(key)} style={{ padding:'6px 12px', borderRadius:6, border:'1px solid #ddd', background:'none', color:'#666', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>Cancelar</button>
                                <button onClick={()=>gerarTarefaGeral(key, label, display, isFeiraAnswer)} style={{ padding:'6px 14px', borderRadius:6, border:'none', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'white', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif', fontWeight:600 }}>Criar Tarefa</button>
                              </div>
                            </div>
                          )}

                          {tasksCriadasG.map(t => (
                            <div key={t.taskId} style={{ marginTop:8, display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'rgba(102,126,234,0.06)', borderRadius:6, border:'1px solid rgba(102,126,234,0.2)' }}>
                              <span style={{ fontSize:11, color:'#667eea' }}>✓</span>
                              <span style={{ fontSize:12, flex:1, color:'#2c3e50' }}>{t.name}</span>
                              {t.isFeiraAnswer && <span style={{ fontSize:10, color:'#0080FF' }}>{feiras.length}x</span>}
                              <span style={{ fontSize:11, color:'#7b1fa2' }}>{t.cargoNome}</span>
                              <span style={{ fontSize:11, color:'#1976d2' }}>{t.assignedToName}</span>
                              {t.valor && <span style={{ fontSize:11, color:'#27ae60' }}>R$ {t.valor}</span>}
                              <button onClick={()=>setNewTasksGeral(prev=>prev.filter(x=>x.taskId!==t.taskId))} style={{ background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:13 }}>✕</button>
                            </div>
                          ))}
                        </div>
                      );
                    })}

                    {modoEditarGeral && (
                      <div style={{ marginTop:16 }}>
                        {!showAddPerguntaGeral ? (
                          <button onClick={()=>setShowAddPerguntaGeral(true)} style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px dashed #FFA726', background:'none', color:'#FFA726', fontSize:13, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>+ Adicionar Pergunta</button>
                        ) : (
                          <div style={{ padding:14, background:'#fffbf0', borderRadius:8, border:'1px solid #ffe0a0', display:'flex', flexDirection:'column', gap:10 }}>
                            <select onChange={e=>{ const q=allQuestions.find(q=>q.id===e.target.value); if(q&&!extraQuestionsGeral.find(eq=>eq.id===q.id)) setExtraQuestionsGeral(prev=>[...prev,q]); setShowAddPerguntaGeral(false); }} defaultValue="" style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #ffe0a0', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                              <option value="">Selecione uma pergunta...</option>
                              {allQuestions.filter(q=>!Object.keys(answers).includes(q.id)&&!extraQuestionsGeral.find(eq=>eq.id===q.id)).map(q=><option key={q.id} value={q.id}>{q.text}</option>)}
                            </select>
                            <button onClick={()=>setShowAddPerguntaGeral(false)} style={{ alignSelf:'flex-end', padding:'5px 12px', borderRadius:6, border:'1px solid #ddd', background:'none', color:'#666', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    )}

                    {modoPlanejarGeral && (
                      <div style={{ marginTop:16 }}>
                        {!showNovaTaskGeral ? (
                          <button onClick={()=>setShowNovaTaskGeral(true)} style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px dashed #667eea', background:'none', color:'#667eea', fontSize:13, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>+ Nova Tarefa (sem vínculo)</button>
                        ) : (
                          <div style={{ padding:14, background:'#f8faff', borderRadius:8, border:'1px solid #e0e8ff', display:'flex', flexDirection:'column', gap:10 }}>
                            <span style={{ fontSize:11, fontWeight:600, color:'#667eea' }}>NOVA TAREFA</span>
                            <input placeholder="Tarefa *" value={novaTaskGeral.tarefa} onChange={e=>setNovaTaskGeral(p=>({...p,tarefa:e.target.value}))} style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }} />
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                              <select value={novaTaskGeral.cargoId} onChange={e=>{ const c=agencyRoles.find(r=>r.id===e.target.value); setNovaTaskGeral(p=>({...p,cargoId:e.target.value,cargoNome:c?.name||'',pessoaId:'',pessoaNome:''})); }} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                                <option value="">Cargo...</option>
                                {agencyRoles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                              <select value={novaTaskGeral.pessoaId} onChange={e=>{ const p=agencyUsers.find(u=>u.id===e.target.value); setNovaTaskGeral(prev=>({...prev,pessoaId:e.target.value,pessoaNome:p?.name||''})); }} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                                <option value="">Pessoa *</option>
                                {(novaTaskGeral.cargoId?agencyUsers.filter(u=>u.roleId===novaTaskGeral.cargoId):agencyUsers).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                              </select>
                            </div>
                            <input placeholder="Valor estimado (opcional)" value={novaTaskGeral.valor} onChange={e=>setNovaTaskGeral(p=>({...p,valor:e.target.value}))} type="number" min="0" style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }} />
                            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                              <button onClick={()=>setShowNovaTaskGeral(false)} style={{ padding:'6px 12px', borderRadius:6, border:'1px solid #ddd', background:'none', color:'#666', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>Cancelar</button>
                              <button onClick={gerarNovaTaskGeral} style={{ padding:'6px 14px', borderRadius:6, border:'none', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'white', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif', fontWeight:600 }}>Criar Tarefa</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })() : (
                <div className="ps-empty">Briefing geral não disponível</div>
              )}
            </div>
          )}

          {/* ── TAREFAS ── */}
          {activeTab === 'tasks' && (() => {
            const allTasks = project.tasks || [];
            const filteredTasks = taskFilterUser ? allTasks.filter(t => t.assignedTo === taskFilterUser) : allTasks;

            // Agrupar por requisição
            const grupos = {};
            const semReq = [];
            filteredTasks.forEach(t => {
              if (t.requisicaoCodigo) {
                const key = t.requisicaoCodigo;
                if (!grupos[key]) grupos[key] = { codigo: t.requisicaoCodigo, nome: t.requisicaoNome, tasks: [] };
                grupos[key].tasks.push(t);
              } else {
                semReq.push(t);
              }
            });

            const STATUS_TASK = {
              backlog:     { label: 'Pendente',     color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
              todo:        { label: 'A Fazer',      color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
              in_progress: { label: 'Em Andamento', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
              done:        { label: 'Concluída',    color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
              completed:   { label: 'Concluída',    color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
            };

            const TaskCard = ({ t }) => {
              const st = STATUS_TASK[t.status] || STATUS_TASK.backlog;
              const reqColor = requisitions.find(r => r.codigo === t.requisicaoCodigo)?.cor || '#667eea';
              return (
                <div onClick={() => setSelectedTask(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid #f0f2f5', background: 'white', cursor: 'pointer', transition: 'all 0.15s', marginBottom: 6 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#c7d2fe'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#f0f2f5'}>
                  {t.requisicaoCodigo && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: reqColor + '22', color: reqColor, flexShrink: 0 }}>{t.requisicaoCodigo}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {t.assignedToName && <span>{t.assignedToName}</span>}
                      {t.prazo && <span style={{ marginLeft: 8, color: '#f59e0b' }}>Prazo: {t.prazo}</span>}
                      {t.prioridade === 'urgente' && <span style={{ marginLeft: 8, color: '#ef4444', fontWeight: 600 }}>URGENTE</span>}
                      {t.prioridade === 'alta' && <span style={{ marginLeft: 8, color: '#f97316' }}>Alta</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                  <span style={{ fontSize: 16, color: '#cbd5e1', flexShrink: 0 }}>›</span>
                </div>
              );
            };

            const gruposList = Object.values(grupos).sort((a, b) => a.codigo.localeCompare(b.codigo));

            return (
              <div className="ps-card">
                {/* Header com filtro */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div className="ps-card-title" style={{ margin: 0 }}>Tarefas do Projeto ({filteredTasks.length})</div>
                  <select value={taskFilterUser} onChange={e => setTaskFilterUser(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#475569', fontFamily: 'Outfit, sans-serif', background: 'white' }}>
                    <option value="">Todos os responsáveis</option>
                    {[...new Map(allTasks.filter(t => t.assignedTo).map(t => [t.assignedTo, t])).values()].map(t => (
                      <option key={t.assignedTo} value={t.assignedTo}>{t.assignedToName}</option>
                    ))}
                  </select>
                </div>

                {filteredTasks.length === 0 ? (
                  <div className="ps-empty">Nenhuma tarefa encontrada</div>
                ) : (
                  <>
                    {gruposList.map(g => (
                      <div key={g.codigo} style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                          Requisição {g.codigo} — {g.nome} ({g.tasks.length})
                        </div>
                        {g.tasks.map((t, i) => <TaskCard key={t.taskId || i} t={t} />)}
                      </div>
                    ))}
                    {semReq.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                          Outras tarefas ({semReq.length})
                        </div>
                        {semReq.map((t, i) => <TaskCard key={t.taskId || i} t={t} />)}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── TASK MODAL ── */}
          {selectedTask && (() => {
            const t = selectedTask;
            const [editTask, setEditTask] = React.useState({ ...t });
            const [saving, setSaving] = React.useState(false);
            const reqColor = requisitions.find(r => r.codigo === t.requisicaoCodigo)?.cor || '#667eea';
            const PRIORIDADE_COLOR = { baixa: '#94a3b8', normal: '#64748b', alta: '#f97316', urgente: '#ef4444' };
            const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box' };
            const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

            const handleConcluir = async () => {
              if (!window.confirm('Marcar esta tarefa como concluída?')) return;
              setSaving(true);
              try {
                const updatedTasks = (project.tasks || []).map(tk =>
                  tk.taskId === t.taskId ? { ...tk, ...editTask, status: 'done', completedAt: new Date() } : tk
                );
                await updateDoc(doc(db, 'budgets', projectId), { tasks: updatedTasks, updatedAt: serverTimestamp() });
                setSelectedTask(null);
              } catch (e) { console.error(e); alert('Erro ao salvar.'); }
              finally { setSaving(false); }
            };

            const handleSalvar = async () => {
              setSaving(true);
              try {
                const updatedTasks = (project.tasks || []).map(tk =>
                  tk.taskId === t.taskId ? { ...tk, ...editTask } : tk
                );
                await updateDoc(doc(db, 'budgets', projectId), { tasks: updatedTasks, updatedAt: serverTimestamp() });
                setSelectedTask(null);
              } catch (e) { console.error(e); alert('Erro ao salvar.'); }
              finally { setSaving(false); }
            };

            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                onClick={() => setSelectedTask(null)}>
                <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
                  onClick={e => e.stopPropagation()}>

                  {/* Header */}
                  <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          {t.requisicaoCodigo && <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: reqColor + '22', color: reqColor }}>{t.requisicaoCodigo} — {t.requisicaoNome}</span>}
                          {t.prioridade && t.prioridade !== 'normal' && <span style={{ fontSize: 11, fontWeight: 700, color: PRIORIDADE_COLOR[t.prioridade] }}>{t.prioridade.toUpperCase()}</span>}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{t.name}</div>
                        {t.descricao && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{t.descricao}</div>}
                      </div>
                      <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', flexShrink: 0, marginLeft: 12 }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#64748b' }}>
                      {t.assignedToName && <span>Responsável: <strong>{t.assignedToName}</strong></span>}
                      {t.cargoNome && <span>Cargo: <strong>{t.cargoNome}</strong></span>}
                      {t.prazo && <span>Prazo: <strong style={{ color: '#f59e0b' }}>{t.prazo}</strong></span>}
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>

                    {/* Infos do Planner — readonly */}
                    {(t.periodo || t.quantidade || t.custoUnitario) && (
                      <div style={{ background: '#f8faff', borderRadius: 10, padding: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        {t.periodo && <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>PERÍODO</div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.periodo} dias</div></div>}
                        {t.quantidade && <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>QUANTIDADE</div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.quantidade}</div></div>}
                        {t.custoUnitario && <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>CUSTO UNIT.</div><div style={{ fontSize: 14, fontWeight: 600 }}>R$ {parseFloat(t.custoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>}
                        {t.periodo && t.quantidade && t.custoUnitario && (
                          <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '6px 12px' }}>
                            <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>CUSTO TOTAL</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>R$ {(parseFloat(t.periodo) * parseFloat(t.quantidade) * parseFloat(t.custoUnitario)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fornecedores editáveis */}
                    {(t.fornecedor1 || t.fornecedor2 || t.fornecedor3) && (
                      <div>
                        <label style={{ ...lbl, fontSize: 13 }}>Fornecedores</label>
                        {[1,2,3].map(n => {
                          if (!editTask[`fornecedor${n}`] && !t[`fornecedor${n}`]) return null;
                          const status = editTask[`fornecedor${n}Status`] || '';
                          const statusColor = status === 'recebido' ? '#16a34a' : status === 'aguardando' ? '#d97706' : '#94a3b8';
                          return (
                            <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 160px', gap: 8, marginBottom: 8 }}>
                              <input value={editTask[`fornecedor${n}`] || ''} onChange={e => setEditTask(p => ({ ...p, [`fornecedor${n}`]: e.target.value }))} placeholder={`Fornecedor ${n}`} style={inp} />
                              <input type="number" value={editTask[`fornecedor${n}Valor`] || ''} onChange={e => setEditTask(p => ({ ...p, [`fornecedor${n}Valor`]: e.target.value }))} placeholder="Valor" style={inp} />
                              <select value={status} onChange={e => setEditTask(p => ({ ...p, [`fornecedor${n}Status`]: e.target.value }))}
                                style={{ ...inp, color: statusColor, fontWeight: status ? 600 : 400, border: `1px solid ${statusColor}66` }}>
                                <option value="">Status...</option>
                                <option value="aguardando">Aguardando orçamento</option>
                                <option value="recebido">Orçamento recebido</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Justificativa + Observação editáveis */}
                    {t.justificativa !== undefined && (
                      <div><label style={lbl}>Justificativa</label><input value={editTask.justificativa || ''} onChange={e => setEditTask(p => ({ ...p, justificativa: e.target.value }))} style={inp} /></div>
                    )}
                    {t.observacao !== undefined && (
                      <div><label style={lbl}>Observação</label><input value={editTask.observacao || ''} onChange={e => setEditTask(p => ({ ...p, observacao: e.target.value }))} style={inp} /></div>
                    )}

                    {/* Briefing que gerou a tarefa */}
                    {t.briefingAnswer && (
                      <div style={{ background: '#fffbeb', borderRadius: 8, padding: 12, borderLeft: '3px solid #f59e0b' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>RESPOSTA DO BRIEFING</div>
                        <div style={{ fontSize: 13, color: '#78350f' }}>{t.briefingAnswer}</div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
                    <button onClick={() => setSelectedTask(null)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Fechar</button>
                    <button onClick={handleSalvar} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#f0f3ff', color: '#667eea', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>Salvar Rascunho</button>
                    <button onClick={handleConcluir} disabled={saving || t.status === 'done' || t.status === 'completed'} style={{ flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none', background: t.status === 'done' || t.status === 'completed' ? '#d1fae5' : 'linear-gradient(135deg,#10b981,#059669)', color: t.status === 'done' || t.status === 'completed' ? '#10b981' : 'white', fontSize: 14, cursor: t.status === 'done' || t.status === 'completed' ? 'default' : 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
                      {saving ? 'Salvando...' : t.status === 'done' || t.status === 'completed' ? 'Concluída' : 'Marcar como Concluída'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── HISTÓRICO ── */}
          {activeTab === 'timeline' && (
            <div className="ps-card">
              <div className="ps-card-title">Histórico do Projeto</div>
              {project.timeline && project.timeline.length > 0 ? (
                <div className="ps-timeline">
                  {[...project.timeline].reverse().map((item, i) => (
                    <div key={i} className="ps-tl-item">
                      <div className="ps-tl-dot">•</div>
                      <div className="ps-tl-body">
                        <div className="ps-tl-desc">{item.description}</div>
                        <div className="ps-tl-meta">
                          {item.userName} · {formatDate(item.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ps-empty">Nenhum histórico disponível</div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

const styles = {
  loadingWrap: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#0D1B2A', fontFamily: 'sans-serif',
  },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: '3px solid rgba(0,229,196,0.15)',
    borderTopColor: '#00E5C4',
    animation: 'spin 0.8s linear infinite',
  },
  backBtnAlt: {
    marginTop: 16, padding: '8px 20px', borderRadius: 8,
    background: 'none', border: '1px solid #7BAFD4',
    color: '#7BAFD4', cursor: 'pointer', fontFamily: 'sans-serif',
  },
};
