import React, { useState, useEffect, useRef } from 'react';
import { useNotificacoes } from '../hooks/useNotificacoes';

const TIPO_COR = {
  acao:   { bg: 'rgba(255,167,38,0.12)',  border: 'rgba(255,167,38,0.25)',  dot: '#FFA726' },
  alerta: { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.25)',   dot: '#ef4444' },
  sucesso:{ bg: 'rgba(0,229,196,0.08)',   border: 'rgba(0,229,196,0.2)',    dot: '#00E5C4' },
  info:   { bg: 'rgba(123,175,212,0.08)', border: 'rgba(123,175,212,0.2)', dot: '#7BAFD4' },
};

function tempoRelativo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function SinoNotificacoes({ userId, tema = 'escuro', userData }) {
  const { notificacoes, naoLidas, marcarTodasLidas, marcarLida, deletarNotificacao } = useNotificacoes(userId);
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const corTexto    = tema === 'escuro' ? '#7BAFD4'  : '#64748b';
  const corBg       = tema === 'escuro' ? '#0D1B2A'  : 'white';
  const corBorda    = tema === 'escuro' ? 'rgba(0,180,255,0.12)' : '#e2e8f0';
  const corItem     = tema === 'escuro' ? 'rgba(255,255,255,0.03)' : '#fafbff';
  const corTitulo   = tema === 'escuro' ? '#E8F4FF'  : '#1e293b';
  const corMensagem = tema === 'escuro' ? '#7BAFD4'  : '#475569';

  const handleNavegar = (n) => {
    if (!n.budgetId) return;
    const role = userData?.systemRole || '';
    marcarLida(n.id);
    setAberto(false);
    if (role === 'equipe' || role === 'workspace' || role === 'fornecedor') {
      window.location.href = `/projeto/${n.budgetId}`;
    } else {
      // cliente/franqueado — dispara evento para o ClienteHome abrir o projeto
      window.dispatchEvent(new CustomEvent('abrirProjeto', { detail: { budgetId: n.budgetId } }));
    }
  };

  const abrirFechar = () => {
    setAberto(a => !a);
    if (!aberto && naoLidas > 0) setTimeout(marcarTodasLidas, 1500);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Botão sino */}
      <button onClick={abrirFechar} style={{
        position: 'relative', background: 'none', border: 'none',
        cursor: 'pointer', padding: '6px 8px', borderRadius: 8,
        color: naoLidas > 0 ? '#00E5C4' : corTexto,
        transition: 'color 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Ícone sino SVG */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* Badge */}
        {naoLidas > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#ef4444', color: 'white',
            fontSize: 9, fontWeight: 700, fontFamily: 'Outfit, sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {aberto && (
        <div style={{
          position: 'fixed', top: 60, right: 32, marginTop: 0,
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: corBg, borderRadius: 14,
          border: `1px solid ${corBorda}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 9999, fontFamily: 'Outfit, sans-serif',
        }}>
          {/* Header dropdown */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${corBorda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: corTitulo }}>Notificacoes</div>
            {naoLidas > 0 && (
              <button onClick={marcarTodasLidas} style={{ fontSize: 11, color: '#00E5C4', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* Lista */}
          {notificacoes.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: corMensagem, fontSize: 13 }}>
              Nenhuma notificacao ainda
            </div>
          ) : notificacoes.map(n => {
            const cores = TIPO_COR[n.tipo] || TIPO_COR.info;
            return (
              <div key={n.id} style={{
                padding: '12px 16px', borderBottom: `1px solid ${corBorda}`,
                background: n.lida ? 'transparent' : corItem,
                transition: 'background 0.15s',
                display: 'flex', gap: 10, alignItems: 'flex-start',
                cursor: n.budgetId ? 'pointer' : 'default',
              }}
              onClick={() => n.budgetId ? handleNavegar(n) : marcarLida(n.id)}
              onMouseEnter={e => { if (n.budgetId) e.currentTarget.style.background = tema === 'escuro' ? 'rgba(255,255,255,0.05)' : '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = n.lida ? 'transparent' : corItem; }}>
                {/* Dot tipo */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.lida ? 'transparent' : cores.dot, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: n.lida ? 400 : 600, color: corTitulo, lineHeight: 1.4 }}>{n.titulo}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: corMensagem }}>{tempoRelativo(n.createdAt)}</div>
                      <button onClick={e => { e.stopPropagation(); deletarNotificacao(n.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(123,175,212,0.35)', fontSize: 13, lineHeight: 1, padding: '0 2px', fontFamily: 'Outfit, sans-serif' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(123,175,212,0.35)'}>
                        ✕
                      </button>
                    </div>
                  </div>
                  {n.mensagem && (
                    <div style={{ fontSize: 11, color: corMensagem, marginTop: 3, lineHeight: 1.5 }}>{n.mensagem}</div>
                  )}
                  {n.tipo === 'acao' && !n.lida && (
                    <div style={{ marginTop: 6, fontSize: 10, fontWeight: 600, color: '#FFA726' }}>Acao necessaria →</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
