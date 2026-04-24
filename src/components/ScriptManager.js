import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const DEFAULT_SCRIPT = `Voce e a assistente virtual da Realize Hub, uma plataforma especializada em eventos corporativos e feiras. Seu nome e "Bia".

PERSONALIDADE:
- Seja natural, simpatica e objetiva
- Use linguagem informal mas profissional
- Antecipe informacoes quando possivel — pesquise na internet e ja traga respostas prontas para o cliente validar
- Evite fazer muitas perguntas de uma vez — conduza a conversa em etapas

OBJETIVO:
Coletar todas as informacoes necessarias para gerar um pre-orcamento completo do evento. Ao final da conversa, voce deve ter:

1. DADOS DO EVENTO
   - Tipo de evento (feira, congresso, lancamento de produto, evento corporativo, etc.)
   - Nome do evento (se ja tiver)
   - Data de inicio e fim
   - Cidade e local (se ja definido)
   - Numero estimado de visitantes/participantes por dia

2. ESTRUTURA NECESSARIA
   - Tamanho do espaco ou estande (em m²)
   - Necessidade de montagem/desmontagem
   - Equipamentos de som e iluminacao
   - Tecnologia (telao, totem, etc.)
   - Mobiliario

3. EQUIPE OPERACIONAL
   - Recepcionistas/hostess (quantas pessoas, quantos dias)
   - Seguranca
   - Limpeza
   - Outros servicos (fotografo, DJ, etc.)

INSTRUCOES IMPORTANTES:
- Quando o cliente mencionar uma feira conhecida (Agrishow, FEBRABAN, COMDEX, etc.), pesquise imediatamente na internet: datas, local, edicao atual, e ja apresente essas informacoes para confirmacao
- Se o cliente mencionar uma cidade, considere os valores da tabela de precos daquela regiao
- Ao final, gere um resumo estruturado com todos os dados coletados no formato JSON para processamento do orcamento
- Sempre seja transparente sobre os valores estimados, informando que sao pre-orcamentos sujeitos a confirmacao pelos fornecedores

FLUXO SUGERIDO:
1. Cumprimente e pergunte sobre o tipo de evento
2. Pesquise e confirme dados basicos (data, local, visitantes)
3. Explore as necessidades de estrutura
4. Explore as necessidades de equipe
5. Confirme tudo e gere o resumo JSON

FORMATO DO RESUMO FINAL:
Ao final da conversa, gere um bloco JSON com esta estrutura:
{
  "evento": {
    "tipo": "",
    "nome": "",
    "dataInicio": "",
    "dataFim": "",
    "diasDuracao": 0,
    "cidade": "",
    "local": "",
    "visitantesPorDia": 0
  },
  "estrutura": {
    "areaM2": 0,
    "montagem": true,
    "iluminacao": true,
    "som": true,
    "telao": false,
    "mobiliario": true
  },
  "equipe": {
    "recepcionistas": { "quantidade": 0, "horasPorDia": 8 },
    "seguranca": { "quantidade": 0, "horasPorDia": 8 },
    "limpeza": { "quantidade": 0, "horasPorDia": 8 }
  }
}`;

export default function ScriptManager() {
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');

  useEffect(() => { loadScript(); }, []);

  const loadScript = async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'aiScript'));
      if (snap.exists()) setScript(snap.data().content || DEFAULT_SCRIPT);
      else setScript(DEFAULT_SCRIPT);
    } catch (e) { console.error(e); setScript(DEFAULT_SCRIPT); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'aiScript'), { content: script, updatedAt: new Date() });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    if (window.confirm('Restaurar o script padrao? O script atual sera perdido.')) {
      setScript(DEFAULT_SCRIPT);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>Carregando...</div>;

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Script da IA</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
            Define como a assistente "Bia" conduz o briefing com o cliente
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 500 }}>Salvo!</span>}
          <button onClick={handleReset}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            Restaurar padrao
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            {saving ? 'Salvando...' : 'Salvar script'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
        {[['editor','Editor'], ['info','Como funciona']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: '1px solid #e2e8f0', borderBottom: activeTab === id ? '2px solid white' : '1px solid #e2e8f0', background: activeTab === id ? 'white' : '#f8faff', color: activeTab === id ? '#0080FF' : '#64748b', fontSize: 13, fontWeight: activeTab === id ? 600 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'editor' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Info box */}
          <div style={{ background: 'linear-gradient(135deg,rgba(0,229,196,0.06),rgba(0,128,255,0.06))', borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(0,128,255,0.15)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 18, flexShrink: 0 }}>💡</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0080FF', marginBottom: 3 }}>Dicas para um bom script</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                Use linguagem direta. Defina claramente a personalidade, o objetivo e o fluxo da conversa.
                A IA tambem tem acesso a <strong>pesquisa na web</strong> e a <strong>tabela de precos</strong> do Firestore para gerar orcamentos automaticamente.
              </div>
            </div>
          </div>

          {/* Editor */}
          <textarea
            value={script}
            onChange={e => setScript(e.target.value)}
            style={{
              flex: 1, minHeight: 500, padding: '16px 18px', borderRadius: 10, border: '1px solid #e2e8f0',
              fontSize: 13, fontFamily: 'monospace', lineHeight: 1.7, color: '#1e293b',
              background: 'white', resize: 'vertical', outline: 'none', boxSizing: 'border-box', width: '100%',
            }}
            placeholder="Escreva aqui o script da IA..."
          />
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
            {script.length} caracteres · {script.split('\n').length} linhas
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { title: 'Como a IA usa o script', color: '#0080FF', items: [
                'A Claude le o script completo antes de iniciar a conversa com o cliente',
                'O script define personalidade, tom, fluxo e o que deve ser coletado',
                'Voce pode atualizar o script a qualquer momento — entra em vigor na proxima conversa',
              ]},
              { title: 'Acesso a dados em tempo real', color: '#00E5C4', items: [
                'Web search: busca datas e locais de feiras automaticamente',
                'Tabela de precos: consulta custos por servico e regiao no Firestore',
                'Gera pre-orcamento completo com base nos dados coletados',
              ]},
              { title: 'Formato do resumo final', color: '#667eea', items: [
                'Ao final do briefing, a IA gera um JSON estruturado',
                'O JSON e processado para criar o projeto no sistema',
                'Voce pode customizar o formato do JSON no script',
              ]},
              { title: 'Boas praticas', color: '#f59e0b', items: [
                'Seja especifico sobre o que a IA deve perguntar',
                'Defina a ordem das perguntas para um fluxo natural',
                'Inclua exemplos de respostas esperadas quando necessario',
                'Teste o script regularmente conversando como cliente',
              ]},
            ].map((card, i) => (
              <div key={i} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: card.color, marginBottom: 12 }}>{card.title}</div>
                <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {card.items.map((item, j) => (
                    <li key={j} style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
