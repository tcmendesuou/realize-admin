import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/QuestionForm.css';

function QuestionForm({ onClose, onSave, editQuestion = null, specialType = null }) {
  const isEditMode = editQuestion !== null;
  const isSpecialMode = specialType !== null || (editQuestion && editQuestion.specialType);

  const [formData, setFormData] = useState({
    text: '',
    type: 'multiple',
    responsibleRole: 'client',
    required: true,
    active: true,
    order: 1,
    specialType: specialType || null
  });

  const [options, setOptions] = useState([]);
  const [subQuestions, setSubQuestions] = useState([]);
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEditMode) {
      setFormData({
        text: editQuestion.text || '',
        type: editQuestion.type || 'multiple',
        responsibleRole: editQuestion.responsibleRole || 'client',
        required: editQuestion.required !== undefined ? editQuestion.required : true,
        active: editQuestion.active !== undefined ? editQuestion.active : true,
        order: editQuestion.order || 1,
        specialType: editQuestion.specialType || null
      });

      if (editQuestion.options) {
        setOptions(editQuestion.options);
      }

      if (editQuestion.subQuestions) {
        setSubQuestions(editQuestion.subQuestions);
      }

      setShowOptions(
        editQuestion.type === 'multiple' || 
        editQuestion.type === 'multiselect'
      );
    } else if (specialType) {
      if (specialType === 'initial') {
        setFormData({
          ...formData,
          text: 'Qual tipo de evento você deseja realizar?',
          type: 'multiple',
          specialType: 'initial',
          responsibleRole: 'client',
          required: true,
          active: true,
          order: 0
        });
        setShowOptions(true);
      } else if (specialType === 'finalization') {
        setFormData({
          ...formData,
          text: 'Finalizar e Enviar Orçamento',
          type: 'finalization',
          specialType: 'finalization',
          responsibleRole: 'client',
          required: true,
          active: true,
          order: 999
        });
        setShowOptions(false);
      }
    } else {
      // 🆕 BUSCAR ORDEM AUTOMÁTICA (quando NÃO está editando e NÃO é especial)
      loadQuestionsForOrder();
    }
  }, [isEditMode, editQuestion, specialType]);

  // 🆕 FUNÇÃO PARA BUSCAR ORDEM MÁXIMA
  const loadQuestionsForOrder = async () => {
    try {
      const q = query(
        collection(db, 'questions'), 
        orderBy('order', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const questionsData = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      
      // Se tem perguntas, pegar a maior ordem e adicionar 1
      if (questionsData.length > 0) {
        const maxOrder = Math.max(...questionsData.map(q => q.order || 0));
        setFormData(prev => ({ ...prev, order: maxOrder + 1 }));
      } else {
        // Se não tem nenhuma, começar com 1
        setFormData(prev => ({ ...prev, order: 1 }));
      }
    } catch (error) {
      console.error('Erro ao carregar ordem:', error);
      setFormData(prev => ({ ...prev, order: 1 }));
    }
  };

  const questionTypes = [
    { value: 'multiple', label: 'Múltipla Escolha' },
    { value: 'multiselect', label: 'Seleção Única' },
    { value: 'number', label: 'Número' },
    { value: 'text', label: 'Texto Curto' },
    { value: 'date', label: 'Data' },
    { value: 'currency', label: 'Valor em Reais' },
    { value: 'yesno', label: 'Sim/Não' }
  ];

  const responsibleRoles = [
    { value: 'client', label: 'Cliente' },
    { value: 'attendant', label: 'Atendente' },
    { value: 'producer', label: 'Produtor' }
  ];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });

    if (name === 'type') {
      const needsOptions = value === 'multiple' || value === 'multiselect';
      setShowOptions(needsOptions);
      
      if (!needsOptions) {
        setOptions([]);
      }
    }
  };

  const addOption = () => {
    setOptions([
      ...options,
      {
        id: Date.now().toString(),
        label: '',
        basePrice: 0,
        pricePerPerson: 0
      }
    ]);
  };

  const updateOption = (id, field, value) => {
    setOptions(options.map(opt => 
      opt.id === id ? { ...opt, [field]: value } : opt
    ));
  };

  const removeOption = (id) => {
    setOptions(options.filter(opt => opt.id !== id));
  };

  // MÚLTIPLAS SUBPERGUNTAS
  const handleAddSubQuestion = () => {
    setSubQuestions([
      ...subQuestions,
      {
        id: Date.now().toString(),
        trigger: formData.type === 'yesno' ? 'yes' : (options[0]?.id || ''),
        text: '',
        type: 'multiple',
        required: true,
        linkToMainQuantity: false,
        options: []
      }
    ]);
  };

  const handleRemoveSubQuestion = (subId) => {
    setSubQuestions(subQuestions.filter(sub => sub.id !== subId));
  };

  const updateSubQuestion = (subId, field, value) => {
    setSubQuestions(subQuestions.map(sub =>
      sub.id === subId ? { ...sub, [field]: value } : sub
    ));
  };

  const addSubQuestionOption = (subId) => {
    setSubQuestions(subQuestions.map(sub => {
      if (sub.id === subId) {
        return {
          ...sub,
          options: [
            ...(sub.options || []),
            {
              id: Date.now().toString(),
              label: '',
              basePrice: 0,
              pricePerPerson: 0
            }
          ]
        };
      }
      return sub;
    }));
  };

  const updateSubQuestionOption = (subId, optId, field, value) => {
    setSubQuestions(subQuestions.map(sub => {
      if (sub.id === subId) {
        return {
          ...sub,
          options: sub.options.map(opt =>
            opt.id === optId ? { ...opt, [field]: value } : opt
          )
        };
      }
      return sub;
    }));
  };

  const removeSubQuestionOption = (subId, optId) => {
    setSubQuestions(subQuestions.map(sub => {
      if (sub.id === subId) {
        return {
          ...sub,
          options: sub.options.filter(opt => opt.id !== optId)
        };
      }
      return sub;
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const questionData = {
        ...formData,
        order: Number(formData.order),
        updatedAt: new Date()
      };

      if (showOptions && options.length > 0) {
        questionData.options = options.map(opt => ({
          ...opt,
          basePrice: Number(opt.basePrice),
          pricePerPerson: Number(opt.pricePerPerson)
        }));
      }

      if (subQuestions.length > 0) {
        questionData.subQuestions = subQuestions.map(sub => ({
          ...sub,
          options: sub.options?.map(opt => ({
            ...opt,
            basePrice: Number(opt.basePrice),
            pricePerPerson: Number(opt.pricePerPerson)
          })) || []
        }));
      }

      if (isEditMode) {
        await updateDoc(doc(db, 'questions', editQuestion.id), questionData);
        alert('Pergunta atualizada com sucesso!');
      } else {
        questionData.createdAt = new Date();
        await addDoc(collection(db, 'questions'), questionData);
        alert('Pergunta criada com sucesso!');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar pergunta');
    } finally {
      setLoading(false);
    }
  };

  const getModalTitle = () => {
    if (isEditMode) {
      if (formData.specialType === 'initial') return 'Editar Pergunta Inicial';
      if (formData.specialType === 'finalization') return 'Editar Finalização';
      return 'Editar Pergunta';
    }
    if (specialType === 'initial') return 'Criar Pergunta Inicial';
    if (specialType === 'finalization') return 'Criar Finalização';
    return 'Nova Pergunta';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{getModalTitle()}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {isSpecialMode && (
            <div className="special-notice">
              {formData.specialType === 'initial' && (
                <p>
                  <strong>Pergunta Inicial:</strong> Esta será a primeira pergunta do questionário. 
                  Adicione as opções de tipos de evento que você oferece.
                </p>
              )}
              {formData.specialType === 'finalization' && (
                <p>
                  <strong>Finalização:</strong> Esta é a tela final onde o cliente revisa 
                  e envia o orçamento para análise.
                </p>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Texto da Pergunta *</label>
            <input
              type="text"
              name="text"
              value={formData.text}
              onChange={handleChange}
              placeholder="Ex: Quantas pessoas vão participar?"
              required
            />
          </div>

          {!isSpecialMode && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Ordem de Exibição *</label>
                  <input
                    type="number"
                    name="order"
                    value={formData.order}
                    onChange={handleChange}
                    min="1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Tipo de Resposta *</label>
                  <select name="type" value={formData.type} onChange={handleChange}>
                    {questionTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Quem Responde *</label>
                  <select name="responsibleRole" value={formData.responsibleRole} onChange={handleChange}>
                    {responsibleRoles.map(role => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="form-row">
            <div className="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="required"
                  checked={formData.required}
                  onChange={handleChange}
                />
                Obrigatória
              </label>
            </div>

            <div className="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="active"
                  checked={formData.active}
                  onChange={handleChange}
                />
                Ativa
              </label>
            </div>
          </div>

          {/* OPÇÕES DE RESPOSTA */}
          {showOptions && (
            <div className="options-section">
              <div className="options-header">
                <h3>Opções de Resposta</h3>
                <button type="button" className="btn-add-option" onClick={addOption}>
                  + Adicionar Opção
                </button>
              </div>

              {options.length === 0 && (
                <p className="empty-options">Nenhuma opção adicionada. Clique em "Adicionar Opção"</p>
              )}

              {options.map((option) => (
                <div key={option.id} className="option-item">
                  <div className="option-field">
                    <label>Nome da Opção *</label>
                    <input
                      type="text"
                      placeholder="Ex: Buffet Completo"
                      value={option.label}
                      onChange={(e) => updateOption(option.id, 'label', e.target.value)}
                      required
                    />
                  </div>
                  <div className="option-field">
                    <label>Preço Fixo (R$)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={option.basePrice}
                      onChange={(e) => updateOption(option.id, 'basePrice', e.target.value)}
                      min="0"
                      step="0.01"
                    />
                    <small>Valor fixo do serviço</small>
                  </div>
                  <div className="option-field">
                    <label>Preço por Pessoa (R$)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={option.pricePerPerson}
                      onChange={(e) => updateOption(option.id, 'pricePerPerson', e.target.value)}
                      min="0"
                      step="0.01"
                    />
                    <small>Multiplica pelo nº de convidados</small>
                  </div>
                  <button
                    type="button"
                    className="btn-remove-option"
                    onClick={() => removeOption(option.id)}
                    title="Remover opção"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* MÚLTIPLAS SUBPERGUNTAS CONDICIONAIS */}
          {!isSpecialMode && (formData.type === 'yesno' || showOptions) && (
            <div className="subquestion-section">
              <div className="subquestion-header">
                <h3>Perguntas Condicionais (Subperguntas)</h3>
                <button 
                  type="button" 
                  className="btn-add-subquestion"
                  onClick={handleAddSubQuestion}
                >
                  + Adicionar Subpergunta
                </button>
              </div>

              {subQuestions.map((subQuestion, index) => (
                <div key={subQuestion.id} className="subquestion-box">
                  <div className="subquestion-number">Subpergunta #{index + 1}</div>
                  
                  <div className="subquestion-controls">
                    <label className="subquestion-label">
                      Esta pergunta será exibida SE a resposta da pergunta principal for:
                    </label>
                    <select
                      value={subQuestion.trigger}
                      onChange={(e) => updateSubQuestion(subQuestion.id, 'trigger', e.target.value)}
                      className="trigger-select"
                    >
                      {formData.type === 'yesno' ? (
                        <>
                          <option value="yes">SIM</option>
                          <option value="no">NÃO</option>
                        </>
                      ) : (
                        options.map(opt => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label || 'Opção sem nome'}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      className="btn-remove-subquestion"
                      onClick={() => handleRemoveSubQuestion(subQuestion.id)}
                    >
                      Remover Subpergunta
                    </button>
                  </div>

                  <div className="form-group">
                    <label>Texto da Subpergunta *</label>
                    <input
                      type="text"
                      value={subQuestion.text}
                      onChange={(e) => updateSubQuestion(subQuestion.id, 'text', e.target.value)}
                      placeholder="Ex: Escolha os tipos de A&B"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Tipo de Resposta</label>
                    <select
                      value={subQuestion.type}
                      onChange={(e) => updateSubQuestion(subQuestion.id, 'type', e.target.value)}
                    >
                      {questionTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="checkbox-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={subQuestion.linkToMainQuantity || false}
                        onChange={(e) => updateSubQuestion(subQuestion.id, 'linkToMainQuantity', e.target.checked)}
                      />
                      Vincular preço com quantidade de pessoas da pergunta principal
                    </label>
                  </div>

                  {(subQuestion.type === 'multiple' || subQuestion.type === 'multiselect') && (
                    <div className="options-section">
                      <div className="options-header">
                        <h4>Opções da Subpergunta</h4>
                        <button 
                          type="button" 
                          className="btn-add-option-small" 
                          onClick={() => addSubQuestionOption(subQuestion.id)}
                        >
                          + Opção
                        </button>
                      </div>

                      {subQuestion.options?.map((option) => (
                        <div key={option.id} className="option-item">
                          <div className="option-field">
                            <label>Nome *</label>
                            <input
                              type="text"
                              placeholder="Ex: Open Bar Premium"
                              value={option.label}
                              onChange={(e) => updateSubQuestionOption(subQuestion.id, option.id, 'label', e.target.value)}
                              required
                            />
                          </div>
                          <div className="option-field">
                            <label>Preço Fixo</label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={option.basePrice}
                              onChange={(e) => updateSubQuestionOption(subQuestion.id, option.id, 'basePrice', e.target.value)}
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div className="option-field">
                            <label>Por Pessoa</label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={option.pricePerPerson}
                              onChange={(e) => updateSubQuestionOption(subQuestion.id, option.id, 'pricePerPerson', e.target.value)}
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <button
                            type="button"
                            className="btn-remove-option"
                            onClick={() => removeSubQuestionOption(subQuestion.id, option.id)}
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-save" disabled={loading}>
              {loading ? 'Salvando...' : (isEditMode ? 'Atualizar Pergunta' : 'Salvar Pergunta')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuestionForm;
