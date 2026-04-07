import React, { useState } from 'react';
import '../styles/ProjectDetailModal.css';

function ProjectDetailModal({ project, onClose, onUpdate }) {
  const [activeTab, setActiveTab] = useState('info');

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getAnswerDisplay = (question, answer) => {
    if (!answer) return 'Não respondido';

    switch (question.type) {
      case 'text':
      case 'number':
        return answer;
      
      case 'date':
        if (typeof answer === 'string') return answer;
        if (answer.toDate) return answer.toDate().toLocaleDateString('pt-BR');
        return answer;
      
      case 'yesno':
        return answer === 'yes' ? 'Sim' : 'Não';
      
      case 'multiple':
        const option = question.options?.find(opt => opt.id === answer);
        return option?.label || 'Não selecionado';
      
      case 'multiselect':
        if (!Array.isArray(answer)) return 'Não selecionado';
        const selectedOptions = question.options?.filter(opt => answer.includes(opt.id));
        return selectedOptions?.map(opt => opt.label).join(', ') || 'Não selecionado';
      
      default:
        return answer || 'Não informado';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'analyzing': return '#FFA726';
      case 'approved': return '#66BB6A';
      case 'rejected': return '#EF5350';
      default: return '#78909C';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'analyzing': return 'EM ANÁLISE';
      case 'approved': return 'APROVADO';
      case 'rejected': return 'REJEITADO';
      default: return 'AGUARDANDO';
    }
  };

  const getProjectName = () => {
    if (project.answers && project.answers['GApo1hcglkgdpAQGuSnn']) {
      return project.answers['GApo1hcglkgdpAQGuSnn'];
    }
    return project.eventTypeName || 'Evento';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="project-detail-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className="modal-header">
          <div className="header-left">
            <h2>{getProjectName()}</h2>
            <p className="project-number">#{project.budgetNumber}</p>
          </div>
          <div className="header-right">
            <div 
              className="status-badge"
              style={{ backgroundColor: getStatusColor(project.status) }}
            >
              {getStatusText(project.status)}
            </div>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* TABS */}
        <div className="modal-tabs">
          <button 
            className={activeTab === 'info' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('info')}
          >
            Informações
          </button>
          <button 
            className={activeTab === 'answers' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('answers')}
          >
            Respostas
          </button>
          <button 
            className={activeTab === 'timeline' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('timeline')}
          >
            Histórico
          </button>
          {project.status === 'approved' && project.tasks && (
            <button 
              className={activeTab === 'tasks' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('tasks')}
            >
              Tarefas ({project.tasks.length})
            </button>
          )}
        </div>

        {/* CONTENT */}
        <div className="modal-content">
          
          {/* ABA INFORMAÇÕES */}
          {activeTab === 'info' && (
            <div className="tab-content">
              <div className="info-section">
                <h3>Cliente</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Nome:</label>
                    <span>{project.clientName || '-'}</span>
                  </div>
                  <div className="info-item">
                    <label>Email:</label>
                    <span>{project.clientEmail || '-'}</span>
                  </div>
                  {project.clientPhone && (
                    <div className="info-item">
                      <label>Telefone:</label>
                      <span>{project.clientPhone}</span>
                    </div>
                  )}
                  {project.companyName && (
                    <div className="info-item">
                      <label>Empresa:</label>
                      <span>{project.companyName}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="info-section">
                <h3>Projeto</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Tipo de Evento:</label>
                    <span>{project.eventTypeName}</span>
                  </div>
                  <div className="info-item">
                    <label>Solicitado em:</label>
                    <span>{formatDate(project.createdAt)}</span>
                  </div>
                  {project.assignedToName && (
                    <div className="info-item">
                      <label>Atendimento:</label>
                      <span>{project.assignedToName}</span>
                    </div>
                  )}
                  {project.estimatedTotal > 0 && (
                    <div className="info-item">
                      <label>Valor Estimado:</label>
                      <span className="highlight-value">
                        R$ {project.estimatedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {project.status === 'approved' && (
                <div className="info-section success-section">
                  <h3>Aprovação</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Aprovado por:</label>
                      <span>{project.approvedByName}</span>
                    </div>
                    <div className="info-item">
                      <label>Data:</label>
                      <span>{formatDate(project.approvedAt)}</span>
                    </div>
                  </div>
                </div>
              )}

              {project.status === 'rejected' && project.rejectionReason && (
                <div className="info-section reject-section">
                  <h3>Rejeição</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Rejeitado por:</label>
                      <span>{project.rejectedByName}</span>
                    </div>
                    <div className="info-item">
                      <label>Data:</label>
                      <span>{formatDate(project.rejectedAt)}</span>
                    </div>
                    <div className="info-item full-width">
                      <label>Motivo:</label>
                      <p className="rejection-reason">{project.rejectionReason}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA RESPOSTAS */}
          {activeTab === 'answers' && (
            <div className="tab-content">
              {project.questions && project.questions.length > 0 ? (
                <div className="answers-list">
                  {project.questions.map((question) => (
                    <div key={question.id} className="answer-item">
                      <div className="question-text">{question.text}</div>
                      <div className="answer-text">
                        {getAnswerDisplay(question, project.answers?.[question.id])}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>Nenhuma resposta disponível</p>
                </div>
              )}
            </div>
          )}

          {/* ABA HISTÓRICO */}
          {activeTab === 'timeline' && (
            <div className="tab-content">
              {project.timeline && project.timeline.length > 0 ? (
                <div className="timeline">
                  {project.timeline.map((item, index) => (
                    <div key={index} className="timeline-item">
                      <div className="timeline-icon"></div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <strong>{item.description}</strong>
                          <span className="timeline-date">{formatDate(item.timestamp)}</span>
                        </div>
                        <div className="timeline-user">Por: {item.userName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>Nenhum histórico disponível</p>
                </div>
              )}
            </div>
          )}

          {/* ABA TAREFAS */}
          {activeTab === 'tasks' && project.tasks && (
            <div className="tab-content">
              <div className="tasks-list">
                {project.tasks.map((task, index) => (
                  <div key={index} className="task-item">
                    <div className="task-number">#{index + 1}</div>
                    <div className="task-content">
                      <div className="task-name">{task.name}</div>
                      {task.description && (
                        <div className="task-description">{task.description}</div>
                      )}
                      <div className="task-meta">
                        <span className={`task-status status-${task.status}`}>
                          {task.status === 'pending' && 'Pendente'}
                          {task.status === 'in_progress' && 'Em Andamento'}
                          {task.status === 'completed' && 'Concluída'}
                        </span>
                        {task.assignedToName && (
                          <span className="task-assigned">
                            Responsável: {task.assignedToName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectDetailModal;
