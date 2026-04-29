import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const STATUS_MAP = {
  analyzing:  { label: 'EM ANÁLISE',   color: '#FFA726', bg: 'rgba(255,167,38,0.15)' },
  approved:   { label: 'APROVADO',     color: '#66BB6A', bg: 'rgba(102,187,106,0.15)' },
  rejected:   { label: 'REJEITADO',    color: '#EF5350', bg: 'rgba(239,83,80,0.15)' },
  inProgress: { label: 'EM ANDAMENTO', color: '#0080FF', bg: 'rgba(0,128,255,0.15)' },
  completed:  { label: 'CONCLUÍDO',    color: '#66BB6A', bg: 'rgba(102,187,106,0.15)' },
};

export default function ProjetoScreen({ projectId, onBack, userData }) {
  const [project, setProject]     = useState(null);
  const [client, setClient]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  // Fornecedor
  const [supplierJob, setSupplierJob]     = useState(null);   // primeiro job (compat)
  const [supplierJobsMine, setSupplierJobsMine] = useState([]); // todos os jobs do fornecedor
  const [confirming, setConfirming]       = useState(false);
  const [supplierJobs, setSupplierJobs]   = useState([]);
  const [gerandoOrcamento, setGerandoOrcamento] = useState(false);
  const [editandoJob, setEditandoJob]           = useState(null);  // id do job sendo editado
  const [editJobForm, setEditJobForm]           = useState({});
  const [trocandoJob, setTrocandoJob]           = useState(null);  // id do job para trocar fornecedor
  const [fornecedoresAlt, setFornecedoresAlt]   = useState([]);    // fornecedores alternativos
  const [salvandoJob, setSalvandoJob]           = useState(false);

  // Tarefas
  const [tasks, setTasks]               = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [showConcluidas, setShowConcluidas]       = useState(false);
  const [showFornConcluidos, setShowFornConcluidos] = useState(false);
  const [todasExpandidas, setTodasExpandidas] = useState(true);
  const [tasksExpandidas, setTasksExpandidas] = useState({});
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTask, setNewTask]     = useState({ name: '', descricao: '', prazo: '', prioridade: 'normal' });
  const [savingTask, setSavingTask] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(doc(db, 'budgets', projectId), async snap => {
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() };
      setProject(data);

      // Busca dados do cliente
      if (data.clientUserId) {
        try {
          const cSnap = await getDoc(doc(db, 'users', data.clientUserId));
          if (cSnap.exists()) setClient({ id: cSnap.id, ...cSnap.data() });
        } catch (e) { console.error(e); }
      }

      // Busca supplierJobs do projeto
      try {
        const sjAllSnap = await getDocs(query(collection(db, 'supplierJobs'), where('budgetId', '==', snap.id)));
        const allJobs = sjAllSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Busca nomes dos fornecedores
        const supplierIds = [...new Set(allJobs.map(j => j.supplierId).filter(Boolean))];
        const supplierNames = {};
        await Promise.all(supplierIds.map(async sid => {
          try {
            const uSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', sid)));
            if (!uSnap.empty) {
              const d = uSnap.docs[0].data();
              supplierNames[sid] = d.companyName || d.name;
            }
          } catch {}
        }));

        const allJobsComNome = allJobs.map(j => ({
          ...j,
          supplierName: supplierNames[j.supplierId] || j.confirmedBy || 'Fornecedor',
        }));

        setSupplierJobs(allJobsComNome);
        // Se for fornecedor, filtra todos os jobs dele
        if (userData?.systemRole === 'fornecedor') {
          const mine = allJobsComNome.filter(j => j.supplierId === userData.id);
          setSupplierJobsMine(mine);
          if (mine.length > 0) setSupplierJob(mine[0]);
        }
      } catch (e) { console.error(e); }

      // Carrega tarefas do budget
      setTasks(data.tasks || []);
      setLoading(false);
    });
    return () => unsub();
  }, [projectId, userData?.id]);

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('budgetId', '==', projectId)),
      snap => setProjectTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [projectId]);

  const handleAddTask = async () => {
    if (!newTask.name.trim()) { alert('Nome da tarefa obrigatório'); return; }
    setSavingTask(true);
    try {
      const task = {
        taskId: `task-${Date.now()}`,
        name: newTask.name.trim(),
        descricao: newTask.descricao.trim(),
        prazo: newTask.prazo,
        prioridade: newTask.prioridade,
        status: 'todo',
        assignedTo: userData?.id,
        assignedToName: userData?.name,
        createdAt: new Date(),
        createdBy: userData?.name,
      };
      const updatedTasks = [...(project.tasks || []), task];
      await updateDoc(doc(db, 'budgets', projectId), {
        tasks: updatedTasks,
        updatedAt: serverTimestamp(),
        timeline: [...(project.timeline || []), {
          action: 'task_added',
          description: `Tarefa "${task.name}" criada por ${userData?.name}`,
          userId: userData?.id,
          userName: userData?.name,
          timestamp: new Date(),
        }],
      });
      setNewTask({ name: '', descricao: '', prazo: '', prioridade: 'normal' });
      setShowTaskForm(false);
    } catch (e) { console.error(e); alert('Erro ao salvar tarefa.'); }
    finally { setSavingTask(false); }
  };

  const handleTaskStatus = async (taskId, newStatus) => {
    const updatedTasks = tasks.map(t => t.taskId === taskId ? { ...t, status: newStatus, updatedAt: new Date() } : t);
    await updateDoc(doc(db, 'budgets', projectId), {
      tasks: updatedTasks,
      updatedAt: serverTimestamp(),
      timeline: [...(project.timeline || []), {
        action: 'task_updated',
        description: `Tarefa atualizada para "${newStatus}" por ${userData?.name}`,
        userId: userData?.id,
        userName: userData?.name,
        timestamp: new Date(),
      }],
    });
  };

  const handleConfirmarItem = async (sjId, serviceName) => {
    setConfirming(true);
    try {
      await updateDoc(doc(db, 'supplierJobs', sjId), {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        confirmedBy: userData?.name,
      });
      // Atualiza timeline
      await updateDoc(doc(db, 'budgets', projectId), {
        timeline: [
          ...(project.timeline || []),
          { action: 'supplier_confirmed', description: `Fornecedor "${userData?.name}" confirmou: ${serviceName}`, userId: userData?.id, userName: userData?.name, timestamp: new Date() }
        ],
        updatedAt: serverTimestamp(),
      });
      setSupplierJobsMine(prev => prev.map(sj => sj.id === sjId ? { ...sj, status: 'confirmed' } : sj));
    } catch (e) { console.error(e); alert('Erro ao confirmar.'); }
    finally { setConfirming(false); }
  };

  const handleRecusarItem = async (sjId, serviceName) => {
    if (!window.confirm(`Recusar "${serviceName}"?`)) return;
    setConfirming(true);
    try {
      await updateDoc(doc(db, 'supplierJobs', sjId), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: userData?.name,
      });
      await updateDoc(doc(db, 'budgets', projectId), {
        timeline: [
          ...(project.timeline || []),
          { action: 'supplier_rejected', description: `Fornecedor "${userData?.name}" recusou: ${serviceName}`, userId: userData?.id, userName: userData?.name, timestamp: new Date() }
        ],
        updatedAt: serverTimestamp(),
      });
      setSupplierJobsMine(prev => prev.map(sj => sj.id === sjId ? { ...sj, status: 'rejected' } : sj));
    } catch (e) { console.error(e); alert('Erro ao recusar.'); }
    finally { setConfirming(false); }
  };

  // Disparo automático quando todos os supplierJobs forem respondidos
  useEffect(() => {
    if (!project || !supplierJobs.length) return;
    if (project.status !== 'analyzing') return;
    const todosRespondidos = supplierJobs.every(j => j.status === 'confirmed' || j.status === 'rejected');
    const algumConfirmado  = supplierJobs.some(j => j.status === 'confirmed');
    if (todosRespondidos && algumConfirmado) {
      handleGerarOrcamento();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierJobs]);

  const handleGerarOrcamento = async () => {
    setGerandoOrcamento(true);
    try {
      // Busca preços dos supplierServices confirmados
      const confirmed = supplierJobs.filter(j => j.status === 'confirmed');
      let totalOrcamento = 0;
      const itensOrcamento = [];
      const diasEvento = project.briefingData?.evento?.diasDuracao || 1;

      for (const sj of confirmed) {
        for (const serviceName of (sj.serviceNames || [])) {
          const svSnap = await getDocs(query(
            collection(db, 'supplierServices'),
            where('supplierId', '==', sj.supplierId),
            where('serviceName', '==', serviceName)
          ));
          if (!svSnap.empty) {
            const sv = { id: svSnap.docs[0].id, ...svSnap.docs[0].data() };
            const preco = parseFloat(sv.preco || 0);
            const subtotal = preco * diasEvento;
            totalOrcamento += subtotal;
            itensOrcamento.push({
              supplierName: sj.confirmedBy || sj.supplierId,
              serviceName,
              preco,
              diasEvento,
              subtotal,
              unidade: sv.unidade || 'por dia',
            });
          }
        }
      }

      await updateDoc(doc(db, 'budgets', projectId), {
        status: 'pendingApproval',
        workspaceStage: 'Aguardando',
        orcamentoFinal: { total: totalOrcamento, itens: itensOrcamento, geradoEm: new Date() },
        timeline: [...(project.timeline || []), {
          action: 'orcamento_gerado',
          description: `Orçamento final gerado — R$ ${totalOrcamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — enviado para aprovação do cliente`,
          userId: userData?.id, userName: userData?.name, timestamp: new Date(),
        }],
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); alert('Erro ao gerar orçamento.'); }
    finally { setGerandoOrcamento(false); }
  };

  const handleEditarJob = (sj) => {
    setEditandoJob(sj.id);
    setEditJobForm({
      preco:        sj.preco || '',
      diasPreparo:  sj.diasPreparo || '',
      diasMontagem: sj.diasMontagem || '',
      observacao:   sj.observacaoFornecedor || '',
    });
    setTrocandoJob(null);
  };

  const handleSalvarJob = async (sjId) => {
    setSalvandoJob(true);
    try {
      await updateDoc(doc(db, 'supplierJobs', sjId), {
        preco:                parseFloat(editJobForm.preco) || 0,
        diasPreparo:          parseInt(editJobForm.diasPreparo) || 0,
        diasMontagem:         parseInt(editJobForm.diasMontagem) || 0,
        observacaoFornecedor: editJobForm.observacao,
        updatedAt:            serverTimestamp(),
      });
      setEditandoJob(null);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSalvandoJob(false); }
  };

  const handleTrocarFornecedor = async (sj) => {
    setTrocandoJob(sj.id);
    setEditandoJob(null);
    try {
      // Busca fornecedores que têm esse serviço
      const nome = sj.serviceName || (sj.serviceNames || [])[0] || '';
      const svSnap = await getDocs(query(
        collection(db, 'supplierServices'),
        where('serviceName', '==', nome),
        where('ativo', '!=', false)
      ));
      const alts = svSnap.docs
        .map(d => ({ ...d.data(), svId: d.id }))
        .filter(s => s.supplierId !== sj.supplierId);
      // Busca nomes dos fornecedores
      const comNomes = await Promise.all(alts.map(async s => {
        try {
          const uSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', s.supplierId)));
          const nome = uSnap.docs[0]?.data()?.name || s.supplierId;
          return { ...s, supplierName: nome };
        } catch { return { ...s, supplierName: s.supplierId }; }
      }));
      setFornecedoresAlt(comNomes);
    } catch (e) { console.error(e); setFornecedoresAlt([]); }
  };

  const handleConfirmarTroca = async (sj, novoFornecedor) => {
    setSalvandoJob(true);
    try {
      // Cancela o job atual
      await updateDoc(doc(db, 'supplierJobs', sj.id), { status: 'cancelled', updatedAt: serverTimestamp() });
      // Cria novo job para o novo fornecedor
      await addDoc(collection(db, 'supplierJobs'), {
        supplierId:        novoFornecedor.supplierId,
        budgetId:          sj.budgetId,
        eventName:         sj.eventName,
        clientName:        sj.clientName,
        eventDate:         sj.eventDate,
        serviceNames:      sj.serviceNames,
        serviceName:       sj.serviceName,
        serviceParentName: sj.serviceParentName,
        tipoServico:       sj.tipoServico,
        preco:             novoFornecedor.preco || sj.preco,
        unidade:           novoFornecedor.unidade || sj.unidade,
        diasPreparo:       novoFornecedor.diasPreparo || sj.diasPreparo,
        diasMontagem:      novoFornecedor.diasMontagem || sj.diasMontagem,
        stage:             'proposta',
        status:            'pending',
        createdAt:         serverTimestamp(),
      });
      setTrocandoJob(null);
      setFornecedoresAlt([]);
    } catch (e) { console.error(e); alert('Erro ao trocar fornecedor.'); }
    finally { setSalvandoJob(false); }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDateShort = (str) => {
    if (!str) return '—';
    if (str.includes('-')) {
      const [y, m, d] = str.split('-');
      return `${d}/${m}/${y}`;
    }
    return str;
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ color: '#7BAFD4', fontSize: 14 }}>Carregando projeto...</div>
    </div>
  );

  if (!project) return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#7BAFD4' }}>Projeto não encontrado.</p>
        <button onClick={onBack} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: 'none', border: '1px solid #7BAFD4', color: '#7BAFD4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Voltar</button>
      </div>
    </div>
  );

  const ev      = project.briefingData?.evento || {};
  const est     = project.briefingData?.estrutura || {};
  const equipe  = project.briefingData?.equipe || {};
  const servicos = project.briefingData?.servicosNecessarios || [];
  const statusInfo = STATUS_MAP[project.status] || STATUS_MAP.analyzing;

  const isFornecedor = userData?.systemRole === 'fornecedor';
  const cronograma   = project.cronograma?.etapas || [];
  const tabs = isFornecedor ? [
    { id: 'info',       label: 'Visão Geral' },
    { id: 'cronograma', label: 'Cronograma' },
    { id: 'tasks',      label: 'Minha Tarefa' },
  ] : [
    { id: 'info',       label: 'Visão Geral' },
    { id: 'briefing',   label: 'Briefing' },
    { id: 'cronograma', label: `Cronograma${cronograma.length ? ` (${cronograma.length})` : ''}` },
    { id: 'tasks',      label: `Tarefas${tasks.length ? ` (${tasks.length})` : ''}` },
    { id: 'timeline',   label: 'Histórico' },
  ];

  const inp = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f2f5; }
        .ps-wrap { min-height: 100vh; background: #f0f2f5; font-family: 'Outfit', sans-serif; color: #1a2e40; }
        .ps-topbar { background: #0D1B2A; padding: 0 36px; display: flex; align-items: center; justify-content: space-between; height: 60px; border-bottom: 1px solid rgba(0,180,255,0.1); position: sticky; top: 0; z-index: 10; }
        .ps-back { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #7BAFD4; font-size: 13px; background: none; border: none; font-family: 'Outfit', sans-serif; transition: color 0.15s; }
        .ps-back:hover { color: #00E5C4; }
        .ps-hero { background: #0D1B2A; padding: 28px 36px 0; border-bottom: 1px solid rgba(0,180,255,0.08); }
        .ps-hero-title { font-size: 26px; font-weight: 300; color: #E8F4FF; margin-bottom: 6px; }
        .ps-hero-meta { display: flex; gap: 20px; font-size: 13px; color: #7BAFD4; margin-bottom: 16px; flex-wrap: wrap; }
        .ps-tabs { display: flex; gap: 4px; }
        .ps-tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 300; color: rgba(123,175,212,0.6); border-bottom: 2px solid transparent; transition: all 0.15s; }
        .ps-tab:hover { color: #7BAFD4; }
        .ps-tab.active { color: #00E5C4; border-bottom-color: #00E5C4; font-weight: 400; }
        .ps-body { padding: 28px 36px; max-width: 900px; }
        .ps-card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #e8eaed; }
        .ps-card-title { font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #00E5C4; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f0f2f5; }
        .ps-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ps-info-item { display: flex; flex-direction: column; gap: 3px; }
        .ps-info-item.full { grid-column: 1 / -1; }
        .ps-info-label { font-size: 11px; color: #8a9bb0; letter-spacing: 0.5px; text-transform: uppercase; }
        .ps-info-value { font-size: 14px; color: #1a2e40; font-weight: 400; }
        .ps-bool { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; }
        .ps-bool-yes { color: #10b981; }
        .ps-bool-no { color: #94a3b8; }
        .ps-tag { display: inline-block; padding: 3px 10px; borderRadius: 20px; font-size: 11px; font-weight: 600; background: rgba(0,229,196,0.1); color: #00E5C4; margin: 3px; border-radius: 20px; }
        .ps-task-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 8px; border: 1px solid #f0f2f5; margin-bottom: 8px; transition: all 0.15s; }
        .ps-task-item:hover { border-color: #c7d2fe; }
        .ps-tl-item { display: flex; gap: 16px; padding: 14px 0; position: relative; }
        .ps-tl-item:not(:last-child)::after { content: ''; position: absolute; left: 15px; top: 42px; bottom: 0; width: 1px; background: #e8eaed; }
        .ps-tl-dot { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; background: rgba(0,229,196,0.1); border: 2px solid rgba(0,229,196,0.3); display: flex; align-items: center; justify-content: center; font-size: 10px; color: #00E5C4; z-index: 1; }
        @media (max-width: 600px) { .ps-topbar { padding: 0 16px; } .ps-hero { padding: 20px 16px 0; } .ps-body { padding: 16px; } .ps-info-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="ps-wrap">

        {/* TOPBAR */}
        <div className="ps-topbar">
          <button className="ps-back" onClick={onBack}>← Voltar</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 400, color: '#E8F4FF' }}>{project.eventName || 'Projeto'}</span>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, letterSpacing: 1, background: statusInfo.bg, color: statusInfo.color }}>
              {statusInfo.label}
            </span>
          </div>
          <div style={{ width: 80 }} />
        </div>

        {/* HERO */}
        <div className="ps-hero">
          <h1 className="ps-hero-title">{project.eventName || project.eventTypeName || 'Projeto'}</h1>
          <div className="ps-hero-meta">
            <span>{project.eventTypeName || '—'}</span>
            {ev.local && <span>{ev.local}</span>}
            {project.startDate && <span>{formatDateShort(project.startDate)}{project.endDate && project.endDate !== project.startDate ? ` até ${formatDateShort(project.endDate)}` : ''}</span>}
            <span>Criado em {formatDate(project.createdAt)}</span>
          </div>
          <div className="ps-tabs">
            {tabs.map(t => (
              <button key={t.id} className={`ps-tab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* BODY */}
        <div className="ps-body">

          {/* ── VISÃO GERAL ── */}
          {activeTab === 'info' && (
            <>
              {/* Cliente */}
              <div className="ps-card">
                <div className="ps-card-title">Cliente</div>
                <div className="ps-info-grid">
                  <div className="ps-info-item">
                    <span className="ps-info-label">Nome</span>
                    <span className="ps-info-value">{client?.name || project.clientName || '—'}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Empresa</span>
                    <span className="ps-info-value">{client?.companyName || '—'}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Email</span>
                    <span className="ps-info-value">{client?.email || '—'}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Telefone</span>
                    <span className="ps-info-value">{client?.phone || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Evento */}
              <div className="ps-card">
                <div className="ps-card-title">Evento</div>
                <div className="ps-info-grid">
                  <div className="ps-info-item">
                    <span className="ps-info-label">Tipo</span>
                    <span className="ps-info-value">{ev.tipo || project.eventTypeName || '—'}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Nome</span>
                    <span className="ps-info-value">{ev.nome || project.eventName || '—'}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Data início</span>
                    <span className="ps-info-value">{formatDateShort(ev.dataInicio || project.startDate)}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Data fim</span>
                    <span className="ps-info-value">{formatDateShort(ev.dataFim || project.endDate)}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Duração</span>
                    <span className="ps-info-value">{ev.diasDuracao ? `${ev.diasDuracao} dia(s)` : '—'}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Visitantes/dia</span>
                    <span className="ps-info-value">{ev.visitantesPorDia || project.guestCount || '—'}</span>
                  </div>
                  <div className="ps-info-item full">
                    <span className="ps-info-label">Local</span>
                    <span className="ps-info-value">{ev.local || ev.cidade || project.location || '—'}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Coordenador</span>
                    <span className="ps-info-value">{project.assignedToName || '—'}</span>
                  </div>
                  <div className="ps-info-item">
                    <span className="ps-info-label">Atribuído em</span>
                    <span className="ps-info-value">{formatDate(project.assignedAt)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── CRONOGRAMA GANTT ── */}
          {activeTab === 'cronograma' && (() => {
            if (cronograma.length === 0) return (
              <div className="ps-card" style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
                Cronograma ainda não gerado
              </div>
            );

            const TIPO_COR = { administrativo: '#7BAFD4', estrutura: '#0080FF', operacao: '#00E5C4', entretenimento: '#FFA726', gastronomia: '#66BB6A' };
            const hoje = new Date(); hoje.setHours(0,0,0,0);
            const toDate = s => { if (!s) return null; const [y,m,d] = s.split('-'); return new Date(y, m-1, d); };
            const fmtShort = s => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}`; };

            // Ordena por dataInicio
            const etapasOrdenadas = [...cronograma].sort((a,b) => {
              const da = toDate(a.dataInicio || a.di);
              const db2 = toDate(b.dataInicio || b.di);
              return (da||0) - (db2||0);
            });

            // Range de datas para o Gantt
            const datas = etapasOrdenadas.flatMap(e => [
              toDate(e.dataInicio || e.di),
              toDate(e.dataEntrega || e.de),
            ]).filter(Boolean);
            const minDate = datas.length ? new Date(Math.min(...datas)) : hoje;
            const maxDate = datas.length ? new Date(Math.max(...datas)) : hoje;
            minDate.setDate(minDate.getDate() - 3);
            maxDate.setDate(maxDate.getDate() + 5);
            const totalDias = Math.max(1, Math.round((maxDate - minDate) / 86400000));

            const posLeft = d => d ? Math.max(0, Math.round((d - minDate) / 86400000) / totalDias * 100) : 0;
            const posWidth = (di, de) => {
              if (!di || !de) return 2;
              const w = Math.max(0.5, Math.round((de - di) / 86400000) / totalDias * 100);
              return Math.min(w, 100 - posLeft(di));
            };
            const hojePos = posLeft(hoje);

            // Fornecedores por responsável
            const fornecedorNome = {};
            supplierJobs.forEach(sj => {
              if (sj.supplierName) fornecedorNome[sj.serviceName] = sj.supplierName;
            });

            // Gera marcadores de datas (a cada 7 dias)
            const marcadores = [];
            const cur = new Date(minDate);
            while (cur <= maxDate) {
              marcadores.push(new Date(cur));
              cur.setDate(cur.getDate() + 7);
            }

            const ROW_H = 44;
            const LABEL_W = 180;

            return (
              <div className="ps-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="ps-card-title" style={{ margin: 0 }}>Cronograma de Produção</div>
                  {/* Legenda */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {Object.entries(TIPO_COR).map(([tipo, cor]) => (
                      <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />
                        <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>{tipo}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 2, height: 10, background: '#ef4444' }} />
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>Hoje</span>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', padding: '0 0 16px' }}>
                  <div style={{ minWidth: 700 }}>
                    {/* Header de datas */}
                    <div style={{ display: 'flex', marginLeft: LABEL_W, borderBottom: '1px solid #f0f2f5', position: 'relative', height: 28 }}>
                      {marcadores.map((d, i) => (
                        <div key={i} style={{ position: 'absolute', left: `${posLeft(d)}%`, fontSize: 9, color: '#94a3b8', paddingTop: 6, borderLeft: '1px solid #f0f2f5', paddingLeft: 3, whiteSpace: 'nowrap' }}>
                          {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </div>
                      ))}
                    </div>

                    {/* Linhas do Gantt */}
                    {etapasOrdenadas.map((etapa, i) => {
                      const cor     = TIPO_COR[etapa.tipo] || '#7BAFD4';
                      const di      = toDate(etapa.dataInicio || etapa.di);
                      const de      = toDate(etapa.dataEntrega || etapa.de);
                      const atrasado = de && de < hoje && etapa.status !== 'concluido';
                      const barCor  = atrasado ? '#ef4444' : etapa.status === 'concluido' ? '#94a3b8' : cor;
                      const left    = posLeft(di);
                      const width   = posWidth(di, de);
                      const isMine  = isFornecedor && supplierJobsMine.some(sj =>
                        etapa.responsavel?.toLowerCase().includes((sj.serviceName||'').toLowerCase())
                      );
                      const fornNome = fornecedorNome[etapa.responsavel] || etapa.responsavel;

                      return (
                        <div key={etapa.id || i} style={{ display: 'flex', alignItems: 'center', height: ROW_H, borderBottom: '1px solid #f8faff', background: i % 2 === 0 ? 'white' : '#fafbff' }}>
                          {/* Label */}
                          <div style={{ width: LABEL_W, flexShrink: 0, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: isMine ? 700 : 500, color: isMine ? cor : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {isMine && '★ '}{etapa.nome}
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {fornNome !== etapa.responsavel ? fornNome : etapa.responsavel}
                            </div>
                          </div>

                          {/* Área do Gantt */}
                          <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                            {/* Linha de hoje */}
                            {hojePos >= 0 && hojePos <= 100 && (
                              <div style={{ position: 'absolute', left: `${hojePos}%`, top: 0, bottom: 0, width: 2, background: '#ef444455', zIndex: 2 }} />
                            )}
                            {/* Barra */}
                            {di && de && (
                              <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: '50%', transform: 'translateY(-50%)', height: 20, borderRadius: 4, background: `${barCor}cc`, border: `1px solid ${barCor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 1, minWidth: 4 }}
                                title={`${etapa.nome}: ${fmtShort(etapa.dataInicio||etapa.di)} → ${fmtShort(etapa.dataEntrega||etapa.de)}`}>
                                {width > 8 && <span style={{ fontSize: 9, color: 'white', fontWeight: 600, whiteSpace: 'nowrap', paddingLeft: 4 }}>{fmtShort(etapa.dataEntrega||etapa.de)}</span>}
                              </div>
                            )}
                            {/* Badge status */}
                            {atrasado && (
                              <div style={{ position: 'absolute', left: `${left + width + 0.5}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap' }}>⚠ atrasado</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Lista detalhada abaixo do Gantt */}
                <div style={{ padding: '0 24px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 10px' }}>Detalhes</div>
                  {etapasOrdenadas.map((etapa, i) => {
                    const cor = TIPO_COR[etapa.tipo] || '#7BAFD4';
                    const di  = toDate(etapa.dataInicio || etapa.di);
                    const de  = toDate(etapa.dataEntrega || etapa.de);
                    const atrasado = de && de < hoje && etapa.status !== 'concluido';
                    const sj  = supplierJobs.find(j => etapa.responsavel?.toLowerCase().includes((j.serviceName||'').toLowerCase()));
                    return (
                      <div key={etapa.id || i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f8faff', alignItems: 'flex-start' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: atrasado ? '#ef4444' : cor, flexShrink: 0, marginTop: 5 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{etapa.nome}</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                              {atrasado && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚠ Atrasado</span>}
                              {etapa.dataInicio && <span style={{ fontSize: 11, color: '#64748b' }}>{fmtShort(etapa.dataInicio||etapa.di)} → {fmtShort(etapa.dataEntrega||etapa.de)}</span>}
                              {etapa.diasAntes > 0 && <span style={{ fontSize: 10, color: '#94a3b8' }}>{etapa.diasAntes}d antes</span>}
                            </div>
                          </div>
                          {etapa.descricao && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{etapa.descricao}</div>}
                          <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, color: cor, fontWeight: 600, textTransform: 'capitalize' }}>{etapa.tipo}</span>
                            {sj?.supplierName && <span style={{ fontSize: 10, color: '#667eea' }}>{sj.supplierName}</span>}
                            {etapa.responsavel && !sj?.supplierName && <span style={{ fontSize: 10, color: '#94a3b8' }}>{etapa.responsavel}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── BRIEFING ── */}
          {activeTab === 'briefing' && (
            <>
              {/* Estrutura */}
              <div className="ps-card">
                <div className="ps-card-title">Estrutura</div>
                <div className="ps-info-grid">
                  {est.areaM2 > 0 && (
                    <div className="ps-info-item">
                      <span className="ps-info-label">Área</span>
                      <span className="ps-info-value">{est.areaM2} m²</span>
                    </div>
                  )}
                  {[
                    ['Montagem', est.montagem],
                    ['Iluminação', est.iluminacao],
                    ['Som', est.som],
                    ['Telão', est.telao],
                    ['Mobiliário', est.mobiliario],
                  ].map(([label, val]) => (
                    <div key={label} className="ps-info-item">
                      <span className="ps-info-label">{label}</span>
                      <span className={`ps-bool ${val ? 'ps-bool-yes' : 'ps-bool-no'}`}>
                        {val ? '✓ Sim' : '✗ Não'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equipe */}
              <div className="ps-card">
                <div className="ps-card-title">Equipe Operacional</div>
                <div className="ps-info-grid">
                  {Object.entries(equipe).map(([key, val]) => {
                    if (!val || typeof val !== 'object') return null;
                    const qtd = val.quantidade || 0;
                    const hrs = val.horasPorDia || 0;
                    if (qtd === 0) return null;
                    return (
                      <div key={key} className="ps-info-item">
                        <span className="ps-info-label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                        <span className="ps-info-value">{qtd} pessoa(s) × {hrs}h/dia</span>
                      </div>
                    );
                  })}
                  {Object.values(equipe).every(v => !v?.quantidade) && (
                    <div className="ps-info-item full">
                      <span className="ps-info-value" style={{ color: '#94a3b8' }}>Nenhuma equipe especificada</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Serviços necessários */}
              {servicos.length > 0 && (
                <div className="ps-card">
                  <div className="ps-card-title">Serviços Identificados pela IA</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {servicos.map((s, i) => (
                      <span key={i} className="ps-tag">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── MINHA TAREFA (fornecedor) ── */}
          {activeTab === 'tasks' && isFornecedor && (() => {
            const myTasks          = projectTasks.filter(t => t.supplierId === userData?.id);
            const myPendentes      = myTasks.filter(t => t.status !== 'concluido');
            const myConcluidas     = myTasks.filter(t => t.status === 'concluido');
            const TIPO_COR         = { estrutura: '#0080FF', operacao: '#00E5C4', entretenimento: '#FFA726', gastronomia: '#66BB6A', administrativo: '#7BAFD4' };
            const hoje2            = new Date(); hoje2.setHours(0,0,0,0);
            const isExp = id => tasksExpandidas[id] !== undefined ? tasksExpandidas[id] : todasExpandidas;
            const toggle = id => setTasksExpandidas(p => ({ ...p, [id]: !isExp(id) }));

            const renderTaskForn = (task) => {
              const cor      = TIPO_COR[task.tipoServico] || '#7BAFD4';
              const deDate   = task.dataEntrega ? new Date(task.dataEntrega) : null;
              const atrasada = deDate && deDate < hoje2 && task.status !== 'concluido';
              const expanded = isExp(task.id);
              return (
                <div key={task.id} style={{ borderRadius: 12, border: `1px solid ${atrasada ? 'rgba(239,68,68,0.2)' : '#e2e8f0'}`, background: atrasada ? 'rgba(239,68,68,0.02)' : 'white', overflow: 'hidden', marginBottom: 10 }}>
                  {/* Header clicável */}
                  <div onClick={() => toggle(task.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: expanded ? '1px solid #f8faff' : 'none' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>▶</span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: atrasada ? '#ef4444' : cor, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.nome || task.serviceName}</span>
                      {task.serviceParentName && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{task.serviceParentName}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      {atrasada && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚠ Atrasada</span>}
                      {task.dataEntrega && !expanded && <span style={{ fontSize: 11, color: '#94a3b8' }}>{task.dataEntrega.split('-').reverse().join('/')}</span>}
                      {task.valor > 0 && !expanded && <span style={{ fontSize: 12, fontWeight: 700, color: '#00E5C4' }}>R$ {task.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                    </div>
                  </div>
                  {/* Detalhes */}
                  {expanded && (
                    <>
                      <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                        {task.valor > 0 && <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,229,196,0.15)' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Seu valor</div><div style={{ fontSize: 15, fontWeight: 700, color: '#00E5C4' }}>R$ {task.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>R$ {task.preco?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × {task.diasEvento}d</div></div>}
                        {task.dataInicio && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Início</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.dataInicio.split('-').reverse().join('/')}</div></div>}
                        {task.dataEntrega && <div style={{ background: atrasada ? 'rgba(239,68,68,0.06)' : '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Entrega</div><div style={{ fontSize: 13, fontWeight: 600, color: atrasada ? '#ef4444' : '#1e293b' }}>{task.dataEntrega.split('-').reverse().join('/')}</div></div>}
                        {task.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Preparo</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.diasPreparo} dias</div></div>}
                        {task.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Montagem</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.diasMontagem} dias</div></div>}
                        {task.diasEvento > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Duração</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.diasEvento} dia(s)</div></div>}
                        {task.observacao && <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 12px', gridColumn: '1/-1' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Observação</div><div style={{ fontSize: 12, color: '#475569' }}>{task.observacao}</div></div>}
                      </div>
                      <div style={{ padding: '0 16px 14px' }}>
                        <textarea defaultValue={task.observacaoFornecedor || ''}
                          onBlur={async e => { if (e.target.value !== (task.observacaoFornecedor || '')) await updateDoc(doc(db, 'tasks', task.id), { observacaoFornecedor: e.target.value, updatedAt: serverTimestamp() }); }}
                          placeholder="Suas observações sobre esta tarefa..."
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 50, boxSizing: 'border-box', outline: 'none', color: '#475569' }} />
                      </div>
                    </>
                  )}
                </div>
              );
            };

            return (
              <div className="ps-card">
                <div className="ps-card-title">Minha Tarefa</div>

                {myTasks.length > 0 ? (
                  <>
                    {/* Header com controle global */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                        Tarefas ({myConcluidas.length}/{myTasks.length} concluídas)
                      </div>
                      <button onClick={() => { setTodasExpandidas(s => !s); setTasksExpandidas({}); }}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {todasExpandidas ? '⊟ Recolher todas' : '⊞ Expandir todas'}
                      </button>
                    </div>
                    {/* Pendentes */}
                    {myPendentes.map(renderTaskForn)}
                    {/* Concluídas */}
                    {myConcluidas.length > 0 && (
                      <>
                        <button onClick={() => setShowConcluidas(s => !s)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 }}>
                          <span style={{ transform: showConcluidas ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                          Concluídas ({myConcluidas.length})
                        </button>
                        {showConcluidas && myConcluidas.map(renderTaskForn)}
                      </>
                    )}
                  </>
                ) : (
                  /* Sem tasks formais — mostra jobs pendentes de confirmação */
                  supplierJobsMine.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Nenhuma tarefa encontrada</div>
                  ) : null
                )}

                {/* Jobs pendentes de confirmação (pré-aprovação) */}
                {supplierJobsMine.length > 0 && (
                  <div style={{ marginTop: myTasks.length > 0 ? 20 : 0 }}>
                    {myTasks.length > 0 && <div style={{ height: 1, background: '#f0f2f5', marginBottom: 16 }} />}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                      Aguardando confirmação
                    </div>
                    {supplierJobsMine.map(sj => {
                      const nome = sj.serviceName || (sj.serviceNames || [])[0];
                      const isPending   = sj.status === 'pending' || !sj.status;
                      const isConfirmed = sj.status === 'confirmed';
                      const isRejected  = sj.status === 'rejected';
                      const diasEvento  = project.briefingData?.evento?.diasDuracao || 1;
                      const valorTotal  = sj.preco ? parseFloat(sj.preco) * diasEvento : null;
                      return (
                        <div key={sj.id} style={{ borderRadius: 12, border: `1px solid ${isConfirmed ? 'rgba(16,185,129,0.2)' : isRejected ? 'rgba(239,68,68,0.2)' : '#e2e8f0'}`, background: isConfirmed ? 'rgba(16,185,129,0.02)' : isRejected ? 'rgba(239,68,68,0.02)' : 'white', overflow: 'hidden', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid #f8faff' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConfirmed ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{nome}</div>
                              {sj.serviceParentName && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{sj.serviceParentName}</div>}
                            </div>
                            {isConfirmed && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>✓ Confirmado</span>}
                            {isRejected && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>✗ Recusado</span>}
                          </div>
                          <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                            {valorTotal && <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,229,196,0.15)' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Seu valor</div><div style={{ fontSize: 15, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>}
                            {sj.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Preparo</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasPreparo} dias</div></div>}
                            {sj.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Montagem</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasMontagem} dias</div></div>}
                            <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Duração</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{diasEvento} dia(s)</div></div>
                          </div>
                          <div style={{ padding: '0 16px 14px' }}>
                            <textarea defaultValue={sj.observacaoFornecedor || ''}
                              onBlur={async e => { if (e.target.value !== (sj.observacaoFornecedor || '')) await updateDoc(doc(db, 'supplierJobs', sj.id), { observacaoFornecedor: e.target.value, updatedAt: serverTimestamp() }); }}
                              placeholder="Observações (especificações técnicas...)"
                              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 50, boxSizing: 'border-box', outline: 'none', color: '#475569' }} />
                          </div>
                          {isPending && (
                            <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', justifyContent: 'flex-end' }}>
                              <button onClick={() => handleRecusarItem(sj.id, nome)} disabled={confirming} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Recusar</button>
                              <button onClick={() => handleConfirmarItem(sj.id, nome)} disabled={confirming} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Confirmar</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {supplierJobsMine.every(sj => sj.status === 'confirmed' || sj.status === 'rejected') && (
                      <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)', padding: 16, textAlign: 'center', marginTop: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#10b981' }}>✓ Todas as tarefas respondidas!</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── TAREFAS ── */}          {/* ── TAREFAS ── */}
          {activeTab === 'tasks' && !isFornecedor && (() => {
            const todosConfirmados = supplierJobs.length > 0 && supplierJobs.every(j => j.status === 'confirmed');
            return (
            <div className="ps-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="ps-card-title" style={{ margin: 0 }}>Fornecedores e Tarefas</div>
                <button onClick={() => setShowTaskForm(s => !s)}
                  style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  + Nova Tarefa
                </button>
              </div>

              {/* Tasks formais da collection (pós-aprovação) */}
              {projectTasks.length > 0 && (() => {
                const TIPO_COR = { estrutura: '#0080FF', operacao: '#00E5C4', entretenimento: '#FFA726', gastronomia: '#66BB6A', administrativo: '#7BAFD4' };
                const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
                const tasksPendentes  = projectTasks.filter(t => t.status !== 'concluido');
                const tasksConcluidas = projectTasks.filter(t => t.status === 'concluido');

                const isExpanded = (id) => tasksExpandidas[id] !== undefined ? tasksExpandidas[id] : todasExpandidas;
                const toggleTask = (id) => setTasksExpandidas(prev => ({ ...prev, [id]: !isExpanded(id) }));

                const renderTaskCoord = (task, isConcluida = false) => {
                  const cor = TIPO_COR[task.tipoServico] || '#7BAFD4';
                  const deDate = task.dataEntrega ? new Date(task.dataEntrega) : null;
                  const atrasada = deDate && deDate < hoje2 && task.status !== 'concluido';
                  const diasEvento = project.briefingData?.evento?.diasDuracao || 1;
                  const valorTotal = task.valor || (task.preco ? parseFloat(task.preco) * diasEvento : 0);
                  const expanded = isExpanded(task.id);
                  return (
                    <div key={task.id} style={{ borderRadius: 10, border: `1px solid ${atrasada ? 'rgba(239,68,68,0.2)' : '#e2e8f0'}`, marginBottom: 8, overflow: 'hidden', background: atrasada ? 'rgba(239,68,68,0.02)' : 'white' }}>
                      {/* Header clicável */}
                      <div onClick={() => toggleTask(task.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: expanded ? '1px solid #f8faff' : 'none' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block', flexShrink: 0 }}>▶</span>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: atrasada ? '#ef4444' : cor, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.nome || task.serviceName}</span>
                          {task.supplierName && <span style={{ fontSize: 11, color: '#667eea', marginLeft: 8 }}>{task.supplierName}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          {atrasada && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚠ Atrasada</span>}
                          {task.dataEntrega && !expanded && <span style={{ fontSize: 11, color: '#94a3b8' }}>{task.dataEntrega.split('-').reverse().join('/')}</span>}
                          <select value={task.status || 'pendente'} onChange={async e => {
                            await updateDoc(doc(db, 'tasks', task.id), { status: e.target.value, updatedAt: serverTimestamp() });
                          }} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', background: 'white' }}>
                            <option value="pendente">Pendente</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="concluido">Concluído</option>
                          </select>
                        </div>
                      </div>
                      {/* Detalhes expansíveis */}
                      {expanded && (
                        <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                          {valorTotal > 0 && (
                            <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '7px 10px', border: '1px solid rgba(0,229,196,0.15)' }}>
                              <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Valor</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            </div>
                          )}
                          {task.dataInicio && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Início</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{task.dataInicio.split('-').reverse().join('/')}</div></div>}
                          {task.dataEntrega && <div style={{ background: atrasada ? 'rgba(239,68,68,0.06)' : '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Entrega</div><div style={{ fontSize: 12, fontWeight: 600, color: atrasada ? '#ef4444' : '#1e293b' }}>{task.dataEntrega.split('-').reverse().join('/')}</div></div>}
                          {task.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Preparo</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{task.diasPreparo}d</div></div>}
                          {task.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Montagem</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{task.diasMontagem}d</div></div>}
                          {task.observacao && <div style={{ background: '#fffbeb', borderRadius: 8, padding: '7px 10px', gridColumn: '1/-1' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Obs.</div><div style={{ fontSize: 11, color: '#475569' }}>{task.observacao}</div></div>}
                          {task.observacaoFornecedor && <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '7px 10px', gridColumn: '1/-1' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Obs. fornecedor</div><div style={{ fontSize: 11, color: '#475569' }}>{task.observacaoFornecedor}</div></div>}
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                        Tarefas do Projeto ({tasksConcluidas.length}/{projectTasks.length} concluídas)
                      </div>
                      <button onClick={() => { setTodasExpandidas(s => !s); setTasksExpandidas({}); }}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {todasExpandidas ? '⊟ Recolher todas' : '⊞ Expandir todas'}
                      </button>
                    </div>
                    {tasksPendentes.map(t => renderTaskCoord(t, false))}
                    {tasksConcluidas.length > 0 && (
                      <>
                        <button onClick={() => setShowConcluidas(s => !s)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>
                          <span style={{ transform: showConcluidas ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                          Concluídas ({tasksConcluidas.length})
                        </button>
                        {showConcluidas && tasksConcluidas.map(task => (
                          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid #f0f2f5', marginBottom: 6, opacity: 0.6 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{task.nome || task.serviceName}</span>
                              {task.supplierName && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{task.supplierName}</span>}
                            </div>
                            <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>✓ Concluída</span>
                          </div>
                        ))}
                      </>
                    )}
                    <div style={{ height: 1, background: '#f0f2f5', margin: '16px 0' }} />
                  </div>
                );
              })()}

              {/* Fornecedores */}
              {supplierJobs.length > 0 && (() => {
                const sjAtivos      = supplierJobs.filter(sj => sj.status !== 'cancelled');
                const sjConfirmados = sjAtivos.filter(sj => sj.status === 'confirmed' || sj.status === 'rejected');
                const sjPendentes   = sjAtivos.filter(sj => sj.status !== 'confirmed' && sj.status !== 'rejected');
                return (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                    Fornecedores ({supplierJobs.filter(j => j.status === 'confirmed').length}/{sjAtivos.length} confirmados)
                  </div>
                  {sjPendentes.map(sj => {
                    const nome        = sj.serviceName || (sj.serviceNames || [])[0];
                    const isConfirmed = sj.status === 'confirmed';
                    const isRejected  = sj.status === 'rejected';
                    const diasEvento  = project.briefingData?.evento?.diasDuracao || 1;
                    const valorTotal  = sj.preco ? parseFloat(sj.preco) * diasEvento : null;
                    const isEditing   = editandoJob === sj.id;
                    const isTrocando  = trocandoJob === sj.id;
                    return (
                      <div key={sj.id} style={{ borderRadius: 10, border: `1px solid ${isConfirmed ? 'rgba(16,185,129,0.2)' : isRejected ? 'rgba(239,68,68,0.2)' : '#e2e8f0'}`, marginBottom: 10, overflow: 'hidden', background: isConfirmed ? 'rgba(16,185,129,0.02)' : isRejected ? 'rgba(239,68,68,0.02)' : 'white' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f8faff' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConfirmed ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nome}</div>
                            <div style={{ fontSize: 11, color: '#667eea', marginTop: 1, fontWeight: 500 }}>
                              {sj.supplierName || sj.confirmedBy || 'Aguardando resposta'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: isConfirmed ? 'rgba(16,185,129,0.1)' : isRejected ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: isConfirmed ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b' }}>
                              {isConfirmed ? '✓ Confirmado' : isRejected ? '✗ Recusado' : 'Aguardando'}
                            </span>
                            {!isEditing && !isTrocando && (
                              <>
                                <button onClick={() => handleEditarJob(sj)}
                                  style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                                <button onClick={() => handleTrocarFornecedor(sj)}
                                  style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(102,126,234,0.3)', background: 'none', color: '#667eea', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Trocar</button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Infos */}
                        {!isEditing && !isTrocando && (
                          <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                            {valorTotal && (
                              <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '7px 10px', border: '1px solid rgba(0,229,196,0.15)' }}>
                                <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Valor total</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                <div style={{ fontSize: 9, color: '#94a3b8' }}>R$ {parseFloat(sj.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × {diasEvento}d</div>
                              </div>
                            )}
                            {sj.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Preparo</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasPreparo} dias</div></div>}
                            {sj.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Montagem</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasMontagem} dias</div></div>}
                            <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Evento</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{diasEvento} dias</div></div>
                            {sj.observacaoFornecedor && <div style={{ background: '#fffbeb', borderRadius: 8, padding: '7px 10px', gridColumn: '1/-1' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Obs. do fornecedor</div><div style={{ fontSize: 12, color: '#475569' }}>{sj.observacaoFornecedor}</div></div>}
                          </div>
                        )}

                        {/* Form de edição */}
                        {isEditing && (
                          <div style={{ padding: '12px 16px', background: '#f8faff', borderTop: '1px solid #e0e8ff' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                              {[['Preço (R$)', 'preco', 'number'], ['Dias de preparo', 'diasPreparo', 'number'], ['Dias de montagem', 'diasMontagem', 'number']].map(([label, field, type]) => (
                                <div key={field}>
                                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>{label}</div>
                                  <input type={type} value={editJobForm[field]} onChange={e => setEditJobForm(p => ({ ...p, [field]: e.target.value }))}
                                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                              ))}
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>Observação</div>
                              <textarea value={editJobForm.observacao} onChange={e => setEditJobForm(p => ({ ...p, observacao: e.target.value }))}
                                style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 50, boxSizing: 'border-box', outline: 'none' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button onClick={() => setEditandoJob(null)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                              <button onClick={() => handleSalvarJob(sj.id)} disabled={salvandoJob}
                                style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                {salvandoJob ? 'Salvando...' : 'Salvar'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Troca de fornecedor */}
                        {isTrocando && (
                          <div style={{ padding: '12px 16px', background: '#f8faff', borderTop: '1px solid #e0e8ff' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#667eea', marginBottom: 10 }}>Selecione o novo fornecedor para "{nome}":</div>
                            {fornecedoresAlt.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>Nenhum outro fornecedor com este serviço cadastrado.</div>
                            ) : fornecedoresAlt.map(f => (
                              <div key={f.svId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 6, background: 'white' }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{f.supplierName}</div>
                                  <div style={{ fontSize: 11, color: '#94a3b8' }}>R$ {parseFloat(f.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {f.diasPreparo || 0}d preparo</div>
                                </div>
                                <button onClick={() => handleConfirmarTroca(sj, f)} disabled={salvandoJob}
                                  style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                  Selecionar
                                </button>
                              </div>
                            ))}
                            <button onClick={() => { setTrocandoJob(null); setFornecedoresAlt([]); }}
                              style={{ marginTop: 6, padding: '5px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Fornecedores confirmados/recusados em acordeão */}
                  {sjConfirmados.length > 0 && (
                    <>
                      <button onClick={() => setShowFornConcluidos(s => !s)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                        <span style={{ transform: showFornConcluidos ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                        Respondidos ({sjConfirmados.length})
                      </button>
                      {showFornConcluidos && sjConfirmados.map(sj => (
                        <div key={sj.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, border: `1px solid ${sj.status === 'confirmed' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, marginBottom: 6, opacity: 0.7 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sj.status === 'confirmed' ? '#10b981' : '#ef4444', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{sj.serviceName || (sj.serviceNames||[])[0]}</span>
                            {sj.supplierName && <span style={{ fontSize: 11, color: '#667eea', marginLeft: 8 }}>{sj.supplierName}</span>}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 600, color: sj.status === 'confirmed' ? '#10b981' : '#ef4444' }}>{sj.status === 'confirmed' ? '✓ Confirmado' : '✗ Recusado'}</span>
                        </div>
                      ))}
                    </>
                  )}

                  {todosConfirmados && project.status !== 'pendingApproval' && project.status !== 'approved' && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(0,229,196,0.06)', borderRadius: 10, border: '1px solid rgba(0,229,196,0.2)', textAlign: 'center', fontSize: 13, color: '#00E5C4' }}>
                      {gerandoOrcamento ? '⏳ Gerando orçamento automaticamente...' : '✓ Processando — orçamento sendo enviado ao cliente'}
                    </div>
                  )}
                  {project.status === 'pendingApproval' && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(255,167,38,0.06)', borderRadius: 10, border: '1px solid rgba(255,167,38,0.2)', textAlign: 'center', fontSize: 13, color: '#FFA726', fontWeight: 500 }}>
                      ⏳ Orçamento enviado — aguardando aprovação do cliente
                    </div>
                  )}
                  {project.status === 'approved' && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center', fontSize: 13, color: '#10b981', fontWeight: 500 }}>
                      ✓ Orçamento aprovado pelo cliente!
                    </div>
                  )}
                  <div style={{ height: 1, background: '#f0f2f5', margin: '20px 0' }} />
                </div>
                );
              })()}

              {showTaskForm && (
                <div style={{ background: '#f8faff', borderRadius: 10, border: '1px solid #e0e8ff', padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={lbl}>Nome *</label>
                      <input value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))} style={inp} placeholder="Nome da tarefa" />
                    </div>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={lbl}>Descrição</label>
                      <input value={newTask.descricao} onChange={e => setNewTask(p => ({ ...p, descricao: e.target.value }))} style={inp} placeholder="Detalhes..." />
                    </div>
                    <div>
                      <label style={lbl}>Prazo</label>
                      <input type="date" value={newTask.prazo} onChange={e => setNewTask(p => ({ ...p, prazo: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Prioridade</label>
                      <select value={newTask.prioridade} onChange={e => setNewTask(p => ({ ...p, prioridade: e.target.value }))} style={{ ...inp, background: 'white' }}>
                        <option value="baixa">Baixa</option>
                        <option value="normal">Normal</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowTaskForm(false)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                    <button onClick={handleAddTask} disabled={savingTask} style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      {savingTask ? 'Salvando...' : 'Criar Tarefa'}
                    </button>
                  </div>
                </div>
              )}

              {tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Nenhuma tarefa ainda</div>
              ) : tasks.map(t => {
                const PRIORIDADE = { baixa: '#94a3b8', normal: '#64748b', alta: '#f97316', urgente: '#ef4444' };
                const STATUS_TASK = { todo: { label: 'A Fazer', color: '#f59e0b' }, in_progress: { label: 'Em Andamento', color: '#3b82f6' }, done: { label: 'Concluída', color: '#10b981' } };
                const st = STATUS_TASK[t.status] || STATUS_TASK.todo;
                return (
                  <div key={t.taskId} className="ps-task-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 2 }}>{t.name}</div>
                      {t.descricao && <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.descricao}</div>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
                        {t.prazo && <span style={{ fontSize: 10, color: '#f59e0b' }}>📅 {t.prazo}</span>}
                        {t.prioridade && t.prioridade !== 'normal' && <span style={{ fontSize: 10, color: PRIORIDADE[t.prioridade], fontWeight: 600 }}>{t.prioridade.toUpperCase()}</span>}
                        {t.assignedToName && <span style={{ fontSize: 10, color: '#64748b' }}>👤 {t.assignedToName}</span>}
                      </div>
                    </div>
                    <select value={t.status || 'todo'} onChange={e => handleTaskStatus(t.taskId, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${st.color}44`, fontSize: 11, color: st.color, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', background: `${st.color}11` }}>
                      <option value="todo">A Fazer</option>
                      <option value="in_progress">Em Andamento</option>
                      <option value="done">Concluída</option>
                    </select>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* ── HISTÓRICO ── */}
          {activeTab === 'timeline' && (
            <div className="ps-card">
              <div className="ps-card-title">Histórico</div>
              {(!project.timeline || project.timeline.length === 0) ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Nenhum histórico ainda</div>
              ) : [...project.timeline].reverse().map((item, i) => (
                <div key={i} className="ps-tl-item">
                  <div className="ps-tl-dot">•</div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 14, color: '#1a2e40', marginBottom: 3 }}>{item.description}</div>
                    <div style={{ fontSize: 12, color: '#8a9bb0' }}>{item.userName} · {formatDate(item.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
