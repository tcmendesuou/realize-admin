import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function ChatPanel({ chatId, title, subtitle, accentColor, userData, onClose }) {
  const [msgs, setMsgs]   = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const prevMsgCount = useRef(0);

  useEffect(() => {
    if (!chatId) return;

    // Zera naoLidas quando abre o chat
    updateDoc(doc(db, 'chats', chatId), { naoLidas: 0 }).catch(() => {});

    const unsub = onSnapshot(
      query(collection(db, 'chats', chatId, 'msgs'), orderBy('createdAt', 'asc')),
      snap => {
        const ms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Incrementa naoLidas para mensagens novas de outros usuários
        const novasMsgs = snap.docChanges().filter(change => 
          change.type === 'added' && 
          change.doc.data().senderId !== userData?.id &&
          !change.doc.data().read
        );
        if (novasMsgs.length > 0 && prevMsgCount.current > 0) {
          // Só incrementa se o chat não está aberto (se está aberto, marca como lida)
          novasMsgs.forEach(change => {
            updateDoc(doc(db, 'chats', chatId, 'msgs', change.doc.id), { read: true }).catch(() => {});
          });
        }
        prevMsgCount.current = ms.length;

        setMsgs(ms);

        // Marca todas não lidas como lidas
        snap.docs.forEach(d => {
          if (!d.data().read && d.data().senderId !== userData?.id) {
            updateDoc(doc(db, 'chats', chatId, 'msgs', d.id), { read: true }).catch(() => {});
          }
        });
        // Zera contador
        updateDoc(doc(db, 'chats', chatId), { naoLidas: 0 }).catch(() => {});
      }
    );
    return () => unsub();
  }, [chatId, userData?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      await addDoc(collection(db, 'chats', chatId, 'msgs'), {
        text,
        senderId:   userData?.id,
        senderName: userData?.name || 'Usuário',
        senderRole: userData?.systemRole || 'workspace',
        createdAt:  serverTimestamp(),
        read:       false,
      });
      // Incrementa naoLidas no documento do chat
      await updateDoc(doc(db, 'chats', chatId), {
        naoLidas:  increment(1),
        ultimaMsg: text.slice(0, 60),
      });
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  const formatTime = (ts) => {
    if (!ts?.toDate) return '';
    return ts.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Outfit, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: `3px solid ${accentColor}`, background: 'rgba(10,22,38,0.98)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: accentColor, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      {/* Mensagens */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: '#0D1B2A' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(123,175,212,0.4)', fontSize: 12, marginTop: 40 }}>
            Nenhuma mensagem ainda.<br />Inicie a conversa!
          </div>
        )}
        {msgs.map(m => {
          const isMine = m.senderId === userData?.id;
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
              {!isMine && <div style={{ fontSize: 10, color: accentColor, marginBottom: 2, fontWeight: 600 }}>{m.senderName}</div>}
              <div style={{ maxWidth: '78%', padding: '8px 12px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? accentColor : 'rgba(255,255,255,0.06)', color: isMine ? '#0D1B2A' : '#E8F4FF', fontSize: 13, lineHeight: 1.5, fontWeight: isMine ? 500 : 400 }}>
                {m.text}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(123,175,212,0.4)', marginTop: 2 }}>{formatTime(m.createdAt)}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(0,180,255,0.1)', background: 'rgba(10,22,38,0.98)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Digite uma mensagem..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: '1px solid rgba(0,180,255,0.2)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }}
        />
        <button onClick={handleSend} disabled={!input.trim() || sending}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: accentColor, color: '#0D1B2A', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: (!input.trim() || sending) ? 0.5 : 1 }}>
          ↑
        </button>
      </div>
    </div>
  );
}
