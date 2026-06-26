import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, writeBatch, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useNotificacoes(userId) {
  const [notificacoes, setNotificacoes] = useState([]);

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(
      query(collection(db, 'notificacoes', userId, 'items'), orderBy('createdAt', 'desc')),
      snap => setNotificacoes(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('useNotificacoes:', err)
    );
    return () => unsub();
  }, [userId]);

  const marcarTodasLidas = async () => {
    if (!userId) return;
    const naoLidas = notificacoes.filter(n => !n.lida);
    if (!naoLidas.length) return;
    const batch = writeBatch(db);
    naoLidas.forEach(n => batch.update(doc(db, 'notificacoes', userId, 'items', n.id), { lida: true }));
    await batch.commit();
  };

  const marcarLida = async (notifId) => {
    if (!userId) return;
    await writeBatch(db).update
      ? doc(db, 'notificacoes', userId, 'items', notifId)
      : null;
    // uso simples sem batch
    const { updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'notificacoes', userId, 'items', notifId), { lida: true });
  };

  const naoLidas = notificacoes.filter(n => !n.lida).length;

  const deletarNotificacao = async (notifId) => {
    if (!userId) return;
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'notificacoes', userId, 'items', notifId));
  };

  return { notificacoes, naoLidas, marcarTodasLidas, marcarLida, deletarNotificacao };
}

// ── Função utilitária para criar notificação (use nos outros componentes) ──────
export async function criarNotificacao(userId, { titulo, mensagem, tipo = 'info', budgetId = null }) {
  if (!userId) return;
  try {
    await addDoc(collection(db, 'notificacoes', userId, 'items'), {
      titulo,
      mensagem,
      tipo,       // 'info' | 'acao' | 'sucesso' | 'alerta'
      budgetId,
      lida: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) { console.error('criarNotificacao:', e); }
}
