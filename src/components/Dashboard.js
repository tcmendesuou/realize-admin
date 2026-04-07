import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import BudgetCard from './BudgetCard';
import '../styles/Dashboard.css';

function Dashboard() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEventType, setFilterEventType] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    analyzing: 0,
    approved: 0,
    rejected: 0,
    paused: 0
  });

  useEffect(() => {
    loadBudgets();
  }, []);

  const loadBudgets = async () => {
    try {
      const q = query(collection(db, 'budgets'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const budgetsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setBudgets(budgetsData);
      calculateStats(budgetsData);
    } catch (error) {
      console.error('Erro ao carregar orçamentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data) => {
    const newStats = {
      total: data.length,
      analyzing: data.filter(b => b.status === 'analyzing').length,
      approved: data.filter(b => b.status === 'approved').length,
      rejected: data.filter(b => b.status === 'rejected').length,
      paused: data.filter(b => b.status === 'paused').length
    };
    setStats(newStats);
  };

  const handleStatusChange = async (budgetId, newStatus) => {
    try {
      await updateDoc(doc(db, 'budgets', budgetId), {
        status: newStatus,
        updatedAt: new Date()
      });
      
      // Atualizar localmente
      const updatedBudgets = budgets.map(b => 
        b.id === budgetId ? { ...b, status: newStatus } : b
      );
      setBudgets(updatedBudgets);
      calculateStats(updatedBudgets);
      
      alert('Status atualizado com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status');
    }
  };

  const translateStatus = (status) => {
    const statuses = {
      'analyzing': 'Em Análise',
      'approved': 'Aprovado',
      'rejected': 'Não Aprovado',
      'paused': 'Parado'
    };
    return statuses[status] || status;
  };

  const getStatusClass = (status) => {
    const classes = {
      'analyzing': 'status-analyzing',
      'approved': 'status-approved',
      'rejected': 'status-rejected',
      'paused': 'status-paused'
    };
    return classes[status] || '';
  };

  // Filtrar orçamentos
  const filteredBudgets = budgets.filter(budget => {
    if (filterStatus !== 'all' && budget.status !== filterStatus) return false;
    if (filterEventType !== 'all' && budget.eventTypeId !== filterEventType) return false;
    return true;
  });

  if (loading) {
    return <div className="loading">Carregando dashboard...</div>;
  }

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">Visão geral dos orçamentos e eventos</p>
        </div>
      </div>

      {/* ESTATÍSTICAS */}
      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total de Orçamentos</div>
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
          <div className="stat-label">Não Aprovados</div>
        </div>

        <div className="stat-card stat-paused">
          <div className="stat-number">{stats.paused}</div>
          <div className="stat-label">Parados</div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="filters-section">
        <div className="filter-group">
          <label>Status:</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Todos</option>
            <option value="analyzing">Em Análise</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Não Aprovado</option>
            <option value="paused">Parado</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Tipo de Evento:</label>
          <select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value)}>
            <option value="all">Todos</option>
            <option value="casamento">Casamento</option>
            <option value="corporativo">Corporativo</option>
            <option value="aniversario">Aniversário</option>
            <option value="formatura">Formatura</option>
          </select>
        </div>

        <div className="filter-results">
          {filteredBudgets.length} {filteredBudgets.length === 1 ? 'resultado' : 'resultados'}
        </div>
      </div>

      {/* LISTA DE ORÇAMENTOS */}
      {filteredBudgets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>Nenhum orçamento encontrado</h3>
          <p>Os orçamentos enviados pelos clientes aparecerão aqui</p>
        </div>
      ) : (
        <div className="budgets-list">
          {filteredBudgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onStatusChange={handleStatusChange}
              translateStatus={translateStatus}
              getStatusClass={getStatusClass}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
