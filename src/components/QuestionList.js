import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import QuestionForm from './QuestionForm';
import '../styles/QuestionList.css';

// ─── Perguntas Fixas do Sistema (hardcoded) ───────────────────────────────────
const FIXED_BLOCKS = [
  {
    id: 'fixed-block-briefing',
    text: 'Briefing Inicial',
    type: 'fixed-block',
    description: 'Bloco fixo de abertura do briefing. Coleta: Cliente, Responsável, Atendimento (auto), Data (auto), Propósito e Feiras (nome, local e data de cada uma).',
    fields: [
      { label: 'Cliente', type: 'fixed-client' },
      { label: 'Responsável', type: 'fixed-responsible' },
      { label: 'Atendimento', type: 'fixed-attendant' },
      { label: 'Data', type: 'fixed-date' },
      { label: 'Propósito', type: 'textarea' },
      { label: 'Feiras', type: 'fixed-events' },
    ],
  },
  {
    id: 'fixed-block-envio',
    text: 'Envio',
    type: 'fixed-block',
    description: 'Bloco fixo de encaminhamento. Seleciona o responsável da agência que vai receber o briefing e gerar as tarefas.',
    fields: [
      { label: 'Encaminhar para', type: 'fixed-envio' },
    ],
  },
];

function QuestionList() {
  const [questions, setQuestions] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [filterArea, setFilterArea] = useState('all');
  const [previewBlock, setPreviewBlock] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [questionsSnap, areasSnap] = await Promise.all([
        getDocs(query(collection(db, 'questions'), orderBy('order', 'asc'))),
        getDocs(collection(db, 'areas')),
      ]);
      setQuestions(questionsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAreas(areasSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (error) {
      console.error('Erro ao carregar perguntas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
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
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingQuestion(null);
  };

  const handleSave = () => {
    loadData();
    handleCloseForm();
  };

  const translateType = (type) => {
    const types = {
      multiple: 'Múltipla Escolha', multiselect: 'Seleção Múltipla',
      number: 'Número', text: 'Texto Curto', textarea: 'Texto Longo',
      date: 'Data', currency: 'Valor em Reais', yesno: 'Sim/Não',
      'fixed-client': '⚙ Cliente', 'fixed-responsible': '⚙ Responsável',
      'fixed-attendant': '⚙ Atendimento', 'fixed-date': '⚙ Data Evento',
      'fixed-events': '⚙ Múlt. Eventos',
    };
    return types[type] || type;
  };

  const FIXED_TYPES = ['fixed-client','fixed-responsible','fixed-attendant','fixed-date','fixed-events'];

  const filteredQuestions = questions.filter(q => {
    if (filterArea !== 'all' && q.areaId !== filterArea) return false;
    return true;
  });

  if (loading) return <div className="loading">Carregando perguntas...</div>;

  return (
    <div className="question-list-container">
      <div className="list-header">
        <h2>Banco de Perguntas</h2>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nova Pergunta</button>
        </div>
      </div>

      {/* ── BLOCOS FIXOS DO SISTEMA ── */}
      <div className="fixed-blocks-section">
        <div className="fixed-blocks-title">
          <span className="fixed-blocks-icon">⚙</span>
          Perguntas Fixas do Sistema
          <span className="fixed-blocks-subtitle">Definidas no código — não podem ser editadas ou deletadas</span>
        </div>
        <div className="table-container">
          <table className="questions-table">
            <thead>
              <tr>
                <th className="col-order">#</th>
                <th className="col-text">Bloco</th>
                <th className="col-type">Tipo</th>
                <th className="col-role">Campos</th>
                <th className="col-status">Status</th>
                <th className="col-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {FIXED_BLOCKS.map((block, index) => (
                <tr key={block.id} className="fixed-block-row">
                  <td className="order-cell">
                    <span className="fixed-order-icon">⚙</span>
                  </td>
                  <td className="question-text-cell">
                    <strong>{block.text}</strong>
                    <span className="fixed-block-desc">{block.description}</span>
                  </td>
                  <td>
                    <span className="badge-fixed-block">Bloco Fixo</span>
                  </td>
                  <td>
                    <div className="fixed-fields-list">
                      {block.fields.map((f, i) => (
                        <span key={i} className="fixed-field-tag">{f.label}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-active">Ativo</span>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="btn-action btn-edit"
                      onClick={() => setPreviewBlock(previewBlock?.id === block.id ? null : block)}
                    >
                      {previewBlock?.id === block.id ? 'Fechar' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Preview do bloco fixo */}
        {previewBlock && (
          <div className="fixed-block-preview">
            <div className="fixed-block-preview-header">
              <strong>Preview — {previewBlock.text}</strong>
              <button className="fixed-preview-close" onClick={() => setPreviewBlock(null)}>✕ Fechar</button>
            </div>
            <div className="fixed-block-preview-fields">
              {previewBlock.fields.map((f, i) => (
                <div key={i} className="fixed-preview-field">
                  <span className="fixed-preview-label">{f.label}</span>
                  <span className="fixed-preview-type">{translateType(f.type)}</span>
                  {(f.type === 'fixed-client' || f.type === 'fixed-responsible') && (
                    <span className="fixed-preview-hint">Abre lista para seleção</span>
                  )}
                  {f.type === 'fixed-attendant' && (
                    <span className="fixed-preview-hint">Preenchido automaticamente (editável)</span>
                  )}
                  {f.type === 'fixed-date' && (
                    <span className="fixed-preview-hint">Data de hoje (editável)</span>
                  )}
                  {f.type === 'textarea' && (
                    <span className="fixed-preview-hint">Campo de texto livre</span>
                  )}
                  {f.type === 'fixed-events' && (
                    <span className="fixed-preview-hint">Nº de feiras → abre boxes de nome, local e data</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── FILTRO ── */}
      <div className="filters-bar">
        <div className="filter-group">
          <label>Área:</label>
          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}>
            <option value="all">Todas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="filter-results">
          {filteredQuestions.length} {filteredQuestions.length === 1 ? 'pergunta' : 'perguntas'}
        </div>
      </div>

      {/* ── PERGUNTAS VARIÁVEIS ── */}
      <div className="normal-section">
        {filteredQuestions.length === 0 ? (
          <div className="empty-state">
            <p>Nenhuma pergunta cadastrada ainda</p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>Criar primeira pergunta</button>
          </div>
        ) : (
          <div className="table-container">
            <table className="questions-table">
              <thead>
                <tr>
                  <th className="col-order">#</th>
                  <th className="col-text">Pergunta</th>
                  <th className="col-type">Tipo</th>
                  <th className="col-role">Área / Cargo</th>
                  <th className="col-stage">Etapa</th>
                  <th className="col-options">Opções</th>
                  <th className="col-subquestions">Sub</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map((question) => (
                  <tr key={question.id}>
                    <td className="order-cell">#{question.order}</td>
                    <td className="question-text-cell">
                      <strong>{question.text}</strong>
                      {question.required && <span className="required-indicator">*</span>}
                      {question.isShared && <span className="badge-shared" title="Comum a todos os eventos"> 🔗</span>}
                    </td>
                    <td>
                      {FIXED_TYPES.includes(question.type)
                        ? <span className="badge-fixed">{translateType(question.type)}</span>
                        : translateType(question.type)
                      }
                    </td>
                    <td>
                      <span className="responsible-area">{question.areaName || '—'}</span>
                      {question.roleName && <span className="responsible-role">{question.roleName}</span>}
                    </td>
                    <td>
                      <span className="stage-badge">{question.kanbanStage || '—'}</span>
                    </td>
                    <td>
                      {question.options && question.options.length > 0
                        ? <span className="options-count">{question.options.length} opções</span>
                        : <span className="no-options">-</span>}
                    </td>
                    <td className="center-cell">
                      {question.subQuestions && question.subQuestions.length > 0
                        ? <span className="subquestions-badge">{question.subQuestions.length}</span>
                        : <span className="no-sub">-</span>}
                    </td>
                    <td>
                      <span className={`badge ${question.active ? 'badge-active' : 'badge-inactive'}`}>
                        {question.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn-action btn-edit" onClick={() => handleEdit(question)}>Editar</button>
                      <button className="btn-action btn-delete" onClick={() => handleDelete(question.id)}>Deletar</button>
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
          specialType={null}
        />
      )}
    </div>
  );
}

export default QuestionList;
