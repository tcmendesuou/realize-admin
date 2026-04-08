import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/RoleManagement.css';

function RoleManagement() {
  const [userTypes, setUserTypes] = useState([]);
  const [areas, setAreas] = useState([]);
  const [roles, setRoles] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Seleção em cascata
  const [selectedType, setSelectedType] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);

  // Modals
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [saving, setSaving] = useState(false);

  // Permissões
  const [customPermissions, setCustomPermissions] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [typesSnap, areasSnap, rolesSnap, questionsSnap, tasksSnap] = await Promise.all([
        getDocs(collection(db, 'userTypes')),
        getDocs(collection(db, 'areas')),
        getDocs(collection(db, 'roles')),
        getDocs(collection(db, 'questions')),
        getDocs(collection(db, 'tasks')),
      ]);

      let typesData = typesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (typesData.length === 0) {
        await createDefaultTypes();
        const snap2 = await getDocs(collection(db, 'userTypes'));
        typesData = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      setUserTypes(typesData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      setAreas(areasSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setQuestions(questionsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTasks(tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const createDefaultTypes = async () => {
    const defaults = [
      { name: 'Cliente', order: 1 },
      { name: 'Equipe', order: 2 },
      { name: 'Fornecedor', order: 3 },
    ];
    for (const t of defaults) {
      await addDoc(collection(db, 'userTypes'), { ...t, icon: '', createdAt: new Date() });
    }
  };

  // ── TIPO ──
  const handleAddType = async () => {
    if (!newTypeName.trim()) { alert('Digite o nome do tipo'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'userTypes'), {
        name: newTypeName.trim(), icon: '', order: userTypes.length + 1, createdAt: new Date()
      });
      setNewTypeName(''); setShowTypeModal(false); loadData();
    } catch (err) { alert('Erro ao criar tipo'); }
    finally { setSaving(false); }
  };

  const handleDeleteType = async (typeId) => {
    if (!window.confirm('Excluir este tipo e todas as áreas e cargos vinculados?')) return;
    const typeAreas = areas.filter(a => a.userTypeId === typeId);
    for (const area of typeAreas) {
      const areaRoles = roles.filter(r => r.areaId === area.id);
      for (const role of areaRoles) await deleteDoc(doc(db, 'roles', role.id));
      await deleteDoc(doc(db, 'areas', area.id));
    }
    await deleteDoc(doc(db, 'userTypes', typeId));
    if (selectedType === typeId) { setSelectedType(null); setSelectedArea(null); setSelectedRole(null); }
    loadData();
  };

  // ── ÁREA ──
  const handleAddArea = async () => {
    if (!newAreaName.trim()) { alert('Digite o nome da área'); return; }
    if (!selectedType) { alert('Selecione um tipo de usuário primeiro'); return; }
    setSaving(true);
    try {
      const typeAreas = areas.filter(a => a.userTypeId === selectedType);
      await addDoc(collection(db, 'areas'), {
        name: newAreaName.trim(),
        userTypeId: selectedType,
        userTypeName: userTypes.find(t => t.id === selectedType)?.name || '',
        order: typeAreas.length + 1,
        createdAt: new Date()
      });
      setNewAreaName(''); setShowAreaModal(false); loadData();
    } catch (err) { alert('Erro ao criar área'); }
    finally { setSaving(false); }
  };

  const handleDeleteArea = async (areaId) => {
    if (!window.confirm('Excluir esta área e todos os cargos vinculados?')) return;
    const areaRoles = roles.filter(r => r.areaId === areaId);
    for (const role of areaRoles) await deleteDoc(doc(db, 'roles', role.id));
    await deleteDoc(doc(db, 'areas', areaId));
    if (selectedArea === areaId) { setSelectedArea(null); setSelectedRole(null); }
    loadData();
  };

  // ── CARGO ──
  const handleAddRole = async () => {
    if (!newRoleName.trim()) { alert('Digite o nome do cargo'); return; }
    if (!selectedArea) { alert('Selecione uma área primeiro'); return; }
    setSaving(true);
    try {
      const area = areas.find(a => a.id === selectedArea);
      const areaRoles = roles.filter(r => r.areaId === selectedArea);
      await addDoc(collection(db, 'roles'), {
        name: newRoleName.trim(),
        areaId: selectedArea,
        areaName: area?.name || '',
        userTypeId: selectedType,
        userTypeName: userTypes.find(t => t.id === selectedType)?.name || '',
        permissions: {
          dashboard: 'none',
          questions: {}, tasks: {},
          budgets: { view: false, edit: false, approve: false },
          documents: { view: false, download: false, upload: false }
        },
        order: areaRoles.length + 1,
        createdAt: new Date()
      });
      setNewRoleName(''); setShowRoleModal(false); loadData();
    } catch (err) { alert('Erro ao criar cargo'); }
    finally { setSaving(false); }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Excluir este cargo?')) return;
    await deleteDoc(doc(db, 'roles', roleId));
    if (selectedRole?.id === roleId) setSelectedRole(null);
    loadData();
  };

  const handleSelectRole = (role) => {
    setSelectedRole(role);
    setCustomPermissions(role.permissions || {});
  };

  // ── PERMISSÕES ──
  const getPermissionValue = (field) => {
    const parts = field.split('.');
    let val = customPermissions;
    for (const p of parts) { val = val?.[p]; }
    return val ?? (field.includes('budgets') || field.includes('documents') ? false : 'none');
  };

  const handleUpdatePermission = async (field, value) => {
    if (!selectedRole) return;
    const newPerms = { ...customPermissions };
    const parts = field.split('.');
    let obj = newPerms;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    setCustomPermissions(newPerms);
    try {
      await updateDoc(doc(db, 'roles', selectedRole.id), { permissions: newPerms, updatedAt: new Date() });
    } catch (err) { console.error('Erro ao salvar permissão:', err); }
  };

  // Dados filtrados por seleção
  const filteredAreas = areas.filter(a => a.userTypeId === selectedType);
  const filteredRoles = roles.filter(r => r.areaId === selectedArea);

  if (loading) return <div className="rm-loading">Carregando...</div>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');

        .rm-wrap { font-family: 'Outfit', sans-serif; height: calc(100vh - 120px); display: flex; flex-direction: column; }
        .rm-title { font-size: 13px; color: #8a9bb0; margin-bottom: 16px; font-weight: 300; }
        .rm-loading { padding: 40px; text-align: center; color: #8a9bb0; font-family: 'Outfit', sans-serif; }

        /* CASCADE GRID */
        .rm-cascade { display: grid; grid-template-columns: 220px 220px 220px 1fr; gap: 1px; background: #e8eaed; border-radius: 12px; overflow: hidden; flex: 1; min-height: 0; }

        /* PANEL */
        .rm-panel { background: white; display: flex; flex-direction: column; overflow: hidden; }
        .rm-panel-header {
          padding: 14px 16px; border-bottom: 1px solid #f0f2f5;
          display: flex; align-items: center; justify-content: space-between;
          background: #fafbfc; flex-shrink: 0;
        }
        .rm-panel-title { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #8a9bb0; }
        .rm-panel-add {
          width: 24px; height: 24px; border-radius: 6px; border: 1px solid #e0e0e0;
          background: none; cursor: pointer; font-size: 16px; color: #667eea;
          display: flex; align-items: center; justify-content: center; line-height: 1;
          transition: all 0.15s;
        }
        .rm-panel-add:hover { background: #667eea; color: white; border-color: #667eea; }
        .rm-panel-add:disabled { opacity: 0.3; cursor: not-allowed; }
        .rm-panel-list { flex: 1; overflow-y: auto; padding: 8px; }

        /* ITEMS */
        .rm-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px; border-radius: 8px; cursor: pointer;
          transition: all 0.15s; margin-bottom: 2px;
        }
        .rm-item:hover { background: #f5f5f5; }
        .rm-item.active { background: #f0f3ff; }
        .rm-item-name { font-size: 13px; color: #2c3e50; font-weight: 400; flex: 1; }
        .rm-item.active .rm-item-name { color: #667eea; font-weight: 500; }
        .rm-item-arrow { font-size: 10px; color: #ccc; }
        .rm-item.active .rm-item-arrow { color: #667eea; }
        .rm-item-del {
          width: 20px; height: 20px; border-radius: 4px; border: none; background: none;
          color: #ccc; cursor: pointer; font-size: 12px; display: flex; align-items: center;
          justify-content: center; transition: all 0.15s; flex-shrink: 0; opacity: 0;
        }
        .rm-item:hover .rm-item-del { opacity: 1; }
        .rm-item-del:hover { background: #fee; color: #e74c3c; }

        .rm-empty { padding: 24px 12px; text-align: center; color: #ccc; font-size: 12px; }

        /* PERMISSIONS PANEL */
        .rm-perms { background: white; display: flex; flex-direction: column; overflow: hidden; }
        .rm-perms-header { padding: 14px 20px; border-bottom: 1px solid #f0f2f5; background: #fafbfc; flex-shrink: 0; }
        .rm-perms-title { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #8a9bb0; }
        .rm-perms-role { font-size: 14px; font-weight: 500; color: #2c3e50; margin-top: 3px; }
        .rm-perms-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
        .rm-perms-empty { padding: 40px; text-align: center; color: #ccc; font-size: 13px; }

        .rm-perm-section { margin-bottom: 24px; }
        .rm-perm-section h4 { font-size: 12px; font-weight: 600; color: #2c3e50; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #f0f2f5; letter-spacing: 0.5px; }
        .rm-perm-item { display: flex; align-items: flex-start; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f9f9f9; gap: 12px; }
        .rm-perm-item:last-child { border-bottom: none; }
        .rm-perm-label { font-size: 12px; color: #555; flex: 1; line-height: 1.4; }
        .rm-perm-options { display: flex; gap: 14px; flex-shrink: 0; }
        .rm-perm-options label { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #777; cursor: pointer; white-space: nowrap; }
        .rm-perm-options input { accent-color: #667eea; cursor: pointer; }
        .rm-checkbox-group { display: flex; gap: 16px; flex-wrap: wrap; }
        .rm-checkbox-group label { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #555; cursor: pointer; }
        .rm-checkbox-group input { accent-color: #667eea; cursor: pointer; }

        /* MODAL */
        .rm-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000;
          display: flex; align-items: center; justify-content: center;
        }
        .rm-modal {
          background: white; border-radius: 12px; padding: 28px; width: 380px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        }
        .rm-modal h3 { font-size: 16px; font-weight: 600; color: #2c3e50; margin-bottom: 20px; }
        .rm-modal-field { margin-bottom: 16px; }
        .rm-modal-field label { display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 6px; }
        .rm-modal-field input {
          width: 100%; padding: 10px 12px; border: 1px solid #e0e0e0; border-radius: 8px;
          font-size: 14px; outline: none; font-family: 'Outfit', sans-serif; transition: border-color 0.2s;
        }
        .rm-modal-field input:focus { border-color: #667eea; }
        .rm-modal-footer { display: flex; gap: 10px; margin-top: 24px; }
        .rm-modal-cancel {
          flex: 1; padding: 10px; border: 1px solid #e0e0e0; border-radius: 8px;
          background: none; color: #777; font-family: 'Outfit', sans-serif; font-size: 14px; cursor: pointer;
        }
        .rm-modal-confirm {
          flex: 2; padding: 10px; border: none; border-radius: 8px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500; cursor: pointer;
        }
        .rm-modal-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

        .rm-perms-body::-webkit-scrollbar, .rm-panel-list::-webkit-scrollbar { width: 4px; }
        .rm-perms-body::-webkit-scrollbar-thumb, .rm-panel-list::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }
      `}</style>

      <div className="rm-wrap">
        <p className="rm-title">Selecione um tipo → área → cargo para configurar permissões</p>

        <div className="rm-cascade">

          {/* PAINEL 1 — TIPOS */}
          <div className="rm-panel">
            <div className="rm-panel-header">
              <span className="rm-panel-title">Tipo de Usuário</span>
              <button className="rm-panel-add" title="Novo tipo" onClick={() => setShowTypeModal(true)}>+</button>
            </div>
            <div className="rm-panel-list">
              {userTypes.length === 0 ? (
                <div className="rm-empty">Nenhum tipo</div>
              ) : userTypes.map(t => (
                <div key={t.id}
                  className={`rm-item ${selectedType === t.id ? 'active' : ''}`}
                  onClick={() => { setSelectedType(t.id); setSelectedArea(null); setSelectedRole(null); }}>
                  <span className="rm-item-name">{t.name}</span>
                  <span className="rm-item-arrow">›</span>
                  <button className="rm-item-del" onClick={e => { e.stopPropagation(); handleDeleteType(t.id); }}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* PAINEL 2 — ÁREAS */}
          <div className="rm-panel">
            <div className="rm-panel-header">
              <span className="rm-panel-title">Área</span>
              <button className="rm-panel-add" title="Nova área"
                disabled={!selectedType}
                onClick={() => setShowAreaModal(true)}>+</button>
            </div>
            <div className="rm-panel-list">
              {!selectedType ? (
                <div className="rm-empty">Selecione um tipo</div>
              ) : filteredAreas.length === 0 ? (
                <div className="rm-empty">Nenhuma área</div>
              ) : filteredAreas.map(a => (
                <div key={a.id}
                  className={`rm-item ${selectedArea === a.id ? 'active' : ''}`}
                  onClick={() => { setSelectedArea(a.id); setSelectedRole(null); }}>
                  <span className="rm-item-name">{a.name}</span>
                  <span className="rm-item-arrow">›</span>
                  <button className="rm-item-del" onClick={e => { e.stopPropagation(); handleDeleteArea(a.id); }}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* PAINEL 3 — CARGOS */}
          <div className="rm-panel">
            <div className="rm-panel-header">
              <span className="rm-panel-title">Cargo</span>
              <button className="rm-panel-add" title="Novo cargo"
                disabled={!selectedArea}
                onClick={() => setShowRoleModal(true)}>+</button>
            </div>
            <div className="rm-panel-list">
              {!selectedArea ? (
                <div className="rm-empty">Selecione uma área</div>
              ) : filteredRoles.length === 0 ? (
                <div className="rm-empty">Nenhum cargo</div>
              ) : filteredRoles.map(r => (
                <div key={r.id}
                  className={`rm-item ${selectedRole?.id === r.id ? 'active' : ''}`}
                  onClick={() => handleSelectRole(r)}>
                  <span className="rm-item-name">{r.name}</span>
                  <button className="rm-item-del" onClick={e => { e.stopPropagation(); handleDeleteRole(r.id); }}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* PAINEL 4 — PERMISSÕES */}
          <div className="rm-perms">
            <div className="rm-perms-header">
              <div className="rm-perms-title">Permissões</div>
              {selectedRole && <div className="rm-perms-role">{selectedRole.name}</div>}
            </div>
            <div className="rm-perms-body">
              {!selectedRole ? (
                <div className="rm-perms-empty">Selecione um cargo para configurar permissões</div>
              ) : (
                <>
                  {/* Dashboard */}
                  <div className="rm-perm-section">
                    <h4>Dashboard</h4>
                    <div className="rm-perm-item">
                      <span className="rm-perm-label">Acesso ao dashboard</span>
                      <div className="rm-perm-options">
                        {['none','view'].map(v => (
                          <label key={v}>
                            <input type="radio" name="dashboard" value={v}
                              checked={getPermissionValue('dashboard') === v}
                              onChange={() => handleUpdatePermission('dashboard', v)} />
                            {v === 'none' ? 'Sem acesso' : 'Visualizar'}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Perguntas */}
                  {questions.length > 0 && (
                    <div className="rm-perm-section">
                      <h4>Perguntas</h4>
                      {questions.map(q => (
                        <div key={q.id} className="rm-perm-item">
                          <span className="rm-perm-label">{q.text}</span>
                          <div className="rm-perm-options">
                            {['none','view','answer','confirm'].map(v => (
                              <label key={v}>
                                <input type="radio" name={`q-${q.id}`} value={v}
                                  checked={getPermissionValue(`questions.${q.id}`) === v}
                                  onChange={() => handleUpdatePermission(`questions.${q.id}`, v)} />
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
                    <div className="rm-perm-section">
                      <h4>Tarefas</h4>
                      {tasks.map(t => (
                        <div key={t.id} className="rm-perm-item">
                          <span className="rm-perm-label">{t.name}</span>
                          <div className="rm-perm-options">
                            {['none','view','execute','confirm'].map(v => (
                              <label key={v}>
                                <input type="radio" name={`t-${t.id}`} value={v}
                                  checked={getPermissionValue(`tasks.${t.id}`) === v}
                                  onChange={() => handleUpdatePermission(`tasks.${t.id}`, v)} />
                                {v === 'none' ? 'Não vê' : v === 'view' ? 'Ver' : v === 'execute' ? 'Executar' : 'Confirmar'}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Orçamentos */}
                  <div className="rm-perm-section">
                    <h4>Orçamentos</h4>
                    <div className="rm-checkbox-group">
                      {[['budgets.view','Visualizar'],['budgets.edit','Editar'],['budgets.approve','Aprovar/Rejeitar']].map(([field, label]) => (
                        <label key={field}>
                          <input type="checkbox"
                            checked={!!getPermissionValue(field)}
                            onChange={e => handleUpdatePermission(field, e.target.checked)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Documentos */}
                  <div className="rm-perm-section">
                    <h4>Documentos</h4>
                    <div className="rm-checkbox-group">
                      {[['documents.view','Visualizar'],['documents.download','Download'],['documents.upload','Upload']].map(([field, label]) => (
                        <label key={field}>
                          <input type="checkbox"
                            checked={!!getPermissionValue(field)}
                            onChange={e => handleUpdatePermission(field, e.target.checked)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <p style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>Permissões salvas automaticamente</p>
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* MODAL TIPO */}
      {showTypeModal && (
        <div className="rm-modal-overlay" onClick={() => setShowTypeModal(false)}>
          <div className="rm-modal" onClick={e => e.stopPropagation()}>
            <h3>Novo Tipo de Usuário</h3>
            <div className="rm-modal-field">
              <label>Nome *</label>
              <input type="text" value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                placeholder="Ex: Parceiro" autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddType()} />
            </div>
            <div className="rm-modal-footer">
              <button className="rm-modal-cancel" onClick={() => setShowTypeModal(false)}>Cancelar</button>
              <button className="rm-modal-confirm" onClick={handleAddType} disabled={saving}>
                {saving ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ÁREA */}
      {showAreaModal && (
        <div className="rm-modal-overlay" onClick={() => setShowAreaModal(false)}>
          <div className="rm-modal" onClick={e => e.stopPropagation()}>
            <h3>Nova Área</h3>
            <p style={{ fontSize: 12, color: '#8a9bb0', marginBottom: 16 }}>
              Tipo: <strong>{userTypes.find(t => t.id === selectedType)?.name}</strong>
            </p>
            <div className="rm-modal-field">
              <label>Nome da Área *</label>
              <input type="text" value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                placeholder="Ex: Produção, Atendimento, Criação" autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddArea()} />
            </div>
            <div className="rm-modal-footer">
              <button className="rm-modal-cancel" onClick={() => setShowAreaModal(false)}>Cancelar</button>
              <button className="rm-modal-confirm" onClick={handleAddArea} disabled={saving}>
                {saving ? 'Criando...' : 'Criar Área'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CARGO */}
      {showRoleModal && (
        <div className="rm-modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div className="rm-modal" onClick={e => e.stopPropagation()}>
            <h3>Novo Cargo</h3>
            <p style={{ fontSize: 12, color: '#8a9bb0', marginBottom: 16 }}>
              {userTypes.find(t => t.id === selectedType)?.name} → <strong>{areas.find(a => a.id === selectedArea)?.name}</strong>
            </p>
            <div className="rm-modal-field">
              <label>Nome do Cargo *</label>
              <input type="text" value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                placeholder="Ex: Produtor, Designer, Coordenador" autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddRole()} />
            </div>
            <div className="rm-modal-footer">
              <button className="rm-modal-cancel" onClick={() => setShowRoleModal(false)}>Cancelar</button>
              <button className="rm-modal-confirm" onClick={handleAddRole} disabled={saving}>
                {saving ? 'Criando...' : 'Criar Cargo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RoleManagement;
