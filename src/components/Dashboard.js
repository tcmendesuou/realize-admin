import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

function formatBRL(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function Dashboard() {
  const [budgets, setBudgets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState('todos');

  useEffect(() => {
    getDocs(query(collection(db, 'budgets'), orderBy('createdAt', 'desc')))
      .then(snap => {
        setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => !d.parentBudgetId));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filtro por período
  const filtrados = budgets.filter(b => {
    if (filtro === 'todos') return true;
    const d = b.createdAt?.toDate ? b.createdAt.toDate() : null;
    if (!d) return false;
    const hoje = new Date();
    if (filtro === 'mes') return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    if (filtro === 'trimestre') {
      const diff = (hoje.getFullYear() - d.getFullYear()) * 12 + hoje.getMonth() - d.getMonth();
      return diff <= 3;
    }
    return true;
  });

  // Stats de projetos
  const stats = {
    total:          filtrados.length,
    analise:        filtrados.filter(b => b.status === 'analyzing').length,
    aguardando:     filtrados.filter(b => b.status === 'pendingApproval').length,
    aprovado:       filtrados.filter(b => b.status === 'approved').length,
    acontecendo:    filtrados.filter(b => b.workspaceStage === 'Acontecendo').length,
    concluido:      filtrados.filter(b => b.status === 'completed').length,
    recusado:       filtrados.filter(b => b.status === 'rejected').length,
  };

  // Stats financeiros
  const totalFaturamento  = filtrados.reduce((acc, b) => acc + (b.financeiro?.valorTotal || 0), 0);
  const totalRecebido     = filtrados.reduce((acc, b) => acc + (b.financeiro?.parcelas || []).filter(p => p.pago).reduce((s, p) => s + p.valor, 0), 0);
  const totalFornecedores = filtrados.reduce((acc, b) => acc + (b.financeiro?.valorFornecedores || 0), 0);
  const totalFornPago     = filtrados.reduce((acc, b) => acc + (b.financeiro?.pagamentosFornecedores || []).filter(p => p.pago).reduce((s, p) => s + p.valor, 0), 0);
  const totalMargem       = filtrados.reduce((acc, b) => acc + (b.financeiro?.valorFee || 0), 0);
  const totalImpostos     = filtrados.reduce((acc, b) => acc + (b.financeiro?.valorImpostos || 0), 0);

  const statsProjetos = [
    { label: 'Total',         value: stats.total,       color: '#667eea', bg: 'rgba(102,126,234,0.1)' },
    { label: 'Em Análise',    value: stats.analise,     color: '#7BAFD4', bg: 'rgba(123,175,212,0.1)' },
    { label: 'Ag. Aprovação', value: stats.aguardando,  color: '#FFA726', bg: 'rgba(255,167,38,0.1)' },
    { label: 'Aprovados',     value: stats.aprovado,    color: '#00E5C4', bg: 'rgba(0,229,196,0.1)' },
    { label: 'Acontecendo',   value: stats.acontecendo, color: '#AB47BC', bg: 'rgba(171,71,188,0.1)' },
    { label: 'Concluídos',    value: stats.concluido,   color: '#66BB6A', bg: 'rgba(102,187,106,0.1)' },
    { label: 'Recusados',     value: stats.recusado,    color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  ];

  const statsFinanceiros = [
    { label: 'Faturamento total',    value: totalFaturamento,  color: '#667eea', bold: true },
    { label: 'Recebido de clientes', value: totalRecebido,     color: '#66BB6A' },
    { label: 'A receber',            value: totalFaturamento - totalRecebido, color: '#FFA726' },
    { label: 'Custo fornecedores',   value: totalFornecedores, color: '#7BAFD4' },
    { label: 'Pago a fornecedores',  value: totalFornPago,     color: '#94a3b8' },
    { label: 'Margem (fee)',         value: totalMargem,       color: '#00E5C4' },
    { label: 'Impostos gerados',     value: totalImpostos,     color: '#ef4444' },
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, fontFamily: 'Outfit, sans-serif', color: '#94a3b8' }}>
      Carregando...
    </div>
  );

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', display: 'flex', flexDirection: 'column', gap: 24, padding: '4px 0' }}>

      {/* Header com filtro */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Dashboard</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{filtrados.length} projeto(s) no período</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['todos','Todos'], ['mes','Este mês'], ['trimestre','Trimestre']].map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)}
              style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${filtro === v ? '#667eea' : '#e2e8f0'}`, background: filtro === v ? '#667eea' : 'white', color: filtro === v ? 'white' : '#64748b', fontSize: 12, fontWeight: filtro === v ? 600 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Stats de projetos */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Projetos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
          {statsProjetos.map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats financeiros */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Financeiro</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {statsFinanceiros.map(s => (
            <div key={s.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: s.bold ? 20 : 17, fontWeight: 700, color: s.color }}>{formatBRL(s.value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Barra de progresso financeiro */}
      {totalFaturamento > 0 && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Recebimento</div>
          <div style={{ height: 10, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (totalRecebido / totalFaturamento) * 100)}%`, background: 'linear-gradient(90deg, #66BB6A, #00E5C4)', borderRadius: 6, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
            <span>{formatBRL(totalRecebido)} recebido</span>
            <span>{Math.round((totalRecebido / totalFaturamento) * 100)}% do total</span>
            <span>{formatBRL(totalFaturamento - totalRecebido)} a receber</span>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;
