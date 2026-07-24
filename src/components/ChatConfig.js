import React, { useState } from 'react';
import BancoPerguntas from './BancoPerguntas';
import TiposEvento from './TiposEvento';

export default function ChatConfig() {
  const [aba, setAba] = useState('perguntas');

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
    <div style={{ height: '100%', overflowY: 'auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', paddingBottom: 40 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          {tabBtn('perguntas', 'Banco de Perguntas')}
          {tabBtn('tipos', 'Tipos de Evento')}
        </div>

        {aba === 'perguntas' && <BancoPerguntas />}
        {aba === 'tipos' && <TiposEvento />}
      </div>
    </div>
  );
}
