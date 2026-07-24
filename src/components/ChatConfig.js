import React, { useState } from 'react';
import BancoPerguntas from './BancoPerguntas';
import TiposEvento from './TiposEvento';
import { popularFase3 } from './seedFase3';

export default function ChatConfig() {
  const [aba, setAba] = useState('perguntas');
  const [populando, setPopulando] = useState(false);
  const [progresso, setProgresso] = useState(null);

  const rodarSeed = async () => {
    if (!window.confirm('Isso vai criar (ou sobrescrever) as perguntas e tipos de evento padrão no Firestore, recriando exatamente o fluxo que já existe hoje no chat. Pode rodar mais de uma vez sem duplicar. Continuar?')) return;
    setPopulando(true);
    try {
      await popularFase3((feito, total, label) => setProgresso({ feito, total, label }));
      alert('Pronto! Perguntas e Tipos de Evento padrão foram criados.');
    } catch (e) {
      console.error(e);
      alert('Erro ao popular dados — veja o console.');
    } finally {
      setPopulando(false);
      setProgresso(null);
    }
  };

  const tabBtn = (id, label) => (
    <button onClick={() => setAba(id)}
      style={{
        padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
        fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
        background: aba === id ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#f1f5f9',
        color: aba === id ? 'white' : '#64748b',
      }}>
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {tabBtn('perguntas', 'Banco de Perguntas')}
          {tabBtn('tipos', 'Tipos de Evento')}
        </div>
        <button onClick={rodarSeed} disabled={populando}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px dashed #94a3b8', background: 'none', color: '#64748b', fontSize: 11, fontWeight: 600, cursor: populando ? 'not-allowed' : 'pointer' }}>
          {populando ? `Populando... ${progresso ? `${progresso.feito}/${progresso.total}` : ''}` : '⚙️ Popular dados padrão (Fase 3)'}
        </button>
      </div>
      {progresso && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16, marginTop: -14 }}>{progresso.label}</div>
      )}

      {aba === 'perguntas' && <BancoPerguntas />}
      {aba === 'tipos' && <TiposEvento />}
    </div>
  );
}
