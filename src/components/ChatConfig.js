import React, { useState } from 'react';
import BancoPerguntas from './BancoPerguntas';
import TiposEvento from './TiposEvento';
import ClienteChatV4 from './ClienteChatV4';

export default function ChatConfig({ userData }) {
  const [aba, setAba] = useState('perguntas');
  const [testando, setTestando] = useState(false);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {tabBtn('perguntas', 'Banco de Perguntas')}
            {tabBtn('tipos', 'Tipos de Evento')}
          </div>
          <button onClick={() => setTestando(true)}
            style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #667eea', background: 'none', color: '#667eea', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            🧪 Testar novo chat (V4)
          </button>
        </div>

        {aba === 'perguntas' && <BancoPerguntas />}
        {aba === 'tipos' && <TiposEvento />}
      </div>

      {testando && (
        <ClienteChatV4 userData={userData} onClose={() => setTestando(false)} tenant={null} />
      )}
    </div>
  );
}
