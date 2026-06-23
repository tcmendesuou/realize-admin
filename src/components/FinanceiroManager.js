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
  const [secExpanded, setSecExpanded]   = useState({ config: true, parcelas: true, fornecedores: true });
  const toggleSec = (sec) => setSecExpanded(p => ({ ...p, [sec]: !p[sec] }));

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

  // Carrega supplierJobs e gera financeiro automaticamente se projeto aprovado sem financeiro
  useEffect(() => {
    if (!selected) return;
    getDocs(query(collection(db, 'supplierJobs'))).then(async snap => {
      const jobs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(j => j.budgetId === selected.id && j.status === 'confirmed');
      setSupplierJobs(jobs);
      // Gera financeiro automático quando aprovado e sem financeiro
      if (['approved','completed'].includes(selected.status) && !selected.financeiro?.parcelas?.length) {
        const finGerado = await gerarFinanceiroAuto(selected, jobs, config);
        if (finGerado) {
          setSelected(prev => ({ ...prev, financeiro: finGerado }));
          setFinForm({
            impostos:          finGerado.impostos,
            fee:               finGerado.fee,
            formaPagamento:    finGerado.formaPagamento,
            valorFornecedores: finGerado.valorFornecedores,
          });
        }
      }
    });
  }, [selected?.id]);

  const salvarConfig = async () => {
    await setDoc(doc(db, 'config', 'financeiro'), configForm);
    setConfig(configForm);
    setEditConfig(false);
  };

  const gerarFinanceiroAuto = async (b, jobs, cfg) => {
    if (b.financeiro?.parcelas?.length > 0) return; // já tem financeiro
    const valorForn = b.orcamentoFinal?.subtotalFornecedores
      || jobs.reduce((acc, j) => acc + (parseFloat(j.preco) || 0), 0)
      || 0;
    if (!valorForn) return;
    const imp  = cfg?.impostos ?? 18;
    const fee  = cfg?.fee ?? 10;
    const forma = b.financeiro?.formaPagamento || b.briefingData?.formaPagamento || '50_50';
    const { base, impVal, feeVal, total } = calcFinanceiro(valorForn, imp, fee);
    const fp = FORMAS_PAGAMENTO.find(f => f.id === forma) || FORMAS_PAGAMENTO[0];
    const dataBase = b.startDate ? new Date(b.startDate) : new Date();
    const parcelas = fp.parcelas.map((p, i) => {
      const d = new Date(dataBase); d.setDate(d.getDate() + p.dias);
      return { numero: i+1, percentual: p.pct, dias: p.dias, valor: total * p.pct / 100, dataVenc: d.toISOString().split('T')[0], status: 'pendente', pago: false, notaEnviada: false };
    });
    const pagForn = jobs.map(sj => ({
      supplierId: sj.supplierId, supplierName: sj.supplierName || sj.serviceName,
      serviceName: sj.serviceName, valor: parseFloat(sj.preco) || 0,
      status: 'pendente', pago: false, notaRecebida: false,
    }));
    const finData = {
      valorFornecedores: valorForn, impostos: imp, fee, valorImpostos: impVal,
      valorFee: feeVal, valorTotal: total, formaPagamento: forma,
      parcelas, pagamentosFornecedores: pagForn, updatedAt: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, 'budgets', b.id), { financeiro: finData, updatedAt: new Date() });
      return finData;
    } catch(e) { console.error('Erro ao gerar financeiro:', e); }
  };

  const abrirProjeto = async (b) => {
    setSelected(b);
    const fin = b.financeiro || {};
    const valorForn = fin.valorFornecedores || somarFornecedores(b);
    setFinForm({
      impostos:          fin.impostos ?? config.impostos,
      fee:               fin.fee ?? config.fee,
      formaPagamento:    fin.formaPagamento || b.briefingData?.formaPagamento || '50_50',
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

  const marcarNotaParcelaEnviada = async (idx) => {
    const novas = (selected.financeiro.parcelas || []).map((p, i) =>
      i === idx ? { ...p, notaEnviada: true, notaEnviadaEm: new Date().toISOString() } : p
    );
    await updateDoc(doc(db, 'budgets', selected.id), { 'financeiro.parcelas': novas });
    setSelected(prev => ({ ...prev, financeiro: { ...prev.financeiro, parcelas: novas } }));
  };

  const marcarNotaFornRecebida = async (idx) => {
    const novos = (selected.financeiro.pagamentosFornecedores || []).map((p, i) =>
      i === idx ? { ...p, notaRecebida: true, notaRecebidaEm: new Date().toISOString() } : p
    );
    await updateDoc(doc(db, 'budgets', selected.id), { 'financeiro.pagamentosFornecedores': novos });
    setSelected(prev => ({ ...prev, financeiro: { ...prev.financeiro, pagamentosFornecedores: novos } }));
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

  // Marcar fornecedor pago — por parcela (supplierId + índice da parcela)
  const marcarFornecedorPagoParcela = async (supplierId, parcelaIdx) => {
    const fin = selected.financeiro;
    // Marca todos os itens deste fornecedor como pagos nesta parcela
    // Registra no array pagamentosFornecedores qual parcela foi paga
    const novos = fin.pagamentosFornecedores.map(p => {
      if (p.supplierId !== supplierId && p.supplierName !== supplierId) return p;
      const parcelasPagas = p.parcelasPagas || [];
      if (parcelasPagas.includes(parcelaIdx)) return p;
      const novasParc = [...parcelasPagas, parcelaIdx];
      // Se todas as parcelas foram pagas, marca o item como pago
      const totalParcelas = fin.parcelas?.length || 1;
      const pago = novasParc.length >= totalParcelas;
      return { ...p, parcelasPagas: novasParc, pago, status: pago ? 'pago' : 'parcial', paidAt: pago ? new Date().toISOString() : p.paidAt };
    });
    await updateDoc(doc(db, 'budgets', selected.id), { 'financeiro.pagamentosFornecedores': novos });
    setSelected(prev => ({ ...prev, financeiro: { ...prev.financeiro, pagamentosFornecedores: novos } }));
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
                {/* Status badges */}
                {selected.status === 'completed' && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(0,200,150,0.1)', color: '#00C896' }}>✓ Finalizado</span>
                )}
                {selected.status === 'approved' && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(102,126,234,0.1)', color: '#667eea' }}>✓ Aprovado</span>
                )}

              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Configuração do projeto */}
              {finForm && (
                <div>
                  <div onClick={() => toggleSec('config')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: secExpanded.config ? 12 : 0, paddingBottom: secExpanded.config ? 0 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>Configuração</div>
                    <span style={{ fontSize: 12, color: '#94a3b8', transform: secExpanded.config ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                  </div>
                  {!secExpanded.config && null}
                  {secExpanded.config && <><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
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
                  )}</>}
                </div>
              )}

              {/* Parcelas */}
              {fin?.parcelas?.length > 0 && (
                <div>
                  <div onClick={() => toggleSec('parcelas')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: secExpanded.parcelas ? 10 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>Parcelas do Cliente</div>
                    <span style={{ fontSize: 12, color: '#94a3b8', transform: secExpanded.parcelas ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                  </div>
                  {secExpanded.parcelas && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                          <>
                            {p.notaEnviada ? (
                              <span style={{ fontSize: 11, color: '#667eea', fontWeight: 600 }}>✓ Nota enviada</span>
                            ) : (
                              <button onClick={() => marcarNotaParcelaEnviada(i)}
                                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(102,126,234,0.3)', background: 'none', color: '#667eea', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                Nota enviada
                              </button>
                            )}
                            <button onClick={() => marcarParcelaPaga(i)}
                              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)', background: 'none', color: '#10b981', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                              Marcar pago
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>}
                </div>
              )}

              {/* Pagamentos fornecedores — agrupados por empresa */}
              {fin?.pagamentosFornecedores?.length > 0 && (() => {
                // Agrupa por supplierId
                const grupos = fin.pagamentosFornecedores.reduce((acc, p, i) => {
                  const key = p.supplierId || p.supplierName;
                  if (!acc[key]) acc[key] = { supplierName: p.supplierName, supplierId: p.supplierId, itens: [] };
                  acc[key].itens.push({ ...p, idx: i });
                  return acc;
                }, {});
                const addBizDays = (dateStr, days) => {
                  if (!dateStr) return '—';
                  const d = new Date(dateStr + 'T12:00:00');
                  let added = 0;
                  while (added < days) { d.setDate(d.getDate() + 1); const dow = d.getDay(); if (dow !== 0 && dow !== 6) added++; }
                  return d.toLocaleDateString('pt-BR');
                };
                return (
                  <div>
                    <div onClick={() => toggleSec('fornecedores')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: secExpanded.fornecedores ? 12 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>Pagamentos aos Fornecedores</div>
                    <span style={{ fontSize: 12, color: '#94a3b8', transform: secExpanded.fornecedores ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                  </div>
                    {secExpanded.fornecedores && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {Object.entries(grupos).map(([key, grupo]) => {
                        const totalGrupo  = grupo.itens.reduce((acc, p) => acc + (p.valor || 0), 0);
                        const todosPagos  = grupo.itens.every(p => p.pago);
                        const clientePagou = fin.parcelas?.some(pa => pa.pago);
                        const parcelasForn = (fin.parcelas || []).map((pc, i) => ({
                          numero: i + 1, percentual: pc.percentual,
                          valor: totalGrupo * (pc.percentual / 100),
                          dataCliente: pc.dataVenc,
                          dataReceb: addBizDays(pc.dataVenc, 3),
                          pago: grupo.itens.every(item => (item.parcelasPagas || []).includes(i)),
                          statusCliente: pc.pago ? 'pago' : pc.notaEnviada ? 'nota' : 'pendente',
                        }));
                        return (
                          <div key={key} style={{ background: '#fafbff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px' }}>
                            {/* Header fornecedor */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #f0f2f5' }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{grupo.supplierName}</div>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                background: todosPagos ? 'rgba(16,185,129,0.1)' : 'rgba(255,167,38,0.1)',
                                color: todosPagos ? '#10b981' : '#FFA726' }}>
                                {todosPagos ? '✓ PAGO' : 'PENDENTE'}
                              </span>
                            </div>
                            {/* Itens */}
                            {grupo.itens.map((p, ii) => (
                              <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f0f2f5' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: '#475569' }}>{p.serviceName}</div>
                                  {p.notaRecebida && <div style={{ fontSize: 10, color: '#667eea', marginTop: 1 }}>✓ Nota recebida</div>}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: p.pago ? '#10b981' : '#FFA726' }}>{formatBRL(p.valor)}</div>
                                {p.pago ? (
                                  <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>✓ Pago</span>
                                ) : (
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {p.notaRecebida ? (
                                      <span style={{ fontSize: 10, color: '#667eea', fontWeight: 600 }}>✓ Nota OK</span>
                                    ) : (
                                      <button onClick={() => marcarNotaFornRecebida(p.idx)}
                                        style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(102,126,234,0.3)', background: 'none', color: '#667eea', fontSize: 10, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                        Nota recebida
                                      </button>
                                    )}
                                    {clientePagou ? (
                                      <button onClick={() => marcarFornecedorPago(p.idx)}
                                        style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,167,38,0.3)', background: 'none', color: '#FFA726', fontSize: 10, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                        Marcar pago
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 10, color: '#94a3b8' }}>Ag. cliente</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                            {/* Total */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,167,38,0.05)', border: '1px solid rgba(255,167,38,0.15)', margin: '12px 0' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total a pagar</div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: '#FFA726' }}>{formatBRL(totalGrupo)}</div>
                            </div>
                            {/* Parcelas de repasse */}
                            {parcelasForn.length > 0 && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Previsão de Repasse</div>
                                {parcelasForn.map((p, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                                    border: `1px solid ${p.pago ? 'rgba(16,185,129,0.2)' : p.statusCliente === 'nota' ? 'rgba(102,126,234,0.15)' : '#e2e8f0'}`,
                                    background: p.pago ? 'rgba(16,185,129,0.03)' : 'white', marginBottom: 5 }}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: p.pago ? 'rgba(16,185,129,0.1)' : 'rgba(255,167,38,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: p.pago ? '#10b981' : '#FFA726', flexShrink: 0 }}>{p.numero}</div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{p.percentual}% — {formatBRL(p.valor)}</div>
                                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                                        {p.pago ? `Pago em ${p.dataReceb}` : `Repasse: ${p.dataReceb}`}
                                        <span style={{ marginLeft: 8, opacity: 0.6 }}>· Cliente vence {p.dataCliente}</span>
                                      </div>
                                    </div>
                                    {p.pago ? (
                                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)', flexShrink: 0 }}>✓ Pago</span>
                                    ) : p.statusCliente === 'pago' ? (
                                      <button onClick={() => marcarFornecedorPagoParcela(grupo.supplierId || grupo.supplierName, i)}
                                        style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,167,38,0.35)', background: 'rgba(255,167,38,0.06)', color: '#FFA726', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>
                                        Marcar pago
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5, flexShrink: 0,
                                        background: p.statusCliente === 'nota' ? 'rgba(102,126,234,0.06)' : 'rgba(255,167,38,0.06)',
                                        color: p.statusCliente === 'nota' ? '#667eea' : '#FFA726',
                                        border: `1px solid ${p.statusCliente === 'nota' ? 'rgba(102,126,234,0.2)' : 'rgba(255,167,38,0.2)'}` }}>
                                        {p.statusCliente === 'nota' ? 'Nota OK' : 'Aguardando'}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
