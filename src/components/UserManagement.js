import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/UserManagement.css';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [userTypes, setUserTypes] = useState([]);
  const [areas, setAreas] = useState([]);
  const [roles, setRoles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cpf: '',
    password: '',
    userTypeId: '',
    userTypeName: '',
    companyId: '',
    companyName: '',
    areaId: '',
    areaName: '',
    roleId: '',
    roleName: '',
    active: true,
    selectedProjects: []
  });

  const [customPermissions, setCustomPermissions] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersSnap, typesSnap, areasSnap, rolesSnap, companiesSnap, budgetsSnap, questionsSnap, tasksSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'userTypes')),
        getDocs(collection(db, 'areas')),
        getDocs(collection(db, 'roles')),
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'budgets')),
        getDocs(collection(db, 'questions')),
        getDocs(collection(db, 'tasks')),
      ]);
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUserTypes(typesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setAreas(areasSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setCompanies(companiesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(budgetsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.status === 'approved'));
      setQuestions(questionsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTasks(tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      cpf: user.cpf || '',
      password: '',
      userTypeId: user.userTypeId || '',
      userTypeName: user.userTypeName || '',
      companyId: user.companyId || '',
      companyName: user.companyName || '',
      areaId: user.areaId || '',
      areaName: user.areaName || '',
      roleId: user.roleId || '',
      roleName: user.roleName || '',
      active: user.active !== undefined ? user.active : true,
      selectedProjects: user.projects?.map(p => p.projectId) || []
    });
    setCustomPermissions(user.permissions || {});
  };

  const handleNewUser = () => {
    setSelectedUser(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      cpf: '',
      password: '',
      userTypeId: '',
      userTypeName: '',
      companyId: '',
      companyName: '',
      areaId: '',
      areaName: '',
      roleId: '',
      roleName: '',
      active: true,
      selectedProjects: []
    });
    setCustomPermissions({});
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === 'userTypeId') {
      const selected = userTypes.find(t => t.id === value);
      setFormData({
        ...formData,
        userTypeId: value,
        userTypeName: selected?.name || '',
        companyId: '',
        companyName: '',
        areaId: '',
        areaName: '',
        roleId: '',
        roleName: ''
      });
      setCustomPermissions({});
    } else if (name === 'areaId') {
      const selected = areas.find(a => a.id === value);
      setFormData({
        ...formData,
        areaId: value,
        areaName: selected?.name || '',
        roleId: '',
        roleName: ''
      });
      setCustomPermissions({});
    } else if (name === 'companyId') {
      const selected = companies.find(c => c.id === value);
      setFormData({ ...formData, companyId: value, companyName: selected?.name || '' });
    } else if (name === 'roleId') {
      const selected = roles.find(r => r.id === value);
      setFormData({ ...formData, roleId: value, roleName: selected?.name || '' });
      if (selected) setCustomPermissions(selected.permissions || {});
    } else {
      setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    }
  };

  const handleProjectToggle = (projectId) => {
    const selectedProjects = formData.selectedProjects.includes(projectId)
      ? formData.selectedProjects.filter(id => id !== projectId)
      : [...formData.selectedProjects, projectId];
    setFormData({ ...formData, selectedProjects });
  };

  const handlePermissionChange = (field, value) => {
    const newPerms = { ...customPermissions };
    const parts = field.split('.');
    let obj = newPerms;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    setCustomPermissions(newPerms);
  };

  const getPermissionValue = (field) => {
    const parts = field.split('.');
    let val = customPermissions;
    for (const p of parts) { val = val?.[p]; }
    return val ?? (field.includes('budgets') || field.includes('documents') ? false : 'none');
  };

  const handleDefaultPermissions = () => {
    const role = roles.find(r => r.id === formData.roleId);
    if (role) setCustomPermissions(role.permissions || {});
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { alert('Nome é obrigatório'); return; }
    if (!formData.email.trim()) { alert('Email é obrigatório'); return; }
    if (!formData.userTypeId) { alert('Selecione um tipo de usuário'); return; }
    if (!formData.roleId) { alert('Selecione um cargo'); return; }
    if (!selectedUser && !formData.password) { alert('Senha é obrigatória para novo usuário'); return; }

    setSaving(true);
    try {
      const userData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        cpf: formData.cpf,
        userType: formData.userTypeName.toLowerCase(),
        userTypeId: formData.userTypeId,
        userTypeName: formData.userTypeName,
        companyId: formData.companyId,
        companyName: formData.companyName,
        areaId: formData.areaId,
        areaName: formData.areaName,
        roleId: formData.roleId,
        roleName: formData.roleName,
        active: formData.active,
        projects: formData.selectedProjects.map(projId => {
          const project = projects.find(p => p.id === projId);
          return { projectId: projId, projectName: project?.eventTypeName || 'Projeto', status: project?.status || 'active', joinedAt: new Date() };
        }),
        permissions: customPermissions,
        updatedAt: new Date()
      };

      if (selectedUser) {
        if (formData.password.trim()) userData.password = formData.password;
        await updateDoc(doc(db, 'users', selectedUser.id), userData);
        alert('Usuário atualizado com sucesso!');
      } else {
        userData.createdAt = new Date();
        userData.password = formData.password;
        await addDoc(collection(db, 'users'), userData);
        alert('Usuário criado com sucesso!');
      }

      await loadData();
      handleNewUser();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar usuário');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedUser.name}?`)) return;
    try {
      await deleteDoc(doc(db, 'users', selectedUser.id));
      alert('Usuário excluído com sucesso!');
      await loadData();
      handleNewUser();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir usuário');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !filterType || user.userTypeId === filterType;
    return matchesSearch && matchesType;
  });

  const filteredAreas = areas.filter(a => a.userTypeId === formData.userTypeId);
  const filteredRoles = roles.filter(r => r.areaId === formData.areaId);
  const filteredCompanies = companies.filter(c => c.active);

  if (loading) return (
    <div className="user-management-container">
      <div className="loading">Carregando...</div>
    </div>
  );

  return (
    <div className="user-management-container">
      <div className="user-management-header">
        <h1>Gestão de Cadastros</h1>
        <p className="subtitle">Gerencie usuários e permissões</p>
      </div>

      <div className="three-panel-layout">

        {/* PAINEL 1: LISTA */}
        <div className="panel panel-list">
          <div className="panel-header">
            <h2>Usuários</h2>
            <button className="btn-new" onClick={handleNewUser}>+ Novo</button>
          </div>
          <div className="search-filters">
            <input type="text" placeholder="Buscar..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
              <option value="">Todos os tipos</option>
              {userTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="users-list">
            {filteredUsers.length === 0 ? (
              <div className="empty-state"><p>Nenhum usuário encontrado</p></div>
            ) : filteredUsers.map(user => (
              <div key={user.id}
                className={`user-card ${selectedUser?.id === user.id ? 'selected' : ''}`}
                onClick={() => handleSelectUser(user)}>
                <div className="user-card-header">
                  <h3>{user.name}</h3>
                  <span className={`status-badge ${user.active ? 'active' : 'inactive'}`}>
                    {user.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="user-role">{user.roleName}</p>
                {user.areaName && <p className="user-area">{user.areaName}</p>}
                <p className="user-type">{user.userTypeName || user.userType}</p>
                {user.companyName && <p className="user-company">{user.companyName}</p>}
                <p className="user-email">{user.email}</p>
              </div>
            ))}
          </div>
        </div>

        {/* PAINEL 2: CADASTRO */}
        <div className="panel panel-form">
          <div className="panel-header">
            <h2>{selectedUser ? 'Editar Usuário' : 'Novo Usuário'}</h2>
          </div>
          <div className="form-content">

            {/* SEÇÃO: VÍNCULO */}
            <div className="form-section">
              <h3>Vínculo</h3>

              <div className="form-group">
                <label>Tipo de Usuário *</label>
                <select name="userTypeId" value={formData.userTypeId} onChange={handleChange}>
                  <option value="">Selecione um tipo...</option>
                  {userTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {formData.userTypeId && (
                <div className="form-group">
                  <label>Empresa</label>
                  <select name="companyId" value={formData.companyId} onChange={handleChange}>
                    <option value="">Selecione uma empresa...</option>
                    {filteredCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {formData.userTypeId && filteredAreas.length > 0 && (
                <div className="form-group">
                  <label>Área *</label>
                  <select name="areaId" value={formData.areaId} onChange={handleChange}>
                    <option value="">Selecione uma área...</option>
                    {filteredAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {formData.userTypeId && filteredAreas.length === 0 && (
                <p className="helper-text">Nenhuma área cadastrada para este tipo. Cadastre em Gestão de Acessos.</p>
              )}

              <div className="form-group">
                <label>Cargo *</label>
                <select name="roleId" value={formData.roleId} onChange={handleChange}
                  disabled={filteredAreas.length > 0 && !formData.areaId}>
                  <option value="">
                    {filteredAreas.length > 0 && !formData.areaId ? 'Selecione uma área primeiro...' : 'Selecione um cargo...'}
                  </option>
                  {filteredRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {formData.areaId && filteredRoles.length === 0 && (
                  <p className="helper-text">Nenhum cargo nesta área. Cadastre em Gestão de Acessos.</p>
                )}
              </div>
            </div>

            {/* SEÇÃO: DADOS PESSOAIS */}
            <div className="form-section">
              <h3>Dados Pessoais</h3>

              <div className="form-group">
                <label>Nome Completo *</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Telefone</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>CPF</label>
                <input type="text" name="cpf" value={formData.cpf} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Senha {!selectedUser && '*'}</label>
                <input type="password" name="password" value={formData.password} onChange={handleChange}
                  placeholder={selectedUser ? 'Deixe vazio para não alterar' : 'Senha inicial'} />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} />
                  Usuário ativo
                </label>
              </div>
            </div>

            {/* SEÇÃO: PROJETOS */}
            <div className="form-section">
              <h3>Projetos Vinculados</h3>
              <div className="projects-list">
                {projects.length === 0 ? (
                  <p className="empty-text">Nenhum projeto aprovado</p>
                ) : projects.map(project => (
                  <label key={project.id} className="project-checkbox">
                    <input type="checkbox"
                      checked={formData.selectedProjects.includes(project.id)}
                      onChange={() => handleProjectToggle(project.id)} />
                    <div className="project-info">
                      <span className="project-name">{project.eventTypeName || 'Projeto'}</span>
                      <span className="project-number">#{project.budgetNumber}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-actions">
              {selectedUser && (
                <button className="btn-delete" onClick={handleDelete} disabled={saving}>Excluir</button>
              )}
              <button className="btn-cancel" onClick={handleNewUser} disabled={saving}>Cancelar</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>

        {/* PAINEL 3: PERMISSÕES */}
        <div className="panel panel-permissions">
          <div className="panel-header">
            <h2>Permissões</h2>
            <div className="permissions-header-right">
              {formData.roleName && <span className="role-badge">{formData.roleName}</span>}
              {formData.roleId && (
                <button className="btn-default" onClick={handleDefaultPermissions} title="Restaurar permissões do cargo">
                  Default
                </button>
              )}
            </div>
          </div>

          <div className="permissions-content">
            {!formData.roleId ? (
              <div className="empty-state"><p>Selecione um cargo para configurar permissões</p></div>
            ) : (
              <>
                {/* Dashboard */}
                <div className="permission-section">
                  <h3>Dashboard</h3>
                  <div className="perm-item">
                    <span className="perm-label">Acesso ao dashboard</span>
                    <div className="perm-options">
                      {['none', 'view'].map(v => (
                        <label key={v}>
                          <input type="radio" name="dashboard"
                            checked={getPermissionValue('dashboard') === v}
                            onChange={() => handlePermissionChange('dashboard', v)} />
                          {v === 'none' ? 'Sem acesso' : 'Visualizar'}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Perguntas */}
                {questions.length > 0 && (
                  <div className="permission-section">
                    <h3>Perguntas</h3>
                    {questions.map(q => (
                      <div key={q.id} className="perm-item">
                        <span className="perm-label">{q.text}</span>
                        <div className="perm-options">
                          {['none', 'view', 'answer', 'confirm'].map(v => (
                            <label key={v}>
                              <input type="radio" name={`q-${q.id}`}
                                checked={getPermissionValue(`questions.${q.id}`) === v}
                                onChange={() => handlePermissionChange(`questions.${q.id}`, v)} />
                              {v === 'none' ? 'Não vê' : v === 'view' ? 'Ver' : v === 'answer' ? 'Responder' : 'Confirmar'}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tarefas */}
                {tasks.length > 0 && (
                  <div className="permission-section">
                    <h3>Tarefas</h3>
                    {tasks.map(t => (
                      <div key={t.id} className="perm-item">
                        <span className="perm-label">{t.name}</span>
                        <div className="perm-options">
                          {['none', 'view', 'execute', 'confirm'].map(v => (
                            <label key={v}>
                              <input type="radio" name={`t-${t.id}`}
                                checked={getPermissionValue(`tasks.${t.id}`) === v}
                                onChange={() => handlePermissionChange(`tasks.${t.id}`, v)} />
                              {v === 'none' ? 'Não vê' : v === 'view' ? 'Ver' : v === 'execute' ? 'Executar' : 'Confirmar'}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Orçamentos */}
                <div className="permission-section">
                  <h3>Orçamentos</h3>
                  <div className="perm-checkbox-group">
                    {[['budgets.view', 'Visualizar'], ['budgets.edit', 'Editar'], ['budgets.approve', 'Aprovar/Rejeitar']].map(([field, label]) => (
                      <label key={field}>
                        <input type="checkbox"
                          checked={!!getPermissionValue(field)}
                          onChange={e => handlePermissionChange(field, e.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Documentos */}
                <div className="permission-section">
                  <h3>Documentos</h3>
                  <div className="perm-checkbox-group">
                    {[['documents.view', 'Visualizar'], ['documents.download', 'Download'], ['documents.upload', 'Upload']].map(([field, label]) => (
                      <label key={field}>
                        <input type="checkbox"
                          checked={!!getPermissionValue(field)}
                          onChange={e => handlePermissionChange(field, e.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <p className="perms-hint">Permissões salvas junto com o usuário</p>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default UserManagement;
