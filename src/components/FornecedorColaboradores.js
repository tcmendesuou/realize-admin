import React, { useState, useEffect } from 'react';
import { collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { auth, db } from '../firebase/config';
import PermissoesOverride from './PermissoesOverride';

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.2)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box' };
const lbl = { fontSize: 11, fontWeight: 600, color: '#7BAFD4', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

export default function FornecedorColaboradores({ supplierId, userData }) {
  const [colaboradores, setColaboradores] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', senha: '', cargoId: '' });
  const [editandoPermissoes, setEditandoPermissoes] = useState(null);
  const [permissoesCustomForm, setPermissoesCustomForm] = useState({});
  const [savingPermissoes, setSavingPermissoes] = useState(false);

  useEffect(() => { carregar(); }, [supplierId]);

  const carregar = async () => {
    if (!supplierId) return;
    setLoading(true);
    try {
      const [colabSnap, cargosSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('supplierId', '==', supplierId))),
        getDocs(query(collection(db, 'cargos'), where('tipoConta', '==', 'fornecedor'))),
      ]);
      setColaboradores(colabSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCargos(cargosSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.nivel||0)-(b.nivel||0)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const cargoDe = (c) => cargos.find(cg => cg.id === c.cargoId)?.nome || '';

  const handleCriar = async () => {
    if (!form.nome || !form.email || !form.senha) { alert('Nome, email e senha obrigatórios'); return; }
    if (!form.cargoId) { alert('Selecione o cargo'); return; }
    setSaving(true);
    // App secundário — não derruba a sessão de quem está criando o colaborador.
    const secondaryApp = initializeApp(auth.app.options, `Secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const cargoEscolhido = cargos.find(c => c.id === form.cargoId);
      const supplierSnap = await getDoc(doc(db, 'suppliers', supplierId));
      const nomeEmpresa = supplierSnap.exists() ? (supplierSnap.data().tradeName || supplierSnap.data().companyName || '') : '';
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.senha);
      await addDoc(collection(db, 'users'), {
        uid: cred.user.uid,
        name: form.nome,
        email: form.email,
        systemRole: 'fornecedor',
        tipoConta: 'fornecedor',
        supplierId,
        companyName: nomeEmpresa,
        cargoId: form.cargoId,
        roleName: cargoEscolhido?.nome || '',
        active: true,
        createdAt: serverTimestamp(),
        createdBy: userData?.id,
      });
      setForm({ nome: '', email: '', senha: '', cargoId: '' });
      setShowForm(false);
      await carregar();
    } catch (e) { console.error(e); alert(`Erro: ${e.message}`); }
    finally {
      try { await signOut(secondaryAuth); } catch (_) {}
      try { await deleteApp(secondaryApp); } catch (_) {}
      setSaving(false);
    }
  };

  const abrirPermissoes = (c) => {
    setEditandoPermissoes(c);
    setPermissoesCustomForm(c.permissoesCustom || {});
  };

  const salvarPermissoes = async () => {
    setSavingPermissoes(true);
    try {
      await updateDoc(doc(db, 'users', editandoPermissoes.id), { permissoesCustom: permissoesCustomForm });
      setColaboradores(p => p.map(c => c.id === editandoPermissoes.id ? { ...c, permissoesCustom: permissoesCustomForm } : c));
      setEditandoPermissoes(null);
    } catch (e) { console.error(e); alert('Erro ao salvar permissões.'); }
    finally { setSavingPermissoes(false); }
  };

  const toggleAtivo = async (c) => {
    await updateDoc(doc(db, 'users', c.id), { active: !c.active });
    setColaboradores(p => p.map(x => x.id === c.id ? { ...x, active: !x.active } : x));
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 300, color: '#E8F4FF', letterSpacing: -0.3 }}>Colaboradores</h1>
          <p style={{ fontSize: 13, color: '#7BAFD4', marginTop: 4 }}>Pessoas da sua empresa com acesso à plataforma</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: '#0A1626', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          + Novo Colaborador
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#7BAFD4' }}>Carregando...</div>
      ) : colaboradores.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(123,175,212,0.4)', border: '2px dashed rgba(0,180,255,0.15)', borderRadius: 12 }}>
          Nenhum colaborador cadastrado ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {colaboradores.map(c => (
            <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,180,255,0.1)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, opacity: c.active === false ? 0.5 : 1 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,229,196,0.15)', border: '1.5px solid rgba(0,229,196,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00E5C4', fontWeight: 700, flexShrink: 0 }}>
                {(c.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#E8F4FF' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#7BAFD4' }}>{c.email} · {cargoDe(c) || 'sem cargo'}</div>
              </div>
              <button onClick={() => abrirPermissoes(c)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Permissões</button>
              <button onClick={() => toggleAtivo(c)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${c.active === false ? 'rgba(102,187,106,0.3)' : 'rgba(239,68,68,0.3)'}`, background: 'none', color: c.active === false ? '#66BB6A' : '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {c.active === false ? 'Ativar' : 'Desativar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo Colaborador */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.2)', borderRadius: 16, width: '100%', maxWidth: 420 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,180,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#E8F4FF' }}>Novo Colaborador</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#7BAFD4', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lbl}>Nome completo *</label><input value={form.nome} onChange={e => setForm(p => ({...p, nome: e.target.value}))} style={inp} /></div>
              <div><label style={lbl}>Email *</label><input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} style={inp} /></div>
              <div><label style={lbl}>Senha *</label><input type="password" value={form.senha} onChange={e => setForm(p => ({...p, senha: e.target.value}))} style={inp} placeholder="Mínimo 6 caracteres" /></div>
              <div>
                <label style={lbl}>Cargo *</label>
                <select value={form.cargoId} onChange={e => setForm(p => ({...p, cargoId: e.target.value}))} style={{ ...inp, background: 'rgba(10,22,38,0.95)' }}>
                  <option value="">Selecione...</option>
                  {cargos.map(c => <option key={c.id} value={c.id}>{c.nome} (nível {c.nivel})</option>)}
                </select>
                {cargos.length === 0 && <div style={{ fontSize: 10, color: '#FFA726', marginTop: 4 }}>Nenhum cargo de fornecedor cadastrado — peça pra Realize popular em Admin → Cargos.</div>}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid rgba(0,180,255,0.1)' }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={handleCriar} disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: '#0A1626', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Criando...' : 'Criar colaborador'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Permissões */}
      {editandoPermissoes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setEditandoPermissoes(null); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Permissões — {editandoPermissoes.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Cargo: {cargoDe(editandoPermissoes) || '—'}</div>
              </div>
              <button onClick={() => setEditandoPermissoes(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <PermissoesOverride
                tipoConta="fornecedor"
                cargo={cargos.find(c => c.id === editandoPermissoes.cargoId)}
                permissoesCustom={permissoesCustomForm}
                onChange={setPermissoesCustomForm}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16 }}>
                <button onClick={() => setEditandoPermissoes(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={salvarPermissoes} disabled={savingPermissoes} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: savingPermissoes ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: savingPermissoes ? 0.7 : 1 }}>
                  {savingPermissoes ? 'Salvando...' : 'Salvar permissões'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
