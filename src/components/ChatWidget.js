import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy, addDoc, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import ChatPanel from './ChatPanel';

export default function ChatWidget({ userData, budgetIds, somenteVisualizar, supplierId: supplierIdProp }) {
  const [open, setOpen]               = useState(false);
  const [chats, setChats]             = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeChat, setActiveChat]   = useState(null);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const prevTotalRef = useRef(0);
  // Define de qual lado este widget esta sendo usado, ja que agora o contador
  // de nao lidas e separado por lado (coordenador x fornecedor).
  const isFornecedorView = !!(supplierIdProp || (somenteVisualizar && userData?.id));
  const campoNaoLidas = isFornecedorView ? 'naoLidasFornecedor' : 'naoLidasCoordenador';

  // Carrega lista de chats em tempo real
  useEffect(() => {
    const sid = supplierIdProp || (somenteVisualizar ? userData?.id : null);
    if (!budgetIds?.length && !sid) return;
    const chatQuery = sid
      ? query(collection(db, 'chats'), where('supplierId', '==', sid))
      : query(collection(db, 'chats'), where('budgetId', 'in', budgetIds.slice(0, 10)));

    const unsub = onSnapshot(chatQuery, snap => {
      const cs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.ultimaMsgAt?.seconds || 0) - (a.ultimaMsgAt?.seconds || 0));
      setChats(cs);
      const total = cs.reduce((acc, c) => acc + Math.max(0, c[campoNaoLidas] || 0), 0);
      // Notificação sonora/visual quando chega mensagem nova e o chat está fechado
      if (total > prevTotalRef.current && !open) {
        document.title = `(${total}) realizehub`;
      } else if (total === 0) {
        document.title = 'realizehub';
      }
      prevTotalRef.current = total;
      setTotalNaoLidas(total);
    });
    return () => unsub();
  }, [budgetIds?.join(','), somenteVisualizar, userData?.id, supplierIdProp, campoNaoLidas]);

  // Reseta título ao abrir
  useEffect(() => {
    if (open) document.title = 'realizehub';
  }, [open]);

  const handleSelectChat = (chat) => {
    setActiveChatId(chat.id);
    setActiveChat(chat);
  };

  const accentColor = activeChat?.tipo === 'cliente' ? '#0080FF' : '#FFA726';

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28,
          width: 52, height: 52, borderRadius: '50%',
          border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)',
          color: 'white', fontSize: 22, cursor: 'pointer',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,229,196,0.35)',
        }}>
        💬
        {totalNaoLidas > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 18, height: 18, borderRadius: '50%',
            background: '#ef4444', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', border: '2px solid #0D1B2A',
          }}>
            {totalNaoLidas > 9 ? '9+' : totalNaoLidas}
          </span>
        )}
      </button>

      {/* Modal estilo WhatsApp */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 28,
          width: 700, height: 500,
          background: 'rgba(10,22,38,0.99)',
          border: '1px solid rgba(0,180,255,0.15)',
          borderRadius: 16, zIndex: 1001,
          boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
          display: 'flex', overflow: 'hidden',
          fontFamily: 'Outfit, sans-serif',
        }}>

          {/* ── Painel esquerdo — lista de conversas ── */}
          <div style={{
            width: 240, flexShrink: 0,
            borderRight: '1px solid rgba(0,180,255,0.1)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Header lista */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid rgba(0,180,255,0.1)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>Mensagens</div>
              <div style={{ fontSize: 10, color: '#7BAFD4', marginTop: 1 }}>{chats.length} conversa{chats.length !== 1 ? 's' : ''}</div>
            </div>

            {/* Lista */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {chats.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'rgba(123,175,212,0.35)', fontSize: 12 }}>
                  Nenhuma conversa ainda
                </div>
              ) : chats.map(c => {
                const cor = c.tipo === 'cliente' ? '#0080FF' : '#FFA726';
                const ativo = c.id === activeChatId;
                return (
                  <div key={c.id} onClick={() => handleSelectChat(c)}
                    style={{
                      padding: '11px 14px',
                      borderBottom: '1px solid rgba(0,180,255,0.06)',
                      cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
                      background: ativo ? 'rgba(0,229,196,0.07)' : 'transparent',
                      borderLeft: ativo ? '3px solid #00E5C4' : '3px solid transparent',
                      transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = 'transparent'; }}>
                    {/* Avatar */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: `${cor}20`, border: `2px solid ${cor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, flexShrink: 0,
                    }}>
                      {c.tipo === 'cliente' ? '👤' : '🏢'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#E8F4FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{c.titulo}</div>
                        {(c[campoNaoLidas] || 0) > 0 && (
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ef4444', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                            {c[campoNaoLidas] > 9 ? '9+' : c[campoNaoLidas]}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: cor, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.subtitulo}</div>
                      {c.ultimaMsg && (
                        <div style={{ fontSize: 10, color: 'rgba(123,175,212,0.45)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ultimaMsg}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Painel direito — conversa ativa ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {activeChatId && activeChat ? (
              <ChatPanel
                chatId={activeChatId}
                title={activeChat.titulo}
                subtitle={activeChat.subtitulo}
                accentColor={accentColor}
                userData={userData}
                tipo={activeChat.tipo}
                onClose={() => setOpen(false)}
              />
            ) : (
              <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(123,175,212,0.3)', gap: 12 }}>
                <button onClick={() => setOpen(false)}
                  style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: '#7BAFD4', fontSize: 18, cursor: 'pointer', lineHeight: 1, zIndex: 2 }}>✕</button>
                <div style={{ fontSize: 36 }}>💬</div>
                <div style={{ fontSize: 13 }}>Selecione uma conversa</div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
