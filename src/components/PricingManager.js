import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

const ESTADOS = [
  'Nacional', 'Acre', 'Alagoas', 'Amapa', 'Amazonas', 'Bahia', 'Ceara',
  'Distrito Federal', 'Espirito Santo', 'Goias', 'Maranhao', 'Mato Grosso',
  'Mato Grosso do Sul', 'Minas Gerais', 'Para', 'Paraiba', 'Parana',
  'Pernambuco', 'Piaui', 'Rio de Janeiro', 'Rio Grande do Norte',
  'Rio Grande do Sul', 'Rondonia', 'Roraima', 'Santa Catarina',
  'Sao Paulo - Capital', 'Sao Paulo - Interior', 'Sergipe', 'Tocantins',
];

// ── Form Operação / Entretenimento / Gastronomia (hora/homem) ─────────────
function OperacaoForm({ subService, editData, onSave, onCancel, color = '#059669' }) {
  const [form, setForm] = useState(editData || { estado: 'Sao Paulo - Capital', custoHora: '', observacoes: '', ativo: true });
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.custoHora) { alert('Informe o custo por hora'); return; }
    setSaving(true);
    try {
      const data = { ...form, tipo: subService.tipo || 'operacao', subServiceId: subService.id, serviceId: subService.parentId, subServiceName: subService.name, updatedAt: new Date() };
      if (editData?.id) await updateDoc(doc(db, 'servicePricing', editData.id), data);
      else await addDoc(collection(db, 'servicePricing'), { ...data, createdAt: new Date() });
      onSave();
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const inp = { padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none', background: 'white' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <div style={{ background: '#f0fff9', borderRadius: 10, border: `1px solid ${color}44`, padding: 18, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {editData ? 'Editar' : 'Nova'} tabela — {subService.name}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Estado / Regiao *</label>
          <select value={form.estado} onChange={e => setF('estado', e.target.value)} style={inp}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Custo por hora (R$) *</label>
          <input type="number" min="0" step="0.01" value={form.custoHora} onChange={e => setF('custoHora', e.target.value)} style={inp} placeholder="Ex: 35,00" />
        </div>
      </div>
      {form.custoHora > 0 && (
        <div style={{ background: `${color}12`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, border: `1px solid ${color}33` }}>
          <div style={{ fontSize: 11, color, marginBottom: 3 }}>Exemplo de calculo automatico pela IA:</div>
          <div style={{ fontSize: 13, color: '#1e293b' }}>
            R$ {parseFloat(form.custoHora).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h × 8h/dia × 3 dias × 2 pessoas = {' '}
            <strong style={{ color }}>R$ {(parseFloat(form.custoHora) * 8 * 3 * 2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Observacoes</label>
        <input value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} style={inp} placeholder="Ex: Inclui transporte, uniforme opcional..." />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" id="op-active" checked={form.ativo !== false} onChange={e => setF('ativo', e.target.checked)} style={{ width: 14, height: 14, accentColor: color }} />
        <label htmlFor="op-active" style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>Tabela ativa</label>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg,${color},${color}cc)`, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          {saving ? 'Salvando...' : 'Salvar tabela'}
        </button>
      </div>
    </div>
  );
}

// ── Form Estrutura (diária de equipamento) ────────────────────────────────
function EstruturaForm({ subService, editData, onSave, onCancel }) {
  const [form, setForm] = useState(editData || { estado: 'Sao Paulo - Capital', custoDiaria: '', custoInstalacao: '', observacoes: '', ativo: true });
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.custoDiaria) { alert('Informe o custo de diaria'); return; }
    setSaving(true);
    try {
      const data = { ...form, tipo: 'estrutura', subServiceId: subService.id, serviceId: subService.parentId, subServiceName: subService.name, updatedAt: new Date() };
      if (editData?.id) await updateDoc(doc(db, 'servicePricing', editData.id), data);
      else await addDoc(collection(db, 'servicePricing'), { ...data, createdAt: new Date() });
      onSave();
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const inp = { padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none', background: 'white' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <div style={{ background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', padding: 18, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0080FF', marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {editData ? 'Editar' : 'Nova'} tabela — {subService.name}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Estado / Regiao *</label>
          <select value={form.estado} onChange={e => setF('estado', e.target.value)} style={inp}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Custo de diaria (R$) *</label>
          <input type="number" min="0" step="0.01" value={form.custoDiaria} onChange={e => setF('custoDiaria', e.target.value)} style={inp} placeholder="Ex: 1200,00" />
        </div>
        <div>
          <label style={lbl}>Custo de instalacao (R$)</label>
          <input type="number" min="0" step="0.01" value={form.custoInstalacao} onChange={e => setF('custoInstalacao', e.target.value)} style={inp} placeholder="Ex: 500,00" />
        </div>
      </div>
      {parseFloat(form.custoDiaria) > 0 && (
        <div style={{ background: 'rgba(0,128,255,0.06)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, border: '1px solid rgba(0,128,255,0.2)' }}>
          <div style={{ fontSize: 11, color: '#0080FF', marginBottom: 3 }}>Exemplo de calculo automatico pela IA:</div>
          <div style={{ fontSize: 13, color: '#1e293b' }}>
            R$ {parseFloat(form.custoDiaria).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/dia × 3 dias × 2 unidades = {' '}
            <strong style={{ color: '#0080FF' }}>R$ {(parseFloat(form.custoDiaria) * 3 * 2 + (parseFloat(form.custoInstalacao) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            {form.custoInstalacao && parseFloat(form.custoInstalacao) > 0 ? ' (+ instalacao)' : ''}
          </div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Observacoes</label>
        <input value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} style={inp} placeholder="Ex: Inclui transporte, montagem separada..." />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" id="est-active" checked={form.ativo !== false} onChange={e => setF('ativo', e.target.checked)} style={{ width: 14, height: 14, accentColor: '#0080FF' }} />
        <label htmlFor="est-active" style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>Tabela ativa</label>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#0080FF,#0057B3)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          {saving ? 'Salvando...' : 'Salvar tabela'}
        </button>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PricingManager() {
  const [services, setServices]           = useState([]);
  const [pricing, setPricing]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [tipoAtivo, setTipoAtivo]         = useState('operacao');
  const [selectedService, setSelectedService] = useState(null);
  const [selectedSub, setSelectedSub]     = useState(null);
  const [showForm, setShowForm]           = useState(false);
  const [editingPrice, setEditingPrice]   = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [svcSnap, priceSnap] = await Promise.all([
        getDocs(query(collection(db, 'services'), orderBy('name'))),
        getDocs(collection(db, 'servicePricing')),
      ]);
      setServices(svcSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPricing(priceSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const TIPOS = [
    { id: 'operacao',       label: 'Operacao',      color: '#059669', desc: 'Custo por hora trabalhada' },
    { id: 'estrutura',      label: 'Estrutura',      color: '#0080FF', desc: 'Custo por diaria de equipamento' },
    { id: 'entretenimento', label: 'Entretenimento', color: '#FFA726', desc: 'Custo por hora trabalhada' },
    { id: 'gastronomia',    label: 'Gastronomia',    color: '#66BB6A', desc: 'Custo por hora / pessoa' },
  ];

  const tipoConfig = TIPOS.find(t => t.id === tipoAtivo);
  const tipoColor  = tipoConfig?.color || '#059669';

  const rootServices  = services.filter(s => !s.parentId && s.tipo === tipoAtivo && s.active !== false);
  const getSubServices = (parentId) => services.filter(s => s.parentId === parentId && s.active !== false);
  const getPricing     = (subId)    => pricing.filter(p => p.subServiceId === subId);

  const handleDeletePrice = async (id) => {
    if (!window.confirm('Excluir esta tabela?')) return;
    await deleteDoc(doc(db, 'servicePricing', id));
    loadAll();
  };

  const panelStyle  = { background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
  const panelHeader = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', flexShrink: 0 };
  const panelTitle  = { fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase' };
  const itemBase    = { padding: '10px 12px', borderRadius: 7, cursor: 'pointer', marginBottom: 4, fontSize: 13, transition: 'all 0.12s', border: '1px solid transparent' };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>Carregando...</div>;

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Tabela de Precos</h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Custos de referencia por servico e estado — usados pela IA para gerar pre-orcamentos</p>
      </div>

      {/* Tabs — 4 tipos */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TIPOS.map(t => (
          <button key={t.id} onClick={() => { setTipoAtivo(t.id); setSelectedService(null); setSelectedSub(null); setShowForm(false); }}
            style={{ padding: '10px 20px', borderRadius: 10, border: `1.5px solid ${tipoAtivo === t.id ? t.color : '#e2e8f0'}`, background: tipoAtivo === t.id ? `${t.color}12` : 'white', color: tipoAtivo === t.id ? t.color : '#64748b', fontSize: 13, fontWeight: tipoAtivo === t.id ? 700 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s' }}>
            {t.label}
            <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* 3 painéis */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 220px 1fr', gap: 14, minHeight: 500 }}>

        {/* Painel 1 — Serviços */}
        <div style={panelStyle}>
          <div style={panelHeader}><div style={panelTitle}>Servico</div></div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {rootServices.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Cadastre servicos em "Servicos" primeiro</div>
            ) : rootServices.map(s => {
              const sel = selectedService?.id === s.id;
              const hasSubs = getSubServices(s.id).length > 0;
              return (
                <div key={s.id} onClick={() => {
                  setSelectedService(s);
                  setShowForm(false);
                  setEditingPrice(null);
                  if (!hasSubs) {
                    setSelectedSub({ ...s, parentId: s.id });
                  } else {
                    setSelectedSub(null);
                  }
                }}
                  style={{ ...itemBase, background: sel ? `${tipoColor}12` : 'transparent', borderColor: sel ? tipoColor + '44' : 'transparent', color: sel ? tipoColor : '#1e293b', fontWeight: sel ? 600 : 400 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.name}</span>
                    {hasSubs
                      ? <span style={{ fontSize: 10, color: sel ? tipoColor : '#94a3b8' }}>{getSubServices(s.id).length} ›</span>
                      : <span style={{ fontSize: 10, color: sel ? tipoColor : '#94a3b8' }}>tabela ›</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel 2 — Sub-serviços */}
        <div style={{ ...panelStyle, opacity: selectedService && getSubServices(selectedService.id).length > 0 ? 1 : 0.3, pointerEvents: selectedService && getSubServices(selectedService.id).length > 0 ? 'auto' : 'none' }}>
          <div style={panelHeader}><div style={panelTitle}>Sub-servico</div></div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {!selectedService ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Selecione um servico</div>
            ) : getSubServices(selectedService.id).length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Tabela direta no servico</div>
            ) : getSubServices(selectedService.id).map(sub => {
              const sel = selectedSub?.id === sub.id;
              const count = getPricing(sub.id).length;
              return (
                <div key={sub.id} onClick={() => { setSelectedSub(sub); setShowForm(false); setEditingPrice(null); }}
                  style={{ ...itemBase, background: sel ? `${tipoColor}12` : 'transparent', borderColor: sel ? tipoColor + '44' : 'transparent', color: sel ? tipoColor : '#1e293b', fontWeight: sel ? 600 : 400 }}>
                  <div>{sub.name}</div>
                  {sub.description && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{sub.description}</div>}
                  {count > 0 && (
                    <span style={{ fontSize: 10, marginTop: 4, display: 'inline-block', padding: '1px 7px', borderRadius: 8, background: sel ? `${tipoColor}22` : '#f1f5f9', color: sel ? tipoColor : '#64748b' }}>
                      {count} tabela{count > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel 3 — Tabelas de preço */}
        <div style={{ ...panelStyle, overflow: 'auto' }}>
          <div style={{ ...panelHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={panelTitle}>
              Tabela de Preco — {tipoAtivo === 'estrutura' ? 'Diaria' : 'Hora/Homem'}
            </div>
            {selectedSub && !showForm && (
              <button onClick={() => { setShowForm(true); setEditingPrice(null); }}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: tipoColor, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                + Adicionar
              </button>
            )}
          </div>
          <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
            {!selectedSub ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Selecione um sub-servico</div>
            ) : (
              <>
                {showForm && (
                  tipoAtivo === 'estrutura' ? (
                    <EstruturaForm subService={selectedSub} editData={editingPrice}
                      onSave={() => { setShowForm(false); setEditingPrice(null); loadAll(); }}
                      onCancel={() => { setShowForm(false); setEditingPrice(null); }} />
                  ) : (
                    <OperacaoForm subService={selectedSub} editData={editingPrice} color={tipoColor}
                      onSave={() => { setShowForm(false); setEditingPrice(null); loadAll(); }}
                      onCancel={() => { setShowForm(false); setEditingPrice(null); }} />
                  )
                )}

                {getPricing(selectedSub.id).length === 0 && !showForm ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                    Nenhuma tabela para {selectedSub.name}
                  </div>
                ) : getPricing(selectedSub.id).map(p => {
                  if (editingPrice?.id === p.id && showForm) return null;
                  const isEstrutura = p.tipo === 'estrutura';
                  const cor = TIPOS.find(t => t.id === p.tipo)?.color || tipoColor;
                  const valor = isEstrutura ? parseFloat(p.custoDiaria) : parseFloat(p.custoHora);
                  const label = isEstrutura ? '/dia' : '/hora';

                  return (
                    <div key={p.id} style={{ background: p.ativo !== false ? 'white' : '#f8f8f8', borderRadius: 10, border: `1px solid ${p.ativo !== false ? '#e2e8f0' : '#f1f5f9'}`, padding: '14px 16px', marginBottom: 10, opacity: p.ativo !== false ? 1 : 0.6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{p.estado}</span>
                          {!p.ativo && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#f1f5f9', color: '#94a3b8' }}>Inativo</span>}
                        </div>
                        {valor > 0 && (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: cor }}>R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
                          </div>
                        )}
                      </div>
                      {isEstrutura && p.custoInstalacao && parseFloat(p.custoInstalacao) > 0 && (
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                          Instalacao: <strong>R$ {parseFloat(p.custoInstalacao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </div>
                      )}
                      {p.observacoes && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{p.observacoes}</div>}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditingPrice(p); setShowForm(true); }}
                          style={{ padding: '3px 9px', borderRadius: 5, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                        <button onClick={() => handleDeletePrice(p.id)}
                          style={{ padding: '3px 9px', borderRadius: 5, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Excluir</button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
