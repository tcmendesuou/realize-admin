import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Componente de etapa do cronograma (precisa de state local para toggle participantes) ──
function EtapaCrono({ etapa, etapaData, isConcluida, isActive, isFutura, isReuniao, participantes, dotBg, dotBorder, labelCol, isLast, canEdit, canPlan, agencyUsers, inp, saveCrono, toggleParticipante, concluirEtapa, agendarReuniao, handleReprovado }) {
  const [showPart, setShowPart] = React.useState(false);
  const [filtCargo, setFiltCargo] = React.useState('');
  const cargos = [...new Set(agencyUsers.map(u => u.roleName).filter(Boolean))].sort();
  const usersFiltered = filtCargo ? agencyUsers.filter(u => u.roleName === filtCargo) : agencyUsers;
  const isAgendada = !!etapaData.agendada && !isConcluida;

  return (
    <>
      <div style={{ display: 'flex', gap: 16, padding: '20px 0', position: 'relative', opacity: isFutura ? 0.4 : 1, transition: 'opacity 0.2s' }}>
        {/* Bolinha */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: dotBg, border: `2px solid ${dotBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: isConcluida || isActive ? 'white' : '#94a3b8', zIndex: 1 }}>
            {isConcluida ? '✓' : etapa.num}
          </div>
        </div>
        {/* Conteúdo */}
        <div style={{ flex: 1, paddingTop: 4 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: labelCol }}>{etapa.label}</span>
            <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>{etapa.area}</span>
            {isAgendada && <span style={{ fontSize: 10, fontWeight: 700, color: '#FFA726', background: 'rgba(255,167,38,0.1)', padding: '2px 8px', borderRadius: 10 }}>AGENDADA</span>}
            {isConcluida && <span style={{ fontSize: 10, color: '#10b981' }}>Concluída por {etapaData.concluidaPor}</span>}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>{etapa.desc}</div>

          {/* Trigger */}
          {etapa.trigger && !isConcluida && (
            <div style={{ fontSize: 11, color: '#667eea', background: 'rgba(102,126,234,0.06)', borderRadius: 6, padding: '5px 10px', marginBottom: 10, borderLeft: '2px solid #667eea' }}>
              {etapa.trigger}
            </div>
          )}

          {/* Campos + Botões lado a lado */}
          {!isConcluida && !etapa.autoComplete && (canEdit || canPlan) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Campos de data/hora/sala/obs */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                  {isReuniao ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>DATA</span>
                        <input type="date" lang="pt-BR" defaultValue={etapaData.data || ''} onBlur={e => saveCrono(etapa.id, 'data', e.target.value)} style={inp} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>HORA</span>
                        <select defaultValue={etapaData.hora || ''} onBlur={e => saveCrono(etapa.id, 'hora', e.target.value)} style={inp}>
                          <option value="">--:--</option>
                          {Array.from({ length: 48 }, (_, i) => {
                            const h = String(Math.floor(i / 2)).padStart(2, '0');
                            const m = i % 2 === 0 ? '00' : '30';
                            return <option key={i} value={`${h}:${m}`}>{`${h}:${m}`}</option>;
                          })}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>SALA</span>
                        <input type="text" defaultValue={etapaData.sala || ''} onBlur={e => saveCrono(etapa.id, 'sala', e.target.value)} placeholder="Ex: Sala 2, Meet..." style={{ ...inp, minWidth: 100 }} />
                      </div>
                    </>
                  ) : etapa.tipo === 'aprovacao' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>DATA</span>
                      <input type="date" lang="pt-BR" defaultValue={etapaData.data || ''} onBlur={e => saveCrono(etapa.id, 'data', e.target.value)} style={inp} />
                    </div>
                  ) : etapa.tipo !== 'conclusao' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>DATA</span>
                      <input type="date" lang="pt-BR" defaultValue={etapaData.data || ''} onBlur={e => saveCrono(etapa.id, 'data', e.target.value)} style={inp} />
                    </div>
                  ) : null}
                </div>

                {/* Botões à direita */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'flex-end' }}>
                  {isReuniao ? (
                    <>
                      <button onClick={() => agendarReuniao(etapa.id)} style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                        border: 'none',
                        background: isAgendada ? '#FFA726' : 'none',
                        color: isAgendada ? 'white' : '#FFA726',
                        outline: isAgendada ? 'none' : '1.5px solid #FFA726',
                      }}>
                        {isAgendada ? 'Agendada' : 'Agendar'}
                      </button>
                      <button onClick={() => concluirEtapa(etapa.id)} style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                        border: '1.5px solid #10b981', background: 'white', color: '#10b981',
                      }}>
                        Concluída
                      </button>
                    </>
                  ) : etapa.tipo === 'aprovacao' ? (
                    <>
                      <button onClick={() => handleReprovado()} style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                        border: '1.5px solid #ef4444', background: 'white', color: '#ef4444',
                      }}>
                        Reprovado
                      </button>
                      <button onClick={() => concluirEtapa(etapa.id)} style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                        border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white',
                      }}>
                        Aprovado
                      </button>
                    </>
                  ) : (
                    <button onClick={() => concluirEtapa(etapa.id)} style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                      border: '1.5px solid #10b981', background: 'white', color: '#10b981',
                    }}>
                      Concluída
                    </button>
                  )}
                </div>
              </div>

              {/* Participantes — reuniões */}
              {isReuniao && !etapa.semParticipantes && (
                <div>
                  {participantes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                      {participantes.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, background: 'rgba(102,126,234,0.1)', border: '1px solid rgba(102,126,234,0.2)', fontSize: 11 }}>
                          <span style={{ color: '#667eea' }}>{p.name}</span>
                          <span style={{ color: '#94a3b8', fontSize: 10 }}>{p.roleName}</span>
                          <button onClick={() => toggleParticipante(etapa.id, p)} style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setShowPart(s => !s)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(102,126,234,0.3)', background: 'none', color: '#667eea', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    {showPart ? 'Fechar' : '+ Participantes'}
                  </button>
                  {showPart && (
                    <div style={{ marginTop: 8, padding: 10, background: '#f8faff', borderRadius: 8, border: '1px solid #e0e8ff' }}>
                      <select value={filtCargo} onChange={e => setFiltCargo(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 6 }}>
                        <option value="">Todos os cargos...</option>
                        {cargos.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                        {usersFiltered.map(u => {
                          const sel = participantes.some(p => p.id === u.id);
                          return (
                            <button key={u.id} onClick={() => toggleParticipante(etapa.id, u)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: `1px solid ${sel ? '#667eea' : '#e2e8f0'}`, background: sel ? 'rgba(102,126,234,0.08)' : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif' }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: sel ? '#667eea' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: sel ? 'white' : '#94a3b8', flexShrink: 0 }}>
                                {(u.name || '').split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: sel ? '#667eea' : '#1a2e40', fontWeight: sel ? 600 : 400 }}>{u.name}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{u.roleName}</div>
                              </div>
                              {sel && <span style={{ marginLeft: 'auto', color: '#667eea', fontSize: 12 }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Info readonly quando concluída */}
          {isConcluida && (
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#94a3b8', flexWrap: 'wrap' }}>
              {etapaData.data && <span>{etapaData.data}</span>}
              {etapaData.hora && <span>{etapaData.hora}</span>}
              {etapaData.sala && <span>{etapaData.sala}</span>}
              {etapaData.obs && <span>{etapaData.obs}</span>}
            </div>
          )}
          {isConcluida && participantes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {participantes.map(p => (
                <span key={p.id} style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: 10 }}>{p.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Linha separadora */}
      {!isLast && <div style={{ height: 1, background: '#f0f2f5', margin: '0 0 0 46px' }} />}
    </>
  );
}

// ── Componente de tarefa vinculada na Sessão de Planejamento ──
function LinkedTaskCard({ lt, existing, agencyUsers, agencyRoles, requisitions, projectId, questionId, userData, project }) {
  const [editing, setEditing] = React.useState(false);
  const src = existing || lt; // usa dados existentes se já atribuída
  const [form, setForm] = React.useState({
    name: src.name || lt.name,
    descricao: src.descricao || lt.description || '',
    cargoId: src.roleId || lt.roleId || '',
    cargoNome: src.cargoNome || lt.roleName || '',
    pessoaId: src.assignedTo || '',
    pessoaNome: src.assignedToName || '',
    requisicaoId: src.requisicaoId || lt.requisicaoId || '',
    requisicaoCodigo: src.requisicaoCodigo || lt.requisicaoCodigo || '',
    requisicaoNome: src.requisicaoNome || lt.requisicaoNome || '',
    prioridade: src.prioridade || lt.priority || 'normal',
    prazo: src.prazo || '',
    observacao: src.observacao || lt.observacao || '',
    periodo: src.periodo || lt.periodo || '',
    quantidade: src.quantidade || lt.quantidade || '',
    custoUnitario: src.custoUnitario || lt.custoUnitario || '',
    bvPct: src.bvPct || lt.bvPct || '',
    credito: src.credito || lt.credito || '',
  });

  const setF = (upd) => setForm(p => ({ ...p, ...(typeof upd === 'function' ? upd(p) : upd) }));
  const reqSel = requisitions.find(r => r.id === form.requisicaoId);
  const campos = reqSel?.campos || [];
  const filteredUsers = form.cargoId ? agencyUsers.filter(u => u.roleId === form.cargoId) : agencyUsers;
  const inp = { padding: '7px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 12, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#5a6a7a', display: 'block', marginBottom: 3 };

  const saveLinkedTask = async () => {
    if (!form.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    const jobTasks = project.tasks || [];
    const newTask = {
      taskId: existing?.taskId || `linked-${lt.id}-${Date.now()}`,
      templateId: lt.id, type: 'linked',
      name: form.name, descricao: form.descricao,
      roleId: form.cargoId, cargoNome: form.cargoNome,
      assignedTo: form.pessoaId, assignedToName: form.pessoaNome,
      requisicaoId: form.requisicaoId, requisicaoCodigo: form.requisicaoCodigo, requisicaoNome: form.requisicaoNome,
      jobStage: lt.jobStage || '', isComum: lt.isComum || false,
      prioridade: form.prioridade, prazo: form.prazo, observacao: form.observacao,
      periodo: form.periodo, quantidade: form.quantidade, custoUnitario: form.custoUnitario,
      bvPct: form.bvPct, credito: form.credito,
      questionId, status: 'backlog', createdAt: new Date(), createdBy: userData?.name,
    };
    const updatedTasks = existing
      ? jobTasks.map(t => t.taskId === existing.taskId ? newTask : t)
      : [...jobTasks, newTask];
    try {
      await updateDoc(doc(db, 'budgets', projectId), { tasks: updatedTasks, updatedAt: new Date() });
      setEditing(false);
    } catch(e) { console.error(e); alert('Erro ao salvar tarefa'); }
  };

  return (
    <div style={{ marginBottom: 8, borderRadius: 7, border: `1px solid ${existing ? '#10b98133' : 'rgba(102,126,234,0.2)'}`, background: existing ? 'rgba(16,185,129,0.04)' : 'white', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
        {(form.requisicaoCodigo || lt.requisicaoCodigo) && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: '#667eea22', color: '#667eea', flexShrink: 0 }}>{form.requisicaoCodigo || lt.requisicaoCodigo}</span>
        )}
        <span style={{ fontSize: 12, fontWeight: 500, color: '#1e293b', flex: 1 }}>{form.name}</span>
        <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{form.cargoNome}</span>
        {existing && <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600, flexShrink: 0 }}>✓ {existing.assignedToName}</span>}
        <button onClick={() => setEditing(e => !e)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid rgba(102,126,234,0.3)', background: editing ? 'rgba(102,126,234,0.1)' : 'none', color: '#667eea', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>
          {editing ? 'Fechar' : existing ? 'Editar' : 'Atribuir'}
        </button>
      </div>

      {/* Form completo */}
      {editing && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(102,126,234,0.1)', background: '#f8faff', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Requisição */}
          <div>
            <label style={lbl}>Tipo de Requisição</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <button type="button" onClick={() => setF({ requisicaoId: '', requisicaoCodigo: '', requisicaoNome: '' })}
                style={{ padding: '3px 10px', borderRadius: 20, border: '1.5px solid #e2e8f0', background: !form.requisicaoId ? '#f1f5f9' : 'white', color: !form.requisicaoId ? '#64748b' : '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Nenhuma
              </button>
              {requisitions.map(r => (
                <button key={r.id} type="button" onClick={() => setF({ requisicaoId: r.id, requisicaoCodigo: r.codigo, requisicaoNome: r.nome, bvPct: r.defaults?.bvPct?.toString() || form.bvPct })}
                  style={{ padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${r.cor || '#667eea'}`, background: form.requisicaoId === r.id ? (r.cor || '#667eea') : 'white', color: form.requisicaoId === r.id ? 'white' : (r.cor || '#667eea'), fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {r.codigo}
                </button>
              ))}
              {reqSel && <span style={{ fontSize: 11, color: '#667', alignSelf: 'center' }}>{reqSel.nome}</span>}
            </div>
          </div>

          {/* Nome + Descrição */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Tarefa *</label><input value={form.name} onChange={e => setF({ name: e.target.value })} style={inp} placeholder="Nome da tarefa" /></div>
            <div><label style={lbl}>Instrução / Descrição</label><input value={form.descricao} onChange={e => setF({ descricao: e.target.value })} style={inp} placeholder="Detalhes..." /></div>
          </div>

          {/* Cargo + Pessoa + Prazo + Prioridade */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px 120px', gap: 8 }}>
            <div>
              <label style={lbl}>Cargo</label>
              <select value={form.cargoId} onChange={e => { const c = agencyRoles.find(r => r.id === e.target.value); setF({ cargoId: e.target.value, cargoNome: c?.name || '', pessoaId: '', pessoaNome: '' }); }} style={inp}>
                <option value="">Cargo...</option>
                {agencyRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Pessoa *</label>
              <select value={form.pessoaId} onChange={e => { const p = agencyUsers.find(u => u.id === e.target.value); setF({ pessoaId: e.target.value, pessoaNome: p?.name || '' }); }} style={inp}>
                <option value="">Pessoa...</option>
                {filteredUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Prazo</label><input type="date" lang="pt-BR" value={form.prazo} onChange={e => setF({ prazo: e.target.value })} style={inp} /></div>
            <div>
              <label style={lbl}>Prioridade</label>
              <select value={form.prioridade} onChange={e => setF({ prioridade: e.target.value })} style={inp}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>

          {/* Campos dinâmicos da requisição */}
          {reqSel && campos.length > 0 && (
            <div style={{ borderTop: `2px solid ${reqSel.cor || '#667eea'}33`, paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: reqSel.cor || '#667eea', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                Requisição {reqSel.codigo} — {reqSel.nome}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                {campos.includes('periodo')       && <div><label style={lbl}>Período (dias)</label><input type="number" min="0" value={form.periodo} onChange={e => setF({ periodo: e.target.value })} style={inp} /></div>}
                {campos.includes('quantidade')    && <div><label style={lbl}>Quantidade</label><input type="number" min="0" value={form.quantidade} onChange={e => setF({ quantidade: e.target.value })} style={inp} /></div>}
                {campos.includes('custoUnitario') && <div><label style={lbl}>Custo Unit. (R$)</label><input type="number" min="0" value={form.custoUnitario} onChange={e => setF({ custoUnitario: e.target.value })} style={inp} /></div>}
                {campos.includes('bv')            && <div><label style={lbl}>BV %</label><input type="number" min="0" max="100" value={form.bvPct} onChange={e => setF({ bvPct: e.target.value })} style={inp} /></div>}
                {campos.includes('credito')       && <div><label style={lbl}>Crédito (R$)</label><input type="number" min="0" value={form.credito} onChange={e => setF({ credito: e.target.value })} style={inp} /></div>}
                {campos.includes('custoUnitario') && campos.includes('periodo') && campos.includes('quantidade') && (() => {
                  const total = (parseFloat(form.periodo)||0)*(parseFloat(form.quantidade)||0)*(parseFloat(form.custoUnitario)||0);
                  return total > 0 ? (
                    <div style={{ background: '#f0fff4', border: '1px solid #86efac', borderRadius: 6, padding: '7px 10px' }}>
                      <label style={{ ...lbl, color: '#166534' }}>Custo Total</label>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>R$ {total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                    </div>
                  ) : null;
                })()}
              </div>
              {campos.includes('observacao') && (
                <div style={{ marginTop: 8 }}><label style={lbl}>Observação</label><input value={form.observacao} onChange={e => setF({ observacao: e.target.value })} style={inp} placeholder="Observação..." /></div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(false)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
            <button onClick={saveLinkedTask} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjetoScreen({ projectId, onBack, userData }) {
  const [project, setProject] = useState(null);
  const [parentProject, setParentProject] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [searchParams] = useSearchParams();
  const [taskFilterUser, setTaskFilterUser] = useState(searchParams.get('user') || '');
  const [selectedTask, setSelectedTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [savingTask, setSavingTask] = useState(false);

  // Sessão de planejamento
  const [modoEdicao, setModoEdicao] = useState(false);
  const [agencyUsers, setAgencyUsers] = useState([]);
  const [agencyRoles, setAgencyRoles] = useState([]);
  const [savingSession, setSavingSession] = useState(false);
  // taskForms: { [questionId]: { open, tarefa, cargoId, cargoNome, pessoaId, pessoaNome, valor } }
  const [taskForms, setTaskForms] = useState({});
  // tarefas geradas nesta sessão: [{ questionId, questionText, tarefa, cargoId, cargoNome, pessoaId, pessoaNome, valor }]
  const [newTasks, setNewTasks] = useState([]);
  // nova tarefa do zero
  const [showNovaTask, setShowNovaTask] = useState(false);
  const [novaTask, setNovaTask] = useState({ tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' });

  const canPlan = userData?.permissions?.briefing?.planning !== false;
  const canEdit = userData?.permissions?.briefing?.edit !== false;
  const [requisitions, setRequisitions] = useState([]);
  // Collapse das cascatas de tarefas no Paper (key = questionId ou questionKey)
  const [collapsedTasks, setCollapsedTasks] = useState({});
  const toggleCollapse = (key) => setCollapsedTasks(prev => ({ ...prev, [key]: !prev[key] }));
  // Cronograma
  const [savingCronograma, setSavingCronograma] = useState(false);

  // Modo editar briefing (filho)
  const [modoEditarBriefing, setModoEditarBriefing] = useState(false);
  const [editedAnswers, setEditedAnswers] = useState({});
  const [allQuestions, setAllQuestions] = useState([]);
  const [extraQuestions, setExtraQuestions] = useState([]);
  const [showAddPergunta, setShowAddPergunta] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Briefing Geral — editar e sessão de planejamento
  const [modoEditarGeral, setModoEditarGeral] = useState(false);
  const [editedAnswersGeral, setEditedAnswersGeral] = useState({});
  const [extraQuestionsGeral, setExtraQuestionsGeral] = useState([]);
  const [showAddPerguntaGeral, setShowAddPerguntaGeral] = useState(false);
  const [savingEditGeral, setSavingEditGeral] = useState(false);
  const [modoPlanejarGeral, setModoPlanejarGeral] = useState(false);
  const [taskFormsGeral, setTaskFormsGeral] = useState({});
  const [newTasksGeral, setNewTasksGeral] = useState([]);
  const [showNovaTaskGeral, setShowNovaTaskGeral] = useState(false);
  const [novaTaskGeral, setNovaTaskGeral] = useState({ tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' });
  const [savingSessionGeral, setSavingSessionGeral] = useState(false);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl) setActiveTab(tabFromUrl);
  }, []);

  useEffect(() => {
    if (!projectId) return;

    let unsubMae = null;

    // onSnapshot cuida de manter o project atualizado em tempo real
    const unsub = onSnapshot(doc(db, 'budgets', projectId), async (snap) => {
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() };
      setProject(data);

      // Se for filho, inicia listener no budget mãe (uma vez só)
      if (data.parentBudgetId && !unsubMae) {
        unsubMae = onSnapshot(doc(db, 'budgets', data.parentBudgetId), (maeSnap) => {
          if (maeSnap.exists()) {
            setParentProject({ id: maeSnap.id, ...maeSnap.data() });
          }
        });
      }

      setLoading(false);
    });

    // Carrega perguntas e usuários uma vez (não precisam de tempo real)
    loadExtras();

    return () => {
      unsub();
      if (unsubMae) unsubMae();
    };
  }, [projectId]);

  const loadExtras = async () => {
    try {
      // Carregar usuários da agência para a sessão de planejamento
      const [usersSnap, utSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'userTypes')),
      ]);
      const agenciaTypeIds = utSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.systemRole === 'workspace' || t.systemRole === 'admin')
        .map(t => t.id);
      const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const agency = allUsers.filter(u => agenciaTypeIds.includes(u.userTypeId) && u.active !== false);
      setAgencyUsers(agency);
      const roles = [...new Map(agency.filter(u => u.roleId).map(u => [u.roleId, { id: u.roleId, name: u.roleName }])).values()];
      setAgencyRoles(roles);

      // Banco completo de perguntas para o modo editar
      const allQSnap = await getDocs(collection(db, 'questions'));
      setAllQuestions(allQSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));

      const reqSnap = await getDocs(collection(db, 'requisitions'));
      setRequisitions(reqSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.ativo !== false).sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '')));

      // Busca perguntas do fluxo (eventTypeId vem do snapshot depois, tentamos pegar do doc direto)
      const docSnap = await getDoc(doc(db, 'budgets', projectId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.eventTypeId) {
          const flowSnap = await getDocs(query(collection(db, 'eventFlows'), where('eventTypeId', '==', data.eventTypeId)));
          if (!flowSnap.empty) {
            const flow = flowSnap.docs[0].data();
            const flowLinkedTasks = flow.linkedTasks || {};
            const qIds = (flow.items || []).filter(i => i.itemType === 'question').map(i => i.itemId);
            if (qIds.length > 0) {
              const [allQSnap, allTasksSnap] = await Promise.all([
                getDocs(collection(db, 'questions')),
                getDocs(collection(db, 'tasks')),
              ]);
              const allTasksData = allTasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
              const qData = allQSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(q => qIds.includes(q.id))
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(q => ({
                  ...q,
                  linkedTasks: (flowLinkedTasks[q.id] || [])
                    .map(tid => allTasksData.find(t => t.id === tid))
                    .filter(Boolean),
                }));
              setQuestions(qData);
            }
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar extras:', err);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDateShort = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const isFilho = !!project?.parentBudgetId;

  const toggleTaskForm = (qId) => {
    setTaskForms(prev => ({
      ...prev,
      [qId]: prev[qId]?.open
        ? { ...prev[qId], open: false }
        : {
            open: true, tarefa: '', descricao: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '',
            prazo: '', prioridade: 'normal',
            requisicaoId: '', requisicaoCodigo: '', requisicaoNome: '',
            periodo: '', quantidade: '', custoUnitario: '',
            fornecedor1: '', fornecedor1Valor: '', fornecedor1Status: '',
            fornecedor2: '', fornecedor2Valor: '', fornecedor2Status: '',
            fornecedor3: '', fornecedor3Valor: '', fornecedor3Status: '',
            justificativa: '', bvPct: '', credito: '', observacao: '',
          }
    }));
  };

  const updateTaskForm = (qId, field, value) => {
    setTaskForms(prev => ({ ...prev, [qId]: { ...prev[qId], [field]: value } }));
    if (field === 'cargoId') {
      const cargo = agencyRoles.find(r => r.id === value);
      setTaskForms(prev => ({ ...prev, [qId]: { ...prev[qId], cargoId: value, cargoNome: cargo?.name || '', pessoaId: '', pessoaNome: '' } }));
    }
    if (field === 'pessoaId') {
      const pessoa = agencyUsers.find(u => u.id === value);
      setTaskForms(prev => ({ ...prev, [qId]: { ...prev[qId], pessoaId: value, pessoaNome: pessoa?.name || '' } }));
    }
  };

  const gerarTarefa = (q, display) => {
    const form = taskForms[q.id];
    if (!form?.tarefa) { alert('Descreva a tarefa'); return; }
    if (!form?.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    setNewTasks(prev => [...prev, {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: q.id, questionText: q.text, briefingAnswer: display,
      name: form.tarefa, descricao: form.descricao || '',
      cargoId: form.cargoId, cargoNome: form.cargoNome,
      assignedTo: form.pessoaId, assignedToName: form.pessoaNome,
      prazo: form.prazo || '', prioridade: form.prioridade || 'normal',
      requisicaoId: form.requisicaoId || '', requisicaoCodigo: form.requisicaoCodigo || '', requisicaoNome: form.requisicaoNome || '',
      periodo: form.periodo || '', quantidade: form.quantidade || '', custoUnitario: form.custoUnitario || '',
      fornecedor1: form.fornecedor1 || '', fornecedor1Valor: form.fornecedor1Valor || '', fornecedor1Status: form.fornecedor1Status || '',
      fornecedor2: form.fornecedor2 || '', fornecedor2Valor: form.fornecedor2Valor || '', fornecedor2Status: form.fornecedor2Status || '',
      fornecedor3: form.fornecedor3 || '', fornecedor3Valor: form.fornecedor3Valor || '', fornecedor3Status: form.fornecedor3Status || '',
      fornecedor2: form.fornecedor2 || '', fornecedor2Valor: form.fornecedor2Valor || '',
      fornecedor3: form.fornecedor3 || '', fornecedor3Valor: form.fornecedor3Valor || '',
      justificativa: form.justificativa || '', bvPct: form.bvPct || '',
      credito: form.credito || '', observacao: form.observacao || '',
      status: 'backlog', createdAt: new Date(),
    }]);
    setTaskForms(prev => ({ ...prev, [q.id]: { ...prev[q.id], open: false } }));
  };

  const gerarNovaTask = () => {
    if (!novaTask.tarefa) { alert('Descreva a tarefa'); return; }
    if (!novaTask.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    setNewTasks(prev => [...prev, {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: null, questionText: null, briefingAnswer: null,
      name: novaTask.tarefa,
      cargoId: novaTask.cargoId, cargoNome: novaTask.cargoNome,
      assignedTo: novaTask.pessoaId, assignedToName: novaTask.pessoaNome,
      valor: novaTask.valor || '',
      status: 'backlog', createdAt: new Date(),
    }]);
    setNovaTask({ tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' });
    setShowNovaTask(false);
  };

  const removerNewTask = (taskId) => setNewTasks(prev => prev.filter(t => t.taskId !== taskId));

  // Mini-form com seletor de requisição e campos dinâmicos
  const renderMiniForm = (qId, onCriar) => {
    const form = taskForms[qId] || {};
    const setF = (updater) => setTaskForms(prev => ({ ...prev, [qId]: { ...prev[qId], ...(typeof updater === 'function' ? updater(prev[qId] || {}) : updater) } }));
    const reqSel = requisitions.find(r => r.id === form.requisicaoId);
    const campos = reqSel?.campos || [];
    const filteredUsers = form.cargoId ? agencyUsers.filter(u => u.roleId === form.cargoId) : agencyUsers;
    const inp = { padding: '7px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 12, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box' };
    const lbl = { fontSize: 11, fontWeight: 600, color: '#5a6a7a', display: 'block', marginBottom: 3 };

    return (
      <div style={{ marginTop: 10, padding: 16, background: '#f8faff', borderRadius: 10, border: '1px solid #e0e8ff', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Seletor de requisição */}
        <div>
          <label style={lbl}>Tipo de Requisição</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {requisitions.length === 0 && <span style={{ fontSize: 12, color: '#aaa' }}>Nenhuma requisição cadastrada no admin.</span>}
            {requisitions.map(r => (
              <button key={r.id} onClick={() => setF({ requisicaoId: r.id, requisicaoCodigo: r.codigo, requisicaoNome: r.nome, bvPct: r.defaults?.bvPct?.toString() || '' })}
                style={{ padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${r.cor || '#667eea'}`, background: form.requisicaoId === r.id ? (r.cor || '#667eea') : 'white', color: form.requisicaoId === r.id ? 'white' : (r.cor || '#667eea'), fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
                {r.codigo}
              </button>
            ))}
            {form.requisicaoId && <span style={{ fontSize: 11, color: '#667', alignSelf: 'center' }}>{reqSel?.nome}</span>}
          </div>
        </div>

        {/* Tarefa + Descrição */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Tarefa *</label><input placeholder="Nome da tarefa..." value={form.tarefa || ''} onChange={e => setF({ tarefa: e.target.value })} style={inp} /></div>
          <div><label style={lbl}>Instrução / Descrição</label><input placeholder="Detalhes para quem executa..." value={form.descricao || ''} onChange={e => setF({ descricao: e.target.value })} style={inp} /></div>
        </div>

        {/* Cargo + Pessoa + Prazo + Prioridade */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px 120px', gap: 10 }}>
          <div>
            <label style={lbl}>Cargo</label>
            <select value={form.cargoId || ''} onChange={e => { const c = agencyRoles.find(r => r.id === e.target.value); setF({ cargoId: e.target.value, cargoNome: c?.name || '', pessoaId: '', pessoaNome: '' }); }} style={inp}>
              <option value="">Cargo...</option>
              {agencyRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Pessoa *</label>
            <select value={form.pessoaId || ''} onChange={e => { const p = agencyUsers.find(u => u.id === e.target.value); setF({ pessoaId: e.target.value, pessoaNome: p?.name || '' }); }} style={inp}>
              <option value="">Pessoa...</option>
              {filteredUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Prazo</label><input type="date" value={form.prazo || ''} onChange={e => setF({ prazo: e.target.value })} style={inp} /></div>
          <div>
            <label style={lbl}>Prioridade</label>
            <select value={form.prioridade || 'normal'} onChange={e => setF({ prioridade: e.target.value })} style={inp}>
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
        </div>

        {/* Campos dinâmicos da requisição */}
        {reqSel && (
          <div style={{ borderTop: `2px solid ${reqSel.cor || '#667eea'}33`, paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: reqSel.cor || '#667eea', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
              Requisição {reqSel.codigo} — {reqSel.nome}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {campos.includes('periodo')       && <div><label style={lbl}>Período (dias)</label><input type="number" min="0" value={form.periodo || ''} onChange={e => setF({ periodo: e.target.value })} style={inp} /></div>}
              {campos.includes('quantidade')    && <div><label style={lbl}>Quantidade</label><input type="number" min="0" value={form.quantidade || ''} onChange={e => setF({ quantidade: e.target.value })} style={inp} /></div>}
              {campos.includes('custoUnitario') && <div><label style={lbl}>Custo Unitário (R$)</label><input type="number" min="0" value={form.custoUnitario || ''} onChange={e => setF({ custoUnitario: e.target.value })} style={inp} /></div>}
              {campos.includes('bv')            && <div><label style={lbl}>BV % (padrão: {reqSel.defaults?.bvPct || 0}%)</label><input type="number" min="0" max="100" value={form.bvPct || ''} onChange={e => setF({ bvPct: e.target.value })} style={inp} /></div>}
              {campos.includes('credito')       && <div><label style={lbl}>Crédito (R$)</label><input type="number" min="0" value={form.credito || ''} onChange={e => setF({ credito: e.target.value })} style={inp} /></div>}
              {/* Custo Total calculado */}
              {campos.includes('custoUnitario') && campos.includes('periodo') && campos.includes('quantidade') && (() => {
                const total = (parseFloat(form.periodo) || 0) * (parseFloat(form.quantidade) || 0) * (parseFloat(form.custoUnitario) || 0);
                return (
                  <div style={{ background: '#f0fff4', border: '1px solid #86efac', borderRadius: 6, padding: '7px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label style={{ ...lbl, color: '#166534' }}>Custo Total</label>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>
                      {total > 0 ? `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>
                );
              })()}
            </div>

            {campos.includes('fornecedores') && (
              <div style={{ marginTop: 10 }}>
                <label style={{ ...lbl, marginBottom: 8 }}>3 Fornecedores para Orçar</label>
                {[1,2,3].map(n => {
                  const status = form[`fornecedor${n}Status`] || '';
                  const statusColor = status === 'recebido' ? '#16a34a' : status === 'aguardando' ? '#d97706' : '#94a3b8';
                  return (
                    <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 160px', gap: 8, marginBottom: 6 }}>
                      <input placeholder={`Fornecedor ${n} — nome`} value={form[`fornecedor${n}`] || ''} onChange={e => setF({ [`fornecedor${n}`]: e.target.value })} style={inp} />
                      <input type="number" placeholder="Valor est." value={form[`fornecedor${n}Valor`] || ''} onChange={e => setF({ [`fornecedor${n}Valor`]: e.target.value })} style={inp} />
                      <select value={status} onChange={e => setF({ [`fornecedor${n}Status`]: e.target.value })}
                        style={{ ...inp, color: statusColor, fontWeight: status ? 600 : 400, border: `1px solid ${statusColor}66` }}>
                        <option value="">Status...</option>
                        <option value="aguardando">Aguardando orçamento</option>
                        <option value="recebido">Orçamento recebido</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {campos.includes('justificativa') && <div style={{ marginTop: 6 }}><label style={lbl}>Justificativa</label><input placeholder="Ex: Fornecedor parceiro..." value={form.justificativa || ''} onChange={e => setF({ justificativa: e.target.value })} style={inp} /></div>}
            {campos.includes('observacao')    && <div style={{ marginTop: 6 }}><label style={lbl}>Observação</label><input placeholder="Observações adicionais..." value={form.observacao || ''} onChange={e => setF({ observacao: e.target.value })} style={inp} /></div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => toggleTaskForm(qId)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
          <button onClick={onCriar} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>Criar Tarefa</button>
        </div>
      </div>
    );
  };

  const abrirEdicao = () => {
    setEditedAnswers({ ...(project.answers || {}) });
    setExtraQuestions([]);
    setModoEditarBriefing(true);
  };

  const salvarEdicao = async () => {
    setSavingEdit(true);
    try {
      const timelineEntry = {
        action: 'briefing_edited',
        description: `Briefing editado por ${userData?.name || 'Usuário'}`,
        userId: userData?.id,
        userName: userData?.name,
        timestamp: new Date()
      };

      // Salva no filho
      await updateDoc(doc(db, 'budgets', projectId), {
        answers: editedAnswers,
        updatedAt: new Date(),
        timeline: [...(project.timeline || []), timelineEntry]
      });

      // Se for filho, sincroniza com o budget mãe
      if (project.parentBudgetId) {
        const maeSnap = await getDoc(doc(db, 'budgets', project.parentBudgetId));
        if (maeSnap.exists()) {
          const maeData = maeSnap.data();
          const maeAnswers = { ...(maeData.answers || {}) };
          const feiraIdx = project.feiraIndex ?? 0;

          // Para cada resposta editada no filho
          Object.entries(editedAnswers).forEach(([qId, val]) => {
            const originalMae = maeAnswers[qId];
            const isFeiraAnswer = (v) =>
              v && typeof v === 'object' && !Array.isArray(v) &&
              Object.keys(v).every(k => !isNaN(k));

            if (isFeiraAnswer(originalMae)) {
              // Resposta por feira — atualiza só o índice desta feira na mãe
              maeAnswers[qId] = { ...(originalMae || {}), [feiraIdx]: val[feiraIdx] ?? val };
            } else if (typeof val !== 'object' || Array.isArray(val)) {
              // Resposta simples (isShared) — atualiza direto na mãe
              maeAnswers[qId] = val;
            }
          });

          // Perguntas extras adicionadas — só registra na mãe se for isShared
          // (perguntas individuais ficam só no filho)

          await updateDoc(doc(db, 'budgets', project.parentBudgetId), {
            answers: maeAnswers,
            updatedAt: new Date(),
            timeline: [...(maeData.timeline || []), timelineEntry]
          });
        }
      }

      setModoEditarBriefing(false);
      setExtraQuestions([]);
      alert('Briefing atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar edição:', err);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSavingEdit(false);
    }
  };

  const salvarSessao = async () => {
    if (newTasks.length === 0) { alert('Nenhuma tarefa criada nesta sessão'); return; }
    setSavingSession(true);
    try {
      const existingTasks = project.tasks || [];
      // Tarefas salvas pelo Planner ficam bloqueadas até o avanço de etapa
      const tasksToSave = newTasks.map(t => ({ ...t, status: 'blocked' }));
      const updatedTasks = [...existingTasks, ...tasksToSave];
      await updateDoc(doc(db, 'budgets', projectId), {
        tasks: updatedTasks,
        updatedAt: new Date(),
        timeline: [...(project.timeline || []), {
          action: 'planning_session',
          description: `Sessão de planejamento: ${newTasks.length} tarefa(s) criada(s) por ${userData?.name || 'Planner'} (aguardando liberação)`,
          userId: userData?.id,
          userName: userData?.name,
          timestamp: new Date()
        }]
      });
      setProject(prev => ({ ...prev, tasks: updatedTasks }));
      setNewTasks([]);
      setModoEdicao(false);
      setTaskForms({});
      alert(`✓ Sessão salva! ${newTasks.length} tarefa(s) criada(s) — aguardando liberação na próxima etapa.`);
    } catch (err) {
      console.error('Erro ao salvar sessão:', err);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSavingSession(false);
    }
  };

  // ── BRIEFING GERAL — Editar ──
  const abrirEdicaoGeral = () => {
    setEditedAnswersGeral({ ...(parentProject?.answers || {}) });
    setExtraQuestionsGeral([]);
    setModoEditarGeral(true);
  };

  const salvarEdicaoGeral = async () => {
    if (!parentProject) return;
    setSavingEditGeral(true);
    try {
      const timelineEntry = {
        action: 'briefing_geral_edited',
        description: `Briefing Geral editado por ${userData?.name || 'Usuário'}`,
        userId: userData?.id, userName: userData?.name, timestamp: new Date()
      };
      await updateDoc(doc(db, 'budgets', parentProject.id), {
        answers: editedAnswersGeral,
        updatedAt: new Date(),
        timeline: [...(parentProject.timeline || []), timelineEntry]
      });
      setModoEditarGeral(false);
      setExtraQuestionsGeral([]);
      alert('Briefing Geral atualizado!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar.');
    } finally {
      setSavingEditGeral(false);
    }
  };

  // ── BRIEFING GERAL — Sessão de Planejamento ──
  const toggleTaskFormGeral = (qId) => {
    setTaskFormsGeral(prev => ({
      ...prev,
      [qId]: prev[qId]?.open
        ? { ...prev[qId], open: false }
        : { open: true, tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' }
    }));
  };

  const updateTaskFormGeral = (qId, field, value) => {
    setTaskFormsGeral(prev => ({ ...prev, [qId]: { ...prev[qId], [field]: value } }));
    if (field === 'cargoId') {
      const cargo = agencyRoles.find(r => r.id === value);
      setTaskFormsGeral(prev => ({ ...prev, [qId]: { ...prev[qId], cargoId: value, cargoNome: cargo?.name || '', pessoaId: '', pessoaNome: '' } }));
    }
    if (field === 'pessoaId') {
      const pessoa = agencyUsers.find(u => u.id === value);
      setTaskFormsGeral(prev => ({ ...prev, [qId]: { ...prev[qId], pessoaId: value, pessoaNome: pessoa?.name || '' } }));
    }
  };

  const gerarTarefaGeral = (qId, qLabel, display, isFeiraAnswer) => {
    const form = taskFormsGeral[qId];
    if (!form?.tarefa) { alert('Descreva a tarefa'); return; }
    if (!form?.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    setNewTasksGeral(prev => [...prev, {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: qId,
      questionLabel: qLabel,
      briefingAnswer: display,
      isFeiraAnswer, // true = cria N tarefas (uma por filho), false = cria 1 na mãe
      name: form.tarefa,
      cargoId: form.cargoId,
      cargoNome: form.cargoNome,
      assignedTo: form.pessoaId,
      assignedToName: form.pessoaNome,
      valor: form.valor || '',
      status: 'backlog',
      createdAt: new Date(),
    }]);
    setTaskFormsGeral(prev => ({ ...prev, [qId]: { open: false, tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' } }));
  };

  const gerarNovaTaskGeral = () => {
    if (!novaTaskGeral.tarefa) { alert('Descreva a tarefa'); return; }
    if (!novaTaskGeral.pessoaId) { alert('Selecione a pessoa responsável'); return; }
    setNewTasksGeral(prev => [...prev, {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: null, questionLabel: null, briefingAnswer: null,
      isFeiraAnswer: false,
      name: novaTaskGeral.tarefa,
      cargoId: novaTaskGeral.cargoId, cargoNome: novaTaskGeral.cargoNome,
      assignedTo: novaTaskGeral.pessoaId, assignedToName: novaTaskGeral.pessoaNome,
      valor: novaTaskGeral.valor || '',
      status: 'backlog', createdAt: new Date(),
    }]);
    setNovaTaskGeral({ tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '' });
    setShowNovaTaskGeral(false);
  };

  const salvarSessaoGeral = async () => {
    if (newTasksGeral.length === 0) { alert('Nenhuma tarefa criada nesta sessão'); return; }
    if (!parentProject) return;
    setSavingSessionGeral(true);
    try {
      const timelineEntry = {
        action: 'planning_session_geral',
        description: `Sessão de planejamento geral: ${newTasksGeral.length} tarefa(s) por ${userData?.name || 'Planner'}`,
        userId: userData?.id, userName: userData?.name, timestamp: new Date()
      };

      // Buscar todos os filhos do budget mãe
      const filhosSnap = await getDocs(query(collection(db, 'budgets'), where('parentBudgetId', '==', parentProject.id)));
      const filhos = filhosSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.feiraIndex || 0) - (b.feiraIndex || 0));

      // Tarefas para a mãe (isShared ou sem vínculo)
      const tasksParaMae = newTasksGeral.filter(t => !t.isFeiraAnswer);
      // Tarefas por feira
      const tasksParaFeiras = newTasksGeral.filter(t => t.isFeiraAnswer);

      // Salva na mãe
      if (tasksParaMae.length > 0) {
        await updateDoc(doc(db, 'budgets', parentProject.id), {
          tasks: [...(parentProject.tasks || []), ...tasksParaMae],
          updatedAt: new Date(),
          timeline: [...(parentProject.timeline || []), timelineEntry]
        });
      }

      // Para cada filho, cria uma cópia das tarefas por feira
      for (const filho of filhos) {
        const tasksParaFilho = tasksParaFeiras.map(t => ({
          ...t,
          taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          feiraIndex: filho.feiraIndex,
          feiraNome: filho.feiraData?.nome || `Feira ${(filho.feiraIndex || 0) + 1}`,
          name: `${t.name} — ${filho.feiraData?.nome || `Feira ${(filho.feiraIndex || 0) + 1}`}`,
        }));
        if (tasksParaFilho.length > 0) {
          await updateDoc(doc(db, 'budgets', filho.id), {
            tasks: [...(filho.tasks || []), ...tasksParaFilho],
            updatedAt: new Date(),
            timeline: [...(filho.timeline || []), timelineEntry]
          });
        }
      }

      const totalCriadas = tasksParaMae.length + (tasksParaFeiras.length * filhos.length);
      setNewTasksGeral([]);
      setModoPlanejarGeral(false);
      setTaskFormsGeral({});
      alert(`✓ Sessão salva! ${totalCriadas} tarefa(s) criada(s) em ${filhos.length} feira(s).`);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar sessão.');
    } finally {
      setSavingSessionGeral(false);
    }
  };

  const getProjectName = () => {
    // Filho: usar nome da feira específica
    if (isFilho && project?.feiraData?.nome) return project.feiraData.nome;
    // Mãe: usar nome da feira mãe de fixed-events
    const feiras = project?.answers?.['fixed-events'];
    if (Array.isArray(feiras) && feiras.length > 0) {
      const mae = feiras.find(f => f.isMae) || feiras[0];
      if (mae?.nome) return mae.nome;
    }
    if (project?.answers?.['GApo1hcglkgdpAQGuSnn']) return project.answers['GApo1hcglkgdpAQGuSnn'];
    return project?.eventTypeName || 'Evento';
  };

  const getAnswerDisplay = (question, answer, feiras = []) => {
    if (answer === null || answer === undefined || answer === '') return 'Não respondido';

    const safeString = (val) => {
      if (val === null || val === undefined) return '—';
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    };

    // ── Resposta por feira: objeto com chaves numéricas {"0":"val","1":"val"} ──
    const isFeiraAnswer = (val) =>
      val && typeof val === 'object' && !Array.isArray(val) &&
      Object.keys(val).every(k => !isNaN(k));

    if (isFeiraAnswer(answer)) {
      return Object.entries(answer).map(([idx, val]) => {
        const feira = feiras[parseInt(idx)];
        const feiraLabel = feira?.nome ? feira.nome : `Feira ${parseInt(idx) + 1}`;
        return `${feiraLabel}: ${safeString(val)}`;
      }).join(' | ');
    }

    switch (question?.type) {
      case 'text': case 'number': case 'currency': return safeString(answer);
      case 'date':
        if (typeof answer === 'string') return answer;
        if (answer?.toDate) return answer.toDate().toLocaleDateString('pt-BR');
        return safeString(answer);
      case 'yesno': return answer === 'yes' || answer === 'Sim' ? 'Sim' : 'Não';
      case 'multiple': {
        const opt = question.options?.find(o => o.id === answer || o.label === answer);
        return opt?.label || safeString(answer);
      }
      case 'multiselect':
        if (!Array.isArray(answer)) return safeString(answer);
        return answer.join(', ');
      case 'fixed-events':
        if (!Array.isArray(answer)) return safeString(answer);
        return answer.map((f, i) => `Feira ${i + 1}: ${f.nome || ''}${f.local ? ` — ${f.local}` : ''}`).join(' | ');
      case 'fixed-envio':
        if (typeof answer === 'object') return answer.userName || '—';
        return safeString(answer);
      default: return safeString(answer);
    }
  };

  // Retorna array de { key, label, value } para renderizar linha a linha
  const getAnswerLines = (question, answer, feiras = []) => {
    if (answer === null || answer === undefined || answer === '') return [{ key: 'single', value: 'Não respondido' }];

    // Array genérico — checklist extraído do feiraIndex já vem como array
    if (Array.isArray(answer)) {
      if (answer.length === 0) return [{ key: 'single', value: 'Nenhum item' }];
      return answer.map((item, i) => ({ key: `item-${i}`, label: null, value: String(item) }));
    }

    // Checklist salvo como string separada por vírgula (dados legados)
    if (question?.type === 'checklist' && typeof answer === 'string') {
      const items = answer.split(',').map(s => s.trim()).filter(Boolean);
      if (items.length <= 1) return [{ key: 'single', label: null, value: answer }];
      return items.map((item, i) => ({ key: `item-${i}`, label: null, value: item }));
    }

    // Resposta por feira (objeto com índices numéricos)
    const isFeiraAnswer = (val) =>
      val && typeof val === 'object' && !Array.isArray(val) &&
      Object.keys(val).every(k => !isNaN(k));

    if (isFeiraAnswer(answer)) {
      return Object.entries(answer).map(([idx, v]) => {
        const feira = feiras[parseInt(idx)];
        const value = Array.isArray(v) ? v.join(', ') : String(v);
        return { key: `feira-${idx}`, label: feira?.nome || `Feira ${parseInt(idx) + 1}`, value };
      });
    }

    // Default — linha única
    return [{ key: 'single', label: null, value: getAnswerDisplay(question, answer, feiras) }];
  };

  // Renderiza respostas de subperguntas recursivamente no Paper
  const renderSubAnswers = (subQuestions, answers, parentId, parentOptions = [], depth = 0, modoEdicaoAtivo = false, newTasksArr = [], setNewTasksArr = null, taskFormsObj = {}, setTaskFormsObj = null) => {
    if (!subQuestions || subQuestions.length === 0) return null;
    const parentVal = answers[parentId];

    const activeSubs = subQuestions.filter(sub => {
      if (!sub.trigger) return true;
      if (sub.trigger === 'yes') return parentVal === 'Sim';
      if (sub.trigger === 'no') return parentVal === 'Não';
      if (parentOptions && parentOptions.length > 0) {
        const triggerOpt = parentOptions.find(o => o.id === sub.trigger);
        const triggerLabel = triggerOpt?.label;
        if (triggerLabel) {
          if (Array.isArray(parentVal)) return parentVal.includes(triggerLabel);
          return parentVal === triggerLabel;
        }
      }
      if (Array.isArray(parentVal)) return parentVal.includes(sub.trigger);
      return parentVal === sub.trigger;
    });

    if (activeSubs.length === 0) return null;

    const depthColors = ['#667eea', '#00bcd4', '#ff9800', '#4caf50', '#e91e63'];
    const color = depthColors[Math.min(depth, depthColors.length - 1)];

    return activeSubs.map(sub => {
      const subVal = answers[sub.id];
      const displayVal = subVal === null || subVal === undefined || subVal === ''
        ? 'Não respondido'
        : Array.isArray(subVal) ? subVal.join(', ') : String(subVal);
      const subFormKey = `sub__${sub.id}`;
      const subForm = taskFormsObj[subFormKey] || {};
      const subTasksCriadas = newTasksArr.filter(t => t.questionId === subFormKey);

      return (
        <div key={sub.id} style={{ marginTop: 8, marginLeft: 16, paddingLeft: 12, borderLeft: `2px solid ${color}33` }}>
          <div style={{ fontSize: 12, color: '#8a9bb0', marginBottom: 2 }}>{sub.text}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#1a2e40', fontWeight: 400, flex: 1 }}>{displayVal}</div>
            {/* Botão Gerar Tarefa para subpergunta no modo Sessão de Planejamento */}
            {modoEdicaoAtivo && setTaskFormsObj && (
              <button onClick={() => setTaskFormsObj(prev => ({
                ...prev,
                [subFormKey]: prev[subFormKey]?.open ? { ...prev[subFormKey], open: false } : { open: true, tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', prazo: '', prioridade: 'normal', requisicaoId: '', requisicaoCodigo: '', requisicaoNome: '', periodo: '', quantidade: '', custoUnitario: '', justificativa: '', bvPct: '', credito: '', observacao: '' }
              }))} style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 5, fontSize: 10, border: '1px solid rgba(0,229,196,0.4)', background: subForm.open ? 'rgba(0,229,196,0.1)' : 'none', color: '#00E5C4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' }}>
                Gerar Tarefa
              </button>
            )}
          </div>
          {/* Mini-form de tarefa para subpergunta */}
          {modoEdicaoAtivo && subForm.open && setNewTasksArr && renderMiniForm(subFormKey, () => {
            const f = taskFormsObj[subFormKey];
            if (!f?.tarefa) { alert('Descreva a tarefa'); return; }
            if (!f?.pessoaId) { alert('Selecione a pessoa responsável'); return; }
            setNewTasksArr(prev => [...prev, {
              taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              questionId: subFormKey, questionText: sub.text, briefingAnswer: displayVal,
              name: f.tarefa, descricao: f.descricao || '',
              cargoId: f.cargoId, cargoNome: f.cargoNome,
              assignedTo: f.pessoaId, assignedToName: f.pessoaNome,
              prazo: f.prazo || '', prioridade: f.prioridade || 'normal',
              requisicaoId: f.requisicaoId || '', requisicaoCodigo: f.requisicaoCodigo || '', requisicaoNome: f.requisicaoNome || '',
              periodo: f.periodo || '', quantidade: f.quantidade || '', custoUnitario: f.custoUnitario || '',
              status: 'backlog', createdAt: new Date(),
            }]);
            setTaskFormsObj(prev => ({ ...prev, [subFormKey]: { open: false } }));
          })}
          {subTasksCriadas.map(t => (
            <div key={t.taskId} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'rgba(102,126,234,0.06)', borderRadius: 6, border: '1px solid rgba(102,126,234,0.2)' }}>
              <span style={{ fontSize: 10, color: '#667eea' }}>✓</span>
              {t.requisicaoCodigo && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 8, background: '#667eea22', color: '#667eea' }}>{t.requisicaoCodigo}</span>}
              <span style={{ fontSize: 11, flex: 1, color: '#2c3e50' }}>{t.name}</span>
              <span style={{ fontSize: 10, color: '#1976d2' }}>{t.assignedToName}</span>
              {modoEdicaoAtivo && setNewTasksArr && <button onClick={() => setNewTasksArr(prev => prev.filter(x => x.taskId !== t.taskId))} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 11 }}>✕</button>}
            </div>
          ))}
          {/* Recursivo */}
          {sub.subQuestions && sub.subQuestions.length > 0 && renderSubAnswers(sub.subQuestions, answers, sub.id, sub.options || [], depth + 1, modoEdicaoAtivo, newTasksArr, setNewTasksArr, taskFormsObj, setTaskFormsObj)}
        </div>
      );
    });
  };

  // Renderiza inputs de edição para subperguntas recursivamente no modo Editar Briefing
  const renderSubEditInputs = (subQuestions, answers, setAnswers, parentId, parentOptions = [], depth = 0) => {
    if (!subQuestions || subQuestions.length === 0) return null;
    const parentVal = answers[parentId];

    const activeSubs = subQuestions.filter(sub => {
      if (!sub.trigger) return true;
      if (sub.trigger === 'yes') return parentVal === 'Sim';
      if (sub.trigger === 'no') return parentVal === 'Não';
      if (parentOptions && parentOptions.length > 0) {
        const triggerOpt = parentOptions.find(o => o.id === sub.trigger);
        const triggerLabel = triggerOpt?.label;
        if (triggerLabel) {
          if (Array.isArray(parentVal)) return parentVal.includes(triggerLabel);
          return parentVal === triggerLabel;
        }
      }
      if (Array.isArray(parentVal)) return parentVal.includes(sub.trigger);
      return parentVal === sub.trigger;
    });

    if (activeSubs.length === 0) return null;

    const depthColors = ['#667eea', '#00bcd4', '#ff9800', '#4caf50', '#e91e63'];
    const color = depthColors[Math.min(depth, depthColors.length - 1)];
    const inp = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif', background: '#fff', color: '#1a2e40', outline: 'none' };

    return activeSubs.map(sub => {
      const cur = answers[sub.id];
      const setCur = (val) => setAnswers(p => ({ ...p, [sub.id]: val }));

      const renderInput = () => {
        if (sub.type === 'yesno') return (
          <div style={{ display: 'flex', gap: 8 }}>
            {['Sim', 'Não'].map(opt => (
              <button key={opt} onClick={() => setCur(opt)} style={{
                ...inp, width: 'auto', padding: '6px 16px', cursor: 'pointer',
                background: cur === opt ? '#e8f5e9' : '#fff',
                borderColor: cur === opt ? '#66BB6A' : '#dde',
                color: cur === opt ? '#27ae60' : '#666'
              }}>{opt}</button>
            ))}
          </div>
        );
        if (sub.type === 'textarea') return (
          <textarea value={cur || ''} onChange={e => setCur(e.target.value)}
            rows={3} style={{ ...inp, resize: 'vertical' }} />
        );
        if (sub.type === 'multiple') return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(sub.options || []).map(opt => (
              <button key={opt.id} onClick={() => setCur(opt.label)} style={{
                ...inp, textAlign: 'left', cursor: 'pointer',
                background: cur === opt.label ? '#e8f5e9' : '#fff',
                borderColor: cur === opt.label ? '#66BB6A' : '#dde'
              }}>{opt.label}</button>
            ))}
          </div>
        );
        if (sub.type === 'multiselect') return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(sub.options || []).map(opt => {
              const arr = Array.isArray(cur) ? cur : [];
              const sel = arr.includes(opt.label);
              return (
                <button key={opt.id} onClick={() => setCur(sel ? arr.filter(v => v !== opt.label) : [...arr, opt.label])} style={{
                  ...inp, textAlign: 'left', cursor: 'pointer',
                  background: sel ? '#e8f5e9' : '#fff',
                  borderColor: sel ? '#66BB6A' : '#dde'
                }}>{opt.label}</button>
              );
            })}
          </div>
        );
        if (sub.type === 'checklist') {
          const items = Array.isArray(cur) ? cur : [];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input type="text" value={item}
                    onChange={e => { const u = [...items]; u[i] = e.target.value; setCur(u); }}
                    style={{ ...inp, flex: 1 }} placeholder={`Item ${i + 1}...`} />
                  <button onClick={() => setCur(items.filter((_, idx) => idx !== i))}
                    style={{ ...inp, width: 32, padding: 0, color: '#e74c3c', borderColor: 'rgba(231,76,60,0.3)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setCur([...items, ''])}
                style={{ ...inp, cursor: 'pointer', color: '#667eea', borderColor: 'rgba(102,126,234,0.4)', borderStyle: 'dashed', textAlign: 'left' }}>
                + Adicionar item
              </button>
            </div>
          );
        }
        // text, number, date, currency — fallback
        return (
          <input
            type={sub.type === 'currency' || sub.type === 'number' ? 'number' : sub.type === 'date' ? 'date' : 'text'}
            value={cur || ''}
            onChange={e => setCur(e.target.value)}
            style={inp} />
        );
      };

      return (
        <div key={sub.id} style={{ marginTop: 10, marginLeft: 16, paddingLeft: 12, borderLeft: `2px solid ${color}55` }}>
          <div style={{ fontSize: 12, color: '#8a9bb0', marginBottom: 5, fontWeight: 500 }}>
            {sub.text}{sub.required && <span style={{ color: '#e74c3c', marginLeft: 3 }}>*</span>}
          </div>
          {renderInput()}
          {/* Recursivo */}
          {sub.subQuestions && sub.subQuestions.length > 0 && renderSubEditInputs(
            sub.subQuestions, answers, setAnswers, sub.id, sub.options || [], depth + 1
          )}
        </div>
      );
    });
  };

  const STATUS_MAP = {
    analyzing: { label: 'EM ANÁLISE', color: '#FFA726', bg: 'rgba(255,167,38,0.15)' },
    approved:  { label: 'APROVADO',   color: '#66BB6A', bg: 'rgba(102,187,106,0.15)' },
    rejected:  { label: 'REJEITADO',  color: '#EF5350', bg: 'rgba(239,83,80,0.15)' },
  };
  const statusInfo = STATUS_MAP[project?.status] || { label: 'AGUARDANDO', color: '#78909C', bg: 'rgba(120,144,156,0.15)' };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={{ color: '#7BAFD4', fontSize: 14, marginTop: 12 }}>Carregando projeto...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={styles.loadingWrap}>
        <p style={{ color: '#7BAFD4' }}>Projeto não encontrado.</p>
        <button onClick={onBack} style={styles.backBtnAlt}>Voltar</button>
      </div>
    );
  }

  const tabs = isFilho ? [
    { id: 'info',           label: 'Paper Feira' },
    { id: 'briefing-geral', label: 'Paper Geral' },
    { id: 'cronograma',     label: 'Cronograma' },
    { id: 'tasks',          label: `Tarefas${project.tasks?.filter(t => t.status !== 'blocked').length ? ` (${project.tasks.filter(t => t.status !== 'blocked').length})` : ''}` },
    { id: 'timeline',       label: 'Histórico' },
  ] : [
    { id: 'info',     label: 'Visão Geral' },
    { id: 'briefing', label: 'Briefing' },
    { id: 'tasks',    label: `Tarefas${project.tasks?.length ? ` (${project.tasks.length})` : ''}` },
    { id: 'timeline', label: 'Histórico' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D1B2A; }
        .ps-wrap { min-height: 100vh; background: #f0f2f5; font-family: 'Outfit', sans-serif; color: #1a2e40; }

        /* TOPBAR */
        .ps-topbar {
          background: #0D1B2A; padding: 0 36px;
          display: flex; align-items: center; justify-content: space-between;
          height: 60px; border-bottom: 1px solid rgba(0,180,255,0.1);
          position: sticky; top: 0; z-index: 10;
        }
        .ps-back {
          display: flex; align-items: center; gap: 8px; cursor: pointer;
          color: #7BAFD4; font-size: 13px; font-weight: 300; background: none; border: none;
          font-family: 'Outfit', sans-serif; transition: color 0.15s; padding: 0;
        }
        .ps-back:hover { color: #00E5C4; }
        .ps-back-arrow { font-size: 18px; line-height: 1; }
        .ps-topbar-center {
          display: flex; align-items: center; gap: 12px;
        }
        .ps-topbar-name { font-size: 15px; font-weight: 400; color: #E8F4FF; }
        .ps-topbar-num { font-size: 12px; color: rgba(200,225,245,0.75); }
        .ps-status-pill {
          padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 500; letter-spacing: 1px;
        }
        .ps-btn-print {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(0,229,196,0.3);
          background: none; color: #00E5C4; font-family: 'Outfit', sans-serif;
          font-size: 12px; cursor: pointer; transition: all 0.15s; letter-spacing: 0.5px;
        }
        .ps-btn-print:hover { background: rgba(0,229,196,0.1); }

        /* HERO */
        .ps-hero {
          background: #0D1B2A; padding: 28px 36px 0;
          border-bottom: 1px solid rgba(0,180,255,0.08);
        }
        .ps-hero-title { font-size: 26px; font-weight: 300; color: #E8F4FF; margin-bottom: 6px; }
        .ps-hero-meta { display: flex; gap: 20px; font-size: 13px; color: #7BAFD4; margin-bottom: 12px; flex-wrap: wrap; }
        .ps-hero-meta span { display: flex; align-items: center; gap: 5px; }

        /* HERO INFOS DA FEIRA */
        .ps-hero-infos {
          display: flex; gap: 28px; flex-wrap: wrap;
          padding: 14px 0 18px; border-top: 1px solid rgba(0,180,255,0.08);
          margin-bottom: 0;
        }
        .ps-hero-info-item { display: flex; flex-direction: column; gap: 2px; }
        .ps-hero-info-label { font-size: 9px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(123,175,212,0.5); }
        .ps-hero-info-value { font-size: 13px; color: #E8F4FF; font-weight: 400; }

        /* TIMELINE VERTICAL */
        .ps-timeline-side {
          width: 180px; flex-shrink: 0;
          padding: 4px 0 0 8px;
          align-self: flex-start;
          position: sticky; top: 76px;
        }
        .ps-timeline-side-title {
          font-size: 9px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;
          color: #00E5C4; margin-bottom: 16px;
        }
        .ps-timeline-step {
          display: flex; align-items: flex-start; gap: 10px;
          position: relative; padding-bottom: 16px;
        }
        .ps-timeline-step:last-child { padding-bottom: 0; }
        .ps-timeline-step:not(:last-child)::before {
          content: ''; position: absolute; left: 7px; top: 16px;
          width: 1px; bottom: 0; background: #e2e8f0;
        }
        .ps-timeline-dot {
          width: 15px; height: 15px; border-radius: 50%; flex-shrink: 0;
          border: 2px solid #e2e8f0; background: white; z-index: 1;
          margin-top: 1px;
        }
        .ps-timeline-dot.done { background: #10b981; border-color: #10b981; }
        .ps-timeline-dot.active { background: #00E5C4; border-color: #00E5C4; box-shadow: 0 0 0 3px rgba(0,229,196,0.2); }
        .ps-timeline-step-label { font-size: 12px; color: #94a3b8; line-height: 1.4; }
        .ps-timeline-step-label.active { color: #00E5C4; font-weight: 600; }
        .ps-timeline-step-label.done { color: #10b981; }

        /* TABS */
        .ps-tabs { display: flex; gap: 4px; }
        .ps-tab {
          padding: 10px 20px; border: none; background: none; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 300;
          color: rgba(123,175,212,0.6); border-bottom: 2px solid transparent;
          transition: all 0.15s; letter-spacing: 0.3px;
        }
        .ps-tab:hover { color: #7BAFD4; }
        .ps-tab.active { color: #00E5C4; border-bottom-color: #00E5C4; font-weight: 400; }

        /* BODY */
        .ps-body { padding: 28px 36px; max-width: 900px; }

        /* CARDS */
        .ps-card {
          background: white; border-radius: 12px; padding: 24px;
          margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          border: 1px solid #e8eaed;
        }
        .ps-card-title {
          font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase;
          color: #00E5C4; margin-bottom: 16px; padding-bottom: 12px;
          border-bottom: 1px solid #f0f2f5;
        }

        /* INFO GRID */
        .ps-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ps-info-item { display: flex; flex-direction: column; gap: 3px; }
        .ps-info-label { font-size: 11px; color: #8a9bb0; letter-spacing: 0.5px; text-transform: uppercase; }
        .ps-info-value { font-size: 14px; color: #1a2e40; font-weight: 400; }
        .ps-info-item.full { grid-column: 1 / -1; }

        /* HIGHLIGHT */
        .ps-highlight {
          background: rgba(0,229,196,0.06); border: 1px solid rgba(0,229,196,0.2);
          border-radius: 8px; padding: 12px 16px;
        }
        .ps-highlight .ps-info-value { color: #00875A; font-weight: 500; font-size: 16px; }

        /* BRIEFING */
        .ps-answer-item {
          padding: 14px 0; border-bottom: 1px solid #f0f2f5;
          display: flex; flex-direction: column; gap: 6px;
        }
        .ps-answer-item:last-child { border-bottom: none; }
        .ps-question-text { font-size: 13px; color: #8a9bb0; font-weight: 400; }
        .ps-answer-text { font-size: 14px; color: #1a2e40; font-weight: 400; line-height: 1.5; }

        /* TASKS */
        .ps-task-item {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 14px 0; border-bottom: 1px solid #f0f2f5;
        }
        .ps-task-item:last-child { border-bottom: none; }
        .ps-task-num {
          width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
          background: #f0f2f5; display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 500; color: #8a9bb0;
        }
        .ps-task-body { flex: 1; }
        .ps-task-name { font-size: 14px; font-weight: 500; color: #1a2e40; margin-bottom: 3px; }
        .ps-task-desc { font-size: 12px; color: #8a9bb0; margin-bottom: 6px; }
        .ps-task-footer { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .ps-task-status {
          font-size: 10px; font-weight: 600; letter-spacing: 1px; padding: 3px 9px; border-radius: 20px;
        }
        .ps-task-status.pending     { background: rgba(255,167,38,0.12); color: #FFA726; }
        .ps-task-status.in_progress { background: rgba(55,138,221,0.12); color: #378ADD; }
        .ps-task-status.completed   { background: rgba(102,187,106,0.12); color: #66BB6A; }
        .ps-task-assigned { font-size: 12px; color: #8a9bb0; }

        /* TIMELINE */
        .ps-timeline { display: flex; flex-direction: column; gap: 0; }
        .ps-tl-item { display: flex; gap: 16px; padding: 14px 0; position: relative; }
        .ps-tl-item:not(:last-child)::after {
          content: ''; position: absolute; left: 15px; top: 42px; bottom: 0;
          width: 1px; background: #e8eaed;
        }
        .ps-tl-dot {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          background: rgba(0,229,196,0.1); border: 2px solid rgba(0,229,196,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; color: #00E5C4; z-index: 1;
        }
        .ps-tl-body { flex: 1; padding-top: 4px; }
        .ps-tl-desc { font-size: 14px; color: #1a2e40; font-weight: 400; margin-bottom: 3px; }
        .ps-tl-meta { font-size: 12px; color: #8a9bb0; }

        /* EMPTY */
        .ps-empty { padding: 32px; text-align: center; color: #8a9bb0; font-size: 14px; }

        /* STATUS CARDS */
        .ps-status-card {
          border-radius: 10px; padding: 16px 20px; margin-bottom: 20px;
          border: 1px solid;
        }
        .ps-status-card.approved { background: rgba(102,187,106,0.06); border-color: rgba(102,187,106,0.2); }
        .ps-status-card.rejected { background: rgba(239,83,80,0.06); border-color: rgba(239,83,80,0.2); }
        .ps-status-card-title { font-size: 11px; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px; }
        .ps-status-card.approved .ps-status-card-title { color: #66BB6A; }
        .ps-status-card.rejected .ps-status-card-title { color: #EF5350; }

        /* PRINT */
        @media print {
          .ps-topbar, .ps-tabs, .ps-btn-print { display: none !important; }
          .ps-hero { background: white !important; padding: 20px !important; }
          .ps-hero-title, .ps-hero-meta { color: #1a2e40 !important; }
          .ps-body { padding: 0 !important; }
          .ps-card { box-shadow: none !important; border: 1px solid #e0e0e0 !important; break-inside: avoid; }
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          .ps-topbar { padding: 0 16px; }
          .ps-hero { padding: 20px 16px 0; }
          .ps-body { padding: 16px; }
          .ps-info-grid { grid-template-columns: 1fr; }
          .ps-topbar-center { display: none; }
        }
      `}</style>

      <div className="ps-wrap">

        {/* TOPBAR */}
        <div className="ps-topbar">
          <button className="ps-back" onClick={onBack}>
            <span className="ps-back-arrow">←</span>
            Voltar
          </button>
          <div className="ps-topbar-center">
            <span className="ps-topbar-name">{getProjectName()}</span>
            <span className="ps-topbar-num">{project.jobCode || `#${project.budgetNumber || ''}`}</span>
            <span className="ps-status-pill" style={{ background: statusInfo.bg, color: statusInfo.color }}>
              {statusInfo.label}
            </span>
          </div>
          <button className="ps-btn-print" onClick={handlePrint}>
            Imprimir / PDF
          </button>
        </div>

        {/* HERO */}
        <div className="ps-hero">
          <h1 className="ps-hero-title">
            {getProjectName()}
            {project.companyName && <span style={{ fontSize: 16, fontWeight: 300, color: '#7BAFD4', marginLeft: 14 }}>{project.companyName}</span>}
          </h1>
          <div className="ps-hero-meta">
            <span>{project.jobCode || `Projeto #${project.budgetNumber || ''}`}</span>
            <span>{project.eventTypeName}</span>
            {isFilho && project.feiraData?.local && <span>{project.feiraData.local}</span>}
            {isFilho && project.feiraData?.dataInicio && (
              <span>{project.feiraData.dataInicio}{project.feiraData.dataFim ? ` até ${project.feiraData.dataFim}` : ''}</span>
            )}
            <span>Criado em {formatDateShort(project.createdAt)}</span>
          </div>

          {/* Infos da feira no hero — só para filhos */}
          {isFilho && project.feiraData && (
            <div className="ps-hero-infos">
              {project.clientName && (
                <div className="ps-hero-info-item">
                  <span className="ps-hero-info-label">Responsável</span>
                  <span className="ps-hero-info-value">{project.clientName}</span>
                </div>
              )}
              {project.assignedToName && (
                <div className="ps-hero-info-item">
                  <span className="ps-hero-info-label">Atendimento</span>
                  <span className="ps-hero-info-value">{project.assignedToName}</span>
                </div>
              )}
              {project.plannerUserName && (
                <div className="ps-hero-info-item">
                  <span className="ps-hero-info-label">Planner</span>
                  <span className="ps-hero-info-value">{project.plannerUserName}</span>
                </div>
              )}
              {project.feiraData.isMae && (
                <div className="ps-hero-info-item">
                  <span className="ps-hero-info-label" style={{ color: '#00E5C4' }}>Feira Mãe</span>
                  <span className="ps-hero-info-value" style={{ color: '#00E5C4' }}>Sim</span>
                </div>
              )}
            </div>
          )}

          {/* TABS */}
          <div className="ps-tabs">
            {tabs.map(t => (
              <button key={t.id} className={`ps-tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* BODY */}
        <div className="ps-body">

          {/* ── VISÃO GERAL / BRIEFING DA FEIRA ── */}
          {activeTab === 'info' && (
            <>
              {/* FILHO: Briefing completo desta feira */}
              {isFilho ? (
                <>
                  {/* Layout: briefing à esquerda, timeline à direita */}
                  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

                    {/* Coluna esquerda — briefing */}
                    <div style={{ flex: 1, minWidth: 0 }}>

                  {/* Respostas filtradas por feiraIndex */}
                  <div className="ps-card">
                    <div className="ps-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Respostas do Briefing</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {/* Botão Editar Briefing */}
                        {canEdit && !modoEdicao && !modoEditarBriefing && (
                          <button onClick={abrirEdicao} style={{
                            padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,167,38,0.4)',
                            background: 'none', color: '#FFA726', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                          }}>Editar Briefing</button>
                        )}
                        {modoEditarBriefing && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={salvarEdicao} disabled={savingEdit} style={{
                              padding: '5px 14px', borderRadius: 6, border: 'none',
                              background: 'linear-gradient(135deg,#FFA726,#f57c00)',
                              color: 'white', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600
                            }}>{savingEdit ? 'Salvando...' : 'Salvar Edição'}</button>
                            <button onClick={() => setModoEditarBriefing(false)} style={{
                              padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd',
                              background: 'none', color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                            }}>Cancelar</button>
                          </div>
                        )}
                        {/* Botão Sessão de Planejamento */}
                        {canPlan && !modoEdicao && !modoEditarBriefing && (
                          <button onClick={() => setModoEdicao(true)} style={{
                            padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(0,229,196,0.4)',
                            background: 'none', color: '#00E5C4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                          }}>Sessão de Planejamento</button>
                        )}
                        {modoEdicao && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <span style={{ fontSize: 11, color: '#FFA726', alignSelf: 'center' }}>
                              {newTasks.length} tarefa(s) criada(s)
                            </span>
                            <button onClick={salvarSessao} disabled={savingSession} style={{
                              padding: '5px 14px', borderRadius: 6, border: 'none',
                              background: newTasks.length > 0 ? 'linear-gradient(135deg,#00E5C4,#0080FF)' : '#ccc',
                              color: 'white', fontSize: 11, cursor: newTasks.length > 0 ? 'pointer' : 'not-allowed',
                              fontFamily: 'Outfit, sans-serif', fontWeight: 600
                            }}>{savingSession ? 'Salvando...' : 'Salvar Sessão'}</button>
                            <button onClick={() => { setModoEdicao(false); setNewTasks([]); setTaskForms({}); }} style={{
                              padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd',
                              background: 'none', color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                            }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const allQsToShow = [...questions, ...extraQuestions];
                      const feiraIdx = project.feiraIndex ?? 0;
                      const isFeiraAnswer = (val) =>
                        val && typeof val === 'object' && !Array.isArray(val) &&
                        Object.keys(val).every(k => !isNaN(k));

                      const inputStyle = {
                        width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif',
                        background: '#fff', color: '#1a2e40', outline: 'none'
                      };

                      const renderEditInput = (q) => {
                        const cur = editedAnswers[q.id];
                        if (q.type === 'yesno') return (
                          <div style={{ display: 'flex', gap: 8 }}>
                            {['Sim', 'Não'].map(opt => (
                              <button key={opt} onClick={() => setEditedAnswers(p => ({ ...p, [q.id]: opt }))} style={{
                                ...inputStyle, width: 'auto', padding: '6px 16px', cursor: 'pointer',
                                background: cur === opt ? '#e8f5e9' : '#fff',
                                borderColor: cur === opt ? '#66BB6A' : '#dde', color: cur === opt ? '#27ae60' : '#666'
                              }}>{opt}</button>
                            ))}
                          </div>
                        );
                        if (q.type === 'textarea') return (
                          <textarea value={isFeiraAnswer(cur) ? (cur[feiraIdx] || '') : (cur || '')}
                            onChange={e => {
                              if (isFeiraAnswer(cur)) setEditedAnswers(p => ({ ...p, [q.id]: { ...cur, [feiraIdx]: e.target.value } }));
                              else setEditedAnswers(p => ({ ...p, [q.id]: e.target.value }));
                            }}
                            rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                        );
                        if (q.type === 'multiple') return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(q.options || []).map(opt => {
                              const val = isFeiraAnswer(cur) ? (cur[feiraIdx] || '') : (cur || '');
                              return (
                                <button key={opt.id} onClick={() => {
                                  if (isFeiraAnswer(cur)) setEditedAnswers(p => ({ ...p, [q.id]: { ...cur, [feiraIdx]: opt.label } }));
                                  else setEditedAnswers(p => ({ ...p, [q.id]: opt.label }));
                                }} style={{
                                  ...inputStyle, textAlign: 'left', cursor: 'pointer',
                                  background: val === opt.label ? '#e8f5e9' : '#fff',
                                  borderColor: val === opt.label ? '#66BB6A' : '#dde'
                                }}>{opt.label}</button>
                              );
                            })}
                          </div>
                        );
                        // text, number, date, currency, checklist
                        const val = isFeiraAnswer(cur) ? (cur[feiraIdx] || '') : (cur || '');
                        return (
                          <input type={q.type === 'currency' || q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text'}
                            value={Array.isArray(val) ? val.join(', ') : val}
                            onChange={e => {
                              if (isFeiraAnswer(cur)) setEditedAnswers(p => ({ ...p, [q.id]: { ...cur, [feiraIdx]: e.target.value } }));
                              else setEditedAnswers(p => ({ ...p, [q.id]: e.target.value }));
                            }}
                            style={inputStyle} />
                        );
                      };

                      if (allQsToShow.length === 0) return <div className="ps-empty">Nenhuma pergunta no fluxo</div>;

                      return allQsToShow.map(q => {
                        const raw = modoEditarBriefing ? editedAnswers[q.id] : project.answers?.[q.id];
                        const isFeiraAnswerVal = raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).every(k => !isNaN(k));
                        const rawForFeira = isFeiraAnswerVal ? (raw[feiraIdx] !== undefined ? raw[feiraIdx] : '') : raw;
                        const answerLines = !modoEditarBriefing ? getAnswerLines(q, rawForFeira, project.answers?.['fixed-events'] || []) : null;
                        const isMultiLine = answerLines && answerLines.length > 1;
                        const form = taskForms[q.id] || {};
                        const tasksCriadas = newTasks.filter(t => t.questionId === q.id);
                        const filteredUsers = form.cargoId ? agencyUsers.filter(u => u.roleId === form.cargoId) : agencyUsers;

                        return (
                          <div key={q.id} style={{ padding: '14px 0', borderBottom: '1px solid #f0f2f5' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                              <div style={{ flex: 1 }}>
                                <span className="ps-question-text">
                                  {q.text}
                                  {q.isShared && <span style={{ fontSize: 10, color: '#00E5C4', marginLeft: 6 }}>comum</span>}
                                  {extraQuestions.find(eq => eq.id === q.id) && <span style={{ fontSize: 10, color: '#FFA726', marginLeft: 6 }}>nova</span>}
                                </span>
                                {modoEditarBriefing ? (
                                  <div style={{ marginTop: 6 }}>{renderEditInput(q)}</div>
                                ) : (
                                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {answerLines.map(line => (
                                      <div key={line.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMultiLine ? '4px 8px' : 0, background: isMultiLine ? '#fafafa' : 'none', borderRadius: isMultiLine ? 6 : 0, border: isMultiLine ? '1px solid #f0f2f5' : 'none' }}>
                                        <span className="ps-answer-text">
                                          {line.label && <span style={{ color: '#8a9bb0', marginRight: 6, fontSize: 12, fontWeight: 500 }}>{line.label}:</span>}
                                          {line.value}
                                        </span>
                                        {modoEdicao && isMultiLine && (
                                          <button onClick={() => { const k = `${q.id}__${line.key}`; setTaskForms(prev => ({ ...prev, [k]: prev[k]?.open ? { ...prev[k], open: false } : { open: true, tarefa: '', cargoId: '', cargoNome: '', pessoaId: '', pessoaNome: '', valor: '', lineLabel: line.label, lineValue: line.value } })); }} style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 5, fontSize: 10, border: '1px solid rgba(0,229,196,0.4)', background: 'none', color: '#00E5C4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', marginLeft: 8 }}>
                                            Gerar Tarefa
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {modoEdicao && !modoEditarBriefing && !isMultiLine && (
                                <button onClick={() => toggleTaskForm(q.id)} style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 6, fontSize: 11, border: '1px solid rgba(0,229,196,0.4)', background: form.open ? 'rgba(0,229,196,0.1)' : 'none', color: '#00E5C4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' }}>Gerar Tarefa</button>
                              )}
                              {modoEditarBriefing && extraQuestions.find(eq => eq.id === q.id) && (
                                <button onClick={() => setExtraQuestions(prev => prev.filter(eq => eq.id !== q.id))} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>✕</button>
                              )}
                            </div>

                            {/* Subrespostas no Paper Feira */}
                            {!modoEditarBriefing && q.subQuestions && q.subQuestions.length > 0 && renderSubAnswers(
                              q.subQuestions, project.answers || {}, q.id, q.options || [],
                              0, modoEdicao, newTasks, setNewTasks, taskForms, setTaskForms
                            )}
                            {/* Edição de subrespostas no Paper Feira */}
                            {modoEditarBriefing && q.subQuestions && q.subQuestions.length > 0 && renderSubEditInputs(
                              q.subQuestions, editedAnswers, setEditedAnswers, q.id, q.options || []
                            )}
                            {modoEdicao && isMultiLine && answerLines.map(line => {
                              const k = `${q.id}__${line.key}`;
                              const lt = newTasks.filter(t => t.questionId === k);
                              const form = taskForms[k] || {};
                              if (!form.open && lt.length === 0) return null;
                              return (
                                <div key={k}>
                                  {form.open && (
                                    <div style={{ marginTop: 6 }}>
                                      <span style={{ fontSize: 11, color: '#667eea', fontWeight: 600, display: 'block', marginBottom: 4 }}>{line.label ? `${line.label}: ` : ''}{line.value}</span>
                                      {renderMiniForm(k, () => {
                                        const lf = taskForms[k] || {};
                                        if (!lf.tarefa) { alert('Descreva a tarefa'); return; }
                                        if (!lf.pessoaId) { alert('Selecione a pessoa'); return; }
                                        setNewTasks(prev => [...prev, {
                                          taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                          questionId: k,
                                          questionText: `${q.text}${line.label ? ` — ${line.label}` : ''}`,
                                          briefingAnswer: line.value,
                                          name: lf.tarefa, descricao: lf.descricao || '',
                                          cargoId: lf.cargoId, cargoNome: lf.cargoNome,
                                          assignedTo: lf.pessoaId, assignedToName: lf.pessoaNome,
                                          requisicaoId: lf.requisicaoId || '', requisicaoCodigo: lf.requisicaoCodigo || '', requisicaoNome: lf.requisicaoNome || '',
                                          prioridade: lf.prioridade || 'normal', prazo: lf.prazo || '',
                                          periodo: lf.periodo || '', quantidade: lf.quantidade || '', custoUnitario: lf.custoUnitario || '',
                                          bvPct: lf.bvPct || '', credito: lf.credito || '',
                                          status: 'backlog', createdAt: new Date(),
                                        }]);
                                        setTaskForms(prev => ({ ...prev, [k]: { open: false } }));
                                      })}
                                    </div>
                                  )}
                                  {lt.map(t => (
                                    <div key={t.taskId} style={{ margin: '4px 0 4px 8px', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'rgba(102,126,234,0.06)', borderRadius: 6, border: '1px solid rgba(102,126,234,0.2)' }}>
                                      <span style={{ fontSize: 10, color: '#667eea' }}>✓</span>
                                      {t.requisicaoCodigo && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: '#667eea22', color: '#667eea' }}>{t.requisicaoCodigo}</span>}
                                      <span style={{ fontSize: 11, flex: 1, color: '#2c3e50' }}>{t.name}</span>
                                      <span style={{ fontSize: 10, color: '#1976d2' }}>{t.assignedToName}</span>
                                      <button onClick={() => setNewTasks(prev => prev.filter(x => x.taskId !== t.taskId))} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 11 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}

                            {/* ── TAREFAS VINCULADAS DO FLUXO — visíveis na Sessão de Planejamento ── */}
                            {modoEdicao && (q.linkedTasks || []).length > 0 && (() => {
                              const jobTasks = project.tasks || [];
                              const isChecklist = q.type === 'checklist';
                              // Para checklist: pega os itens respondidos
                              const checklistItems = isChecklist && Array.isArray(rawForFeira) ? rawForFeira.filter(Boolean) : null;

                              return (
                                <div style={{ margin: '8px 0', padding: '10px 12px', background: 'rgba(102,126,234,0.04)', borderRadius: 8, border: '1px solid rgba(102,126,234,0.12)' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' }}>
                                    Tarefas programadas para esta pergunta
                                  </div>
                                  {(q.linkedTasks || []).map(lt => {
                                    if (isChecklist && checklistItems && checklistItems.length > 0) {
                                      // Uma instância da tarefa por item do checklist
                                      return checklistItems.map((item, idx) => {
                                        const itemKey = `${lt.id}__item-${idx}`;
                                        const existing = jobTasks.find(t => t.templateId === itemKey);
                                        const ltWithItem = { ...lt, id: itemKey, name: `${lt.name} — ${item}`, checklistItem: item };
                                        return (
                                          <div key={itemKey}>
                                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, marginLeft: 2 }}>
                                              <span style={{ color: '#667eea', fontWeight: 600 }}>→</span> {item}
                                            </div>
                                            <LinkedTaskCard
                                              lt={ltWithItem} existing={existing}
                                              agencyUsers={agencyUsers} agencyRoles={agencyRoles}
                                              requisitions={requisitions}
                                              projectId={projectId} questionId={q.id}
                                              userData={userData} project={project}
                                            />
                                          </div>
                                        );
                                      });
                                    }
                                    // Pergunta normal — uma tarefa para a pergunta toda
                                    const existing = jobTasks.find(t => t.templateId === lt.id);
                                    return (
                                      <LinkedTaskCard
                                        key={lt.id}
                                        lt={lt} existing={existing}
                                        agencyUsers={agencyUsers} agencyRoles={agencyRoles}
                                        requisitions={requisitions}
                                        projectId={projectId} questionId={q.id}
                                        userData={userData} project={project}
                                      />
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            {/* Mini-form tarefa resposta única */}
                            {modoEdicao && !isMultiLine && form.open && renderMiniForm(q.id, () => gerarTarefa(q, answerLines?.[0]?.value || ''))}

                            {tasksCriadas.map(t => (
                              <div key={t.taskId} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(102,126,234,0.06)', borderRadius: 6, border: '1px solid rgba(102,126,234,0.2)' }}>
                                <span style={{ fontSize: 11, color: '#667eea' }}>✓</span>
                                {t.requisicaoCodigo && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#667eea22', color: '#667eea' }}>{t.requisicaoCodigo}</span>}
                                <span style={{ fontSize: 12, flex: 1, color: '#2c3e50' }}>{t.name}</span>
                                <span style={{ fontSize: 11, color: '#7b1fa2' }}>{t.cargoNome}</span>
                                <span style={{ fontSize: 11, color: '#1976d2' }}>{t.assignedToName}</span>
                                {t.prazo && <span style={{ fontSize: 10, color: '#e67e22' }}>{t.prazo}</span>}
                                {modoEdicao && <button onClick={() => removerNewTask(t.taskId)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 13 }}>✕</button>}
                              </div>
                            ))}

                            {/* ── CASCATA PAPER FEIRA: tarefas salvas vinculadas a esta pergunta ── */}
                            {!modoEdicao && !modoEditarBriefing && (() => {
                              const tarefasSalvas = (project.tasks || []).filter(t => t.questionId === q.id || t.questionId === `${q.id}__${answerLines?.[0]?.key}`);
                              if (tarefasSalvas.length === 0) return null;
                              const collapsed = collapsedTasks[q.id];
                              return (
                                <div style={{ marginTop: 8 }}>
                                  <button onClick={() => toggleCollapse(q.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Outfit, sans-serif' }}>
                                    <span style={{ fontSize: 10, color: '#667eea', fontWeight: 700, letterSpacing: 0.5 }}>
                                      {collapsed ? '▶' : '▼'} PLANNER / PRÉ-PRODUÇÃO ({tarefasSalvas.length})
                                    </span>
                                  </button>
                                  {!collapsed && tarefasSalvas.map(t => {
                                    const reqColor = requisitions.find(r => r.codigo === t.requisicaoCodigo)?.cor || '#667eea';
                                    const temFornecedor = t.fornecedor1 || t.fornecedor2 || t.fornecedor3;
                                    const fornecedorEscolhido = [1,2,3].map(n => ({ nome: t[`fornecedor${n}`], valor: t[`fornecedor${n}Valor`], status: t[`fornecedor${n}Status`] })).find(f => f.status === 'recebido' && f.nome);
                                    return (
                                      <div key={t.taskId} style={{ marginTop: 6, marginLeft: 16, borderLeft: `2px solid ${reqColor}44`, paddingLeft: 12 }}>
                                        {/* Linha Planner */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: reqColor, padding: '1px 7px', borderRadius: 10 }}>{t.requisicaoCodigo || 'T'}</span>
                                          <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{t.name}</span>
                                          {t.descricao && <span style={{ fontSize: 12, color: '#64748b' }}>— {t.descricao}</span>}
                                          <span style={{ fontSize: 11, color: '#7b1fa2' }}>{t.cargoNome}</span>
                                          {t.assignedToName && <span style={{ fontSize: 11, color: '#1976d2' }}>{t.assignedToName}</span>}
                                          {t.prazo && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>{t.prazo}</span>}
                                          {(t.periodo || t.quantidade || t.custoUnitario) && (
                                            <span style={{ fontSize: 11, color: '#475569' }}>
                                              {[t.periodo && `${t.periodo}d`, t.quantidade && `${t.quantidade}x`, t.custoUnitario && `R$${parseFloat(t.custoUnitario).toLocaleString('pt-BR',{minimumFractionDigits:2})}`].filter(Boolean).join(' · ')}
                                            </span>
                                          )}
                                          {canPlan && (
                                            <button onClick={async e => {
                                              e.stopPropagation();
                                              if (!window.confirm(`Excluir tarefa "${t.name}"?`)) return;
                                              const updated = (project.tasks || []).filter(task => task.taskId !== t.taskId);
                                              try { await updateDoc(doc(db, 'budgets', projectId), { tasks: updated, updatedAt: new Date() }); }
                                              catch(err) { console.error(err); }
                                            }} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 12, padding: '0 2px', marginLeft: 'auto' }}
                                              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                              onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>✕</button>
                                          )}
                                        </div>
                                        {/* Linha Pré-Produção (se tiver fornecedor ou status done) */}
                                        {(temFornecedor || t.status === 'done' || t.status === 'completed') && (
                                          <div style={{ marginTop: 4, marginLeft: 16, borderLeft: '2px solid #10b98144', paddingLeft: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                              {fornecedorEscolhido ? (
                                                <>
                                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>Fornecedor:</span>
                                                  <span style={{ fontSize: 12, color: '#1e293b' }}>{fornecedorEscolhido.nome}</span>
                                                  {fornecedorEscolhido.valor && <span style={{ fontSize: 11, color: '#475569' }}>R$ {parseFloat(fornecedorEscolhido.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}/dia</span>}
                                                  {t.periodo && fornecedorEscolhido.valor && (
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>
                                                      Total: R$ {(parseFloat(t.periodo||1)*parseFloat(t.quantidade||1)*parseFloat(fornecedorEscolhido.valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                                                    </span>
                                                  )}
                                                </>
                                              ) : temFornecedor ? (
                                                <span style={{ fontSize: 11, color: '#f59e0b' }}>Fornecedores em orçamento...</span>
                                              ) : null}
                                              {(t.status === 'done' || t.status === 'completed') && (
                                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#10b981', padding: '1px 8px', borderRadius: 10 }}>CONCLUÍDA</span>
                                              )}
                                              {t.justificativa && <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>{t.justificativa}</span>}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      });
                    })()}

                    {/* Adicionar pergunta (modo editar) */}
                    {modoEditarBriefing && (
                      <div style={{ marginTop: 16 }}>
                        {!showAddPergunta ? (
                          <button onClick={() => setShowAddPergunta(true)} style={{
                            width: '100%', padding: '10px', borderRadius: 8, border: '1.5px dashed #FFA726',
                            background: 'none', color: '#FFA726', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                          }}>+ Adicionar Pergunta</button>
                        ) : (
                          <div style={{ padding: 14, background: '#fffbf0', borderRadius: 8, border: '1px solid #ffe0a0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#FFA726' }}>ADICIONAR PERGUNTA DO BANCO</span>
                            <select onChange={e => {
                              const q = allQuestions.find(q => q.id === e.target.value);
                              if (q && !questions.find(eq => eq.id === q.id) && !extraQuestions.find(eq => eq.id === q.id)) {
                                setExtraQuestions(prev => [...prev, q]);
                              }
                              setShowAddPergunta(false);
                            }} defaultValue="" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #ffe0a0', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                              <option value="">Selecione uma pergunta...</option>
                              {allQuestions
                                .filter(q => !questions.find(eq => eq.id === q.id) && !extraQuestions.find(eq => eq.id === q.id))
                                .map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
                            </select>
                            <button onClick={() => setShowAddPergunta(false)} style={{ alignSelf: 'flex-end', padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nova tarefa do zero (sessão planejamento) */}
                    {modoEdicao && (
                      <div style={{ marginTop: 16 }}>
                        {!showNovaTask ? (
                          <button onClick={() => setShowNovaTask(true)} style={{
                            width: '100%', padding: '10px', borderRadius: 8, border: '1.5px dashed #667eea',
                            background: 'none', color: '#667eea', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif'
                          }}>+ Nova Tarefa (sem vínculo com pergunta)</button>
                        ) : (
                          <div style={{ padding: 14, background: '#f8faff', borderRadius: 8, border: '1px solid #e0e8ff', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#667eea' }}>NOVA TAREFA</span>
                            <input placeholder="Tarefa *" value={novaTask.tarefa} onChange={e => setNovaTask(p => ({ ...p, tarefa: e.target.value }))}
                              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif' }} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <select value={novaTask.cargoId} onChange={e => {
                                const cargo = agencyRoles.find(r => r.id === e.target.value);
                                setNovaTask(p => ({ ...p, cargoId: e.target.value, cargoNome: cargo?.name || '', pessoaId: '', pessoaNome: '' }));
                              }} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                                <option value="">Cargo...</option>
                                {agencyRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                              <select value={novaTask.pessoaId} onChange={e => {
                                const pessoa = agencyUsers.find(u => u.id === e.target.value);
                                setNovaTask(p => ({ ...p, pessoaId: e.target.value, pessoaNome: pessoa?.name || '' }));
                              }} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                                <option value="">Pessoa *</option>
                                {(novaTask.cargoId ? agencyUsers.filter(u => u.roleId === novaTask.cargoId) : agencyUsers).map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            </div>
                            <input placeholder="Valor estimado (opcional)" value={novaTask.valor} onChange={e => setNovaTask(p => ({ ...p, valor: e.target.value }))}
                              type="number" min="0"
                              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif' }} />
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button onClick={() => setShowNovaTask(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                              <button onClick={gerarNovaTask} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>Criar Tarefa</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tarefas do zero criadas nesta sessão */}
                    {newTasks.filter(t => !t.questionId).map(t => (
                      <div key={t.taskId} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(102,126,234,0.06)', borderRadius: 6, border: '1px solid rgba(102,126,234,0.2)' }}>
                        <span style={{ fontSize: 11, color: '#667eea' }}>✓</span>
                        <span style={{ fontSize: 12, flex: 1, color: '#2c3e50' }}>{t.name}</span>
                        <span style={{ fontSize: 11, color: '#7b1fa2' }}>{t.cargoNome}</span>
                        <span style={{ fontSize: 11, color: '#1976d2' }}>{t.assignedToName}</span>
                        {t.valor && <span style={{ fontSize: 11, color: '#27ae60' }}>R$ {t.valor}</span>}
                        {modoEdicao && <button onClick={() => removerNewTask(t.taskId)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 13 }}>✕</button>}
                      </div>
                    ))}
                    </div>{/* fim ps-card */}
                    </div>{/* fim coluna esquerda */}

                    {/* Coluna direita — Timeline do job */}
                    {(() => {
                      const STEPS = [
                        { id: 'briefing',             label: 'Briefing' },
                        { id: 'cronograma',           label: 'Cronograma' },
                        { id: 'kickoff',              label: 'Kick-off' },
                        { id: 'paper',                label: 'Paper' },
                        { id: 'planilha_inicial',     label: 'Planilha Inicial' },
                        { id: 'apresentacao_interna', label: 'Apres. Interna' },
                        { id: 'apresentacao_cliente', label: 'Apres. Cliente' },
                        { id: 'ajustes',              label: 'Ajustes' },
                        { id: 'aprovacao',            label: 'Aprovação' },
                        { id: 'finalizacoes',         label: 'Finalizações' },
                        { id: 'caderno_artes',        label: 'Caderno de Artes' },
                        { id: 'book_producao',        label: 'Book de Produção' },
                        { id: 'passadao_interno',     label: 'Passadão Interno' },
                        { id: 'producao',             label: 'Produção' },
                        { id: 'entrega_job',          label: 'Entrega do Job' },
                        { id: 'fechamento_financeiro',label: 'Fechamento Fin.' },
                        { id: 'reuniao_encerramento', label: 'Reunião Encerr.' },
                        { id: 'relatorio_cliente',    label: 'Relatório Cliente' },
                      ];
                      const currentStage = project.jobStage || 'briefing';
                      const currentIdx = STEPS.findIndex(s => s.id === currentStage);
                      const isLast = currentIdx === STEPS.length - 1;

                      const handleAvancarEtapa = async () => {
                        if (isLast) return;
                        const nextStage = STEPS[currentIdx + 1];
                        if (!window.confirm(`Avançar para "${nextStage.label}"?\n\nIsso vai liberar todas as tarefas bloqueadas para os responsáveis.`)) return;
                        try {
                          // Desbloqueia todas as tarefas com status 'blocked'
                          const updatedTasks = (project.tasks || []).map(t =>
                            t.status === 'blocked' ? { ...t, status: 'backlog', unlockedAt: new Date(), unlockedBy: userData?.name } : t
                          );
                          const blockedCount = (project.tasks || []).filter(t => t.status === 'blocked').length;
                          await updateDoc(doc(db, 'budgets', projectId), {
                            jobStage: nextStage.id,
                            tasks: updatedTasks,
                            updatedAt: new Date(),
                            timeline: [...(project.timeline || []), {
                              action: 'stage_advanced',
                              description: `Etapa avançada para "${nextStage.label}" por ${userData?.name || 'Usuário'}${blockedCount > 0 ? ` — ${blockedCount} tarefa(s) liberada(s)` : ''}`,
                              userId: userData?.id,
                              userName: userData?.name,
                              timestamp: new Date(),
                            }]
                          });
                        } catch (e) {
                          console.error(e);
                          alert('Erro ao avançar etapa.');
                        }
                      };

                      return (
                        <div className="ps-timeline-side">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div className="ps-timeline-side-title" style={{ marginBottom: 0 }}>TIMELINE</div>
                            {(canEdit || canPlan) && !isLast && (
                              <button onClick={handleAvancarEtapa} style={{
                                fontSize: 9, padding: '3px 8px', borderRadius: 6,
                                border: '1px solid rgba(0,229,196,0.4)', background: 'none',
                                color: '#00E5C4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                                fontWeight: 600, letterSpacing: 0.5, whiteSpace: 'nowrap'
                              }}>Avançar ›</button>
                            )}
                          </div>
                          {STEPS.map((step, i) => {
                            const isDone = i < currentIdx;
                            const isActive = i === currentIdx;
                            return (
                              <div key={step.id} className="ps-timeline-step">
                                <div className={`ps-timeline-dot${isDone ? ' done' : isActive ? ' active' : ''}`} />
                                <span className={`ps-timeline-step-label${isDone ? ' done' : isActive ? ' active' : ''}`}>
                                  {step.label}
                                </span>
                              </div>
                            );
                          })}
                          {isLast && (
                            <div style={{ marginTop: 12, fontSize: 10, color: '#10b981', fontWeight: 600, letterSpacing: 0.5, textAlign: 'center' }}>
                              JOB CONCLUÍDO
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  </div>{/* fim layout dois colunas */}
                </>
              ) : (
                <>
                  {/* Cliente */}
                  <div className="ps-card">
                    <div className="ps-card-title">Cliente</div>
                    <div className="ps-info-grid">
                      <div className="ps-info-item">
                        <span className="ps-info-label">Nome</span>
                        <span className="ps-info-value">{project.clientName || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Empresa</span>
                        <span className="ps-info-value">{project.companyName || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Email</span>
                        <span className="ps-info-value">{project.clientEmail || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Telefone</span>
                        <span className="ps-info-value">{project.clientPhone || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Evento */}
                  <div className="ps-card">
                    <div className="ps-card-title">Evento</div>
                    <div className="ps-info-grid">
                      <div className="ps-info-item">
                        <span className="ps-info-label">Tipo de evento</span>
                        <span className="ps-info-value">{project.eventTypeName || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Solicitado em</span>
                        <span className="ps-info-value">{formatDate(project.createdAt)}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Atendimento responsável</span>
                        <span className="ps-info-value">{project.assignedToName || '—'}</span>
                      </div>
                      <div className="ps-info-item">
                        <span className="ps-info-label">Atribuído em</span>
                        <span className="ps-info-value">{formatDate(project.assignedAt)}</span>
                      </div>
                      {project.estimatedTotal > 0 && (
                        <div className="ps-info-item full ps-highlight">
                          <span className="ps-info-label">Valor estimado</span>
                          <span className="ps-info-value">
                            R$ {project.estimatedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── BRIEFING ── */}
          {activeTab === 'briefing' && (
            <div className="ps-card">
              <div className="ps-card-title">Respostas do Briefing</div>
              {questions.length > 0 ? (
                questions.map(q => (
                  <div key={q.id} className="ps-answer-item">
                    <span className="ps-question-text">{q.text}</span>
                    <span className="ps-answer-text">
                      {getAnswerDisplay(q, project.answers?.[q.id], project.answers?.['fixed-events'] || [])}
                    </span>
                  </div>
                ))
              ) : project.answers && Object.keys(project.answers).length > 0 ? (
                (() => {
                  const feiras = project.answers['fixed-events'] || [];
                  const isFeiraAnswer = (val) =>
                    val && typeof val === 'object' && !Array.isArray(val) &&
                    Object.keys(val).every(k => !isNaN(k));

                  return Object.entries(project.answers).map(([key, val]) => {
                    let display = '';
                    if (val === null || val === undefined) {
                      display = '—';
                    } else if (key === 'fixed-events' && Array.isArray(val)) {
                      display = val.map((f, i) => `Feira ${i + 1}: ${f.nome || ''}${f.local ? ` — ${f.local}` : ''}${f.dataInicio ? ` (${f.dataInicio}${f.dataFim ? ` a ${f.dataFim}` : ''})` : ''}`).join(' | ');
                    } else if (key === 'fixed-envio' && typeof val === 'object' && !Array.isArray(val)) {
                      display = val.userName || '—';
                    } else if (isFeiraAnswer(val)) {
                      display = Object.entries(val).map(([idx, v]) => {
                        const feira = feiras[parseInt(idx)];
                        const label = feira?.nome ? feira.nome : `Feira ${parseInt(idx) + 1}`;
                        return `${label}: ${v}`;
                      }).join(' | ');
                    } else if (Array.isArray(val)) {
                      display = val.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', ');
                    } else if (typeof val === 'object') {
                      display = JSON.stringify(val);
                    } else {
                      display = String(val);
                    }
                    return (
                      <div key={key} className="ps-answer-item">
                        <span className="ps-question-text">{key}</span>
                        <span className="ps-answer-text">{display}</span>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="ps-empty">Nenhuma resposta disponível</div>
              )}
            </div>
          )}

          {/* ── BRIEFING GERAL (só filhos) ── */}
          {activeTab === 'briefing-geral' && (
            <div className="ps-card">
              <div className="ps-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Briefing Geral — Pacote Completo</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {canEdit && !modoEditarGeral && !modoPlanejarGeral && (
                    <button onClick={abrirEdicaoGeral} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,167,38,0.4)', background: 'none', color: '#FFA726', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar Briefing</button>
                  )}
                  {modoEditarGeral && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={salvarEdicaoGeral} disabled={savingEditGeral} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#FFA726,#f57c00)', color: 'white', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{savingEditGeral ? 'Salvando...' : 'Salvar Edição'}</button>
                      <button onClick={() => setModoEditarGeral(false)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                    </div>
                  )}
                  {canPlan && !modoPlanejarGeral && !modoEditarGeral && (
                    <button onClick={() => setModoPlanejarGeral(true)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(0,229,196,0.4)', background: 'none', color: '#00E5C4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Sessão de Planejamento</button>
                  )}
                  {modoPlanejarGeral && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#FFA726', alignSelf: 'center' }}>{newTasksGeral.length} tarefa(s)</span>
                      <button onClick={salvarSessaoGeral} disabled={savingSessionGeral} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: newTasksGeral.length > 0 ? 'linear-gradient(135deg,#00E5C4,#0080FF)' : '#ccc', color: 'white', fontSize: 11, cursor: newTasksGeral.length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{savingSessionGeral ? 'Salvando...' : 'Salvar Sessão'}</button>
                      <button onClick={() => { setModoPlanejarGeral(false); setNewTasksGeral([]); setTaskFormsGeral({}); }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'none', color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                    </div>
                  )}
                </div>
              </div>

              {parentProject ? (() => {
                const answers = modoEditarGeral ? editedAnswersGeral : (parentProject.answers || {});
                const feiras = parentProject.answers?.['fixed-events'] || [];
                const isFeiraAnswerFn = (val) =>
                  val && typeof val === 'object' && !Array.isArray(val) &&
                  Object.keys(val).every(k => !isNaN(k));

                const getDisplay = (key, val) => {
                  if (val === null || val === undefined) return '—';
                  if (key === 'fixed-events' && Array.isArray(val))
                    return val.map((f, i) => `Feira ${i+1}: ${f.nome||''}${f.local?` — ${f.local}`:''}${f.dataInicio?` (${f.dataInicio}${f.dataFim?` a ${f.dataFim}`:''})`:''}` ).join(' | ');
                  if (key === 'fixed-envio' && typeof val === 'object' && !Array.isArray(val)) return val.userName || '—';
                  if (isFeiraAnswerFn(val))
                    return Object.entries(val).map(([idx, v]) => `${feiras[parseInt(idx)]?.nome || `Feira ${parseInt(idx)+1}`}: ${v}`).join(' | ');
                  if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
                  if (typeof val === 'object') return JSON.stringify(val);
                  return String(val);
                };

                const inputStyle = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #dde', fontSize: 13, fontFamily: 'Outfit, sans-serif', background: '#fff', color: '#1a2e40', outline: 'none' };

                const renderEditInputGeral = (key, val) => {
                  const q = allQuestions.find(q => q.id === key);
                  if (q?.type === 'yesno') return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['Sim','Não'].map(opt => <button key={opt} onClick={() => setEditedAnswersGeral(p => ({...p,[key]:opt}))} style={{...inputStyle,width:'auto',padding:'6px 16px',cursor:'pointer',background:val===opt?'#e8f5e9':'#fff',borderColor:val===opt?'#66BB6A':'#dde',color:val===opt?'#27ae60':'#666'}}>{opt}</button>)}
                    </div>
                  );
                  if (q?.type === 'textarea') return <textarea value={typeof val==='object'?JSON.stringify(val):(val||'')} onChange={e=>setEditedAnswersGeral(p=>({...p,[key]:e.target.value}))} rows={3} style={{...inputStyle,resize:'vertical'}} />;
                  return <input type="text" value={typeof val==='object'?JSON.stringify(val):(val||'')} onChange={e=>setEditedAnswersGeral(p=>({...p,[key]:e.target.value}))} style={inputStyle} />;
                };

                const fixedLabels = { 'fixed-events':{label:'Feiras',order:-5}, 'fixed-purpose':{label:'Propósito',order:-4}, 'fixed-client':{label:'Empresa Cliente',order:-6}, 'fixed-responsible':{label:'Responsável',order:-3}, 'fixed-attendant':{label:'Atendimento',order:-2}, 'fixed-date':{label:'Data',order:-1}, 'fixed-envio':{label:'Encaminhado para',order:9999} };

                const allQsGeral = [
                  ...Object.entries(answers).map(([key, val]) => {
                    const fixed = fixedLabels[key];
                    const q = allQuestions.find(q => q.id === key);
                    return { key, label: fixed?.label || q?.text || key, order: fixed?.order ?? (q?.order||999), val, isFixed: !!fixed, isFeiraAnswer: isFeiraAnswerFn(val) };
                  }),
                  ...extraQuestionsGeral.filter(q => !Object.keys(answers).includes(q.id)).map(q => ({ key: q.id, label: q.text, order: q.order||998, val: undefined, isFixed: false, isFeiraAnswer: false, isExtra: true }))
                ].sort((a,b) => a.order - b.order);

                return (
                  <>
                    {allQsGeral.map(({ key, label, val, isFixed, isFeiraAnswer, isExtra }) => {
                      const q = allQuestions.find(q => q.id === key);
                      const geralLines = !modoEditarGeral ? getAnswerLines(q, val, feiras) : null;
                      const isMultiLineGeral = geralLines && geralLines.length > 1;
                      const formG = taskFormsGeral[key] || {};
                      const tasksCriadasG = newTasksGeral.filter(t => t.questionId === key);
                      const filteredUsersG = formG.cargoId ? agencyUsers.filter(u => u.roleId === formG.cargoId) : agencyUsers;
                      return (
                        <div key={key} style={{ padding: '14px 0', borderBottom: '1px solid #f0f2f5' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <span className="ps-question-text">
                                {label}
                                {isFeiraAnswer && <span style={{ fontSize:10, color:'#0080FF', marginLeft:6 }}>por feira</span>}
                                {isExtra && <span style={{ fontSize:10, color:'#FFA726', marginLeft:6 }}>nova</span>}
                              </span>
                              {modoEditarGeral && !isFixed
                                ? <div style={{ marginTop:6 }}>{renderEditInputGeral(key, val)}</div>
                                : (
                                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {geralLines?.map(line => (
                                      <div key={line.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMultiLineGeral ? '4px 8px' : 0, background: isMultiLineGeral ? '#fafafa' : 'none', borderRadius: isMultiLineGeral ? 6 : 0, border: isMultiLineGeral ? '1px solid #f0f2f5' : 'none' }}>
                                        <span className="ps-answer-text">
                                          {line.label && <span style={{ color: '#8a9bb0', marginRight: 6, fontSize: 12, fontWeight: 500 }}>{line.label}:</span>}
                                          {line.value}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              }
                            </div>
                            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                              {modoPlanejarGeral && !isMultiLineGeral && (
                                <button onClick={() => toggleTaskFormGeral(key)} style={{ padding:'4px 10px', borderRadius:6, fontSize:11, border:'1px solid rgba(0,229,196,0.4)', background: formG.open?'rgba(0,229,196,0.1)':'none', color:'#00E5C4', cursor:'pointer', fontFamily:'Outfit, sans-serif', whiteSpace:'nowrap' }}>
                                  {isFeiraAnswer ? `Gerar ${feiras.length}x` : 'Gerar Tarefa'}
                                </button>
                              )}
                              {modoPlanejarGeral && isMultiLineGeral && (
                                <button onClick={() => toggleTaskFormGeral(key)} style={{ padding:'4px 10px', borderRadius:6, fontSize:11, border:'1px solid rgba(0,229,196,0.4)', background: formG.open?'rgba(0,229,196,0.1)':'none', color:'#00E5C4', cursor:'pointer', fontFamily:'Outfit, sans-serif', whiteSpace:'nowrap' }}>
                                  Gerar {geralLines.length}x
                                </button>
                              )}
                              {modoEditarGeral && isExtra && (
                                <button onClick={() => setExtraQuestionsGeral(prev => prev.filter(q => q.id !== key))} style={{ background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:13 }}>✕</button>
                              )}
                            </div>
                          </div>

                          {modoPlanejarGeral && formG.open && (
                            <div style={{ marginTop:10, padding:14, background:'#f8faff', borderRadius:8, border:'1px solid #e0e8ff', display:'flex', flexDirection:'column', gap:10 }}>
                              {isFeiraAnswer && <div style={{ fontSize:11, color:'#0080FF', fontWeight:600 }}>Será criada 1 tarefa para cada feira ({feiras.length} no total)</div>}
                              <input placeholder="Tarefa *" value={formG.tarefa||''} onChange={e=>updateTaskFormGeral(key,'tarefa',e.target.value)} style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }} />
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                <select value={formG.cargoId||''} onChange={e=>updateTaskFormGeral(key,'cargoId',e.target.value)} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                                  <option value="">Cargo...</option>
                                  {agencyRoles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                                <select value={formG.pessoaId||''} onChange={e=>updateTaskFormGeral(key,'pessoaId',e.target.value)} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                                  <option value="">Pessoa *</option>
                                  {filteredUsersG.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                              </div>
                              <input placeholder="Valor estimado (opcional)" value={formG.valor||''} onChange={e=>updateTaskFormGeral(key,'valor',e.target.value)} type="number" min="0" style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }} />
                              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                                <button onClick={()=>toggleTaskFormGeral(key)} style={{ padding:'6px 12px', borderRadius:6, border:'1px solid #ddd', background:'none', color:'#666', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>Cancelar</button>
                                <button onClick={()=>gerarTarefaGeral(key, label, display, isFeiraAnswer)} style={{ padding:'6px 14px', borderRadius:6, border:'none', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'white', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif', fontWeight:600 }}>Criar Tarefa</button>
                              </div>
                            </div>
                          )}

                          {tasksCriadasG.map(t => (
                            <div key={t.taskId} style={{ marginTop:8, display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'rgba(102,126,234,0.06)', borderRadius:6, border:'1px solid rgba(102,126,234,0.2)' }}>
                              <span style={{ fontSize:11, color:'#667eea' }}>✓</span>
                              <span style={{ fontSize:12, flex:1, color:'#2c3e50' }}>{t.name}</span>
                              {t.isFeiraAnswer && <span style={{ fontSize:10, color:'#0080FF' }}>{feiras.length}x</span>}
                              <span style={{ fontSize:11, color:'#7b1fa2' }}>{t.cargoNome}</span>
                              <span style={{ fontSize:11, color:'#1976d2' }}>{t.assignedToName}</span>
                              {t.valor && <span style={{ fontSize:11, color:'#27ae60' }}>R$ {t.valor}</span>}
                              <button onClick={()=>setNewTasksGeral(prev=>prev.filter(x=>x.taskId!==t.taskId))} style={{ background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:13 }}>✕</button>
                            </div>
                          ))}

                          {/* ── CASCATA PAPER GERAL: tarefas salvas vinculadas a esta pergunta ── */}
                          {!modoPlanejarGeral && !modoEditarGeral && (() => {
                            // Busca tarefas nos filhos E na mãe vinculadas a esta pergunta
                            const tarefasFilhos = (project.tasks || []).filter(t => t.questionId === key);
                            const tarefasMae = (parentProject.tasks || []).filter(t => t.questionId === key);
                            const tarefasSalvas = [...tarefasMae, ...tarefasFilhos];
                            if (tarefasSalvas.length === 0) return null;
                            const colKey = `geral_${key}`;
                            const collapsed = collapsedTasks[colKey] !== false; // Paper Geral começa colapsado
                            return (
                              <div style={{ marginTop: 8 }}>
                                <button onClick={() => toggleCollapse(colKey)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Outfit, sans-serif' }}>
                                  <span style={{ fontSize: 10, color: '#667eea', fontWeight: 700, letterSpacing: 0.5 }}>
                                    {collapsed ? '▶' : '▼'} PLANNER / PRÉ-PRODUÇÃO ({tarefasSalvas.length})
                                  </span>
                                </button>
                                {!collapsed && tarefasSalvas.map(t => {
                                  const reqColor = requisitions.find(r => r.codigo === t.requisicaoCodigo)?.cor || '#667eea';
                                  const temFornecedor = t.fornecedor1 || t.fornecedor2 || t.fornecedor3;
                                  const fornecedorEscolhido = [1,2,3].map(n => ({ nome: t[`fornecedor${n}`], valor: t[`fornecedor${n}Valor`], status: t[`fornecedor${n}Status`] })).find(f => f.status === 'recebido' && f.nome);
                                  return (
                                    <div key={t.taskId} style={{ marginTop: 6, marginLeft: 16, borderLeft: `2px solid ${reqColor}44`, paddingLeft: 12 }}>
                                      {/* Linha Planner */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        {t.feiraNome && <span style={{ fontSize: 10, color: '#0080FF', fontWeight: 600 }}>[{t.feiraNome}]</span>}
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: reqColor, padding: '1px 7px', borderRadius: 10 }}>{t.requisicaoCodigo || 'T'}</span>
                                        <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{t.name}</span>
                                        {t.descricao && <span style={{ fontSize: 12, color: '#64748b' }}>— {t.descricao}</span>}
                                        {t.assignedToName && <span style={{ fontSize: 11, color: '#1976d2' }}>{t.assignedToName}</span>}
                                        {t.prazo && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>{t.prazo}</span>}
                                        {(t.periodo || t.quantidade || t.custoUnitario) && (
                                          <span style={{ fontSize: 11, color: '#475569' }}>
                                            {[t.periodo && `${t.periodo}d`, t.quantidade && `${t.quantidade}x`, t.custoUnitario && `R$${parseFloat(t.custoUnitario).toLocaleString('pt-BR',{minimumFractionDigits:2})}`].filter(Boolean).join(' · ')}
                                          </span>
                                        )}
                                      </div>
                                      {/* Linha Pré-Produção */}
                                      {(temFornecedor || t.status === 'done' || t.status === 'completed') && (
                                        <div style={{ marginTop: 4, marginLeft: 16, borderLeft: '2px solid #10b98144', paddingLeft: 10 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            {fornecedorEscolhido ? (
                                              <>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>Fornecedor:</span>
                                                <span style={{ fontSize: 12, color: '#1e293b' }}>{fornecedorEscolhido.nome}</span>
                                                {fornecedorEscolhido.valor && <span style={{ fontSize: 11, color: '#475569' }}>R$ {parseFloat(fornecedorEscolhido.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}/dia</span>}
                                                {t.periodo && fornecedorEscolhido.valor && (
                                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>
                                                    Total: R$ {(parseFloat(t.periodo||1)*parseFloat(t.quantidade||1)*parseFloat(fornecedorEscolhido.valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                                                  </span>
                                                )}
                                              </>
                                            ) : temFornecedor ? (
                                              <span style={{ fontSize: 11, color: '#f59e0b' }}>Fornecedores em orçamento...</span>
                                            ) : null}
                                            {(t.status === 'done' || t.status === 'completed') && (
                                              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#10b981', padding: '1px 8px', borderRadius: 10 }}>CONCLUÍDA</span>
                                            )}
                                            {t.justificativa && <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>{t.justificativa}</span>}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Subrespostas no Paper Geral */}
                          {!modoEditarGeral && (() => {
                            const qObj = allQuestions.find(q => q.id === key);
                            if (!qObj?.subQuestions || qObj.subQuestions.length === 0) return null;
                            return renderSubAnswers(
                              qObj.subQuestions, answers, key, qObj.options || [],
                              0, modoPlanejarGeral, newTasksGeral, setNewTasksGeral, taskFormsGeral, setTaskFormsGeral
                            );
                          })()}
                          {/* Edição de subrespostas no Paper Geral */}
                          {modoEditarGeral && (() => {
                            const qObj = allQuestions.find(q => q.id === key);
                            if (!qObj?.subQuestions || qObj.subQuestions.length === 0) return null;
                            return renderSubEditInputs(
                              qObj.subQuestions, editedAnswersGeral, setEditedAnswersGeral, key, qObj.options || []
                            );
                          })()}
                        </div>
                      );
                    })}

                    {modoEditarGeral && (
                      <div style={{ marginTop:16 }}>
                        {!showAddPerguntaGeral ? (
                          <button onClick={()=>setShowAddPerguntaGeral(true)} style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px dashed #FFA726', background:'none', color:'#FFA726', fontSize:13, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>+ Adicionar Pergunta</button>
                        ) : (
                          <div style={{ padding:14, background:'#fffbf0', borderRadius:8, border:'1px solid #ffe0a0', display:'flex', flexDirection:'column', gap:10 }}>
                            <select onChange={e=>{ const q=allQuestions.find(q=>q.id===e.target.value); if(q&&!extraQuestionsGeral.find(eq=>eq.id===q.id)) setExtraQuestionsGeral(prev=>[...prev,q]); setShowAddPerguntaGeral(false); }} defaultValue="" style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #ffe0a0', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                              <option value="">Selecione uma pergunta...</option>
                              {allQuestions.filter(q=>!Object.keys(answers).includes(q.id)&&!extraQuestionsGeral.find(eq=>eq.id===q.id)).map(q=><option key={q.id} value={q.id}>{q.text}</option>)}
                            </select>
                            <button onClick={()=>setShowAddPerguntaGeral(false)} style={{ alignSelf:'flex-end', padding:'5px 12px', borderRadius:6, border:'1px solid #ddd', background:'none', color:'#666', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    )}

                    {modoPlanejarGeral && (
                      <div style={{ marginTop:16 }}>
                        {!showNovaTaskGeral ? (
                          <button onClick={()=>setShowNovaTaskGeral(true)} style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px dashed #667eea', background:'none', color:'#667eea', fontSize:13, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>+ Nova Tarefa (sem vínculo)</button>
                        ) : (
                          <div style={{ padding:14, background:'#f8faff', borderRadius:8, border:'1px solid #e0e8ff', display:'flex', flexDirection:'column', gap:10 }}>
                            <span style={{ fontSize:11, fontWeight:600, color:'#667eea' }}>NOVA TAREFA</span>
                            <input placeholder="Tarefa *" value={novaTaskGeral.tarefa} onChange={e=>setNovaTaskGeral(p=>({...p,tarefa:e.target.value}))} style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }} />
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                              <select value={novaTaskGeral.cargoId} onChange={e=>{ const c=agencyRoles.find(r=>r.id===e.target.value); setNovaTaskGeral(p=>({...p,cargoId:e.target.value,cargoNome:c?.name||'',pessoaId:'',pessoaNome:''})); }} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                                <option value="">Cargo...</option>
                                {agencyRoles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                              <select value={novaTaskGeral.pessoaId} onChange={e=>{ const p=agencyUsers.find(u=>u.id===e.target.value); setNovaTaskGeral(prev=>({...prev,pessoaId:e.target.value,pessoaNome:p?.name||''})); }} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }}>
                                <option value="">Pessoa *</option>
                                {(novaTaskGeral.cargoId?agencyUsers.filter(u=>u.roleId===novaTaskGeral.cargoId):agencyUsers).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                              </select>
                            </div>
                            <input placeholder="Valor estimado (opcional)" value={novaTaskGeral.valor} onChange={e=>setNovaTaskGeral(p=>({...p,valor:e.target.value}))} type="number" min="0" style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #dde', fontSize:13, fontFamily:'Outfit, sans-serif' }} />
                            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                              <button onClick={()=>setShowNovaTaskGeral(false)} style={{ padding:'6px 12px', borderRadius:6, border:'1px solid #ddd', background:'none', color:'#666', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>Cancelar</button>
                              <button onClick={gerarNovaTaskGeral} style={{ padding:'6px 14px', borderRadius:6, border:'none', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'white', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif', fontWeight:600 }}>Criar Tarefa</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })() : (
                <div className="ps-empty">Briefing geral não disponível</div>
              )}
            </div>
          )}

          {/* ── CRONOGRAMA ── */}
          {activeTab === 'cronograma' && (() => {
            // Garante que o item 1 (Briefing) começa sempre concluído com a data de criação do projeto
            const dataCreatedAt = project.createdAt?.toDate ? project.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const cronograma = {
              briefing: {
                concluida: true,
                concluidaEm: project.createdAt || new Date(),
                concluidaPor: project.assignedToName || 'Atendimento',
                data: dataCreatedAt,
              },
              ...(project.cronograma || {}),
              // briefing sempre concluído, não pode ser sobrescrito
              briefing: {
                concluida: true,
                concluidaEm: project.createdAt || new Date(),
                concluidaPor: project.assignedToName || 'Atendimento',
                data: dataCreatedAt,
              },
            };
            const currentStage = project.jobStage || 'briefing';

            const saveCrono = async (etapaId, field, value) => {
              const updated = { ...cronograma, [etapaId]: { ...(cronograma[etapaId] || {}), [field]: value } };
              try { await updateDoc(doc(db, 'budgets', projectId), { cronograma: updated, updatedAt: new Date() }); }
              catch (e) { console.error(e); }
            };

            const toggleParticipanteCrono = async (etapaId, user) => {
              const current = cronograma[etapaId]?.participantes || [];
              const exists = current.find(p => p.id === user.id);
              const updated = exists ? current.filter(p => p.id !== user.id) : [...current, { id: user.id, name: user.name, roleName: user.roleName || '' }];
              await saveCrono(etapaId, 'participantes', updated);
            };

            const concluirEtapa = async (etapaId) => {
              if (!window.confirm('Marcar esta etapa como concluída?')) return;
              try {
                const updates = {
                  cronograma: { ...cronograma, [etapaId]: { ...(cronograma[etapaId] || {}), concluida: true, concluidaEm: new Date(), concluidaPor: userData?.name } },
                  updatedAt: new Date()
                };
                const timelineEntry = { action: 'etapa_concluida', description: '', userId: userData?.id, userName: userData?.name, timestamp: new Date() };

                if (etapaId === 'reuniao_briefing') {
                  const plannerUserId = project.plannerUserId;
                  const plannerName = project.plannerUserName;
                  if (plannerUserId) {
                    const tarefaPaper = {
                      taskId: `task-paper-${Date.now()}`,
                      name: 'Criar Paper do Job',
                      descricao: 'Planejar e detalhar o paper completo do job para apresentação no Kick-off.',
                      assignedTo: plannerUserId, assignedToName: plannerName,
                      status: 'backlog', prioridade: 'alta',
                      createdAt: new Date(), createdBy: userData?.name, type: 'planejamento',
                    };
                    updates.tasks = [...(project.tasks || []), tarefaPaper];
                    timelineEntry.description = `Reunião de Briefing concluída — tarefa "Criar Paper" enviada para ${plannerName}`;
                  }
                  updates.jobStage = 'kickoff';
                } else if (etapaId === 'kickoff') {
                  const unlockedTasks = (project.tasks || []).map(t =>
                    t.status === 'blocked' ? { ...t, status: 'backlog', unlockedAt: new Date(), unlockedBy: userData?.name } : t
                  );
                  const blockedCount = (project.tasks || []).filter(t => t.status === 'blocked').length;
                  updates.tasks = unlockedTasks;
                  updates.jobStage = 'paper';
                  timelineEntry.description = `Kick-off concluído — ${blockedCount} tarefa(s) liberada(s) para os responsáveis`;
                } else if (etapaId === 'paper') {
                  updates.jobStage = 'planilha_inicial';
                  timelineEntry.description = 'Reunião de Paper concluída — equipe alinhada';
                } else if (etapaId === 'aprovacao') {
                  // Aprovação: desbloqueia tarefas blocked restantes + avança
                  const unlockedTasks = (project.tasks || []).map(t =>
                    t.status === 'blocked' ? { ...t, status: 'backlog', unlockedAt: new Date(), unlockedBy: userData?.name } : t
                  );
                  const blockedCount = (project.tasks || []).filter(t => t.status === 'blocked').length;
                  updates.tasks = unlockedTasks;
                  updates.jobStage = 'finalizacoes';
                  updates.status = 'approved';
                  timelineEntry.description = `Job aprovado pelo cliente — ${blockedCount} tarefa(s) liberada(s)`;
                } else {
                  timelineEntry.description = `Etapa concluída por ${userData?.name}`;
                }

                // Para QUALQUER etapa concluída — ativa tarefas template cuja etapa bate com a etapa concluída
                const tasksBase = updates.tasks || project.tasks || [];
                const tasksComTemplatesAtivados = tasksBase.map(t => {
                  if (t.status === 'template' && t.jobStage === etapaId) {
                    return { ...t, status: 'backlog', activatedAt: new Date(), activatedBy: userData?.name };
                  }
                  return t;
                });
                const templateCount = tasksBase.filter(t => t.status === 'template' && t.jobStage === etapaId).length;
                if (templateCount > 0) {
                  updates.tasks = tasksComTemplatesAtivados;
                  timelineEntry.description += ` — ${templateCount} tarefa(s) template ativada(s)`;
                }

                updates.timeline = [...(project.timeline || []), timelineEntry];
                await updateDoc(doc(db, 'budgets', projectId), updates);
              } catch (e) { console.error(e); alert('Erro ao concluir etapa.'); }
            };

            const handleReprovado = async () => {
              if (!window.confirm('Marcar como Reprovado? Todos os cards de tarefas pendentes serão eliminados e registrado no histórico.')) return;
              try {
                const tasksLimpas = (project.tasks || []).filter(t => t.status !== 'blocked' && t.status !== 'backlog');
                await updateDoc(doc(db, 'budgets', projectId), {
                  cronograma: { ...cronograma, aprovacao: { ...(cronograma.aprovacao || {}), reprovada: true, reprovadaEm: new Date(), reprovadaPor: userData?.name } },
                  tasks: tasksLimpas,
                  status: 'rejected',
                  updatedAt: new Date(),
                  timeline: [...(project.timeline || []), {
                    action: 'reprovado',
                    description: `Job reprovado pelo cliente — ${(project.tasks || []).filter(t => t.status === 'blocked' || t.status === 'backlog').length} tarefa(s) eliminada(s)`,
                    userId: userData?.id, userName: userData?.name, timestamp: new Date(),
                  }]
                });
              } catch (e) { console.error(e); alert('Erro ao reprovar.'); }
            };

            const agendarReuniao = async (etapaId) => {
              const etapaData = cronograma[etapaId] || {};
              if (!etapaData.data || !etapaData.hora) {
                alert('Preencha a data e hora antes de agendar.');
                return;
              }
              if (!window.confirm('Agendar esta reunião? Os participantes vão receber o card no To Do.')) return;
              try {
                // Salva status agendada no cronograma
                const updatedCrono = { ...cronograma, [etapaId]: { ...etapaData, agendada: true, agendadaEm: new Date(), agendadaPor: userData?.name } };

                // Cria cards de reunião no budget para cada participante
                const participantes = etapaData.participantes || [];
                const etapaLabel = (() => {
                  const found = [
                    { id: 'reuniao_briefing', label: 'Reunião de Briefing' },
                    { id: 'kickoff', label: 'Reunião Kick-off' },
                    { id: 'paper', label: 'Reunião de Paper' },
                  ].find(e => e.id === etapaId);
                  return found?.label || 'Reunião';
                })();

                const cardsReuniao = participantes.map(p => ({
                  taskId: `reuniao-${etapaId}-${p.id}-${Date.now()}`,
                  type: 'reuniao',
                  etapaId,
                  name: etapaLabel,
                  feiraNome: project.feiraData?.nome || '',
                  clientName: project.companyName || '',
                  data: etapaData.data,
                  hora: etapaData.hora,
                  sala: etapaData.sala || '',
                  assignedTo: p.id,
                  assignedToName: p.name,
                  status: 'backlog',
                  createdAt: new Date(),
                }));

                const existingTasks = (project.tasks || []).filter(t => !(t.type === 'reuniao' && t.etapaId === etapaId));
                await updateDoc(doc(db, 'budgets', projectId), {
                  cronograma: updatedCrono,
                  tasks: [...existingTasks, ...cardsReuniao],
                  updatedAt: new Date(),
                });
                alert(`✓ Reunião agendada! ${participantes.length} participante(s) notificado(s).`);
              } catch (e) { console.error(e); alert('Erro ao agendar reunião.'); }
            };

            const ETAPAS = [
              { id: 'briefing',             num: 1,  label: 'Briefing',               area: 'Atendimento',        tipo: 'etapa',   semParticipantes: true, autoComplete: true, desc: 'Briefing preenchido no sistema. Job criado e encaminhado para o Planner.' },
              { id: 'reuniao_briefing',     num: 2,  label: 'Reunião de Briefing',    area: 'Atendimento',        tipo: 'reuniao', desc: 'Objetivo: decidir se vamos participar do job e criar o cronograma.', trigger: 'Ao concluir: Planner recebe tarefa "Criar Paper" no To Do' },
              { id: 'kickoff',              num: 3,  label: 'Reunião Kick-off',       area: 'Todas as áreas',     tipo: 'reuniao', desc: 'Objetivo: Planner apresenta o planejamento completo. Equipe aprova ou pede ajustes.', trigger: 'Ao concluir: todas as tarefas são liberadas para os responsáveis' },
              { id: 'paper',                num: 4,  label: 'Reunião de Paper',       area: 'Planejamento',       tipo: 'reuniao', desc: 'Objetivo: Planner explica o job para as áreas. Todo mundo já tem seus cards no To Do.', trigger: 'Ao concluir: avança para Planilha Inicial' },
              { id: 'planilha_inicial',     num: 5,  label: 'Planilha Inicial',       area: 'Produção',           tipo: 'conclusao', desc: 'A partir do Paper, a Produção desenha um primeiro estudo de orçamento.' },
              { id: 'apresentacao_interna', num: 6,  label: 'Reunião Pré-Apresentação', area: 'Atendimento',        tipo: 'reuniao',   desc: 'Reunião com todas as áreas para repassar o job e planilha antes da apresentação.' },
              { id: 'apresentacao_cliente', num: 7,  label: 'Reunião de Apresentação',  area: 'Atendimento',        tipo: 'reuniao',   desc: 'Apresentação do planejamento para o cliente. Idealmente com a participação de todas as áreas.' },
              { id: 'ajustes',              num: 8,  label: 'Reunião de Ajustes',       area: 'Atendimento',        tipo: 'reuniao',   desc: 'Reunião para compartilhar os ajustes solicitados pelo cliente para todas as áreas.' },
              { id: 'aprovacao',            num: 9,  label: 'Aprovação',                area: 'Atendimento',        tipo: 'aprovacao', desc: 'Aprovação formal do projeto pelo cliente.' },
              { id: 'finalizacoes',         num: 10, label: 'Finalizações',           area: 'Criação + Produção', tipo: 'etapa',   desc: 'Preparação de todos os detalhamentos técnicos e artes finais.' },
              { id: 'caderno_artes',        num: 11, label: 'Caderno de Artes',       area: 'Criação + Produção', tipo: 'etapa',   desc: 'Documento com todas as artes finais para início da produção.' },
              { id: 'book_producao',        num: 12, label: 'Book de Produção',       area: 'Produção',           tipo: 'etapa',   desc: 'Documento Book do Projeto com todas as informações do job.' },
              { id: 'passadao_interno',     num: 13, label: 'Passadão Interno',       area: 'Atend. + Produção',  tipo: 'etapa',   desc: 'Reunião final com todas as áreas para repassar o projeto e o Book.' },
              { id: 'producao',             num: 14, label: 'Produção',               area: 'Produção + Arquit.', tipo: 'etapa',   desc: 'Processo de produção supervisionado com relatório diário.' },
              { id: 'entrega_job',          num: 15, label: 'Entrega do Job',         area: 'Produção',           tipo: 'etapa',   desc: 'Produção prepara o TM para Atendimento compartilhar com cliente.' },
              { id: 'fechamento_financeiro',num: 16, label: 'Fechamento Financeiro',  area: 'Produção + Financ.', tipo: 'etapa',   desc: 'Entrega das prestações de contas, planilhas e relatórios de despesas.' },
              { id: 'reuniao_encerramento', num: 17, label: 'Reunião Encerramento',   area: 'Atend. + Produção',  tipo: 'etapa',   desc: 'Reunião com todas as áreas para compartilhar o Relatório final.' },
              { id: 'relatorio_cliente',    num: 18, label: 'Relatório Cliente',      area: 'Atendimento',        tipo: 'etapa',   desc: 'Relatório final compartilhado com o cliente.' },
            ];

            const inp = { padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', background: 'white', color: '#1a2e40', outline: 'none' };

            return (
              <div className="ps-card">
                <div className="ps-card-title">Cronograma do Job</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {ETAPAS.map((etapa, i) => {
                    const etapaData = cronograma[etapa.id] || {};
                    const isConcluida = !!etapaData.concluida;
                    const primeiraNConcluida = ETAPAS.findIndex(e => !cronograma[e.id]?.concluida);
                    const isActive = i === primeiraNConcluida;
                    const isFutura = !isConcluida && !isActive;
                    const isReuniao = etapa.tipo === 'reuniao';
                    const participantes = etapaData.participantes || [];

                    const dotBg = isConcluida ? '#10b981' : isActive ? '#FFA726' : '#f1f5f9';
                    const dotBorder = isConcluida ? '#10b981' : isActive ? '#FFA726' : '#e2e8f0';
                    const labelCol = isConcluida ? '#10b981' : isActive ? '#FFA726' : '#1a2e40';

                    return (
                      <EtapaCrono
                        key={etapa.id}
                        etapa={etapa} etapaData={etapaData} isConcluida={isConcluida} isActive={isActive} isFutura={isFutura}
                        isReuniao={isReuniao} participantes={participantes}
                        dotBg={dotBg} dotBorder={dotBorder} labelCol={labelCol}
                        isLast={i === ETAPAS.length - 1}
                        canEdit={canEdit} canPlan={canPlan}
                        agencyUsers={agencyUsers} inp={inp}
                        saveCrono={saveCrono} toggleParticipante={toggleParticipanteCrono} concluirEtapa={concluirEtapa} agendarReuniao={agendarReuniao} handleReprovado={handleReprovado}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── TAREFAS ── */}
          {activeTab === 'tasks' && (() => {
            const allTasks = project.tasks || [];
            // Tarefas ativas (não são reunião)
            const activeTasks = allTasks.filter(t => t.type !== 'reuniao');
            // Templates sempre aparecem; outras tarefas filtram por usuário se houver filtro
            const filteredTasks = taskFilterUser
              ? activeTasks.filter(t => t.status === 'template' || t.assignedTo === taskFilterUser)
              : activeTasks;

            // Separar templates das ativas
            const templateTasks = filteredTasks.filter(t => t.status === 'template');
            const nonTemplateTasks = filteredTasks.filter(t => t.status !== 'template');

            // Agrupar ativas por requisição
            const grupos = {};
            const semReq = [];
            nonTemplateTasks.forEach(t => {
              if (t.requisicaoCodigo) {
                const key = t.requisicaoCodigo;
                if (!grupos[key]) grupos[key] = { codigo: t.requisicaoCodigo, nome: t.requisicaoNome, tasks: [] };
                grupos[key].tasks.push(t);
              } else {
                semReq.push(t);
              }
            });

            const STATUS_TASK = {
              template:    { label: 'Template',     color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
              blocked:     { label: 'Aguardando',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
              backlog:     { label: 'Pendente',     color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
              todo:        { label: 'A Fazer',      color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
              in_progress: { label: 'Em Andamento', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
              done:        { label: 'Concluída',    color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
              completed:   { label: 'Concluída',    color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
            };

            const TaskCard = ({ t }) => {
              const st = STATUS_TASK[t.status] || STATUS_TASK.backlog;
              const reqColor = requisitions.find(r => r.codigo === t.requisicaoCodigo)?.cor || '#667eea';
              const isTemplate = t.status === 'template';

              const handleDelete = async (e) => {
                e.stopPropagation();
                if (!window.confirm(`Excluir tarefa "${t.name}"?`)) return;
                const updated = (project.tasks || []).filter(task => task.taskId !== t.taskId);
                try { await updateDoc(doc(db, 'budgets', projectId), { tasks: updated, updatedAt: new Date() }); }
                catch(err) { console.error(err); alert('Erro ao excluir tarefa'); }
              };

              return (
                <div onClick={() => { setSelectedTask(t); setEditTask({ ...t }); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: `1px solid ${isTemplate ? '#e2e8f0' : '#f0f2f5'}`, background: isTemplate ? '#fafafa' : 'white', cursor: 'pointer', transition: 'all 0.15s', marginBottom: 6, opacity: isTemplate ? 0.55 : 1 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isTemplate ? '#e2e8f0' : '#f0f2f5'; e.currentTarget.style.opacity = isTemplate ? '0.55' : '1'; }}>
                  {isTemplate && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: '#f1f5f9', color: '#94a3b8', flexShrink: 0, letterSpacing: 0.5 }}>TEMPLATE</span>}
                  {t.requisicaoCodigo && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: reqColor + '22', color: reqColor, flexShrink: 0 }}>{t.requisicaoCodigo}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {t.cargoNome && <span>{t.cargoNome}</span>}
                      {t.assignedToName && <span>{t.assignedToName}</span>}
                      {t.jobStage && <span style={{ marginLeft: 8, color: '#667eea' }}>Etapa: {t.jobStage.replace(/_/g, ' ')}</span>}
                      {t.prioridade === 'urgente' && <span style={{ marginLeft: 8, color: '#ef4444', fontWeight: 600 }}>URGENTE</span>}
                      {t.prioridade === 'alta' && <span style={{ marginLeft: 8, color: '#f97316' }}>Alta</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                  <span style={{ fontSize: 16, color: '#cbd5e1', flexShrink: 0 }}>›</span>
                  {(canEdit || canPlan) && (
                    <button onClick={handleDelete} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>✕</button>
                  )}
                </div>
              );
            };

            const gruposList = Object.values(grupos).sort((a, b) => a.codigo.localeCompare(b.codigo));

            return (
              <div className="ps-card">
                {/* Header com filtro */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div className="ps-card-title" style={{ margin: 0 }}>Tarefas do Projeto ({nonTemplateTasks.length + templateTasks.length})</div>
                  <select value={taskFilterUser} onChange={e => setTaskFilterUser(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#475569', fontFamily: 'Outfit, sans-serif', background: 'white' }}>
                    <option value="">Todos os responsáveis</option>
                    {[...new Map(allTasks.filter(t => t.assignedTo).map(t => [t.assignedTo, t])).values()].map(t => (
                      <option key={t.assignedTo} value={t.assignedTo}>{t.assignedToName}</option>
                    ))}
                  </select>
                </div>

                {nonTemplateTasks.length === 0 && templateTasks.length === 0 ? (
                  <div className="ps-empty">Nenhuma tarefa encontrada</div>
                ) : (
                  <>
                    {gruposList.map(g => (
                      <div key={g.codigo} style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                          Requisição {g.codigo} — {g.nome} ({g.tasks.length})
                        </div>
                        {g.tasks.map((t, i) => <TaskCard key={t.taskId || i} t={t} />)}
                      </div>
                    ))}
                    {semReq.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                          Outras tarefas ({semReq.length})
                        </div>
                        {semReq.map((t, i) => <TaskCard key={t.taskId || i} t={t} />)}
                      </div>
                    )}
                    {/* Seção de tarefas template — visíveis mas opacas */}
                    {templateTasks.length > 0 && (
                      <div style={{ marginTop: 24 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                          Tarefas programadas no fluxo ({templateTasks.length})
                          <span style={{ fontSize: 10, fontWeight: 400, color: '#cbd5e1' }}>— serão ativadas conforme as etapas avançam</span>
                        </div>
                        {templateTasks.map((t, i) => <TaskCard key={t.taskId || i} t={t} />)}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── TASK MODAL ── */}
          {selectedTask && editTask && (() => {
            const t = selectedTask;
            const reqColor = requisitions.find(r => r.codigo === t.requisicaoCodigo)?.cor || '#667eea';
            const PRIORIDADE_COLOR = { baixa: '#94a3b8', normal: '#64748b', alta: '#f97316', urgente: '#ef4444' };
            const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box' };
            const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

            const handleConcluir = async () => {
              if (!window.confirm('Marcar esta tarefa como concluída?')) return;
              setSavingTask(true);
              try {
                const updatedTasks = (project.tasks || []).map(tk =>
                  tk.taskId === t.taskId ? { ...tk, ...editTask, status: 'done', completedAt: new Date() } : tk
                );
                await updateDoc(doc(db, 'budgets', projectId), { tasks: updatedTasks, updatedAt: serverTimestamp() });
                setSelectedTask(null); setEditTask(null);
              } catch (e) { console.error(e); alert('Erro ao salvar.'); }
              finally { setSavingTask(false); }
            };

            const handleSalvar = async () => {
              setSavingTask(true);
              try {
                const updatedTasks = (project.tasks || []).map(tk =>
                  tk.taskId === t.taskId ? { ...tk, ...editTask } : tk
                );
                await updateDoc(doc(db, 'budgets', projectId), { tasks: updatedTasks, updatedAt: serverTimestamp() });
                setSelectedTask(null); setEditTask(null);
              } catch (e) { console.error(e); alert('Erro ao salvar.'); }
              finally { setSavingTask(false); }
            };

            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                onClick={() => setSelectedTask(null)}>
                <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
                  onClick={e => e.stopPropagation()}>

                  {/* Header */}
                  <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          {t.requisicaoCodigo && <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: reqColor + '22', color: reqColor }}>{t.requisicaoCodigo} — {t.requisicaoNome}</span>}
                          {t.prioridade && t.prioridade !== 'normal' && <span style={{ fontSize: 11, fontWeight: 700, color: PRIORIDADE_COLOR[t.prioridade] }}>{t.prioridade.toUpperCase()}</span>}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{t.name}</div>
                        {t.descricao && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{t.descricao}</div>}

                        {/* Contexto do briefing — resolve dinamicamente */}
                        {(() => {
                          // Tenta pegar questionText e briefingAnswer da tarefa ou resolver pelo questionId
                          const qText = t.questionText || (() => {
                            if (!t.questionId) return null;
                            // Remove sufixo __item-N ou __key para encontrar a pergunta base
                            const baseId = t.questionId.split('__')[0];
                            const q = questions.find(q => q.id === baseId);
                            return q?.text || null;
                          })();

                          // Tenta pegar a resposta do briefing
                          const answer = t.briefingAnswer || t.checklistItem || (() => {
                            if (!t.questionId) return null;
                            const baseId = t.questionId.split('__')[0];
                            const raw = project.answers?.[baseId];
                            if (!raw) return null;
                            // Checklist
                            if (Array.isArray(raw)) return raw.filter(Boolean).join(', ');
                            // Objeto por feira
                            if (typeof raw === 'object' && !Array.isArray(raw)) {
                              const vals = Object.values(raw).filter(Boolean);
                              return vals.join(' | ');
                            }
                            return typeof raw === 'string' ? raw : null;
                          })();

                          if (!qText && !answer) return null;

                          return (
                            <div style={{ marginTop: 10, padding: '10px 14px', background: '#f8faff', borderRadius: 10, borderLeft: '3px solid #667eea' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#667eea', marginBottom: 6, letterSpacing: 0.5 }}>CONTEXTO DO BRIEFING</div>
                              {qText && <div style={{ fontSize: 12, color: '#475569', marginBottom: answer ? 4 : 0 }}>{qText}</div>}
                              {answer && (
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', background: 'white', borderRadius: 6, padding: '6px 10px', border: '1px solid #e0e8ff', marginTop: 4 }}>
                                  {answer}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', flexShrink: 0, marginLeft: 12 }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#64748b' }}>
                      {t.assignedToName && <span>Responsável: <strong>{t.assignedToName}</strong></span>}
                      {t.cargoNome && <span>Cargo: <strong>{t.cargoNome}</strong></span>}
                      {t.prazo && <span>Prazo: <strong style={{ color: '#f59e0b' }}>{t.prazo}</strong></span>}
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>

                    {/* Campos da requisição — referência */}
                    {(() => {
                      const reqModal = requisitions.find(r => r.id === t.requisicaoId || r.codigo === t.requisicaoCodigo);
                      const camposReq = reqModal?.campos || [];
                      return (
                        <>
                          {/* Infos do Planner — readonly */}
                          {(t.periodo || t.quantidade || t.custoUnitario) && (
                            <div style={{ background: '#f8faff', borderRadius: 10, padding: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                              {t.periodo && <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>PERÍODO</div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.periodo} dias</div></div>}
                              {t.quantidade && <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>QUANTIDADE</div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.quantidade}</div></div>}
                              {t.custoUnitario && <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>CUSTO UNIT.</div><div style={{ fontSize: 14, fontWeight: 600 }}>R$ {parseFloat(t.custoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>}
                              {t.periodo && t.quantidade && t.custoUnitario && (
                                <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '6px 12px' }}>
                                  <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>CUSTO TOTAL</div>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>R$ {(parseFloat(t.periodo) * parseFloat(t.quantidade) * parseFloat(t.custoUnitario)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Fornecedores — sempre mostra se a requisição tem esse campo */}
                          {(camposReq.includes('fornecedores') || t.fornecedor1 || t.fornecedor2 || t.fornecedor3) && (
                            <div>
                              <label style={{ ...lbl, fontSize: 13, marginBottom: 8 }}>Fornecedores</label>
                              {[1,2,3].map(n => {
                                const status = editTask[`fornecedor${n}Status`] || '';
                                const statusColor = status === 'recebido' ? '#16a34a' : status === 'aguardando' ? '#d97706' : '#94a3b8';
                                return (
                                  <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 170px', gap: 8, marginBottom: 8 }}>
                                    <input value={editTask[`fornecedor${n}`] || ''} onChange={e => setEditTask(p => ({ ...p, [`fornecedor${n}`]: e.target.value }))} placeholder={`Fornecedor ${n} — nome`} style={inp} />
                                    <input type="number" value={editTask[`fornecedor${n}Valor`] || ''} onChange={e => setEditTask(p => ({ ...p, [`fornecedor${n}Valor`]: e.target.value }))} placeholder="Valor (R$)" style={inp} />
                                    <select value={status} onChange={e => setEditTask(p => ({ ...p, [`fornecedor${n}Status`]: e.target.value }))}
                                      style={{ ...inp, color: statusColor, fontWeight: status ? 600 : 400, border: `1px solid ${statusColor}66` }}>
                                      <option value="">Status...</option>
                                      <option value="aguardando">Aguardando orçamento</option>
                                      <option value="recebido">Orçamento recebido</option>
                                    </select>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* BV e Crédito */}
                          {(camposReq.includes('bv') || camposReq.includes('credito')) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              {camposReq.includes('bv') && <div><label style={lbl}>BV %</label><input type="number" min="0" max="100" value={editTask.bvPct || ''} onChange={e => setEditTask(p => ({ ...p, bvPct: e.target.value }))} style={inp} /></div>}
                              {camposReq.includes('credito') && <div><label style={lbl}>Crédito (R$)</label><input type="number" min="0" value={editTask.credito || ''} onChange={e => setEditTask(p => ({ ...p, credito: e.target.value }))} style={inp} /></div>}
                            </div>
                          )}

                          {/* Justificativa */}
                          {(camposReq.includes('justificativa') || t.justificativa) && (
                            <div><label style={lbl}>Justificativa</label><input value={editTask.justificativa || ''} onChange={e => setEditTask(p => ({ ...p, justificativa: e.target.value }))} placeholder="Justificativa do fornecedor escolhido..." style={inp} /></div>
                          )}

                          {/* Observação */}
                          {(camposReq.includes('observacao') || t.observacao) && (
                            <div><label style={lbl}>Observação</label><input value={editTask.observacao || ''} onChange={e => setEditTask(p => ({ ...p, observacao: e.target.value }))} placeholder="Observações adicionais..." style={inp} /></div>
                          )}
                        </>
                      );
                    })()}

                    {/* Briefing que gerou a tarefa */}
                    {t.briefingAnswer && (
                      <div style={{ background: '#fffbeb', borderRadius: 8, padding: 12, borderLeft: '3px solid #f59e0b' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>RESPOSTA DO BRIEFING</div>
                        <div style={{ fontSize: 13, color: '#78350f' }}>{t.briefingAnswer}</div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
                    <button onClick={() => { setSelectedTask(null); setEditTask(null); }} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Fechar</button>
                    <button onClick={handleSalvar} disabled={savingTask} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#f0f3ff', color: '#667eea', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>Salvar Rascunho</button>
                    <button onClick={handleConcluir} disabled={savingTask || t.status === 'done' || t.status === 'completed'} style={{ flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none', background: t.status === 'done' || t.status === 'completed' ? '#d1fae5' : 'linear-gradient(135deg,#10b981,#059669)', color: t.status === 'done' || t.status === 'completed' ? '#10b981' : 'white', fontSize: 14, cursor: t.status === 'done' || t.status === 'completed' ? 'default' : 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
                      {savingTask ? 'Salvando...' : t.status === 'done' || t.status === 'completed' ? 'Concluída' : 'Marcar como Concluída'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── HISTÓRICO ── */}
          {activeTab === 'timeline' && (
            <div className="ps-card">
              <div className="ps-card-title">Histórico do Projeto</div>
              {project.timeline && project.timeline.length > 0 ? (
                <div className="ps-timeline">
                  {[...project.timeline].reverse().map((item, i) => (
                    <div key={i} className="ps-tl-item">
                      <div className="ps-tl-dot">•</div>
                      <div className="ps-tl-body">
                        <div className="ps-tl-desc">{item.description}</div>
                        <div className="ps-tl-meta">
                          {item.userName} · {formatDate(item.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ps-empty">Nenhum histórico disponível</div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

const styles = {
  loadingWrap: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#0D1B2A', fontFamily: 'sans-serif',
  },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: '3px solid rgba(0,229,196,0.15)',
    borderTopColor: '#00E5C4',
    animation: 'spin 0.8s linear infinite',
  },
  backBtnAlt: {
    marginTop: 16, padding: '8px 20px', borderRadius: 8,
    background: 'none', border: '1px solid #7BAFD4',
    color: '#7BAFD4', cursor: 'pointer', fontFamily: 'sans-serif',
  },
};
