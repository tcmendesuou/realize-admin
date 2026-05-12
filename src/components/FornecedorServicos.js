import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
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

export default function FornecedorServicos({ userData, onServicosAdicionados }) {
  const supplierId  = userData?.supplierId || userData?.id;
  const [servicos, setServicos]     = useState([]);
  const [catalogo, setCatalogo]     = useState([]);
  const [pricing, setPricing]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tipoAtivo, setTipoAtivo]   = useState('operacao');
  const [showCascata, setShowCascata] = useState(false);
  const [editando, setEditando]     = useState(null);

  // Cascata
  const [selTipo, setSelTipo]         = useState(null);
  const [selCategoria, setSelCategoria] = useState(null);
  const [selSub, setSelSub]           = useState(null);

  // Form
  const [form, setForm] = useState({
    preco: '', unidade: 'por hora', diasPreparo: '', diasMontagem: '',
    tempoExecucao: '', quantidade: '', regiao: 'São Paulo - Capital',
    observacoes: '', ativo: true,
  });
  const [precoAlerta, setPrecoAlerta] = useState('');
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Opções em memória (salvas junto com o serviço)
  const [opcoes, setOpcoes]               = useState([]); // opções já salvas no Firestore
  const [opcoesMemoria, setOpcoesMemoria] = useState([]); // opções novas ainda não salvas
  const [opcaoForm, setOpcaoForm]         = useState({ nome: '', caracteristica: '', observacoes: '', valor: '', unidade: 'por hora' });
  const [editandoOpcaoId, setEditandoOpcaoId] = useState(null); // id temporário para edição em memória
  const [showOpcaoForm, setShowOpcaoForm] = useState(false);
  const setO = (k, v) => setOpcaoForm(p => ({ ...p, [k]: v }));

  const resetOpcaoForm = () => {
    setOpcaoForm({ nome: '', caracteristica: '', observacoes: '', valor: '', unidade: 'por hora' });
    setEditandoOpcaoId(null);
    setShowOpcaoForm(false);
  };

  const loadOpcoes = async (servicoId) => {
    if (!servicoId) { setOpcoes([]); return; }
    try {
      const snap = await getDocs(collection(db, 'supplierServices', servicoId, 'opcoes'));
      setOpcoes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('Erro ao carregar opções:', e); }
  };

  const handleAddOpcaoMemoria = () => {
    if (!opcaoForm.nome) { alert('Informe o nome da opção'); return; }
    if (!opcaoForm.valor) { alert('Informe o valor da opção'); return; }
    if (editandoOpcaoId) {
      // Edita opção salva no Firestore (editando serviço existente)
      if (editando?.id) {
        updateDoc(doc(db, 'supplierServices', editando.id, 'opcoes', editandoOpcaoId), {
          ...opcaoForm, updatedAt: serverTimestamp(),
        }).then(() => loadOpcoes(editando.id));
      } else {
        // Edita opção em memória
        setOpcoesMemoria(prev => prev.map(o => o._tempId === editandoOpcaoId ? { ...o, ...opcaoForm } : o));
      }
    } else {
      if (editando?.id) {
        // Serviço já existe → salva direto na sub-coleção
        addDoc(collection(db, 'supplierServices', editando.id, 'opcoes'), {
          ...opcaoForm, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        }).then(() => loadOpcoes(editando.id));
      } else {
        // Serviço novo → guarda em memória
        setOpcoesMemoria(prev => [...prev, { ...opcaoForm, _tempId: Date.now().toString() }]);
      }
    }
    resetOpcaoForm();
  };

  const handleEditarOpcao = (op) => {
    setOpcaoForm({ nome: op.nome, caracteristica: op.caracteristica || '', observacoes: op.observacoes || '', valor: op.valor, unidade: op.unidade || 'por hora' });
    setEditandoOpcaoId(op.id || op._tempId);
    setShowOpcaoForm(true);
  };

  const handleExcluirOpcao = async (op) => {
    if (!window.confirm('Excluir esta opção?')) return;
    if (op.id && editando?.id) {
      await deleteDoc(doc(db, 'supplierServices', editando.id, 'opcoes', op.id));
      loadOpcoes(editando.id);
    } else {
      setOpcoesMemoria(prev => prev.filter(o => o._tempId !== op._tempId));
    }
  };

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

  // ── Helpers cascata ──────────────────────────────────────────────────────────
  const tipoConfig    = TIPOS.find(t => t.id === tipoAtivo);
  const categoriasDoTipo = selTipo ? catalogo.filter(s => !s.parentId && s.tipo === selTipo && s.active !== false) : [];
  const subsDoaCat   = selCategoria ? catalogo.filter(s => s.parentId === selCategoria && s.active !== false) : [];

  const jaTemServico = (subId) => servicos.some(s => s.serviceId === subId);

  const getTetoPreco = (serviceId) => {
    const ref = pricing.find(p => p.subServiceId === serviceId);
    if (!ref) return null;
    const val = parseFloat(ref.custoHora || ref.custoDiaria || 0);
    const unidade = ref.custoHora ? 'hora' : 'dia';
    return val > 0 ? { val, unidade } : null;
  };

  const handlePrecoChange = (valor) => {
    setF('preco', valor);
    if (!selSub || !valor) { setPrecoAlerta(''); return; }
    const teto = getTetoPreco(selSub.id);
    if (teto && parseFloat(valor) > teto.val) {
      setPrecoAlerta(`Acima do teto: R$ ${teto.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/${teto.unidade}`);
    } else { setPrecoAlerta(''); }
  };

  const handleSelectSub = (sub) => {
    setSelSub(sub);
    const existing = servicos.find(s => s.serviceId === sub.id);
    if (existing) {
      setForm({
        preco: existing.preco || '', unidade: existing.unidade || 'por hora',
        diasPreparo: existing.diasPreparo || '', diasMontagem: existing.diasMontagem || '',
        tempoExecucao: existing.tempoExecucao || '', quantidade: existing.quantidade || '',
        regiao: existing.regiao || 'São Paulo - Capital', observacoes: existing.observacoes || '',
        ativo: existing.ativo !== false,
      });
      setEditando(existing);
      loadOpcoes(existing.id);
    } else {
      setForm({ preco: '', unidade: 'por hora', diasPreparo: '', diasMontagem: '', tempoExecucao: '', quantidade: '', regiao: 'São Paulo - Capital', observacoes: '', ativo: true });
      setEditando(null);
      setOpcoes([]);
    }
    setOpcoesMemoria([]);
    resetOpcaoForm();
    setPrecoAlerta('');
  };

  const handleSalvar = async () => {
    if (!selSub)   { alert('Selecione um sub-serviço'); return; }
    if (!form.preco) { alert('Informe o preço base'); return; }
    if (precoAlerta) { alert('Ajuste o preço antes de salvar.\n' + precoAlerta); return; }
    setSaving(true);
    try {
      const catObj = catalogo.find(c => c.id === selCategoria);
      const data = {
        supplierId,
        tipoServico:       selTipo,
        serviceParentId:   selCategoria,
        serviceParentName: catObj?.name || '',
        serviceId:         selSub.id,
        serviceName:       selSub.name,
        preco:             form.preco,
        unidade:           form.unidade,
        diasPreparo:       form.diasPreparo ? parseInt(form.diasPreparo) : 0,
        diasMontagem:      form.diasMontagem ? parseInt(form.diasMontagem) : 0,
        tempoExecucao:     form.tempoExecucao,
        quantidade:        form.quantidade,
        regiao:            form.regiao,
        observacoes:       form.observacoes,
        ativo:             form.ativo,
        updatedAt:         new Date(),
      };

      let servicoId = editando?.id;
      if (servicoId) {
        await updateDoc(doc(db, 'supplierServices', servicoId), data);
      } else {
        const ref = await addDoc(collection(db, 'supplierServices'), { ...data, createdAt: new Date() });
        servicoId = ref.id;
      }

      // Salva opções em memória na sub-coleção
      if (opcoesMemoria.length > 0) {
        await Promise.all(opcoesMemoria.map(op => {
          const { _tempId, ...opData } = op;
          return addDoc(collection(db, 'supplierServices', servicoId, 'opcoes'), {
            ...opData, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }));
      }

      await loadAll();
      setSelSub(null);
      setForm({ preco: '', unidade: 'por hora', diasPreparo: '', diasMontagem: '', tempoExecucao: '', quantidade: '', regiao: 'São Paulo - Capital', observacoes: '', ativo: true });
      setEditando(null);
      setOpcoes([]);
      setOpcoesMemoria([]);
      resetOpcaoForm();
      setPrecoAlerta('');
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
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

  const handleEditarExistente = (s) => {
    setSelTipo(s.tipoServico);
    setSelCategoria(s.serviceParentId);
    const sub = catalogo.find(c => c.id === s.serviceId);
    setSelSub(sub || { id: s.serviceId, name: s.serviceName });
    setForm({
      preco: s.preco || '', unidade: s.unidade || 'por hora',
      diasPreparo: s.diasPreparo || '', diasMontagem: s.diasMontagem || '',
      tempoExecucao: s.tempoExecucao || '', quantidade: s.quantidade || '',
      regiao: s.regiao || 'São Paulo - Capital', observacoes: s.observacoes || '',
      ativo: s.ativo !== false,
    });
    setEditando(s);
    loadOpcoes(s.id);
    setOpcoesMemoria([]);
    resetOpcaoForm();
    setPrecoAlerta('');
    setShowCascata(true);
  };

  // ── Estilos ──────────────────────────────────────────────────────────────────
  const inp = { padding: '8px 12px', borderRadius: 7, border: '1px solid rgba(0,180,255,0.2)', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none', background: 'rgba(10,22,38,0.6)', color: '#E8F4FF' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#7BAFD4', display: 'block', marginBottom: 4 };
  const teto = selSub ? getTetoPreco(selSub.id) : null;
  const servicosDoTipo = servicos.filter(s => s.tipoServico === tipoAtivo);
  const todasOpcoes = [...opcoes, ...opcoesMemoria];

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#7BAFD4', fontFamily: 'Outfit, sans-serif' }}>Carregando...</div>;

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500, color: '#E8F4FF', margin: 0 }}>Meus Serviços</h2>
          <p style={{ fontSize: 13, color: '#7BAFD4', marginTop: 2 }}>
            {servicos.length === 0 ? 'Nenhum serviço cadastrado ainda' : `${servicos.length} serviço${servicos.length > 1 ? 's' : ''} cadastrado${servicos.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => { setShowCascata(true); setSelTipo(null); setSelCategoria(null); setSelSub(null); setEditando(null); setForm({ preco: '', unidade: 'por hora', diasPreparo: '', diasMontagem: '', tempoExecucao: '', quantidade: '', regiao: 'São Paulo - Capital', observacoes: '', ativo: true }); }}
          style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          + Adicionar Serviço
        </button>
      </div>

      {/* Modal cascata */}
      {showCascata && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowCascata(false)}>
          <div style={{ background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 16, width: '100%', maxWidth: 1200, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header modal */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(0,180,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#E8F4FF' }}>
                {editando ? 'Editar serviço' : 'Adicionar serviço'}
              </div>
              <button onClick={() => setShowCascata(false)} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Corpo — cascata + formulário */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Col 1 — Tipo */}
              <div style={{ width: 160, flexShrink: 0, borderRight: '1px solid rgba(0,180,255,0.08)', overflowY: 'auto', padding: '12px 8px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#7BAFD4', letterSpacing: 1, textTransform: 'uppercase', padding: '4px 8px', marginBottom: 6 }}>Área</div>
                {TIPOS.map(t => (
                  <div key={t.id} onClick={() => { setSelTipo(t.id); setSelCategoria(null); setSelSub(null); }}
                    style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: selTipo === t.id ? `${t.color}22` : 'none', border: `1px solid ${selTipo === t.id ? t.color : 'transparent'}`, transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 13, fontWeight: selTipo === t.id ? 600 : 400, color: selTipo === t.id ? t.color : '#7BAFD4' }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(123,175,212,0.4)', marginTop: 1 }}>
                      {servicos.filter(s => s.tipoServico === t.id).length} cadastrado(s)
                    </div>
                  </div>
                ))}
              </div>

              {/* Col 2 — Categoria */}
              <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid rgba(0,180,255,0.08)', overflowY: 'auto', padding: '12px 8px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#7BAFD4', letterSpacing: 1, textTransform: 'uppercase', padding: '4px 8px', marginBottom: 6 }}>Categoria</div>
                {!selTipo ? (
                  <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.3)', padding: '8px 12px' }}>Selecione uma área</div>
                ) : categoriasDoTipo.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.3)', padding: '8px 12px' }}>Nenhuma categoria</div>
                ) : categoriasDoTipo.map(cat => {
                  const count = servicos.filter(s => s.serviceParentId === cat.id).length;
                  return (
                    <div key={cat.id} onClick={() => { setSelCategoria(cat.id); setSelSub(null); }}
                      style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: selCategoria === cat.id ? 'rgba(0,229,196,0.1)' : 'none', border: `1px solid ${selCategoria === cat.id ? 'rgba(0,229,196,0.3)' : 'transparent'}`, transition: 'all 0.15s' }}>
                      <div style={{ fontSize: 13, fontWeight: selCategoria === cat.id ? 600 : 400, color: selCategoria === cat.id ? '#00E5C4' : '#7BAFD4' }}>{cat.name}</div>
                      {count > 0 && <div style={{ fontSize: 10, color: '#00E5C4', marginTop: 1 }}>{count} cadastrado(s)</div>}
                    </div>
                  );
                })}
              </div>

              {/* Col 3 — Sub-serviço */}
              <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid rgba(0,180,255,0.08)', overflowY: 'auto', padding: '12px 8px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#7BAFD4', letterSpacing: 1, textTransform: 'uppercase', padding: '4px 8px', marginBottom: 6 }}>Sub-serviço</div>
                {!selCategoria ? (
                  <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.3)', padding: '8px 12px' }}>Selecione uma categoria</div>
                ) : subsDoaCat.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.3)', padding: '8px 12px' }}>Nenhum sub-serviço</div>
                ) : subsDoaCat.map(sub => {
                  const jaTem = jaTemServico(sub.id);
                  const isSelected = selSub?.id === sub.id;
                  return (
                    <div key={sub.id} onClick={() => handleSelectSub(sub)}
                      style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: isSelected ? 'rgba(0,229,196,0.15)' : jaTem ? 'rgba(16,185,129,0.08)' : 'none', border: `1px solid ${isSelected ? 'rgba(0,229,196,0.4)' : jaTem ? 'rgba(16,185,129,0.2)' : 'transparent'}`, transition: 'all 0.15s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? '#00E5C4' : jaTem ? '#10b981' : '#7BAFD4' }}>{sub.name}</div>
                        {jaTem && <span style={{ fontSize: 9, fontWeight: 700, color: '#10b981' }}>✓</span>}
                      </div>
                      {jaTem && !isSelected && (
                        <div style={{ fontSize: 10, color: '#10b981', marginTop: 1 }}>Já cadastrado</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Formulário */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {!selSub ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(123,175,212,0.3)', fontSize: 13, textAlign: 'center' }}>
                    Selecione um sub-serviço<br/>para preencher os dados
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Título */}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#E8F4FF' }}>{selSub.name}</div>
                      <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>
                        {TIPOS.find(t => t.id === selTipo)?.label} › {catalogo.find(c => c.id === selCategoria)?.name}
                      </div>
                    </div>

                    {/* Preço + Unidade */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={lbl}>Preço base (R$) *</label>
                        <input type="number" min="0" step="0.01" value={form.preco}
                          onChange={e => handlePrecoChange(e.target.value)}
                          style={{ ...inp, borderColor: precoAlerta ? '#ef4444' : 'rgba(0,180,255,0.2)' }}
                          placeholder="0,00" />
                        {teto && !precoAlerta && <p style={{ fontSize: 10, color: '#00E5C4', marginTop: 3 }}>Teto: R$ {teto.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/{teto.unidade}</p>}
                        {precoAlerta && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>⚠ {precoAlerta}</p>}
                        <p style={{ fontSize: 10, color: 'rgba(123,175,212,0.4)', marginTop: 3 }}>Incluir transporte, equipe e montagem quando aplicável</p>
                      </div>
                      <div>
                        <label style={lbl}>Unidade de cobrança</label>
                        <select value={form.unidade} onChange={e => setF('unidade', e.target.value)} style={{ ...inp, background: 'rgba(10,22,38,0.8)' }}>
                          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Dias */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={lbl}>Dias de preparo</label>
                        <input type="number" min="0" step="1" value={form.diasPreparo} onChange={e => setF('diasPreparo', e.target.value)} style={inp} placeholder="Ex: 15" />
                        <p style={{ fontSize: 10, color: 'rgba(123,175,212,0.4)', marginTop: 3 }}>Produção</p>
                      </div>
                      <div>
                        <label style={lbl}>Dias de montagem</label>
                        <input type="number" min="0" step="1" value={form.diasMontagem} onChange={e => setF('diasMontagem', e.target.value)} style={inp} placeholder="Ex: 2" />
                        <p style={{ fontSize: 10, color: 'rgba(123,175,212,0.4)', marginTop: 3 }}>No local</p>
                      </div>
                      <div>
                        <label style={lbl}>Tempo de execução</label>
                        <input value={form.tempoExecucao} onChange={e => setF('tempoExecucao', e.target.value)} style={inp} placeholder="Ex: 6 dias" />
                      </div>
                      <div>
                        <label style={lbl}>Quantidade disponível</label>
                        <input value={form.quantidade} onChange={e => setF('quantidade', e.target.value)} style={inp} placeholder="Ex: 3 unid." />
                      </div>
                    </div>

                    {/* Região + Ativo */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'flex-end' }}>
                      <div>
                        <label style={lbl}>Região de atendimento</label>
                        <select value={form.regiao} onChange={e => setF('regiao', e.target.value)} style={{ ...inp, background: 'rgba(10,22,38,0.8)' }}>
                          {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
                        <input type="checkbox" id="svc-ativo" checked={form.ativo !== false} onChange={e => setF('ativo', e.target.checked)} style={{ width: 15, height: 15, accentColor: '#00E5C4' }} />
                        <label htmlFor="svc-ativo" style={{ fontSize: 13, color: '#7BAFD4', cursor: 'pointer', whiteSpace: 'nowrap' }}>Serviço ativo</label>
                      </div>
                    </div>

                    {/* Opções */}
                    <div style={{ borderTop: '1px solid rgba(0,180,255,0.1)', paddingTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <label style={{ ...lbl, marginBottom: 0 }}>Opcoes</label>
                          <p style={{ fontSize: 10, color: 'rgba(123,175,212,0.4)', marginTop: 2 }}>Ex: tamanhos, qualidades, configuracoes diferentes com valores distintos</p>
                        </div>
                        <button onClick={() => { resetOpcaoForm(); setShowOpcaoForm(true); }}
                          style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(0,229,196,0.3)', background: 'rgba(0,229,196,0.06)', color: '#00E5C4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          + Adicionar opcao
                        </button>
                      </div>

                      {/* Lista de opções (salvas + memória) */}
                      {todasOpcoes.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {todasOpcoes.map((op, i) => (
                            <div key={op.id || op._tempId || i} style={{ background: 'rgba(0,229,196,0.04)', border: '1px solid rgba(0,229,196,0.12)', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>{op.nome}</span>
                                  {op._tempId && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,167,38,0.15)', color: '#FFA726' }}>nao salvo</span>}
                                </div>
                                {op.caracteristica && <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>{op.caracteristica}</div>}
                                {op.observacoes && <div style={{ fontSize: 10, color: 'rgba(123,175,212,0.45)', marginTop: 2 }}>{op.observacoes}</div>}
                                <div style={{ fontSize: 12, color: '#00E5C4', fontWeight: 600, marginTop: 4 }}>R$ {parseFloat(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {op.unidade}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                                <button onClick={() => handleEditarOpcao(op)} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 10, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                                <button onClick={() => handleExcluirOpcao(op)} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 10, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Excluir</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulário de nova/editar opção */}
                      {showOpcaoForm && (
                        <div style={{ background: 'rgba(10,22,38,0.7)', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 10, padding: '14px', marginBottom: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#7BAFD4', marginBottom: 10 }}>{editandoOpcaoId ? 'Editar opcao' : 'Nova opcao'}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <div>
                                <label style={lbl}>Nome *</label>
                                <input value={opcaoForm.nome} onChange={e => setO('nome', e.target.value)} style={inp} placeholder="Ex: LED 4x2m, Padrao, Premium..." />
                              </div>
                              <div>
                                <label style={lbl}>Caracteristica</label>
                                <input value={opcaoForm.caracteristica} onChange={e => setO('caracteristica', e.target.value)} style={inp} placeholder="Ex: Pixel pitch 3mm, Full HD..." />
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <div>
                                <label style={lbl}>Valor (R$) *</label>
                                <input type="number" min="0" step="0.01" value={opcaoForm.valor} onChange={e => setO('valor', e.target.value)} style={inp} placeholder="0,00" />
                              </div>
                              <div>
                                <label style={lbl}>Unidade de cobranca</label>
                                <select value={opcaoForm.unidade} onChange={e => setO('unidade', e.target.value)} style={{ ...inp, background: 'rgba(10,22,38,0.8)' }}>
                                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label style={lbl}>Observacoes</label>
                              <input value={opcaoForm.observacoes} onChange={e => setO('observacoes', e.target.value)} style={inp} placeholder="Detalhes adicionais desta opcao..." />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                              <button onClick={resetOpcaoForm} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                              <button onClick={handleAddOpcaoMemoria} style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                {editandoOpcaoId ? 'Atualizar' : 'Adicionar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Observações */}
                    <div>
                      <label style={lbl}>Observações</label>
                      <input value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} style={inp} placeholder="Informações adicionais, diferenciais..." />
                    </div>

                    {/* Botão salvar */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                      <button onClick={() => { setSelSub(null); setEditando(null); setForm({ preco: '', unidade: 'por hora', diasPreparo: '', diasMontagem: '', tempoExecucao: '', quantidade: '', regiao: 'São Paulo - Capital', observacoes: '', ativo: true }); }}
                        style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        Limpar
                      </button>
                      <button onClick={handleSalvar} disabled={saving || !!precoAlerta}
                        style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: (saving || precoAlerta) ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: (saving || precoAlerta) ? '#7BAFD4' : 'white', fontSize: 13, fontWeight: 600, cursor: (saving || precoAlerta) ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {saving ? 'Salvando...' : editando ? 'Atualizar' : 'Salvar serviço'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs de tipo */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TIPOS.map(t => {
          const count = servicos.filter(s => s.tipoServico === t.id).length;
          const ativa = tipoAtivo === t.id;
          return (
            <button key={t.id} onClick={() => setTipoAtivo(t.id)}
              style={{ padding: '8px 16px', borderRadius: 20, border: `1px solid ${ativa ? t.color : 'rgba(0,180,255,0.15)'}`, background: ativa ? `${t.color}22` : 'rgba(255,255,255,0.03)', color: ativa ? t.color : '#7BAFD4', fontSize: 13, fontWeight: ativa ? 600 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.label}
              {count > 0 && <span style={{ background: ativa ? t.color : 'rgba(123,175,212,0.2)', color: ativa ? 'white' : '#7BAFD4', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Lista de serviços */}
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
                  {s.diasPreparo > 0 && <span style={{ fontSize: 11, color: '#7BAFD4' }}>{s.diasPreparo}d preparo</span>}
                  {s.diasMontagem > 0 && <span style={{ fontSize: 11, color: '#7BAFD4' }}>{s.diasMontagem}d montagem</span>}
                  {s.regiao && <span style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)' }}>{s.regiao}</span>}
                </div>
                {s.observacoes && <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)', marginTop: 4 }}>{s.observacoes}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => handleEditarExistente(s)}
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
