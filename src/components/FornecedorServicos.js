import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';

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

const OPCAO_VAZIA = {
  opcaoCatalogoId: '', nome: '', caracteristica: '', observacoes: '',
  diasPreparo: '', diasMontagem: '',
  quantidade: '', regiao: 'São Paulo - Capital', ativo: true,
  fotoUrl: '',
};

export default function FornecedorServicos({ userData, onServicosAdicionados }) {
  const supplierId  = userData?.supplierId || userData?.id;
  const [servicos, setServicos]     = useState([]);
  const [catalogo, setCatalogo]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tipoAtivo, setTipoAtivo]   = useState('operacao');
  const [showCascata, setShowCascata] = useState(false);
  const [editando, setEditando]     = useState(null);
  const [saving, setSaving]         = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // Cascata
  const [selTipo, setSelTipo]           = useState(null);
  const [selCategoria, setSelCategoria] = useState(null);
  const [selSub, setSelSub]             = useState(null);

  // Opções
  const [opcoes, setOpcoes]               = useState([]);       // opções salvas no Firestore
  const [opcoesMemoria, setOpcoesMemoria] = useState([]);       // opções novas não salvas
  const [opcaoForm, setOpcaoForm]         = useState(OPCAO_VAZIA);
  const [editandoOpcaoId, setEditandoOpcaoId] = useState(null);
  const [showOpcaoForm, setShowOpcaoForm] = useState(false);
  const [opcoesCatalogo, setOpcoesCatalogo] = useState([]);     // opções do catálogo admin
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const setO = (k, v) => setOpcaoForm(p => ({ ...p, [k]: v }));

  const resetOpcaoForm = () => {
    setOpcaoForm(OPCAO_VAZIA);
    setEditandoOpcaoId(null);
    setShowOpcaoForm(false);
  };

  useEffect(() => { loadAll(); }, [supplierId]);

  const loadAll = async () => {
    if (!supplierId) return;
    try {
      const [svcSnap, catSnap] = await Promise.all([
        getDocs(query(collection(db, 'supplierServices'), where('supplierId', '==', supplierId))),
        getDocs(collection(db, 'services')),
      ]);
      const lista = svcSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setServicos(lista);
      setCatalogo(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (lista.length > 0 && onServicosAdicionados) onServicosAdicionados();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadOpcoes = async (servicoId) => {
    if (!servicoId) { setOpcoes([]); return; }
    try {
      const snap = await getDocs(collection(db, 'supplierServices', servicoId, 'opcoes'));
      setOpcoes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('Erro ao carregar opções:', e); }
  };

  // ── Cascata helpers ──────────────────────────────────────────────────────────
  const tipoConfig       = TIPOS.find(t => t.id === tipoAtivo);
  const categoriasDoTipo = selTipo ? catalogo.filter(s => !s.parentId && s.tipo === selTipo && s.active !== false) : [];
  const subsDoaCat       = selCategoria ? catalogo.filter(s => s.parentId === selCategoria && s.active !== false) : [];
  const jaTemServico     = (subId) => servicos.some(s => s.serviceId === subId);

  const handleSelectSub = async (sub) => {
    setSelSub(sub);
    const existing = servicos.find(s => s.serviceId === sub.id);
    if (existing) {
      setEditando(existing);
      loadOpcoes(existing.id);
    } else {
      setEditando(null);
      setOpcoes([]);
    }
    setOpcoesMemoria([]);
    resetOpcaoForm();
    // Busca opções do catálogo para este sub-serviço
    setLoadingCatalogo(true);
    try {
      const snap = await getDocs(collection(db, 'services', sub.id, 'opcoes'));
      setOpcoesCatalogo(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.ativo !== false));
    } catch (e) { console.error('Erro ao buscar opções do catálogo:', e); setOpcoesCatalogo([]); }
    finally { setLoadingCatalogo(false); }
  };

  // ── Opções ───────────────────────────────────────────────────────────────────
  const handleAddOpcao = () => {
    if (!opcaoForm.nome) { alert('Informe o nome da opção'); return; }
    if (editandoOpcaoId) {
      if (editando?.id) {
        const { _tempId, ...opData } = opcaoForm;
        updateDoc(doc(db, 'supplierServices', editando.id, 'opcoes', editandoOpcaoId), {
          ...opData, updatedAt: serverTimestamp(),
        }).then(() => loadOpcoes(editando.id));
      } else {
        setOpcoesMemoria(prev => prev.map(o => o._tempId === editandoOpcaoId ? { ...o, ...opcaoForm } : o));
      }
    } else {
      if (editando?.id) {
        addDoc(collection(db, 'supplierServices', editando.id, 'opcoes'), {
          ...opcaoForm,
          diasPreparo: opcaoForm.diasPreparo ? parseInt(opcaoForm.diasPreparo) : 0,
          diasMontagem: opcaoForm.diasMontagem ? parseInt(opcaoForm.diasMontagem) : 0,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        }).then(() => loadOpcoes(editando.id));
      } else {
        setOpcoesMemoria(prev => [...prev, { ...opcaoForm, _tempId: Date.now().toString() }]);
      }
    }
    resetOpcaoForm();
  };

  const handleEditarOpcao = (op) => {
    setOpcaoForm({
      opcaoCatalogoId: op.opcaoCatalogoId || '',
      nome: op.nome || '', caracteristica: op.caracteristica || '', observacoes: op.observacoes || '',
      diasPreparo: op.diasPreparo || '', diasMontagem: op.diasMontagem || '',
      quantidade: op.quantidade || '',
      regiao: op.regiao || 'São Paulo - Capital', ativo: op.ativo !== false,
      fotoUrl: op.fotoUrl || '',
    });
    setEditandoOpcaoId(op.id || op._tempId);
    setShowOpcaoForm(true);
  };

  // ── Foto da opção ────────────────────────────────────────────────────────────
  const handleFotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Selecione um arquivo de imagem.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Imagem muito grande. Máximo 5MB.'); return; }
    setUploadingFoto(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `supplierServices/${supplierId}/${opcaoForm.opcaoCatalogoId || 'opcao'}_${Date.now()}.${ext}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setO('fotoUrl', url);
    } catch (err) {
      console.error('Erro ao enviar foto:', err);
      alert('Erro ao enviar a foto. Tente novamente.');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleRemoverFoto = () => setO('fotoUrl', '');

  const handleExcluirOpcao = async (op) => {
    if (!window.confirm('Excluir esta opção?')) return;
    if (op.fotoUrl) {
      try { await deleteObject(storageRef(storage, op.fotoUrl)); } catch (e) { /* foto pode já não existir mais, ignora */ }
    }
    if (op.id && editando?.id) {
      await deleteDoc(doc(db, 'supplierServices', editando.id, 'opcoes', op.id));
      loadOpcoes(editando.id);
    } else {
      setOpcoesMemoria(prev => prev.filter(o => o._tempId !== op._tempId));
    }
  };

  // ── Salvar serviço ───────────────────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!selSub) { alert('Selecione um sub-serviço'); return; }
    const todasOpcoes = [...opcoes, ...opcoesMemoria];
    if (todasOpcoes.length === 0) { alert('Adicione pelo menos uma opção antes de salvar'); return; }
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
        ativo:             true,
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
            ...opData,
            diasPreparo: opData.diasPreparo ? parseInt(opData.diasPreparo) : 0,
            diasMontagem: opData.diasMontagem ? parseInt(opData.diasMontagem) : 0,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }));
      }

      await loadAll();
      setSelSub(null);
      setEditando(null);
      setOpcoes([]);
      setOpcoesMemoria([]);
      resetOpcaoForm();
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    await deleteDoc(doc(db, 'supplierServices', id));
    loadAll();
  };

  const handleEditarExistente = (s) => {
    setSelTipo(s.tipoServico);
    setSelCategoria(s.serviceParentId);
    const sub = catalogo.find(c => c.id === s.serviceId);
    setSelSub(sub || { id: s.serviceId, name: s.serviceName });
    setEditando(s);
    loadOpcoes(s.id);
    setOpcoesMemoria([]);
    resetOpcaoForm();
    setShowCascata(true);
  };

  const toggleAtivo = async (s) => {
    await updateDoc(doc(db, 'supplierServices', s.id), { ativo: !s.ativo });
    loadAll();
  };

  // ── Estilos ──────────────────────────────────────────────────────────────────
  const inp = { padding: '8px 12px', borderRadius: 7, border: '1px solid rgba(0,180,255,0.2)', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none', background: 'rgba(10,22,38,0.6)', color: '#E8F4FF' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#7BAFD4', display: 'block', marginBottom: 4 };
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
        <button onClick={() => { setShowCascata(true); setSelTipo(null); setSelCategoria(null); setSelSub(null); setEditando(null); setOpcoes([]); setOpcoesMemoria([]); resetOpcaoForm(); }}
          style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          + Adicionar Serviço
        </button>
      </div>

      {/* Modal cascata */}
      {showCascata && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowCascata(false)}>
          <div style={{ background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 16, width: '100%', maxWidth: 1100, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header modal */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(0,180,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#E8F4FF' }}>
                {editando ? 'Editar serviço' : 'Adicionar serviço'}
              </div>
              <button onClick={() => setShowCascata(false)} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Corpo */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Col 1 — Área */}
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
                      {jaTem && !isSelected && <div style={{ fontSize: 10, color: '#10b981', marginTop: 1 }}>Já cadastrado</div>}
                    </div>
                  );
                })}
              </div>

              {/* Painel direito — Opções */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {!selSub ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(123,175,212,0.3)', fontSize: 13, textAlign: 'center' }}>
                    Selecione um sub-serviço<br />para adicionar opções
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

                    {/* Aviso */}
                    <div style={{ background: 'rgba(0,229,196,0.06)', border: '1px solid rgba(0,229,196,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7BAFD4', lineHeight: 1.6 }}>
                      💡 Ative as opções do catálogo que você oferece e preencha seus dados operacionais.
                    </div>

                    {/* Opções do catálogo */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF', marginBottom: 10 }}>
                        Opções disponíveis no catálogo
                      </div>

                      {loadingCatalogo ? (
                        <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.4)', padding: 12 }}>Carregando opções...</div>
                      ) : opcoesCatalogo.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.3)', padding: '16px', textAlign: 'center', border: '1px dashed rgba(0,180,255,0.1)', borderRadius: 8 }}>
                          Nenhuma opção cadastrada no catálogo para este sub-serviço.<br />
                          <span style={{ fontSize: 11 }}>Peça ao admin para cadastrar opções no ServiceManager.</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {opcoesCatalogo.map(opCat => {
                            const jaAtivada = todasOpcoes.find(o => o.opcaoCatalogoId === opCat.id);
                            const editandoEsta = editandoOpcaoId && opcaoForm.opcaoCatalogoId === opCat.id;
                            return (
                              <div key={opCat.id} style={{ background: jaAtivada ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${jaAtivada ? 'rgba(0,229,196,0.2)' : 'rgba(0,180,255,0.08)'}`, borderRadius: 10, padding: '12px 14px' }}>

                                {/* Cabeçalho da opção do catálogo */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editandoEsta ? 12 : 0 }}>
                                  <div>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: jaAtivada ? '#00E5C4' : '#7BAFD4' }}>{opCat.nome}</span>
                                    <span style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)', marginLeft: 8 }}>
                                      R$ {Number(opCat.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / {opCat.unidade}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 5 }}>
                                    {jaAtivada && !editandoEsta && (
                                      <button onClick={() => handleEditarOpcao({ ...jaAtivada })}
                                        style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 10, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                                    )}
                                    {jaAtivada && !editandoEsta && (
                                      <button onClick={() => handleExcluirOpcao(jaAtivada)}
                                        style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 10, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Remover</button>
                                    )}
                                    {!jaAtivada && !editandoEsta && (
                                      <button onClick={() => {
                                        setOpcaoForm({ ...OPCAO_VAZIA, opcaoCatalogoId: opCat.id, nome: opCat.nome });
                                        setEditandoOpcaoId(null);
                                        setShowOpcaoForm(opCat.id);
                                      }}
                                        style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(0,229,196,0.3)', background: 'rgba(0,229,196,0.06)', color: '#00E5C4', fontSize: 10, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>+ Ativar</button>
                                    )}
                                  </div>
                                </div>

                                {/* Dados operacionais já salvos */}
                                {jaAtivada && !editandoEsta && (
                                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                                    {jaAtivada.fotoUrl && <img src={jaAtivada.fotoUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(0,180,255,0.2)' }} />}
                                    {jaAtivada.caracteristica && <span style={{ fontSize: 10, color: 'rgba(123,175,212,0.6)' }}>✦ {jaAtivada.caracteristica}</span>}
                                    {jaAtivada.diasPreparo > 0 && <span style={{ fontSize: 10, color: 'rgba(123,175,212,0.5)' }}>📦 {jaAtivada.diasPreparo}d preparo</span>}
                                    {jaAtivada.diasMontagem > 0 && <span style={{ fontSize: 10, color: 'rgba(123,175,212,0.5)' }}>🔧 {jaAtivada.diasMontagem}d montagem</span>}
                                    {jaAtivada.regiao && <span style={{ fontSize: 10, color: 'rgba(123,175,212,0.5)' }}>📍 {jaAtivada.regiao}</span>}
                                    {jaAtivada.quantidade && <span style={{ fontSize: 10, color: 'rgba(123,175,212,0.5)' }}>📊 {jaAtivada.quantidade}</span>}
                                  </div>
                                )}

                                {/* Formulário inline ao ativar/editar */}
                                {(showOpcaoForm === opCat.id || editandoEsta) && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,180,255,0.1)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      <div>
                                        <label style={lbl}>Característica</label>
                                        <input value={opcaoForm.caracteristica} onChange={e => setO('caracteristica', e.target.value)} style={inp} placeholder="Ex: Full HD, 4x2m..." />
                                      </div>
                                      <div>
                                        <label style={lbl}>Quantidade disponível</label>
                                        <input value={opcaoForm.quantidade} onChange={e => setO('quantidade', e.target.value)} style={inp} placeholder="Ex: 3 unid." />
                                      </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                      <div>
                                        <label style={lbl}>Dias de preparo</label>
                                        <input type="number" min="0" value={opcaoForm.diasPreparo} onChange={e => setO('diasPreparo', e.target.value)} style={inp} placeholder="Ex: 10" />
                                      </div>
                                      <div>
                                        <label style={lbl}>Dias de montagem</label>
                                        <input type="number" min="0" value={opcaoForm.diasMontagem} onChange={e => setO('diasMontagem', e.target.value)} style={inp} placeholder="Ex: 2" />
                                      </div>
                                      <div>
                                        <label style={lbl}>Região de atendimento</label>
                                        <select value={opcaoForm.regiao} onChange={e => setO('regiao', e.target.value)} style={{ ...inp, background: 'rgba(10,22,38,0.8)' }}>
                                          {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                      </div>
                                    </div>
                                    <div>
                                      <label style={lbl}>Foto do produto/serviço (opcional)</label>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {opcaoForm.fotoUrl && (
                                          <img src={opcaoForm.fotoUrl} alt="Prévia" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(0,180,255,0.2)' }} />
                                        )}
                                        <label style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(0,180,255,0.2)', color: '#7BAFD4', fontSize: 12, cursor: uploadingFoto ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                          {uploadingFoto ? 'Enviando...' : opcaoForm.fotoUrl ? 'Trocar foto' : 'Adicionar foto'}
                                          <input type="file" accept="image/*" onChange={handleFotoChange} disabled={uploadingFoto} style={{ display: 'none' }} />
                                        </label>
                                        {opcaoForm.fotoUrl && !uploadingFoto && (
                                          <button onClick={handleRemoverFoto} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Remover</button>
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <label style={lbl}>Observações</label>
                                      <input value={opcaoForm.observacoes} onChange={e => setO('observacoes', e.target.value)} style={inp} placeholder="Detalhes adicionais..." />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                      <button onClick={() => { resetOpcaoForm(); setShowOpcaoForm(false); }}
                                        style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                                      <button onClick={handleAddOpcao} disabled={uploadingFoto}
                                        style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: uploadingFoto ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: uploadingFoto ? '#7BAFD4' : 'white', fontSize: 12, fontWeight: 600, cursor: uploadingFoto ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                        {editandoOpcaoId ? 'Atualizar' : 'Confirmar'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Botão salvar serviço */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4, borderTop: '1px solid rgba(0,180,255,0.08)' }}>
                      <button onClick={() => { setSelSub(null); setEditando(null); setOpcoes([]); setOpcoesMemoria([]); resetOpcaoForm(); }}
                        style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        Limpar
                      </button>
                      <button onClick={handleSalvar} disabled={saving}
                        style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: saving ? '#7BAFD4' : 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {saving ? 'Salvando...' : editando ? 'Atualizar serviço' : 'Salvar serviço'}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#E8F4FF' }}>{s.serviceName}</span>
                  {!s.ativo && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Inativo</span>}
                </div>
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
