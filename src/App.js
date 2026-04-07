import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
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
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
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
