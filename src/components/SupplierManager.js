import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 };

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const FORM_VAZIO = {
  tradeName: '', companyName: '', cnpj: '', email: '', phone: '',
  city: '', state: '', website: '', description: '',
  exclusiveTenants: [], ativo: true,
};

// ── Seletor de exclusividade por tenant (mesmo padrão de antes) ──────────────
function TenantSelector({ value = [], onChange, tenants }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return (
    <div>
      <label style={lbl}>Exclusividade por empresa (opcional)</label>
      <div style={{ background: 'rgba(102,126,234,0.04)', border: '1px solid rgba(102,126,234,0.15)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
          {value.length === 0 ? '✓ Visível para todos (sem restrição)' : `🔒 Exclusivo de ${value.length} empresa(s)`}
        </div>
        {tenants.length === 0 ? (
          <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Nenhuma empresa cadastrada ainda.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tenants.map(t => (
              <button key={t.id} onClick={() => toggle(t.id)} type="button"
                style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${value.includes(t.id) ? t.corPrimaria || '#667eea' : '#e2e8f0'}`, background: value.includes(t.id) ? `${t.corPrimaria || '#667eea'}18` : 'white', color: value.includes(t.id) ? t.corPrimaria || '#667eea' : '#64748b', fontSize: 11, fontWeight: value.includes(t.id) ? 700 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {value.includes(t.id) ? '✓' : '○'} {t.nome}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupplierManager() {
  const [suppliers, setSuppliers] = useState([]);
  const [tenants, setTenants]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editando, setEditando]   = useState(null); // null = nova

  const [form, setForm] = useState(FORM_VAZIO);

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const [supSnap, tenSnap] = await Promise.all([
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'tenants')),
      ]);
      setSuppliers(supSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTenants(tenSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.ativo !== false));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const abrirNova = () => { setEditando(null); setForm(FORM_VAZIO); setShowForm(true); };
  const abrirEditar = (s) => { setEditando(s); setForm({ ...FORM_VAZIO, ...s }); setShowForm(true); };

  const salvar = async () => {
    if (!form.tradeName.trim()) { alert('Nome fantasia é obrigatório'); return; }
    setSaving(true);
    try {
      const data = {
        tradeName: form.tradeName.trim(),
        companyName: form.companyName.trim() || form.tradeName.trim(),
        cnpj: form.cnpj.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        state: form.state,
        website: form.website.trim(),
        description: form.description.trim(),
        exclusiveTenants: form.exclusiveTenants,
        ativo: form.ativo,
        updatedAt: serverTimestamp(),
      };
      if (editando) {
        await updateDoc(doc(db, 'suppliers', editando.id), data);
      } else {
        // Empresa criada direto pelo admin já nasce homologada — não
        // depende de aprovação de um formulário público (isso é só pra
        // quando abrirmos o auto-cadastro no futuro).
        await addDoc(collection(db, 'suppliers'), { ...data, status: 'homologado', createdAt: serverTimestamp() });
      }
      await carregar();
      setShowForm(false);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const toggleAtivo = async (s) => {
    const novoStatus = s.status === 'inativo' ? 'homologado' : 'inativo';
    await updateDoc(doc(db, 'suppliers', s.id), { status: novoStatus, ativo: novoStatus !== 'inativo', updatedAt: serverTimestamp() });
    setSuppliers(p => p.map(x => x.id === s.id ? { ...x, status: novoStatus, ativo: novoStatus !== 'inativo' } : x));
  };

  const excluir = async (s) => {
    if (!window.confirm(`Excluir "${s.tradeName}"? Isso não afeta colaboradores já criados, mas eles ficarão sem empresa vinculada.`)) return;
    await deleteDoc(doc(db, 'suppliers', s.id));
    await carregar();
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Fornecedores</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Empresas fornecedoras — cadastre aqui, depois crie o Diretor/Gerente em Cadastros</p>
        </div>
        <button onClick={abrirNova} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#FFA726,#FF7043)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          + Nova Empresa Fornecedora
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhuma empresa fornecedora cadastrada</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {suppliers.map(s => (
            <div key={s.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, opacity: s.status === 'inativo' ? 0.5 : 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FFA726', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700 }}>
                {(s.tradeName || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{s.tradeName}</span>
                  {s.cnpj && <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.cnpj}</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: s.status === 'inativo' ? 'rgba(239,68,68,0.1)' : 'rgba(102,187,106,0.15)', color: s.status === 'inativo' ? '#ef4444' : '#16a34a' }}>
                    {s.status === 'inativo' ? 'INATIVO' : 'ATIVO'}
                  </span>
                  {s.exclusiveTenants?.length > 0 && (
                    <span style={{ fontSize: 10, color: '#7c3aed' }}>🔒 exclusivo</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{s.city}{s.state ? ` / ${s.state}` : ''}{s.email ? ` · ${s.email}` : ''}</div>
                {s.serviceNames?.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {s.serviceNames.slice(0, 4).map((sn, i) => (
                      <span key={i} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#fff4e6', color: '#FFA726' }}>{sn}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => abrirEditar(s)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                <button onClick={() => toggleAtivo(s)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${s.status === 'inativo' ? 'rgba(102,187,106,0.3)' : 'rgba(239,68,68,0.3)'}`, background: 'none', color: s.status === 'inativo' ? '#16a34a' : '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  {s.status === 'inativo' ? 'Ativar' : 'Inativar'}
                </button>
                <button onClick={() => excluir(s)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{editando ? 'Editar Empresa Fornecedora' : 'Nova Empresa Fornecedora'}</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Nome fantasia *</label>
                  <input value={form.tradeName} onChange={e => setF('tradeName', e.target.value)} style={inp} placeholder="Ex: Estruturas Faby" />
                </div>
                <div>
                  <label style={lbl}>Razão social</label>
                  <input value={form.companyName} onChange={e => setF('companyName', e.target.value)} style={inp} placeholder="Ex: Faby Estruturas Ltda" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>CNPJ</label>
                  <input value={form.cnpj} onChange={e => setF('cnpj', e.target.value)} style={inp} placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} style={inp} placeholder="contato@empresa.com" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Telefone</label>
                  <input value={form.phone} onChange={e => setF('phone', e.target.value)} style={inp} placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label style={lbl}>Cidade</label>
                  <input value={form.city} onChange={e => setF('city', e.target.value)} style={inp} placeholder="Cidade" />
                </div>
                <div>
                  <label style={lbl}>Estado</label>
                  <select value={form.state} onChange={e => setF('state', e.target.value)} style={inp}>
                    <option value="">Selecione...</option>
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>Site (opcional)</label>
                <input value={form.website} onChange={e => setF('website', e.target.value)} style={inp} placeholder="https://..." />
              </div>

              <div>
                <label style={lbl}>Descrição</label>
                <textarea value={form.description} onChange={e => setF('description', e.target.value)} style={{ ...inp, resize: 'vertical', minHeight: 70 }} placeholder="Breve descrição do que a empresa oferece..." />
              </div>

              <TenantSelector value={form.exclusiveTenants} onChange={v => setF('exclusiveTenants', v)} tenants={tenants} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="supplier-ativo" checked={form.ativo} onChange={e => setF('ativo', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#FFA726' }} />
                <label htmlFor="supplier-ativo" style={{ fontSize: 13, color: '#475569', cursor: 'pointer' }}>Empresa ativa</label>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={salvar} disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FFA726,#FF7043)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
