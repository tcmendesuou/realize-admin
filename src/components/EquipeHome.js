import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

const STAGES = [
  { id: 'proposta',   label: 'Propostas',   color: '#7BAFD4' },
  { id: 'aguardando', label: 'Aguardando',  color: '#FFA726' },
  { id: 'acontecendo',label: 'Acontecendo', color: '#00E5C4' },
  { id: 'concluido',  label: 'Concluido',   color: '#66BB6A' },
];

export default function EquipeHome({ userData, onLogout }) {
  const [jobs, setJobs] = useState([]);
  const [activeSection, setActiveSection] = useState('workspace');
  const [loading, setLoading] = useState(true);

  const userId = userData?.id;
  const userName = userData?.name || userData?.email?.split('@')[0] || 'Equipe';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(
      query(collection(db, 'budgets'), where('assignedTo', '==', userId)),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('JOBS ENCONTRADOS:', all.length, all);
        setJobs(all);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userId]);

  const jobsByStage = (stageId) => jobs.filter(j => (j.workspaceStage || 'Proposta') === stageId);

  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', fontFamily: 'Outfit, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .eq-sidebar { width: 220px; background: rgba(10,22,38,0.95); border-right: 1px solid rgba(0,180,255,0.08); display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 10; }
        .eq-logo { padding: 24px 20px 20px; border-bottom: 1px solid rgba(0,180,255,0.08); font-size: 18px; font-weight: 300; color: #E8F4FF; letter-spacing: 3px; }
        .eq-logo span { color: #00E5C4; font-weight: 500; }
        .eq-nav { flex: 1; padding: 16px 10px; display: flex; flex-direction: column; gap: 2px; }
        .eq-nav-item { background: none; border: none; color: #7BAFD4; padding: 10px 14px; text-align: left; font-size: 13px; font-weight: 300; cursor: pointer; border-radius: 8px; width: 100%; font-family: 'Outfit', sans-serif; transition: all 0.15s; }
        .eq-nav-item:hover { background: rgba(0,229,196,0.06); color: #E8F4FF; }
        .eq-nav-item.active { background: rgba(0,229,196,0.1); color: #00E5C4; }
        .eq-footer { padding: 16px; border-top: 1px solid rgba(0,180,255,0.08); }
        .eq-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(0,229,196,0.15); border: 1.5px solid rgba(0,229,196,0.4); display: flex; align-items: center; justify-content: center; font-size: 12px; color: #00E5C4; font-weight: 600; }
        .eq-main { margin-left: 220px; flex: 1; padding: 28px 32px; }
        .eq-kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 24px; }
        .eq-col { background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(0,180,255,0.08); overflow: hidden; }
        .eq-col-header { padding: 14px 16px; border-bottom: 1px solid rgba(0,180,255,0.08); display: flex; justify-content: space-between; align-items: center; }
        .eq-col-title { font-size: 12px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; }
        .eq-col-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
        .eq-col-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; min-height: 200px; }
        .eq-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(0,180,255,0.1); border-radius: 10px; padding: 14px; cursor: pointer; transition: all 0.15s; }
        .eq-card:hover { background: rgba(0,229,196,0.05); border-color: rgba(0,229,196,0.2); }
        .eq-card-name { font-size: 13px; font-weight: 500; color: #E8F4FF; margin-bottom: 4px; }
        .eq-card-client { font-size: 11px; color: #7BAFD4; margin-bottom: 8px; }
        .eq-card-meta { display: flex; gap: 6px; flex-wrap: wrap; }
        .eq-tag { font-size: 10px; padding: 2px 8px; border-radius: 8px; background: rgba(0,229,196,0.08); color: #00E5C4; }
        .eq-empty { font-size: 12px; color: rgba(123,175,212,0.3); text-align: center; padding: 20px; }
      `}</style>

      {/* Sidebar */}
      <aside className="eq-sidebar">
        <div className="eq-logo">realize<span>hub</span></div>
        <nav className="eq-nav">
          <button className={`eq-nav-item ${activeSection === 'workspace' ? 'active' : ''}`} onClick={() => setActiveSection('workspace')}>Workspace</button>
          <button className={`eq-nav-item ${activeSection === 'projetos' ? 'active' : ''}`} onClick={() => setActiveSection('projetos')}>Projetos</button>
          <button className={`eq-nav-item ${activeSection === 'agenda' ? 'active' : ''}`} onClick={() => setActiveSection('agenda')}>Agenda</button>
        </nav>
        <div className="eq-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div className="eq-avatar">{userInitials}</div>
            <div>
              <div style={{ fontSize: 13, color: '#E8F4FF', fontWeight: 400 }}>{userName.split(' ')[0]}</div>
              <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)' }}>Equipe</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ width: '100%', padding: 9, background: 'none', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, color: 'rgba(231,76,60,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Sair</button>
        </div>
      </aside>

      {/* Main */}
      <main className="eq-main">
        {activeSection === 'workspace' && (
          <>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 300, color: '#E8F4FF', letterSpacing: -0.3 }}>Workspace</h1>
              <p style={{ fontSize: 13, color: '#7BAFD4', marginTop: 4 }}>Acompanhe todos os jobs em andamento</p>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#7BAFD4', fontSize: 14 }}>Carregando...</div>
            ) : (
              <div className="eq-kanban">
                {STAGES.map(stage => {
                  const cards = jobsByStage(stage.id);
                  return (
                    <div key={stage.id} className="eq-col">
                      <div className="eq-col-header">
                        <span className="eq-col-title" style={{ color: stage.color }}>{stage.label}</span>
                        <span className="eq-col-badge" style={{ background: `${stage.color}18`, color: stage.color }}>{cards.length}</span>
                      </div>
                      <div className="eq-col-body">
                        {cards.length === 0 ? (
                          <div className="eq-empty">Nenhum job</div>
                        ) : cards.map(job => (
                          <div key={job.id} className="eq-card" onClick={() => window.location.href = `/projeto/${job.id}`}>
                            <div className="eq-card-name">{job.eventName || job.eventTypeName || 'Sem nome'}</div>
                            <div className="eq-card-client">{job.companyName || job.clientName || ''}</div>
                            <div className="eq-card-meta">
                              {job.jobCode && <span className="eq-tag">{job.jobCode}</span>}
                              {job.eventTypeName && <span className="eq-tag">{job.eventTypeName}</span>}
                            </div>
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

        {activeSection === 'projetos' && (
          <div style={{ color: '#7BAFD4', fontSize: 14, paddingTop: 40, textAlign: 'center' }}>
            Lista de projetos em breve
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
