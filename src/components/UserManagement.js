import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function UserManagement() {
  const [users, setUsers]           = useState([]);
  const [userTypes, setUserTypes]   = useState([]);
  const [roles, setRoles]           = useState([]);
  const [suppliers, setSuppliers]   = useState([]);
  const [projects, setProjects]     = useState([]);
  const [tenants, setTenants]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTenant, setFilterTenant] = useState('');

  const emptyForm = {
    name: '', email: '', phone: '', cpf: '', city: '', state: '', companyName: '',
    password: '', userTypeId: '', userTypeName: '', systemRole: 'none',
    roleId: '', roleName: '', active: true, selectedProjects: [],
  };
  const [form, setForm] = useState(emptyForm);

  const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersSnap, typesSnap, rolesSnap, suppliersSnap, budgetsSnap, tenantsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'userTypes')),
        getDocs(collection(db, 'roles')),
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'budgets')),
        getDocs(collection(db, 'tenants')),
      ]);
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUserTypes(typesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order||0)-(b.order||0)));
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order||0)-(b.order||0)));
      setSuppliers(suppliersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(budgetsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.status === 'approved'));
      setTenants(tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (user) => {
    setSelectedUser(user);
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      cpf: user.cpf || '',
      city: user.city || '',
      state: user.state || '',
      companyName: user.companyName || '',
      password: '',
      userTypeId: user.userTypeId || '',
      userTypeName: user.userTypeName || '',
      systemRole: user.systemRole || 'none',
      roleId: user.roleId || '',
      roleName: user.roleName || '',
      active: user.active !== undefined ? user.active : true,
      selectedProjects: user.projects?.map(p => p.projectId) || [],
    });
  };

  const handleNew = () => { setSelectedUser(null); setForm(emptyForm); };

  const setF = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const handleTypeChange = (typeId) => {
    const t = userTypes.find(t => t.id === typeId);
    setForm(p => ({ ...p, userTypeId: typeId, userTypeName: t?.name || '', systemRole: t?.systemRole || 'none', roleId: '', roleName: '' }));
  };

  const handleRoleChange = (roleId) => {
    const r = roles.find(r => r.id === roleId);
    setForm(p => ({ ...p, roleId, roleName: r?.name || '' }));
  };

  const toggleProject = (projectId) => {
    setForm(p => ({
      ...p,
      selectedProjects: p.selectedProjects.includes(projectId)
        ? p.selectedProjects.filter(id => id !== projectId)
        : [...p.selectedProjects, projectId],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim())     { alert('Nome é obrigatório'); return; }
    if (!form.email.trim())    { alert('Email é obrigatório'); return; }
    if (!form.userTypeId)      { alert('Selecione um tipo de usuário'); return; }
    if (!form.roleId)          { alert('Selecione um cargo'); return; }
    if (!selectedUser && !form.password) { alert('Senha é obrigatória para novo usuário'); return; }

    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        cpf: form.cpf.trim(),
        city: form.city.trim(),
        state: form.state,
        companyName: form.companyName.trim(),
        userTypeId: form.userTypeId,
        userTypeName: form.userTypeName,
        systemRole: form.systemRole,
        roleId: form.roleId,
        roleName: form.roleName,
        active: form.active,
        projects: form.selectedProjects.map(pid => {
          const p = projects.find(p => p.id === pid);
          return { projectId: pid, projectName: p?.eventTypeName || 'Projeto', status: p?.status || 'active', joinedAt: new Date() };
        }),
        updatedAt: new Date(),
      };

      if (selectedUser) {
        if (form.password.trim()) data.password = form.password;
        await updateDoc(doc(db, 'users', selectedUser.id), data);
        alert('Usuário atualizado!');
      } else {
        data.password = form.password;
        data.createdAt = new Date();
        await addDoc(collection(db, 'users'), data);
        alert('Usuário criado!');
      }
      await loadData();
      handleNew();
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Excluir ${selectedUser.name}?`)) return;
    try {
      await deleteDoc(doc(db, 'users', selectedUser.id));
      await loadData();
      handleNew();
    } catch (e) { alert('Erro ao excluir.'); }
  };

  const filteredUsers = users.filter(u => {
    const matchSearch = u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType   = !filterType || u.userTypeId === filterType;
    const matchTenant = !filterTenant || (filterTenant === '__sem_tenant__' ? !u.tenantId : u.tenantId === filterTenant);
    return matchSearch && matchType && matchTenant;
  });

  const filteredRoles = roles.filter(r => r.userTypeId === form.userTypeId);
  const supplier = form.systemRole === 'fornecedor'
    ? suppliers.find(s => s.userId === selectedUser?.id || s.email === form.email)
    : null;

  // ── styles ────────────────────────────────────────────────────────────────
  const inp = {
    padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
    fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%',
    boxSizing: 'border-box', outline: 'none', background: 'white', color: '#1e293b',
  };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };
  const sectionTitle = {
    fontSize: 11, fontWeight: 700, color: '#00E5C4', letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 14, paddingBottom: 10,
    borderBottom: '1px solid #f0f2f5',
  };

  const ROLE_COLORS = {
    equipe:    { bg: 'rgba(102,126,234,0.1)',  color: '#667eea' },
    cliente:   { bg: 'rgba(0,229,196,0.1)',    color: '#00E5C4' },
    fornecedor:{ bg: 'rgba(255,167,38,0.1)',   color: '#FFA726' },
    admin:     { bg: 'rgba(239,68,68,0.1)',    color: '#ef4444' },
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, fontFamily: 'Outfit, sans-serif', color: '#7BAFD4' }}>
      Carregando...
    </div>
  );

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1e293b', margin: 0 }}>Cadastros</h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Gerencie usuários da plataforma</p>
      </div>

      {/* Layout 2 painéis */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, flex: 1, minHeight: 0 }}>

        {/* ── PAINEL 1: LISTA ── */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Usuários ({filteredUsers.length})</span>
            <button onClick={handleNew} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              + Novo
            </button>
          </div>

          {/* Filtros */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f2f5', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              placeholder="Buscar por nome ou email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ ...inp, fontSize: 12, padding: '8px 12px' }}
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inp, fontSize: 12, padding: '8px 12px' }}>
              <option value="">Todos os tipos</option>
              {userTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {tenants.length > 0 && (
              <select value={filterTenant} onChange={e => setFilterTenant(e.target.value)} style={{ ...inp, fontSize: 12, padding: '8px 12px' }}>
                <option value="">Todos os tenants</option>
                <option value="__sem_tenant__">Sem tenant (Realize)</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            )}
          </div>

          {/* Lista */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {filteredUsers.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum usuário encontrado</div>
            ) : filteredUsers.map(user => {
              const rc = ROLE_COLORS[user.systemRole] || { bg: '#f1f5f9', color: '#64748b' };
              const isSelected = selectedUser?.id === user.id;
              return (
                <div key={user.id} onClick={() => handleSelect(user)}
                  style={{
                    padding: '11px 14px', borderRadius: 10, marginBottom: 4, cursor: 'pointer',
                    border: `1px solid ${isSelected ? '#00E5C4' : '#f0f2f5'}`,
                    background: isSelected ? 'rgba(0,229,196,0.04)' : 'white',
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{user.name}</div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: rc.bg, color: rc.color, flexShrink: 0, marginLeft: 6 }}>
                      {user.systemRole || 'none'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{user.email}</div>
                  {user.roleName && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{user.roleName}</div>}
                  {user.tenantId && (
                    <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 3, fontWeight: 500 }}>
                      🏢 {tenants.find(t => t.id === user.tenantId)?.nome || user.tenantId}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: user.active ? '#10b981' : '#ef4444' }} />
                    <span style={{ fontSize: 10, color: user.active ? '#10b981' : '#ef4444' }}>{user.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── PAINEL 2: FORMULÁRIO ── */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
              {selectedUser ? `Editando: ${selectedUser.name}` : 'Novo Usuário'}
            </span>
            {selectedUser && (
              <button onClick={handleDelete} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                Excluir
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

              {/* Coluna esquerda */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Vínculo */}
                <div>
                  <div style={sectionTitle}>Vínculo</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={lbl}>Tipo de Usuário *</label>
                      <select value={form.userTypeId} onChange={e => handleTypeChange(e.target.value)} style={inp}>
                        <option value="">Selecione um tipo...</option>
                        {userTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Cargo *</label>
                      <select value={form.roleId} onChange={e => handleRoleChange(e.target.value)} style={inp} disabled={!form.userTypeId}>
                        <option value="">Selecione um cargo...</option>
                        {filteredRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {form.userTypeId && filteredRoles.length === 0 && (
                        <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>Nenhum cargo para este tipo. Cadastre em Gestão de Acessos.</p>
                      )}
                    </div>
                    <div>
                      <label style={lbl}>Status</label>
                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        {[true, false].map(v => (
                          <button key={String(v)} onClick={() => setF('active', v)}
                            style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${form.active === v ? (v ? '#10b981' : '#ef4444') : '#e2e8f0'}`, background: form.active === v ? (v ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)') : 'white', color: form.active === v ? (v ? '#10b981' : '#ef4444') : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                            {v ? 'Ativo' : 'Inativo'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dados Pessoais */}
                <div>
                  <div style={sectionTitle}>Dados Pessoais</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={lbl}>Nome Completo *</label>
                      <input value={form.name} onChange={e => setF('name', e.target.value)} style={inp} placeholder="Nome completo" />
                    </div>
                    <div>
                      <label style={lbl}>Email *</label>
                      <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} style={inp} placeholder="email@exemplo.com" />
                    </div>
                    <div>
                      <label style={lbl}>Telefone</label>
                      <input value={form.phone} onChange={e => setF('phone', e.target.value)} style={inp} placeholder="(11) 99999-9999" />
                    </div>
                    <div>
                      <label style={lbl}>CPF</label>
                      <input value={form.cpf} onChange={e => setF('cpf', e.target.value)} style={inp} placeholder="000.000.000-00" />
                    </div>
                    <div>
                      <label style={lbl}>Senha {!selectedUser && '*'}</label>
                      <input type="password" value={form.password} onChange={e => setF('password', e.target.value)} style={inp}
                        placeholder={selectedUser ? 'Deixe vazio para não alterar' : 'Mínimo 6 caracteres'} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Coluna direita */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Localização / Empresa */}
                <div>
                  <div style={sectionTitle}>Empresa / Localização</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={lbl}>Empresa / Organização</label>
                      <input value={form.companyName} onChange={e => setF('companyName', e.target.value)} style={inp} placeholder="Nome da empresa" />
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
                </div>

                {/* Serviços do fornecedor */}
                {supplier && (
                  <div>
                    <div style={sectionTitle}>Serviços do Fornecedor</div>
                    {supplier.serviceNames?.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {supplier.serviceNames.map((sn, i) => (
                          <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,167,38,0.1)', color: '#FFA726', border: '1px solid rgba(255,167,38,0.2)', fontWeight: 500 }}>{sn}</span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhum serviço informado</p>
                    )}
                    {supplier.description && (
                      <p style={{ fontSize: 12, color: '#64748b', marginTop: 10, lineHeight: 1.5, background: '#f8faff', borderRadius: 6, padding: '8px 10px' }}>{supplier.description}</p>
                    )}
                    <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                      Status: <strong style={{ color: supplier.status === 'homologado' ? '#10b981' : '#f59e0b' }}>{supplier.status}</strong>
                      {supplier.city && <span style={{ marginLeft: 10 }}>{supplier.city}{supplier.state ? `/${supplier.state}` : ''}</span>}
                    </div>
                  </div>
                )}

                {/* Projetos vinculados */}
                <div>
                  <div style={sectionTitle}>Projetos Vinculados</div>
                  {projects.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhum projeto aprovado</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                      {projects.map(p => {
                        const sel = form.selectedProjects.includes(p.id);
                        return (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${sel ? 'rgba(0,229,196,0.3)' : '#f0f2f5'}`, background: sel ? 'rgba(0,229,196,0.04)' : 'white', cursor: 'pointer' }}>
                            <input type="checkbox" checked={sel} onChange={() => toggleProject(p.id)} style={{ accentColor: '#00E5C4' }} />
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{p.eventTypeName || 'Projeto'}</div>
                              {p.jobCode && <div style={{ fontSize: 10, color: '#94a3b8' }}>{p.jobCode}</div>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer com botões */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f2f5', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={handleNew} disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              {saving ? 'Salvando...' : selectedUser ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
