import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import FornecedorServicos from './FornecedorServicos';

const STAGES = [
  { id: 'proposta',    label: 'Propostas',   color: '#7BAFD4' },
  { id: 'aguardando',  label: 'Aguardando',  color: '#FFA726' },
  { id: 'acontecendo', label: 'Acontecendo', color: '#00E5C4' },
  { id: 'concluido',   label: 'Concluido',   color: '#66BB6A' },
];

export default function FornecedorHome({ userData, onLogout }) {
  const [jobs, setJobs]                   = useState([]);
  const [activeSection, setActiveSection] = useState('workspace');
  const [loading, setLoading]             = useState(true);
  const [checkingServicos, setCheckingServicos] = useState(true);
  const [hasServicos, setHasServicos]     = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  const supplierId = userData?.supplierId || userData?.id;
  const userId     = userData?.id;
  const userName   = userData?.name || userData?.email?.split('@')[0] || 'Fornecedor';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // ── verifica se já tem serviços cadastrados ───────────────────────────────
  useEffect(() => {
    if (!supplierId) { setCheckingServicos(false); return; }
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'supplierServices'), where('supplierId', '==', supplierId)));
        setHasServicos(snap.docs.length > 0);
      } catch (e) { console.error(e); }
      finally { setCheckingServicos(false); }
    })();
  }, [supplierId]);

  // ── busca jobs do fornecedor ──────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(
      query(collection(db, 'supplierJobs'), where('supplierId', '==', userId)),
      snap => {
        setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userId]);

  const jobsByStage = (stageId) => jobs.filter(j => (j.stage || 'proposta') === stageId);

  // ── loading inicial ───────────────────────────────────────────────────────
  if (checkingServicos) return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ color: '#7BAFD4', fontSize: 14 }}>Carregando...</div>
    </div>
  );

  // ── ONBOARDING — fornecedor sem serviços ──────────────────────────────────
  if (!hasServicos && !onboardingDone) {
    return (
      <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', fontFamily: 'Outfit, sans-serif' }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

        {/* Sidebar simplificada */}
        <aside style={{ width: 220, background: 'rgba(10,22,38,0.95)', borderRight: '1px solid rgba(0,180,255,0.08)', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 10 }}>
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(0,180,255,0.08)', fontSize: 18, fontWeight: 300, color: '#E8F4FF', letterSpacing: 3 }}>
            realize<span style={{ color: '#00E5C4', fontWeight: 500 }}>hub</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ padding: 16, borderTop: '1px solid rgba(0,180,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,229,196,0.15)', border: '1.5px solid rgba(0,229,196,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#00E5C4', fontWeight: 600 }}>{userInitials}</div>
              <div>
                <div style={{ fontSize: 13, color: '#E8F4FF', fontWeight: 400 }}>{userName.split(' ')[0]}</div>
                <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)' }}>Fornecedor</div>
              </div>
            </div>
            <button onClick={onLogout} style={{ width: '100%', padding: 9, background: 'none', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, color: 'rgba(231,76,60,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Sair</button>
          </div>
        </aside>

        {/* Conteúdo de onboarding */}
        <main style={{ marginLeft: 220, flex: 1, padding: '40px 40px 40px' }}>

          {/* Banner de boas-vindas */}
          <div style={{ background: 'linear-gradient(135deg, rgba(0,229,196,0.08), rgba(0,128,255,0.08))', border: '1px solid rgba(0,229,196,0.2)', borderRadius: 16, padding: '28px 32px', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>👋</div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 22, fontWeight: 500, color: '#E8F4FF', marginBottom: 6 }}>
                Bem-vindo, {userName.split(' ')[0]}!
              </h1>
              <p style={{ fontSize: 14, color: '#7BAFD4', lineHeight: 1.6 }}>
                Sua conta foi homologada com sucesso. Antes de acessar o workspace, cadastre os serviços que você oferece — assim conseguimos enviar propostas certinhas para você.
              </p>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'rgba(0,229,196,0.6)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Etapa</div>
              <div style={{ fontSize: 28, fontWeight: 300, color: '#00E5C4' }}>1 / 1</div>
            </div>
          </div>

          {/* Componente de serviços */}
          <FornecedorServicos
            userData={userData}
            onServicosAdicionados={() => {
              setHasServicos(true);
              setOnboardingDone(true);
            }}
          />

          {/* Botão para pular (caso queira entrar sem cadastrar) */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button onClick={() => setOnboardingDone(true)}
              style={{ background: 'none', border: 'none', color: 'rgba(123,175,212,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textDecoration: 'underline' }}>
              Pular por agora e cadastrar depois em "Meus Serviços"
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── WORKSPACE NORMAL ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', fontFamily: 'Outfit, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .fn-sidebar { width: 220px; background: rgba(10,22,38,0.95); border-right: 1px solid rgba(0,180,255,0.08); display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 10; }
        .fn-logo { padding: 24px 20px 20px; border-bottom: 1px solid rgba(0,180,255,0.08); font-size: 18px; font-weight: 300; color: #E8F4FF; letter-spacing: 3px; }
        .fn-logo span { color: #00E5C4; font-weight: 500; }
        .fn-nav { flex: 1; padding: 16px 10px; display: flex; flex-direction: column; gap: 2px; }
        .fn-nav-item { background: none; border: none; color: #7BAFD4; padding: 10px 14px; text-align: left; font-size: 13px; font-weight: 300; cursor: pointer; border-radius: 8px; width: 100%; font-family: 'Outfit', sans-serif; transition: all 0.15s; }
        .fn-nav-item:hover { background: rgba(0,229,196,0.06); color: #E8F4FF; }
        .fn-nav-item.active { background: rgba(0,229,196,0.1); color: #00E5C4; }
        .fn-footer { padding: 16px; border-top: 1px solid rgba(0,180,255,0.08); }
        .fn-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(0,229,196,0.15); border: 1.5px solid rgba(0,229,196,0.4); display: flex; align-items: center; justify-content: center; font-size: 12px; color: #00E5C4; font-weight: 600; }
        .fn-main { margin-left: 220px; flex: 1; padding: 28px 32px; }
        .fn-kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 24px; }
        .fn-col { background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(0,180,255,0.08); overflow: hidden; }
        .fn-col-header { padding: 14px 16px; border-bottom: 1px solid rgba(0,180,255,0.08); display: flex; justify-content: space-between; align-items: center; }
        .fn-col-title { font-size: 12px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; }
        .fn-col-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
        .fn-col-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; min-height: 200px; }
        .fn-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(0,180,255,0.1); border-radius: 10px; padding: 14px; cursor: pointer; transition: all 0.15s; }
        .fn-card:hover { background: rgba(0,229,196,0.05); border-color: rgba(0,229,196,0.2); }
        .fn-card-name { font-size: 13px; font-weight: 500; color: #E8F4FF; margin-bottom: 4px; }
        .fn-card-service { font-size: 11px; color: #00E5C4; margin-bottom: 4px; }
        .fn-card-client { font-size: 11px; color: #7BAFD4; margin-bottom: 8px; }
        .fn-card-date { font-size: 10px; color: rgba(123,175,212,0.5); }
        .fn-empty { font-size: 12px; color: rgba(123,175,212,0.3); text-align: center; padding: 20px; }
      `}</style>

      {/* Sidebar */}
      <aside className="fn-sidebar">
        <div className="fn-logo">realize<span>hub</span></div>
        <nav className="fn-nav">
          <button className={`fn-nav-item ${activeSection === 'workspace' ? 'active' : ''}`} onClick={() => setActiveSection('workspace')}>Workspace</button>
          <button className={`fn-nav-item ${activeSection === 'servicos' ? 'active' : ''}`} onClick={() => setActiveSection('servicos')}>
            Meus Servicos
            {!hasServicos && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: 'rgba(255,167,38,0.2)', color: '#FFA726' }}>!</span>}
          </button>
          <button className={`fn-nav-item ${activeSection === 'projetos' ? 'active' : ''}`} onClick={() => setActiveSection('projetos')}>Meus Projetos</button>
          <button className={`fn-nav-item ${activeSection === 'agenda' ? 'active' : ''}`} onClick={() => setActiveSection('agenda')}>Agenda</button>
        </nav>
        <div className="fn-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div className="fn-avatar">{userInitials}</div>
            <div>
              <div style={{ fontSize: 13, color: '#E8F4FF', fontWeight: 400 }}>{userName.split(' ')[0]}</div>
              <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)' }}>Fornecedor</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ width: '100%', padding: 9, background: 'none', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, color: 'rgba(231,76,60,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Sair</button>
        </div>
      </aside>

      {/* Main */}
      <main className="fn-main">
        {activeSection === 'workspace' && (
          <>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 300, color: '#E8F4FF', letterSpacing: -0.3 }}>Workspace</h1>
              <p style={{ fontSize: 13, color: '#7BAFD4', marginTop: 4 }}>Seus jobs e propostas</p>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#7BAFD4', fontSize: 14 }}>Carregando...</div>
            ) : jobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 80, color: 'rgba(123,175,212,0.4)' }}>
                <div style={{ fontSize: 14, marginBottom: 8 }}>Nenhum job ainda</div>
                <div style={{ fontSize: 12 }}>Voce recebera propostas aqui quando for selecionado para um evento</div>
              </div>
            ) : (
              <div className="fn-kanban">
                {STAGES.map(stage => {
                  const cards = jobsByStage(stage.id);
                  return (
                    <div key={stage.id} className="fn-col">
                      <div className="fn-col-header">
                        <span className="fn-col-title" style={{ color: stage.color }}>{stage.label}</span>
                        <span className="fn-col-badge" style={{ background: `${stage.color}18`, color: stage.color }}>{cards.length}</span>
                      </div>
                      <div className="fn-col-body">
                        {cards.length === 0 ? (
                          <div className="fn-empty">Nenhum job</div>
                        ) : cards.map(job => (
                          <div key={job.id} className="fn-card" onClick={() => window.location.href = `/projeto/${job.budgetId}`}>
                            <div className="fn-card-name">{job.eventName || 'Evento'}</div>
                            {job.serviceName && <div className="fn-card-service">{job.serviceName}</div>}
                            <div className="fn-card-client">{job.clientName || ''}</div>
                            {job.eventDate && <div className="fn-card-date">{job.eventDate}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeSection === 'servicos' && (
          <FornecedorServicos
            userData={userData}
            onServicosAdicionados={() => setHasServicos(true)}
          />
        )}

        {activeSection === 'projetos' && (
          <div style={{ color: '#7BAFD4', fontSize: 14, paddingTop: 40, textAlign: 'center' }}>
            Seus projetos em breve
          </div>
        )}

        {activeSection === 'agenda' && (
          <div style={{ color: '#7BAFD4', fontSize: 14, paddingTop: 40, textAlign: 'center' }}>
            Agenda em breve
          </div>
        )}
      </main>
    </div>
  );
}
