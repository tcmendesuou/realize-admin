import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import ChatPanel from './ChatPanel';

export default function ChatWidget({ userData, budgetIds, somenteVisualizar }) {
  const [open, setOpen]           = useState(false);
  const [chats, setChats]         = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeChat, setActiveChat]   = useState(null);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);

  // Carrega lista de chats
  useEffect(() => {
    if (!budgetIds?.length) return;
    // Fornecedor: busca chats pelo supplierId
    const chatQuery = somenteVisualizar
      ? query(collection(db, 'chats'), where('supplierId', '==', userData?.id))
      : query(collection(db, 'chats'), where('budgetId', 'in', budgetIds.slice(0, 10)));
    const unsub = onSnapshot(chatQuery, snap => {
      const cs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChats(cs);
    });
    return () => unsub();
  }, [budgetIds?.join(','), somenteVisualizar, userData?.id]);

  // Conta mensagens não lidas
  useEffect(() => {
    if (!chats.length) { setTotalNaoLidas(0); return; }
    let total = 0;
    const unsubList = chats.map(c => {
      return onSnapshot(
        query(collection(db, 'chats', c.id, 'msgs'), where('read', '==', false), where('senderId', '!=', userData?.id)),
        snap => {
          total = 0;
          chats.forEach(() => {}); // força re-count
          setTotalNaoLidas(prev => {
            // conta todas as não lidas de todos os chats
            return prev; // será atualizado abaixo
          });
        }
      );
    });
    // Abordagem simples: salva naoLidas no próprio documento do chat
    setTotalNaoLidas(chats.reduce((acc, c) => acc + (c.naoLidas || 0), 0));
    return () => unsubList.forEach(u => u());
  }, [chats, userData?.id]);

  const handleOpenChat = (chat) => {
    setActiveChatId(chat.id);
    setActiveChat(chat);
    setOpen(false);
  };

  const handleClosePanel = () => {
    setActiveChatId(null);
    setActiveChat(null);
  };

  const accentColor = activeChat?.tipo === 'cliente' ? '#0080FF' : '#FFA726';

  return (
    <>
      {/* Botão flutuante */}
      <button onClick={() => { setOpen(o => !o); setActiveChatId(null); }}
        style={{ position: 'fixed', bottom: 28, right: 28, width: 52, height: 52, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 22, cursor: 'pointer', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,229,196,0.35)' }}>
        💬
        {totalNaoLidas > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: '#66BB6A', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: '2px solid #0D1B2A' }}>
            {totalNaoLidas > 9 ? '9+' : totalNaoLidas}
          </span>
        )}
      </button>

      {/* Popup lista de chats */}
      {open && (
        <div style={{ position: 'fixed', bottom: 90, right: 28, width: 300, background: 'rgba(10,22,38,0.98)', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 14, zIndex: 1000, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', fontFamily: 'Outfit, sans-serif' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,180,255,0.1)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>Mensagens</div>
            <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>Chats dos seus projetos</div>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {chats.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: 'rgba(123,175,212,0.4)', fontSize: 12 }}>Nenhuma conversa ainda</div>
            ) : chats.map(c => {
              const cor = c.tipo === 'cliente' ? '#0080FF' : '#FFA726';
              return (
                <div key={c.id} onClick={() => handleOpenChat(c)}
                  style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,180,255,0.06)', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${cor}20`, border: `2px solid ${cor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                    {c.tipo === 'cliente' ? '👤' : '🏢'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#E8F4FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.titulo}</div>
                    <div style={{ fontSize: 10, color: cor, marginTop: 1 }}>{c.subtitulo}</div>
                    {c.ultimaMsg && <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ultimaMsg}</div>}
                  </div>
                  {(c.naoLidas || 0) > 0 && (
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#66BB6A', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>{c.naoLidas}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Painel de conversa ativo */}
      {activeChatId && activeChat && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, width: 340, height: 480, background: 'rgba(10,22,38,0.98)', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 14, zIndex: 1001, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Botão voltar para lista */}
          <button onClick={() => { setActiveChatId(null); setActiveChat(null); setOpen(true); }}
            style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#7BAFD4', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', zIndex: 2 }}>
            ← Voltar
          </button>
          <ChatPanel
            chatId={activeChatId}
            title={activeChat.titulo}
            subtitle={activeChat.subtitulo}
            accentColor={accentColor}
            userData={userData}
            onClose={handleClosePanel}
          />
        </div>
      )}
    </>
  );
}
