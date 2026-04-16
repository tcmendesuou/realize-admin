import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import TaskForm from './TaskForm';
import '../styles/TaskList.css';

function TaskList() {
  const [tasks, setTasks] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [creatingSpecialType, setCreatingSpecialType] = useState(null);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterArea, setFilterArea] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tasksSnap, areasSnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), orderBy('order', 'asc'))),
        getDocs(collection(db, 'areas')),
      ]);
      setTasks(tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAreas(areasSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (error) {
      console.error('Erro ao carregar tarefas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, taskName) => {
    if (window.confirm(`Tem certeza que deseja deletar a tarefa "${taskName}"?`)) {
      try {
        await deleteDoc(doc(db, 'tasks', id));
        setTasks(tasks.filter(t => t.id !== id));
        alert('Tarefa deletada com sucesso!');
      } catch (error) {
        console.error('Erro ao deletar:', error);
        alert('Erro ao deletar tarefa');
      }
    }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setCreatingSpecialType(null);
    setShowForm(true);
  };

  const handleCreateSpecial = (type) => {
    setCreatingSpecialType(type);
    setEditingTask(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTask(null);
    setCreatingSpecialType(null);
  };

  const handleSave = () => {
    loadData();
    handleCloseForm();
  };

  const translatePriority = (priority) => {
    const priorities = { neutral: 'Neutro', low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
    return priorities[priority] || priority;
  };

  const getPriorityClass = (priority) => {
    const classes = { neutral: 'priority-neutral', low: 'priority-low', medium: 'priority-medium', high: 'priority-high', urgent: 'priority-urgent' };
    return classes[priority] || '';
  };

  const specialTasks = tasks.filter(t => t.specialType);
  const normalTasks = tasks.filter(t => !t.specialType);
  const hasKickoff = specialTasks.some(t => t.specialType === 'kickoff');

  const filteredTasks = normalTasks.filter(task => {
    if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
    if (filterArea !== 'all' && task.areaId !== filterArea) return false;
    return true;
  });

  if (loading) return <div className="loading">Carregando tarefas...</div>;

  return (
    <div className="task-list-container">
      <div className="list-header">
        <div className="header-left">
          <h2>Banco de Tarefas</h2>
          <p className="header-subtitle">Gerencie as tarefas da sua equipe</p>
        </div>
        <div className="header-actions">
          {!hasKickoff && (
            <button className="btn-special btn-kickoff" onClick={() => handleCreateSpecial('kickoff')}>
              + Criar Reunião de Kickoff
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nova Tarefa</button>
        </div>
      </div>

      {/* TAREFAS ESPECIAIS */}
      {specialTasks.length > 0 && (
        <div className="special-section">
          <h3 className="section-title">Tarefas Especiais</h3>
          <div className="table-container">
            <table className="tasks-table special-table">
              <thead>
                <tr>
                  <th className="col-badge">Tipo</th>
                  <th className="col-text">Tarefa</th>
                  <th className="col-responsible">Área / Cargo</th>
                  <th className="col-priority">Prioridade</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {specialTasks.map((task) => (
                  <tr key={task.id} className="special-row kickoff-row">
                    <td><span className="badge badge-kickoff">KICKOFF</span></td>
                    <td className="task-text-cell">
                      <strong>{task.name}</strong>
                      {task.meetingDate && (
                        <div className="task-meta-info">
                          {new Date(task.meetingDate).toLocaleDateString('pt-BR')} às {task.meetingTime}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="responsible-area">{task.areaName || '—'}</span>
                      {task.roleName && <span className="responsible-role">{task.roleName}</span>}
                    </td>
                    <td>
                      <span className={`badge badge-priority ${getPriorityClass(task.priority)}`}>
                        {translatePriority(task.priority)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${task.active ? 'badge-active' : 'badge-inactive'}`}>
                        {task.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn-action btn-edit" onClick={() => handleEdit(task)}>Editar</button>
                      <button className="btn-action btn-delete" onClick={() => handleDelete(task.id, task.name)}>Deletar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FILTROS */}
      <div className="filters-bar">
        <div className="filter-group">
          <label>Área:</label>
          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}>
            <option value="all">Todas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Prioridade:</label>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="all">Todas</option>
            <option value="neutral">Neutro</option>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        <div className="filter-results">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'tarefa' : 'tarefas'}
        </div>
      </div>

      {/* TAREFAS NORMAIS */}
      <div className="normal-section">
        <h3 className="section-title">Tarefas do Fluxo</h3>
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <p>Nenhuma tarefa cadastrada ainda</p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>Criar primeira tarefa</button>
          </div>
        ) : (
          <div className="table-container">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th className="col-order">#</th>
                  <th className="col-text">Tarefa</th>
                  <th className="col-responsible">Área / Cargo</th>
                  <th>Req.</th>
                  <th>Etapa</th>
                  <th className="col-priority">Prioridade</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr key={task.id}>
                    <td className="order-cell">#{task.order}</td>
                    <td className="task-text-cell">
                      <strong>{task.name}</strong>
                      {task.description && <div className="task-description-preview">{task.description.substring(0, 60)}{task.description.length > 60 && '...'}</div>}
                      {task.isComum && <span style={{ fontSize: 10, color: '#00875A', marginLeft: 4 }}>comum</span>}
                    </td>
                    <td>
                      <span className="responsible-area">{task.areaName || '—'}</span>
                      {task.roleName && <span className="responsible-role">{task.roleName}</span>}
                    </td>
                    <td>{task.requisicaoCodigo ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#667eea22', color: '#667eea' }}>{task.requisicaoCodigo}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td style={{ fontSize: 11, color: '#64748b', maxWidth: 120 }}>{task.jobStage ? task.jobStage.replace(/_/g, ' ') : <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td><span className={`badge badge-priority ${getPriorityClass(task.priority)}`}>{translatePriority(task.priority)}</span></td>
                    <td><span className={`badge ${task.active ? 'badge-active' : 'badge-inactive'}`}>{task.active ? 'Ativo' : 'Inativo'}</span></td>
                    <td className="actions-cell">
                      <button className="btn-action btn-edit" onClick={() => handleEdit(task)}>Editar</button>
                      <button className="btn-action btn-delete" onClick={() => handleDelete(task.id, task.name)}>Deletar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <TaskForm
          onClose={handleCloseForm}
          onSave={handleSave}
          editTask={editingTask}
          specialType={creatingSpecialType}
        />
      )}
    </div>
  );
}

export default TaskList;
