import React, { useState } from 'react';
import '../styles/BudgetCard.css';

function BudgetCard({ budget, onStatusChange, translateStatus, getStatusClass }) {
  const [showDetails, setShowDetails] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const handleStatusClick = (newStatus) => {
    if (window.confirm(`Deseja alterar o status para "${translateStatus(newStatus)}"?`)) {
      onStatusChange(budget.id, newStatus);
      setChangingStatus(false);
    }
  };

  return (
    <div className={`budget-card ${getStatusClass(budget.status)}`}>
      <div className="budget-card-header">
        <div className="budget-number">
          <span className="number-label">Orçamento</span>
          <span className="number-value">#{budget.budgetNumber}</span>
        </div>

        <div className="budget-status-section">
          <button
            className={`status-badge ${getStatusClass(budget.status)}`}
            onClick={() => setChangingStatus(!changingStatus)}
          >
            {translateStatus(budget.status)}
            <span className="status-arrow">▼</span>
          </button>

          {changingStatus && (
            <div className="status-dropdown">
              <button onClick={() => handleStatusClick('analyzing')}>Em Análise</button>
              <button onClick={() => handleStatusClick('approved')}>Aprovado</button>
              <button onClick={() => handleStatusClick('rejected')}>Não Aprovado</button>
              <button onClick={() => handleStatusClick('paused')}>Parado</button>
            </div>
          )}
        </div>
      </div>

      <div className="budget-card-body">
        <div className="budget-main-info">
          <h3 className="client-name">{budget.clientName}</h3>
          <div className="event-type-badge">{budget.eventTypeName}</div>
        </div>

        <div className="budget-details-grid">
          <div className="detail-item">
            <span className="detail-label">Email:</span>
            <span className="detail-value">{budget.clientEmail}</span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Convidados:</span>
            <span className="detail-value">{budget.guestsCount || '-'}</span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Data do Evento:</span>
            <span className="detail-value">{formatDate(budget.eventDate)}</span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Criado em:</span>
            <span className="detail-value">{formatDate(budget.createdAt)}</span>
          </div>

          <div className="detail-item detail-total">
            <span className="detail-label">Valor Estimado:</span>
            <span className="detail-value-highlight">{formatCurrency(budget.estimatedTotal)}</span>
          </div>
        </div>

        {/* PROGRESSO DAS TAREFAS (só mostra se aprovado) */}
        {budget.status === 'approved' && budget.taskProgress && (
          <div className="task-progress-section">
            <div className="progress-header">
              <span className="progress-label">Progresso das Tarefas</span>
              <span className="progress-percentage">{budget.taskProgress.percentage}%</span>
            </div>
            
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${budget.taskProgress.percentage}%` }}
              ></div>
            </div>

            <div className="progress-stats">
              <span>{budget.taskProgress.completed} de {budget.taskProgress.total} concluídas</span>
              {budget.currentTask && (
                <span className="current-task">Atual: {budget.currentTask}</span>
              )}
            </div>
          </div>
        )}

        {/* BOTÃO VER DETALHES */}
        <button 
          className="btn-details"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Ocultar Detalhes' : 'Ver Detalhes Completos'}
        </button>

        {/* DETALHES EXPANDIDOS */}
        {showDetails && (
          <div className="expanded-details">
            <h4>Respostas do Cliente:</h4>
            {budget.answers && budget.answers.length > 0 ? (
              <div className="answers-list">
                {budget.answers.map((answer, index) => (
                  <div key={index} className="answer-item">
                    <strong>{answer.question}:</strong> {answer.response}
                  </div>
                ))}
              </div>
            ) : (
              <p>Nenhuma resposta registrada</p>
            )}

            {budget.observations && (
              <div className="observations-section">
                <h4>Observações:</h4>
                <p>{budget.observations}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BudgetCard;
