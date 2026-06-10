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

const UNIDADES = [
  { id: 'por_hora',    label: 'Por hora',    ex: 'Recepcionista, DJ, Fotógrafo' },
  { id: 'por_dia',     label: 'Por dia',     ex: 'LED, Estrutura, Equipamentos' },
  { id: 'por_evento',  label: 'Por evento',  ex: 'Serviços com valor fixo' },
  { id: 'por_pessoa',  label: 'Por pessoa',  ex: 'Buffet, Coffee break' },
  { id: 'por_m2',      label: 'Por m²',      ex: 'Estandes, áreas' },
];

// Calcula exemplo de cobrança conforme unidade
const calcExemplo = (precoBase, unidade) => {
  const v = parseFloat(precoBase) || 0;
  if (v <= 0) return null;
  switch (unidade) {
    case 'por_hora':   return { formula: `R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}/h × 8h/dia × 2 dias × 2 pessoas`, total: v * 8 * 2 * 2 };
    case 'por_dia':    return { formula: `R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}/dia × 3 dias × 1 unidade`, total: v * 3 * 1 };
    case 'por_evento': return { formula: `R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}/evento × 1 evento`, total: v };
    case 'por_pessoa': return { formula: `R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}/pessoa × 60 pessoas`, total: v * 60 };
    case 'por_m2':     return { formula: `R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}/m² × 9 m²`, total: v * 9 };
    default: return null;
  }
};

// ── Formulário unificado ──────────────────────────────────────────────────────
function PriceForm({ subService, editData, onSave, onCancel, color = '#059669' }) {
  const [form, setForm] = useState(editData || {
    estado: 'Sao Paulo - Capital',
    precoBase: '',
    unidade: 'por_hora',
    observacoes: '',
    ativo: true,
  });
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.precoBase) { alert('Informe o preço base'); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        precoBase: parseFloat(form.precoBase),
        tipo: subService.tipo || 'operacao',
        subServiceId: subService.id,
        serviceId: subService.parentId,
        subServiceName: subService.name,
        updatedAt: new Date(),
      };
      if (editData?.id) await updateDoc(doc(db, 'servicePricing', editData.id), data);
      else await addDoc(collection(db, 'servicePricing'), { ...data, createdAt: new Date() });
      onSave();
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const inp = { padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none', background: 'white' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };
  const exemplo = calcExemplo(form.precoBase, form.unidade);
  const unidadeLabel = UNIDADES.find(u => u.id === form.unidade)?.label || '';

  return (
    <div style={{ background: `${color}0d`, borderRadius: 10, border: `1px solid ${color}44`, padding: 18, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {editData ? 'Editar' : 'Nova'} tabela — {subService.name}
      </div>

      {/* Estado + Preço + Unidade */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Estado / Região *</label>
          <select value={form.estado} onChange={e => setF('estado', e.target.value)} style={inp}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Preço base (R$) *</label>
          <input type="number" min="0" step="0.01" value={form.precoBase}
            onChange={e => setF('precoBase', e.target.value)}
            style={inp} placeholder="Ex: 50,00" />
        </div>
        <div>
          <label style={lbl}>Unidade de cobrança</label>
          <select value={form.unidade} onChange={e => setF('unidade', e.target.value)} style={inp}>
            {UNIDADES.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
            {UNIDADES.find(u => u.id === form.unidade)?.ex}
          </p>
        </div>
      </div>

      {/* Exemplo de cálculo */}
      {exemplo && (
        <div style={{ background: `${color}12`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, border: `1px solid ${color}33` }}>
          <div style={{ fontSize: 11, color, marginBottom: 3 }}>Exemplo de cálculo automático:</div>
          <div style={{ fontSize: 13, color: '#1e293b' }}>
            {exemplo.formula} = {' '}
            <strong style={{ color }}>R$ {exemplo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
            O sistema multiplica automaticamente pela quantidade de {unidadeLabel.replace('Por ', '').toLowerCase()} informada no briefing
          </div>
        </div>
      )}

      {/* Observações + Ativo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <label style={lbl}>Observações</label>
          <input value={form.observacoes} onChange={e => setF('observacoes', e.target.value)}
            style={inp} placeholder="Ex: Inclui transporte, uniforme opcional..." />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
          <input type="checkbox" id="price-ativo" checked={form.ativo !== false}
            onChange={e => setF('ativo', e.target.checked)}
            style={{ width: 14, height: 14, accentColor: color }} />
          <label htmlFor="price-ativo" style={{ fontSize: 12, color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>Tabela ativa</label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg,${color},${color}cc)`, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
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
    { id: 'operacao',       label: 'Operação',       color: '#059669' },
    { id: 'estrutura',      label: 'Estrutura',       color: '#0080FF' },
    { id: 'entretenimento', label: 'Entretenimento',  color: '#FFA726' },
    { id: 'gastronomia',    label: 'Gastronomia',     color: '#66BB6A' },
  ];

  const tipoConfig = TIPOS.find(t => t.id === tipoAtivo);
  const tipoColor  = tipoConfig?.color || '#059669';

  const rootServices   = services.filter(s => !s.parentId && s.tipo === tipoAtivo && s.active !== false);
  const getSubServices = (parentId) => services.filter(s => s.parentId === parentId && s.active !== false);
  const getPricing     = (subId) => pricing.filter(p => p.subServiceId === subId);

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
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Tabela de Preços</h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
          Preços de referência por serviço e região — o sistema multiplica automaticamente pela quantidade informada no briefing
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TIPOS.map(t => (
          <button key={t.id} onClick={() => { setTipoAtivo(t.id); setSelectedService(null); setSelectedSub(null); setShowForm(false); }}
            style={{ padding: '10px 20px', borderRadius: 10, border: `1.5px solid ${tipoAtivo === t.id ? t.color : '#e2e8f0'}`, background: tipoAtivo === t.id ? `${t.color}12` : 'white', color: tipoAtivo === t.id ? t.color : '#64748b', fontSize: 13, fontWeight: tipoAtivo === t.id ? 700 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 3 painéis */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 220px 1fr', gap: 14, minHeight: 500 }}>

        {/* Painel 1 — Serviços */}
        <div style={panelStyle}>
          <div style={panelHeader}><div style={panelTitle}>Serviço</div></div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {rootServices.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Cadastre serviços em "Serviços" primeiro</div>
            ) : rootServices.map(s => {
              const sel = selectedService?.id === s.id;
              const hasSubs = getSubServices(s.id).length > 0;
              return (
                <div key={s.id} onClick={() => {
                  setSelectedService(s);
                  setShowForm(false);
                  setEditingPrice(null);
                  if (!hasSubs) setSelectedSub({ ...s, parentId: s.id });
                  else setSelectedSub(null);
                }}
                  style={{ ...itemBase, background: sel ? `${tipoColor}12` : 'transparent', borderColor: sel ? tipoColor + '44' : 'transparent', color: sel ? tipoColor : '#1e293b', fontWeight: sel ? 600 : 400 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.name}</span>
                    <span style={{ fontSize: 10, color: sel ? tipoColor : '#94a3b8' }}>{hasSubs ? `${getSubServices(s.id).length} ›` : 'tabela ›'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel 2 — Sub-serviços */}
        <div style={{ ...panelStyle, opacity: selectedService && getSubServices(selectedService.id).length > 0 ? 1 : 0.3, pointerEvents: selectedService && getSubServices(selectedService.id).length > 0 ? 'auto' : 'none' }}>
          <div style={panelHeader}><div style={panelTitle}>Sub-serviço</div></div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {!selectedService ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Selecione um serviço</div>
            ) : getSubServices(selectedService.id).length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Tabela direta no serviço</div>
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
            <div style={panelTitle}>Tabela de Preço</div>
            {selectedSub && !showForm && (
              <button onClick={() => { setShowForm(true); setEditingPrice(null); }}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: tipoColor, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                + Adicionar
              </button>
            )}
          </div>
          <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
            {!selectedSub ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Selecione um sub-serviço</div>
            ) : (
              <>
                {showForm && (
                  <PriceForm
                    subService={selectedSub}
                    editData={editingPrice}
                    color={tipoColor}
                    onSave={() => { setShowForm(false); setEditingPrice(null); loadAll(); }}
                    onCancel={() => { setShowForm(false); setEditingPrice(null); }}
                  />
                )}

                {getPricing(selectedSub.id).length === 0 && !showForm ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                    Nenhuma tabela para {selectedSub.name}
                  </div>
                ) : getPricing(selectedSub.id).map(p => {
                  if (editingPrice?.id === p.id && showForm) return null;
                  const cor = TIPOS.find(t => t.id === p.tipo)?.color || tipoColor;
                  const unidadeLabel = UNIDADES.find(u => u.id === p.unidade)?.label;
                  // Compatibilidade com dados antigos (custoHora / custoDiaria)
                  const precoExibir = p.precoBase || p.custoHora || p.custoDiaria;
                  const unidadeExibir = unidadeLabel || (p.custoHora ? 'por hora' : p.custoDiaria ? 'por dia' : '');

                  return (
                    <div key={p.id} style={{ background: p.ativo !== false ? 'white' : '#f8f8f8', borderRadius: 10, border: `1px solid ${p.ativo !== false ? '#e2e8f0' : '#f1f5f9'}`, padding: '14px 16px', marginBottom: 10, opacity: p.ativo !== false ? 1 : 0.6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{p.estado}</span>
                          {!p.ativo && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#f1f5f9', color: '#94a3b8' }}>Inativo</span>}
                          {unidadeExibir && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{unidadeExibir}</div>
                          )}
                        </div>
                        {precoExibir > 0 && (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: cor }}>
                              R$ {parseFloat(precoExibir).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            {unidadeExibir && <div style={{ fontSize: 10, color: '#94a3b8' }}>{unidadeExibir}</div>}
                          </div>
                        )}
                      </div>
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
