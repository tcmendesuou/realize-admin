import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

const SYSTEM_ROLES = [
  { value: 'none',       label: 'Nenhum (sem acesso ao sistema)' },
  { value: 'equipe',     label: 'Equipe interna' },
  { value: 'cliente',    label: 'Cliente' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'admin',      label: 'Admin (painel completo)' },
];

export default function RoleManagement() {
  const [userTypes, setUserTypes] = useState([]);
  const [roles, setRoles]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  const [selectedType, setSelectedType] = useState(null);

  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newTypeName, setNewTypeName]         = useState('');
  const [newTypeSystemRole, setNewTypeSystemRole] = useState('none');
  const [newRoleName, setNewRoleName]         = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [typesSnap, rolesSnap] = await Promise.all([
        getDocs(collection(db, 'userTypes')),
        getDocs(collection(db, 'roles')),
      ]);

      let typesData = typesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (typesData.length === 0) {
        await createDefaultTypes();
        const snap2 = await getDocs(collection(db, 'userTypes'));
        typesData = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      setUserTypes(typesData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const createDefaultTypes = async () => {
    const defaults = [
      { name: 'Agência',    order: 1, systemRole: 'equipe' },
      { name: 'Cliente',    order: 2, systemRole: 'cliente' },
      { name: 'Fornecedor', order: 3, systemRole: 'fornecedor' },
    ];
    for (const t of defaults) {
      await addDoc(collection(db, 'userTypes'), { ...t, createdAt: new Date() });
    }
  };

  // ── TIPO ─────────────────────────────────────────────────────────────────
  const handleAddType = async () => {
    if (!newTypeName.trim()) { alert('Digite o nome do tipo'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'userTypes'), {
        name: newTypeName.trim(),
        systemRole: newTypeSystemRole,
        order: userTypes.length + 1,
        createdAt: new Date(),
      });
      setNewTypeName('');
      setNewTypeSystemRole('none');
      setShowTypeModal(false);
      loadData();
    } catch (err) { alert('Erro ao criar tipo'); }
    finally { setSaving(false); }
  };

  const handleDeleteType = async (typeId) => {
    if (!window.confirm('Excluir este tipo e todos os cargos vinculados?')) return;
    const typeRoles = roles.filter(r => r.userTypeId === typeId);
    for (const role of typeRoles) await deleteDoc(doc(db, 'roles', role.id));
    await deleteDoc(doc(db, 'userTypes', typeId));
    if (selectedType === typeId) setSelectedType(null);
    loadData();
  };

  // ── CARGO ─────────────────────────────────────────────────────────────────
  const handleAddRole = async () => {
    if (!newRoleName.trim()) { alert('Digite o nome do cargo'); return; }
    if (!selectedType) { alert('Selecione um tipo de usuário primeiro'); return; }
    setSaving(true);
    try {
      const typeRoles = roles.filter(r => r.userTypeId === selectedType);
      await addDoc(collection(db, 'roles'), {
        name: newRoleName.trim(),
        userTypeId: selectedType,
        userTypeName: userTypes.find(t => t.id === selectedType)?.name || '',
        order: typeRoles.length + 1,
        createdAt: new Date(),
      });
      setNewRoleName('');
      setShowRoleModal(false);
      loadData();
    } catch (err) { alert('Erro ao criar cargo'); }
    finally { setSaving(false); }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Excluir este cargo?')) return;
    await deleteDoc(doc(db, 'roles', roleId));
    loadData();
  };

  const filteredRoles = roles.filter(r => r.userTypeId === selectedType);
  const getSystemRoleLabel = (value) => SYSTEM_ROLES.find(r => r.value === value)?.label || '—';

  // ── styles ────────────────────────────────────────────────────────────────
  const panelStyle = {
    background: 'white', borderRadius: 12, border: '1px solid #e8eaed',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };
  const panelHeader = {
    padding: '14px 18px', borderBottom: '1px solid #f0f2f5',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#fafbfc', flexShrink: 0,
  };
  const panelTitle = {
    fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
    textTransform: 'uppercase', color: '#8a9bb0',
  };
  const addBtn = {
    width: 26, height: 26, borderRadius: 6, border: '1px solid #e0e0e0',
    background: 'none', cursor: 'pointer', fontSize: 18, color: '#667eea',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, transition: 'all 0.15s', fontFamily: 'Outfit, sans-serif',
  };
  const itemStyle = (active) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
    transition: 'all 0.15s', marginBottom: 2,
    background: active ? 'rgba(102,126,234,0.08)' : 'none',
  });

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#8a9bb0', fontFamily: 'Outfit, sans-serif' }}>
      Carregando...
    </div>
  );

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1e293b', margin: 0 }}>Gestão de Acessos</h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Configure tipos de usuário e cargos</p>
      </div>

      {/* 2 painéis */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flex: 1, minHeight: 0 }}>

        {/* PAINEL 1 — TIPOS */}
        <div style={panelStyle}>
          <div style={panelHeader}>
            <span style={panelTitle}>Tipo de Usuário</span>
            <button style={addBtn} onClick={() => setShowTypeModal(true)} title="Novo tipo">+</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {userTypes.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#ccc' }}>Nenhum tipo cadastrado</div>
            ) : userTypes.map(t => (
              <div key={t.id} style={itemStyle(selectedType === t.id)}
                onClick={() => setSelectedType(t.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: selectedType === t.id ? 500 : 400, color: selectedType === t.id ? '#667eea' : '#2c3e50' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                    {getSystemRoleLabel(t.systemRole || 'none')}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: selectedType === t.id ? '#667eea' : '#ccc', marginRight: 6 }}>›</span>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteType(t.id); }}
                  style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#e74c3c'; e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.opacity = '0'; }}
                >×</button>
              </div>
            ))}
          </div>
        </div>

        {/* PAINEL 2 — CARGOS */}
        <div style={panelStyle}>
          <div style={panelHeader}>
            <span style={panelTitle}>
              Cargo
              {selectedType && <span style={{ marginLeft: 8, color: '#667eea', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                — {userTypes.find(t => t.id === selectedType)?.name}
              </span>}
            </span>
            <button style={{ ...addBtn, opacity: selectedType ? 1 : 0.3, cursor: selectedType ? 'pointer' : 'not-allowed' }}
              onClick={() => selectedType && setShowRoleModal(true)} title="Novo cargo">+</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {!selectedType ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#ccc' }}>Selecione um tipo</div>
            ) : filteredRoles.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#ccc' }}>Nenhum cargo cadastrado</div>
            ) : filteredRoles.map(r => (
              <div key={r.id} style={itemStyle(false)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#2c3e50' }}>{r.name}</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteRole(r.id); }}
                  style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#e74c3c'; e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.opacity = '0'; }}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL — NOVO TIPO */}
      {showTypeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowTypeModal(false)}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 20 }}>Novo Tipo de Usuário</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Nome *</label>
              <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddType()}
                placeholder="Ex: Agência, Cliente, Parceiro..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, fontFamily: 'Outfit, sans-serif', boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Função no Sistema *</label>
              <select value={newTypeSystemRole} onChange={e => setNewTypeSystemRole(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, fontFamily: 'Outfit, sans-serif', boxSizing: 'border-box', outline: 'none', background: 'white' }}>
                {SYSTEM_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Define qual tela este tipo acessa ao fazer login.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowTypeModal(false)}
                style={{ flex: 1, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: 'none', color: '#64748b', fontFamily: 'Outfit, sans-serif', fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleAddType} disabled={saving}
                style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                {saving ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL — NOVO CARGO */}
      {showRoleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowRoleModal(false)}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Novo Cargo</h3>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
              Tipo: <strong style={{ color: '#667eea' }}>{userTypes.find(t => t.id === selectedType)?.name}</strong>
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>Nome do Cargo *</label>
              <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddRole()}
                placeholder="Ex: Coordenador, Planner, Pré-Produtor..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, fontFamily: 'Outfit, sans-serif', boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowRoleModal(false)}
                style={{ flex: 1, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: 'none', color: '#64748b', fontFamily: 'Outfit, sans-serif', fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleAddRole} disabled={saving}
                style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                {saving ? 'Criando...' : 'Criar Cargo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
