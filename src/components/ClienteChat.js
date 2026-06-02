import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, serverTimestamp, query, where, runTransaction, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Script da IA (fixo no código) ────────────────────────────────────────────
const SYSTEM_SCRIPT = `
Você é a Realize, assistente virtual da Realize Hub, plataforma especializada em eventos corporativos.

PERSONALIDADE:
- Chame o cliente pelo nome durante toda a conversa — o nome está no início do prompt
- Seja natural, simpática e objetiva
- Use linguagem informal mas profissional
- Faça 1 pergunta por vez — nunca mais que isso
- Se o cliente já respondeu algo → registre e pule
- Nunca invente perguntas fora das instruções recebidas
- Nunca pesquise na internet
- Registre TUDO que o cliente mencionar em observacoes

OBJETIVO:
Coletar as informações necessárias para montar a proposta do evento seguindo exatamente a instrução recebida a cada mensagem. Você não sugere produtos, tamanhos ou opções — isso é feito pelo sistema.

MARCADORES DO SISTEMA (escreva exatamente no texto quando indicado):
- MOSTRAR_MODELOS → quando cliente confirmar estande modular
- MOSTRAR_OPCOES:NomeExatoDoServiço → para cada serviço confirmado (use os nomes da lista de serviços disponíveis)
- ESCOLHER_PAGAMENTO → após confirmar todos os serviços

JSON FINAL (apenas quando a instrução pedir):
{
  "evento": { "tipo": "", "nome": "", "dataInicio": "DD/MM/AAAA", "dataFim": "DD/MM/AAAA", "diasDuracao": 0, "horarioInicio": "", "horarioFim": "", "cidade": "", "local": "", "endereco": "", "visitantesPorDia": 0, "nomeEmpresa": "" },
  "estrutura": { "ativo": false, "areaM2": 0, "alturaTeto": "", "diasMontagem": 0, "restricoes": "", "energia": "", "identidadeVisual": "", "tipoEstande": "", "observacoes": "" },
  "equipe": { "produtor": { "ativo": false, "dias": 0, "observacoes": "" }, "itens": [] },
  "equipamentos": { "led": { "ativo": false, "observacoes": "" }, "som": { "ativo": false, "observacoes": "" }, "dj": { "ativo": false, "observacoes": "" }, "foto": { "ativo": false, "observacoes": "" }, "outros": [] },
  "gastronomia": { "alimentos": { "ativo": false, "formato": "", "pessoas": 0, "horario": "", "restricoes": "", "observacoes": "" }, "bar": { "ativo": false, "tipo": "", "bebidas": "", "horas": 0, "bartender": false, "observacoes": "" } },
  "servicosMencionados": { "estrutura": false, "equipe": [], "led": false, "som": false, "dj": false, "foto": false, "gastronomia": false },
  "servicosNecessarios": [],
  "itensEmAnalise": [],
  "formaPagamento": ""
}

REGRAS DO JSON:
- servicosNecessarios NUNCA vazio se o cliente pediu algo
- equipe.itens = array: {"tipo":"","quantidade":0,"horasPorDia":0,"dias":0,"observacoes":""}
- Datas sempre DD/MM/AAAA
- formaPagamento fica vazio — preenchido pelo sistema
`;

function extractJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { return null; }
  }
  const m2 = text.match(/\{[\s\S]*"evento"[\s\S]*\}/);
  if (m2) { try { return JSON.parse(m2[0]); } catch { return null; } }
  return null;
}

// Carrossel de fotos para os cards de estande
function ModeloCarrossel({ fotos, idx, onPrev, onNext, onDot }) {
  if (!fotos?.length) return <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 32 }}>🏗️</span>;
  return (
    <>
      {fotos.map((url, i) => (
        <img key={url} src={url} alt=""
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', display: i === idx ? 'block' : 'none' }} />
      ))}
      {fotos.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); onPrev(); }}
            style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 16, zIndex: 2 }}>‹</button>
          <button onClick={e => { e.stopPropagation(); onNext(); }}
            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 16, zIndex: 2 }}>›</button>
          <div style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
            {fotos.map((_, i) => <div key={i} onClick={e => { e.stopPropagation(); onDot(i); }} style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? 'white' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }} />)}
          </div>
        </>
      )}
    </>
  );
}

export default function ClienteChat({ userData, onClose }) {
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [pricingData, setPricingData]   = useState([]);
  const [briefingJson, setBriefingJson] = useState(null);
  const [step, setStep]                 = useState('chat');
  const [stepAtual, setStepAtual] = useState('inicio');
  const [submitting, setSubmitting]     = useState(false);
  const [assistantName, setAssistantName] = useState('Realize');
  const [modelosEspeciais, setModelosEspeciais] = useState([]);
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [carrosselIdx, setCarrosselIdx] = useState({});
  const [catalogoSummary, setCatalogoSummary] = useState('');
  const [formaPagamento, setFormaPagamento] = useState(null);
  const [opcoesCards, setOpcoesCards]       = useState([]); // opções do serviço atual
  const [opcoesCardSelecionadas, setOpcoesCardSelecionadas] = useState({}); // msgId → opcao
  const [filaCards, setFilaCards]   = useState([]); // fila de cards pendentes
  const filaRef                     = useRef([]);   // ref para acessar fila sem stale closure
  const [servicoCardAtual, setServicoCardAtual] = useState(''); // nome do serviço sendo exibido
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Exibe o próximo card da fila ─────────────────────────────────────────
  const exibirProximoCard = (fila) => {
    if (!fila || fila.length === 0) return;
    const proximo = fila[0];
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      type: proximo.tipo,
      nomeServico: proximo.nomeServico || '',
      opcoes: proximo.opcoes || [],
      id: proximo.id,
    }]);
  };

  const avancarFila = () => {
    const novaFila = filaRef.current.slice(1);
    filaRef.current = novaFila;
    setFilaCards(novaFila);
    if (novaFila.length > 0) {
      exibirProximoCard(novaFila);
    }
  };

  const userId   = userData?.id;
  const userName = userData?.name || userData?.email?.split('@')[0] || 'Cliente';

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'servicePricing'));
        setPricingData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error('Erro ao carregar pricing:', e); }

      

      // Carrega lista de nomes dos serviços cadastrados para injetar no prompt
      try {
        const svSnap = await getDocs(collection(db, 'supplierServices'));
        const nomes = [...new Set(svSnap.docs.map(d => d.data().serviceName).filter(Boolean))];
        if (nomes.length > 0) {
          setCatalogoSummary(`\n\nSERVIÇOS DISPONÍVEIS NO SISTEMA (use esses nomes EXATOS nos marcadores MOSTRAR_OPCOES):\n${nomes.map(n => `- ${n}`).join('\n')}`);
        }
      } catch (e) { console.error('Erro ao carregar nomes dos serviços:', e); }

      // Carrega modelos de estandes especiais/modulares
      try {
        const modelosSnap = await getDocs(query(collection(db, 'modelosEspeciais'), where('ativo', '==', true)));
        const todosModelos = modelosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtra por região se já soubermos a cidade do evento
        const cidadeAtual = briefingJson?.evento?.cidade || '';
        const modelosFiltrados = cidadeAtual
          ? todosModelos.filter(m => {
              if (!m.regioes || m.regioes.length === 0) return true;
              if (m.regioes.includes('Todo o Brasil')) return true;
              const cidadeNorm = cidadeAtual.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              // Mapa de siglas para nomes
              const siglaMap = { 'SP': 'sao paulo', 'RJ': 'rio de janeiro', 'MG': 'minas gerais', 'PR': 'parana', 'RS': 'rio grande do sul', 'SC': 'santa catarina', 'BA': 'bahia', 'PE': 'pernambuco', 'CE': 'ceara', 'GO': 'goias', 'DF': 'distrito federal', 'ES': 'espirito santo', 'MA': 'maranhao', 'PA': 'para', 'MT': 'mato grosso', 'MS': 'mato grosso do sul', 'PB': 'paraiba', 'RN': 'rio grande do norte', 'AL': 'alagoas', 'PI': 'piaui', 'SE': 'sergipe', 'RO': 'rondonia', 'AM': 'amazonas', 'AC': 'acre', 'AP': 'amapa', 'RR': 'roraima', 'TO': 'tocantins' };
              return m.regioes.some(r => {
                const nomeEstado = siglaMap[r] || r.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return cidadeNorm.includes(nomeEstado) || nomeEstado.includes(cidadeNorm.split(' ')[0]);
              });
            })
          : todosModelos;

        if (modelosFiltrados.length > 0) {
          const linhasModelos = modelosFiltrados.map(m => {
            const caract = Array.isArray(m.caracteristicas) ? m.caracteristicas.join(', ') : (m.caracteristicas || '');
            return `- ${m.nome || 'Modelo'} | ${m.areaM2 ? m.areaM2 + 'm²' : ''} | Altura: ${m.altura || '?'}m | Inclui: ${caract}${m.descricao ? ' | ' + m.descricao : ''}${m.preco ? ' | R$' + parseFloat(m.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}${m.diasProducao ? ' | Producao: ' + m.diasProducao + ' dias' : ''}`;
          });
          setCatalogoSummary(''); // catálogo não é mais injetado no prompt
          setModelosEspeciais(modelosFiltrados);
        }
      } catch (e) { console.error('Erro ao carregar modelos especiais:', e); }
    })();
  }, []);

  // ── mensagem inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!assistantName) return;
    setMessages([{
      role: 'assistant',
      content: `Olá! Sou a **${assistantName}**, assistente de eventos da Realize Hub. 😊\n\nVou te ajudar a criar a proposta do seu evento. Para começar: **que tipo de evento você está planejando?**\n\n_(Pode ser uma feira, congresso, lançamento de produto, evento corporativo...)_`,
      id: 'init',
    }]);
  }, [assistantName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── avança o step baseado na resposta do cliente ─────────────────────────
  const avancarStep = (texto) => {
    const t = texto.toLowerCase();
    setStepAtual(prev => {
      if (prev === 'inicio')        return 'd1_dados';
      if (prev === 'd1_dados') {
        if (t.includes('produtor') || t.includes('sim') || t.includes('não') || t.includes('nao')) return 'd2_produtor';
        return 'd1_dados';
      }
      if (prev === 'd2_produtor')   return 'd3_estrutura';
      if (prev === 'd3_estrutura') {
        if (t.includes('não') || t.includes('nao') || t.includes('nenhum')) return 'd4_equipe';
        return 'd3_detalhes';
      }
      if (prev === 'd3_detalhes') {
        if (t.includes('modular') || t.includes('zero') || t.includes('pronto')) return 'd4_equipe';
        return 'd3_detalhes';
      }
      if (prev === 'd4_equipe') {
        if (t.includes('não') || t.includes('nao') || t.includes('nenhum')) return 'd5_servicos';
        return 'd4_detalhes';
      }
      if (prev === 'd4_detalhes')   return 'd5_servicos';
      if (prev === 'd5_servicos')   return 'd6_gastro';
      if (prev === 'd6_gastro') {
        if (t.includes('não') || t.includes('nao') || t.includes('nenhum')) return 'pagamento';
        return 'd6_detalhes';
      }
      if (prev === 'd6_detalhes')   return 'pagamento';
      if (prev === 'pagamento')     return 'json';
      return prev;
    });
  };

  // ── enviar mensagem ───────────────────────────────────────────────────────
  const sendMessage = async (textoForçado) => {
    const text = (textoForçado || input).trim();
    if (!text || loading) return;
    // Se tem cards na fila aguardando resposta, não chama a IA
    // (exceto quando a chamada vem de um card — textoForçado)
    if (filaRef.current.length > 0 && !textoForçado) return;
    setInput('');

    const userMsg = { role: 'user', content: text, id: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    // Avança o step baseado na resposta do cliente
    avancarStep(text);

    try {
      const history = updated.slice(-20).map(m => ({ role: m.role, content: m.content || '' }));

      const pricingSummary = pricingData.length > 0
        ? `\n\nTABELA DE PREÇOS (resumo):\n${pricingData.slice(0, 40).map(p =>
            `- ${p.tipo || ''} | ${p.subServiceId || p.serviceId || ''} | ${p.estado || 'SP'} | ${p.custoHora ? `R$${p.custoHora}/h` : ''} ${p.custoDiaria ? `R$${p.custoDiaria}/dia` : ''}`
          ).join('\n')}`
        : '';

      const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      // Garante lista de serviços atualizada a cada mensagem
      let listaNomes = catalogoSummary;
      if (!listaNomes) {
        try {
          const svSnap = await getDocs(collection(db, 'supplierServices'));
          const nomes = [...new Set(svSnap.docs.map(d => d.data().serviceName).filter(Boolean))];
          if (nomes.length > 0) {
            listaNomes = `\n\nSERVIÇOS DISPONÍVEIS NO SISTEMA (use esses nomes EXATOS nos marcadores MOSTRAR_OPCOES):\n${nomes.map(n => `- ${n}`).join('\n')}`;
            setCatalogoSummary(listaNomes);
          }
        } catch (e) { console.error(e); }
      }
      const STEPS = {
        inicio:      'Cumprimente o cliente e faça APENAS a primeira pergunta do bloco D1: tipo do evento.',
        d1_tipo:     'Registre o tipo do evento. Se o cliente já informou outros dados do D1, registre e pule. Faça APENAS a próxima pergunta não respondida do bloco D1.',
        d1_dados:    'Continue coletando os dados do bloco D1 que ainda faltam. APENAS 1 pergunta por vez.',
        d2_produtor: 'Bloco D1 completo. Faça APENAS a pergunta do bloco D2: se o cliente quer um Produtor de Eventos.',
        d3_estrutura:'Faça APENAS a pergunta do bloco D3: se o cliente precisa de estrutura física.',
        d3_detalhes: 'O cliente confirmou que precisa de estrutura. Colete os detalhes do bloco D3 um por vez. APENAS 1 pergunta.',
        d4_equipe:   'Faça APENAS a pergunta do bloco D4: se o cliente precisa de algum profissional.',
        d4_detalhes: 'O cliente confirmou profissional. Colete quantidade, horas, dias e perfil. APENAS 1 pergunta.',
        d5_servicos: 'Faça APENAS a pergunta do bloco D5: se o cliente precisa de equipamentos ou atrações.',
        d6_gastro:   'Faça APENAS a pergunta do bloco D6: se o cliente precisa de alimentação ou bebidas.',
        d6_detalhes: 'O cliente confirmou gastronomia. Colete os detalhes do bloco D6. APENAS 1 pergunta.',
        pagamento:   'Todos os blocos estão completos. Escreva um resumo breve e use o marcador ESCOLHER_PAGAMENTO.',
        json:        'O cliente escolheu o pagamento. Gere o JSON final completo.',
      };
      const instrucaoStep = `\n\n⚡ INSTRUÇÃO DESTA MENSAGEM (siga exatamente, ignore qualquer outro caminho):\n${STEPS[stepAtual] || STEPS.inicio}\nNão avance para outros blocos. Não faça perguntas de outros blocos. Não gere o JSON ainda (exceto se a instrução pedir).`;
      const basePrompt = `CLIENTE: ${userName}. Chame-o pelo nome durante toda a conversa.\nHOJE É: ${hoje}. Use sempre o ano correto (${new Date().getFullYear()}) ao mencionar datas e eventos.\n\n` + SYSTEM_SCRIPT + listaNomes + instrucaoStep;
      // Limita o system prompt a 12000 caracteres para evitar erro 400
      const systemPrompt = basePrompt.length > 12000 ? basePrompt.slice(0, 12000) + '\n\n[catálogo truncado por limite de tamanho]' : basePrompt;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages: history,
        }),
      });

      const data = await response.json();

      const assistantText = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      // Remove o marcador do texto visível (aceita [] ou {})
      const textoLimpo = assistantText
        .replace(/\[?{?MOSTRAR_MODELOS}?\]?/g, '')
        .replace(/\[?{?ESCOLHER_PAGAMENTO}?\]?/g, '')
        .replace(/MOSTRAR_OPCOES:[^\n]*/g, '')
        .trim();
      const assistantMsg = { role: 'assistant', content: textoLimpo, id: Date.now() + 1 };
      setMessages(prev => [...prev, assistantMsg]);

      // Se a IA usou o marcador → injeta card de seleção de modelos
      // ── Monta fila de cards a partir dos marcadores ──────────────────────
      const novosCards = [];

      // MOSTRAR_MODELOS → estande modular
      if (assistantText.includes('MOSTRAR_MODELOS')) {
        let modelos = modelosEspeciais;
        if (modelos.length === 0) {
          try {
            const snap = await getDocs(query(collection(db, 'modelosEspeciais'), where('ativo', '==', true)));
            modelos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setModelosEspeciais(modelos);
          } catch (e) { console.error(e); }
        }
        if (modelos.length > 0) {
          novosCards.push({ tipo: 'modelos', id: `modelos_${Date.now()}` });
        }
      }

      // MOSTRAR_OPCOES:X → serviços dinâmicos
      const matchesOpcoes = [...assistantText.matchAll(/MOSTRAR_OPCOES:([^\s\n,]+)/g)];
      const svSnap = matchesOpcoes.length > 0 ? await getDocs(collection(db, 'supplierServices')) : null;
      const todosServicos = svSnap ? svSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false) : [];
      const cidadeAtual = briefingJson?.evento?.cidade || '';
      const cidadeNormAtual = cidadeAtual.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      for (const match of matchesOpcoes) {
        const nomeServico = decodeURIComponent(match[1].replace(/_/g, ' ')).trim();
        const nomeNorm = nomeServico.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const servicos = todosServicos.filter(s => {
          if (cidadeNormAtual && s.regiao) {
            const reg = (s.regiao||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (!reg.includes(cidadeNormAtual) && !cidadeNormAtual.includes(reg) && !reg.includes('todo') && !reg.includes('nacional')) return false;
          }
          const sNorm = (s.serviceName||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const pNorm = (s.serviceParentName||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return sNorm.includes(nomeNorm) || nomeNorm.includes(sNorm) || pNorm.includes(nomeNorm) || nomeNorm.includes(pNorm);
        });

        const comOpcoes = await Promise.all(servicos.map(async s => {
          try {
            const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
            return opSnap.docs.map(d => ({ id: d.id, supplierId: s.supplierId, serviceName: s.serviceName, serviceParentName: s.serviceParentName, tipoServico: s.tipoServico, diasPreparo: s.diasPreparo || 0, diasMontagem: s.diasMontagem || 0, ...d.data() }));
          } catch { return []; }
        }));
        const opcoes = comOpcoes.flat();

        if (opcoes.length > 0) {
          novosCards.push({ tipo: 'opcoes_servico', nomeServico, opcoes, id: `opcao_${nomeServico}_${Date.now()}` });
        } else {
          // Não encontrou — avisa imediatamente (não entra na fila)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `⚠️ Não encontramos **${nomeServico}** cadastrado no sistema. Nosso coordenador vai avaliar e incluir antes da aprovação final.`,
            id: Date.now() + Math.random(),
          }]);
          setBriefingJson(prev => ({ ...prev, itensEmAnalise: [...(prev?.itensEmAnalise || []), nomeServico] }));
        }
      }

      // ESCOLHER_PAGAMENTO → entra no final da fila
      if (assistantText.includes('ESCOLHER_PAGAMENTO')) {
        novosCards.push({ tipo: 'pagamento', id: `pagamento_${Date.now()}` });
      }

      // Adiciona à fila e exibe o primeiro se a fila estava vazia
      if (novosCards.length > 0) {
        const filaAtual = filaRef.current;
        const novaFila = [...filaAtual, ...novosCards];
        filaRef.current = novaFila;
        setFilaCards(novaFila);
        if (filaAtual.length === 0) {
          exibirProximoCard(novaFila);
        }
      }

      const json = extractJson(assistantText);
      const jsonCompleto = json && json.evento &&
        json.evento.dataInicio &&
        json.evento.cidade &&
        json.evento.visitantesPorDia > 0 &&
        (json.servicosNecessarios?.length > 0) &&
        json.formaPagamento;
      if (json && json.evento) {
        setBriefingJson(json); // salva sempre para ter dados parciais
      }
      if (jsonCompleto) {
        // Se pediu estande modular, busca modelos disponíveis
        if (json.tipoEstande === 'modular') {
          try {
            const tiposSnap = await getDocs(query(collection(db, 'tiposEspeciais'), where('ativo', '==', true)));
            const tipoEstande = tiposSnap.docs.find(d => d.data().nome?.toLowerCase().includes('modular') || d.data().nome?.toLowerCase().includes('estande'));
            if (tipoEstande) {
              const modelosSnap = await getDocs(query(collection(db, 'modelosEspeciais'), where('tipoEspecialId', '==', tipoEstande.id), where('ativo', '==', true)));
              setModelosEspeciais(modelosSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
          } catch (e) { console.error('Erro ao buscar modelos:', e); }
        }
      } // fim jsonCompleto
    } catch (err) {
      console.error('Erro na API:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Desculpe, tive um problema de conexão. Pode repetir a última mensagem?',
        id: Date.now() + 2,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
      // Avança a fila depois que a IA respondeu
      if (filaRef.current.length > 0) {
        setTimeout(() => avancarFila(), 300);
      }
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── confirmar e salvar no Firestore ───────────────────────────────────────
  const handleConfirm = async () => {
    if (!briefingJson) return;
    setSubmitting(true);
    try {
      // Busca coordenadores
      let assignedTo = null;
      let assignedToName = null;
      try {
        const coordSnap = await getDocs(query(collection(db, 'users'), where('roleName', '==', 'Coordenador'), where('active', '==', true)));
        const coordenadores = coordSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (coordenadores.length > 0) {
          const budgetsSnap = await getDocs(query(collection(db, 'budgets'), where('status', '==', 'analyzing')));
          const contagemJobs = {};
          budgetsSnap.docs.forEach(d => {
            const at = d.data().assignedTo;
            if (at) contagemJobs[at] = (contagemJobs[at] || 0) + 1;
          });
          const escolhido = coordenadores.reduce((menor, coord) => {
            return (contagemJobs[coord.id] || 0) < (contagemJobs[menor.id] || 0) ? coord : menor;
          });
          assignedTo = escolhido.id;
          assignedToName = escolhido.name;
        }
      } catch (e) { console.error('Erro ao buscar coordenador:', e); }

      // ── gera número do pedido ──
      let numeroPedido = '';
      try {
        const { runTransaction, doc: firestoreDoc, getDoc: firestoreGetDoc } = await import('firebase/firestore');
        const contadorRef = firestoreDoc(db, 'config', 'contadores');
        await runTransaction(db, async (transaction) => {
          const contSnap = await transaction.get(contadorRef);
          const atual = contSnap.exists() ? (contSnap.data().orcamentos || 0) : 0;
          const proximo = atual + 1;
          transaction.set(contadorRef, { orcamentos: proximo }, { merge: true });
          const ano = new Date().getFullYear().toString().slice(-2);
          numeroPedido = `OP-${String(proximo).padStart(4, '0')}-${ano}`;
        });
      } catch (e) { console.error('Erro ao gerar numeroPedido:', e); }

      const budgetRef = await addDoc(collection(db, 'budgets'), {
        clientUserId: userId,
        clientName: userName,
        eventName: briefingJson.evento?.nome || briefingJson.evento?.tipo || 'Novo Evento',
        eventTypeName: briefingJson.evento?.tipo || '',
        startDate: briefingJson.evento?.dataInicio || '',
        endDate: briefingJson.evento?.dataFim || '',
        location: briefingJson.evento?.local || briefingJson.evento?.cidade || '',
        guestCount: briefingJson.evento?.visitantesPorDia || 0,
        status: 'analyzing',
        workspaceStage: 'Propostas',
        isMae: true,
        numeroPedido,
        briefingData: { ...briefingJson, formaPagamento: formaPagamento || '' },
        financeiro: { formaPagamento: formaPagamento || '' },
        assignedTo,
        assignedToName,
        assignedAt: assignedTo ? serverTimestamp() : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // ── cria supplierJobs ──
      try {
        const servicosNecessarios = briefingJson.servicosNecessarios || [];
        console.log('servicosNecessarios:', servicosNecessarios);

        const suppServSnap = await getDocs(collection(db, 'supplierServices'));
        const todosServicos = suppServSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const cidadeEvento = normalize(briefingJson.evento?.cidade || '');

        const suppServs = todosServicos.filter(s => {
          if (s.ativo === false) return false;

          // Filtro por região
          if (s.regiao) {
            const regiaoServico = normalize(s.regiao);
            const cidadeMatch = !cidadeEvento || regiaoServico.includes(cidadeEvento) || cidadeEvento.includes(regiaoServico) || regiaoServico.includes('todo') || regiaoServico.includes('nacional');
            if (!cidadeMatch) return false;
          }

          const svcName = normalize(s.serviceName);
          const parentName = normalize(s.serviceParentName);

          // 1. Match exato pelo nome do serviço
          if (servicosNecessarios.some(sn => normalize(sn) === svcName)) return true;
          // 2. Match exato pela categoria pai
          if (servicosNecessarios.some(sn => normalize(sn) === parentName)) return true;
          // 3. Match parcial controlado
          if (servicosNecessarios.some(sn => {
            const snNorm = normalize(sn);
            return snNorm.includes(svcName) || svcName.includes(snNorm);
          })) return true;
          // 4. Sinônimos estritos
          const sinonimosExatos = {
            'recepcionista': ['recepcionista', 'hostess', 'recepcao'],
            'hostess':       ['recepcionista', 'hostess', 'recepcao'],
            'dj':            ['dj', 'disc jockey'],
            'seguranca':     ['seguranca', 'vigilancia', 'segurança patrimonial'],
            'limpeza':       ['limpeza', 'auxiliar de limpeza'],
            'led':           ['led', 'painel de led', 'led / neon', 'neon'],
            'som':           ['som', 'sistema pa', 'sistema de som', 'caixa de som', 'audio'],
          };
          for (const [, terms] of Object.entries(sinonimosExatos)) {
            const svcMatch = terms.some(t => svcName.includes(t) || t.includes(svcName));
            if (svcMatch) {
              const pedidoMatch = servicosNecessarios.some(sn => terms.some(t => normalize(sn).includes(t) || t.includes(normalize(sn))));
              if (pedidoMatch) return true;
            }
          }
          return false;
        });

        // Deduplicação por supplierId + serviceName
        const vistos = new Set();
        const suppServsDedupados = suppServs.filter(s => {
          const key = `${s.supplierId}__${s.serviceName}`;
          if (vistos.has(key)) return false;
          vistos.add(key);
          return true;
        });

        // Cria um supplierJob por serviço
        for (const sv of suppServsDedupados) {
          await addDoc(collection(db, 'supplierJobs'), {
            supplierId: sv.supplierId,
            budgetId: budgetRef.id,
            eventName: briefingJson.evento?.nome || briefingJson.evento?.tipo || 'Novo Evento',
            eventTypeName: briefingJson.evento?.tipo || '',
            clientName: userName,
            eventDate: briefingJson.evento?.dataInicio || '',
            eventDateFim: briefingJson.evento?.dataFim || '',
            eventLocal: briefingJson.evento?.local || briefingJson.evento?.cidade || '',
            eventCidade: briefingJson.evento?.cidade || '',
            eventHorarioInicio: briefingJson.evento?.horarioInicio || '',
            eventHorarioFim: briefingJson.evento?.horarioFim || '',
            eventDiasDuracao: briefingJson.evento?.diasDuracao || 1,
            eventVisitantes: briefingJson.evento?.visitantesPorDia || 0,
            serviceNames: [sv.serviceName],
            serviceName: sv.serviceName,
            serviceParentName: sv.serviceParentName || '',
            tipoServico: sv.tipoServico || '',
            preco: sv.preco || 0,
            unidade: sv.unidade || '',
            diasPreparo: sv.diasPreparo || 0,
            diasMontagem: sv.diasMontagem || 0,
            stage: 'proposta',
            status: 'draft',
            createdAt: serverTimestamp(),
          });
          console.log('supplierJob criado:', sv.serviceName, '→', sv.supplierId);
        }

        // Cria supplierJob para estande modular se cliente escolheu um modelo
        const modeloEscolhido = modeloSelecionado || briefingJson.modeloEstande;
        const pedidoModular = (briefingJson.servicosNecessarios || []).some(sn =>
          (sn || '').toLowerCase().includes('modular') || (sn || '').toLowerCase().includes('estande')
        );
        if (pedidoModular && modeloEscolhido) {
          try {
            const tiposSnap = await getDocs(collection(db, 'tiposEspeciais'));
            const todosTipos = tiposSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const tipoDoModelo = todosTipos.find(t =>
              t.id === modeloEscolhido.tipoEspecialId ||
              t.nome?.toLowerCase().includes('modular') ||
              t.nome?.toLowerCase().includes('estande')
            );
            const fornecedoresAutorizados = tipoDoModelo?.fornecedoresAutorizados || [];
            const fornVisto = new Set();
            for (const forn of fornecedoresAutorizados) {
              if (fornVisto.has(forn.id)) continue;
              fornVisto.add(forn.id);
              await addDoc(collection(db, 'supplierJobs'), {
                supplierId:         forn.id,
                supplierName:       forn.nome || '',
                budgetId:           budgetRef.id,
                eventName:          briefingJson.evento?.nome || 'Novo Evento',
                eventTypeName:      briefingJson.evento?.tipo || '',
                clientName:         userName,
                eventDate:          briefingJson.evento?.dataInicio || '',
                eventDateFim:       briefingJson.evento?.dataFim || '',
                eventLocal:         briefingJson.evento?.local || briefingJson.evento?.cidade || '',
                eventCidade:        briefingJson.evento?.cidade || '',
                eventHorarioInicio: briefingJson.evento?.horarioInicio || '',
                eventHorarioFim:    briefingJson.evento?.horarioFim || '',
                eventDiasDuracao:   briefingJson.evento?.diasDuracao || 1,
                eventVisitantes:    briefingJson.evento?.visitantesPorDia || 0,
                serviceNames:       [modeloEscolhido.nome],
                serviceName:        modeloEscolhido.nome,
                serviceParentName:  tipoDoModelo?.nome || 'Estande Modular',
                tipoServico:        'estrutura',
                modeloEspecialId:   modeloEscolhido.id,
                preco:              modeloEscolhido.precoBase || 0,
                unidade:            'por evento',
                diasPreparo:        modeloEscolhido.diasProducao || 0,
                diasMontagem:       0,
                stage:              'proposta',
                status:             'draft',
                createdAt:          serverTimestamp(),
              });
              console.log('supplierJob estande modular criado:', modeloEscolhido.nome, '→', forn.id);
            }
          } catch (e) { console.error('Erro ao criar job estande modular:', e); }
        }
      } catch (e) { console.error('Erro ao criar supplierJobs:', e); }

      // ── gera cronograma via IA ──
      try {
        // Busca tempos de preparo dos supplierServices disponíveis
        const svSnap = await getDocs(collection(db, 'supplierServices'));
        const svAll  = svSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);

        // Monta resumo de tempos por serviço para a IA
        const servicosComTempo = svAll
          .filter(s => s.diasPreparo > 0)
          .map(s => `${s.serviceName}: ${s.diasPreparo} dias de preparo`)
          .join('\n');

        const dataEvento = briefingJson.evento?.dataInicio || '';
        const servicosResumidos = svAll
          .filter(s => s.diasPreparo > 0 || s.diasMontagem > 0)
          .map(s => `${s.serviceName}:preparo=${s.diasPreparo||0}d,montagem=${s.diasMontagem||0}d`)
          .join(';');

        const hoje = new Date().toISOString().split('T')[0];
        const cronogramaPrompt = `Monte cronograma de produção para evento corporativo. Responda APENAS JSON compacto sem espaços desnecessários.

Evento:${briefingJson.evento?.nome||briefingJson.evento?.tipo},data:${dataEvento},dias:${briefingJson.evento?.diasDuracao||1},cidade:${briefingJson.evento?.cidade||''}
Serviços:${(briefingJson.servicosNecessarios||[]).join(',')}
Tempos:${servicosResumidos||'padrão'}
Hoje:${hoje}

Regras:
- máximo 10 etapas, ordem lógica, campos curtos, descrição max 60 chars
- calcule datas de trás para frente a partir da data do evento
- NUNCA coloque datas anteriores a hoje (${hoje})
- se alguma etapa precisaria ter começado antes de hoje, coloque dataInicio e dataEntrega iguais a hoje e adicione o campo "atrasado":true
- se o prazo total for inviável (menos de 5 dias úteis para o evento), adicione "prazoInviavel":true no JSON raiz

JSON:{"prazoInviavel":false,"etapas":[{"id":"e1","n":"nome curto","d":"desc curta","r":"coordenador","di":"YYYY-MM-DD","de":"YYYY-MM-DD","da":30,"s":"pendente","t":"administrativo","atrasado":false}]}
Campos: id,n(nome),d(desc),r(responsavel),di(dataInicio),de(dataEntrega),da(diasAntes),s(status),t(tipo),atrasado`;

        const cronRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 8000,
            system: 'Responda APENAS com JSON válido e compacto. Sem texto, sem markdown, sem backticks. O JSON deve ser parseável por JSON.parse().',
            messages: [{ role: 'user', content: cronogramaPrompt }],
          }),
        });
        const cronData = await cronRes.json();
        const cronText = (cronData.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
        console.log('Cronograma raw length:', cronText.length);
        let cronJson = null;
        try {
          const clean = cronText.replace(/```json|```/g, '').trim();
          cronJson = JSON.parse(clean);
        } catch (e) {
          console.error('Erro ao parsear cronograma:', e);
          console.log('Cronograma raw (primeiros 500):', cronText.slice(0, 500));
        }

        if (cronJson?.etapas?.length > 0) {
          // Normaliza campos curtos para campos completos
          const etapasNormalizadas = cronJson.etapas.map(e => ({
            id:           e.id || e.n,
            nome:         e.n  || e.nome,
            descricao:    e.d  || e.descricao || '',
            responsavel:  e.r  || e.responsavel || 'coordenador',
            dataInicio:   e.di || e.dataInicio || '',
            dataEntrega:  e.de || e.dataEntrega || '',
            diasAntes:    e.da ?? e.diasAntes ?? 0,
            dependencias: e.dep || e.dependencias || [],
            status:       e.s  || e.status || 'pendente',
            tipo:         e.t  || e.tipo || 'administrativo',
          }));
          await updateDoc(doc(db, 'budgets', budgetRef.id), {
            cronograma: {
              etapas: etapasNormalizadas,
              prazoInviavel: cronJson.prazoInviavel || false,
            }
          });
          console.log('Cronograma gerado:', etapasNormalizadas.length, 'etapas');

          // Se prazo inviável, adiciona mensagem de aviso no chat
          if (cronJson.prazoInviavel) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: '⚠️ **Atenção:** O prazo para este evento é muito curto. Algumas etapas de produção não poderão ser concluídas a tempo. Recomendo verificar com o coordenador quais itens ainda são viáveis de contratar.',
            }]);
          }
        }
      } catch (e) { console.error('Erro ao gerar cronograma:', e); }

      // ── gera texto descritivo do briefing ──
      try {
        const descPrompt = `Com base nos dados abaixo, escreva UM parágrafo curto e direto descrevendo o evento para a equipe interna. Máximo 3 linhas, sem títulos, sem listas.

BRIEFING:
Evento: ${briefingJson.evento?.nome || briefingJson.evento?.tipo}
Tipo: ${briefingJson.evento?.tipo}
Data: ${briefingJson.evento?.dataInicio} a ${briefingJson.evento?.dataFim}
Local: ${briefingJson.evento?.local || briefingJson.evento?.cidade}
Visitantes/dia: ${briefingJson.evento?.visitantesPorDia}
Duração: ${briefingJson.evento?.diasDuracao} dia(s)
Horário: ${briefingJson.evento?.horario || 'não informado'}
Serviços necessários: ${(briefingJson.servicosNecessarios || []).join(', ')}
Estrutura: ${JSON.stringify(briefingJson.estrutura || {})}
Equipe: ${JSON.stringify(briefingJson.equipe || {})}`;

        const descRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            system: 'Você é um especialista em eventos corporativos. Escreva em português brasileiro, tom profissional mas acessível. Sem markdown, texto corrido.',
            messages: [{ role: 'user', content: descPrompt }],
          }),
        });
        const descData = await descRes.json();
        const descText = (descData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (descText) {
          await updateDoc(doc(db, 'budgets', budgetRef.id), { descricaoBriefing: descText });
          console.log('Descrição do briefing gerada:', descText.slice(0, 100));
        }
      } catch (e) { console.error('Erro ao gerar descrição:', e); }

      setStep('sent');
    } catch (err) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderText = (text) => {
    return text
      .replace(/```json[\s\S]*?```/g, '<div class="bia-json-block" style="cursor:pointer" onclick="document.getElementById(\'btn-ver-resumo\').click()">📋 Resumo do briefing gerado — clique para revisar</div>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  // ─── tela de seleção de modelo modular ──────────────────────────────────────
  if (step === 'modelos' && briefingJson?.tipoEstande === 'modular') {
    return (
      <Overlay onClose={onClose}>
        <ModalHeader title="Escolha o modelo de estande" subtitle="Selecione o modelo que melhor atende seu evento" onClose={onClose} assistantName={assistantName} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {modelosEspeciais.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#7BAFD4', fontSize: 13 }}>
              Nenhum modelo disponível no momento. Prossiga com o orçamento padrão.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {modelosEspeciais.map(m => {
                const fotos = m.fotos?.length > 0 ? m.fotos.map(f => f.url) : (m.fotoUrl ? [m.fotoUrl] : []);
                const [fotoIdx, setFotoIdx] = [0, () => {}]; // será gerenciado por estado local abaixo
                return (
                <div key={m.id}
                  onClick={() => setModeloSelecionado(m)}
                  style={{ borderRadius: 12, border: `2px solid ${modeloSelecionado?.id === m.id ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: modeloSelecionado?.id === m.id ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s' }}>
                  {/* Foto principal */}
                  <div style={{ height: 150, background: 'rgba(0,128,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                    {fotos.length > 0 ? (
                      <ModeloCarrossel
                        fotos={fotos}
                        idx={carrosselIdx[m.id] || 0}
                        onPrev={() => setCarrosselIdx(prev => ({ ...prev, [m.id]: ((prev[m.id] || 0) - 1 + fotos.length) % fotos.length }))}
                        onNext={() => setCarrosselIdx(prev => ({ ...prev, [m.id]: ((prev[m.id] || 0) + 1) % fotos.length }))}
                        onDot={i => setCarrosselIdx(prev => ({ ...prev, [m.id]: i }))}
                      />
                    ) : <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 32 }}>🏗️</span>}
                  </div>
                  {/* Info */}
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF', marginBottom: 4 }}>{m.nome}</div>
                    {m.descricao && <div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6 }}>{m.descricao}</div>}
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#7BAFD4', marginBottom: 8 }}>
                      {m.areaM2 && <span>📐 {m.areaM2}m²</span>}
                      {m.altura && <span>↕ {m.altura}m</span>}
                      <span>⏱ {m.diasProducao} dias prod.</span>
                    </div>
                    {m.caracteristicas?.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Inclui</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {m.caracteristicas.map((c, i) => <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,229,196,0.08)', color: '#00E5C4' }}>{c}</span>)}
                        </div>
                      </div>
                    )}
                    {m.moveis?.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Móveis</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {m.moveis.map((mv, i) => <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(123,175,212,0.1)', color: '#7BAFD4' }}>{mv}</span>)}
                        </div>
                      </div>
                    )}
                    {m.tecnologia?.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Tecnologia</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {m.tecnologia.map((t, i) => <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(102,126,234,0.1)', color: '#667eea' }}>{t}</span>)}
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#00E5C4' }}>
                      R$ {m.precoBase?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  {modeloSelecionado?.id === m.id && (
                    <div style={{ background: '#00E5C4', textAlign: 'center', padding: '6px', fontSize: 12, fontWeight: 700, color: '#0D1B2A' }}>✓ Selecionado</div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,180,255,0.08)', display: 'flex', gap: 10 }}>
          <button onClick={() => setStep('review')} style={styles.btnSecondary}>← Voltar</button>
          <button
            onClick={() => {
              if (modeloSelecionado) {
                // Injeta modelo no briefingJson
                setBriefingJson(prev => ({
                  ...prev,
                  modeloEstande: {
                    id: modeloSelecionado.id,
                    nome: modeloSelecionado.nome,
                    areaM2: modeloSelecionado.areaM2,
                    precoBase: modeloSelecionado.precoBase,
                    diasProducao: modeloSelecionado.diasProducao,
                  },
                  servicosNecessarios: [
                    ...(prev.servicosNecessarios || []).filter(s => !s.toLowerCase().includes('estande')),
                    modeloSelecionado.nome,
                  ],
                }));
              }
              setStep('review');
            }}
            style={{ ...styles.btnPrimary, flex: 1, opacity: (!modeloSelecionado && modelosEspeciais.length > 0) ? 0.5 : 1 }}
            disabled={!modeloSelecionado && modelosEspeciais.length > 0}>
            {modeloSelecionado ? `Confirmar: ${modeloSelecionado.nome} →` : modelosEspeciais.length === 0 ? 'Continuar →' : 'Selecione um modelo'}
          </button>
        </div>
      </Overlay>
    );
  }

  // ─── tela de sucesso ──────────────────────────────────────────────────────
  if (step === 'sent') {
    return (
      <Overlay onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '60px 40px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,229,196,0.1)', border: '2px solid #00E5C4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 28 }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: '#E8F4FF', marginBottom: 10 }}>Evento enviado!</h2>
          <p style={{ fontSize: 14, color: '#7BAFD4', lineHeight: 1.7, maxWidth: 360, margin: '0 auto 32px' }}>
            Seu pré-orçamento foi enviado para análise. A equipe Realize irá verificar e encaminhar para os fornecedores.
          </p>
          <button onClick={onClose} style={styles.btnPrimary}>Voltar ao workspace</button>
        </div>
      </Overlay>
    );
  }

  // ─── tela de revisão ──────────────────────────────────────────────────────
  if (step === 'review' && briefingJson) {
    const ev  = briefingJson.evento    || {};
    const est = briefingJson.estrutura || {};
    const eq  = briefingJson.equipe    || {};

    return (
      <Overlay onClose={onClose}>
        <ModalHeader title="Revisar pré-orçamento" subtitle="Confirme os dados antes de enviar" onClose={onClose} assistantName={assistantName} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 28px' }}>
          <Section title="Dados do Evento">
            <Grid2>
              <Field label="Tipo" value={ev.tipo} />
              <Field label="Nome" value={ev.nome} />
              <Field label="Data início" value={ev.dataInicio} />
              <Field label="Data fim" value={ev.dataFim} />
              <Field label="Duração" value={ev.diasDuracao ? `${ev.diasDuracao} dias` : null} />
              <Field label="Cidade" value={ev.cidade} />
              <Field label="Local" value={ev.local} />
              <Field label="Visitantes/dia" value={ev.visitantesPorDia} />
            </Grid2>
          </Section>
          <Section title="Estrutura">
            <Grid2>
              <Field label="Área" value={est.areaM2 ? `${est.areaM2} m²` : null} />
              <Field label="Tipo de estande" value={briefingJson.tipoEstande === 'modular' ? 'Modular' : briefingJson.tipoEstande === 'personalizado' ? 'Personalizado' : null} />
              {briefingJson.modeloEstande && <Field label="Modelo selecionado" value={briefingJson.modeloEstande.nome} />}
              <Field label="Montagem" value={est.montagem ? 'Sim' : 'Não'} />
              <Field label="Iluminação" value={est.iluminacao ? 'Sim' : 'Não'} />
              <Field label="Som" value={est.som ? 'Sim' : 'Não'} />
              <Field label="Telão" value={est.telao ? 'Sim' : 'Não'} />
              <Field label="Mobiliário" value={est.mobiliario ? 'Sim' : 'Não'} />
            </Grid2>
          </Section>
          <Section title="Equipe Operacional">
            <Grid2>
              {eq.recepcionistas?.quantidade > 0 && <Field label="Recepcionistas" value={`${eq.recepcionistas.quantidade} × ${eq.recepcionistas.horasPorDia}h/dia`} />}
              {eq.seguranca?.quantidade > 0 && <Field label="Segurança" value={`${eq.seguranca.quantidade} × ${eq.seguranca.horasPorDia}h/dia`} />}
              {eq.limpeza?.quantidade > 0 && <Field label="Limpeza" value={`${eq.limpeza.quantidade} × ${eq.limpeza.horasPorDia}h/dia`} />}
              {eq.garcons?.quantidade > 0 && <Field label="Garçons" value={`${eq.garcons.quantidade} × ${eq.garcons.horasPorDia}h/dia`} />}
              {eq.dj?.quantidade > 0 && <Field label="DJ" value={`${eq.dj.quantidade} × ${eq.dj.horasPorDia}h/dia`} />}
              {eq.fotografo?.quantidade > 0 && <Field label="Fotógrafo" value={`${eq.fotografo.quantidade} × ${eq.fotografo.horasPorDia}h/dia`} />}
              {eq.operadorTecnico?.quantidade > 0 && <Field label="Op. Técnico" value={`${eq.operadorTecnico.quantidade} × ${eq.operadorTecnico.horasPorDia}h/dia`} />}
              {/* Renderiza qualquer outro item da equipe dinamicamente */}
              {Object.entries(eq).filter(([k]) => !['recepcionistas','seguranca','limpeza','garcons','dj','fotografo','operadorTecnico'].includes(k)).map(([k, v]) =>
                v?.quantidade > 0 ? <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={`${v.quantidade} × ${v.horasPorDia}h/dia`} /> : null
              )}
            </Grid2>
          </Section>
          {/* Serviços identificados */}
          {briefingJson.servicosNecessarios?.length > 0 && (
            <Section title="Serviços identificados">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {briefingJson.servicosNecessarios.map((s, i) => (
                  <span key={i} style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(0,229,196,0.08)', border: '1px solid rgba(0,229,196,0.2)', color: '#00E5C4', fontSize: 12, fontWeight: 500 }}>{s}</span>
                ))}
              </div>
            </Section>
          )}
          {/* Forma de pagamento */}
          {formaPagamento && (
            <Section title="Forma de pagamento">
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(0,180,255,0.08)' }}>
                <div style={{ fontSize: 13, color: '#E8F4FF' }}>
                  {formaPagamento === '50_50' && '50% na entrada + 50% no final do evento'}
                  {formaPagamento === '30_60_90' && '30, 60 e 90 dias'}
                  {formaPagamento === 'a_vista' && 'À vista'}
                </div>
              </div>
            </Section>
          )}
          <div style={{ background: 'rgba(0,229,196,0.06)', border: '1px solid rgba(0,229,196,0.2)', borderRadius: 10, padding: '12px 16px', marginTop: 8 }}>
            <p style={{ fontSize: 12, color: 'rgba(0,229,196,0.8)', lineHeight: 1.6, margin: 0 }}>
              ℹ️ Este é um <strong>pré-orçamento estimado</strong>. Os valores finais serão confirmados pelos fornecedores.
            </p>
          </div>
        </div>
        <div style={{ padding: '16px 28px 24px', borderTop: '1px solid rgba(0,180,255,0.08)', display: 'flex', gap: 10 }}>
          <button onClick={() => setStep('chat')} style={styles.btnSecondary}>← Voltar ao chat</button>
          <button onClick={handleConfirm} disabled={submitting} style={{ ...styles.btnPrimary, flex: 1, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Enviando...' : 'Confirmar e Enviar ✓'}
          </button>
        </div>
      </Overlay>
    );
  }

  // ─── tela de chat ─────────────────────────────────────────────────────────
  const initLetter = assistantName ? assistantName[0].toUpperCase() : 'R';

  return (
    <Overlay onClose={onClose}>
      <style>{`
        .bia-msg-bubble a { color: #00E5C4; }
        .bia-json-block { display: inline-block; background: rgba(0,229,196,0.1); border: 1px solid rgba(0,229,196,0.3); border-radius: 8px; padding: 6px 14px; font-size: 12px; color: #00E5C4; margin: 4px 0; }
        .bia-input:focus { outline: none; border-color: rgba(0,229,196,0.4) !important; }
        .bia-send-btn:hover:not(:disabled) { background: rgba(0,229,196,0.2) !important; }
        .bia-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      <ModalHeader
        title={`Chat com a ${assistantName}`}
        subtitle="Assistente de eventos Realize Hub"
        onClose={onClose}
        assistantName={assistantName}
        extra={briefingJson && (
          <button id="btn-ver-resumo" onClick={() => {
            if (briefingJson.tipoEstande === 'modular' && modelosEspeciais.length > 0) {
              setStep('modelos');
            } else {
              setStep('review');
            }
          }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            Ver resumo →
          </button>
        )}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
            {msg.role === 'assistant' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, marginBottom: 2 }}>{initLetter}</div>
            )}

            {/* Cards de modelos inline */}
            {msg.type === 'modelos' ? (
              <div style={{ flex: 1, maxWidth: '90%' }}>
                <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 10 }}>Escolha o modelo de estande:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {modelosEspeciais.map(m => {
                    const fotos = m.fotos?.length > 0 ? m.fotos.map(f => f.url) : (m.fotoUrl ? [m.fotoUrl] : []);
                    return (
                    <div key={m.id} onClick={() => setModeloSelecionado(m)}
                      style={{ borderRadius: 10, border: `2px solid ${modeloSelecionado?.id === m.id ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: modeloSelecionado?.id === m.id ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s' }}>
                      <div style={{ height: 110, overflow: 'hidden', background: 'rgba(0,128,255,0.08)', position: 'relative' }}>
                        <ModeloCarrossel
                          fotos={fotos}
                          idx={carrosselIdx[m.id] || 0}
                          onPrev={() => setCarrosselIdx(prev => ({ ...prev, [m.id]: ((prev[m.id] || 0) - 1 + fotos.length) % fotos.length }))}
                          onNext={() => setCarrosselIdx(prev => ({ ...prev, [m.id]: ((prev[m.id] || 0) + 1) % fotos.length }))}
                          onDot={i => setCarrosselIdx(prev => ({ ...prev, [m.id]: i }))}
                        />
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#E8F4FF', marginBottom: 3 }}>{m.nome}</div>
                        {m.descricao && <div style={{ fontSize: 10, color: '#7BAFD4', marginBottom: 4 }}>{m.descricao}</div>}
                        <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#7BAFD4', marginBottom: 4 }}>
                          {m.areaM2 && <span>📐 {m.areaM2}m²</span>}
                          {m.altura && <span>↕ {m.altura}m</span>}
                        </div>
                        {m.caracteristicas?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
                            {m.caracteristicas.map((c, i) => <span key={i} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(0,229,196,0.08)', color: '#00E5C4' }}>{c}</span>)}
                          </div>
                        )}
                        {m.moveis?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
                            {m.moveis.map((mv, i) => <span key={i} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(123,175,212,0.1)', color: '#7BAFD4' }}>{mv}</span>)}
                          </div>
                        )}
                        {m.tecnologia?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
                            {m.tecnologia.map((t, i) => <span key={i} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(102,126,234,0.1)', color: '#667eea' }}>{t}</span>)}
                          </div>
                        )}
                        {m.precoBase && <div style={{ fontSize: 13, fontWeight: 700, color: '#00E5C4' }}>R$ {m.precoBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
                      </div>
                    </div>
                    );
                  })}
                </div>
                {modeloSelecionado && (
                  <button onClick={() => { sendMessage(`Quero o ${modeloSelecionado.nome} (${modeloSelecionado.areaM2}m²)`); }}
                    style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                    Confirmar: {modeloSelecionado.nome} →
                  </button>
                )}
              </div>

              ) : msg.type === 'opcoes_servico' ? (
                <div style={{ width: '100%', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 10 }}>
                    Opções disponíveis para <strong style={{ color: '#E8F4FF' }}>{msg.nomeServico}</strong>:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(msg.opcoes || []).map(op => (
                      <div key={op.id} onClick={() => setOpcoesCardSelecionadas(prev => ({ ...prev, [msg.id]: op }))}
                        style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${opcoesCardSelecionadas[msg.id]?.id === op.id ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: opcoesCardSelecionadas[msg.id]?.id === op.id ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', transition: 'all 0.15s' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>{op.nome}</div>
                          {op.caracteristica && <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>{op.caracteristica}</div>}
                          {op.valor && <div style={{ fontSize: 14, fontWeight: 700, color: '#00E5C4', marginTop: 4 }}>R$ {parseFloat(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {op.unidade || ''}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => {
                        sendMessage(`Para ${msg.nomeServico}: não preciso desse serviço`);
                        setOpcoesCardSelecionadas(prev => { const n = {...prev}; delete n[msg.id]; return n; });
                      }} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        Não preciso
                      </button>
                      {opcoesCardSelecionadas[msg.id] && (
                        <button onClick={() => {
                          const op = opcoesCardSelecionadas[msg.id];
                          sendMessage(`Para ${msg.nomeServico}: selecionei a opção ${op.nome}${op.caracteristica ? ' (' + op.caracteristica + ')' : ''}`);
                          
                        }} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                          Confirmar: {opcoesCardSelecionadas[msg.id].nome} →
                        </button>
                      )}
                    </div>
                  </div>
                  
            ) : msg.type === 'pagamento' ? (
              /* Botões de forma de pagamento */
              <div style={{ flex: 1, maxWidth: '90%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: '50% na entrada + 50% no final do evento', valor: '50_50' },
                    { label: '30, 60 e 90 dias', valor: '30_60_90' },
                    { label: 'À vista', valor: 'a_vista' },
                  ].map(op => {
                    const selecionado = formaPagamento === op.valor;
                    return (
                      <button
                        key={op.valor}
                        onClick={() => {
                          setFormaPagamento(op.valor);
                          sendMessage(op.label);
                        }}
                        style={{
                          padding: '12px 16px',
                          borderRadius: 10,
                          border: `2px solid ${selecionado ? '#00E5C4' : 'rgba(0,180,255,0.2)'}`,
                          background: selecionado ? 'rgba(0,229,196,0.1)' : 'rgba(255,255,255,0.03)',
                          color: selecionado ? '#00E5C4' : '#E8F4FF',
                          fontSize: 13,
                          fontWeight: selecionado ? 600 : 400,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'Outfit, sans-serif',
                          transition: 'all 0.15s',
                        }}
                      >
                        {selecionado ? '✓ ' : ''}{op.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
            <div className="bia-msg-bubble"
              style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.role === 'user' ? 'rgba(0,128,255,0.18)' : 'rgba(255,255,255,0.04)', border: msg.role === 'user' ? '1px solid rgba(0,128,255,0.3)' : '1px solid rgba(0,180,255,0.1)', fontSize: 13, lineHeight: 1.6, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif' }}
              dangerouslySetInnerHTML={{ __html: renderText(msg.content) }}
            />
            )}
            {msg.role === 'user' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,128,255,0.15)', border: '1px solid rgba(0,128,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#7BAFD4', flexShrink: 0, marginBottom: 2 }}>
                {userName[0]?.toUpperCase()}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{initLetter}</div>
            <div style={{ padding: '12px 16px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,180,255,0.1)', display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5C4', animation: `biaTyping 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(0,180,255,0.08)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea ref={inputRef} className="bia-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
          placeholder="Digite sua mensagem... (Enter para enviar)" rows={1}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.15)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', resize: 'none', lineHeight: 1.5, maxHeight: 100, overflowY: 'auto' }}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
        />
        <button className="bia-send-btn" onClick={() => sendMessage()} disabled={loading || !input.trim()}
          style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(0,229,196,0.3)', background: 'rgba(0,229,196,0.08)', color: '#00E5C4', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}>
          ↑
        </button>
      </div>

      <style>{`
        @keyframes biaTyping { 0%, 100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
      `}</style>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 20, width: '100%', maxWidth: 620, height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose, extra, assistantName }) {
  const initLetter = assistantName ? assistantName[0].toUpperCase() : 'R';
  return (
    <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,180,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white' }}>{initLetter}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#E8F4FF' }}>{title}</div>
          <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {extra}
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#7BAFD4', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 20 }}>{title}</div>
      {children}
    </div>
  );
}

function Grid2({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>;
}

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(0,180,255,0.08)' }}>
      <div style={{ fontSize: 10, color: 'rgba(123,175,212,0.5)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#E8F4FF' }}>{value}</div>
    </div>
  );
}

const styles = {
  btnPrimary: { padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' },
  btnSecondary: { padding: '11px 18px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' },
};
