import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, addDoc, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import ClienteChat from './ClienteChat';

const STATUS_CONFIG = {
  analyzing:       { label: 'Em analise',           color: '#FFA726', bg: 'rgba(255,167,38,0.1)' },
  pendingApproval: { label: 'Orcamento disponivel', color: '#0080FF', bg: 'rgba(0,128,255,0.1)' },
  approved:        { label: 'Aprovado',             color: '#00E5C4', bg: 'rgba(0,229,196,0.1)' },
  inProgress:      { label: 'Em andamento',         color: '#0080FF', bg: 'rgba(0,128,255,0.1)' },
  completed:       { label: 'Concluido',            color: '#66BB6A', bg: 'rgba(102,187,106,0.1)' },
  rejected:        { label: 'Cancelado',            color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
};

export default function ClienteHome({ userData, onLogout }) {
  const [events, setEvents] = useState([]);
  const [activeSection, setActiveSection] = useState('workspace');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [tasksPendentesAprov, setTasksPendentesAprov] = useState([]);
  const [aprovandoTask, setAprovandoTask] = useState(false);

  const userId = userData?.id;
  const userName = userData?.name || userData?.email?.split('@')[0] || 'Cliente';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(
      query(collection(db, 'budgets'), where('clientUserId', '==', userId), where('isMae', '==', true)),
      snap => {
        setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userId]);

    // Busca tasks pendentes de aprovação do cliente
  useEffect(() => {
    if (!userId) return;
    const statusPendentes = ['aguardando_pre_aprovacao', 'aguardando_aprovacao_execucao', 'aguardando_aprovacao_entrega'];
    // Busca budgets do cliente para filtrar tasks
    const budgetIds = events.map(e => e.id);
    if (budgetIds.length === 0) return;
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('budgetId', 'in', budgetIds.slice(0, 10))),
      snap => {
        const pendentes = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => statusPendentes.includes(t.status));
        setTasksPendentesAprov(pendentes);
      }
    );
    return () => unsub();
  }, [userId, events]);

  const handleAprovarTask = async (task, aprovado) => {
    if (!aprovado && !window.confirm('Solicitar ajuste nesta entrega?')) return;
    setAprovandoTask(true);
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: aprovado ? 'concluido' : 'ajuste',
        aprovacaoClienteEm: serverTimestamp(),
        aprovacaoClienteOk: aprovado,
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); alert('Erro ao processar aprovação.'); }
    finally { setAprovandoTask(false); }
  };

  return () => unsub();
  }, [userId]);

  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', fontFamily: 'Outfit, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .cl-sidebar { width: 220px; background: rgba(10,22,38,0.95); border-right: 1px solid rgba(0,180,255,0.08); display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 10; }
        .cl-logo { padding: 24px 20px 20px; border-bottom: 1px solid rgba(0,180,255,0.08); font-size: 18px; font-weight: 300; color: #E8F4FF; letter-spacing: 3px; }
        .cl-logo span { color: #00E5C4; font-weight: 500; }
        .cl-nav { flex: 1; padding: 16px 10px; display: flex; flex-direction: column; gap: 2px; }
        .cl-nav-item { background: none; border: none; color: #7BAFD4; padding: 10px 14px; text-align: left; font-size: 13px; font-weight: 300; cursor: pointer; border-radius: 8px; width: 100%; font-family: 'Outfit', sans-serif; transition: all 0.15s; }
        .cl-nav-item:hover { background: rgba(0,229,196,0.06); color: #E8F4FF; }
        .cl-nav-item.active { background: rgba(0,229,196,0.1); color: #00E5C4; }
        .cl-footer { padding: 16px; border-top: 1px solid rgba(0,180,255,0.08); }
        .cl-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(0,229,196,0.15); border: 1.5px solid rgba(0,229,196,0.4); display: flex; align-items: center; justify-content: center; font-size: 12px; color: #00E5C4; font-weight: 600; }
        .cl-main { margin-left: 220px; flex: 1; padding: 28px 32px; }
        .cl-events-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 24px; }
        .cl-event-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(0,180,255,0.1); border-radius: 14px; padding: 20px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; }
        .cl-event-card:hover { background: rgba(0,229,196,0.04); border-color: rgba(0,229,196,0.25); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .cl-event-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .cl-new-btn { display: flex; align-items: center; gap: 8px; padding: '12px 20px'; border-radius: 10px; border: '1px dashed rgba(0,229,196,0.3)'; background: 'rgba(0,229,196,0.04)'; color: '#00E5C4'; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 14px; transition: all 0.15s; }
      `}</style>

      {/* Sidebar */}
      <aside className="cl-sidebar">
        <div className="cl-logo">realize<span>hub</span></div>
        <nav className="cl-nav">
          <button className={`cl-nav-item ${activeSection === 'workspace' ? 'active' : ''}`} onClick={() => setActiveSection('workspace')}>Workspace</button>
          <button className={`cl-nav-item ${activeSection === 'agenda' ? 'active' : ''}`} onClick={() => setActiveSection('agenda')}>Agenda</button>
        </nav>
        <div className="cl-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div className="cl-avatar">{userInitials}</div>
            <div>
              <div style={{ fontSize: 13, color: '#E8F4FF', fontWeight: 400 }}>{userName.split(' ')[0]}</div>
              <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)' }}>Cliente</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ width: '100%', padding: 9, background: 'none', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, color: 'rgba(231,76,60,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Sair</button>
        </div>
      </aside>

      {/* Main */}
      <main className="cl-main">
        {activeSection === 'workspace' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 300, color: '#E8F4FF', letterSpacing: -0.3 }}>Meus Eventos</h1>
                <p style={{ fontSize: 13, color: '#7BAFD4', marginTop: 4 }}>Acompanhe seus eventos em tempo real</p>
              </div>
              <button
                style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(0,229,196,0.3)', background: 'rgba(0,229,196,0.06)', color: '#00E5C4', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,196,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,229,196,0.06)'}
                onClick={() => setShowChat(true)}>
                + Novo Evento
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#7BAFD4', fontSize: 14 }}>Carregando...</div>
            ) : events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <div style={{ fontSize: 14, color: 'rgba(123,175,212,0.5)', marginBottom: 20 }}>Voce ainda nao tem eventos</div>
                <button
                  onClick={() => setShowChat(true)}
                  style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  Planejar meu primeiro evento
                </button>
              </div>
            ) : (
              <div className="cl-events-grid">
                {events.map(event => {
                  const st = STATUS_CONFIG[event.status] || STATUS_CONFIG.analyzing;
                  return (
                    <div key={event.id} className="cl-event-card" onClick={() => setSelectedEvent(event)}
                      style={{ borderTopColor: st.color }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: st.color, borderRadius: '14px 14px 0 0' }} />

                      {/* Status badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: st.bg, color: st.color, letterSpacing: 0.5 }}>{st.label}</span>
                        {event.jobCode && <span style={{ fontSize: 10, color: 'rgba(123,175,212,0.4)' }}>{event.jobCode}</span>}
                      </div>

                      {/* Nome do evento */}
                      <div style={{ fontSize: 16, fontWeight: 500, color: '#E8F4FF', marginBottom: 6 }}>
                        {event.eventName || event.eventTypeName || 'Meu Evento'}
                      </div>

                      {/* Tipo */}
                      {event.eventTypeName && (
                        <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 12 }}>{event.eventTypeName}</div>
                      )}

                      {/* Datas */}
                      {(event.startDate || event.endDate) && (
                        <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.6)', marginBottom: 12 }}>
                          {event.startDate}{event.endDate && event.endDate !== event.startDate ? ` ate ${event.endDate}` : ''}
                        </div>
                      )}

                      {/* Footer */}
                      <div style={{ paddingTop: 12, borderTop: '1px solid rgba(0,180,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'rgba(123,175,212,0.4)' }}>
                          {event.createdAt?.toDate ? event.createdAt.toDate().toLocaleDateString('pt-BR') : ''}
                        </span>
                        <span style={{ fontSize: 11, color: '#00E5C4' }}>Ver detalhes →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeSection === 'agenda' && (
          <div style={{ color: '#7BAFD4', fontSize: 14, paddingTop: 40, textAlign: 'center' }}>
            Agenda em breve
          </div>
        )}
      </main>

      {/* Modal de detalhe do evento */}
      {selectedEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setSelectedEvent(null)}>
          <div style={{ background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 20, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', padding: 32 }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 500, color: '#E8F4FF', marginBottom: 4 }}>
                  {selectedEvent.eventName || selectedEvent.eventTypeName || 'Evento'}
                </div>
                <div style={{ fontSize: 13, color: '#7BAFD4' }}>{selectedEvent.eventTypeName}</div>
              </div>
              <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Dados básicos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                ['Status', (STATUS_CONFIG[selectedEvent.status] || STATUS_CONFIG.analyzing).label],
                ['Data inicio', selectedEvent.startDate],
                ['Data fim', selectedEvent.endDate],
                ['Local', selectedEvent.location],
                ['Convidados', selectedEvent.guestCount],
              ].filter(([_, v]) => v).map(([label, value]) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(0,180,255,0.08)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(123,175,212,0.5)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ fontSize: 13, color: '#E8F4FF' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* ORÇAMENTO FINAL */}
            {selectedEvent.status === 'pendingApproval' && selectedEvent.orcamentoFinal && (
              <div style={{ background: 'rgba(0,128,255,0.06)', border: '1px solid rgba(0,128,255,0.2)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0080FF', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
                  Orcamento Final
                </div>

                {(selectedEvent.orcamentoFinal.itens || []).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(0,180,255,0.08)' }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#E8F4FF', fontWeight: 500 }}>{item.serviceName}</div>
                      <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>
                        {item.supplierName} · R$ {parseFloat(item.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × {item.diasEvento} dia(s)
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#E8F4FF' }}>
                      R$ {parseFloat(item.subtotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,128,255,0.2)' }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#E8F4FF' }}>Total</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#0080FF' }}>
                    R$ {parseFloat(selectedEvent.orcamentoFinal.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <p style={{ fontSize: 11, color: 'rgba(123,175,212,0.4)', marginTop: 10, lineHeight: 1.5 }}>
                  * Valores de referencia. Taxa de servico e impostos serao adicionados na proposta final.
                </p>

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Recusar este orcamento?')) return;
                      setAprovando(true);
                      try {
                        await updateDoc(doc(db, 'budgets', selectedEvent.id), {
                          status: 'rejected',
                          workspaceStage: 'Propostas',
                          updatedAt: serverTimestamp(),
                          timeline: [...(selectedEvent.timeline || []), { action: 'rejected', description: 'Orcamento recusado pelo cliente', timestamp: new Date() }],
                        });
                        setSelectedEvent(null);
                      } catch (e) { alert('Erro ao recusar.'); }
                      finally { setAprovando(false); }
                    }}
                    disabled={aprovando}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    Recusar
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Aprovar este orcamento? O evento sera confirmado.')) return;
                      setAprovando(true);
                      try {
                        await updateDoc(doc(db, 'budgets', selectedEvent.id), {
                          status: 'approved',
                          workspaceStage: 'Aguardando',
                          approvedAt: serverTimestamp(),
                          updatedAt: serverTimestamp(),
                          timeline: [...(selectedEvent.timeline || []), { action: 'approved', description: 'Orcamento aprovado pelo cliente', timestamp: new Date() }],
                        });
                        // Atualiza stage dos supplierJobs confirmados para aguardando + cria tasks
                        try {
                          const sjSnap = await getDocs(query(collection(db, 'supplierJobs'), where('budgetId', '==', selectedEvent.id), where('status', '==', 'confirmed')));
                          const sjs = sjSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                          const cronograma = selectedEvent.cronograma?.etapas || [];
                          const diasEvento = selectedEvent.briefingData?.evento?.diasDuracao || 1;

                          await Promise.all(sjs.map(async sj => {
                            // Atualiza stage
                            await updateDoc(doc(db, 'supplierJobs', sj.id), { stage: 'aguardando', updatedAt: serverTimestamp() });

                            // Busca etapa do cronograma que bate com o serviço
                            const etapa = cronograma.find(e =>
                              (e.nome||'').toLowerCase().includes((sj.serviceName||'').toLowerCase()) ||
                              (sj.serviceName||'').toLowerCase().includes((e.nome||'').toLowerCase()) ||
                              (e.responsavel||'').toLowerCase().includes((sj.serviceName||'').toLowerCase())
                            );

                            // Cria task
                            await addDoc(collection(db, 'tasks'), {
                              budgetId:     selectedEvent.id,
                              supplierJobId: sj.id,
                              supplierId:   sj.supplierId,
                              supplierName: sj.supplierName || sj.confirmedBy || '',
                              serviceName:  sj.serviceName || '',
                              serviceParentName: sj.serviceParentName || '',
                              tipoServico:  sj.tipoServico || '',
                              nome:         sj.serviceName || '',
                              descricao:    etapa?.descricao || '',
                              dataInicio:   etapa?.dataInicio || etapa?.di || '',
                              dataEntrega:  etapa?.dataEntrega || etapa?.de || '',
                              diasAntes:    etapa?.diasAntes || 0,
                              diasPreparo:  sj.diasPreparo || 0,
                              diasMontagem: sj.diasMontagem || 0,
                              diasEvento,
                              valor:        sj.preco ? parseFloat(sj.preco) * diasEvento : 0,
                              preco:        parseFloat(sj.preco || 0),
                              unidade:      sj.unidade || '',
                              status:       'pendente',
                              observacao:   sj.observacaoFornecedor || '',
                              createdAt:    serverTimestamp(),
                            });
                          }));
                        } catch (e) { console.error('Erro ao criar tasks:', e); }
                        setSelectedEvent(null);
                      } catch (e) { alert('Erro ao aprovar.'); }
                      finally { setAprovando(false); }
                    }}
                    disabled={aprovando}
                    style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: aprovando ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: aprovando ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    {aprovando ? 'Processando...' : '✓ Aprovar Orcamento'}
                  </button>
                </div>
              </div>
            )}

            {selectedEvent.status !== 'pendingApproval' && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'rgba(123,175,212,0.4)' }}>
                  {selectedEvent.status === 'approved' ? '✓ Orcamento aprovado! Em producao.' : 'Aguardando processamento...'}
                </p>
              </div>
            )}

            {/* Tasks pendentes de aprovação */}
            {tasksPendentesAprov.filter(t => t.budgetId === selectedEvent.id).map(task => {
              const TIPO_LABEL = {
                aguardando_pre_aprovacao:       { label: 'Pré-aprovação',         cor: '#7BAFD4' },
                aguardando_aprovacao_execucao:  { label: 'Aprovação de Execução', cor: '#667eea' },
                aguardando_aprovacao_entrega:   { label: 'Aprovação de Entrega',  cor: '#10b981' },
              };
              const tipoInfo = TIPO_LABEL[task.status] || { label: 'Aprovação', cor: '#FFA726' };
              return (
                <div key={task.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${tipoInfo.cor}33`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: tipoInfo.cor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{tipoInfo.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#E8F4FF' }}>{task.nome || task.serviceName}</div>
                      {task.supplierName && <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>{task.supplierName}</div>}
                    </div>
                    <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: `${tipoInfo.cor}22`, color: tipoInfo.cor, fontWeight: 600, flexShrink: 0 }}>Aguardando sua aprovação</span>
                  </div>
                  {task.aprovacaoObs && (
                    <div style={{ fontSize: 12, color: '#7BAFD4', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                      {task.aprovacaoObs}
                    </div>
                  )}
                  {task.aprovacaoArquivos?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {task.aprovacaoArquivos.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, color: '#00E5C4', textDecoration: 'none', background: 'rgba(0,229,196,0.08)', border: '1px solid rgba(0,229,196,0.2)', padding: '5px 12px', borderRadius: 8 }}>
                          📎 {f.nome}
                        </a>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleAprovarTask(task, false)} disabled={aprovandoTask}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      Solicitar Ajuste
                    </button>
                    <button onClick={() => handleAprovarTask(task, true)} disabled={aprovandoTask}
                      style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: aprovandoTask ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg,${tipoInfo.cor},#0080FF)`, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      {aprovandoTask ? 'Processando...' : '✓ Aprovar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal do Chat com a Bia */}
      {showChat && (
        <ClienteChat
          userData={userData}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}
