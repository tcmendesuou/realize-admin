import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 };

const FORM_VAZIO = {
  nome: '', slug: '', ativo: true,
  corPrimaria: '#0080FF', corSecundaria: '#ffffff', corAcento: '#00E5C4',
  logo: '', descricao: '',
  modoVerba: 'por_evento', // 'por_evento' | 'pool'
};

export default function TenantManager() {
  const [tenants, setTenants]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editando, setEditando] = useState(null); // null = novo
  const [form, setForm]         = useState(FORM_VAZIO);
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'tenants'));
    setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Selecione um arquivo de imagem.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Imagem muito grande. Máximo 5MB.'); return; }
    if (!form.slug.trim()) { alert('Preencha o slug antes de enviar a logo.'); return; }
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `tenants/${form.slug.trim().toLowerCase()}/logo_${Date.now()}.${ext}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setF('logo', url);
    } catch (err) {
      console.error('Erro ao enviar logo:', err);
      alert('Erro ao enviar a logo. Tente novamente.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoverLogo = () => setF('logo', '');

  const abrirNovo = () => {
    setEditando(null);
    setForm(FORM_VAZIO);
    setShowForm(true);
  };

  const abrirEditar = (t) => {
    setEditando(t.id);
    setForm({ ...FORM_VAZIO, ...t });
    setShowForm(true);
  };

  const salvar = async () => {
    if (!form.nome.trim() || !form.slug.trim()) { alert('Nome e slug obrigatórios'); return; }
    // Valida slug
    if (!/^[a-z0-9-]+$/.test(form.slug)) { alert('Slug deve conter apenas letras minúsculas, números e hífens'); return; }
    setSaving(true);
    try {
      const data = {
        nome:          form.nome.trim(),
        slug:          form.slug.trim().toLowerCase(),
        ativo:         form.ativo,
        corPrimaria:   form.corPrimaria,
        corSecundaria: form.corSecundaria,
        corAcento:     form.corAcento,
        logo:          form.logo.trim(),
        descricao:     form.descricao.trim(),
        modoVerba:     form.modoVerba,
        updatedAt:     serverTimestamp(),
      };
      if (editando) {
        await updateDoc(doc(db, 'tenants', editando), data);
      } else {
        await addDoc(collection(db, 'tenants'), { ...data, createdAt: serverTimestamp() });
      }
      await carregar();
      setShowForm(false);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const toggleAtivo = async (t) => {
    await updateDoc(doc(db, 'tenants', t.id), { ativo: !t.ativo, updatedAt: serverTimestamp() });
    setTenants(p => p.map(x => x.id === t.id ? { ...x, ativo: !x.ativo } : x));
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Empresas (Tenants)</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Gerencie ambientes white-label para clientes corporativos</p>
        </div>
        <button onClick={abrirNovo} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          + Nova Empresa
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : tenants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhuma empresa cadastrada</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Crie o primeiro ambiente white-label</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tenants.map(t => (
            <div key={t.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Indicador de cor */}
              <div style={{ width: 40, height: 40, borderRadius: 10, background: t.corPrimaria || '#667eea', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700 }}>
                {t.logo ? <img src={t.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : (t.nome || 'T')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{t.nome}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', background: '#f8faff', padding: '2px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>{t.slug}.realizehub.com.br</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: t.ativo ? 'rgba(102,187,106,0.15)' : 'rgba(239,68,68,0.1)', color: t.ativo ? '#16a34a' : '#ef4444' }}>
                    {t.ativo ? 'ATIVO' : 'INATIVO'}
                  </span>
                </div>
                {t.descricao && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{t.descricao}</div>}
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Verba: {t.modoVerba === 'pool' ? 'Pool mensal/anual' : 'Por evento'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => abrirEditar(t)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                <button onClick={() => toggleAtivo(t)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${t.ativo ? 'rgba(239,68,68,0.3)' : 'rgba(102,187,106,0.3)'}`, background: 'none', color: t.ativo ? '#ef4444' : '#16a34a', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  {t.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de cadastro/edição */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{editando ? 'Editar Empresa' : 'Nova Empresa'}</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Nome da empresa *</label>
                  <input value={form.nome} onChange={e => setF('nome', e.target.value)} style={inp} placeholder="Ex: Ford do Brasil" />
                </div>
                <div>
                  <label style={lbl}>Slug (subdomínio) *</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input value={form.slug} onChange={e => setF('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} style={{ ...inp }} placeholder="ford" />
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{form.slug || 'slug'}.realizehub.com.br</div>
                </div>
              </div>

              <div>
                <label style={lbl}>Descrição</label>
                <input value={form.descricao} onChange={e => setF('descricao', e.target.value)} style={inp} placeholder="Ex: Rede de concessionárias Ford" />
              </div>

              <div>
                <label style={lbl}>Logo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {form.logo && (
                    <img src={form.logo} alt="Logo" style={{ height: 40, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 6, padding: 4 }} onError={e => e.target.style.display='none'} />
                  )}
                  <label style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: uploadingLogo ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    {uploadingLogo ? 'Enviando...' : form.logo ? 'Trocar logo' : 'Enviar logo'}
                    <input type="file" accept="image/*" onChange={handleLogoChange} disabled={uploadingLogo} style={{ display: 'none' }} />
                  </label>
                  {form.logo && !uploadingLogo && (
                    <button onClick={handleRemoverLogo} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Remover</button>
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5 }}>Preencha o slug antes de enviar a logo (usado na organização do arquivo).</div>
              </div>

              {/* Cores */}
              <div>
                <label style={lbl}>Identidade visual</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { key: 'corPrimaria',   label: 'Cor primária' },
                    { key: 'corSecundaria', label: 'Cor secundária' },
                    { key: 'corAcento',     label: 'Cor de acento' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="color" value={form[key]} onChange={e => setF(key, e.target.value)}
                          style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer', padding: 2 }} />
                        <input value={form[key]} onChange={e => setF(key, e.target.value)}
                          style={{ ...inp, flex: 1, fontSize: 11 }} placeholder="#000000" />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Preview */}
                <div style={{ marginTop: 10, padding: '12px 16px', borderRadius: 10, background: form.corPrimaria, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.corSecundaria }}>realize<span style={{ color: form.corAcento }}>hub</span></div>
                  <span style={{ fontSize: 11, color: form.corSecundaria, opacity: 0.7 }}>— preview do tema</span>
                </div>
              </div>

              {/* Modo de verba */}
              <div>
                <label style={lbl}>Modo de verba</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { id: 'por_evento', label: 'Por evento', desc: 'Admin aprova cada evento individualmente' },
                    { id: 'pool',       label: 'Pool',       desc: 'Franqueado tem verba mensal/anual disponível' },
                  ].map(opt => (
                    <button key={opt.id} onClick={() => setF('modoVerba', opt.id)}
                      style={{ padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${form.modoVerba === opt.id ? '#667eea' : '#e2e8f0'}`, background: form.modoVerba === opt.id ? 'rgba(102,126,234,0.06)' : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: form.modoVerba === opt.id ? '#667eea' : '#1e293b' }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ativo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="tenant-ativo" checked={form.ativo} onChange={e => setF('ativo', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#667eea' }} />
                <label htmlFor="tenant-ativo" style={{ fontSize: 13, color: '#475569', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Tenant ativo</label>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={salvar} disabled={saving || uploadingLogo} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: (saving || uploadingLogo) ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: (saving || uploadingLogo) ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
