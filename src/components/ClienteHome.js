import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, addDoc, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import ClienteChat from './ClienteChat';
import ClienteProjetoScreen from './ClienteProjetoScreen';
import SinoNotificacoes from './SinoNotificacoes';

const STATUS_CONFIG = {
  analyzing:       { label: 'Em analise',           color: '#FFA726', bg: 'rgba(255,167,38,0.1)' },
  pendingApproval: { label: 'Orcamento disponivel', color: '#0080FF', bg: 'rgba(0,128,255,0.1)' },
  approved:        { label: 'Aprovado',             color: '#00E5C4', bg: 'rgba(0,229,196,0.1)' },
  inProgress:      { label: 'Em andamento',         color: '#0080FF', bg: 'rgba(0,128,255,0.1)' },
  completed:       { label: 'Concluido',            color: '#66BB6A', bg: 'rgba(102,187,106,0.1)' },
  rejected:        { label: 'Cancelado',            color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
};

export default function ClienteHome({ userData, onLogout, tenant }) {
  const [events, setEvents] = useState([]);
  const [activeSection, setActiveSection] = useState('workspace');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatKey, setChatKey] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [tasksPendentesAprov, setTasksPendentesAprov] = useState([]);
  const [aprovandoTask, setAprovandoTask] = useState(false);

  const userId = userData?.uid || userData?.id;
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

      // Se aprovada e era task de EXECUÇÃO → verifica se todas concluíram para mudar para Acontecendo
      if (aprovado && task.status === 'aguardando_aprovacao_execucao') {
        try {
          const allTasksSnap = await getDocs(
            query(collection(db, 'tasks'), where('budgetId', '==', task.budgetId))
          );
          const allTasks = allTasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const tasksExec = allTasks.filter(t => t.fase === 'execucao');
          const todasExecConcluidas = tasksExec.every(t =>
            t.id === task.id ? true : t.status === 'concluido'
          );
          if (todasExecConcluidas) {
            await updateDoc(doc(db, 'budgets', task.budgetId), {
              workspaceStage: 'Acontecendo',
              status:         'inProgress',
              updatedAt:      serverTimestamp(),
            });
          }
        } catch (e) { console.error('Erro ao verificar Acontecendo:', e); }
      }

      // Se aprovada e era task de ENTREGA → verifica se todas concluíram para fechar o budget
      if (aprovado && task.status === 'aguardando_aprovacao_entrega') {
        try {
          const allTasksSnap = await getDocs(
            query(collection(db, 'tasks'), where('budgetId', '==', task.budgetId))
          );
          const allTasks = allTasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          // Verifica se todas as tasks de entrega estão concluídas (conta a atual como concluída)
          const tasksEntrega = allTasks.filter(t => t.status === 'aguardando_aprovacao_entrega' || (t.aprovacaoEntrega === true && t.fase === 'execucao'));
          const todasConcluidas = tasksEntrega.every(t => t.id === task.id ? true : t.status === 'concluido');

          if (todasConcluidas) {
            // Monta relatório com todos os serviços executados
            const tasksExec = allTasks.filter(t => t.fase === 'execucao' || t.fase === 'preparacao');
            const relatorioItens = tasksExec.map(t => ({
              serviceName:          t.serviceName || '',
              serviceParentName:    t.serviceParentName || '',
              supplierName:         t.supplierName || '',
              fase:                 t.fase || '',
              status:               t.status || '',
              dataInicio:           t.dataInicio || '',
              dataEntrega:          t.dataEntrega || '',
              valor:                t.valor || 0,
              unidade:              t.unidade || '',
              observacaoFornecedor: t.observacaoFornecedor || '',
              aprovacaoObs:         t.aprovacaoObs || '',
            }));

            await updateDoc(doc(db, 'budgets', task.budgetId), {
              status:         'completed',
              workspaceStage: 'Concluido',
              concluidoEm:    serverTimestamp(),
              relatorioFinal: {
                geradoEm:      new Date().toISOString(),
                itens:         relatorioItens,
                totalServicos: relatorioItens.length,
              },
              updatedAt: serverTimestamp(),
            });
          }
        } catch (e) { console.error('Erro ao verificar conclusao do budget:', e); }
      }

      // Se aprovada e era task de PREPARAÇÃO → cria task de EXECUÇÃO
      if (aprovado && task.fase === 'preparacao') {
        await addDoc(collection(db, 'tasks'), {
          budgetId:          task.budgetId,
          supplierJobId:     task.supplierJobId,
          supplierId:        task.supplierId,
          supplierName:      task.supplierName,
          serviceName:       task.serviceName,
          serviceParentName: task.serviceParentName,
          tipoServico:       task.tipoServico,
          nome:              `Execução — ${task.serviceName}`,
          descricao:         task.descricao || '',
          dataInicio:        task.dataInicio || '',
          dataEntrega:       task.dataEntrega || '',
          diasAntes:         task.diasAntes || 0,
          diasPreparo:       task.diasPreparo || 0,
          diasMontagem:      task.diasMontagem || 0,
          diasEvento:        task.diasEvento || 1,
          valor:             task.valor || 0,
          preco:             task.preco || 0,
          unidade:           task.unidade || '',
          fase:              'execucao',
          status:            'pendente',
          cor:               '#00E5C4',
          preAprovacao:      false,
          aprovacaoExecucao: task.aprovacaoExecucao || false,
          taskPreparacaoId:  task.id,
          createdAt:         serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); alert('Erro ao processar aprovação.'); }
    finally { setAprovandoTask(false); }
  };

  // Abre página do projeto ao clicar no card
  if (selectedEvent) {
    return (
      <ClienteProjetoScreen
        budget={selectedEvent}
        userData={userData}
        onBack={() => setSelectedEvent(null)}
      />
    );
  }

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
        {/* Header de boas-vindas */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid rgba(0,180,255,0.08)', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#E8F4FF' }}>{userName}</div>
            {userData?.roleName && <><span style={{ color: 'rgba(123,175,212,0.3)' }}>·</span><span style={{ fontSize: 13, color: '#7BAFD4' }}>{userData.roleName}</span></>}
            {userData?.companyName && <><span style={{ color: 'rgba(123,175,212,0.3)' }}>·</span><span style={{ fontSize: 12, color: 'rgba(123,175,212,0.5)' }}>{userData.companyName}</span></>}
          </div>
          <SinoNotificacoes userId={userId} tema="escuro" />
        </div>

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
                onClick={() => { setChatKey(k => k + 1); setShowChat(true); }}>
                + Novo Evento
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#7BAFD4', fontSize: 14 }}>Carregando...</div>
            ) : events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <div style={{ fontSize: 14, color: 'rgba(123,175,212,0.5)', marginBottom: 20 }}>Voce ainda nao tem eventos</div>
                <button
                  onClick={() => { setChatKey(k => k + 1); setShowChat(true); }}
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



      {/* Modal do Chat com a Bia */}
      {showChat && (
        <ClienteChat
          key={chatKey}
          userData={userData}
          onClose={() => setShowChat(false)}
          tenant={tenant}
        />
      )}
    </div>
  );
}
