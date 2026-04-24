import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import ClienteChat from './ClienteChat';

const STATUS_CONFIG = {
  analyzing:  { label: 'Em analise',  color: '#FFA726', bg: 'rgba(255,167,38,0.1)' },
  approved:   { label: 'Aprovado',    color: '#00E5C4', bg: 'rgba(0,229,196,0.1)' },
  inProgress: { label: 'Em andamento',color: '#0080FF', bg: 'rgba(0,128,255,0.1)' },
  completed:  { label: 'Concluido',   color: '#66BB6A', bg: 'rgba(102,187,106,0.1)' },
  rejected:   { label: 'Cancelado',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
};

export default function ClienteHome({ userData, onLogout }) {
  const [events, setEvents] = useState([]);
  const [activeSection, setActiveSection] = useState('workspace');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);

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
          <div style={{ background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 500, color: '#E8F4FF', marginBottom: 4 }}>
                  {selectedEvent.eventName || selectedEvent.eventTypeName || 'Evento'}
                </div>
                <div style={{ fontSize: 13, color: '#7BAFD4' }}>{selectedEvent.eventTypeName}</div>
              </div>
              <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Status', (STATUS_CONFIG[selectedEvent.status] || STATUS_CONFIG.analyzing).label],
                ['Codigo', selectedEvent.jobCode],
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

            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'rgba(123,175,212,0.4)' }}>Mais detalhes do evento em breve</p>
            </div>
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
