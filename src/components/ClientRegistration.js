import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function ClientRegistration() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [cargos, setCargos] = useState([]);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', city: '', state: '', companyName: '',
    password: '', confirmPassword: '', roleId: '', roleName: '',
  });

  useEffect(() => { loadCargos(); }, []);

  const loadCargos = async () => {
    try {
      // Busca o tipo "Cliente" e os cargos vinculados
      const typesSnap = await getDocs(query(collection(db, 'userTypes'), where('systemRole', '==', 'cliente')));
      if (typesSnap.empty) return;
      const typeId = typesSnap.docs[0].id;
      const rolesSnap = await getDocs(query(collection(db, 'roles'), where('userTypeId', '==', typeId)));
      setCargos(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const setF = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim())  { alert('Nome obrigatorio'); return; }
    if (!form.email.trim()) { alert('E-mail obrigatorio'); return; }
    if (!form.phone.trim()) { alert('Telefone obrigatorio'); return; }
    if (!form.password || form.password.length < 6) { alert('Senha deve ter ao menos 6 caracteres'); return; }
    if (form.password !== form.confirmPassword) { alert('As senhas nao conferem'); return; }

    setSaving(true);
    try {
      const existing = await getDocs(query(collection(db, 'users'), where('email', '==', form.email.trim().toLowerCase())));
      if (!existing.empty) { alert('Ja existe uma conta com este e-mail.'); setSaving(false); return; }

      await addDoc(collection(db, 'users'), {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        state: form.state,
        companyName: form.companyName.trim(),
        roleId: form.roleId,
        roleName: form.roleName,
        password: form.password,
        systemRole: 'cliente',
        active: true,
        createdAt: new Date(),
      });
      setStep(2);
    } catch (e) { console.error(e); alert('Erro ao criar conta. Tente novamente.'); }
    finally { setSaving(false); }
  };

  const inp = {
    padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
    fontSize: 14, fontFamily: 'Outfit, sans-serif', width: '100%',
    boxSizing: 'border-box', outline: 'none', background: 'white',
  };
  const lbl = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };

  if (step === 2) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0D1B2A 0%,#1a2d42 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#00E5C4,#0080FF)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28, color: 'white', fontWeight: 700 }}>✓</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Conta criada!</h2>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
          Bem-vindo ao Realize Hub. Sua conta foi criada com sucesso.
        </p>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 28 }}>
          Acesse com o e-mail <strong style={{ color: '#667eea' }}>{form.email}</strong>
        </p>
        <a href="/login" style={{ display: 'block', padding: '13px', borderRadius: 10, background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none', fontFamily: 'Outfit, sans-serif' }}>
          Entrar agora
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0D1B2A 0%,#1a2d42 100%)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 26, fontWeight: 300, color: '#E8F4FF', letterSpacing: 3, marginBottom: 6 }}>
            realize<span style={{ color: '#00E5C4', fontWeight: 500 }}>hub</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'white', marginBottom: 6 }}>Criar conta</h1>
          <p style={{ fontSize: 14, color: '#7BAFD4' }}>Comece a planejar seu evento agora</p>
        </div>

        {/* Card */}
        <div style={{ background: 'white', borderRadius: 20, padding: '32px 36px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Nome completo *</label>
              <input value={form.name} onChange={e => setF('name', e.target.value)} style={inp} placeholder="Como podemos te chamar?" />
            </div>
            <div>
              <label style={lbl}>E-mail *</label>
              <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} style={inp} placeholder="seu@email.com" />
            </div>
            <div>
              <label style={lbl}>Telefone / WhatsApp *</label>
              <input value={form.phone} onChange={e => setF('phone', e.target.value)} style={inp} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label style={lbl}>Empresa / Organizacao</label>
              <input value={form.companyName} onChange={e => setF('companyName', e.target.value)} style={inp} placeholder="Nome da empresa (opcional)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
              <div>
                <label style={lbl}>Cidade</label>
                <input value={form.city} onChange={e => setF('city', e.target.value)} style={inp} placeholder="Sua cidade" />
              </div>
              <div>
                <label style={lbl}>Estado</label>
                <select value={form.state} onChange={e => setF('state', e.target.value)} style={{ ...inp, background: 'white' }}>
                  <option value="">UF</option>
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            {cargos.length > 0 && (
              <div>
                <label style={lbl}>Funcao / Perfil</label>
                <select value={form.roleId} onChange={e => {
                  const c = cargos.find(r => r.id === e.target.value);
                  setF('roleId', e.target.value);
                  setF('roleName', c?.name || '');
                }} style={{ ...inp, background: 'white' }}>
                  <option value="">Selecione sua funcao...</option>
                  {cargos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Senha *</label>
              <input type="password" value={form.password} onChange={e => setF('password', e.target.value)} style={inp} placeholder="Minimo 6 caracteres" />
            </div>
            <div>
              <label style={lbl}>Confirmar senha *</label>
              <input type="password" value={form.confirmPassword} onChange={e => setF('confirmPassword', e.target.value)} style={inp} placeholder="Repita a senha"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
          </div>

          <button onClick={handleSubmit} disabled={saving}
            style={{ width: '100%', marginTop: 24, padding: '14px', borderRadius: 10, border: 'none', background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            {saving ? 'Criando conta...' : 'Criar conta'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#94a3b8' }}>
            Ja tem conta?{' '}
            <a href="/login" style={{ color: '#00E5C4', textDecoration: 'none', fontWeight: 600 }}>Entrar</a>
          </p>
        </div>
      </div>
    </div>
  );
}
