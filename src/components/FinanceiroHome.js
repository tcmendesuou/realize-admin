import React, { useState } from 'react';
import FinanceiroManager from './FinanceiroManager';

// Abas horizontais do painel Financeiro. Hoje só existe "Financeiro" em si,
// mas a estrutura já fica pronta pra receber outras abas no futuro
// (ex: Relatórios, Fechamento) sem precisar mexer no layout.
const TABS = [
  { id: 'financeiro', label: 'Financeiro' },
];

export default function FinanceiroHome({ userData, onLogout }) {
  const [activeTab, setActiveTab] = useState('financeiro');

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', flexDirection: 'column' }}>

      {/* Header — mesmo estilo do .top-header do admin, só que sem sidebar ao lado */}
      <div className="top-header">
        <div className="header-left">
          <div className="page-title">Painel Financeiro</div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span className="welcome-message">Olá, <strong>{userData?.name}</strong></span>
          <button onClick={onLogout}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(231,76,60,0.3)', background: 'none', color: 'rgba(231,76,60,0.8)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(231,76,60,0.1)'; e.currentTarget.style.color = '#E74C3C'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(231,76,60,0.8)'; }}>
            Sair
          </button>
        </div>
      </div>

      {/* Abas horizontais — é o que diferencia visualmente essa tela das outras (sem sidebar) */}
      <div style={{ background: '#0D1B2A', borderBottom: '1px solid rgba(0,180,255,0.1)', padding: '0 30px', display: 'flex', gap: 4, flexShrink: 0 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '14px 18px', background: 'none', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #00E5C4' : '2px solid transparent',
              color: activeTab === tab.id ? '#00E5C4' : '#7BAFD4',
              fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer', fontFamily: 'Outfit, sans-serif', letterSpacing: 0.3,
              transition: 'all 0.15s',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, padding: '28px 30px', overflow: 'auto', minHeight: 0 }}>
        {activeTab === 'financeiro' && <FinanceiroManager />}
      </div>
    </div>
  );
}
