import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';
import Login from './pages/Login';
import Dashboard from './components/Dashboard';
import Projects from './components/Projects';
import QuestionList from './components/QuestionList';
import TaskList from './components/TaskList';
import EventTypesList from './components/EventTypesList';
import FlowBuilderWrapper from './components/FlowBuilderWrapper';
import RoleManagement from './components/RoleManagement';
import CompaniesManager from './components/CompaniesManager';
import UserManagement from './components/UserManagement';
import AtendimentoHome from './components/AtendimentoHome';
import './App.css';

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [firestoreUser, setFirestoreUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    const stored = sessionStorage.getItem('firestoreUser');
    if (stored) {
      setFirestoreUser(JSON.parse(stored));
      setLoading(false);
    }

    const onFirestoreLogin = () => {
      const data = sessionStorage.getItem('firestoreUser');
      if (data) setFirestoreUser(JSON.parse(data));
    };
    window.addEventListener('firestoreLogin', onFirestoreLogin);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      if (currentUser) {
        await loadAdminData(currentUser.email);
      } else {
        setUserData(null);
      }
      if (!sessionStorage.getItem('firestoreUser')) {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('firestoreLogin', onFirestoreLogin);
    };
  }, []);

  const loadAdminData = async (email) => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setUserData({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    } catch (err) {
      console.error('Erro ao buscar dados do admin:', err);
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('firestoreUser');
    setFirestoreUser(null);
    try { await signOut(auth); } catch (e) {}
    setFirebaseUser(null);
    setUserData(null);
    setActiveView('dashboard');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Carregando...</p>
      </div>
    );
  }

  // ── ROTEAMENTO POR PERFIL ──────────────────────────────────────────────────

  if (firestoreUser) {
    const systemRole = firestoreUser.systemRole || 'none';

    // Atendimento → AtendimentoHome
    if (systemRole === 'atendimento') {
      return (
        <AtendimentoHome
          user={firestoreUser}
          userData={firestoreUser}
          onLogout={handleLogout}
        />
      );
    }

    // Diretora → AtendimentoHome (futuro: DiretoraPainel)
    if (systemRole === 'diretora') {
      return (
        <AtendimentoHome
          user={firestoreUser}
          userData={firestoreUser}
          onLogout={handleLogout}
        />
      );
    }

    // Cliente → Em breve
    if (systemRole === 'cliente') {
      return (
        <div className="loading-container">
          <p style={{ color: '#7BAFD4', fontFamily: 'sans-serif' }}>
            Área do cliente em breve...
          </p>
          <button onClick={handleLogout} style={{ marginTop: 16, color: '#7BAFD4', background: 'none', border: '1px solid #7BAFD4', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
            Sair
          </button>
        </div>
      );
    }

    // Admin via Firestore → painel completo (caso raro)
    if (systemRole === 'admin') {
      // cai no painel admin abaixo — não retorna aqui
    }

    // none ou desconhecido → acesso negado
    if (systemRole === 'none') {
      return (
        <div className="loading-container">
          <p style={{ color: '#e74c3c', fontFamily: 'sans-serif' }}>
            Seu usuário não tem acesso ao sistema. Contate o administrador.
          </p>
          <button onClick={handleLogout} style={{ marginTop: 16, color: '#7BAFD4', background: 'none', border: '1px solid #7BAFD4', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
            Sair
          </button>
        </div>
      );
    }
  }

  // Sem usuário logado → login
  if (!firebaseUser && !firestoreUser) {
    return (
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    );
  }

  // Admin via Firebase Auth (ou systemRole === 'admin') → painel completo
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
            {['dashboard','projects','flows','questions','tasks','eventTypes','roles','companies','users'].map(view => (
              <button
                key={view}
                className={activeView === view ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveView(view)}
              >
                <span className="nav-text">
                  {view === 'dashboard'   && 'Dashboard'}
                  {view === 'projects'    && 'Projetos'}
                  {view === 'flows'       && 'Fluxos'}
                  {view === 'questions'   && 'Perguntas'}
                  {view === 'tasks'       && 'Tarefas'}
                  {view === 'eventTypes'  && 'Tipos de Eventos'}
                  {view === 'roles'       && 'Gestão de Acessos'}
                  {view === 'companies'   && 'Empresas'}
                  {view === 'users'       && 'Cadastros'}
                </span>
              </button>
            ))}
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
                {activeView === 'dashboard'  && 'Dashboard'}
                {activeView === 'projects'   && 'Projetos'}
                {activeView === 'flows'      && 'Fluxos de Eventos'}
                {activeView === 'questions'  && 'Banco de Perguntas'}
                {activeView === 'tasks'      && 'Banco de Tarefas'}
                {activeView === 'eventTypes' && 'Tipos de Eventos'}
                {activeView === 'roles'      && 'Gestão de Acessos'}
                {activeView === 'companies'  && 'Empresas'}
                {activeView === 'users'      && 'Cadastros'}
              </h2>
            </div>
            <div className="header-right">
              <div className="welcome-message">
                Olá, <strong>{firebaseUser?.email?.split('@')[0]}</strong>!
                {isDiretora && <span style={{ color: '#00E5C4', marginLeft: 8, fontSize: 12 }}>Diretora</span>}
              </div>
            </div>
          </header>

          <div className="content-area">
            {activeView === 'dashboard'  && <Dashboard />}
            {activeView === 'projects'   && <Projects />}
            {activeView === 'flows'      && <FlowBuilderWrapper />}
            {activeView === 'questions'  && <QuestionList />}
            {activeView === 'tasks'      && <TaskList />}
            {activeView === 'eventTypes' && <EventTypesList />}
            {activeView === 'roles'      && <RoleManagement />}
            {activeView === 'companies'  && <CompaniesManager />}
            {activeView === 'users'      && <UserManagement />}
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
