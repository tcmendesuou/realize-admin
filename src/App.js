import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { auth } from './firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';
import Login from './pages/Login';
import Dashboard from './components/Dashboard';
import Projects from './components/Projects';
import RoleManagement from './components/RoleManagement';
import UserManagement from './components/UserManagement';
import AtendimentoHome from './components/AtendimentoHome';
import ProjetoScreen from './components/ProjetoScreen';
import ServiceManager from './components/ServiceManager';
import PricingManager from './components/PricingManager';
import SupplierManager from './components/SupplierManager';
import SupplierRegistration from './components/SupplierRegistration';
import ClientRegistration from './components/ClientRegistration';
import EquipeHome from './components/EquipeHome';
import FornecedorHome from './components/FornecedorHome';
import ClienteHome from './components/ClienteHome';
import ScriptManager from './components/ScriptManager';
import FinanceiroManager from './components/FinanceiroManager';
import './App.css';

function ProjetoScreenWrapper({ user, userData, onLogout }) {
  const { id } = useParams();
  return (
    <ProjetoScreen
      projectId={id}
      userData={userData || user}
      onBack={() => window.history.back()}
    />
  );
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [firestoreUser, setFirestoreUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    const stored = sessionStorage.getItem('firestoreUser');
    if (stored) { setFirestoreUser(JSON.parse(stored)); setLoading(false); }
    const onFirestoreLogin = () => {
      const data = sessionStorage.getItem('firestoreUser');
      if (data) setFirestoreUser(JSON.parse(data));
    };
    window.addEventListener('firestoreLogin', onFirestoreLogin);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      if (currentUser) await loadAdminData(currentUser.email);
      else setUserData(null);
      if (!sessionStorage.getItem('firestoreUser')) setLoading(false);
    });
    return () => { unsubscribe(); window.removeEventListener('firestoreLogin', onFirestoreLogin); };
  }, []);

  const loadAdminData = async (email) => {
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
      if (!snap.empty) setUserData({ id: snap.docs[0].id, ...snap.docs[0].data() });
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('firestoreUser');
    setFirestoreUser(null);
    try { await signOut(auth); } catch (e) {}
    setFirebaseUser(null);
    setUserData(null);
    setActiveView('dashboard');
  };

  if (loading) return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p>Carregando...</p>
    </div>
  );

  if (process.env.REACT_APP_MAINTENANCE === 'true') {
    return (
      <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 300, color: '#E8F4FF', letterSpacing: 3, marginBottom: 16 }}>
            realize<span style={{ color: '#00E5C4', fontWeight: 500 }}>hub</span>
          </div>
          <p style={{ fontSize: 14, color: '#7BAFD4' }}>Em breve</p>
        </div>
      </div>
    );
  }

  if (firestoreUser) {
    const systemRole = firestoreUser.systemRole || 'none';

    if (systemRole === 'workspace' || systemRole === 'equipe') {
      return (
        <Router>
          <Routes>
            <Route path="/projeto/:id" element={<ProjetoScreenWrapper user={firestoreUser} userData={firestoreUser} onLogout={handleLogout} />} />
            <Route path="*" element={<EquipeHome userData={firestoreUser} onLogout={handleLogout} />} />
          </Routes>
        </Router>
      );
    }

    if (systemRole === 'cliente') return <ClienteHome userData={firestoreUser} onLogout={handleLogout} />;

    if (systemRole === 'fornecedor_pendente') {
      return (
        <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif', padding: 20 }}>
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <div style={{ fontSize: 22, fontWeight: 300, color: '#E8F4FF', letterSpacing: 3, marginBottom: 32 }}>realize<span style={{ color: '#00E5C4', fontWeight: 500 }}>hub</span></div>
            <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid #FFA726', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FFA726', animation: 'pulse 2s ease-in-out infinite' }} />
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
            <h2 style={{ fontSize: 22, fontWeight: 500, color: '#E8F4FF', marginBottom: 12 }}>Cadastro em analise</h2>
            <p style={{ fontSize: 14, color: '#7BAFD4', lineHeight: 1.7, marginBottom: 32 }}>Seu pedido foi recebido e esta sendo analisado. Assim que aprovado, voce tera acesso completo.</p>
            <button onClick={handleLogout} style={{ padding: '10px 28px', borderRadius: 10, border: '1px solid rgba(0,229,196,0.3)', background: 'none', color: '#00E5C4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Sair</button>
          </div>
        </div>
      );
    }

    if (systemRole === 'fornecedor') {
      return (
        <Router>
          <Routes>
            <Route path="/projeto/:id" element={<ProjetoScreenWrapper user={firestoreUser} userData={firestoreUser} onLogout={handleLogout} />} />
            <Route path="*" element={<FornecedorHome userData={firestoreUser} onLogout={handleLogout} />} />
          </Routes>
        </Router>
      );
    }

    if (systemRole === 'admin') {
      // continua para o painel admin
    } else if (systemRole !== 'admin') {
      return (
        <div className="loading-container">
          <p style={{ color: '#e74c3c', fontFamily: 'Outfit, sans-serif' }}>Seu usuario nao tem acesso. Contate o administrador.</p>
          <button onClick={handleLogout} style={{ marginTop: 16, color: '#7BAFD4', background: 'none', border: '1px solid #7BAFD4', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Sair</button>
        </div>
      );
    }
  }

  if (!firebaseUser && !firestoreUser) {
    return (
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/fornecedor/cadastro" element={<SupplierRegistration />} />
          <Route path="/cliente/cadastro" element={<ClientRegistration />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    );
  }

  const isDiretora = userData?.roleName?.toLowerCase().includes('diretora');

  return (
    <Router>
      <div className="app-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1 className="logo">realize</h1>
            <p className="logo-subtitle">Admin Panel</p>
          </div>
          <nav className="sidebar-nav">
            <button className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('dashboard')}>
              <span className="nav-text">Dashboard</span>
            </button>
            <button className={activeView === 'projects' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('projects')}>
              <span className="nav-text">Projetos</span>
            </button>
            <div className="nav-separator" />
            <button className={activeView === 'services' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('services')}>
              <span className="nav-text">Servicos</span>
            </button>
            <button className={activeView === 'pricing' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('pricing')}>
              <span className="nav-text">Tabela de Precos</span>
            </button>
            <div className="nav-separator" />
            <button className={activeView === 'script' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('script')}>
              <span className="nav-text">Script da IA</span>
            </button>
            <div className="nav-separator" />
            <button className={activeView === 'roles' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('roles')}>
              <span className="nav-text">Gestao de Acessos</span>
            </button>
            <button className={activeView === 'suppliers' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('suppliers')}>
              <span className="nav-text">Fornecedores</span>
            </button>
            <button className={activeView === 'users' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('users')}>
              <span className="nav-text">Cadastros</span>
            </button>
            <div className="nav-separator" />
            <button className={activeView === 'financeiro' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('financeiro')}>
              <span className="nav-text">Financeiro</span>
            </button>
          </nav>
          <div className="sidebar-footer">
            <div className="user-info">
              <div className="user-avatar"></div>
              <div className="user-details">
                <p className="user-name">{firebaseUser?.email?.split('@')[0]}</p>
                <p className="user-email">{firebaseUser?.email}</p>
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout}>Sair</button>
          </div>
        </aside>

        <main className="main-content">
          <header className="top-header">
            <div className="header-left">
              <h2 className="page-title">
                {activeView === 'dashboard' && 'Dashboard'}
                {activeView === 'projects'  && 'Projetos'}
                {activeView === 'services'  && 'Servicos'}
                {activeView === 'pricing'   && 'Tabela de Precos'}
                {activeView === 'script'    && 'Script da IA'}
                {activeView === 'roles'     && 'Gestao de Acessos'}
                {activeView === 'suppliers' && 'Fornecedores'}
                {activeView === 'users'     && 'Cadastros'}
                {activeView === 'financeiro' && 'Financeiro'}
              </h2>
            </div>
            <div className="header-right">
              <div className="welcome-message">
                Ola, <strong>{firebaseUser?.email?.split('@')[0]}</strong>!
                {isDiretora && <span style={{ color: '#00E5C4', marginLeft: 8, fontSize: 12 }}>Diretora</span>}
              </div>
            </div>
          </header>
          <div className="content-area">
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'projects'  && <Projects />}
            {activeView === 'services'  && <ServiceManager />}
            {activeView === 'pricing'   && <PricingManager />}
            {activeView === 'script'    && <ScriptManager />}
            {activeView === 'roles'     && <RoleManagement />}
            {activeView === 'suppliers' && <SupplierManager />}
            {activeView === 'users'     && <UserManagement />}
            {activeView === 'financeiro' && <FinanceiroManager />}
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
