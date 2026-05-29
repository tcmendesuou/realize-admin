import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function FornecedorJobScreen({ job, userData, onBack }) {
  const [budget, setBudget]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed]   = useState(job.status === 'confirmed');

  const supplierId = userData?.supplierId || userData?.id;
  const userName   = userData?.name || userData?.email?.split('@')[0] || 'Fornecedor';

  // Busca dados do budget vinculado
  useEffect(() => {
    if (!job.budgetId) { setLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'budgets', job.budgetId), snap => {
      if (snap.exists()) setBudget({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
    return () => unsub();
  }, [job.budgetId]);

  const handleConfirmar = async () => {
    if (confirmed) return;
    setConfirming(true);
    try {
      // Atualiza o supplierJob
      await updateDoc(doc(db, 'supplierJobs', job.id), {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        confirmedBy: userName,
      });

      // Notifica o budget — adiciona ao timeline e marca fornecedor confirmado
      if (budget) {
        const supplierConfirmations = budget.supplierConfirmations || [];
        await updateDoc(doc(db, 'budgets', job.budgetId), {
          supplierConfirmations: [
            ...supplierConfirmations,
            {
              supplierId,
              supplierName: userName,
              serviceNames: job.serviceNames || [],
              confirmedAt: new Date(),
            }
          ],
          timeline: [
            ...(budget.timeline || []),
            {
              action: 'supplier_confirmed',
              description: `Fornecedor "${userName}" confirmou disponibilidade para: ${(job.serviceNames || []).join(', ')}`,
              userId: supplierId,
              userName,
              timestamp: new Date(),
            }
          ],
          updatedAt: serverTimestamp(),
        });
      }

      setConfirmed(true);
    } catch (e) {
      console.error(e);
      alert('Erro ao confirmar. Tente novamente.');
    } finally {
      setConfirming(false);
    }
  };

  const formatDate = (str) => {
    if (!str) return '—';
    if (str.includes('-')) {
      const [y, m, d] = str.split('-');
      return `${d}/${m}/${y}`;
    }
    return str;
  };

  const ev  = budget?.briefingData?.evento    || {};
  const est = budget?.briefingData?.estrutura || {};

  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', fontFamily: 'Outfit, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

      {/* Topbar */}
      <div style={{ background: 'rgba(10,22,38,0.95)', borderBottom: '1px solid rgba(0,180,255,0.08)', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Voltar
        </button>
        <div style={{ fontSize: 15, fontWeight: 400, color: '#E8F4FF' }}>{job.eventName || 'Proposta'}</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Hero */}
      <div style={{ background: 'rgba(10,22,38,0.6)', borderBottom: '1px solid rgba(0,180,255,0.08)', padding: '24px 32px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 300, color: '#E8F4FF', marginBottom: 6 }}>{job.eventName || 'Proposta'}</h1>
        <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#7BAFD4', flexWrap: 'wrap' }}>
          {job.clientName && <span>Cliente: {job.clientName}</span>}
          {job.eventDate && <span>Data: {formatDate(job.eventDate)}</span>}
          <span style={{ color: confirmed ? '#10b981' : '#FFA726', fontWeight: 600 }}>
            {confirmed ? '✓ Disponibilidade confirmada' : '⏳ Aguardando confirmação'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '28px 32px', maxWidth: 800 }}>

        {/* Serviços solicitados */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(0,180,255,0.1)', padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00E5C4', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(0,180,255,0.08)' }}>
            Serviços Solicitados
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(job.serviceNames || []).map((s, i) => (
              <span key={i} style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(0,229,196,0.1)', border: '1px solid rgba(0,229,196,0.2)', color: '#00E5C4', fontSize: 13, fontWeight: 500 }}>
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Dados do evento */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#7BAFD4', fontSize: 14 }}>Carregando detalhes...</div>
        ) : budget ? (
          <>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(0,180,255,0.1)', padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#00E5C4', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(0,180,255,0.08)' }}>
                Dados do Evento
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  ['Tipo', ev.tipo || budget.eventTypeName],
                  ['Nome', ev.nome || budget.eventName],
                  ['Data início', formatDate(ev.dataInicio || budget.startDate)],
                  ['Data fim', formatDate(ev.dataFim || budget.endDate)],
                  ['Duração', ev.diasDuracao ? `${ev.diasDuracao} dia(s)` : null],
                  ['Visitantes/dia', ev.visitantesPorDia || budget.guestCount],
                  ['Local', ev.local || ev.cidade || budget.location],
                  ['Área', est.areaM2 ? `${est.areaM2} m²` : null],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: 'rgba(123,175,212,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, color: '#E8F4FF' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Estrutura necessária */}
            {budget.briefingData?.estrutura && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(0,180,255,0.1)', padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#00E5C4', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(0,180,255,0.08)' }}>
                  Estrutura Necessária
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[
                    ['Montagem', est.montagem],
                    ['Iluminação', est.iluminacao],
                    ['Som', est.som],
                    ['Telão', est.telao],
                    ['Mobiliário', est.mobiliario],
                  ].map(([label, val]) => (
                    <span key={label} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: val ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', color: val ? '#10b981' : 'rgba(123,175,212,0.4)', border: `1px solid ${val ? 'rgba(16,185,129,0.2)' : 'rgba(0,180,255,0.06)'}` }}>
                      {val ? '✓' : '✗'} {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Botão confirmar */}
        <div style={{ background: confirmed ? 'rgba(16,185,129,0.06)' : 'rgba(0,229,196,0.06)', borderRadius: 14, border: `1px solid ${confirmed ? 'rgba(16,185,129,0.2)' : 'rgba(0,229,196,0.2)'}`, padding: 24 }}>
          {confirmed ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#10b981', marginBottom: 6 }}>Disponibilidade confirmada!</div>
              <div style={{ fontSize: 13, color: '#7BAFD4' }}>O coordenador foi notificado. Aguarde a aprovação do cliente para prosseguir.</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: '#7BAFD4', marginBottom: 16, lineHeight: 1.6 }}>
                Confirme sua disponibilidade para este evento. O coordenador será notificado e aguardará a aprovação do cliente.
              </div>
              <button onClick={handleConfirmar} disabled={confirming}
                style={{ padding: '13px 40px', borderRadius: 10, border: 'none', background: confirming ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 14, fontWeight: 600, cursor: confirming ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {confirming ? 'Confirmando...' : '✓ Confirmar Disponibilidade'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
