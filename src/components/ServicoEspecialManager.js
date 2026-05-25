import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';

// ── Formulário de modelo ──────────────────────────────────────────────────────
function ModeloForm({ tipoEspecialId, tipoEspecialNome, supplierId, editData, onSave, onCancel }) {
  const [form, setForm] = useState(() => {
    if (!editData) return {
      nome: '', descricao: '', areaM2: '', altura: '',
      precoBase: '', diasProducao: '',
      caracteristicas: '',
      moveis: '',
      tecnologia: '',
      preAprovacao: false,
      aprovacaoExecucao: false,
      regioes: [],
      ativo: true,
    };
    return {
      ...editData,
      caracteristicas: Array.isArray(editData.caracteristicas)
        ? editData.caracteristicas.join(', ')
        : (editData.caracteristicas || ''),
      moveis: Array.isArray(editData.moveis)
        ? editData.moveis.join(', ')
        : (editData.moveis || ''),
      tecnologia: Array.isArray(editData.tecnologia)
        ? editData.tecnologia.join(', ')
        : (editData.tecnologia || ''),
      regioes: editData.regioes || [],
      preAprovacao: editData.preAprovacao || false,
      aprovacaoExecucao: editData.aprovacaoExecucao || false,
    };
  });
  const [fotoFiles, setFotoFiles]     = useState([]);
  const [fotoPreviews, setFotoPreviews] = useState(editData?.fotos || (editData?.fotoUrl ? [{ url: editData.fotoUrl, path: editData.fotoPath }] : []));
  const [fotoAtiva, setFotoAtiva]     = useState(0);
  const [saving, setSaving]           = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleFotos = (e) => {
    const files = Array.from(e.target.files).slice(0, 8 - fotoPreviews.length);
    const novos = files.map(f => ({ file: f, url: URL.createObjectURL(f), isNew: true }));
    setFotoFiles(prev => [...prev, ...files]);
    setFotoPreviews(prev => [...prev, ...novos]);
    setFotoAtiva(fotoPreviews.length);
  };

  const handleRemoverFoto = (idx) => {
    setFotoPreviews(prev => prev.filter((_, i) => i !== idx));
    setFotoFiles(prev => {
      const novas = fotoPreviews.filter((f, i) => i !== idx && f.isNew);
      return prev.filter(f => novas.some(n => n.file === f));
    });
    setFotoAtiva(i => Math.max(0, i > idx ? i - 1 : i));
  };

  const handleSave = async () => {
    if (!form.nome.trim())    { alert('Nome obrigatório'); return; }
    if (!form.precoBase)      { alert('Preço base obrigatório'); return; }
    if (!form.diasProducao)   { alert('Dias de produção obrigatório'); return; }
    setSaving(true);
    try {
      // Upload das fotos novas
      const fotosFinais = [];
      for (const fp of fotoPreviews) {
        if (fp.isNew && fp.file) {
          const path = `servicos-especiais/${tipoEspecialId}/${Date.now()}_${fp.file.name}`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, fp.file);
          const url = await getDownloadURL(storageRef);
          fotosFinais.push({ url, path });
        } else if (fp.url && !fp.isNew) {
          fotosFinais.push({ url: fp.url, path: fp.path || null });
        }
      }

      const data = {
        tipoEspecialId,
        tipoEspecialNome,
        supplierId,
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        areaM2: form.areaM2 ? parseFloat(form.areaM2) : null,
        altura: form.altura ? parseFloat(form.altura) : null,
        precoBase: parseFloat(form.precoBase),
        diasProducao: parseInt(form.diasProducao),
        caracteristicas: Array.isArray(form.caracteristicas)
          ? form.caracteristicas
          : (form.caracteristicas ? form.caracteristicas.split(',').map(s => s.trim()).filter(Boolean) : []),
        moveis: form.moveis ? form.moveis.split(',').map(s => s.trim()).filter(Boolean) : [],
        tecnologia: form.tecnologia ? form.tecnologia.split(',').map(s => s.trim()).filter(Boolean) : [],
        preAprovacao: form.preAprovacao || false,
        aprovacaoExecucao: form.aprovacaoExecucao || false,
        regioes: form.regioes || [],
        fotos: fotosFinais,
        fotoUrl: fotosFinais[0]?.url || null,
        fotoPath: fotosFinais[0]?.path || null,
        ativo: form.ativo,
        updatedAt: new Date(),
      };

      if (editData?.id) {
        await updateDoc(doc(db, 'modelosEspeciais', editData.id), data);
      } else {
        await addDoc(collection(db, 'modelosEspeciais'), { ...data, createdAt: new Date() });
      }
      onSave();
    } catch (e) { console.error(e); alert('Erro ao salvar modelo.'); }
    finally { setSaving(false); }
  };

  const inp = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <div style={{ background: '#f8faff', borderRadius: 12, border: '1px solid #e0e8ff', padding: 20, marginBottom: 16, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#667eea', marginBottom: 16, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {editData ? 'Editar modelo' : 'Novo modelo'}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Fotos — carrossel com até 8 */}
        <div style={{ flexShrink: 0, width: 200 }}>
          <label style={lbl}>Fotos do modelo ({fotoPreviews.length}/8)</label>
          {/* Preview principal */}
          <div style={{ width: 200, height: 140, borderRadius: 10, border: '2px dashed #c7d2fe', background: '#f0f3ff', overflow: 'hidden', position: 'relative', marginBottom: 8 }}>
            {fotoPreviews.length > 0 ? (
              <img src={fotoPreviews[fotoAtiva]?.url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8', fontSize: 12 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
                Sem fotos
              </div>
            )}
            {fotoPreviews.length > 1 && (
              <>
                <button onClick={() => setFotoAtiva(i => (i - 1 + fotoPreviews.length) % fotoPreviews.length)}
                  style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 14 }}>‹</button>
                <button onClick={() => setFotoAtiva(i => (i + 1) % fotoPreviews.length)}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 14 }}>›</button>
                <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
                  {fotoPreviews.map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === fotoAtiva ? 'white' : 'rgba(255,255,255,0.5)' }} />)}
                </div>
              </>
            )}
          </div>
          {/* Thumbnails */}
          {fotoPreviews.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {fotoPreviews.map((fp, i) => (
                <div key={i} onClick={() => setFotoAtiva(i)}
                  style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', border: `2px solid ${i === fotoAtiva ? '#667eea' : '#e2e8f0'}`, cursor: 'pointer', position: 'relative' }}>
                  <img src={fp.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={e => { e.stopPropagation(); handleRemoverFoto(i); }}
                    style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(239,68,68,0.85)', border: 'none', color: 'white', fontSize: 8, width: 14, height: 14, borderRadius: '0 0 0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          {fotoPreviews.length < 8 && (
            <button onClick={() => document.getElementById('fotos-input').click()}
              style={{ width: '100%', padding: '6px', borderRadius: 7, border: '1px dashed #c7d2fe', background: 'none', color: '#667eea', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              + Adicionar foto
            </button>
          )}
          <input id="fotos-input" type="file" accept="image/*" multiple onChange={handleFotos} style={{ display: 'none' }} />
        </div>

        {/* Campos */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Nome do modelo *</label>
            <input value={form.nome} onChange={e => setF('nome', e.target.value)} style={inp} placeholder="Ex: Estande 3x3 Clean" />
          </div>
          <div>
            <label style={lbl}>Descrição</label>
            <input value={form.descricao} onChange={e => setF('descricao', e.target.value)} style={inp} placeholder="Breve descrição do modelo" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Área (m²)</label>
              <input type="number" min="0" step="0.5" value={form.areaM2} onChange={e => setF('areaM2', e.target.value)} style={inp} placeholder="9" />
            </div>
            <div>
              <label style={lbl}>Altura (m)</label>
              <input type="number" min="0" step="0.1" value={form.altura} onChange={e => setF('altura', e.target.value)} style={inp} placeholder="2.5" />
            </div>
            <div>
              <label style={lbl}>Preço base (R$) *</label>
              <input type="number" min="0" step="0.01" value={form.precoBase} onChange={e => setF('precoBase', e.target.value)} style={inp} placeholder="0,00" />
            </div>
            <div>
              <label style={lbl}>Dias de produção *</label>
              <input type="number" min="1" step="1" value={form.diasProducao} onChange={e => setF('diasProducao', e.target.value)} style={inp} placeholder="Ex: 7" />
            </div>
          </div>
          <div>
            <label style={lbl}>Características (separadas por vírgula)</label>
            <input value={form.caracteristicas} onChange={e => setF('caracteristicas', e.target.value)} style={inp} placeholder="Ex: Balcão embutido, Backlight, Prateleiras, Tomadas" />
          </div>
          <div>
            <label style={lbl}>Móveis inclusos (separados por vírgula)</label>
            <input value={form.moveis} onChange={e => setF('moveis', e.target.value)} style={inp} placeholder="Ex: Sofá 2 lugares, Mesa de reunião, 4 cadeiras, Balcão" />
          </div>
          <div>
            <label style={lbl}>Tecnologia inclusa (separada por vírgula)</label>
            <input value={form.tecnologia} onChange={e => setF('tecnologia', e.target.value)} style={inp} placeholder="Ex: TV 55 polegadas, Tablet de recepção, Ponto de internet" />
          </div>

          {/* Aprovações */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <label style={{ ...lbl, marginBottom: 8 }}>Aprovações necessárias</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'preAprovacao', label: 'Pré-aprovação', desc: 'Fornecedor envia preparação para aprovação do cliente antes de gerar a execução' },
                { key: 'aprovacaoExecucao', label: 'Aprovação de Execução', desc: 'Aprovação no dia do evento, quando o fornecedor entrega o serviço' },
              ].map(ap => (
                <div key={ap.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{ap.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{ap.desc}</div>
                  </div>
                  <div onClick={() => setF(ap.key, !form[ap.key])}
                    style={{ width: 40, height: 22, borderRadius: 11, background: form[ap.key] ? '#667eea' : '#e2e8f0', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: form[ap.key] ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Regiões de atendimento</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 140, overflowY: 'auto', padding: '8px', background: '#f8faff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              {[
                'Todo o Brasil',
                'AC','AL','AP','AM','BA','CE','DF','ES','GO',
                'MA','MT','MS','MG','PA','PB','PR','PE','PI',
                'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
              ].map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569', cursor: 'pointer', minWidth: r === 'Todo o Brasil' ? '100%' : 50 }}>
                  <input
                    type="checkbox"
                    checked={(form.regioes || []).includes(r)}
                    onChange={e => {
                      const atual = form.regioes || [];
                      if (r === 'Todo o Brasil' && e.target.checked) {
                        setF('regioes', ['Todo o Brasil']);
                      } else {
                        const sem = atual.filter(x => x !== 'Todo o Brasil');
                        setF('regioes', e.target.checked ? [...sem, r] : sem.filter(x => x !== r));
                      }
                    }}
                    style={{ accentColor: '#667eea' }}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="modelo-ativo" checked={form.ativo !== false} onChange={e => setF('ativo', e.target.checked)} style={{ width: 14, height: 14, accentColor: '#667eea' }} />
            <label htmlFor="modelo-ativo" style={{ fontSize: 13, color: '#64748b', cursor: 'pointer' }}>Modelo ativo</label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#667eea,#764ba2)', color: saving ? '#94a3b8' : 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          {saving ? 'Salvando...' : 'Salvar modelo'}
        </button>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ServicoEspecialManager() {
  const [tipos, setTipos]           = useState([]);
  const [modelos, setModelos]       = useState([]);
  const [suppliers, setSuppliers]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tipoAtivo, setTipoAtivo]   = useState(null);
  const [showTipoForm, setShowTipoForm] = useState(false);
  const [showModeloForm, setShowModeloForm] = useState(false);
  const [editandoModelo, setEditandoModelo] = useState(null);
  const [novoTipo, setNovoTipo]     = useState({ nome: '', descricao: '', icone: '' });
  const [savingTipo, setSavingTipo] = useState(false);
  const [gerenciandoAcesso, setGerenciandoAcesso] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [tiposSnap, modelosSnap, suppSnap] = await Promise.all([
        getDocs(query(collection(db, 'tiposEspeciais'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'modelosEspeciais')),
        getDocs(query(collection(db, 'users'), where('systemRole', '==', 'fornecedor'), where('active', '==', true))),
      ]);
      const tiposList = tiposSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTipos(tiposList);
      setModelos(modelosSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSuppliers(suppSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (tiposList.length > 0 && !tipoAtivo) setTipoAtivo(tiposList[0].id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDeleteTipo = async (tipo) => {
    if (!window.confirm(`Excluir o tipo "${tipo.nome}"?\n\nTodos os modelos vinculados também serão excluídos.`)) return;
    try {
      // Exclui modelos e fotos vinculados
      const modelosSnap = await getDocs(query(collection(db, 'modelosEspeciais'), where('tipoEspecialId', '==', tipo.id)));
      for (const d of modelosSnap.docs) {
        const m = d.data();
        if (m.fotoPath) { try { await deleteObject(ref(storage, m.fotoPath)); } catch {} }
        await deleteDoc(doc(db, 'modelosEspeciais', d.id));
      }
      await deleteDoc(doc(db, 'tiposEspeciais', tipo.id));
      if (tipoAtivo === tipo.id) setTipoAtivo(null);
      await loadAll();
    } catch (e) { console.error(e); alert('Erro ao excluir.'); }
  };

  const handleSaveTipo = async () => {
    if (!novoTipo.nome.trim()) { alert('Nome obrigatório'); return; }
    setSavingTipo(true);
    try {
      await addDoc(collection(db, 'tiposEspeciais'), {
        ...novoTipo,
        fornecedoresAutorizados: [],
        ativo: true,
        createdAt: new Date(),
      });
      setNovoTipo({ nome: '', descricao: '', icone: '' });
      setShowTipoForm(false);
      await loadAll();
    } catch (e) { console.error(e); alert('Erro ao criar tipo.'); }
    finally { setSavingTipo(false); }
  };

  const handleToggleFornecedor = async (tipoId, supplierId, supplierNome, autorizado) => {
    const tipo = tipos.find(t => t.id === tipoId);
    if (!tipo) return;
    const lista = tipo.fornecedoresAutorizados || [];
    const novaLista = autorizado
      ? lista.filter(f => f.id !== supplierId)
      : [...lista, { id: supplierId, nome: supplierNome }];
    await updateDoc(doc(db, 'tiposEspeciais', tipoId), { fornecedoresAutorizados: novaLista });
    await loadAll();
  };

  const handleDeleteModelo = async (modelo) => {
    if (!window.confirm(`Excluir o modelo "${modelo.nome}"?`)) return;
    try {
      if (modelo.fotoPath) {
        try { await deleteObject(ref(storage, modelo.fotoPath)); } catch {}
      }
      await deleteDoc(doc(db, 'modelosEspeciais', modelo.id));
      await loadAll();
    } catch (e) { console.error(e); alert('Erro ao excluir.'); }
  };

  const tipoAtivoData  = tipos.find(t => t.id === tipoAtivo);
  const modelosDoTipo  = modelos.filter(m => m.tipoEspecialId === tipoAtivo && m.ativo !== false);

  const inp = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>Carregando...</div>;

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Serviços Especiais</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Catálogos de modelos exclusivos por fornecedor autorizado</p>
        </div>
        <button onClick={() => setShowTipoForm(s => !s)}
          style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          + Novo Tipo
        </button>
      </div>

      {/* Form novo tipo */}
      {showTipoForm && (
        <div style={{ background: '#f8faff', borderRadius: 12, border: '1px solid #e0e8ff', padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#667eea', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>Novo tipo de serviço especial</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={lbl}>Nome *</label>
              <input value={novoTipo.nome} onChange={e => setNovoTipo(p => ({ ...p, nome: e.target.value }))} style={inp} placeholder="Ex: Estandes Modulares" />
            </div>
            <div>
              <label style={lbl}>Descrição</label>
              <input value={novoTipo.descricao} onChange={e => setNovoTipo(p => ({ ...p, descricao: e.target.value }))} style={inp} placeholder="Breve descrição" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowTipoForm(false)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
              <button onClick={handleSaveTipo} disabled={savingTipo}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {savingTipo ? 'Salvando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tipos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8', fontSize: 14 }}>
          Nenhum tipo de serviço especial criado ainda.<br />
          <span style={{ fontSize: 12 }}>Clique em "+ Novo Tipo" para começar.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>

          {/* Coluna esquerda — tipos */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Tipos</div>
            {tipos.map(t => (
              <div key={t.id}
                style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${tipoAtivo === t.id ? '#667eea' : '#e2e8f0'}`, background: tipoAtivo === t.id ? '#f0f3ff' : 'white', marginBottom: 8, transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => { setTipoAtivo(t.id); setGerenciandoAcesso(false); setShowModeloForm(false); setEditandoModelo(null); }}>
                    <div style={{ fontSize: 13, fontWeight: tipoAtivo === t.id ? 600 : 400, color: tipoAtivo === t.id ? '#667eea' : '#1e293b' }}>{t.nome}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {modelos.filter(m => m.tipoEspecialId === t.id).length} modelo(s) · {(t.fornecedoresAutorizados || []).length} fornecedor(es)
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDeleteTipo(t); }}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, opacity: 0.5, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Coluna direita — conteúdo */}
          {tipoAtivoData && (
            <div style={{ flex: 1 }}>
              {/* Header do tipo */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>{tipoAtivoData.nome}</h3>
                  {tipoAtivoData.descricao && <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{tipoAtivoData.descricao}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setGerenciandoAcesso(s => !s); setShowModeloForm(false); }}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: gerenciandoAcesso ? '#f0f3ff' : 'white', color: gerenciandoAcesso ? '#667eea' : '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    👥 Fornecedores autorizados
                  </button>
                  <button onClick={() => { setShowModeloForm(s => !s); setEditandoModelo(null); setGerenciandoAcesso(false); }}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    + Adicionar Modelo
                  </button>
                </div>
              </div>

              {/* Gerenciar acesso */}
              {gerenciandoAcesso && (
                <div style={{ background: '#f8faff', borderRadius: 12, border: '1px solid #e0e8ff', padding: 20, marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#667eea', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Fornecedores autorizados a cadastrar modelos
                  </div>
                  {suppliers.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhum fornecedor homologado</p>
                  ) : suppliers.map(s => {
                    const autorizado = (tipoAtivoData.fornecedoresAutorizados || []).some(f => f.id === s.id);
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{s.name || s.tradeName || s.companyName}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.email}</div>
                        </div>
                        <button onClick={() => handleToggleFornecedor(tipoAtivo, s.id, s.name || s.tradeName || s.companyName, autorizado)}
                          style={{ padding: '5px 14px', borderRadius: 8, border: `1px solid ${autorizado ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, background: autorizado ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)', color: autorizado ? '#ef4444' : '#10b981', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                          {autorizado ? 'Remover acesso' : 'Autorizar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Form novo/editar modelo */}
              {(showModeloForm || editandoModelo) && (
                <ModeloForm
                  tipoEspecialId={tipoAtivo}
                  tipoEspecialNome={tipoAtivoData.nome}
                  supplierId={null}
                  editData={editandoModelo}
                  onSave={() => { setShowModeloForm(false); setEditandoModelo(null); loadAll(); }}
                  onCancel={() => { setShowModeloForm(false); setEditandoModelo(null); }}
                />
              )}

              {/* Grid de modelos */}
              {modelosDoTipo.length === 0 && !showModeloForm ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
                  Nenhum modelo cadastrado para {tipoAtivoData.nome}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                  {modelosDoTipo.map(m => (
                    <div key={m.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      {/* Foto */}
                      <div style={{ height: 160, background: m.fotoUrl ? 'transparent' : '#f0f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {m.fotoUrl ? (
                          <img src={m.fotoUrl} alt={m.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ color: '#94a3b8', fontSize: 13 }}>Sem foto</div>
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{m.nome}</div>
                        {m.descricao && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{m.descricao}</div>}
                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                          {m.areaM2 && <span>📐 {m.areaM2}m²</span>}
                          {m.altura && <span>↕ {m.altura}m</span>}
                          <span>⏱ {m.diasProducao} dias</span>
                        </div>
                        {m.caracteristicas?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                            {m.caracteristicas.map((c, i) => (
                              <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#f0f3ff', color: '#667eea' }}>{c}</span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: '#667eea' }}>
                            R$ {m.precoBase?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setEditandoModelo(m); setShowModeloForm(false); setGerenciandoAcesso(false); }}
                              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                            <button onClick={() => handleDeleteModelo(m)}
                              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Excluir</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
