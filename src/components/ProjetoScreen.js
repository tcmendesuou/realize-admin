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
  const [supplierJob, setSupplierJob]   = useState(null);
  const [confirming, setConfirming]     = useState(false);
  const [supplierJobs, setSupplierJobs] = useState([]);
  const [gerandoOrcamento, setGerandoOrcamento] = useState(false);

  // Tarefas
  const [tasks, setTasks]         = useState([]);
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
        setSupplierJobs(allJobs);
        // Se for fornecedor, filtra o dele
        if (userData?.systemRole === 'fornecedor') {
          const mine = allJobs.find(j => j.supplierId === userData.id);
          if (mine) setSupplierJob(mine);
        }
      } catch (e) { console.error(e); }

      // Carrega tarefas do budget
      setTasks(data.tasks || []);
      setLoading(false);
    });
    return () => unsub();
  }, [projectId]);

  // Disparo automático quando todos os supplierJobs confirmarem
  useEffect(() => {
    if (!project || !supplierJobs.length) return;
    if (project.status !== 'analyzing') return; // já foi processado
    if (userData?.systemRole === 'fornecedor') return; // não dispara no contexto do fornecedor
    const todosConfirmados = supplierJobs.every(j => j.status === 'confirmed');
    if (todosConfirmados) {
      handleGerarOrcamento();
    }
  }, [supplierJobs, project?.status]);

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

  const handleConfirmarFornecedor = async () => {
    if (!supplierJob) return;
    setConfirming(true);
    try {
      await updateDoc(doc(db, 'supplierJobs', supplierJob.id), {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        confirmedBy: userData?.name,
      });
      await updateDoc(doc(db, 'budgets', projectId), {
        supplierConfirmations: [
          ...(project.supplierConfirmations || []),
          { supplierId: userData?.id, supplierName: userData?.name, serviceNames: supplierJob.serviceNames || [], confirmedAt: new Date() }
        ],
        timeline: [
          ...(project.timeline || []),
          { action: 'supplier_confirmed', description: `Fornecedor "${userData?.name}" confirmou disponibilidade para: ${(supplierJob.serviceNames || []).join(', ')}`, userId: userData?.id, userName: userData?.name, timestamp: new Date() }
        ],
        updatedAt: serverTimestamp(),
      });
      setSupplierJob(prev => ({ ...prev, status: 'confirmed' }));
    } catch (e) { console.error(e); alert('Erro ao confirmar.'); }
    finally { setConfirming(false); }
  };

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
  const tabs = isFornecedor ? [
    { id: 'info',     label: 'Visão Geral' },
    { id: 'tasks',    label: 'Minha Tarefa' },
  ] : [
    { id: 'info',     label: 'Visão Geral' },
    { id: 'briefing', label: 'Briefing' },
    { id: 'tasks',    label: `Tarefas${tasks.length ? ` (${tasks.length})` : ''}` },
    { id: 'timeline', label: 'Histórico' },
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
          {activeTab === 'tasks' && isFornecedor && (
            <div className="ps-card">
              <div className="ps-card-title">Minha Tarefa</div>
              {supplierJob ? (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#8a9bb0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Serviços solicitados</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {(supplierJob.serviceNames || []).map((s, i) => (
                        <span key={i} style={{ padding: '5px 14px', borderRadius: 20, background: 'rgba(0,229,196,0.1)', border: '1px solid rgba(0,229,196,0.2)', color: '#00E5C4', fontSize: 13, fontWeight: 500 }}>{s}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: supplierJob.status === 'confirmed' ? 'rgba(16,185,129,0.06)' : 'rgba(0,229,196,0.04)', borderRadius: 10, border: `1px solid ${supplierJob.status === 'confirmed' ? 'rgba(16,185,129,0.2)' : 'rgba(0,229,196,0.15)'}`, padding: 20, textAlign: 'center' }}>
                    {supplierJob.status === 'confirmed' ? (
                      <>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
                        <div style={{ fontSize: 15, fontWeight: 500, color: '#10b981', marginBottom: 4 }}>Disponibilidade confirmada!</div>
                        <div style={{ fontSize: 13, color: '#64748b' }}>O coordenador foi notificado. Aguarde a aprovação do cliente.</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
                          Confirme sua disponibilidade para este evento. O coordenador será notificado.
                        </div>
                        <button onClick={handleConfirmarFornecedor} disabled={confirming}
                          style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: confirming ? '#e2e8f0' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 14, fontWeight: 600, cursor: confirming ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                          {confirming ? 'Confirmando...' : '✓ Confirmar Disponibilidade'}
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Nenhuma tarefa encontrada</div>
              )}
            </div>
          )}

          {/* ── TAREFAS ── */}
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

              {/* Fornecedores */}
              {supplierJobs.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                    Fornecedores ({supplierJobs.filter(j => j.status === 'confirmed').length}/{supplierJobs.length} confirmados)
                  </div>
                  {supplierJobs.map(sj => (
                    <div key={sj.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid #f0f2f5', marginBottom: 8, background: sj.status === 'confirmed' ? 'rgba(16,185,129,0.03)' : 'white' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: sj.status === 'confirmed' ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{sj.confirmedBy || 'Fornecedor'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{(sj.serviceNames || []).join(', ')}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: sj.status === 'confirmed' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: sj.status === 'confirmed' ? '#10b981' : '#f59e0b' }}>
                        {sj.status === 'confirmed' ? '✓ Confirmado' : 'Aguardando'}
                      </span>
                    </div>
                  ))}

                  {/* Disparo automático — sem botão manual */}
                  {todosConfirmados && project.status !== 'pendingApproval' && project.status !== 'approved' && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(0,229,196,0.06)', borderRadius: 10, border: '1px solid rgba(0,229,196,0.2)', textAlign: 'center', fontSize: 13, color: '#00E5C4' }}>
                      {gerandoOrcamento ? '⏳ Gerando orçamento automaticamente...' : '✓ Todos confirmaram — orçamento sendo enviado ao cliente'}
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
              )}

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
