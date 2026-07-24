import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 };

export default function TiposEvento() {
  const [tipos, setTipos]         = useState([]);
  const [perguntas, setPerguntas] = useState([]); // só as de topo (sem pai), do Banco de Perguntas
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando]   = useState(null); // null = novo
  const [nomeForm, setNomeForm]   = useState('');

  const [selecionado, setSelecionado] = useState(null); // tipo aberto pra editar o fluxo

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    const [tiposSnap, perguntasSnap] = await Promise.all([
      getDocs(collection(db, 'tiposEvento')),
      getDocs(collection(db, 'perguntas')),
    ]);
    setTipos(tiposSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const todasPerguntas = perguntasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setPerguntas(todasPerguntas.filter(p => !p.perguntaPaiId && p.destino !== 'raiz.tipoEvento' && p.ativo !== false));
    setLoading(false);
  };

  const perguntaPorId = (id) => perguntas.find(p => p.id === id);

  // ── Modal criar/editar nome do tipo ────────────────────────────────────────
  const abrirNovo = () => { setEditando(null); setNomeForm(''); setShowModal(true); };
  const abrirEditarNome = (t, e) => { e.stopPropagation(); setEditando(t); setNomeForm(t.nome); setShowModal(true); };

  const salvarTipo = async () => {
    if (!nomeForm.trim()) { alert('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      if (editando) {
        await updateDoc(doc(db, 'tiposEvento', editando.id), { nome: nomeForm.trim(), updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'tiposEvento'), { nome: nomeForm.trim(), ativo: true, perguntasIds: [], createdAt: serverTimestamp() });
      }
      await carregar();
      setShowModal(false);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const excluirTipo = async (t, e) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir o tipo "${t.nome}"?`)) return;
    await deleteDoc(doc(db, 'tiposEvento', t.id));
    if (selecionado?.id === t.id) setSelecionado(null);
    await carregar();
  };

  const toggleAtivo = async (t, e) => {
    e.stopPropagation();
    await updateDoc(doc(db, 'tiposEvento', t.id), { ativo: !t.ativo });
    await carregar();
  };

  // ── Edição do fluxo (perguntas incluídas + ordem) ──────────────────────────
  const perguntasIncluidas = selecionado ? (selecionado.perguntasIds || []).map(perguntaPorId).filter(Boolean) : [];
  const perguntasDisponiveis = selecionado ? perguntas.filter(p => !(selecionado.perguntasIds || []).includes(p.id)) : [];

  const salvarOrdem = async (novaLista) => {
    setSelecionado(p => ({ ...p, perguntasIds: novaLista }));
    await updateDoc(doc(db, 'tiposEvento', selecionado.id), { perguntasIds: novaLista, updatedAt: serverTimestamp() });
    setTipos(prev => prev.map(t => t.id === selecionado.id ? { ...t, perguntasIds: novaLista } : t));
  };

  const adicionar = (perguntaId) => salvarOrdem([...(selecionado.perguntasIds || []), perguntaId]);
  const remover    = (perguntaId) => salvarOrdem((selecionado.perguntasIds || []).filter(id => id !== perguntaId));
  const mover = (idx, direcao) => {
    const lista = [...(selecionado.perguntasIds || [])];
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= lista.length) return;
    [lista[idx], lista[novoIdx]] = [lista[novoIdx], lista[idx]];
    salvarOrdem(lista);
  };

  // ── Tela de edição do fluxo de um tipo específico ──────────────────────────
  if (selecionado) {
    return (
      <div style={{ maxWidth: 980, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelecionado(null)} style={{ background: 'none', border: 'none', color: '#667eea', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>← Voltar</button>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>{selecionado.nome}</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Disponíveis */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Perguntas disponíveis (Banco)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflow: 'auto' }}>
              {perguntasDisponiveis.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: 16, textAlign: 'center' }}>Todas as perguntas já estão incluídas.</div>
              ) : perguntasDisponiveis.map(p => (
                <div key={p.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: '#1e293b' }}>{p.texto}</span>
                  <button onClick={() => adicionar(p.id)} style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 7, border: 'none', background: 'rgba(102,126,234,0.1)', color: '#667eea', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Adicionar</button>
                </div>
              ))}
            </div>
          </div>

          {/* Incluídas / ordem */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Fluxo deste evento ({perguntasIncluidas.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflow: 'auto' }}>
              {perguntasIncluidas.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: 16, textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: 8 }}>Nenhuma pergunta incluída ainda — adicione ao lado.</div>
              ) : perguntasIncluidas.map((p, i) => (
                <div key={p.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', width: 18 }}>{i + 1}</span>
                  <span style={{ fontSize: 12.5, color: '#1e293b', flex: 1 }}>{p.texto}</span>
                  <button onClick={() => mover(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#e2e8f0' : '#64748b', fontSize: 13 }}>▲</button>
                  <button onClick={() => mover(i, 1)} disabled={i === perguntasIncluidas.length - 1} style={{ background: 'none', border: 'none', cursor: i === perguntasIncluidas.length - 1 ? 'default' : 'pointer', color: i === perguntasIncluidas.length - 1 ? '#e2e8f0' : '#64748b', fontSize: 13 }}>▼</button>
                  <button onClick={() => remover(p.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Lista de tipos de evento ────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Tipos de Evento</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Cada tipo tem sua própria lista de perguntas do Banco, na ordem que você escolher</p>
        </div>
        <button onClick={abrirNovo} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          + Novo Tipo de Evento
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : tipos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhum tipo de evento cadastrado</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {tipos.map(t => (
            <div key={t.id} onClick={() => setSelecionado(t)}
              style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', cursor: 'pointer', opacity: t.ativo === false ? 0.5 : 1, transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>{t.nome}</h3>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={e => abrirEditarNome(t, e)} title="Renomear" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                  <button onClick={e => excluirTipo(t, e)} title="Excluir" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{(t.perguntasIds || []).length} pergunta(s)</div>
              <button onClick={e => toggleAtivo(t, e)} style={{ marginTop: 10, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10, border: 'none', cursor: 'pointer', background: t.ativo !== false ? 'rgba(102,187,106,0.12)' : 'rgba(239,68,68,0.1)', color: t.ativo !== false ? '#16a34a' : '#ef4444' }}>
                {t.ativo !== false ? 'ATIVO' : 'INATIVO'}
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{editando ? 'Renomear Tipo' : 'Novo Tipo de Evento'}</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Nome *</label>
                <input value={nomeForm} onChange={e => setNomeForm(e.target.value)} style={inp} placeholder="Ex: Feira / Exposição" autoFocus onKeyDown={e => e.key === 'Enter' && salvarTipo()} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvarTipo} disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
