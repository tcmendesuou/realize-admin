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
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadUserData(currentUser.email);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadUserData = async (email) => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setUserData(data);
      }
    } catch (err) {
      console.error('Erro ao buscar dados do usuário:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserData(null);
      setActiveView('dashboard');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    );
  }

  // ── ROTEAMENTO POR PERFIL ──────────────────────────────────────────────────

  // Atendimento (equipe sem "diretora" no roleName)
  const isAtendimento =
    userData?.userType === 'equipe' &&
    !userData?.roleName?.toLowerCase().includes('diretora');

  // Diretora
  const isDiretora =
    userData?.userType === 'equipe' &&
    userData?.roleName?.toLowerCase().includes('diretora');

  // Cliente
  const isCliente = userData?.userType === 'cliente';

  // Se for atendimento, mostra a home de atendimento
  if (isAtendimento) {
    return (
      <AtendimentoHome
        user={user}
        userData={userData}
        onLogout={handleLogout}
      />
    );
  }

  // Se for cliente (futuro)
  if (isCliente) {
    return (
      <div className="loading-container">
        <p style={{ color: '#7BAFD4', fontFamily: 'sans-serif' }}>
          Área do cliente em breve...
        </p>
      </div>
    );
  }

  // Admin / Diretora — painel completo
  return (
    <Router>
      <div className="app-container">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1 className="logo">✨ Realize</h1>
            <p className="logo-subtitle">Admin Panel</p>
          </div>

          <nav className="sidebar-nav">
            <button
              className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('dashboard')}
            >
              <span className="nav-text">Dashboard</span>
            </button>

            <button
              className={activeView === 'projects' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('projects')}
            >
              <span className="nav-text">Projetos</span>
            </button>

            <button
              className={activeView === 'flows' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('flows')}
            >
              <span className="nav-text">Fluxos</span>
            </button>

            <button
              className={activeView === 'questions' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('questions')}
            >
              <span className="nav-text">Perguntas</span>
            </button>

            <button
              className={activeView === 'tasks' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('tasks')}
            >
              <span className="nav-text">Tarefas</span>
            </button>

            <button
              className={activeView === 'eventTypes' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('eventTypes')}
            >
              <span className="nav-text">Tipos de Eventos</span>
            </button>

            <button
              className={activeView === 'roles' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('roles')}
            >
              <span className="nav-text">Gestão de Acessos</span>
            </button>

            <button
              className={activeView === 'companies' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('companies')}
            >
              <span className="nav-text">Empresas</span>
            </button>

            <button
              className={activeView === 'users' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('users')}
            >
              <span className="nav-text">Cadastros</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="user-info">
              <div className="user-avatar"></div>
              <div className="user-details">
                <p className="user-name">{user.email?.split('@')[0]}</p>
                <p className="user-email">{user.email}</p>
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="main-content">
          <header className="top-header">
            <div className="header-left">
              <h2 className="page-title">
                {activeView === 'dashboard' && 'Dashboard'}
                {activeView === 'projects' && 'Projetos'}
                {activeView === 'flows' && 'Fluxos de Eventos'}
                {activeView === 'questions' && 'Banco de Perguntas'}
                {activeView === 'tasks' && 'Banco de Tarefas'}
                {activeView === 'eventTypes' && 'Tipos de Eventos'}
                {activeView === 'roles' && 'Gestão de Acessos'}
                {activeView === 'companies' && 'Empresas'}
                {activeView === 'users' && 'Cadastros'}
              </h2>
            </div>
            <div className="header-right">
              <div className="welcome-message">
                Olá, <strong>{user.email?.split('@')[0]}</strong>!
                {isDiretora && <span style={{ color: '#00E5C4', marginLeft: 8, fontSize: 12 }}>Diretora</span>}
              </div>
            </div>
          </header>

          <div className="content-area">
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'projects' && <Projects />}
            {activeView === 'flows' && <FlowBuilderWrapper />}
            {activeView === 'questions' && <QuestionList />}
            {activeView === 'tasks' && <TaskList />}
            {activeView === 'eventTypes' && <EventTypesList />}
            {activeView === 'roles' && <RoleManagement />}
            {activeView === 'companies' && <CompaniesManager />}
            {activeView === 'users' && <UserManagement />}
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
