import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

const TIPOS = [
  { id: 'estrutura',      label: 'Estrutura',      color: '#0080FF' },
  { id: 'operacao',       label: 'Operacao',        color: '#00E5C4' },
  { id: 'entretenimento', label: 'Entretenimento',  color: '#FFA726' },
  { id: 'gastronomia',    label: 'Gastronomia',     color: '#66BB6A' },
];

const REGIOES = [
  'Nacional', 'São Paulo - Capital', 'São Paulo - Interior',
  'Rio de Janeiro', 'Minas Gerais', 'Paraná', 'Santa Catarina',
  'Rio Grande do Sul', 'Bahia', 'Goiás', 'Distrito Federal', 'Outros',
];

const UNIDADES = ['por hora', 'por dia', 'por evento', 'por pessoa', 'por m²', 'por unidade', 'fixo'];

// ── Formulário de serviço ─────────────────────────────────────────────────────
function ServicoForm({ supplierId, editData, onSave, onCancel, catalogoServ, pricing }) {
  const [form, setForm] = useState(editData || {
    tipoServico: '', serviceParentId: '', serviceParentName: '',
    serviceId: '', serviceName: '',
    preco: '', unidade: 'por hora',
    diasPreparo: '', diasMontagem: '', tempoExecucao: '', quantidade: '', regiao: 'São Paulo - Capital',
    observacoes: '', ativo: true,
  });
  const [saving, setSaving]         = useState(false);
  const [precoAlerta, setPrecoAlerta] = useState('');
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const tipoConfig  = TIPOS.find(t => t.id === form.tipoServico);
  const rootsDoTipo = catalogoServ.filter(s => !s.parentId && s.tipo === form.tipoServico && s.active !== false);
  const subsDoRoot  = form.serviceParentId
    ? catalogoServ.filter(s => s.parentId === form.serviceParentId && s.active !== false)
    : [];

  const getTetoPreco = (serviceId) => {
    const ref = pricing.find(p => p.subServiceId === serviceId);
    if (!ref) return null;
    const val = parseFloat(ref.custoHora || ref.custoDiaria || 0);
    const unidade = ref.custoHora ? 'hora' : 'dia';
    return val > 0 ? { val, unidade } : null;
  };

  const handlePrecoChange = (valor) => {
    setF('preco', valor);
    if (!form.serviceId || !valor) { setPrecoAlerta(''); return; }
    const teto = getTetoPreco(form.serviceId);
    if (teto && parseFloat(valor) > teto.val) {
      setPrecoAlerta(`Valor acima do teto de referência: R$ ${teto.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/${teto.unidade}. Ajuste para no máximo esse valor.`);
    } else {
      setPrecoAlerta('');
    }
  };

  const handleSave = async () => {
    if (!form.tipoServico)   { alert('Selecione a área'); return; }
    if (!form.serviceId)     { alert('Selecione o sub-serviço'); return; }
    if (!form.preco)         { alert('Informe o preço base'); return; }
    if (precoAlerta)         { alert('Ajuste o preço antes de salvar.\n' + precoAlerta); return; }
    setSaving(true);
    try {
      const data = {
        supplierId,
        tipoServico:       form.tipoServico,
        diasPreparo:       form.diasPreparo ? parseInt(form.diasPreparo) : 0,
        diasMontagem:      form.diasMontagem ? parseInt(form.diasMontagem) : 0,
        serviceParentId:   form.serviceParentId,
        serviceParentName: form.serviceParentName,
        serviceId:         form.serviceId,
        serviceName:       form.serviceName,
        preco:             form.preco,
        unidade:           form.unidade,
        tempoExecucao:     form.tempoExecucao,
        quantidade:        form.quantidade,
        regiao:            form.regiao,
        observacoes:       form.observacoes,
        ativo:             form.ativo,
        updatedAt:         new Date(),
      };
      if (editData?.id) {
        await updateDoc(doc(db, 'supplierServices', editData.id), data);
      } else {
        await addDoc(collection(db, 'supplierServices'), { ...data, createdAt: new Date() });
      }
      onSave();
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const inp = {
    padding: '9px 12px', borderRadius: 7,
    border: '1px solid rgba(0,180,255,0.2)', fontSize: 13,
    fontFamily: 'Outfit, sans-serif', width: '100%',
    boxSizing: 'border-box', outline: 'none',
    background: 'rgba(10,22,38,0.6)', color: '#E8F4FF',
  };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#7BAFD4', display: 'block', marginBottom: 4 };
  const teto = form.serviceId ? getTetoPreco(form.serviceId) : null;

  return (
    <div style={{ background: 'rgba(0,128,255,0.06)', borderRadius: 12, border: '1px solid rgba(0,180,255,0.15)', padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: tipoConfig?.color || '#00E5C4', marginBottom: 16, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {editData ? 'Editar serviço' : 'Novo serviço'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* 1. Tipo */}
        <div>
          <label style={lbl}>Área *</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIPOS.map(t => (
              <button key={t.id} type="button"
                onClick={() => setForm(p => ({ ...p, tipoServico: t.id, serviceParentId: '', serviceParentName: '', serviceId: '', serviceName: '', preco: '' }))}
                style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${form.tipoServico === t.id ? t.color : 'rgba(0,180,255,0.2)'}`, background: form.tipoServico === t.id ? `${t.color}22` : 'none', color: form.tipoServico === t.id ? t.color : '#7BAFD4', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Categoria (serviço pai) */}
        {form.tipoServico && (
          <div>
            <label style={lbl}>Categoria *</label>
            <select value={form.serviceParentId}
              onChange={e => {
                const s = catalogoServ.find(s => s.id === e.target.value);
                setForm(p => ({ ...p, serviceParentId: e.target.value, serviceParentName: s?.name || '', serviceId: '', serviceName: '', preco: '' }));
                setPrecoAlerta('');
              }}
              style={{ ...inp, background: 'rgba(10,22,38,0.8)' }}>
              <option value="">Selecione a categoria...</option>
              {rootsDoTipo.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {rootsDoTipo.length === 0 && (
              <p style={{ fontSize: 11, color: '#FFA726', marginTop: 4 }}>Nenhum serviço desta área no catálogo. Peça ao admin para cadastrar em Serviços.</p>
            )}
          </div>
        )}

        {/* 3. Sub-serviço */}
        {form.serviceParentId && (
          <div>
            <label style={lbl}>Sub-serviço *</label>
            {subsDoRoot.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(123,175,212,0.5)', padding: '8px 0' }}>Nenhum sub-serviço nesta categoria.</p>
            ) : (
              <select value={form.serviceId}
                onChange={e => {
                  const s = catalogoServ.find(s => s.id === e.target.value);
                  setForm(p => ({ ...p, serviceId: e.target.value, serviceName: s?.name || '', preco: '' }));
                  setPrecoAlerta('');
                }}
                style={{ ...inp, background: 'rgba(10,22,38,0.8)' }}>
                <option value="">Selecione o sub-serviço...</option>
                {subsDoRoot.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        )}

        {/* 4. Preço e campos complementares */}
        {form.serviceId && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Preço base (R$) *</label>
                <input type="number" min="0" step="0.01"
                  value={form.preco}
                  onChange={e => handlePrecoChange(e.target.value)}
                  style={{ ...inp, borderColor: precoAlerta ? '#ef4444' : 'rgba(0,180,255,0.2)' }}
                  placeholder="0,00" />
                <p style={{ fontSize: 10, color: 'rgba(123,175,212,0.45)', marginTop: 4, lineHeight: 1.5 }}>
                  O valor deve incluir transporte, equipe, alimentação e montagem quando aplicável.
                </p>
                {teto && !precoAlerta && (
                  <p style={{ fontSize: 11, color: tipoConfig?.color || '#00E5C4', marginTop: 2 }}>
                    Teto de referência: R$ {teto.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/{teto.unidade}
                  </p>
                )}
                {precoAlerta && (
                  <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4, lineHeight: 1.5 }}>⚠ {precoAlerta}</p>
                )}
              </div>
              <div>
                <label style={lbl}>Unidade de cobrança</label>
                <select value={form.unidade} onChange={e => setF('unidade', e.target.value)}
                  style={{ ...inp, background: 'rgba(10,22,38,0.8)' }}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Dias de preparo *</label>
                <input type="number" min="0" step="1"
                  value={form.diasPreparo} onChange={e => setF('diasPreparo', e.target.value)} style={inp} placeholder="Ex: 15" />
                <p style={{ fontSize: 10, color: 'rgba(123,175,212,0.45)', marginTop: 4 }}>Produção antes do evento</p>
              </div>
              <div>
                <label style={lbl}>Dias de montagem</label>
                <input type="number" min="0" step="1"
                  value={form.diasMontagem} onChange={e => setF('diasMontagem', e.target.value)} style={inp} placeholder="Ex: 2" />
                <p style={{ fontSize: 10, color: 'rgba(123,175,212,0.45)', marginTop: 4 }}>Montagem no local</p>
              </div>
              <div>
                <label style={lbl}>Tempo de execução</label>
                <input value={form.tempoExecucao} onChange={e => setF('tempoExecucao', e.target.value)} style={inp} placeholder="Ex: 2 dias" />
              </div>
              <div>
                <label style={lbl}>Quantidade disponível</label>
                <input value={form.quantidade} onChange={e => setF('quantidade', e.target.value)} style={inp} placeholder="Ex: 3 unidades" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Região de atendimento</label>
                <select value={form.regiao} onChange={e => setF('regiao', e.target.value)}
                  style={{ ...inp, background: 'rgba(10,22,38,0.8)' }}>
                  {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                <input type="checkbox" id="svc-ativo" checked={form.ativo !== false} onChange={e => setF('ativo', e.target.checked)} style={{ width: 15, height: 15, accentColor: '#00E5C4' }} />
                <label htmlFor="svc-ativo" style={{ fontSize: 13, color: '#7BAFD4', cursor: 'pointer' }}>Serviço ativo</label>
              </div>
            </div>

            <div>
              <label style={lbl}>Observações</label>
              <input value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} style={inp} placeholder="Informações adicionais, diferenciais..." />
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onCancel}
          style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving || !!precoAlerta}
          style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: (saving || precoAlerta) ? 'rgba(255,255,255,0.08)' : `linear-gradient(135deg,${tipoConfig?.color || '#00E5C4'},${tipoConfig?.color || '#00E5C4'}99)`, color: (saving || precoAlerta) ? '#7BAFD4' : 'white', fontSize: 13, fontWeight: 600, cursor: (saving || precoAlerta) ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          {saving ? 'Salvando...' : 'Salvar serviço'}
        </button>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function FornecedorServicos({ userData, onServicosAdicionados }) {
  const supplierId  = userData?.supplierId || userData?.id;
  const [servicos, setServicos]   = useState([]);
  const [catalogo, setCatalogo]   = useState([]);
  const [pricing, setPricing]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tipoAtivo, setTipoAtivo] = useState('operacao');
  const [showForm, setShowForm]   = useState(false);
  const [editando, setEditando]   = useState(null);

  useEffect(() => { loadAll(); }, [supplierId]);

  const loadAll = async () => {
    if (!supplierId) return;
    try {
      const [svcSnap, catSnap, priceSnap] = await Promise.all([
        getDocs(query(collection(db, 'supplierServices'), where('supplierId', '==', supplierId))),
        getDocs(collection(db, 'services')),
        getDocs(collection(db, 'servicePricing')),
      ]);
      const lista = svcSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setServicos(lista);
      setCatalogo(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPricing(priceSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (lista.length > 0 && onServicosAdicionados) onServicosAdicionados();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    await deleteDoc(doc(db, 'supplierServices', id));
    loadAll();
  };

  const toggleAtivo = async (s) => {
    await updateDoc(doc(db, 'supplierServices', s.id), { ativo: !s.ativo });
    loadAll();
  };

  const tipoConfig    = TIPOS.find(t => t.id === tipoAtivo);
  const totalServicos = servicos.length;
  const servicosDoTipo = servicos.filter(s => s.tipoServico === tipoAtivo);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#7BAFD4', fontFamily: 'Outfit, sans-serif' }}>Carregando...</div>
  );

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500, color: '#E8F4FF', margin: 0 }}>Meus Serviços</h2>
          <p style={{ fontSize: 13, color: '#7BAFD4', marginTop: 2 }}>
            {totalServicos === 0 ? 'Nenhum serviço cadastrado ainda' : `${totalServicos} serviço${totalServicos > 1 ? 's' : ''} cadastrado${totalServicos > 1 ? 's' : ''}`}
          </p>
        </div>
        {!showForm && !editando && (
          <button onClick={() => setShowForm(true)}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            + Adicionar Serviço
          </button>
        )}
      </div>

      {/* Form */}
      {(showForm || editando) && (
        <ServicoForm
          supplierId={supplierId}
          editData={editando}
          catalogoServ={catalogo}
          pricing={pricing}
          onSave={() => { setShowForm(false); setEditando(null); loadAll(); }}
          onCancel={() => { setShowForm(false); setEditando(null); }}
        />
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TIPOS.map(t => {
          const count = servicos.filter(s => s.tipoServico === t.id).length;
          const ativa = tipoAtivo === t.id;
          return (
            <button key={t.id} onClick={() => setTipoAtivo(t.id)}
              style={{ padding: '8px 16px', borderRadius: 20, border: `1px solid ${ativa ? t.color : 'rgba(0,180,255,0.15)'}`, background: ativa ? `${t.color}22` : 'rgba(255,255,255,0.03)', color: ativa ? t.color : '#7BAFD4', fontSize: 13, fontWeight: ativa ? 600 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.label}
              {count > 0 && (
                <span style={{ background: ativa ? t.color : 'rgba(123,175,212,0.2)', color: ativa ? 'white' : '#7BAFD4', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {servicosDoTipo.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(123,175,212,0.4)', fontSize: 13 }}>
            Nenhum serviço de {tipoConfig?.label} cadastrado ainda
          </div>
        ) : servicosDoTipo.map(s => (
          <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: `1px solid ${s.ativo !== false ? 'rgba(0,180,255,0.1)' : 'rgba(0,180,255,0.04)'}`, padding: '14px 18px', opacity: s.ativo !== false ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: tipoConfig?.color || '#00E5C4', marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 }}>
                  {s.serviceParentName} › {s.serviceName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#E8F4FF' }}>{s.serviceName}</span>
                  {!s.ativo && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Inativo</span>}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {s.preco && <span style={{ fontSize: 12, color: tipoConfig?.color || '#00E5C4', fontWeight: 600 }}>R$ {parseFloat(s.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {s.unidade}</span>}
                  {s.tempoExecucao && <span style={{ fontSize: 11, color: '#7BAFD4' }}>{s.tempoExecucao}</span>}
                  {s.quantidade && <span style={{ fontSize: 11, color: '#7BAFD4' }}>{s.quantidade}</span>}
                  {s.regiao && <span style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)' }}>{s.regiao}</span>}
                </div>
                {s.observacoes && <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)', marginTop: 4 }}>{s.observacoes}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => { setEditando(s); setShowForm(false); }}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                <button onClick={() => toggleAtivo(s)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${s.ativo !== false ? 'rgba(255,167,38,0.3)' : 'rgba(0,229,196,0.3)'}`, background: 'none', color: s.ativo !== false ? '#FFA726' : '#00E5C4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  {s.ativo !== false ? 'Pausar' : 'Ativar'}
                </button>
                <button onClick={() => handleDelete(s.id, s.serviceName)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Excluir</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
