import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import FornecedorServicos from './FornecedorServicos';
import ChatWidget from './ChatWidget';

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

  const [myTasks, setMyTasks] = useState([]);
  const [budgetsMap, setBudgetsMap] = useState({});
  const [budgetsFin, setBudgetsFin] = useState({}); // dados financeiros completos por budgetId
  const [calMes, setCalMes]   = useState(new Date().getMonth());
  const [calAno, setCalAno]   = useState(new Date().getFullYear());

  const supplierId = userData?.supplierId || userData?.id;
  const userId     = userData?.id;
  const userName   = userData?.name || userData?.email?.split('@')[0] || 'Fornecedor';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // ── busca tasks do fornecedor ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('supplierId', '==', userId)),
      snap => setMyTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [userId]);

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
      query(collection(db, 'supplierJobs'), where('supplierId', '==', userId), where('status', '!=', 'draft')),
      async snap => {
        const jobsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setJobs(jobsList);
        setLoading(false);

        // Busca formaPagamento dos budgets únicos
        const budgetIds = [...new Set(jobsList.map(j => j.budgetId).filter(Boolean))];
        const map = {};
        await Promise.all(budgetIds.map(async bid => {
          try {
            const snap = await getDoc(doc(db, 'budgets', bid));
            if (snap.exists()) {
              const bdata = snap.data();
              map[bid] = {
                formaPagamento: bdata?.financeiro?.formaPagamento || '',
                workspaceStage: bdata?.workspaceStage || 'Propostas',
              };
              setBudgetsFin(prev => ({ ...prev, [bid]: bdata }));
            }
          } catch (e) { /* silencioso */ }
        }));
        setBudgetsMap(map);
      }
    );
    return () => unsub();
  }, [userId]);
  
   // ── escuta mudanças nos budgets em tempo real ─────────────────────────────
  useEffect(() => {
    if (!jobs.length) return;
    const budgetIds = [...new Set(jobs.map(j => j.budgetId).filter(Boolean))];
    const unsubs = budgetIds.map(bid =>
      onSnapshot(doc(db, 'budgets', bid), snap => {
        if (!snap.exists()) return;
        const bdata = snap.data();
        setBudgetsMap(prev => ({
          ...prev,
          [bid]: {
            formaPagamento: bdata?.financeiro?.formaPagamento || '',
            workspaceStage: bdata?.workspaceStage || 'Propostas',
          },
        }));
      })
    );
    return () => unsubs.forEach(u => u());
  }, [jobs]);

  // Agrupa jobs por budgetId — 1 card por evento
  const jobsAgrupados = jobs.reduce((acc, job) => {
    const bid = job.budgetId;
    if (!acc[bid]) {
      acc[bid] = {
        budgetId: bid,
        eventName: job.eventName,
        clientName: job.clientName,
        eventDate: job.eventDate,
        numeroPedido: job.numeroPedido || '',
        stage: job.stage || 'proposta', // será sobrescrito abaixo pelo workspaceStage
        status: job.status,
        serviceNames: [],
        jobs: [],
      };
    }
    acc[bid].jobs.push(job);
    if (job.serviceName) acc[bid].serviceNames.push(job.serviceName);
    // Se qualquer job estiver confirmado, considera o status do grupo
    if (job.status === 'confirmed') acc[bid].status = 'confirmed';
    return acc;
  }, {});
  const stageMap = { Propostas: 'proposta', Aguardando: 'aguardando', Acontecendo: 'acontecendo', Concluido: 'concluido', Finalizado: 'concluido' };
  const jobsAgrupadosList = Object.values(jobsAgrupados).map(grupo => ({
    ...grupo,
    stage: stageMap[budgetsMap[grupo.budgetId]?.workspaceStage] || grupo.stage,
  }));
  const jobsByStage = (stageId) => jobsAgrupadosList.filter(j => (j.stage || 'proposta') === stageId);

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
          <button className={`fn-nav-item ${activeSection === 'financeiro' ? 'active' : ''}`} onClick={() => setActiveSection('financeiro')}>Financeiro</button>
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
        {/* Header de boas-vindas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid rgba(0,180,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#E8F4FF' }}>{userName}</div>
          {userData?.roleName && <><span style={{ color: 'rgba(123,175,212,0.3)' }}>·</span><span style={{ fontSize: 13, color: '#7BAFD4' }}>{userData.roleName}</span></>}
          {userData?.companyName && <><span style={{ color: 'rgba(123,175,212,0.3)' }}>·</span><span style={{ fontSize: 12, color: 'rgba(123,175,212,0.5)' }}>{userData.companyName}</span></>}
        </div>

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
                        ) : cards.map(grupo => (
                          <div key={grupo.budgetId} className="fn-card" onClick={() => window.location.href = `/projeto/${grupo.budgetId}`}>
                            <div className="fn-card-name">{grupo.eventName || 'Evento'}</div>
                            <div className="fn-card-client">{grupo.clientName || ''}</div>
                            {grupo.numeroPedido && (
                              <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(123,175,212,0.12)', color: '#7BAFD4', display: 'inline-block', marginBottom: 4 }}>{grupo.numeroPedido}</div>
                            )}
                            {grupo.serviceNames.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                                {grupo.serviceNames.map((s, i) => (
                                  <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(0,229,196,0.08)', color: '#00E5C4' }}>{s}</span>
                                ))}
                              </div>
                            )}
                            {stage.id === 'proposta' && budgetsMap[grupo.budgetId]?.formaPagamento && (
                              <div style={{ marginTop: 6, fontSize: 10, color: '#FFA726', background: 'rgba(255,167,38,0.08)', border: '1px solid rgba(255,167,38,0.2)', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                                {budgetsMap[grupo.budgetId].formaPagamento === '50_50' && 'Pagamento: 50% entrada + 50% final'}
                                {budgetsMap[grupo.budgetId].formaPagamento === '30_60_90' && 'Pagamento: 30, 60 e 90 dias'}
                                {budgetsMap[grupo.budgetId].formaPagamento === 'a_vista' && 'Pagamento: À vista'}
                              </div>
                            )}
                            {grupo.eventDate && <div className="fn-card-date" style={{ marginTop: 6 }}>{grupo.eventDate}</div>}
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

        {activeSection === 'agenda' && (() => {
          const hoje = new Date(); hoje.setHours(0,0,0,0);
          const primeiroDia = new Date(calAno, calMes, 1);
          const ultimoDia   = new Date(calAno, calMes + 1, 0);
          const diasNoMes   = ultimoDia.getDate();
          const iniciaSemana = primeiroDia.getDay(); // 0=dom

          const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
          const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

          // Gera eventos para cada task com datas de preparo, montagem e execução
          const eventos = [];
          myTasks.forEach(task => {
            if (!task.dataInicio && !task.dataEntrega) return;
            const toDate = s => { if (!s) return null; const [y,m,d] = s.split('-'); return new Date(y, m-1, d); };
            const deDate = toDate(task.dataEntrega);
            const diDate = toDate(task.dataInicio);

            // Fase execução/evento — toda a duração da task
            if (diDate && deDate) {
              for (let d = new Date(diDate); d <= deDate; d.setDate(d.getDate() + 1)) {
                eventos.push({ data: new Date(d), task, fase: 'execucao', cor: '#00E5C4' });
              }
            }

            // Fase preparo — antes do início
            if (diDate && task.diasPreparo > 0) {
              const inicio = new Date(diDate);
              inicio.setDate(inicio.getDate() - task.diasPreparo - (task.diasMontagem || 0));
              const fim = new Date(diDate);
              fim.setDate(fim.getDate() - (task.diasMontagem || 0) - 1);
              for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
                eventos.push({ data: new Date(d), task, fase: 'preparo', cor: '#7BAFD4' });
              }
            }

            // Fase montagem — entre preparo e início
            if (diDate && task.diasMontagem > 0) {
              const inicio = new Date(diDate);
              inicio.setDate(inicio.getDate() - task.diasMontagem);
              const fim = new Date(diDate);
              fim.setDate(fim.getDate() - 1);
              for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
                eventos.push({ data: new Date(d), task, fase: 'montagem', cor: '#FFA726' });
              }
            }
          });

          const getEventosDoDia = (dia) => {
            const target = new Date(calAno, calMes, dia);
            return eventos.filter(e =>
              e.data.getFullYear() === target.getFullYear() &&
              e.data.getMonth() === target.getMonth() &&
              e.data.getDate() === target.getDate()
            );
          };

          const prevMes = () => {
            if (calMes === 0) { setCalMes(11); setCalAno(y => y - 1); }
            else setCalMes(m => m - 1);
          };
          const nextMes = () => {
            if (calMes === 11) { setCalMes(0); setCalAno(y => y + 1); }
            else setCalMes(m => m + 1);
          };

          return (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 300, color: '#E8F4FF', letterSpacing: -0.3, marginBottom: 4 }}>Agenda</h1>

              {/* Legenda */}
              <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
                {[['#7BAFD4', 'Preparo'], ['#FFA726', 'Montagem'], ['#00E5C4', 'Execução/Evento']].map(([cor, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />
                    <span style={{ fontSize: 11, color: '#7BAFD4' }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Header do calendário */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <button onClick={prevMes} style={{ background: 'none', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 8, color: '#7BAFD4', padding: '6px 14px', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 16 }}>‹</button>
                <div style={{ fontSize: 18, fontWeight: 500, color: '#E8F4FF' }}>{MESES[calMes]} {calAno}</div>
                <button onClick={nextMes} style={{ background: 'none', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 8, color: '#7BAFD4', padding: '6px 14px', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 16 }}>›</button>
              </div>

              {/* Grid do calendário */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,180,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                {/* Cabeçalho dias da semana */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(0,180,255,0.08)' }}>
                  {DIAS_SEMANA.map(d => (
                    <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'rgba(123,175,212,0.5)', letterSpacing: 0.5 }}>{d}</div>
                  ))}
                </div>

                {/* Células dos dias */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {/* Células vazias antes do primeiro dia */}
                  {Array.from({ length: iniciaSemana }).map((_, i) => (
                    <div key={`empty-${i}`} style={{ minHeight: 80, borderRight: '1px solid rgba(0,180,255,0.05)', borderBottom: '1px solid rgba(0,180,255,0.05)' }} />
                  ))}

                  {/* Dias do mês */}
                  {Array.from({ length: diasNoMes }).map((_, i) => {
                    const dia = i + 1;
                    const isHoje = hoje.getDate() === dia && hoje.getMonth() === calMes && hoje.getFullYear() === calAno;
                    const evsDia = getEventosDoDia(dia);
                    const col = (iniciaSemana + i) % 7;
                    const isBorderRight = col < 6;

                    return (
                      <div key={dia} style={{ minHeight: 80, borderRight: isBorderRight ? '1px solid rgba(0,180,255,0.05)' : 'none', borderBottom: '1px solid rgba(0,180,255,0.05)', padding: 6, background: isHoje ? 'rgba(0,229,196,0.04)' : 'none' }}>
                        <div style={{ fontSize: 12, fontWeight: isHoje ? 700 : 400, color: isHoje ? '#00E5C4' : 'rgba(123,175,212,0.6)', marginBottom: 4, width: 22, height: 22, borderRadius: '50%', background: isHoje ? 'rgba(0,229,196,0.15)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {dia}
                        </div>
                        {/* Eventos do dia — agrupados por task+fase */}
                        {(() => {
                          const vistos = new Set();
                          return evsDia.filter(e => {
                            const key = `${e.task.id}-${e.fase}`;
                            if (vistos.has(key)) return false;
                            vistos.add(key);
                            return true;
                          }).slice(0, 3).map((ev, ei) => (
                            <div key={ei} onClick={() => window.location.href = `/projeto/${ev.task.budgetId}`}
                              style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: `${ev.cor}22`, border: `1px solid ${ev.cor}44`, color: ev.cor, marginBottom: 2, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                              {ev.fase === 'preparo' ? '▶' : ev.fase === 'montagem' ? '◆' : '●'} {ev.task.nome || ev.task.serviceName}
                            </div>
                          ));
                        })()}
                        {evsDia.length > 3 && <div style={{ fontSize: 9, color: 'rgba(123,175,212,0.4)', paddingLeft: 2 }}>+{evsDia.length - 3}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lista de tasks do mês */}
              {myTasks.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                    Tarefas em {MESES[calMes]}
                  </div>
                  {myTasks
                    .filter(task => {
                      if (!task.dataInicio && !task.dataEntrega) return false;
                      const toDate = s => { if (!s) return null; const [y,m,d] = s.split('-'); return new Date(y, m-1, d); };
                      const di = toDate(task.dataInicio);
                      const de = toDate(task.dataEntrega);
                      const inicio = di ? new Date(di) : null;
                      if (inicio && task.diasPreparo) inicio.setDate(inicio.getDate() - task.diasPreparo - (task.diasMontagem || 0));
                      return (inicio && inicio.getMonth() === calMes && inicio.getFullYear() === calAno) ||
                             (de && de.getMonth() === calMes && de.getFullYear() === calAno);
                    })
                    .sort((a, b) => (a.dataInicio || '') < (b.dataInicio || '') ? -1 : 1)
                    .map(task => {
                      const STATUS_COR = { pendente: '#f59e0b', em_andamento: '#0080FF', concluido: '#10b981', ajuste: '#ef4444', aguardando_aprovacao_execucao: '#FFA726' };
                      const cor = STATUS_COR[task.status] || '#7BAFD4';
                      return (
                        <div key={task.id} onClick={() => window.location.href = `/projeto/${task.budgetId}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.08)', marginBottom: 8, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'all 0.15s' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#E8F4FF' }}>{task.nome || task.serviceName}</div>
                            <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>
                              {task.dataInicio && <span>{task.dataInicio.split('-').reverse().join('/')}</span>}
                              {task.dataInicio && task.dataEntrega && <span style={{ margin: '0 6px' }}>→</span>}
                              {task.dataEntrega && <span>{task.dataEntrega.split('-').reverse().join('/')}</span>}
                              {task.diasPreparo > 0 && <span style={{ marginLeft: 10, color: '#7BAFD4' }}>{task.diasPreparo}d preparo</span>}
                              {task.diasMontagem > 0 && <span style={{ marginLeft: 6, color: '#FFA726' }}>{task.diasMontagem}d montagem</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: `${cor}15`, color: cor }}>
                            {task.status === 'pendente' ? 'Pendente' : task.status === 'em_andamento' ? 'Em andamento' : task.status === 'concluido' ? '✓ Concluído' : task.status === 'ajuste' ? '⚠ Ajuste' : 'Aguardando'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })()}
      </main>
      {/* Chat flutuante — só visualiza chats existentes, não cria novos */}
      <ChatWidget userData={userData} budgetIds={jobs.map(j => j.budgetId).filter(Boolean)} somenteVisualizar />
    </div>
  );
}
