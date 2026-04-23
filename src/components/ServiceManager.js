import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';

const INITIAL_SERVICES = [
  { name: 'Espaço / Venue', icon: '🏛️', description: 'Salões, sítios, espaços para eventos' },
  { name: 'Buffet / Gastronomia', icon: '🍽️', description: 'Serviços de alimentação e refeições' },
  { name: 'Bebidas / Bar', icon: '🍹', description: 'Open bar, chopeiras, sommelier' },
  { name: 'Decoração', icon: '✨', description: 'Decoração temática e ambientação' },
  { name: 'Flores / Arranjos', icon: '💐', description: 'Arranjos florais e paisagismo' },
  { name: 'Fotografia', icon: '📷', description: 'Cobertura fotográfica do evento' },
  { name: 'Filmagem / Vídeo', icon: '🎥', description: 'Cobertura audiovisual e edição' },
  { name: 'DJ', icon: '🎧', description: 'Discotecagem e trilha sonora' },
  { name: 'Banda / Música ao Vivo', icon: '🎸', description: 'Apresentações musicais ao vivo' },
  { name: 'Iluminação', icon: '💡', description: 'Iluminação cênica e arquitetural' },
  { name: 'Sonorização', icon: '🔊', description: 'Equipamentos de som e PA' },
  { name: 'Mestre de Cerimônias', icon: '🎤', description: 'Condução e apresentação do evento' },
  { name: 'Segurança', icon: '🛡️', description: 'Equipes de segurança patrimonial' },
  { name: 'Recepção / Promotoras', icon: '🤝', description: 'Recepcionistas e promotores' },
  { name: 'Transporte', icon: '🚌', description: 'Transfer, vans e ônibus' },
  { name: 'Limpeza', icon: '🧹', description: 'Limpeza e conservação do espaço' },
  { name: 'Tendas / Estrutura', icon: '⛺', description: 'Tendas, palcos e estruturas' },
  { name: 'Mobiliário', icon: '🪑', description: 'Mesas, cadeiras, lounges' },
  { name: 'Brindes / Personalizados', icon: '🎁', description: 'Lembranças e itens personalizados' },
  { name: 'Tecnologia / Telão', icon: '📺', description: 'Projeção, telões e tecnologia' },
];

export default function ServiceManager() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [form, setForm] = useState({ name: '', icon: '', description: '', active: true });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'services'), orderBy('name')));
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const seedServices = async () => {
    if (!window.confirm(`Criar ${INITIAL_SERVICES.length} serviços padrão?`)) return;
    setSeeding(true);
    try {
      for (const s of INITIAL_SERVICES) {
        await addDoc(collection(db, 'services'), { ...s, active: true, createdAt: new Date() });
      }
      await loadServices();
    } catch (e) { console.error(e); alert('Erro ao criar serviços.'); }
    finally { setSeeding(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Nome obrigatório'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'services', editing), { ...form, updatedAt: new Date() });
      } else {
        await addDoc(collection(db, 'services'), { ...form, createdAt: new Date() });
      }
      await loadServices();
      setForm({ name: '', icon: '', description: '', active: true });
      setEditing(null);
      setShowForm(false);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleEdit = (s) => {
    setForm({ name: s.name, icon: s.icon || '', description: s.description || '', active: s.active !== false });
    setEditing(s.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este serviço?')) return;
    await deleteDoc(doc(db, 'services', id));
    await loadServices();
  };

  const toggleActive = async (s) => {
    await updateDoc(doc(db, 'services', s.id), { active: !s.active });
    await loadServices();
  };

  const inp = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Serviços</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Tipos de serviços disponíveis para fornecedores</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {services.length === 0 && (
            <button onClick={seedServices} disabled={seeding}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              {seeding ? 'Criando...' : '+ Criar padrões'}
            </button>
          )}
          <button onClick={() => { setForm({ name: '', icon: '', description: '', active: true }); setEditing(null); setShowForm(true); }}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            + Novo Serviço
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>{editing ? 'Editar Serviço' : 'Novo Serviço'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 2fr', gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Ícone</label><input value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} style={{ ...inp, textAlign: 'center', fontSize: 20 }} placeholder="🎯" /></div>
            <div><label style={lbl}>Nome *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={inp} placeholder="Ex: Buffet" /></div>
            <div><label style={lbl}>Descrição</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} placeholder="Breve descrição do serviço" /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input type="checkbox" id="svc-active" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#667eea' }} />
            <label htmlFor="svc-active" style={{ fontSize: 13, color: '#64748b', cursor: 'pointer' }}>Serviço ativo</label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : services.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <p style={{ fontSize: 14 }}>Nenhum serviço cadastrado ainda.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Clique em "Criar padrões" para começar com serviços comuns de eventos.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {services.map(s => (
            <div key={s.id} style={{ background: 'white', borderRadius: 10, border: `1px solid ${s.active !== false ? '#e2e8f0' : '#f1f5f9'}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: s.active !== false ? 1 : 0.5, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>{s.icon || '🎯'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{s.name}</div>
                {s.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.description}</div>}
                <div style={{ marginTop: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: s.active !== false ? '#dcfce7' : '#f1f5f9', color: s.active !== false ? '#16a34a' : '#94a3b8' }}>
                    {s.active !== false ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <button onClick={() => handleEdit(s)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                <button onClick={() => toggleActive(s)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${s.active !== false ? '#fde68a' : '#bbf7d0'}`, background: 'none', color: s.active !== false ? '#d97706' : '#16a34a', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  {s.active !== false ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => handleDelete(s.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
