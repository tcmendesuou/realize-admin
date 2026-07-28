import React from 'react';
import { RECURSOS_POR_TIPO, ACOES } from './permissoesConstants';

// ─────────────────────────────────────────────────────────────────────────────
// PermissoesOverride — mostra a permissão padrão do cargo da pessoa, com
// possibilidade de sobrescrever pontos específicos (vira permissoesCustom
// no documento dela). O que não for alterado aqui continua exatamente igual
// ao cargo — só grava no "custom" o que realmente foi diferente.
// ─────────────────────────────────────────────────────────────────────────────
export default function PermissoesOverride({ tipoConta, cargo, permissoesCustom, onChange }) {
  const recursos = RECURSOS_POR_TIPO[tipoConta] || [];
  const permissoesCargo = cargo?.permissoes || {};
  const custom = permissoesCustom || {};

  const valorAtual = (recursoId) => custom[recursoId] !== undefined ? custom[recursoId] : (permissoesCargo[recursoId] || '');
  const foiAlterado = (recursoId) => custom[recursoId] !== undefined;

  const toggleAcao = (recursoId, acaoId) => {
    const atual = valorAtual(recursoId);
    const nova = atual.includes(acaoId) ? atual.replace(acaoId, '') : atual + acaoId;
    onChange({ ...custom, [recursoId]: nova });
  };

  const restaurarPadrao = (recursoId) => {
    const novo = { ...custom };
    delete novo[recursoId];
    onChange(novo);
  };

  if (!cargo) {
    return <div style={{ fontSize: 12, color: '#94a3b8', padding: 16, textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: 8 }}>Selecione um cargo primeiro pra ver as permissões.</div>;
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(5, 48px) 70px', background: '#f8faff', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
        <span>Recurso</span>
        {ACOES.map(a => <span key={a.id} style={{ textAlign: 'center' }}>{a.label}</span>)}
        <span></span>
      </div>
      {recursos.map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(5, 48px) 70px', padding: '8px 12px', borderTop: '1px solid #f0f2f5', alignItems: 'center', background: foiAlterado(r.id) ? 'rgba(102,126,234,0.04)' : 'white' }}>
          <span style={{ fontSize: 12, color: '#1e293b' }}>{r.label}</span>
          {ACOES.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'center' }}>
              <input type="checkbox" checked={valorAtual(r.id).includes(a.id)} onChange={() => toggleAcao(r.id, a.id)} style={{ width: 15, height: 15, accentColor: '#667eea', cursor: 'pointer' }} />
            </div>
          ))}
          <div>
            {foiAlterado(r.id) && (
              <button onClick={() => restaurarPadrao(r.id)} title="Voltar ao padrão do cargo" style={{ fontSize: 9, color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                padrão
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
