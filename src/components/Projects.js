import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import ProjectDetailModal from './ProjectDetailModal';
import '../styles/Projects.css';

function Projects() {
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Filtros
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEventType, setFilterEventType] = useState('all');
  const [filterAtendimento, setFilterAtendimento] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dados auxiliares
  const [eventTypes, setEventTypes] = useState([]);
  const [atendimentos, setAtendimentos] = useState([]);
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    analyzing: 0,
    approved: 0,
    rejected: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [projects, filterStatus, filterEventType, filterAtendimento, searchTerm]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadProjects(),
        loadEventTypes(),
        loadAtendimentos()
      ]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar projetos');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const q = query(collection(db, 'budgets'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProjects(projectsData);
      calculateStats(projectsData);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  };

  const loadEventTypes = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'eventTypes'));
      const types = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEventTypes(types);
    } catch (error) {
      console.error('Erro ao carregar tipos de evento:', error);
    }
  };

  const loadAtendimentos = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.userType === 'equipe' && user.active);
      setAtendimentos(users);
    } catch (error) {
      console.error('Erro ao carregar atendimentos:', error);
    }
  };

  const calculateStats = (data) => {
    const newStats = {
      total: data.length,
      analyzing: data.filter(p => p.status === 'analyzing').length,
      approved: data.filter(p => p.status === 'approved').length,
      rejected: data.filter(p => p.status === 'rejected').length
    };
    setStats(newStats);
  };

  const applyFilters = () => {
    let filtered = [...projects];

    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => p.status === filterStatus);
    }

    if (filterEventType !== 'all') {
      filtered = filtered.filter(p => p.eventTypeId === filterEventType);
    }

    if (filterAtendimento !== 'all') {
      filtered = filtered.filter(p => p.assignedTo === filterAtendimento);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.clientName?.toLowerCase().includes(term) ||
        p.eventTypeName?.toLowerCase().includes(term) ||
        p.jobCode?.toLowerCase().includes(term) ||
        p.budgetNumber?.toString().includes(term) ||
        getProjectName(p).toLowerCase().includes(term)
      );
    }

    setFilteredProjects(filtered);
  };

  const handleViewDetails = async (projectId) => {
    try {
      const projectDoc = await getDoc(doc(db, 'budgets', projectId));
      if (projectDoc.exists()) {
        const projectData = { id: projectDoc.id, ...projectDoc.data() };
        
        // Carregar perguntas do fluxo
        const flowDoc = await getDoc(doc(db, 'eventFlows', projectData.eventTypeId));
        if (flowDoc.exists()) {
          const flowData = flowDoc.data();
          const questionIds = flowData.items?.filter(i => i.itemType === 'question').map(i => i.itemId) || [];
          
          const questions = [];
          for (const qId of questionIds) {
            const qDoc = await getDoc(doc(db, 'questions', qId));
            if (qDoc.exists()) {
              questions.push({ id: qDoc.id, ...qDoc.data() });
            }
          }
          
          projectData.questions = questions;
        }
        
        setSelectedProject(projectData);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
      alert('Erro ao carregar detalhes do projeto');
    }
  };

  const getProjectName = (project) => {
    const feiras = project.answers?.['fixed-events'];
    if (Array.isArray(feiras) && feiras.length > 0) {
      const mae = feiras.find(f => f.isMae) || feiras[0];
      if (mae?.nome) return mae.nome;
    }
    if (project.answers?.['GApo1hcglkgdpAQGuSnn']) return project.answers['GApo1hcglkgdpAQGuSnn'];
    return project.eventTypeName || 'Evento';
  };

  const handleDelete = async (project) => {
    const jobLabel = project.jobCode || `#${project.id}`;
    if (!window.confirm(`Excluir o projeto "${jobLabel}"?\n\nEsta ação não pode ser desfeita. Todos os budgets filhos (feiras) também serão excluídos.`)) return;
    try {
      // Excluir filhos
      const allSnap = await getDocs(collection(db, 'budgets'));
      const filhos = allSnap.docs.filter(d => d.data().parentBudgetId === project.id);
      await Promise.all(filhos.map(d => deleteDoc(doc(db, 'budgets', d.id))));
      // Excluir mãe
      await deleteDoc(doc(db, 'budgets', project.id));
      await loadProjects();
    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir projeto.');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      analyzing: { label: 'Em Análise', class: 'status-analyzing' },
      approved: { label: 'Aprovado', class: 'status-approved' },
      rejected: { label: 'Rejeitado', class: 'status-rejected' }
    };
    return badges[status] || { label: 'Desconhecido', class: 'status-unknown' };
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="projects-container">
        <div className="loading">Carregando projetos...</div>
      </div>
    );
  }

  return (
    <div className="projects-container">
      {/* HEADER */}
      <div className="projects-header">
        <div>
          <h1>Projetos</h1>
          <p className="subtitle">Visão completa de todos os projetos e orçamentos</p>
        </div>
      </div>

      {/* ESTATÍSTICAS */}
      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total de Projetos</div>
        </div>

        <div className="stat-card stat-analyzing">
          <div className="stat-number">{stats.analyzing}</div>
          <div className="stat-label">Em Análise</div>
        </div>

        <div className="stat-card stat-approved">
          <div className="stat-number">{stats.approved}</div>
          <div className="stat-label">Aprovados</div>
        </div>

        <div className="stat-card stat-rejected">
          <div className="stat-number">{stats.rejected}</div>
          <div className="stat-label">Rejeitados</div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="filters-section">
        <div className="search-filter">
          <input
            type="text"
            placeholder="Buscar por nome, cliente, número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Todos</option>
            <option value="analyzing">Em Análise</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Rejeitado</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Tipo de Evento:</label>
          <select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value)}>
            <option value="all">Todos</option>
            {eventTypes.map(type => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Atendimento:</label>
          <select value={filterAtendimento} onChange={(e) => setFilterAtendimento(e.target.value)}>
            <option value="all">Todos</option>
            {atendimentos.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-results">
          {filteredProjects.length} {filteredProjects.length === 1 ? 'resultado' : 'resultados'}
        </div>
      </div>

      {/* TABELA DE PROJETOS */}
      {filteredProjects.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum projeto encontrado</h3>
          <p>Ajuste os filtros ou aguarde novos pedidos dos clientes</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="projects-table">
            <thead>
              <tr>
                <th className="col-number">#</th>
                <th className="col-name">Nome do Projeto</th>
                <th className="col-client">Cliente</th>
                <th className="col-type">Tipo</th>
                <th className="col-atendimento">Atendimento</th>
                <th className="col-date">Data</th>
                <th className="col-status">Status</th>
                <th className="col-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project) => {
                const statusBadge = getStatusBadge(project.status);
                return (
                  <tr key={project.id}>
                    <td className="number-cell">{project.jobCode || `#${project.id.slice(0,8)}`}</td>
                    <td className="name-cell">
                      <strong>{getProjectName(project)}</strong>
                    </td>
                    <td>{project.clientName || '-'}</td>
                    <td>{project.eventTypeName || '-'}</td>
                    <td>{project.assignedToName || 'Não atribuído'}</td>
                    <td>{formatDate(project.createdAt)}</td>
                    <td>
                      <span className={`badge ${statusBadge.class}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="btn-action btn-view"
                        onClick={() => handleViewDetails(project.id)}
                      >
                        Ver Detalhes
                      </button>
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDelete(project)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DE DETALHES */}
      {showDetailModal && selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedProject(null);
          }}
          onUpdate={loadProjects}
        />
      )}
    </div>
  );
}

export default Projects;
