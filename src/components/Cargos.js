import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { RECURSOS_POR_TIPO, TIPOS_CONTA, NIVEIS, ACOES } from './permissoesConstants';

// Matriz padrão fechada com o cliente (28/07) — usada só pelo botão de seed.
const CARGOS_PADRAO = [
  // ── REALIZE ──
  { nome: 'Diretor', nivel: 1, tipoConta: 'realize', permissoes: { projetos: 'VCEXA', financeiro: 'VCEXA', cadastros: 'VCEXA', catalogo_servicos: 'VCEXA', fornecedores_homologacao: 'VCEXA', empresas_tenants: 'VCEXA', chat_config: 'VCEXA', script_ia: 'VCEXA' } },
  { nome: 'Gerente', nivel: 2, tipoConta: 'realize', permissoes: { projetos: 'VCEXA', financeiro: 'VCEXA', cadastros: 'VCEX', catalogo_servicos: 'VCEX', fornecedores_homologacao: 'VCEXA', empresas_tenants: 'VCE', chat_config: 'VCEX', script_ia: 'VCE' } },
  { nome: 'Coordenador', nivel: 3, tipoConta: 'realize', permissoes: { projetos: 'VCEA', financeiro: 'V', cadastros: 'V', catalogo_servicos: 'VE', fornecedores_homologacao: 'VEA', empresas_tenants: 'V', chat_config: '', script_ia: '' } },
  { nome: 'Operação', nivel: 4, tipoConta: 'realize', permissoes: { projetos: 'VCE', financeiro: 'V', cadastros: '', catalogo_servicos: 'VE', fornecedores_homologacao: 'V', empresas_tenants: '', chat_config: '', script_ia: '' } },
  { nome: 'Financeiro', nivel: 4, tipoConta: 'realize', permissoes: { projetos: 'V', financeiro: 'VCEXA', cadastros: '', catalogo_servicos: 'V', fornecedores_homologacao: 'V', empresas_tenants: '', chat_config: '', script_ia: '' } },
  { nome: 'Atendimento', nivel: 4, tipoConta: 'realize', permissoes: { projetos: 'VC', financeiro: '', cadastros: '', catalogo_servicos: 'V', fornecedores_homologacao: 'V', empresas_tenants: '', chat_config: '', script_ia: '' } },
  { nome: 'Produtor', nivel: 4, tipoConta: 'realize', permissoes: { projetos: 'V', financeiro: '', cadastros: '', catalogo_servicos: '', fornecedores_homologacao: '', empresas_tenants: '', chat_config: '', script_ia: '' } },
  { nome: 'Visualizador', nivel: 5, tipoConta: 'realize', permissoes: { projetos: 'V', financeiro: 'V', cadastros: '', catalogo_servicos: 'V', fornecedores_homologacao: 'V', empresas_tenants: '', chat_config: '', script_ia: '' } },

  // ── CLIENTE ──
  { nome: 'Diretor', nivel: 1, tipoConta: 'cliente', permissoes: { meus_eventos: 'VCEXA', historico: 'V', financeiro: 'VCEXA', agenda: 'VCE', franqueados: 'VCEXA', verbas: 'VCEXA' } },
  { nome: 'Gerente', nivel: 2, tipoConta: 'cliente', permissoes: { meus_eventos: 'VCEXA', historico: 'V', financeiro: 'VCEA', agenda: 'VCE', franqueados: 'VCE', verbas: 'VCEA' } },
  { nome: 'Coordenador', nivel: 3, tipoConta: 'cliente', permissoes: { meus_eventos: 'VCEA', historico: 'V', financeiro: 'V', agenda: 'VCE', franqueados: 'V', verbas: 'V' } },
  { nome: 'Operação', nivel: 4, tipoConta: 'cliente', permissoes: { meus_eventos: 'VCE', historico: 'V', financeiro: '', agenda: 'VC', franqueados: '', verbas: '' } },
  { nome: 'Financeiro', nivel: 4, tipoConta: 'cliente', permissoes: { meus_eventos: 'V', historico: 'V', financeiro: 'VCEA', agenda: 'V', franqueados: '', verbas: 'VA' } },
  { nome: 'Atendimento', nivel: 4, tipoConta: 'cliente', permissoes: { meus_eventos: 'VC', historico: 'V', financeiro: '', agenda: 'VC', franqueados: '', verbas: '' } },
  { nome: 'Visualizador', nivel: 5, tipoConta: 'cliente', permissoes: { meus_eventos: 'V', historico: 'V', financeiro: 'V', agenda: 'V', franqueados: 'V', verbas: 'V' } },

  // ── FORNECEDOR ──
  { nome: 'Diretor', nivel: 1, tipoConta: 'fornecedor', permissoes: { meus_jobs: 'VCEXA', meus_servicos: 'VCEX', historico: 'V', financeiro: 'VCEXA' } },
  { nome: 'Gerente', nivel: 2, tipoConta: 'fornecedor', permissoes: { meus_jobs: 'VCEXA', meus_servicos: 'VCEX', historico: 'V', financeiro: 'VCEA' } },
  { nome: 'Coordenador', nivel: 3, tipoConta: 'fornecedor', permissoes: { meus_jobs: 'VEA', meus_servicos: 'VE', historico: 'V', financeiro: 'V' } },
  { nome: 'Operação', nivel: 4, tipoConta: 'fornecedor', permissoes: { meus_jobs: 'VE', meus_servicos: 'VE', historico: 'V', financeiro: '' } },
  { nome: 'Financeiro', nivel: 4, tipoConta: 'fornecedor', permissoes: { meus_jobs: 'V', meus_servicos: 'V', historico: 'V', financeiro: 'VCEA' } },
  { nome: 'Atendimento', nivel: 4, tipoConta: 'fornecedor', permissoes: { meus_jobs: 'VC', meus_servicos: 'V', historico: 'V', financeiro: '' } },
  { nome: 'Visualizador', nivel: 5, tipoConta: 'fornecedor', permissoes: { meus_jobs: 'V', meus_servicos: 'V', historico: 'V', financeiro: 'V' } },
];

const CARGO_VAZIO = { nome: '', nivel: 3, tipoConta: 'realize', permissoes: {} };

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 };

export default function Cargos() {
  const [cargos, setCargos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm]         = useState(CARGO_VAZIO);
  const [filtroTipo, setFiltroTipo] = useState('realize');
  const [populando, setPopulando] = useState(false);

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'cargos'));
    setCargos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const abrirNovo = () => { setEditando(null); setForm({ ...CARGO_VAZIO, tipoConta: filtroTipo }); setShowForm(true); };
  const abrirEditar = (c) => { setEditando(c); setForm({ ...CARGO_VAZIO, ...c }); setShowForm(true); };

  const toggleAcao = (recursoId, acaoId) => {
    setForm(p => {
      const atual = p.permissoes[recursoId] || '';
      const nova = atual.includes(acaoId) ? atual.replace(acaoId, '') : atual + acaoId;
      return { ...p, permissoes: { ...p.permissoes, [recursoId]: nova } };
    });
  };

  const salvar = async () => {
    if (!form.nome.trim()) { alert('Preencha o nome do cargo.'); return; }
    setSaving(true);
    try {
      const data = { nome: form.nome.trim(), nivel: parseInt(form.nivel), tipoConta: form.tipoConta, permissoes: form.permissoes };
      if (editando) await updateDoc(doc(db, 'cargos', editando.id), data);
      else await addDoc(collection(db, 'cargos'), data);
      await carregar();
      setShowForm(false);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const excluir = async (c) => {
    if (!window.confirm(`Excluir o cargo "${c.nome}"?`)) return;
    await deleteDoc(doc(db, 'cargos', c.id));
    await carregar();
  };

  const popularPadrao = async () => {
    if (!window.confirm('Isso cria (ou sobrescreve) os cargos padrão nos 3 tipos de conta, com a matriz de permissões já definida. Pode rodar mais de uma vez sem duplicar. Continuar?')) return;
    setPopulando(true);
    try {
      for (const c of CARGOS_PADRAO) {
        const id = `${c.tipoConta}_${c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`;
        await setDoc(doc(db, 'cargos', id), c);
      }
      await carregar();
      alert('Cargos padrão criados!');
    } catch (e) { console.error(e); alert('Erro ao popular.'); }
    finally { setPopulando(false); }
  };

  const cargosFiltrados = cargos.filter(c => c.tipoConta === filtroTipo).sort((a, b) => (a.nivel || 0) - (b.nivel || 0));
  const recursos = RECURSOS_POR_TIPO[form.tipoConta] || [];

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Cargos</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Catálogo de cargos e permissões, por tipo de conta</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={popularPadrao} disabled={populando} style={{ padding: '9px 16px', borderRadius: 9, border: '1px dashed #94a3b8', background: 'none', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: populando ? 'not-allowed' : 'pointer' }}>
            {populando ? 'Populando...' : '⚙️ Popular cargos padrão'}
          </button>
          <button onClick={abrirNovo} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            + Novo Cargo
          </button>
        </div>
      </div>

      {/* Filtro por tipo de conta */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TIPOS_CONTA.map(t => (
          <button key={t.id} onClick={() => setFiltroTipo(t.id)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 600, background: filtroTipo === t.id ? '#667eea' : '#f1f5f9', color: filtroTipo === t.id ? 'white' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : cargosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhum cargo cadastrado nesse tipo de conta ainda</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cargosFiltrados.map(c => (
            <div key={c.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 8, background: '#f1f5f9', color: '#64748b', flexShrink: 0 }}>NÍVEL {c.nivel}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1 }}>{c.nome}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{Object.values(c.permissoes || {}).filter(Boolean).length} recurso(s) com acesso</span>
              <button onClick={() => abrirEditar(c)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>Editar</button>
              <button onClick={() => excluir(c)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>Excluir</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{editando ? 'Editar Cargo' : 'Novo Cargo'}</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Nome *</label>
                  <input value={form.nome} onChange={e => setF('nome', e.target.value)} style={inp} placeholder="Ex: Coordenador" />
                </div>
                <div>
                  <label style={lbl}>Nível</label>
                  <select value={form.nivel} onChange={e => setF('nivel', e.target.value)} style={{ ...inp, background: 'white' }}>
                    {NIVEIS.map(n => <option key={n.valor} value={n.valor}>{n.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Tipo de conta</label>
                  <select value={form.tipoConta} onChange={e => setF('tipoConta', e.target.value)} disabled={!!editando} style={{ ...inp, background: 'white' }}>
                    {TIPOS_CONTA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>Permissões</label>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(5, 56px)', background: '#f8faff', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    <span>Recurso</span>
                    {ACOES.map(a => <span key={a.id} style={{ textAlign: 'center' }}>{a.label}</span>)}
                  </div>
                  {recursos.map(r => (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(5, 56px)', padding: '8px 12px', borderTop: '1px solid #f0f2f5', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#1e293b' }}>{r.label}</span>
                      {ACOES.map(a => (
                        <div key={a.id} style={{ display: 'flex', justifyContent: 'center' }}>
                          <input type="checkbox" checked={(form.permissoes[r.id] || '').includes(a.id)} onChange={() => toggleAcao(r.id, a.id)} style={{ width: 16, height: 16, accentColor: '#667eea', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvar} disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar cargo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
