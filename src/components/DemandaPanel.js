import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, query, where, orderBy, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebase/config';
import { criarNotificacao } from '../hooks/useNotificacoes';

// ─────────────────────────────────────────────────────────────────────────────
// DemandaPanel — pedido formal vinculado a UMA tarefa específica, sempre
// mediado pelo Coordenador (Fornecedor e Cliente nunca falam direto).
//
// Regras:
// - Mensagem do Coordenador: liberada=true na hora, e visível pros dois lados.
// - Mensagem do Fornecedor ou Cliente: nasce liberada=false — só o Coordenador
//   vê até decidir liberar pro outro lado.
// - Só existe 1 Demanda "aberta" por tarefa (taskId) por vez. O Coordenador
//   marca como concluída quando resolvido; aí uma nova pode ser aberta depois.
// ─────────────────────────────────────────────────────────────────────────────
export default function DemandaPanel({ taskId, budgetId, supplierId, taskNome, coordenadorId, userData, onClose }) {
  const [demanda, setDemanda]           = useState(null); // demanda "aberta" atual, ou null se não existe
  const [demandaCarregada, setDemandaCarregada] = useState(false);
  const [msgs, setMsgs]                 = useState([]);
  const [input, setInput]               = useState('');
  const [arquivos, setArquivos]         = useState([]);
  const [enviando, setEnviando]         = useState(false);
  const bottomRef = useRef(null);

  const souFornecedor  = userData?.systemRole === 'fornecedor';
  const souCliente      = userData?.systemRole === 'cliente';
  const souCoordenador  = !souFornecedor && !souCliente;
  const meuLado = souFornecedor ? 'fornecedor' : souCliente ? 'cliente' : 'coordenador';
  const meuCampoNaoLidas = `naoLidas${meuLado.charAt(0).toUpperCase()}${meuLado.slice(1)}`;

  // Busca a demanda ABERTA (se existir) pra essa tarefa
  useEffect(() => {
    if (!taskId) return;
    const unsub = onSnapshot(
      query(collection(db, 'demandas'), where('taskId', '==', taskId), where('status', '==', 'aberta')),
      snap => {
        setDemanda(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
        setDemandaCarregada(true);
      }
    );
    return () => unsub();
  }, [taskId]);

  // Mensagens da demanda ativa
  useEffect(() => {
    if (!demanda?.id) { setMsgs([]); return; }
    const unsub = onSnapshot(
      query(collection(db, 'demandas', demanda.id, 'msgs'), orderBy('createdAt', 'asc')),
      snap => setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [demanda?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Zera meu contador de não lidas ao abrir/ver
  useEffect(() => {
    if (!demanda?.id) return;
    if ((demanda[meuCampoNaoLidas] || 0) > 0) {
      updateDoc(doc(db, 'demandas', demanda.id), { [meuCampoNaoLidas]: 0 }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demanda?.id, msgs.length]);

  // Filtra o que cada lado pode ver: Coordenador vê tudo; os outros veem as
  // próprias mensagens + as do Coordenador + as do outro lado JÁ liberadas.
  const msgsVisiveis = msgs.filter(m => {
    if (souCoordenador) return true;
    if (m.senderRole === 'coordenador') return true;
    if (m.senderId === userData?.id) return true;
    return m.liberada === true;
  });

  const handleArquivos = (e) => {
    const novos = Array.from(e.target.files);
    setArquivos(prev => [...prev, ...novos]);
    e.target.value = '';
  };

  const enviar = async () => {
    const texto = input.trim();
    if (!texto && arquivos.length === 0) return;
    if (enviando) return;
    setEnviando(true);
    try {
      let demandaId = demanda?.id;
      if (!demandaId) {
        const novaRef = await addDoc(collection(db, 'demandas'), {
          budgetId, taskId, supplierId: supplierId || '', taskNome: taskNome || '',
          status: 'aberta',
          naoLidasCoordenador: 0, naoLidasFornecedor: 0, naoLidasCliente: 0,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        demandaId = novaRef.id;
      }

      const anexos = [];
      if (arquivos.length > 0) {
        const storage = getStorage();
        for (const file of arquivos) {
          const storageRef = ref(storage, `demandas/${demandaId}/${Date.now()}_${file.name}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          anexos.push({ nome: file.name, url });
        }
      }

      await addDoc(collection(db, 'demandas', demandaId, 'msgs'), {
        text: texto,
        anexos,
        senderId: userData?.id, senderName: userData?.name || 'Usuário', senderRole: meuLado,
        liberada: souCoordenador, // Coordenador libera na hora; Fornecedor/Cliente nascem bloqueadas
        createdAt: serverTimestamp(),
      });

      const updates = { updatedAt: serverTimestamp(), ultimaMsg: (texto || '📎 Anexo').slice(0, 60) };
      if (souCoordenador) { updates.naoLidasFornecedor = increment(1); updates.naoLidasCliente = increment(1); }
      else { updates.naoLidasCoordenador = increment(1); }
      await updateDoc(doc(db, 'demandas', demandaId), updates);

      if (!souCoordenador && coordenadorId) {
        try {
          await criarNotificacao(coordenadorId, {
            titulo: 'Nova Demanda aguardando você',
            mensagem: `${userData?.name || 'Alguém'} abriu um pedido sobre "${taskNome || 'uma tarefa'}".`,
            tipo: 'acao',
            budgetId,
          });
        } catch (e) { console.error('notif demanda:', e); }
      }

      setInput(''); setArquivos([]);
    } catch (e) { console.error(e); alert('Erro ao enviar. Tente novamente.'); }
    finally { setEnviando(false); }
  };

  const handleLiberar = async (msg) => {
    if (!demanda?.id) return;
    try {
      await updateDoc(doc(db, 'demandas', demanda.id, 'msgs', msg.id), {
        liberada: true, liberadaEm: serverTimestamp(), liberadaPor: userData?.name || 'Coordenador',
      });
      const campoOutro = msg.senderRole === 'fornecedor' ? 'naoLidasCliente' : 'naoLidasFornecedor';
      await updateDoc(doc(db, 'demandas', demanda.id), { [campoOutro]: increment(1) });
    } catch (e) { console.error(e); }
  };

  const handleConcluir = async () => {
    if (!demanda?.id) return;
    if (!window.confirm('Marcar esta Demanda como concluída? Se precisar de algo novo depois, pode abrir outra.')) return;
    try { await updateDoc(doc(db, 'demandas', demanda.id), { status: 'concluida', concluidaEm: serverTimestamp() }); }
    catch (e) { console.error(e); }
  };

  const formatTime = (ts) => ts?.toDate ? ts.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  const corLado = { fornecedor: '#FFA726', cliente: '#0080FF', coordenador: '#667eea' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Outfit, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '3px solid #667eea', background: 'rgba(10,22,38,0.98)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>📋 Demanda</div>
          {taskNome && <div style={{ fontSize: 11, color: '#667eea', marginTop: 2 }}>{taskNome}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {souCoordenador && demanda && (
            <button onClick={handleConcluir} style={{ background: 'none', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>
              ✓ Concluir
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* Mensagens */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: '#0D1B2A' }}>
        {!demandaCarregada ? (
          <div style={{ textAlign: 'center', color: 'rgba(123,175,212,0.4)', fontSize: 12, marginTop: 40 }}>Carregando...</div>
        ) : !demanda ? (
          <div style={{ textAlign: 'center', color: 'rgba(123,175,212,0.5)', fontSize: 12, marginTop: 30, padding: '0 16px', lineHeight: 1.6 }}>
            Nenhuma Demanda aberta pra essa tarefa ainda.<br />
            Escreva abaixo pra abrir uma — ela vai direto pro Coordenador avaliar.
          </div>
        ) : msgsVisiveis.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(123,175,212,0.4)', fontSize: 12, marginTop: 40 }}>Nenhuma mensagem visível ainda.</div>
        ) : msgsVisiveis.map(m => {
          const isMine = m.senderId === userData?.id;
          const cor = corLado[m.senderRole] || '#7BAFD4';
          const precisaLiberar = souCoordenador && m.senderRole !== 'coordenador' && !m.liberada;
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
              {!isMine && <div style={{ fontSize: 10, color: cor, marginBottom: 2, fontWeight: 600 }}>{m.senderName} · {m.senderRole}</div>}
              <div style={{ maxWidth: '82%', padding: '8px 12px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? cor : 'rgba(255,255,255,0.06)', color: isMine ? '#0D1B2A' : '#E8F4FF', fontSize: 13, lineHeight: 1.5, fontWeight: isMine ? 500 : 400 }}>
                {m.text}
                {m.anexos?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: m.text ? 6 : 0 }}>
                    {m.anexos.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: isMine ? '#0D1B2A' : '#00E5C4', textDecoration: 'underline' }}>📎 {a.nome}</a>
                    ))}
                  </div>
                )}
              </div>
              {precisaLiberar && (
                <button onClick={() => handleLiberar(m)} style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: '#FFA726', background: 'rgba(255,167,38,0.1)', border: '1px solid rgba(255,167,38,0.3)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                  🔓 Liberar pro outro lado
                </button>
              )}
              {!souCoordenador && m.senderRole !== 'coordenador' && !isMine && m.liberada && (
                <div style={{ fontSize: 9, color: 'rgba(16,185,129,0.7)', marginTop: 2 }}>liberado pelo coordenador</div>
              )}
              <div style={{ fontSize: 9, color: 'rgba(123,175,212,0.4)', marginTop: 2 }}>{formatTime(m.createdAt)}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Anexos pendentes */}
      {arquivos.length > 0 && (
        <div style={{ padding: '6px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, background: 'rgba(10,22,38,0.98)' }}>
          {arquivos.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#7BAFD4', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 8px' }}>
              📎 {f.name}
              <button onClick={() => setArquivos(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(0,180,255,0.1)', background: 'rgba(10,22,38,0.98)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ cursor: 'pointer', fontSize: 18, color: '#7BAFD4', flexShrink: 0 }}>
          📎
          <input type="file" multiple onChange={handleArquivos} style={{ display: 'none' }} />
        </label>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
          placeholder={demanda ? 'Digite uma mensagem...' : 'Descreva o pedido pra abrir a Demanda...'}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: '1px solid rgba(102,126,234,0.3)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }}
        />
        <button onClick={enviar} disabled={(!input.trim() && arquivos.length === 0) || enviando}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#667eea', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: ((!input.trim() && arquivos.length === 0) || enviando) ? 0.5 : 1 }}>
          ↑
        </button>
      </div>
    </div>
  );
}
