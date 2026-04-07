import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/UserManagement.css';

function UserManagement() {
  const [users, setUsers] = useState([]);
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
    userType: 'cliente', // cliente, equipe, fornecedor
    companyId: '',
    companyName: '',
    roleId: '',
    roleName: '',
    active: true,
    selectedProjects: []
  });

  const [customPermissions, setCustomPermissions] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(usersData);

      const rolesSnapshot = await getDocs(collection(db, 'roles'));
      const rolesData = rolesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRoles(rolesData);

      const companiesSnapshot = await getDocs(collection(db, 'companies'));
      const companiesData = companiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCompanies(companiesData);

      const budgetsSnapshot = await getDocs(collection(db, 'budgets'));
      const projectsData = budgetsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(b => b.status === 'approved');
      setProjects(projectsData);

      const questionsSnapshot = await getDocs(collection(db, 'questions'));
      const questionsData = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuestions(questionsData);

      const tasksSnapshot = await getDocs(collection(db, 'tasks'));
      const tasksData = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(tasksData);

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
      userType: user.userType || 'cliente',
      companyId: user.companyId || '',
      companyName: user.companyName || '',
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
      userType: 'cliente',
      companyId: '',
      companyName: '',
      roleId: '',
      roleName: '',
      active: true,
      selectedProjects: []
    });
    setCustomPermissions({});
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'userType') {
      // Ao mudar tipo, limpa empresa e cargo
      setFormData({
        ...formData,
        userType: value,
        companyId: '',
        companyName: '',
        roleId: '',
        roleName: ''
      });
      setCustomPermissions({});
    } else if (name === 'companyId') {
      const selectedCompany = companies.find(c => c.id === value);
      setFormData({
        ...formData,
        companyId: value,
        companyName: selectedCompany?.name || ''
      });
    } else if (name === 'roleId') {
      const selectedRole = roles.find(r => r.id === value);
      setFormData({
        ...formData,
        roleId: value,
        roleName: selectedRole?.name || ''
      });
      if (selectedRole) {
        setCustomPermissions(selectedRole.permissions || {});
      }
    } else {
      setFormData({
        ...formData,
        [name]: type === 'checkbox' ? checked : value
      });
    }
  };

  const handleProjectToggle = (projectId) => {
    const selectedProjects = formData.selectedProjects.includes(projectId)
      ? formData.selectedProjects.filter(id => id !== projectId)
      : [...formData.selectedProjects, projectId];
    
    setFormData({ ...formData, selectedProjects });
  };

  const handlePermissionChange = (itemType, itemId, permissionType) => {
    const newPermissions = { ...customPermissions };
    if (!newPermissions[itemType]) {
      newPermissions[itemType] = {};
    }
    newPermissions[itemType][itemId] = permissionType;
    setCustomPermissions(newPermissions);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Nome é obrigatório');
      return;
    }
    if (!formData.email.trim()) {
      alert('Email é obrigatório');
      return;
    }
    if (!formData.userType) {
      alert('Selecione um tipo de usuário');
      return;
    }
    if ((formData.userType === 'cliente' || formData.userType === 'fornecedor') && !formData.companyId) {
      alert('Selecione uma empresa');
      return;
    }
    if (!formData.roleId) {
      alert('Selecione um cargo');
      return;
    }
    if (!selectedUser && !formData.password) {
      alert('Senha é obrigatória para novo usuário');
      return;
    }

    setSaving(true);
    try {
      const userData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        cpf: formData.cpf,
        userType: formData.userType, // ← String direto!
        companyId: formData.companyId,
        companyName: formData.companyName,
        roleId: formData.roleId,
        roleName: formData.roleName,
        active: formData.active,
        projects: formData.selectedProjects.map(projId => {
          const project = projects.find(p => p.id === projId);
          return {
            projectId: projId,
            projectName: project?.eventTypeName || 'Projeto',
            status: project?.status || 'active',
            joinedAt: new Date()
          };
        }),
        permissions: customPermissions,
        updatedAt: new Date()
      };

      if (selectedUser) {
        // Só atualiza a senha se o campo foi preenchido
        if (formData.password.trim()) {
          userData.password = formData.password;
        }
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

  const getPermissionValue = (itemType, itemId) => {
    return customPermissions[itemType]?.[itemId] || 'none';
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !filterType || user.userType === filterType;
    return matchesSearch && matchesType;
  });

  // Filtrar empresas por tipo
  const filteredCompanies = companies.filter(c => 
    c.type === formData.userType && c.active
  );

  // Filtrar cargos por tipo
  const filteredRoles = roles.filter(r => {
    // Se não tem userTypes carregados, mostra todos
    return true; // Por enquanto mostra todos os cargos
  });

  if (loading) {
    return (
      <div className="user-management-container">
        <div className="loading">Carregando...</div>
      </div>
    );
  }

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
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              <option value="">Todos os tipos</option>
              <option value="cliente">Clientes</option>
              <option value="equipe">Equipe</option>
              <option value="fornecedor">Fornecedores</option>
            </select>
          </div>

          <div className="users-list">
            {filteredUsers.length === 0 ? (
              <div className="empty-state"><p>Nenhum usuário encontrado</p></div>
            ) : (
              filteredUsers.map(user => (
                <div
                  key={user.id}
                  className={`user-card ${selectedUser?.id === user.id ? 'selected' : ''}`}
                  onClick={() => handleSelectUser(user)}
                >
                  <div className="user-card-header">
                    <h3>{user.name}</h3>
                    <span className={`status-badge ${user.active ? 'active' : 'inactive'}`}>
                      {user.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="user-role">{user.roleName}</p>
                  <p className="user-type">{user.userType === 'cliente' ? 'Cliente' : user.userType === 'equipe' ? 'Equipe' : 'Fornecedor'}</p>
                  {user.companyName && <p className="user-company">{user.companyName}</p>}
                  <p className="user-email">{user.email}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PAINEL 2: CADASTRO */}
        <div className="panel panel-form">
          <div className="panel-header">
            <h2>{selectedUser ? 'Editar Usuário' : 'Novo Usuário'}</h2>
          </div>

          <div className="form-content">
            <div className="form-section">
              <h3>Tipo e Empresa</h3>

              <div className="form-group">
                <label>Tipo de Usuário *</label>
                <select name="userType" value={formData.userType} onChange={handleChange}>
                  <option value="cliente">Cliente</option>
                  <option value="equipe">Equipe</option>
                  <option value="fornecedor">Fornecedor</option>
                </select>
              </div>

              {(formData.userType === 'cliente' || formData.userType === 'fornecedor') && (
                <div className="form-group">
                  <label>Empresa *</label>
                  <select name="companyId" value={formData.companyId} onChange={handleChange}>
                    <option value="">Selecione uma empresa...</option>
                    {filteredCompanies.map(company => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </select>
                  {filteredCompanies.length === 0 && (
                    <p className="helper-text">Nenhuma empresa cadastrada para este tipo</p>
                  )}
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>Dados Pessoais</h3>

              <div className="form-group">
                <label>Nome Completo *</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Cargo *</label>
                <select name="roleId" value={formData.roleId} onChange={handleChange}>
                  <option value="">Selecione um cargo...</option>
                  {filteredRoles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
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
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder={selectedUser ? 'Deixe vazio para não alterar' : 'Senha inicial'}
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} />
                  Usuário ativo
                </label>
              </div>
            </div>

            <div className="form-section">
              <h3>Projetos Vinculados</h3>
              <div className="projects-list">
                {projects.length === 0 ? (
                  <p className="empty-text">Nenhum projeto aprovado</p>
                ) : (
                  projects.map(project => (
                    <label key={project.id} className="project-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.selectedProjects.includes(project.id)}
                        onChange={() => handleProjectToggle(project.id)}
                      />
                      <div className="project-info">
                        <span className="project-name">{project.eventTypeName || 'Projeto'}</span>
                        <span className="project-number">#{project.budgetNumber}</span>
                      </div>
                    </label>
                  ))
                )}
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
            {formData.roleName && <span className="role-badge">Cargo: {formData.roleName}</span>}
          </div>

          <div className="permissions-content">
            {!formData.roleId ? (
              <div className="empty-state"><p>Selecione um cargo para configurar permissões</p></div>
            ) : (
              <>
                <div className="permission-section">
                  <h3>Perguntas</h3>
                  <div className="permissions-table">
                    <div className="table-header">
                      <div className="col-item">Item</div>
                      <div className="col-permission">Visualiza</div>
                      <div className="col-permission">Altera/Edita</div>
                    </div>
                    {questions.map(question => (
                      <div key={question.id} className="table-row">
                        <div className="col-item">
                          <span className="item-text">{question.text}</span>
                        </div>
                        <div className="col-permission">
                          <input
                            type="radio"
                            name={`question-${question.id}`}
                            checked={getPermissionValue('questions', question.id) === 'view'}
                            onChange={() => handlePermissionChange('questions', question.id, 'view')}
                          />
                        </div>
                        <div className="col-permission">
                          <input
                            type="radio"
                            name={`question-${question.id}`}
                            checked={getPermissionValue('questions', question.id) === 'answer'}
                            onChange={() => handlePermissionChange('questions', question.id, 'answer')}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="permission-section">
                  <h3>Tarefas</h3>
                  <div className="permissions-table">
                    <div className="table-header">
                      <div className="col-item">Item</div>
                      <div className="col-permission">Visualiza</div>
                      <div className="col-permission">Altera/Edita</div>
                    </div>
                    {tasks.map(task => (
                      <div key={task.id} className="table-row">
                        <div className="col-item">
                          <span className="item-text">{task.name}</span>
                        </div>
                        <div className="col-permission">
                          <input
                            type="radio"
                            name={`task-${task.id}`}
                            checked={getPermissionValue('tasks', task.id) === 'view'}
                            onChange={() => handlePermissionChange('tasks', task.id, 'view')}
                          />
                        </div>
                        <div className="col-permission">
                          <input
                            type="radio"
                            name={`task-${task.id}`}
                            checked={getPermissionValue('tasks', task.id) === 'execute'}
                            onChange={() => handlePermissionChange('tasks', task.id, 'execute')}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserManagement;
