import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (firebaseErr) {
      try {
        const emailClean = email.toLowerCase().trim();

        // 1. Tenta em users (equipe, cliente, admin homologado)
        const qUsers = query(collection(db, 'users'), where('email', '==', emailClean), where('password', '==', password));
        const snapUsers = await getDocs(qUsers);
        if (!snapUsers.empty) {
          const userData = { id: snapUsers.docs[0].id, ...snapUsers.docs[0].data() };
          if (userData.active === false) {
            setError('Usuario inativo. Entre em contato com o administrador.');
            return;
          }
          sessionStorage.setItem('firestoreUser', JSON.stringify(userData));
          window.dispatchEvent(new Event('firestoreLogin'));
          return;
        }

        // 2. Tenta em suppliers (fornecedor pendente ou homologado)
        const qSuppliers = query(collection(db, 'suppliers'), where('email', '==', emailClean), where('password', '==', password));
        const snapSuppliers = await getDocs(qSuppliers);
        if (!snapSuppliers.empty) {
          const supplier = { id: snapSuppliers.docs[0].id, ...snapSuppliers.docs[0].data() };
          if (supplier.status === 'pendente') {
            // Loga mas com flag de pendente — App.js vai mostrar tela de aguardando
            const pendingUser = {
              id: supplier.id,
              name: supplier.contactName || supplier.tradeName || supplier.companyName,
              email: supplier.email,
              systemRole: 'fornecedor_pendente',
              supplierData: supplier,
            };
            sessionStorage.setItem('firestoreUser', JSON.stringify(pendingUser));
            window.dispatchEvent(new Event('firestoreLogin'));
            return;
          }
          if (supplier.status === 'recusado') {
            setError('Seu cadastro foi recusado. Entre em contato com o suporte.');
            return;
          }
          // Homologado mas sem users ainda — usa dados do supplier
          const userData = {
            id: supplier.userId || supplier.id,
            name: supplier.contactName || supplier.tradeName,
            email: supplier.email,
            systemRole: 'fornecedor',
            supplierId: supplier.id,
          };
          sessionStorage.setItem('firestoreUser', JSON.stringify(userData));
          window.dispatchEvent(new Event('firestoreLogin'));
          return;
        }

        setError('Email ou senha incorretos.');
      } catch (firestoreErr) {
        console.error('Erro Firestore:', firestoreErr);
        setError('Erro ao conectar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .rl-wrap {
          min-height: 100vh;
          font-family: 'Outfit', sans-serif;
          background: #0D1B2A;
          color: #E8F4FF;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        /* BG */
        .rl-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 70% 60% at 35% 40%, rgba(0,80,140,0.45) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 70% 65%, rgba(0,20,60,0.6) 0%, transparent 70%),
            #0D1B2A;
        }

        /* PARTICLES */
        .rl-particles { position: fixed; inset: 0; z-index: 1; overflow: hidden; pointer-events: none; }
        .rl-particle { position: absolute; border-radius: 50%; animation: rl-float linear infinite; opacity: 0; }
        @keyframes rl-float {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 1; } 90% { opacity: 0.5; }
          100% { transform: translateY(-110vh); opacity: 0; }
        }

        /* HEADER */
        .rl-header {
          position: relative; z-index: 2;
          padding: 24px 40px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* Anel animado pequeno no header */
        .rl-header-ring { flex-shrink: 0; }
        .rl-ring-svg .ring-arc {
          transform-origin: 20px 20px;
          animation: rl-rotate 6s linear infinite;
        }
        @keyframes rl-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .rl-header-name {
          font-size: 20px;
          font-weight: 300;
          letter-spacing: 3px;
          color: #E8F4FF;
          line-height: 1;
        }
        .rl-header-name span { color: #00E5C4; font-weight: 500; }

        /* MAIN CONTENT */
        .rl-main {
          position: relative; z-index: 2;
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 420px;
        }

        /* LEFT */
        .rl-left {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 40px 80px;
          animation: rl-fadeUp 0.8s ease both;
        }

        /* LOGO OLHO — destaque principal */
        .rl-logo-main {
          margin-bottom: 40px;
        }
        .rl-logo-main img {
          width: 520px;
          height: auto;
          object-fit: contain;
          filter: drop-shadow(0 0 30px rgba(0,229,196,0.2));
        }

        .rl-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(0,229,196,0.08); border: 1px solid rgba(0,229,196,0.25);
          border-radius: 20px; padding: 6px 14px;
          font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
          color: #00E5C4; margin-bottom: 24px; width: fit-content;
          animation: rl-fadeUp 0.8s 0.1s ease both;
        }
        .rl-badge-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #00E5C4; animation: rl-pulse 2s ease-in-out infinite;
        }
        @keyframes rl-pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }

        .rl-headline {
          font-size: clamp(28px, 3vw, 46px); font-weight: 200; line-height: 1.2;
          margin-bottom: 18px; animation: rl-fadeUp 0.8s 0.2s ease both;
        }
        .rl-headline strong {
          font-weight: 500;
          background: linear-gradient(90deg, #00E5C4, #0080FF);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }

        .rl-sub {
          font-size: 15px; font-weight: 300; color: #7BAFD4;
          line-height: 1.7; max-width: 400px; margin-bottom: 40px;
          animation: rl-fadeUp 0.8s 0.3s ease both;
        }

        .rl-features { display: flex; flex-direction: column; gap: 12px; animation: rl-fadeUp 0.8s 0.4s ease both; }
        .rl-feature { display: flex; align-items: center; gap: 12px; font-size: 13px; color: #7BAFD4; font-weight: 300; }
        .rl-feature-line { width: 24px; height: 1px; background: linear-gradient(90deg, #00E5C4, #0080FF); flex-shrink: 0; }

        /* RIGHT — LOGIN */
        .rl-right {
          display: flex; align-items: center; justify-content: center;
          padding: 40px 48px;
          border-left: 1px solid rgba(0,180,255,0.12);
          background: rgba(10,22,38,0.6); backdrop-filter: blur(20px);
          animation: rl-fadeIn 1s 0.2s ease both;
        }

        .rl-box { width: 100%; max-width: 320px; }
        .rl-title { font-size: 22px; font-weight: 300; margin-bottom: 6px; letter-spacing: 0.5px; }
        .rl-subtitle { font-size: 13px; color: #7BAFD4; margin-bottom: 32px; font-weight: 300; }

        .rl-field { margin-bottom: 16px; }
        .rl-field label { display: block; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #7BAFD4; margin-bottom: 8px; }
        .rl-field input {
          width: 100%; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(0,180,255,0.12); border-radius: 10px;
          padding: 13px 16px; font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 300; color: #E8F4FF; outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .rl-field input::placeholder { color: rgba(123,175,212,0.35); }
        .rl-field input:focus { border-color: rgba(0,229,196,0.4); background: rgba(0,229,196,0.04); }

        .rl-error {
          background: rgba(231,76,60,0.12); border: 1px solid rgba(231,76,60,0.3);
          border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #ff6b6b;
          margin-bottom: 16px; text-align: center;
        }

        .rl-btn {
          width: 100%; padding: 14px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, #00E5C4 0%, #0080FF 100%);
          color: #fff; font-family: 'Outfit', sans-serif; font-size: 14px;
          font-weight: 500; letter-spacing: 1px; cursor: pointer; margin-top: 8px;
          transition: opacity 0.2s, transform 0.15s;
        }
        .rl-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .rl-btn:active:not(:disabled) { transform: translateY(0); }
        .rl-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .rl-note {
          margin-top: 24px; text-align: center; padding: 12px;
          background: rgba(0,229,196,0.05); border: 1px solid rgba(0,229,196,0.15);
          border-radius: 10px; font-size: 11px; color: #00E5C4;
          font-weight: 300; letter-spacing: 0.5px; line-height: 1.6;
        }

        .rl-footer { margin-top: 28px; text-align: center; font-size: 11px; color: rgba(123,175,212,0.3); }

        @keyframes rl-fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rl-fadeIn { from { opacity: 0; } to { opacity: 1; } }

        @media (max-width: 800px) {
          .rl-main { grid-template-columns: 1fr; }
          .rl-left { display: none; }
          .rl-right { border-left: none; background: transparent; padding: 40px 24px; }
          .rl-header { padding: 24px; }
        }
      `}</style>

      <div className="rl-bg" />

      <div className="rl-particles" ref={el => {
        if (el && el.children.length === 0) {
          const colors = ['#00E5C4','#0080FF','#0057B3','#00C4A0'];
          for (let i = 0; i < 50; i++) {
            const p = document.createElement('div');
            p.className = 'rl-particle';
            const size = Math.random() * 2.5 + 0.5;
            p.style.cssText = `width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random()*colors.length)]};left:${Math.random()*100}%;bottom:-10px;animation-delay:${Math.random()*20}s;animation-duration:${Math.random()*18+12}s;`;
            el.appendChild(p);
          }
        }
      }} />

      <div className="rl-wrap">

        {/* HEADER — realizehub com anel animado */}
        <header className="rl-header">
          <div className="rl-header-ring">
            <svg className="rl-ring-svg" width="40" height="40" viewBox="0 0 40 40" fill="none">
              <defs>
                <radialGradient id="rl-sphere-h" cx="40%" cy="35%" r="60%">
                  <stop offset="0%" stopColor="#1a4060"/>
                  <stop offset="100%" stopColor="#060e1a"/>
                </radialGradient>
                <linearGradient id="rl-grad-h" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00E5C4"/>
                  <stop offset="100%" stopColor="#0080FF"/>
                </linearGradient>
              </defs>
              <circle cx="20" cy="20" r="12" fill="url(#rl-sphere-h)"/>
              <circle cx="20" cy="20" r="17" stroke="url(#rl-grad-h)" strokeWidth="2"
                strokeDasharray="72 22" strokeLinecap="round" className="ring-arc"/>
              <circle cx="5"  cy="12" r="0.8" fill="#00E5C4" opacity="0.7"/>
              <circle cx="35" cy="22" r="0.8" fill="#0080FF" opacity="0.7"/>
              <circle cx="32" cy="30" r="0.6" fill="#0080FF" opacity="0.5"/>
            </svg>
          </div>
          {/* R alinhado ao centro do círculo */}
          <div className="rl-header-name">
            realize<span style={{ color: '#00E5C4', fontWeight: 500 }}>hub</span>
          </div>
        </header>

        {/* MAIN */}
        <main className="rl-main">

          {/* LEFT */}
          <div className="rl-left">

            {/* LOGO OLHO — destaque */}
            <div className="rl-logo-main">
              <img src="/logo.png" alt="Realize" />
            </div>

            <div className="rl-badge">
              <div className="rl-badge-dot" />
              Em breve
            </div>

            <h1 className="rl-headline">
              Do briefing à execução.<br/>
              <strong>Tudo em um só lugar.</strong>
            </h1>

            <p className="rl-sub">
              A plataforma completa para gestão de eventos corporativos — do primeiro contato à conclusão do projeto.
            </p>

            <div className="rl-features">
              <div className="rl-feature"><div className="rl-feature-line"/>Gestão de projetos em tempo real</div>
              <div className="rl-feature"><div className="rl-feature-line"/>Fluxos personalizados por tipo de evento</div>
              <div className="rl-feature"><div className="rl-feature-line"/>Controle total de equipe e fornecedores</div>
              <div className="rl-feature"><div className="rl-feature-line"/>Web, mobile e desktop — onde precisar</div>
            </div>
          </div>

          {/* RIGHT — LOGIN */}
          <div className="rl-right">
            <div className="rl-box">
              <div className="rl-title">Bem-vindo</div>
              <div className="rl-subtitle">Acesse sua conta</div>

              <form onSubmit={handleLogin}>
                <div className="rl-field">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required/>
                </div>
                <div className="rl-field">
                  <label>Senha</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required/>
                </div>
                {error && <div className="rl-error">{error}</div>}
                <button type="submit" className="rl-btn" disabled={loading}>
                  {loading ? 'Entrando...' : 'ENTRAR'}
                </button>
              </form>

              <div style={{ display: 'none' }}>
                <a href="/cliente/cadastro" style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 10, border: '1px solid rgba(0,229,196,0.3)', background: 'rgba(0,229,196,0.05)', color: '#00E5C4', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, letterSpacing: 1, textAlign: 'center', textDecoration: 'none', transition: 'all 0.2s', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,196,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,229,196,0.05)'}>
                  CRIAR CONTA
                </a>
                <a href="/fornecedor/cadastro" style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.2)', background: 'rgba(0,180,255,0.04)', color: '#7BAFD4', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 400, letterSpacing: 1, textAlign: 'center', textDecoration: 'none', transition: 'all 0.2s', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,180,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,180,255,0.04)'}>
                  SOU FORNECEDOR
                </a>
              </div>

              <div className="rl-footer" style={{ marginTop: 20 }}>© 2026 Realize Hub · Todos os direitos reservados</div>
            </div>
          </div>

        </main>
      </div>
    </>
  );
}

export default Login;
