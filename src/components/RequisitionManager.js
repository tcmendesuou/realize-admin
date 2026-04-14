import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';

// Campos disponíveis por requisição
const CAMPOS_DISPONIVEIS = [
  { id: 'periodo',       label: 'Período (dias)' },
  { id: 'quantidade',    label: 'Quantidade' },
  { id: 'custoUnitario', label: 'Custo Unitário' },
  { id: 'producao',      label: 'Produção' },
  { id: 'encargos',      label: 'Encargos sobre Produção' },
  { id: 'custoInterno',  label: 'Custo Interno' },
  { id: 'honorarios',    label: 'Honorários Produção' },
  { id: 'fornecedores',  label: '3 Fornecedores (nome + valor)' },
  { id: 'justificativa', label: 'Justificativa' },
  { id: 'bv',            label: 'Bônus por Volume (BV %)' },
  { id: 'credito',       label: 'Crédito' },
  { id: 'dataCliente',   label: 'Data Cliente' },
  { id: 'dataFornecedor',label: 'Data Fornecedor' },
  { id: 'observacao',    label: 'Observação' },
];

const TIPO_ENCARGOS = ['REPASSE', 'Calculado (%)', 'Não se aplica'];

const DEFAULT_REQUISITIONS = [
  {
    codigo: 'A', nome: 'Reembolso', cor: '#3b82f6',
    campos: ['periodo','quantidade','custoUnitario','producao','encargos','fornecedores','justificativa','bv','credito','dataCliente','dataFornecedor','observacao'],
    defaults: { tipoEncargos: 'REPASSE', honorariosPct: 0, bvPct: 10 },
  },
  {
    codigo: 'C', nome: 'Mão de Obra / Serviços / Fee', cor: '#8b5cf6',
    campos: ['periodo','quantidade','custoUnitario','producao','encargos','fornecedores','justificativa','bv','credito','dataCliente','dataFornecedor','observacao'],
    defaults: { tipoEncargos: 'Calculado (%)', encargoPct: 19.8, honorariosPct: 7.8, bvPct: 10 },
  },
  {
    codigo: 'D', nome: 'Cessão de Uso', cor: '#f59e0b',
    campos: ['periodo','quantidade','custoUnitario','producao','encargos','fornecedores','justificativa','bv','credito','dataCliente','dataFornecedor','observacao'],
    defaults: { tipoEncargos: 'REPASSE', honorariosPct: 0, bvPct: 10 },
  },
  {
    codigo: 'E', nome: 'Taxas', cor: '#ef4444',
    campos: ['periodo','quantidade','custoUnitario','producao','fornecedores','justificativa','dataCliente','dataFornecedor','observacao'],
    defaults: { tipoEncargos: 'Não se aplica', honorariosPct: 0, bvPct: 0 },
  },
  {
    codigo: 'F', nome: 'Criação / Desenvolvimento', cor: '#10b981',
    campos: ['periodo','quantidade','custoInterno','honorarios','encargos','dataCliente','observacao'],
    defaults: { tipoEncargos: 'Calculado (%)', encargoPct: 19.8, honorariosPct: 19.8, bvPct: 0 },
  },
];

const emptyForm = () => ({
  codigo: '', nome: '', cor: '#667eea', ativo: true,
  campos: ['periodo','quantidade','custoUnitario','producao','fornecedores','observacao'],
  defaults: { tipoEncargos: 'REPASSE', encargoPct: 0, honorariosPct: 0, bvPct: 0 },
});

export default function RequisitionManager() {
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'requisitions'), orderBy('codigo', 'asc')));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequisitions(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const seedDefaults = async () => {
    if (!window.confirm('Isso vai criar as 5 requisições padrão (A, C, D, E, F). Continuar?')) return;
    setSaving(true);
    try {
      for (const r of DEFAULT_REQUISITIONS) {
        await addDoc(collection(db, 'requisitions'), { ...r, ativo: true, createdAt: new Date() });
      }
      await loadData();
      setSeeded(true);
    } catch (e) { console.error(e); alert('Erro ao criar defaults.'); }
    finally { setSaving(false); }
  };

  const selectRequisition = (r) => {
    setSelected(r);
    setForm({
      codigo: r.codigo || '',
      nome: r.nome || '',
      cor: r.cor || '#667eea',
      ativo: r.ativo !== false,
      campos: r.campos || [],
      defaults: r.defaults || { tipoEncargos: 'REPASSE', encargoPct: 0, honorariosPct: 0, bvPct: 0 },
    });
  };

  const newRequisition = () => {
    setSelected(null);
    setForm(emptyForm());
  };

  const toggleCampo = (campoId) => {
    setForm(prev => ({
      ...prev,
      campos: prev.campos.includes(campoId)
        ? prev.campos.filter(c => c !== campoId)
        : [...prev.campos, campoId]
    }));
  };

  const handleSave = async () => {
    if (!form.codigo || !form.nome) { alert('Preencha código e nome.'); return; }
    setSaving(true);
    try {
      const data = { ...form, updatedAt: new Date() };
      if (selected) {
        await updateDoc(doc(db, 'requisitions', selected.id), data);
      } else {
        await addDoc(collection(db, 'requisitions'), { ...data, createdAt: new Date() });
      }
      await loadData();
      setSelected(null);
      setForm(emptyForm());
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Excluir requisição "${r.codigo} - ${r.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'requisitions', r.id));
      await loadData();
      if (selected?.id === r.id) { setSelected(null); setForm(emptyForm()); }
    } catch (e) { alert('Erro ao excluir.'); }
  };

  const COR_BADGE = (cor) => ({
    display: 'inline-block', padding: '3px 10px', borderRadius: 12,
    background: cor + '22', color: cor, fontSize: 12, fontWeight: 700, border: `1px solid ${cor}44`
  });

  if (loading) return <div style={{ padding: 40, color: '#7f8c8d' }}>Carregando requisições...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, height: '100%', minHeight: 0 }}>

      {/* ── LISTA ── */}
      <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2c3e50' }}>Requisições</h2>
          <button onClick={newRequisition} style={{ padding: '6px 14px', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Nova</button>
        </div>

        {requisitions.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ color: '#7f8c8d', fontSize: 13, marginBottom: 12 }}>Nenhuma requisição cadastrada.</p>
            <button onClick={seedDefaults} disabled={saving} style={{ padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
              Criar Padrões (A, C, D, E, F)
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {requisitions.map(r => (
            <div key={r.id} onClick={() => selectRequisition(r)}
              style={{ padding: '10px 14px', marginBottom: 6, borderRadius: 8, cursor: 'pointer', border: `1px solid ${selected?.id === r.id ? r.cor || '#667eea' : '#e0e0e0'}`, background: selected?.id === r.id ? (r.cor || '#667eea') + '11' : 'white', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={COR_BADGE(r.cor || '#667eea')}>{r.codigo}</span>
                  <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: '#2c3e50' }}>{r.nome}</span>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(r); }}
                  style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}>✕</button>
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: '#7f8c8d' }}>{r.campos?.length || 0} campos · {r.ativo !== false ? 'Ativa' : 'Inativa'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FORMULÁRIO ── */}
      <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2c3e50' }}>
            {selected ? `Editar: ${selected.codigo} - ${selected.nome}` : 'Nova Requisição'}
          </h3>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Código + Nome + Cor */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#2c3e50', display: 'block', marginBottom: 4 }}>Código *</label>
              <input value={form.codigo} onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                placeholder="A" maxLength={2}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#2c3e50', display: 'block', marginBottom: 4 }}>Nome *</label>
              <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Reembolso"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#2c3e50', display: 'block', marginBottom: 4 }}>Cor</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={form.cor} onChange={e => setForm(p => ({ ...p, cor: e.target.value }))}
                  style={{ width: 40, height: 36, border: '1px solid #e0e0e0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                <span style={COR_BADGE(form.cor)}>{form.codigo || 'X'}</span>
              </div>
            </div>
          </div>

          {/* Campos */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#2c3e50', display: 'block', marginBottom: 8 }}>Campos desta Requisição</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {CAMPOS_DISPONIVEIS.map(campo => (
                <label key={campo.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: `1px solid ${form.campos.includes(campo.id) ? '#667eea' : '#e0e0e0'}`, borderRadius: 8, cursor: 'pointer', background: form.campos.includes(campo.id) ? '#f0f3ff' : 'white', fontSize: 13, transition: 'all 0.15s' }}>
                  <input type="checkbox" checked={form.campos.includes(campo.id)} onChange={() => toggleCampo(campo.id)}
                    style={{ accentColor: '#667eea', cursor: 'pointer' }} />
                  {campo.label}
                </label>
              ))}
            </div>
          </div>

          {/* Defaults */}
          <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#2c3e50', display: 'block', marginBottom: 12 }}>Valores Default</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>

              <div>
                <label style={{ fontSize: 11, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>Tipo de Encargos</label>
                <select value={form.defaults.tipoEncargos}
                  onChange={e => setForm(p => ({ ...p, defaults: { ...p.defaults, tipoEncargos: e.target.value } }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13 }}>
                  {TIPO_ENCARGOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {form.defaults.tipoEncargos === 'Calculado (%)' && (
                <div>
                  <label style={{ fontSize: 11, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>Encargos %</label>
                  <input type="number" min="0" max="100" step="0.1" value={form.defaults.encargoPct || 0}
                    onChange={e => setForm(p => ({ ...p, defaults: { ...p.defaults, encargoPct: parseFloat(e.target.value) || 0 } }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13 }} />
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>Honorários %</label>
                <input type="number" min="0" max="100" step="0.1" value={form.defaults.honorariosPct || 0}
                  onChange={e => setForm(p => ({ ...p, defaults: { ...p.defaults, honorariosPct: parseFloat(e.target.value) || 0 } }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>BV %</label>
                <input type="number" min="0" max="100" step="0.1" value={form.defaults.bvPct || 0}
                  onChange={e => setForm(p => ({ ...p, defaults: { ...p.defaults, bvPct: parseFloat(e.target.value) || 0 } }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13 }} />
              </div>

            </div>
          </div>

          {/* Ativo */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={form.ativo} onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))}
              style={{ accentColor: '#667eea', width: 16, height: 16 }} />
            Requisição ativa
          </label>

        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e0e0e0', display: 'flex', gap: 10 }}>
          <button onClick={() => { setSelected(null); setForm(emptyForm()); }}
            style={{ padding: '8px 18px', background: '#ecf0f1', color: '#2c3e50', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '8px 18px', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Salvando...' : selected ? 'Salvar Alterações' : 'Criar Requisição'}
          </button>
        </div>
      </div>

    </div>
  );
}
