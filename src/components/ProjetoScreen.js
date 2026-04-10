import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function ProjetoScreen({ projectId, onBack }) {
  const [project, setProject] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  useEffect(() => {
    if (projectId) loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const docRef = doc(db, 'budgets', projectId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) { setLoading(false); return; }
      const data = { id: docSnap.id, ...docSnap.data() };
      setProject(data);

      // Busca perguntas do fluxo para exibir as labels corretas
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
    } catch (err) {
      console.error('Erro ao carregar projeto:', err);
    } finally {
      setLoading(false);
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

  const getProjectName = () => {
    if (project?.answers?.['GApo1hcglkgdpAQGuSnn']) return project.answers['GApo1hcglkgdpAQGuSnn'];
    return project?.eventTypeName || 'Evento';
  };

  const getAnswerDisplay = (question, answer) => {
    if (answer === null || answer === undefined || answer === '') return 'Não respondido';
    // Nunca retornar objeto diretamente — sempre converter para string
    const safeString = (val) => {
      if (val === null || val === undefined) return '—';
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    };
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

  const tabs = [
    { id: 'info', label: 'Visão Geral' },
    { id: 'briefing', label: 'Briefing' },
    { id: 'tasks', label: `Tarefas${project.tasks?.length ? ` (${project.tasks.length})` : ''}` },
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
            <span className="ps-topbar-num">#{project.budgetNumber}</span>
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
            <span>Projeto #{project.budgetNumber}</span>
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

          {/* ── VISÃO GERAL ── */}
          {activeTab === 'info' && (
            <>
              {/* Status cards */}
              {project.status === 'approved' && (
                <div className="ps-status-card approved">
                  <div className="ps-status-card-title">Aprovado</div>
                  <div className="ps-info-grid">
                    <div className="ps-info-item">
                      <span className="ps-info-label">Por</span>
                      <span className="ps-info-value">{project.approvedByName || '—'}</span>
                    </div>
                    <div className="ps-info-item">
                      <span className="ps-info-label">Em</span>
                      <span className="ps-info-value">{formatDate(project.approvedAt)}</span>
                    </div>
                  </div>
                </div>
              )}
              {project.status === 'rejected' && (
                <div className="ps-status-card rejected">
                  <div className="ps-status-card-title">Rejeitado</div>
                  <div className="ps-info-grid">
                    <div className="ps-info-item">
                      <span className="ps-info-label">Por</span>
                      <span className="ps-info-value">{project.rejectedByName || '—'}</span>
                    </div>
                    <div className="ps-info-item">
                      <span className="ps-info-label">Em</span>
                      <span className="ps-info-value">{formatDate(project.rejectedAt)}</span>
                    </div>
                    {project.rejectionReason && (
                      <div className="ps-info-item full">
                        <span className="ps-info-label">Motivo</span>
                        <span className="ps-info-value">{project.rejectionReason}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

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

          {/* ── BRIEFING ── */}
          {activeTab === 'briefing' && (
            <div className="ps-card">
              <div className="ps-card-title">Respostas do Briefing</div>
              {questions.length > 0 ? (
                questions.map(q => (
                  <div key={q.id} className="ps-answer-item">
                    <span className="ps-question-text">{q.text}</span>
                    <span className="ps-answer-text">
                      {getAnswerDisplay(q, project.answers?.[q.id])}
                    </span>
                  </div>
                ))
              ) : project.answers && Object.keys(project.answers).length > 0 ? (
                Object.entries(project.answers).map(([key, val]) => {
                  // Serializa qualquer valor para string segura
                  let display = '';
                  if (val === null || val === undefined) {
                    display = '—';
                  } else if (key === 'fixed-events' && Array.isArray(val)) {
                    display = val.map((f, i) => `Feira ${i + 1}: ${f.nome || ''}${f.local ? ` — ${f.local}` : ''}${f.dataInicio ? ` (${f.dataInicio}${f.dataFim ? ` a ${f.dataFim}` : ''})` : ''}`).join(' | ');
                  } else if (key === 'fixed-envio' && typeof val === 'object') {
                    display = val.userName || '—';
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
                })
              ) : (
                <div className="ps-empty">Nenhuma resposta disponível</div>
              )}
            </div>
          )}

          {/* ── TAREFAS ── */}
          {activeTab === 'tasks' && (
            <div className="ps-card">
              <div className="ps-card-title">Tarefas do Projeto</div>
              {project.tasks && project.tasks.length > 0 ? (
                project.tasks.map((task, i) => (
                  <div key={i} className="ps-task-item">
                    <div className="ps-task-num">{i + 1}</div>
                    <div className="ps-task-body">
                      <div className="ps-task-name">{task.name}</div>
                      {task.description && <div className="ps-task-desc">{task.description}</div>}
                      <div className="ps-task-footer">
                        <span className={`ps-task-status ${task.status || 'pending'}`}>
                          {task.status === 'completed' ? 'Concluída' : task.status === 'in_progress' ? 'Em Andamento' : 'Pendente'}
                        </span>
                        {task.assignedToName && (
                          <span className="ps-task-assigned">Responsável: {task.assignedToName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="ps-empty">Nenhuma tarefa atribuída ainda</div>
              )}
            </div>
          )}

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
