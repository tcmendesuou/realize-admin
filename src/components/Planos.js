import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };

// ─────────────────────────────────────────────────────────────────────────────
// Planos — 3 colunas independentes (Implantação, Fee, Unidades), cada uma com
// sua própria lista de opções de plano. Por enquanto é só cadastro — nada
// aqui está conectado a tenants, financeiro ou orçamentos ainda.
// ─────────────────────────────────────────────────────────────────────────────
const COLUNAS = [
  { tipo: 'implantacao', titulo: 'Implantação',        placeholder: 'Ex: Implantação Padrão', sufixoValor: 'R$',  color: '#667eea' },
  { tipo: 'fee',         titulo: 'Fee',                 placeholder: 'Ex: Fee 10%',             sufixoValor: '%',   color: '#00b894' },
  { tipo: 'unidade',     titulo: 'Unidades (mensalidade)', placeholder: 'Ex: Mensalidade Básica', sufixoValor: 'R$/mês', color: '#FFA726' },
];

function ColunaPlano({ tipo, titulo, placeholder, sufixoValor, color, itens, onCriar, onEditar, onExcluir }) {
  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editValor, setEditValor] = useState('');

  const itensDoTipo = itens.filter(i => i.tipo === tipo);

  const criar = () => {
    if (!nome.trim()) return;
    onCriar({ tipo, nome: nome.trim(), valor: parseFloat(valor) || 0 });
    setNome(''); setValor('');
  };

  const abrirEdicao = (item) => {
    setEditandoId(item.id); setEditNome(item.nome); setEditValor(String(item.valor));
  };
  const salvarEdicao = (item) => {
    onEditar(item.id, { nome: editNome.trim(), valor: parseFloat(editValor) || 0 });
    setEditandoId(null);
  };

  return (
    <div style={{ flex: 1, minWidth: 0, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f2f5', borderTop: `3px solid ${color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{titulo}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{itensDoTipo.length} opç{itensDoTipo.length === 1 ? 'ão' : 'ões'}</div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', maxHeight: 460 }}>
        {itensDoTipo.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '20px 8px', border: '2px dashed #e2e8f0', borderRadius: 8 }}>
            Nenhuma opção ainda.
          </div>
        ) : itensDoTipo.map(item => (
          <div key={item.id} style={{ background: '#f8faff', borderRadius: 8, padding: '10px 12px', border: '1px solid #eef1f8' }}>
            {editandoId === item.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={editNome} onChange={e => setEditNome(e.target.value)} style={inp} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" value={editValor} onChange={e => setEditValor(e.target.value)} style={{ ...inp, flex: 1 }} />
                  <button onClick={() => salvarEdicao(item)} style={{ padding: '0 12px', borderRadius: 8, border: 'none', background: color, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salvar</button>
                  <button onClick={() => setEditandoId(null)} style={{ padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</div>
                  <div style={{ fontSize: 12, color, fontWeight: 700, marginTop: 2 }}>{item.valor}{sufixoValor === '%' ? '%' : ` ${sufixoValor}`}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => abrirEdicao(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✏️</button>
                  <button onClick={() => onExcluir(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>🗑️</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid #f0f2f5', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder={placeholder} style={inp} onKeyDown={e => e.key === 'Enter' && criar()} />
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder={sufixoValor === '%' ? 'Ex: 10' : 'Ex: 2000'} style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && criar()} />
          <button onClick={criar} style={{ padding: '0 16px', borderRadius: 8, border: 'none', background: color, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            + Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Planos() {
  const [itens, setItens]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(db, 'planos'), orderBy('createdAt', 'asc')));
    setItens(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const criarItem = async ({ tipo, nome, valor }) => {
    const novoRef = await addDoc(collection(db, 'planos'), { tipo, nome, valor, createdAt: serverTimestamp() });
    setItens(prev => [...prev, { id: novoRef.id, tipo, nome, valor }]);
  };

  const editarItem = async (id, { nome, valor }) => {
    await updateDoc(doc(db, 'planos', id), { nome, valor, updatedAt: serverTimestamp() });
    setItens(prev => prev.map(i => i.id === id ? { ...i, nome, valor } : i));
  };

  const excluirItem = async (id) => {
    if (!window.confirm('Excluir essa opção de plano?')) return;
    await deleteDoc(doc(db, 'planos', id));
    setItens(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Planos</h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Opções de Implantação, Fee e Mensalidade — ainda não conectadas a clientes ou financeiro.</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', gap: 16 }}>
          {COLUNAS.map(col => (
            <ColunaPlano
              key={col.tipo}
              {...col}
              itens={itens}
              onCriar={criarItem}
              onEditar={editarItem}
              onExcluir={excluirItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
