import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/RoleManagement.css';

function RoleManagement() {
  const [view, setView] = useState('types'); // 'types', 'roles', 'permissions'
  const [userTypes, setUserTypes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeIcon, setNewTypeIcon] = useState('');
  const [newRoleName, setNewRoleName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar tipos de usuário
      const typesSnapshot = await getDocs(collection(db, 'userTypes'));
      let typesData = typesSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));

      // Se não existir nenhum, criar os padrões
      if (typesData.length === 0) {
        await createDefaultUserTypes();
        const newTypesSnapshot = await getDocs(collection(db, 'userTypes'));
        typesData = newTypesSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }));
      }

      setUserTypes(typesData);

      // Carregar cargos
      const rolesSnapshot = await getDocs(collection(db, 'roles'));
      const rolesData = rolesSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      setRoles(rolesData);

      // Carregar perguntas
      const questionsSnapshot = await getDocs(collection(db, 'questions'));
      const questionsData = questionsSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      setQuestions(questionsData);

      // Carregar tarefas
      const tasksSnapshot = await getDocs(collection(db, 'tasks'));
      const tasksData = tasksSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      setTasks(tasksData);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const createDefaultUserTypes = async () => {
    const defaultTypes = [
      { name: 'Cliente', icon: '👤', order: 1 },
      { name: 'Equipe', icon: '💼', order: 2 },
      { name: 'Fornecedor', icon: '🏢', order: 3 }
    ];

    for (const type of defaultTypes) {
      await addDoc(collection(db, 'userTypes'), {
        ...type,
        createdAt: new Date()
      });
    }

    // Criar cargos padrão para Equipe
    const equipeSnapshot = await getDocs(collection(db, 'userTypes'));
    const equipeType = equipeSnapshot.docs.find(doc => doc.data().name === 'Equipe');
    
    if (equipeType) {
      const defaultRoles = [
        'Admin',
        'C-Level',
        'Atendimento',
        'Produtor',
        'Criação 3D',
        'Criação',
        'Auxiliar de Produção',
        'Montador'
      ];

      for (let i = 0; i < defaultRoles.length; i++) {
        await addDoc(collection(db, 'roles'), {
          name: defaultRoles[i],
          userTypeId: equipeType.id,
          userTypeName: 'Equipe',
          permissions: {
            dashboard: 'view',
            questions: {},
            tasks: {},
            budgets: { view: true, edit: false, approve: false },
            documents: { view: true, download: true, upload: false }
          },
          order: i + 1,
          createdAt: new Date()
        });
      }
    }
  };

  const handleAddUserType = async () => {
    if (!newTypeName.trim()) {
      alert('Digite o nome do tipo de usuário');
      return;
    }

    try {
      await addDoc(collection(db, 'userTypes'), {
        name: newTypeName,
        icon: newTypeIcon || '👥',
        order: userTypes.length + 1,
        createdAt: new Date()
      });

      setNewTypeName('');
      setNewTypeIcon('');
      setShowTypeModal(false);
      loadData();
      alert('Tipo de usuário criado com sucesso!');
    } catch (error) {
      console.error('Erro ao criar tipo:', error);
      alert('Erro ao criar tipo de usuário');
    }
  };

  const handleDeleteUserType = async (typeId) => {
    if (!window.confirm('Tem certeza que deseja excluir este tipo de usuário? Todos os cargos vinculados também serão excluídos.')) {
      return;
    }

    try {
      // Deletar todos os cargos deste tipo
      const typeRoles = roles.filter(r => r.userTypeId === typeId);
      for (const role of typeRoles) {
        await deleteDoc(doc(db, 'roles', role.id));
      }

      // Deletar o tipo
      await deleteDoc(doc(db, 'userTypes', typeId));
      loadData();
      alert('Tipo de usuário excluído com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir tipo de usuário');
    }
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) {
      alert('Digite o nome do cargo');
      return;
    }

    if (!selectedType) {
      alert('Selecione um tipo de usuário');
      return;
    }

    try {
      const typeData = userTypes.find(t => t.id === selectedType);
      
      await addDoc(collection(db, 'roles'), {
        name: newRoleName,
        userTypeId: selectedType,
        userTypeName: typeData.name,
        permissions: {
          dashboard: 'none',
          questions: {},
          tasks: {},
          budgets: { view: false, edit: false, approve: false },
          documents: { view: false, download: false, upload: false }
        },
        order: roles.filter(r => r.userTypeId === selectedType).length + 1,
        createdAt: new Date()
      });

      setNewRoleName('');
      setShowRoleModal(false);
      loadData();
      alert('Cargo criado com sucesso!');
    } catch (error) {
      console.error('Erro ao criar cargo:', error);
      alert('Erro ao criar cargo');
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Tem certeza que deseja excluir este cargo?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'roles', roleId));
      loadData();
      alert('Cargo excluído com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir cargo');
    }
  };

  const handleUpdatePermission = async (field, value) => {
    if (!selectedRole) return;

    try {
      const roleRef = doc(db, 'roles', selectedRole.id);
      const updatedPermissions = { ...selectedRole.permissions };

      // Atualizar campo específico
      if (field.startsWith('questions.')) {
        const questionId = field.split('.')[1];
        updatedPermissions.questions[questionId] = value;
      } else if (field.startsWith('tasks.')) {
        const taskId = field.split('.')[1];
        updatedPermissions.tasks[taskId] = value;
      } else if (field.startsWith('budgets.')) {
        const budgetField = field.split('.')[1];
        updatedPermissions.budgets[budgetField] = value;
      } else if (field.startsWith('documents.')) {
        const docField = field.split('.')[1];
        updatedPermissions.documents[docField] = value;
      } else {
        updatedPermissions[field] = value;
      }

      await updateDoc(roleRef, {
        permissions: updatedPermissions,
        updatedAt: new Date()
      });

      // Atualizar estado local
      setSelectedRole({ ...selectedRole, permissions: updatedPermissions });
      
      // Atualizar lista de roles
      setRoles(roles.map(r => 
        r.id === selectedRole.id 
          ? { ...r, permissions: updatedPermissions }
          : r
      ));

    } catch (error) {
      console.error('Erro ao atualizar permissão:', error);
      alert('Erro ao atualizar permissão');
    }
  };

  const getTypeRoles = (typeId) => {
    return roles.filter(r => r.userTypeId === typeId);
  };

  const getPermissionValue = (field) => {
    if (!selectedRole) return '';
    
    if (field.startsWith('questions.')) {
      const questionId = field.split('.')[1];
      return selectedRole.permissions.questions[questionId] || 'none';
    } else if (field.startsWith('tasks.')) {
      const taskId = field.split('.')[1];
      return selectedRole.permissions.tasks[taskId] || 'none';
    } else if (field.startsWith('budgets.')) {
      const budgetField = field.split('.')[1];
      return selectedRole.permissions.budgets[budgetField] || false;
    } else if (field.startsWith('documents.')) {
      const docField = field.split('.')[1];
      return selectedRole.permissions.documents[docField] || false;
    }
    
    return selectedRole.permissions[field] || 'none';
  };

  if (loading) {
    return (
      <div className="role-management-container">
        <div className="loading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="role-management-container">
      <div className="role-header">
        <h1>Gestão de Acessos</h1>
        <div className="view-tabs">
          <button 
            className={view === 'types' ? 'active' : ''} 
            onClick={() => setView('types')}
          >
            Tipos de Usuário
          </button>
          <button 
            className={view === 'roles' ? 'active' : ''} 
            onClick={() => setView('roles')}
          >
            Cargos/Funções
          </button>
          <button 
            className={view === 'permissions' ? 'active' : ''} 
            onClick={() => setView('permissions')}
            disabled={!selectedRole}
          >
            Matriz de Permissões
          </button>
        </div>
      </div>

      {/* VIEW: TIPOS DE USUÁRIO */}
      {view === 'types' && (
        <div className="types-view">
          <div className="section-header">
            <h2>Tipos de Usuário</h2>
            <button className="btn-add" onClick={() => setShowTypeModal(true)}>
              + Adicionar Tipo
            </button>
          </div>

          <div className="types-grid">
            {userTypes.map(type => (
              <div key={type.id} className="type-card">
                <div className="type-icon">{type.icon}</div>
                <h3>{type.name}</h3>
                <p>{getTypeRoles(type.id).length} cargo(s)</p>
                <button 
                  className="btn-delete-small"
                  onClick={() => handleDeleteUserType(type.id)}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW: CARGOS */}
      {view === 'roles' && (
        <div className="roles-view">
          <div className="section-header">
            <h2>Cargos/Funções</h2>
            <select 
              value={selectedType || ''} 
              onChange={(e) => setSelectedType(e.target.value)}
              className="type-select"
            >
              <option value="">Selecione um tipo...</option>
              {userTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.icon} {type.name}
                </option>
              ))}
            </select>
            <button 
              className="btn-add" 
              onClick={() => setShowRoleModal(true)}
              disabled={!selectedType}
            >
              + Adicionar Cargo
            </button>
          </div>

          {selectedType && (
            <div className="roles-list">
              <h3>{userTypes.find(t => t.id === selectedType)?.icon} {userTypes.find(t => t.id === selectedType)?.name}</h3>
              <table className="roles-table">
                <thead>
                  <tr>
                    <th>Cargo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {getTypeRoles(selectedType).map(role => (
                    <tr key={role.id}>
                      <td>{role.name}</td>
                      <td>
                        <button 
                          className="btn-edit"
                          onClick={() => {
                            setSelectedRole(role);
                            setView('permissions');
                          }}
                        >
                          Permissões
                        </button>
                        <button 
                          className="btn-delete"
                          onClick={() => handleDeleteRole(role.id)}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW: MATRIZ DE PERMISSÕES */}
      {view === 'permissions' && selectedRole && (
        <div className="permissions-view">
          <div className="permission-header">
            <button className="btn-back" onClick={() => setView('roles')}>
              ← Voltar
            </button>
            <h2>Permissões: {selectedRole.name} ({selectedRole.userTypeName})</h2>
          </div>

          <div className="permissions-content">
            {/* DASHBOARD */}
            <div className="permission-section">
              <h3>Dashboard</h3>
              <div className="permission-options">
                <label>
                  <input 
                    type="radio" 
                    name="dashboard"
                    value="none"
                    checked={getPermissionValue('dashboard') === 'none'}
                    onChange={(e) => handleUpdatePermission('dashboard', e.target.value)}
                  />
                  Sem acesso
                </label>
                <label>
                  <input 
                    type="radio" 
                    name="dashboard"
                    value="view"
                    checked={getPermissionValue('dashboard') === 'view'}
                    onChange={(e) => handleUpdatePermission('dashboard', e.target.value)}
                  />
                  Visualizar
                </label>
                <label>
                  <input 
                    type="radio" 
                    name="dashboard"
                    value="edit"
                    checked={getPermissionValue('dashboard') === 'edit'}
                    onChange={(e) => handleUpdatePermission('dashboard', e.target.value)}
                  />
                  Editar
                </label>
              </div>
            </div>

            {/* PERGUNTAS */}
            <div className="permission-section">
              <h3>Perguntas</h3>
              {questions.map(question => (
                <div key={question.id} className="permission-item">
                  <p className="item-text">"{question.text}"</p>
                  <div className="permission-options">
                    <label>
                      <input 
                        type="radio" 
                        name={`question-${question.id}`}
                        value="none"
                        checked={getPermissionValue(`questions.${question.id}`) === 'none'}
                        onChange={(e) => handleUpdatePermission(`questions.${question.id}`, e.target.value)}
                      />
                      Não aparece
                    </label>
                    <label>
                      <input 
                        type="radio" 
                        name={`question-${question.id}`}
                        value="view"
                        checked={getPermissionValue(`questions.${question.id}`) === 'view'}
                        onChange={(e) => handleUpdatePermission(`questions.${question.id}`, e.target.value)}
                      />
                      Visualizar
                    </label>
                    <label>
                      <input 
                        type="radio" 
                        name={`question-${question.id}`}
                        value="answer"
                        checked={getPermissionValue(`questions.${question.id}`) === 'answer'}
                        onChange={(e) => handleUpdatePermission(`questions.${question.id}`, e.target.value)}
                      />
                      Responder
                    </label>
                    <label>
                      <input 
                        type="radio" 
                        name={`question-${question.id}`}
                        value="confirm"
                        checked={getPermissionValue(`questions.${question.id}`) === 'confirm'}
                        onChange={(e) => handleUpdatePermission(`questions.${question.id}`, e.target.value)}
                      />
                      Confirmar
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {/* TAREFAS */}
            <div className="permission-section">
              <h3>Tarefas</h3>
              {tasks.map(task => (
                <div key={task.id} className="permission-item">
                  <p className="item-text">"{task.name}"</p>
                  <div className="permission-options">
                    <label>
                      <input 
                        type="radio" 
                        name={`task-${task.id}`}
                        value="none"
                        checked={getPermissionValue(`tasks.${task.id}`) === 'none'}
                        onChange={(e) => handleUpdatePermission(`tasks.${task.id}`, e.target.value)}
                      />
                      Não aparece
                    </label>
                    <label>
                      <input 
                        type="radio" 
                        name={`task-${task.id}`}
                        value="view"
                        checked={getPermissionValue(`tasks.${task.id}`) === 'view'}
                        onChange={(e) => handleUpdatePermission(`tasks.${task.id}`, e.target.value)}
                      />
                      Visualizar
                    </label>
                    <label>
                      <input 
                        type="radio" 
                        name={`task-${task.id}`}
                        value="execute"
                        checked={getPermissionValue(`tasks.${task.id}`) === 'execute'}
                        onChange={(e) => handleUpdatePermission(`tasks.${task.id}`, e.target.value)}
                      />
                      Executar
                    </label>
                    <label>
                      <input 
                        type="radio" 
                        name={`task-${task.id}`}
                        value="confirm"
                        checked={getPermissionValue(`tasks.${task.id}`) === 'confirm'}
                        onChange={(e) => handleUpdatePermission(`tasks.${task.id}`, e.target.value)}
                      />
                      Confirmar
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {/* ORÇAMENTOS */}
            <div className="permission-section">
              <h3>Orçamentos</h3>
              <div className="checkbox-group">
                <label>
                  <input 
                    type="checkbox"
                    checked={getPermissionValue('budgets.view')}
                    onChange={(e) => handleUpdatePermission('budgets.view', e.target.checked)}
                  />
                  Visualizar
                </label>
                <label>
                  <input 
                    type="checkbox"
                    checked={getPermissionValue('budgets.edit')}
                    onChange={(e) => handleUpdatePermission('budgets.edit', e.target.checked)}
                  />
                  ✏️ Editar
                </label>
                <label>
                  <input 
                    type="checkbox"
                    checked={getPermissionValue('budgets.approve')}
                    onChange={(e) => handleUpdatePermission('budgets.approve', e.target.checked)}
                  />
                  ✅ Aprovar/Rejeitar
                </label>
              </div>
            </div>

            {/* DOCUMENTOS */}
            <div className="permission-section">
              <h3>Documentos</h3>
              <div className="checkbox-group">
                <label>
                  <input 
                    type="checkbox"
                    checked={getPermissionValue('documents.view')}
                    onChange={(e) => handleUpdatePermission('documents.view', e.target.checked)}
                  />
                  Visualizar
                </label>
                <label>
                  <input 
                    type="checkbox"
                    checked={getPermissionValue('documents.download')}
                    onChange={(e) => handleUpdatePermission('documents.download', e.target.checked)}
                  />
                  Download
                </label>
                <label>
                  <input 
                    type="checkbox"
                    checked={getPermissionValue('documents.upload')}
                    onChange={(e) => handleUpdatePermission('documents.upload', e.target.checked)}
                  />
                  Upload
                </label>
              </div>
            </div>
          </div>

          <div className="permission-footer">
            <button className="btn-save" onClick={() => alert('Permissões salvas automaticamente!')}>
              Permissões Salvas Automaticamente
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR TIPO */}
      {showTypeModal && (
        <div className="modal-overlay" onClick={() => setShowTypeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Adicionar Tipo de Usuário</h2>
              <button className="close-btn" onClick={() => setShowTypeModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Nome do Tipo *</label>
                <input 
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Ex: Patrocinador"
                />
              </div>
              <div className="form-group">
                <label>Ícone (emoji)</label>
                <input 
                  type="text"
                  value={newTypeIcon}
                  onChange={(e) => setNewTypeIcon(e.target.value)}
                  placeholder="Ex: 🎯"
                  maxLength={2}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowTypeModal(false)}>
                Cancelar
              </button>
              <button className="btn-confirm" onClick={handleAddUserType}>
                Criar Tipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR CARGO */}
      {showRoleModal && (
        <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Adicionar Cargo</h2>
              <button className="close-btn" onClick={() => setShowRoleModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Tipo de Usuário</label>
                <p className="type-display">
                  {userTypes.find(t => t.id === selectedType)?.icon} {userTypes.find(t => t.id === selectedType)?.name}
                </p>
              </div>
              <div className="form-group">
                <label>Nome do Cargo *</label>
                <input 
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Ex: Coordenador"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowRoleModal(false)}>
                Cancelar
              </button>
              <button className="btn-confirm" onClick={handleAddRole}>
                Criar Cargo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoleManagement;
