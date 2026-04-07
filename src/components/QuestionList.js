import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import QuestionForm from './QuestionForm';
import '../styles/QuestionList.css';

function QuestionList() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [creatingSpecialType, setCreatingSpecialType] = useState(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      const q = query(collection(db, 'questions'), orderBy('order', 'asc'));
      const querySnapshot = await getDocs(q);
      const questionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setQuestions(questionsData);
    } catch (error) {
      console.error('Erro ao carregar perguntas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, specialType) => {
    if (specialType) {
      alert('Perguntas especiais não podem ser deletadas. Use o botão Editar para modificá-las.');
      return;
    }

    if (window.confirm('Tem certeza que deseja deletar esta pergunta?')) {
      try {
        await deleteDoc(doc(db, 'questions', id));
        setQuestions(questions.filter(q => q.id !== id));
        alert('Pergunta deletada com sucesso!');
      } catch (error) {
        console.error('Erro ao deletar:', error);
        alert('Erro ao deletar pergunta');
      }
    }
  };

  const handleEdit = (question) => {
    setEditingQuestion(question);
    setCreatingSpecialType(null);
    setShowForm(true);
  };

  const handleCreateSpecial = (type) => {
    setCreatingSpecialType(type);
    setEditingQuestion(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingQuestion(null);
    setCreatingSpecialType(null);
  };

  const handleSave = () => {
    loadQuestions();
    handleCloseForm();
  };

  const translateType = (type) => {
    const types = {
      'multiple': 'Múltipla Escolha',
      'multiselect': 'Seleção Única',
      'number': 'Número',
      'text': 'Texto',
      'date': 'Data',
      'currency': 'Valor em Reais',
      'yesno': 'Sim/Não'
    };
    return types[type] || type;
  };

  const translateRole = (role) => {
    const roles = {
      'client': 'Cliente',
      'attendant': 'Atendente',
      'producer': 'Produtor'
    };
    return roles[role] || role;
  };

  const specialQuestions = questions.filter(q => q.specialType);
  const normalQuestions = questions.filter(q => !q.specialType);
  
  const hasInitial = specialQuestions.some(q => q.specialType === 'initial');
  const hasFinalization = specialQuestions.some(q => q.specialType === 'finalization');

  if (loading) {
    return <div className="loading">Carregando perguntas...</div>;
  }

  return (
    <div className="question-list-container">
      <div className="list-header">
        <h2>Banco de Perguntas</h2>
        <div className="header-actions">
          {!hasInitial && (
            <button 
              className="btn-special btn-initial" 
              onClick={() => handleCreateSpecial('initial')}
            >
              + Criar Pergunta Inicial
            </button>
          )}
          {!hasFinalization && (
            <button 
              className="btn-special btn-finalization" 
              onClick={() => handleCreateSpecial('finalization')}
            >
              + Criar Finalização
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Nova Pergunta
          </button>
        </div>
      </div>

      {/* PERGUNTAS ESPECIAIS */}
      {specialQuestions.length > 0 && (
        <div className="special-section">
          <h3 className="section-title">Perguntas Especiais</h3>
          <div className="table-container">
            <table className="questions-table special-table">
              <thead>
                <tr>
                  <th className="col-badge">Tipo</th>
                  <th className="col-text">Pergunta</th>
                  <th className="col-options">Opções</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {specialQuestions.map((question) => (
                  <tr key={question.id} className="special-row">
                    <td>
                      <span className={`badge badge-special badge-${question.specialType}`}>
                        {question.specialType === 'initial' ? 'INICIAL' : 'FINAL'}
                      </span>
                    </td>
                    <td className="question-text-cell">
                      <strong>{question.text}</strong>
                      <div className="question-description">
                        {question.specialType === 'initial' 
                          ? 'Primeira pergunta do questionário'
                          : 'Tela de finalização e envio'}
                      </div>
                    </td>
                    <td>
                      {question.options && question.options.length > 0 ? (
                        <span className="options-count">{question.options.length} opções</span>
                      ) : (
                        <span className="no-options">-</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${question.active ? 'badge-active' : 'badge-inactive'}`}>
                        {question.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn-action btn-edit" onClick={() => handleEdit(question)}>
                        Editar
                      </button>
                      <button className="btn-action btn-delete" disabled title="Não pode deletar">
                        Deletar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PERGUNTAS NORMAIS */}
      <div className="normal-section">
        <h3 className="section-title">Perguntas do Questionário</h3>
        
        {normalQuestions.length === 0 ? (
          <div className="empty-state">
            <p>Nenhuma pergunta cadastrada ainda</p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              Criar primeira pergunta
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="questions-table">
              <thead>
                <tr>
                  <th className="col-order">#</th>
                  <th className="col-text">Pergunta</th>
                  <th className="col-type">Tipo</th>
                  <th className="col-role">Responde</th>
                  <th className="col-options">Opções</th>
                  <th className="col-subquestions">Sub</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {normalQuestions.map((question) => (
                  <tr key={question.id}>
                    <td className="order-cell">#{question.order}</td>
                    <td className="question-text-cell">
                      <strong>{question.text}</strong>
                      {question.required && <span className="required-indicator">*</span>}
                    </td>
                    <td>{translateType(question.type)}</td>
                    <td>{translateRole(question.responsibleRole)}</td>
                    <td>
                      {question.options && question.options.length > 0 ? (
                        <span className="options-count">{question.options.length} opções</span>
                      ) : (
                        <span className="no-options">-</span>
                      )}
                    </td>
                    <td className="center-cell">
                      {question.subQuestions && question.subQuestions.length > 0 ? (
                        <span className="subquestions-badge">{question.subQuestions.length}</span>
                      ) : (
                        <span className="no-sub">-</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${question.active ? 'badge-active' : 'badge-inactive'}`}>
                        {question.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn-action btn-edit" onClick={() => handleEdit(question)}>
                        Editar
                      </button>
                      <button className="btn-action btn-delete" onClick={() => handleDelete(question.id, question.specialType)}>
                        Deletar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <QuestionForm 
          onClose={handleCloseForm}
          onSave={handleSave}
          editQuestion={editingQuestion}
          specialType={creatingSpecialType}
        />
      )}
    </div>
  );
}

export default QuestionList;
