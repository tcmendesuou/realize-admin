import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, doc, getDoc, updateDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const FORMAS_PAGAMENTO = [
  { id: '50_50',      label: '50% + 50%',         parcelas: [{ pct: 50, dias: 0 }, { pct: 50, dias: 30 }] },
  { id: '30_60_90',   label: '30 / 60 / 90 dias', parcelas: [{ pct: 34, dias: 30 }, { pct: 33, dias: 60 }, { pct: 33, dias: 90 }] },
  { id: '30_60_90_120', label: '30 / 60 / 90 / 120 dias', parcelas: [{ pct: 25, dias: 30 }, { pct: 25, dias: 60 }, { pct: 25, dias: 90 }, { pct: 25, dias: 120 }] },
];

function calcFinanceiro(valorFornecedores, impostos, fee) {
  const base   = parseFloat(valorFornecedores) || 0;
  const feeVal = base * (parseFloat(fee) / 100);
  const impVal = (base + feeVal) * (parseFloat(impostos) / 100);
  return { base, impVal, feeVal, total: base + feeVal + impVal };
}

function formatBRL(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR');
}

export default function FinanceiroManager() {
  const [budgets, setBudgets]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [config, setConfig]       = useState({ impostos: 18, fee: 10 });
  const [editConfig, setEditConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ impostos: 18, fee: 10 });
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [savingNota, setSavingNota]   = useState(false);
  const [savingPagto, setSavingPagto] = useState(false);
  const [finForm, setFinForm]     = useState(null);
  const [filtro, setFiltro]       = useState('todos'); // todos | mes | trimestre
  const [supplierJobs, setSupplierJobs] = useState([]);

  // Carrega config global
  useEffect(() => {
    getDoc(doc(db, 'config', 'financeiro')).then(snap => {
      if (snap.exists()) { setConfig(snap.data()); setConfigForm(snap.data()); }
    });
  }, []);

  // Carrega budgets
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'budgets'), orderBy('createdAt', 'desc')),
      snap => {
        setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Carrega supplierJobs do projeto selecionado
  useEffect(() => {
    if (!selected) return;
    getDocs(query(collection(db, 'supplierJobs'))).then(snap => {
      setSupplierJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(j => j.budgetId === selected.id && j.status === 'confirmed'));
    });
  }, [selected?.id]);

  const salvarConfig = async () => {
    await setDoc(doc(db, 'config', 'financeiro'), configForm);
    setConfig(configForm);
    setEditConfig(false);
  };

  const abrirProjeto = (b) => {
    setSelected(b);
    const fin = b.financeiro || {};
    const valorForn = fin.valorFornecedores || somarFornecedores(b);
    setFinForm({
      impostos:       fin.impostos ?? config.impostos,
      fee:            fin.fee ?? config.fee,
      formaPagamento: fin.formaPagamento || '50_50',
      valorFornecedores: valorForn,
    });
  };

  const somarFornecedores = (b) => {
    // 1. Usa subtotal ja calculado se existir
    if (b.orcamentoFinal?.subtotalFornecedores) return b.orcamentoFinal.subtotalFornecedores;
    // 2. Soma supplierJobs confirmados (nova estrutura)
    const jobs = supplierJobs.filter(j => j.budgetId === b.id && j.status === 'confirmed');
    if (jobs.length > 0) return jobs.reduce((acc, j) => acc + (parseFloat(j.preco) || 0), 0);
    return 0;
  };

  const salvarFinanceiro = async () => {
    if (!selected || !finForm) return;
    setSaving(true);
    try {
      const { base, impVal, feeVal, total } = calcFinanceiro(finForm.valorFornecedores, finForm.impostos, finForm.fee);
      const valorFee      = feeVal;
      const valorImpostos = impVal;
      const forma = FORMAS_PAGAMENTO.find(f => f.id === finForm.formaPagamento);
      const dataBase = selected.startDate ? new Date(selected.startDate) : new Date();
      const parcelas = forma ? forma.parcelas.map((p, i) => {
        const data = new Date(dataBase);
        data.setDate(data.getDate() + p.dias);
        return {
          numero:     i + 1,
          percentual: p.pct,
          dias:       p.dias,
          valor:      (total * p.pct / 100),
          dataVenc:   data.toISOString().split('T')[0],
          status:     'pendente',
          pago:       false,
        };
      }) : [];

      const pagFornecedores = supplierJobs.map(sj => ({
        supplierId:   sj.supplierId,
        supplierName: sj.supplierName || sj.serviceName,
        serviceName:  sj.serviceName,
        valor:        parseFloat(sj.preco) || 0,
        status:       'pendente',
        pago:         false,
      }));

      await updateDoc(doc(db, 'budgets', selected.id), {
        financeiro: {
          valorFornecedores: parseFloat(finForm.valorFornecedores),
          impostos:          parseFloat(finForm.impostos),
          fee:               parseFloat(finForm.fee),
          valorImpostos:     impVal,
          valorFee:          feeVal,
          valorTotal:        total,
          formaPagamento:    finForm.formaPagamento,
          parcelas,
          pagamentosFornecedores: pagFornecedores,
          updatedAt:         new Date().toISOString(),
        },
        updatedAt: new Date(),
      });
      // Atualiza local
      setBudgets(prev => prev.map(b => b.id === selected.id ? { ...b, financeiro: { valorTotal: total, parcelas, formaPagamento: finForm.formaPagamento } } : b));
      setSelected(prev => ({ ...prev, financeiro: { valorFornecedores: parseFloat(finForm.valorFornecedores), impostos: parseFloat(finForm.impostos), fee: parseFloat(finForm.fee), valorImpostos: impVal, valorFee: feeVal, valorTotal: total, formaPagamento: finForm.formaPagamento, parcelas, pagamentosFornecedores: pagFornecedores } }));
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const marcarParcelaPaga = async (idx) => {
    const fin = selected.financeiro;
    const novas = fin.parcelas.map((p, i) => i === idx ? { ...p, pago: true, status: 'pago', paidAt: new Date().toISOString() } : p);
    await updateDoc(doc(db, 'budgets', selected.id), { 'financeiro.parcelas': novas });

    // Se todas as parcelas pagas → muda para Finalizado
    if (novas.every(p => p.pago)) {
      await updateDoc(doc(db, 'budgets', selected.id), {
        workspaceStage: 'Finalizado',
        finalizadoEm:   new Date().toISOString(),
      });
    }

    setSelected(prev => ({ ...prev, financeiro: { ...prev.financeiro, parcelas: novas } }));
  };

  const marcarFornecedorPago = async (idx) => {
    const fin = selected.financeiro;
    const novos = fin.pagamentosFornecedores.map((p, i) => i === idx ? { ...p, pago: true, status: 'pago', paidAt: new Date().toISOString() } : p);
    await updateDoc(doc(db, 'budgets', selected.id), { 'financeiro.pagamentosFornecedores': novos });
    setSelected(prev => ({ ...prev, financeiro: { ...prev.financeiro, pagamentosFornecedores: novos } }));
  };

  // ── Envio de Nota ────────────────────────────────────────────────────────────
  const handleEnvioNota = async () => {
    if (!selected) return;
    if (!window.confirm('Confirmar envio da nota fiscal?')) return;
    setSavingNota(true);
    try {
      await updateDoc(doc(db, 'budgets', selected.id), {
        notaEnviadaEm:  serverTimestamp(),
        workspaceStage: 'Nota Enviada',
        updatedAt:      serverTimestamp(),
      });
      setSelected(p => ({ ...p, notaEnviadaEm: new Date(), workspaceStage: 'Nota Enviada' }));
    } catch (e) { console.error(e); alert('Erro ao registrar nota.'); }
    finally { setSavingNota(false); }
  };

  // ── Pagamento Concluído ───────────────────────────────────────────────────────
  const handlePagamentoConcluido = async () => {
    if (!selected) return;
    if (!window.confirm('Confirmar pagamento concluído? O projeto será marcado como Finalizado.')) return;
    setSavingPagto(true);
    try {
      await updateDoc(doc(db, 'budgets', selected.id), {
        status:          'completed',
        workspaceStage:  'Finalizado',
        pagamentoEm:     serverTimestamp(),
        updatedAt:       serverTimestamp(),
      });
      setSelected(p => ({ ...p, status: 'completed', workspaceStage: 'Finalizado', pagamentoEm: new Date() }));
    } catch (e) { console.error(e); alert('Erro ao registrar pagamento.'); }
    finally { setSavingPagto(false); }
  };

  // Filtro por período
  const budgetsFiltrados = budgets.filter(b => {
    if (filtro === 'todos') return true;
    const d = b.createdAt?.toDate ? b.createdAt.toDate() : null;
    if (!d) return false;
    const hoje = new Date();
    if (filtro === 'mes') return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    if (filtro === 'trimestre') {
      const diffMes = (hoje.getFullYear() - d.getFullYear()) * 12 + hoje.getMonth() - d.getMonth();
      return diffMes <= 3;
    }
    return true;
  });

  // Dashboard stats
  const totalReceber     = budgetsFiltrados.reduce((acc, b) => acc + (b.financeiro?.valorTotal || 0), 0);
  const totalPago        = budgetsFiltrados.reduce((acc, b) => acc + (b.financeiro?.parcelas || []).filter(p => p.pago).reduce((s, p) => s + p.valor, 0), 0);
  const totalFornecedor  = budgetsFiltrados.reduce((acc, b) => acc + (b.financeiro?.valorFornecedores || 0), 0);
  const totalMargem      = budgetsFiltrados.reduce((acc, b) => acc + (b.financeiro?.valorFee || 0), 0);

  const fin = selected?.financeiro;
  const calc = finForm ? calcFinanceiro(finForm.valorFornecedores, finForm.impostos, finForm.fee) : null;

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', display: 'flex', gap: 20, height: '100%', minHeight: 0 }}>

      {/* Coluna esquerda */}
      <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Config global */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editConfig ? 10 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.8, textTransform: 'uppercase' }}>Config Global</div>
            <button onClick={() => { setEditConfig(e => !e); setConfigForm(config); }}
              style={{ fontSize: 11, color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              {editConfig ? 'Cancelar' : 'Editar'}
            </button>
          </div>
          {editConfig ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>Impostos %</div>
                <input type="number" value={configForm.impostos} onChange={e => setConfigForm(p => ({ ...p, impostos: e.target.value }))}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>Fee %</div>
                <input type="number" value={configForm.fee} onChange={e => setConfigForm(p => ({ ...p, fee: e.target.value }))}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', boxSizing: 'border-box' }} />
              </div>
              <button onClick={salvarConfig}
                style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#667eea', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' }}>Salvar</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div><span style={{ fontSize: 11, color: '#94a3b8' }}>Impostos: </span><span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{config.impostos}%</span></div>
              <div><span style={{ fontSize: 11, color: '#94a3b8' }}>Fee: </span><span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{config.fee}%</span></div>
            </div>
          )}
        </div>

        {/* Dashboard */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.8, textTransform: 'uppercase' }}>Dashboard</div>
            <select value={filtro} onChange={e => setFiltro(e.target.value)}
              style={{ fontSize: 11, borderRadius: 6, border: '1px solid #e2e8f0', padding: '3px 8px', fontFamily: 'Outfit, sans-serif', color: '#64748b' }}>
              <option value="todos">Todos</option>
              <option value="mes">Este mês</option>
              <option value="trimestre">Último trimestre</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'A receber', value: totalReceber, color: '#667eea' },
              { label: 'Recebido',  value: totalPago,    color: '#10b981' },
              { label: 'Fornecedores', value: totalFornecedor, color: '#FFA726' },
              { label: 'Margem (fee)', value: totalMargem, color: '#00E5C4' },
            ].map(s => (
              <div key={s.label} style={{ background: '#f8faff', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{formatBRL(s.value)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Lista de projetos */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
          : budgetsFiltrados.map(b => (
            <div key={b.id} onClick={() => abrirProjeto(b)}
              style={{ background: 'white', borderRadius: 10, border: `1px solid ${selected?.id === b.id ? '#667eea' : '#e2e8f0'}`, padding: '12px 14px', cursor: 'pointer', boxShadow: selected?.id === b.id ? '0 0 0 2px rgba(102,126,234,0.2)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{b.eventName || b.eventTypeName || 'Projeto'}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{b.numeroPedido || b.id.slice(0,6)} • {b.clientName}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {b.financeiro?.valorTotal ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#667eea' }}>{formatBRL(b.financeiro.valorTotal)}</div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Sem financeiro</div>
                  )}
                  {b.status === 'completed' && <div style={{ fontSize: 10, fontWeight: 700, color: '#00C896', marginTop: 2 }}>✓ PAGO</div>}
                  {b.notaEnviadaEm && b.status !== 'completed' && <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginTop: 2 }}>✓ NOTA ENVIADA</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Coluna direita — detalhe financeiro */}
      <div style={{ flex: 1, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
            Selecione um projeto para ver o financeiro
          </div>
        ) : (
          <>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>{selected.eventName || selected.eventTypeName}</h2>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{selected.numeroPedido} • {selected.clientName}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Status badges */}
                {selected.notaEnviadaEm && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'rgba(102,187,106,0.1)', color: '#16a34a' }}>
                    ✓ Nota enviada
                  </span>
                )}
                {selected.status === 'completed' && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'rgba(0,229,196,0.1)', color: '#00C896' }}>
                    ✓ Pago
                  </span>
                )}
                {/* Botão Envio de Nota */}
                {selected.status !== 'completed' && (
                  <button onClick={handleEnvioNota} disabled={savingNota || !!selected.notaEnviadaEm}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: selected.notaEnviadaEm ? '#f8faff' : 'white', color: selected.notaEnviadaEm ? '#94a3b8' : '#475569', fontSize: 12, fontWeight: 600, cursor: selected.notaEnviadaEm ? 'default' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    {savingNota ? 'Salvando...' : selected.notaEnviadaEm ? '✓ Nota Enviada' : '📄 Envio de Nota'}
                  </button>
                )}
                {/* Botão Pagamento Concluído */}
                {selected.status !== 'completed' && (
                  <button onClick={handlePagamentoConcluido} disabled={savingPagto}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00C896,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', opacity: savingPagto ? 0.6 : 1 }}>
                    {savingPagto ? 'Salvando...' : '✓ Pagamento Concluído'}
                  </button>
                )}
                <button onClick={salvarFinanceiro} disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Configuração do projeto */}
              {finForm && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Configuração</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Valor Fornecedores (R$)', key: 'valorFornecedores', type: 'number' },
                      { label: 'Impostos (%)', key: 'impostos', type: 'number' },
                      { label: 'Fee (%)', key: 'fee', type: 'number' },
                    ].map(f => (
                      <div key={f.key}>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{f.label}</div>
                        <input type={f.type} value={finForm[f.key]} onChange={e => setFinForm(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Forma de Pagamento</div>
                      <select value={finForm.formaPagamento} onChange={e => setFinForm(p => ({ ...p, formaPagamento: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', boxSizing: 'border-box' }}>
                        {FORMAS_PAGAMENTO.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Resumo calculado */}
                  {calc && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      {[
                        { label: 'Fornecedores', value: calc.base, color: '#FFA726' },
                        { label: `Impostos (${finForm.impostos}%)`, value: calc.impVal, color: '#ef4444' },
                        { label: `Fee (${finForm.fee}%)`, value: calc.feeVal, color: '#00E5C4' },
                        { label: 'Total Cliente', value: calc.total, color: '#667eea', bold: true },
                      ].map(s => (
                        <div key={s.label} style={{ flex: 1, background: '#f8faff', borderRadius: 8, padding: '10px 12px', border: s.bold ? '2px solid #667eea' : '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{s.label}</div>
                          <div style={{ fontSize: s.bold ? 16 : 14, fontWeight: 700, color: s.color }}>{formatBRL(s.value)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Parcelas */}
              {fin?.parcelas?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Parcelas do Cliente</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {fin.parcelas.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: `1px solid ${p.pago ? 'rgba(16,185,129,0.3)' : '#e2e8f0'}`, background: p.pago ? 'rgba(16,185,129,0.04)' : 'white' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{i + 1}ª parcela — {p.percentual}%</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Venc: {p.dataVenc || '—'}</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: p.pago ? '#10b981' : '#667eea' }}>{formatBRL(p.valor)}</div>
                        {p.pago ? (
                          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>✓ Pago</span>
                        ) : (
                          <button onClick={() => marcarParcelaPaga(i)}
                            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)', background: 'none', color: '#10b981', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                            Marcar pago
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pagamentos fornecedores */}
              {fin?.pagamentosFornecedores?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Pagamentos aos Fornecedores</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {fin.pagamentosFornecedores.map((p, i) => {
                      const clientePagou = fin.parcelas?.some(pa => pa.pago);
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: `1px solid ${p.pago ? 'rgba(16,185,129,0.3)' : '#e2e8f0'}`, background: p.pago ? 'rgba(16,185,129,0.04)' : 'white' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.supplierName}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.serviceName}</div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: p.pago ? '#10b981' : '#FFA726' }}>{formatBRL(p.valor)}</div>
                          {p.pago ? (
                            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>✓ Pago</span>
                          ) : !clientePagou ? (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Aguard. cliente</span>
                          ) : (
                            <button onClick={() => marcarFornecedorPago(i)}
                              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,167,38,0.3)', background: 'none', color: '#FFA726', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                              Marcar pago
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
