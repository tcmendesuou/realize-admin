import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import ProjetoScreen from './ProjetoScreen';

export default function AtendimentoHome({ user, userData, onLogout }) {
  const [myBudgets, setMyBudgets] = useState([]);
  const [myProjects, setMyProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navegação para projeto
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Briefing modal
  const [showBriefing, setShowBriefing] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [flowQuestions, setFlowQuestions] = useState([]);
  const [savingBriefing, setSavingBriefing] = useState(false);
  const [briefingForm, setBriefingForm] = useState({
    companyId: '', companyName: '',
    clientName: '', clientEmail: '', clientPhone: '',
    eventTypeId: '', eventTypeName: '',
    answers: {}
  });

  const userName = userData?.name || user?.email?.split('@')[0] || 'Atendimento';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const userId = userData?.id;

  useEffect(() => {
    if (userId) loadData(userId);
    loadCompaniesAndEventTypes();
  }, [userId]);

  const loadData = async (uid) => {
    try {
      await Promise.all([loadMyBudgets(uid), loadMyProjects(uid)]);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCompaniesAndEventTypes = async () => {
    try {
      const [compSnap, etSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(query(collection(db, 'eventTypes'), where('active', '==', true)))
      ]);
      setCompanies(compSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
      const questionItems = (flow.items || []).filter(i => i.itemType === 'question');
      if (questionItems.length === 0) { setFlowQuestions([]); return; }
      const allQSnap = await getDocs(collection(db, 'questions'));
      const allQ = allQSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const ordered = questionItems
        .map(item => allQ.find(q => q.id === item.itemId))
        .filter(Boolean)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      setFlowQuestions(ordered);
    } catch (err) {
      console.error('Erro ao carregar perguntas:', err);
      setFlowQuestions([]);
    }
  };

  const loadMyBudgets = async (uid) => {
    const q = query(collection(db, 'budgets'), where('assignedTo', '==', uid), where('status', '==', 'analyzing'));
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dA = a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(0);
        const dB = b.assignedAt?.toDate ? b.assignedAt.toDate() : new Date(0);
        return dB - dA;
      });
    setMyBudgets(data);
  };

  const loadMyProjects = async (uid) => {
    const q = query(collection(db, 'budgets'), where('assignedTo', '==', uid), where('status', '==', 'approved'));
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dA = a.approvedAt?.toDate ? a.approvedAt.toDate() : new Date(0);
        const dB = b.approvedAt?.toDate ? b.approvedAt.toDate() : new Date(0);
        return dB - dA;
      });
    setMyProjects(data);
  };

  const handleEventTypeChange = async (eventTypeId) => {
    const et = eventTypes.find(e => e.id === eventTypeId);
    setBriefingForm(f => ({ ...f, eventTypeId, eventTypeName: et?.name || '', answers: {} }));
    if (eventTypeId) await loadFlowQuestions(eventTypeId);
    else setFlowQuestions([]);
  };

  const handleAnswerChange = (questionId, value) => {
    setBriefingForm(f => ({ ...f, answers: { ...f.answers, [questionId]: value } }));
  };

  const handleSaveBriefing = async () => {
    if (!briefingForm.companyId) { alert('Selecione a empresa cliente'); return; }
    if (!briefingForm.clientName) { alert('Informe o nome do responsável'); return; }
    if (!briefingForm.eventTypeId) { alert('Selecione o tipo de evento'); return; }

    setSavingBriefing(true);
    try {
      const allBudgets = await getDocs(collection(db, 'budgets'));
      const maxNum = allBudgets.docs.reduce((max, d) => Math.max(max, d.data().budgetNumber || 0), 1000);

      await addDoc(collection(db, 'budgets'), {
        budgetNumber: maxNum + 1,
        clientId: briefingForm.companyId,
        clientName: briefingForm.clientName,
        clientEmail: briefingForm.clientEmail,
        clientPhone: briefingForm.clientPhone,
        companyName: briefingForm.companyName,
        eventTypeId: briefingForm.eventTypeId,
        eventTypeName: briefingForm.eventTypeName,
        answers: briefingForm.answers,
        status: 'analyzing',
        assignedTo: userId,
        assignedToName: userName,
        assignedBy: userId,
        assignedAt: serverTimestamp(),
        createdBy: 'atendimento',
        timeline: [{
          action: 'created',
          description: `Briefing aberto por ${userName} (via email do cliente)`,
          userId: userId,
          userName: userName,
          timestamp: new Date()
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      alert('Briefing criado com sucesso!');
      setShowBriefing(false);
      setBriefingForm({ companyId: '', companyName: '', clientName: '', clientEmail: '', clientPhone: '', eventTypeId: '', eventTypeName: '', answers: {} });
      setFlowQuestions([]);
      await loadData(userId);
    } catch (err) {
      console.error('Erro ao salvar briefing:', err);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSavingBriefing(false);
    }
  };

  const getProjectName = (item) => {
    if (item.answers?.['GApo1hcglkgdpAQGuSnn']) return item.answers['GApo1hcglkgdpAQGuSnn'];
    return item.eventTypeName || 'Evento';
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const renderQuestionInput = (q) => {
    const val = briefingForm.answers[q.id] || '';
    const base = {
      width: '100%', padding: '10px 14px', borderRadius: 8,
      border: '1px solid rgba(0,180,255,0.15)',
      background: 'rgba(255,255,255,0.04)', color: '#E8F4FF',
      fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none'
    };
    if (q.type === 'text' || q.type === 'number' || q.type === 'date') {
      return <input type={q.type} value={val} onChange={e => handleAnswerChange(q.id, e.target.value)} style={base} placeholder="Sua resposta..." />;
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
    return <input type="text" value={val} onChange={e => handleAnswerChange(q.id, e.target.value)} style={base} placeholder="Sua resposta..." />;
  };

  // Navega para tela do projeto
  if (selectedProjectId) {
    return (
      <ProjetoScreen
        projectId={selectedProjectId}
        onBack={() => setSelectedProjectId(null)}
      />
    );
  }

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Carregando seus projetos...</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D1B2A; }
        .at-wrap { min-height: 100vh; background: #0D1B2A; font-family: 'Outfit', sans-serif; color: #E8F4FF; }

        .at-sidebar {
          position: fixed; top: 0; left: 0; bottom: 0; width: 240px;
          background: rgba(10,22,38,0.95); border-right: 1px solid rgba(0,180,255,0.1);
          backdrop-filter: blur(20px); display: flex; flex-direction: column; z-index: 10; padding: 28px 0;
        }
        .at-sidebar-logo { padding: 0 24px 28px; border-bottom: 1px solid rgba(0,180,255,0.08); }
        .at-sidebar-logo-name { font-size: 18px; font-weight: 300; letter-spacing: 3px; color: #E8F4FF; }
        .at-sidebar-logo-name span { color: #00E5C4; font-weight: 500; }
        .at-sidebar-logo-sub { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: rgba(123,175,212,0.4); margin-top: 4px; }
        .at-nav { flex: 1; padding: 20px 12px; display: flex; flex-direction: column; gap: 4px; }
        .at-nav-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 300; color: #7BAFD4; cursor: pointer; transition: all 0.15s;
          border: none; background: none; width: 100%; text-align: left; font-family: 'Outfit', sans-serif;
        }
        .at-nav-item:hover { background: rgba(0,229,196,0.06); color: #E8F4FF; }
        .at-nav-item.active { background: rgba(0,229,196,0.1); color: #00E5C4; }
        .at-nav-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .at-sidebar-user {
          padding: 20px 16px 0; border-top: 1px solid rgba(0,180,255,0.08);
          display: flex; align-items: center; gap: 10px;
        }
        .at-avatar {
          width: 36px; height: 36px; border-radius: 50%; background: rgba(0,229,196,0.15);
          border: 1.5px solid rgba(0,229,196,0.4); display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 500; color: #00E5C4; flex-shrink: 0;
        }
        .at-user-name { font-size: 13px; font-weight: 400; color: #E8F4FF; }
        .at-user-role { font-size: 11px; color: rgba(123,175,212,0.5); }
        .at-logout {
          margin-left: auto; padding: 6px 10px; border-radius: 6px; background: none;
          border: 1px solid rgba(231,76,60,0.3); color: rgba(231,76,60,0.7); font-size: 11px;
          cursor: pointer; transition: all 0.15s; font-family: 'Outfit', sans-serif;
        }
        .at-logout:hover { background: rgba(231,76,60,0.1); color: #E74C3C; }

        .at-main { margin-left: 240px; min-height: 100vh; display: flex; flex-direction: column; }

        .at-header {
          padding: 28px 36px 24px; border-bottom: 1px solid rgba(0,180,255,0.08);
          background: rgba(10,22,38,0.5); backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: space-between;
        }
        .at-header-greeting { font-size: 22px; font-weight: 300; margin-bottom: 4px; }
        .at-header-greeting strong { font-weight: 500; color: #00E5C4; }
        .at-header-sub { font-size: 13px; color: #7BAFD4; font-weight: 300; }

        .at-btn-briefing {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 10px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #00E5C4 0%, #0080FF 100%);
          color: #fff; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          letter-spacing: 0.5px; transition: opacity 0.2s, transform 0.15s; white-space: nowrap;
        }
        .at-btn-briefing:hover { opacity: 0.9; transform: translateY(-1px); }

        .at-stats { display: flex; gap: 16px; padding: 20px 36px; border-bottom: 1px solid rgba(0,180,255,0.06); }
        .at-stat { flex: 1; background: rgba(255,255,255,0.02); border: 1px solid rgba(0,180,255,0.1); border-radius: 10px; padding: 16px 20px; }
        .at-stat-num { font-size: 28px; font-weight: 300; }
        .at-stat-label { font-size: 11px; color: #7BAFD4; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
        .at-stat.orange .at-stat-num { color: #FFA726; }
        .at-stat.green .at-stat-num { color: #66BB6A; }

        .at-content { flex: 1; padding: 28px 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .at-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .at-section-title { font-size: 14px; font-weight: 500; letter-spacing: 0.5px; }
        .at-section-badge { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; }
        .at-section-badge.orange { background: rgba(255,167,38,0.15); color: #FFA726; }
        .at-section-badge.green { background: rgba(102,187,106,0.15); color: #66BB6A; }

        .at-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(0,180,255,0.1);
          border-radius: 12px; padding: 18px 20px; margin-bottom: 12px; cursor: pointer;
          transition: all 0.15s; position: relative; overflow: hidden;
        }
        .at-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
        .at-card.orange::before { background: #FFA726; }
        .at-card.green::before { background: #66BB6A; }
        .at-card:hover { background: rgba(255,255,255,0.04); border-color: rgba(0,180,255,0.2); transform: translateY(-1px); }
        .at-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
        .at-card-name { font-size: 15px; font-weight: 500; color: #E8F4FF; flex: 1; margin-right: 10px; }
        .at-card-status { font-size: 10px; font-weight: 600; letter-spacing: 1px; padding: 3px 9px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }
        .at-card-status.orange { background: rgba(255,167,38,0.15); color: #FFA726; }
        .at-card-status.green { background: rgba(102,187,106,0.15); color: #66BB6A; }
        .at-card-info { display: flex; flex-direction: column; gap: 3px; }
        .at-card-type { font-size: 12px; color: #7BAFD4; }
        .at-card-client { font-size: 13px; color: #E8F4FF; }
        .at-card-meta { display: flex; gap: 12px; margin-top: 8px; }
        .at-card-num { font-size: 11px; color: rgba(123,175,212,0.4); }
        .at-card-date { font-size: 11px; color: rgba(123,175,212,0.4); }
        .at-progress { margin-top: 12px; display: flex; align-items: center; gap: 10px; }
        .at-progress-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .at-progress-fill { height: 100%; background: linear-gradient(90deg, #00E5C4, #66BB6A); border-radius: 2px; }
        .at-progress-text { font-size: 11px; color: #66BB6A; font-weight: 500; white-space: nowrap; }
        .at-empty { border: 1px dashed rgba(0,180,255,0.15); border-radius: 12px; padding: 32px; text-align: center; }
        .at-empty-text { font-size: 14px; color: rgba(232,244,255,0.4); margin-bottom: 4px; }
        .at-empty-sub { font-size: 12px; color: rgba(123,175,212,0.3); }

        /* MODAL BRIEFING */
        .at-modal-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 40px 20px; overflow-y: auto;
        }
        .at-modal {
          background: #111f30; border: 1px solid rgba(0,180,255,0.15);
          border-radius: 16px; width: 100%; max-width: 620px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .at-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 24px 28px; border-bottom: 1px solid rgba(0,180,255,0.1);
        }
        .at-modal-title { font-size: 18px; font-weight: 400; }
        .at-modal-title span { color: #00E5C4; }
        .at-modal-close {
          width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(0,180,255,0.15);
          background: none; color: #7BAFD4; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: all 0.15s;
          font-family: 'Outfit', sans-serif;
        }
        .at-modal-close:hover { background: rgba(231,76,60,0.1); color: #E74C3C; border-color: rgba(231,76,60,0.3); }
        .at-modal-body { padding: 28px; display: flex; flex-direction: column; gap: 24px; }
        .at-modal-section { display: flex; flex-direction: column; gap: 14px; }
        .at-modal-section-title {
          font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase;
          color: #00E5C4; padding-bottom: 10px; border-bottom: 1px solid rgba(0,229,196,0.1);
        }
        .at-field { display: flex; flex-direction: column; gap: 7px; }
        .at-field label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #7BAFD4; }
        .at-field input, .at-field select {
          width: 100%; padding: 10px 14px; border-radius: 8px;
          border: 1px solid rgba(0,180,255,0.15); background: rgba(255,255,255,0.04);
          color: #E8F4FF; font-family: 'Outfit', sans-serif; font-size: 13px; outline: none;
          transition: border-color 0.2s;
        }
        .at-field input:focus, .at-field select:focus { border-color: rgba(0,229,196,0.4); }
        .at-field select option { background: #111f30; color: #E8F4FF; }
        .at-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .at-question-item { display: flex; flex-direction: column; gap: 8px; padding: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(0,180,255,0.08); border-radius: 10px; }
        .at-question-text { font-size: 13px; color: #E8F4FF; line-height: 1.4; }
        .at-question-required { color: #E74C3C; margin-left: 3px; }
        .at-modal-footer {
          display: flex; gap: 12px; padding: 20px 28px;
          border-top: 1px solid rgba(0,180,255,0.1);
        }
        .at-btn-cancel-modal {
          flex: 1; padding: 12px; border-radius: 10px; border: 1px solid rgba(0,180,255,0.15);
          background: none; color: #7BAFD4; font-family: 'Outfit', sans-serif; font-size: 14px;
          cursor: pointer; transition: all 0.15s;
        }
        .at-btn-cancel-modal:hover { background: rgba(255,255,255,0.04); color: #E8F4FF; }
        .at-btn-save-briefing {
          flex: 2; padding: 12px; border-radius: 10px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #00E5C4 0%, #0080FF 100%);
          color: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          transition: opacity 0.2s;
        }
        .at-btn-save-briefing:disabled { opacity: 0.6; cursor: not-allowed; }
        .at-no-questions { padding: 20px; text-align: center; color: rgba(123,175,212,0.4); font-size: 13px; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .at-sidebar { width: 60px; }
          .at-sidebar-logo, .at-nav-item span, .at-user-name, .at-user-role, .at-sidebar-logo-sub { display: none; }
          .at-main { margin-left: 60px; }
          .at-content { grid-template-columns: 1fr; }
          .at-field-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="at-wrap">

        {/* SIDEBAR */}
        <aside className="at-sidebar">
          <div className="at-sidebar-logo">
            <div className="at-sidebar-logo-name">realize<span>hub</span></div>
            <div className="at-sidebar-logo-sub">Atendimento</div>
          </div>
          <nav className="at-nav">
            <button className="at-nav-item active">
              <span className="at-nav-dot" /><span>Meus Projetos</span>
            </button>
            <button className="at-nav-item" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              <span className="at-nav-dot" /><span>Propostas</span>
            </button>
          </nav>
          <div className="at-sidebar-user">
            <div className="at-avatar">{userInitials}</div>
            <div>
              <div className="at-user-name">{userName.split(' ')[0]}</div>
              <div className="at-user-role">Atendimento</div>
            </div>
            <button className="at-logout" onClick={onLogout}>Sair</button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="at-main">

          {/* HEADER */}
          <div className="at-header">
            <div>
              <div className="at-header-greeting">Olá, <strong>{userName.split(' ')[0]}</strong>!</div>
              <div className="at-header-sub">Aqui estão seus projetos e orçamentos atribuídos</div>
            </div>
            <button className="at-btn-briefing" onClick={() => setShowBriefing(true)}>
              + Abrir novo briefing
            </button>
          </div>

          {/* STATS */}
          <div className="at-stats">
            <div className="at-stat orange">
              <div className="at-stat-num">{myBudgets.length}</div>
              <div className="at-stat-label">Para Analisar</div>
            </div>
            <div className="at-stat green">
              <div className="at-stat-num">{myProjects.length}</div>
              <div className="at-stat-label">Em Andamento</div>
            </div>
            <div className="at-stat">
              <div className="at-stat-num" style={{ color: '#7BAFD4' }}>{myBudgets.length + myProjects.length}</div>
              <div className="at-stat-label">Total Ativo</div>
            </div>
          </div>

          {/* CONTENT */}
          <div className="at-content">

            {/* PARA ANALISAR */}
            <div className="at-section">
              <div className="at-section-header">
                <div className="at-section-title">Para Analisar</div>
                <div className="at-section-badge orange">{myBudgets.length}</div>
              </div>
              {myBudgets.length > 0 ? myBudgets.map(b => (
                <div key={b.id} className="at-card orange" onClick={() => setSelectedProjectId(b.id)}>
                  <div className="at-card-top">
                    <div className="at-card-name">{getProjectName(b)}</div>
                    <div className="at-card-status orange">EM ANÁLISE</div>
                  </div>
                  <div className="at-card-info">
                    <div className="at-card-type">{b.eventTypeName}</div>
                    <div className="at-card-client">Cliente: {b.clientName || 'Não informado'}</div>
                  </div>
                  <div className="at-card-meta">
                    <div className="at-card-num">#{b.budgetNumber}</div>
                    {b.assignedAt && <div className="at-card-date">Atribuído: {formatDate(b.assignedAt)}</div>}
                  </div>
                </div>
              )) : (
                <div className="at-empty">
                  <div className="at-empty-text">Nenhum orçamento para analisar</div>
                  <div className="at-empty-sub">Aguardando novos projetos</div>
                </div>
              )}
            </div>

            {/* EM ANDAMENTO */}
            <div className="at-section">
              <div className="at-section-header">
                <div className="at-section-title">Em Andamento</div>
                <div className="at-section-badge green">{myProjects.length}</div>
              </div>
              {myProjects.length > 0 ? myProjects.map(p => (
                <div key={p.id} className="at-card green" onClick={() => setSelectedProjectId(p.id)}>
                  <div className="at-card-top">
                    <div className="at-card-name">{getProjectName(p)}</div>
                    <div className="at-card-status green">APROVADO</div>
                  </div>
                  <div className="at-card-info">
                    <div className="at-card-type">{p.eventTypeName}</div>
                    <div className="at-card-client">Cliente: {p.clientName || 'Não informado'}</div>
                  </div>
                  <div className="at-card-meta">
                    <div className="at-card-num">#{p.budgetNumber}</div>
                    {p.approvedAt && <div className="at-card-date">Aprovado: {formatDate(p.approvedAt)}</div>}
                  </div>
                  {p.taskProgress && (
                    <div className="at-progress">
                      <div className="at-progress-bar">
                        <div className="at-progress-fill" style={{ width: `${p.taskProgress.percentage || 0}%` }} />
                      </div>
                      <div className="at-progress-text">{p.taskProgress.completed || 0}/{p.taskProgress.total || 0}</div>
                    </div>
                  )}
                </div>
              )) : (
                <div className="at-empty">
                  <div className="at-empty-text">Nenhum projeto em andamento</div>
                  <div className="at-empty-sub">Projetos aprovados aparecerão aqui</div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* MODAL BRIEFING */}
        {showBriefing && (
          <div className="at-modal-overlay" onClick={e => e.target === e.currentTarget && setShowBriefing(false)}>
            <div className="at-modal">
              <div className="at-modal-header">
                <div className="at-modal-title">Abrir novo <span>briefing</span></div>
                <button className="at-modal-close" onClick={() => setShowBriefing(false)}>×</button>
              </div>
              <div className="at-modal-body">

                <div className="at-modal-section">
                  <div className="at-modal-section-title">Empresa e responsável</div>
                  <div className="at-field">
                    <label>Empresa cliente *</label>
                    <select value={briefingForm.companyId} onChange={e => {
                      const c = companies.find(x => x.id === e.target.value);
                      setBriefingForm(f => ({ ...f, companyId: e.target.value, companyName: c?.name || '' }));
                    }}>
                      <option value="">Selecione a empresa...</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="at-field">
                    <label>Nome do responsável *</label>
                    <input type="text" placeholder="Nome completo"
                      value={briefingForm.clientName}
                      onChange={e => setBriefingForm(f => ({ ...f, clientName: e.target.value }))} />
                  </div>
                  <div className="at-field-row">
                    <div className="at-field">
                      <label>Email</label>
                      <input type="email" placeholder="email@empresa.com"
                        value={briefingForm.clientEmail}
                        onChange={e => setBriefingForm(f => ({ ...f, clientEmail: e.target.value }))} />
                    </div>
                    <div className="at-field">
                      <label>Telefone</label>
                      <input type="tel" placeholder="(00) 00000-0000"
                        value={briefingForm.clientPhone}
                        onChange={e => setBriefingForm(f => ({ ...f, clientPhone: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="at-modal-section">
                  <div className="at-modal-section-title">Tipo de evento</div>
                  <div className="at-field">
                    <label>Selecione o tipo *</label>
                    <select value={briefingForm.eventTypeId} onChange={e => handleEventTypeChange(e.target.value)}>
                      <option value="">Selecione o tipo de evento...</option>
                      {eventTypes.map(et => <option key={et.id} value={et.id}>{et.name}</option>)}
                    </select>
                  </div>
                </div>

                {briefingForm.eventTypeId && (
                  <div className="at-modal-section">
                    <div className="at-modal-section-title">Perguntas do briefing</div>
                    {flowQuestions.length === 0 ? (
                      <div className="at-no-questions">Nenhuma pergunta cadastrada para este tipo de evento</div>
                    ) : (
                      flowQuestions.map(q => (
                        <div key={q.id} className="at-question-item">
                          <div className="at-question-text">
                            {q.text}
                            {q.required && <span className="at-question-required">*</span>}
                          </div>
                          {renderQuestionInput(q)}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="at-modal-footer">
                <button className="at-btn-cancel-modal" onClick={() => setShowBriefing(false)}>Cancelar</button>
                <button className="at-btn-save-briefing" onClick={handleSaveBriefing} disabled={savingBriefing}>
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
  loadingText: { color: '#7BAFD4', fontSize: 14 },
};
