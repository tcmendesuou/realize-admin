import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function AtendimentoHome({ user, userData, onLogout }) {
  const [myBudgets, setMyBudgets] = useState([]);
  const [myProjects, setMyProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  const userName = userData?.name || user?.email?.split('@')[0] || 'Atendimento';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const userId = userData?.id;

  useEffect(() => {
    if (userId) loadData(userId);
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

  const loadMyBudgets = async (uid) => {
    const q = query(
      collection(db, 'budgets'),
      where('assignedTo', '==', uid),
      where('status', '==', 'analyzing')
    );
    const snap = await getDocs(q);
    const data = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dA = a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(0);
        const dB = b.assignedAt?.toDate ? b.assignedAt.toDate() : new Date(0);
        return dB - dA;
      });
    setMyBudgets(data);
  };

  const loadMyProjects = async (uid) => {
    const q = query(
      collection(db, 'budgets'),
      where('assignedTo', '==', uid),
      where('status', '==', 'approved')
    );
    const snap = await getDocs(q);
    const data = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dA = a.approvedAt?.toDate ? a.approvedAt.toDate() : new Date(0);
        const dB = b.approvedAt?.toDate ? b.approvedAt.toDate() : new Date(0);
        return dB - dA;
      });
    setMyProjects(data);
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

        /* SIDEBAR */
        .at-sidebar {
          position: fixed; top: 0; left: 0; bottom: 0; width: 240px;
          background: rgba(10,22,38,0.95);
          border-right: 1px solid rgba(0,180,255,0.1);
          backdrop-filter: blur(20px);
          display: flex; flex-direction: column;
          z-index: 10;
          padding: 28px 0;
        }
        .at-sidebar-logo {
          padding: 0 24px 28px;
          border-bottom: 1px solid rgba(0,180,255,0.08);
        }
        .at-sidebar-logo-name {
          font-size: 18px; font-weight: 300; letter-spacing: 3px; color: #E8F4FF;
        }
        .at-sidebar-logo-name span { color: #00E5C4; font-weight: 500; }
        .at-sidebar-logo-sub {
          font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
          color: rgba(123,175,212,0.4); margin-top: 4px;
        }

        .at-nav { flex: 1; padding: 20px 12px; display: flex; flex-direction: column; gap: 4px; }
        .at-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 300; color: #7BAFD4;
          cursor: pointer; transition: all 0.15s; border: none; background: none; width: 100%; text-align: left;
        }
        .at-nav-item:hover { background: rgba(0,229,196,0.06); color: #E8F4FF; }
        .at-nav-item.active { background: rgba(0,229,196,0.1); color: #00E5C4; }
        .at-nav-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

        .at-sidebar-user {
          padding: 20px 16px 0;
          border-top: 1px solid rgba(0,180,255,0.08);
          display: flex; align-items: center; gap: 10px;
        }
        .at-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(0,229,196,0.15);
          border: 1.5px solid rgba(0,229,196,0.4);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 500; color: #00E5C4; flex-shrink: 0;
        }
        .at-user-name { font-size: 13px; font-weight: 400; color: #E8F4FF; }
        .at-user-role { font-size: 11px; color: rgba(123,175,212,0.5); }
        .at-logout {
          margin-left: auto; padding: 6px 10px; border-radius: 6px;
          background: none; border: 1px solid rgba(231,76,60,0.3);
          color: rgba(231,76,60,0.7); font-size: 11px; cursor: pointer;
          transition: all 0.15s; font-family: 'Outfit', sans-serif;
        }
        .at-logout:hover { background: rgba(231,76,60,0.1); color: #E74C3C; }

        /* MAIN */
        .at-main { margin-left: 240px; min-height: 100vh; display: flex; flex-direction: column; }

        /* HEADER */
        .at-header {
          padding: 28px 36px 24px;
          border-bottom: 1px solid rgba(0,180,255,0.08);
          background: rgba(10,22,38,0.5);
          backdrop-filter: blur(10px);
        }
        .at-header-greeting { font-size: 22px; font-weight: 300; margin-bottom: 4px; }
        .at-header-greeting strong { font-weight: 500; color: #00E5C4; }
        .at-header-sub { font-size: 13px; color: #7BAFD4; font-weight: 300; }

        /* STATS */
        .at-stats {
          display: flex; gap: 16px;
          padding: 20px 36px;
          border-bottom: 1px solid rgba(0,180,255,0.06);
        }
        .at-stat {
          flex: 1; background: rgba(255,255,255,0.02);
          border: 1px solid rgba(0,180,255,0.1);
          border-radius: 10px; padding: 16px 20px;
        }
        .at-stat-num { font-size: 28px; font-weight: 300; }
        .at-stat-label { font-size: 11px; color: #7BAFD4; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
        .at-stat.orange .at-stat-num { color: #FFA726; }
        .at-stat.green .at-stat-num  { color: #66BB6A; }

        /* CONTENT */
        .at-content { flex: 1; padding: 28px 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

        /* SECTION */
        .at-section {}
        .at-section-header {
          display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
        }
        .at-section-title { font-size: 14px; font-weight: 500; letter-spacing: 0.5px; }
        .at-section-badge {
          padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500;
        }
        .at-section-badge.orange { background: rgba(255,167,38,0.15); color: #FFA726; }
        .at-section-badge.green  { background: rgba(102,187,106,0.15); color: #66BB6A; }

        /* CARDS */
        .at-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(0,180,255,0.1);
          border-radius: 12px; padding: 18px 20px;
          margin-bottom: 12px; cursor: pointer;
          transition: all 0.15s; position: relative; overflow: hidden;
        }
        .at-card::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
        }
        .at-card.orange::before { background: #FFA726; }
        .at-card.green::before  { background: #66BB6A; }
        .at-card:hover { background: rgba(255,255,255,0.04); border-color: rgba(0,180,255,0.2); transform: translateY(-1px); }

        .at-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
        .at-card-name { font-size: 15px; font-weight: 500; color: #E8F4FF; flex: 1; margin-right: 10px; }
        .at-card-status {
          font-size: 10px; font-weight: 600; letter-spacing: 1px; padding: 3px 9px;
          border-radius: 20px; white-space: nowrap; flex-shrink: 0;
        }
        .at-card-status.orange { background: rgba(255,167,38,0.15); color: #FFA726; }
        .at-card-status.green  { background: rgba(102,187,106,0.15); color: #66BB6A; }

        .at-card-info { display: flex; flex-direction: column; gap: 3px; }
        .at-card-type { font-size: 12px; color: #7BAFD4; }
        .at-card-client { font-size: 13px; color: #E8F4FF; }
        .at-card-meta { display: flex; gap: 12px; margin-top: 8px; }
        .at-card-num { font-size: 11px; color: rgba(123,175,212,0.4); }
        .at-card-date { font-size: 11px; color: rgba(123,175,212,0.4); }

        /* PROGRESS */
        .at-progress { margin-top: 12px; display: flex; align-items: center; gap: 10px; }
        .at-progress-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .at-progress-fill { height: 100%; background: linear-gradient(90deg, #00E5C4, #66BB6A); border-radius: 2px; transition: width 0.3s; }
        .at-progress-text { font-size: 11px; color: #66BB6A; font-weight: 500; white-space: nowrap; }

        /* EMPTY */
        .at-empty {
          border: 1px dashed rgba(0,180,255,0.15); border-radius: 12px;
          padding: 32px; text-align: center;
        }
        .at-empty-text { font-size: 14px; color: rgba(232,244,255,0.4); margin-bottom: 4px; }
        .at-empty-sub  { font-size: 12px; color: rgba(123,175,212,0.3); }

        /* SPINNER */
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 900px) {
          .at-sidebar { width: 60px; }
          .at-sidebar-logo, .at-nav-item span, .at-user-name, .at-user-role, .at-sidebar-logo-sub { display: none; }
          .at-main { margin-left: 60px; }
          .at-content { grid-template-columns: 1fr; }
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
              <span className="at-nav-dot" />
              <span>Meus Projetos</span>
            </button>
            <button className="at-nav-item" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              <span className="at-nav-dot" />
              <span>Detalhes do Projeto</span>
            </button>
            <button className="at-nav-item" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              <span className="at-nav-dot" />
              <span>Propostas</span>
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
            <div className="at-header-greeting">
              Olá, <strong>{userName.split(' ')[0]}</strong>!
            </div>
            <div className="at-header-sub">Aqui estão seus projetos e orçamentos atribuídos</div>
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
              <div className="at-stat-num" style={{ color: '#7BAFD4' }}>
                {myBudgets.length + myProjects.length}
              </div>
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
                <div key={b.id} className="at-card orange" onClick={() => setSelectedItem(b)}>
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
                <div key={p.id} className="at-card green" onClick={() => setSelectedItem(p)}>
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
                      <div className="at-progress-text">
                        {p.taskProgress.completed || 0}/{p.taskProgress.total || 0}
                      </div>
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
