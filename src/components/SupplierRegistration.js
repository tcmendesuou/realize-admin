import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function SupplierRegistration() {
  const [services, setServices] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: '', tradeName: '', cnpj: '', email: '', phone: '',
    city: '', state: '', website: '',
    selectedServices: [],
    description: '',
    contactName: '', contactRole: '', roleId: '', roleName: '',
    password: '', confirmPassword: '',
  });

  useEffect(() => { loadServices(); loadCargos(); }, []);

  const loadServices = async () => {
    const snap = await getDocs(query(collection(db, 'services'), orderBy('name')));
    setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false));
  };

  const loadCargos = async () => {
    try {
      const typesSnap = await getDocs(query(collection(db, 'userTypes'), where('systemRole', '==', 'fornecedor')));
      if (typesSnap.empty) return;
      const typeId = typesSnap.docs[0].id;
      const rolesSnap = await getDocs(query(collection(db, 'roles'), where('userTypeId', '==', typeId)));
      setCargos(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const setF = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const toggleService = (id) => {
    setForm(p => ({
      ...p,
      selectedServices: p.selectedServices.includes(id)
        ? p.selectedServices.filter(s => s !== id)
        : [...p.selectedServices, id]
    }));
  };

  const handleSubmit = async () => {
    if (!form.companyName.trim()) { alert('Nome da empresa obrigatório'); return; }
    if (!form.email.trim()) { alert('E-mail obrigatório'); return; }
    if (!form.phone.trim()) { alert('Telefone obrigatório'); return; }
    if (!form.city.trim() || !form.state) { alert('Cidade e estado obrigatórios'); return; }
    if (form.selectedServices.length === 0) { alert('Selecione ao menos um serviço'); return; }
    if (!form.contactName.trim()) { alert('Nome do contato obrigatorio'); return; }
    if (!form.password || form.password.length < 6) { alert('Senha deve ter ao menos 6 caracteres'); return; }
    if (form.password !== form.confirmPassword) { alert('As senhas nao conferem'); return; }

    setSaving(true);
    try {
      // Verifica se já existe cadastro com esse email
      const existing = await getDocs(query(collection(db, 'suppliers'), where('email', '==', form.email.trim().toLowerCase())));
      if (!existing.empty) { alert('Já existe um cadastro com este e-mail.'); setSaving(false); return; }

      const serviceNames = form.selectedServices.map(id => services.find(s => s.id === id)?.name).filter(Boolean);
      await addDoc(collection(db, 'suppliers'), {
        ...form,
        email: form.email.trim().toLowerCase(),
        serviceNames,
        roleId: form.roleId,
        roleName: form.roleName,
        password: form.password,
        status: 'pendente',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setStep(2);
    } catch (e) { console.error(e); alert('Erro ao enviar cadastro. Tente novamente.'); }
    finally { setSaving(false); }
  };

  const inp = {
    padding: '11px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
    fontSize: 14, fontFamily: 'Outfit, sans-serif', width: '100%',
    boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s',
    background: 'white',
  };
  const lbl = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };
  const section = { marginBottom: 28 };
  const sectionTitle = { fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: 0.5 };

  if (step === 2) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0D1B2A 0%,#1a2d42 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 20, padding: '48px 40px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg,#10b981,#059669)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>✓</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Cadastro enviado!</h2>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
          Recebemos seu pedido de homologação. Nossa equipe irá analisar e entrar em contato em até <strong>3 dias úteis</strong>.
        </p>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Você receberá um e-mail em <strong style={{ color: '#667eea' }}>{form.email}</strong></p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0D1B2A 0%,#1a2d42 100%)', fontFamily: 'Outfit, sans-serif', padding: '40px 20px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 24, fontWeight: 300, color: '#E8F4FF', letterSpacing: 3, marginBottom: 6 }}>
            realize<span style={{ color: '#00E5C4', fontWeight: 500 }}>hub</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'white', marginBottom: 8 }}>Seja um fornecedor</h1>
          <p style={{ fontSize: 15, color: '#7BAFD4', lineHeight: 1.5 }}>
            Preencha os dados abaixo para solicitar sua homologação na plataforma.
          </p>
        </div>

        {/* Form */}
        <div style={{ background: 'white', borderRadius: 20, padding: '32px 36px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          {/* Dados da empresa */}
          <div style={section}>
            <div style={sectionTitle}>Dados da Empresa</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Razão Social *</label>
                <input value={form.companyName} onChange={e => setF('companyName', e.target.value)} style={inp} placeholder="Nome completo da empresa" />
              </div>
              <div>
                <label style={lbl}>Nome Fantasia</label>
                <input value={form.tradeName} onChange={e => setF('tradeName', e.target.value)} style={inp} placeholder="Como é conhecido" />
              </div>
              <div>
                <label style={lbl}>CNPJ</label>
                <input value={form.cnpj} onChange={e => setF('cnpj', e.target.value)} style={inp} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label style={lbl}>E-mail *</label>
                <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} style={inp} placeholder="contato@empresa.com.br" />
              </div>
              <div>
                <label style={lbl}>Telefone / WhatsApp *</label>
                <input value={form.phone} onChange={e => setF('phone', e.target.value)} style={inp} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label style={lbl}>Cidade *</label>
                <input value={form.city} onChange={e => setF('city', e.target.value)} style={inp} placeholder="Sua cidade" />
              </div>
              <div>
                <label style={lbl}>Estado *</label>
                <select value={form.state} onChange={e => setF('state', e.target.value)} style={{ ...inp, background: 'white' }}>
                  <option value="">Selecione...</option>
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Site / Redes Sociais</label>
                <input value={form.website} onChange={e => setF('website', e.target.value)} style={inp} placeholder="www.suaempresa.com.br ou @perfil" />
              </div>
            </div>
          </div>

          {/* Serviços */}
          <div style={section}>
            <div style={sectionTitle}>Serviços que você executa *</div>
            {services.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: 16, textAlign: 'center' }}>Carregando serviços...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {services.map(s => {
                  const sel = form.selectedServices.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleService(s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${sel ? '#667eea' : '#e2e8f0'}`, background: sel ? '#f0f3ff' : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s' }}>
                      <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: sel ? '#667eea' : '#475569' }}>{s.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {form.selectedServices.length > 0 && (
              <p style={{ fontSize: 11, color: '#667eea', marginTop: 8 }}>{form.selectedServices.length} serviço(s) selecionado(s)</p>
            )}
          </div>

          {/* Sobre */}
          <div style={section}>
            <div style={sectionTitle}>Sobre você</div>
            <div>
              <label style={lbl}>Descreva brevemente seus serviços</label>
              <textarea value={form.description} onChange={e => setF('description', e.target.value)}
                style={{ ...inp, height: 80, resize: 'vertical' }}
                placeholder="Ex: Atuamos há 10 anos com buffet para eventos corporativos, com cardápio variado e equipe de 20 pessoas..." />
            </div>
          </div>

          {/* Contato */}
          <div style={section}>
            <div style={sectionTitle}>Contato Principal</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Nome *</label>
                <input value={form.contactName} onChange={e => setF('contactName', e.target.value)} style={inp} placeholder="Seu nome completo" />
              </div>
              <div>
                <label style={lbl}>Funcao / Posicao na empresa</label>
                {cargos.length > 0 ? (
                  <select value={form.roleId} onChange={e => {
                    const c = cargos.find(r => r.id === e.target.value);
                    setF('roleId', e.target.value);
                    setF('roleName', c?.name || '');
                    setF('contactRole', c?.name || '');
                  }} style={{ ...inp, background: 'white' }}>
                    <option value="">Selecione sua funcao...</option>
                    {cargos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <input value={form.contactRole} onChange={e => setF('contactRole', e.target.value)} style={inp} placeholder="Ex: Socio, Gerente comercial" />
                )}
              </div>
              <div>
                <label style={lbl}>Senha *</label>
                <input type="password" value={form.password} onChange={e => setF('password', e.target.value)} style={inp} placeholder="Minimo 6 caracteres" />
              </div>
              <div>
                <label style={lbl}>Confirmar senha *</label>
                <input type="password" value={form.confirmPassword} onChange={e => setF('confirmPassword', e.target.value)} style={inp} placeholder="Repita a senha" />
              </div>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={saving}
            style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.2s' }}>
            {saving ? 'Enviando...' : 'Enviar pedido de homologação'}
          </button>

          <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 12 }}>
            Ao enviar, você concorda com os termos de uso da plataforma Realize Hub.
          </p>
        </div>
      </div>
    </div>
  );
}
