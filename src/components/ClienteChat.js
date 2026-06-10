import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, serverTimestamp, query, where, runTransaction, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Script da IA (fixo no código) ────────────────────────────────────────────
// ── Lista de perguntas fixas na ordem exata ───────────────────────────────────
const PERGUNTAS = [
  // EVENTO
  { id: 'tipo_evento',    bloco: 'evento',    campo: 'evento.tipo',             texto: 'Para começar: qual o **tipo do evento** que você está planejando? *(corporativo, feira, lançamento, pessoal...)*' },
  { id: 'nome_evento',    bloco: 'evento',    campo: 'evento.nome',             texto: 'O evento já tem um **nome** definido?' },
  { id: 'data_inicio',    bloco: 'evento',    campo: 'evento.dataInicio',       texto: 'Qual a **data de início**? *(DD/MM/AAAA)*' },
  { id: 'data_fim',       bloco: 'evento',    campo: 'evento.dataFim',          texto: 'Qual a **data de término**? *(se for 1 dia, repita a mesma data)*' },
  { id: 'horario',        bloco: 'evento',    campo: 'evento.horario',          texto: 'Qual o **horário de início e término**? *(ex: 18h às 22h)*' },
  { id: 'local',          bloco: 'evento',    campo: 'evento.local',            texto: 'Qual a **cidade e o local** do evento? *(se já definido, me passe o endereço completo)*' },
  { id: 'visitantes',     bloco: 'evento',    campo: 'evento.visitantesPorDia', texto: 'Quantas **pessoas** participarão por dia?' },
  { id: 'empresa',        bloco: 'evento',    campo: 'evento.nomeEmpresa',      texto: 'Tem nome de **empresa organizadora**?' },
  // PRODUTOR
  { id: 'produtor',       bloco: 'produtor',  campo: 'equipe.produtor',         texto: 'Você gostaria de um **Produtor de Eventos** dedicado para coordenar tudo no dia?' },
  // ESTRUTURA
  { id: 'tem_estrutura',  bloco: 'estrutura', campo: 'estrutura.ativo',         texto: 'Vai precisar de alguma **estrutura física**? *(estande, palco, tendas, backdrop...)*' },
  { id: 'tipo_estande',   bloco: 'estrutura', campo: 'estrutura.tipoEstande',   texto: 'Prefere um estande **modular** *(pronto)* ou **personalizado** *(exclusivo, criado do zero)*?', condicional: (d) => d['estrutura.ativo'] === true },
  { id: 'area_m2',        bloco: 'estrutura', campo: 'estrutura.areaM2',        texto: 'Qual o **tamanho da área** em m²?', condicional: (d) => d['estrutura.ativo'] === true },
  { id: 'altura_teto',    bloco: 'estrutura', campo: 'estrutura.alturaTeto',    texto: 'Qual a **altura do teto** ou espaço disponível?', condicional: (d) => d['estrutura.ativo'] === true },
  { id: 'dias_montagem',  bloco: 'estrutura', campo: 'estrutura.diasMontagem',  texto: 'Quantos **dias antes** do evento o local estará disponível para montagem?', condicional: (d) => d['estrutura.ativo'] === true },
  { id: 'restricoes',     bloco: 'estrutura', campo: 'estrutura.restricoes',    texto: 'O local tem alguma **restrição de acesso**? *(horário, elevador, rampa, peso...)*', condicional: (d) => d['estrutura.ativo'] === true },
  { id: 'energia',        bloco: 'estrutura', campo: 'estrutura.energia',       texto: 'Vai precisar de **energia elétrica dedicada**?', condicional: (d) => d['estrutura.ativo'] === true },
  { id: 'identidade',     bloco: 'estrutura', campo: 'estrutura.identidadeVisual', texto: 'Já tem **identidade visual** definida? *(logo, cores, materiais)*', condicional: (d) => d['estrutura.ativo'] === true },
  // EQUIPE
  { id: 'tem_equipe',     bloco: 'equipe',    campo: 'equipe.ativo',            texto: 'Vai precisar de algum **profissional** no evento? *(recepcionista, hostess, segurança, limpeza...)*' },
  { id: 'equipe_tipo',    bloco: 'equipe',    campo: 'equipe.tipo',             texto: 'Que tipo de **profissional** você precisa?', condicional: (d) => d['equipe.ativo'] === true, oferecerCatalogo: true },
  { id: 'equipe_qtd',     bloco: 'equipe',    campo: 'equipe.quantidade',       texto: 'Quantos **profissionais** você vai precisar?', condicional: (d) => d['equipe.ativo'] === true },
  { id: 'equipe_horas',   bloco: 'equipe',    campo: 'equipe.horas',            texto: 'Quantas **horas por dia** eles vão trabalhar?', condicional: (d) => d['equipe.ativo'] === true },
  { id: 'equipe_dias',    bloco: 'equipe',    campo: 'equipe.dias',             texto: 'Por **quantos dias**?', condicional: (d) => d['equipe.ativo'] === true },
  { id: 'equipe_perfil',  bloco: 'equipe',    campo: 'equipe.perfil',           texto: 'Tem alguma **preferência específica**? *(vestuário, gênero, idioma, etnia, aparência...)*', condicional: (d) => d['equipe.ativo'] === true },
  // GASTRONOMIA
  { id: 'tem_gastro',     bloco: 'gastro',    campo: 'gastronomia.ativo',       texto: 'Vai precisar de **alimentação ou bebidas** no evento?' },
  { id: 'gastro_formato', bloco: 'gastro',    campo: 'gastronomia.formato',     texto: 'Qual o **formato**? *(coffee break, coquetel, almoço, jantar...)*', condicional: (d) => d['gastronomia.ativo'] === true },
  { id: 'gastro_pessoas', bloco: 'gastro',    campo: 'gastronomia.pessoas',     texto: 'Quantas **pessoas** serão atendidas?', condicional: (d) => d['gastronomia.ativo'] === true },
  { id: 'gastro_horario', bloco: 'gastro',    campo: 'gastronomia.horario',     texto: 'Qual o **horário e duração** do serviço?', condicional: (d) => d['gastronomia.ativo'] === true },
  { id: 'gastro_restric', bloco: 'gastro',    campo: 'gastronomia.restricoes',  texto: 'Tem **restrições alimentares** relevantes? *(vegano, sem glúten, kosher...)*', condicional: (d) => d['gastronomia.ativo'] === true },
  { id: 'gastro_cozinha', bloco: 'gastro',    campo: 'gastronomia.cozinha',     texto: 'O local tem **cozinha disponível** para o fornecedor?', condicional: (d) => d['gastronomia.ativo'] === true },
  { id: 'gastro_bar',     bloco: 'gastro',    campo: 'gastronomia.bar',         texto: 'Vai querer um **bar**? *(open bar, drinks, cerveja...)*', condicional: (d) => d['gastronomia.ativo'] === true },
  // SERVIÇOS
  { id: 'servicos',       bloco: 'servicos',  campo: 'servicosNecessarios',     texto: 'Vai precisar de algum **equipamento ou atração**? *(painel de LED, som, DJ, fotógrafo, videomaker...)*', oferecerCatalogo: true },
];

// ── Helpers: catálogo dinâmico (Firebase) ────────────────────────────────────
const normalize = (str) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const servicoNaRegiao = (servico, cidadeNorm) => {
  if (!cidadeNorm) return true;
  const reg = normalize(servico.regiao);
  if (!reg) return true;
  return reg.includes(cidadeNorm) || cidadeNorm.includes(reg) || reg.includes('todo') || reg.includes('nacional') || reg.includes('brasil');
};

const campoRespondido = (dados, campo) => {
  const v = dados[campo];
  if (v === undefined || v === null) return false;
  if (v === '') return false;
  if (typeof v === 'boolean') return true;
  if (typeof v === 'number') return !Number.isNaN(v);
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

const proximaPerguntaIdx = (dadosAtuais, startIdx = 0) => {
  for (let i = startIdx; i < PERGUNTAS.length; i++) {
    const p = PERGUNTAS[i];
    if (p.condicional && !p.condicional(dadosAtuais)) continue;
    if (campoRespondido(dadosAtuais, p.campo)) continue;
    return i;
  }
  return -1;
};

const sincronizarDadosInferidos = (dados) => {
  const d = { ...dados };
  if (d['equipe.tipo_mencionado'] && !campoRespondido(d, 'equipe.tipo')) {
    d['equipe.tipo'] = d['equipe.tipo_mencionado'];
  }
  if (campoRespondido(d, 'equipe.tipo') && d['equipe.ativo'] !== false) {
    d['equipe.ativo'] = true;
  }
  if (Array.isArray(d.servicos_mencionados) && d.servicos_mencionados.length > 0) {
    const atual = Array.isArray(d.servicosNecessarios) ? d.servicosNecessarios : [];
    d.servicosNecessarios = [...new Set([...atual, ...d.servicos_mencionados])];
  }
  if (d['evento.horarioInicio'] && !campoRespondido(d, 'evento.horario')) {
    d['evento.horario'] = d['evento.horarioFim']
      ? `${d['evento.horarioInicio']} às ${d['evento.horarioFim']}`
      : d['evento.horarioInicio'];
  }
  if (d['evento.cidade'] && !campoRespondido(d, 'evento.local') && d._localMencionado) {
    d['evento.local'] = d._localMencionado;
  }
  return d;
};

const aplicarExtracaoMassa = (extraido, novosDados) => {
  const d = { ...novosDados };
  const campos = [
    'evento.tipo', 'evento.nome', 'evento.dataInicio', 'evento.dataFim',
    'evento.horarioInicio', 'evento.horarioFim', 'evento.cidade', 'evento.local',
    'evento.endereco', 'evento.visitantesPorDia', 'evento.nomeEmpresa',
    'estrutura.ativo', 'estrutura.tipoEstande', 'estrutura.areaM2', 'estrutura.alturaTeto',
    'estrutura.diasMontagem', 'estrutura.restricoes', 'estrutura.energia', 'estrutura.identidadeVisual',
    'equipe.ativo', 'equipe.tipo', 'equipe.quantidade', 'equipe.horas', 'equipe.dias', 'equipe.perfil',
    'equipe.produtor', 'gastronomia.ativo', 'gastronomia.formato', 'gastronomia.pessoas',
    'gastronomia.horario', 'gastronomia.restricoes', 'gastronomia.cozinha', 'gastronomia.bar',
  ];
  campos.forEach(k => {
    if (extraido[k] !== null && extraido[k] !== undefined && extraido[k] !== '') {
      d[k] = extraido[k];
    }
  });
  if (extraido.tem_estrutura !== null && extraido.tem_estrutura !== undefined) d['estrutura.ativo'] = extraido.tem_estrutura;
  if (extraido.tem_equipe !== null && extraido.tem_equipe !== undefined) d['equipe.ativo'] = extraido.tem_equipe;
  if (extraido.tem_gastro !== null && extraido.tem_gastro !== undefined) d['gastronomia.ativo'] = extraido.tem_gastro;
  if (extraido.equipe_tipo_mencionado) d['equipe.tipo_mencionado'] = extraido.equipe_tipo_mencionado;
  if (extraido.servicos_mencionados?.length > 0) d.servicos_mencionados = extraido.servicos_mencionados;
  if (extraido.tem_servicos === false) d['servicos.negado'] = true;
  if (Array.isArray(extraido.servicosNecessarios) && extraido.servicosNecessarios.length > 0) {
    d.servicosNecessarios = extraido.servicosNecessarios;
  }
  return sincronizarDadosInferidos(d);
};

const buscarServicosNoCatalogo = (termo, todosServicos, cidadeNorm) => {
  const termoNorm = normalize(termo);
  if (!termoNorm) return [];
  return todosServicos.filter(s => {
    if (s.ativo === false) return false;
    if (!servicoNaRegiao(s, cidadeNorm)) return false;
    const svc = normalize(s.serviceName);
    const parent = normalize(s.serviceParentName);
    return svc.includes(termoNorm) || termoNorm.includes(svc)
      || parent.includes(termoNorm) || termoNorm.includes(parent);
  });
};

const buscarAlternativasCatalogo = (termo, todosServicos, cidadeNorm) => {
  const termoNorm = normalize(termo);
  const tokens = termoNorm.split(/\s+/).filter(t => t.length > 2);
  if (tokens.length === 0) return [];
  return todosServicos.filter(s => {
    if (s.ativo === false) return false;
    if (!servicoNaRegiao(s, cidadeNorm)) return false;
    const texto = `${normalize(s.serviceName)} ${normalize(s.serviceParentName)}`;
    return tokens.some(t => texto.includes(t));
  });
};

const mapearParaNomesCatalogo = (termos, todosServicos, cidadeNorm) => {
  const mapeados = [];
  const emAnalise = [];
  termos.forEach(termo => {
    const matches = buscarServicosNoCatalogo(termo, todosServicos, cidadeNorm);
    if (matches.length > 0) {
      mapeados.push(matches[0].serviceName);
    } else {
      const alt = buscarAlternativasCatalogo(termo, todosServicos, cidadeNorm);
      if (alt.length > 0) mapeados.push(alt[0].serviceName);
      else emAnalise.push(termo);
    }
  });
  return { mapeados: [...new Set(mapeados)], emAnalise: [...new Set(emAnalise)] };
};

const SCHEMA_EXTRACAO_MASSA = `{"evento.tipo":null,"evento.nome":null,"evento.dataInicio":null,"evento.dataFim":null,"evento.horarioInicio":null,"evento.horarioFim":null,"evento.cidade":null,"evento.local":null,"evento.endereco":null,"evento.visitantesPorDia":null,"evento.nomeEmpresa":null,"estrutura.ativo":null,"estrutura.tipoEstande":null,"estrutura.areaM2":null,"estrutura.alturaTeto":null,"estrutura.diasMontagem":null,"estrutura.restricoes":null,"estrutura.energia":null,"estrutura.identidadeVisual":null,"equipe.ativo":null,"equipe.tipo":null,"equipe.quantidade":null,"equipe.horas":null,"equipe.dias":null,"equipe.perfil":null,"equipe.produtor":null,"gastronomia.ativo":null,"gastronomia.formato":null,"gastronomia.pessoas":null,"gastronomia.horario":null,"gastronomia.restricoes":null,"gastronomia.cozinha":null,"gastronomia.bar":null,"servicosNecessarios":null,"tem_estrutura":null,"tem_equipe":null,"equipe_tipo_mencionado":null,"tem_gastro":null,"tem_servicos":null,"servicos_mencionados":null}`;

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
  const [submitting, setSubmitting]     = useState(false);
  const [assistantName, setAssistantName] = useState('Realize');
  const [modelosEspeciais, setModelosEspeciais] = useState([]);
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [carrosselIdx, setCarrosselIdx] = useState({});
  const [catalogoSummary, setCatalogoSummary] = useState('');
  const [formaPagamento, setFormaPagamento] = useState(null);
  const [opcoesCardSelecionadas, setOpcoesCardSelecionadas] = useState({});
  const [filaCards, setFilaCards]   = useState([]);
  const filaRef                     = useRef([]);
  const [todosServicos, setTodosServicos] = useState([]);
  const todosServicosRef            = useRef([]);
  const faseRef                     = useRef('coleta'); // coleta | selecao | pagamento

  // ── Perguntas fixas: controle de índice e dados coletados ────────────────
  const [idxPergunta, setIdxPergunta] = useState(0);
  const idxRef = useRef(0);
  const [dadosColetados, setDadosColetados] = useState({});
  const dadosRef                    = useRef({});
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

      

      // Catálogo dinâmico — lido do Firebase, sem lista fixa no código
      try {
        const svSnap = await getDocs(collection(db, 'supplierServices'));
        const servicos = svSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
        setTodosServicos(servicos);
        todosServicosRef.current = servicos;
      } catch (e) { console.error('Erro ao carregar serviços:', e); }

      // Carrega modelos de estandes especiais/modulares
      try {
        const modelosSnap = await getDocs(query(collection(db, 'modelosEspeciais'), where('ativo', '==', true)));
        const todosModelos = modelosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtra por região se já soubermos a cidade do evento
        const cidadeAtual = dadosRef.current['evento.cidade'] || '';
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
          setModelosEspeciais(modelosFiltrados);
        }
      } catch (e) { console.error('Erro ao carregar modelos especiais:', e); }
    })();
  }, []);

  // ── mensagem inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!assistantName) return;
    const primeiraP = PERGUNTAS[0];
    setMessages([{
      role: 'assistant',
      content: `Olá, **${userName}**! 😊 Sou a **${assistantName}**, assistente de eventos da Realize Hub.\n\nVou te ajudar a criar a proposta do seu evento. ${primeiraP.texto}`,
      id: 'init',
    }]);
  }, [assistantName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Busca opções de um serviço no Firebase (subcoleção opcoes) ─────────────
  const buscarOpcoesServico = async (nomeServico, cidadeNorm) => {
    const servicos = todosServicosRef.current;
    const matches = buscarServicosNoCatalogo(nomeServico, servicos, cidadeNorm);
    const alvos = matches.length > 0 ? matches : buscarAlternativasCatalogo(nomeServico, servicos, cidadeNorm);
    const comOpcoes = await Promise.all(alvos.map(async s => {
      try {
        const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
        return opSnap.docs.map(d => ({
          id: d.id, supplierId: s.supplierId, serviceName: s.serviceName,
          serviceParentName: s.serviceParentName, tipoServico: s.tipoServico,
          diasPreparo: s.diasPreparo || 0, diasMontagem: s.diasMontagem || 0, ...d.data(),
        }));
      } catch { return []; }
    }));
    return comOpcoes.flat();
  };

  // ── Interpreta resposta via IA (extração simples) ─────────────────────────
  const interpretarResposta = async (perguntaId, resposta) => {
    const extrações = {
      tipo_evento:    `O cliente disse: "${resposta}". Qual o tipo do evento em 2-4 palavras? Responda APENAS: {"valor":"tipo aqui"}`,
      nome_evento:    `O cliente disse: "${resposta}". Qual o nome do evento? Se não definido, use null. Responda APENAS: {"valor":"nome ou null"}`,
      data_inicio:    `O cliente disse: "${resposta}". Extraia a data de início no formato DD/MM/AAAA. Responda APENAS: {"valor":"DD/MM/AAAA"}`,
      data_fim:       `O cliente disse: "${resposta}". Extraia a data de término no formato DD/MM/AAAA. Responda APENAS: {"valor":"DD/MM/AAAA"}`,
      horario:        `O cliente disse: "${resposta}". Extraia horário início e fim. Responda APENAS: {"inicio":"HHh","fim":"HHh"}`,
      local:          `O cliente disse: "${resposta}". Extraia cidade, local e endereço. Responda APENAS: {"cidade":"","local":"","endereco":""}`,
      visitantes:     `O cliente disse: "${resposta}". Quantas pessoas por dia? Responda APENAS: {"valor":0}`,
      empresa:        `O cliente disse: "${resposta}". Nome da empresa? Se não informado, null. Responda APENAS: {"valor":"nome ou null"}`,
      produtor:       `O cliente disse: "${resposta}". Quer produtor de eventos? Responda APENAS: {"valor":true ou false}`,
      tem_estrutura:  `O cliente disse: "${resposta}". Precisa de estrutura física? Responda APENAS: {"valor":true ou false}`,
      tipo_estande:   `O cliente disse: "${resposta}". Modular ou personalizado/do zero? Responda APENAS: {"valor":"modular" ou "personalizado"}`,
      area_m2:        `O cliente disse: "${resposta}". Área em m²? Responda APENAS: {"valor":0}`,
      altura_teto:    `O cliente disse: "${resposta}". Altura do teto? Responda APENAS: {"valor":"altura"}`,
      dias_montagem:  `O cliente disse: "${resposta}". Dias antes para montagem? Responda APENAS: {"valor":0}`,
      restricoes:     `O cliente disse: "${resposta}". Restrições de acesso? Responda APENAS: {"valor":"descrição ou nenhuma"}`,
      energia:        `O cliente disse: "${resposta}". Precisa de energia dedicada? Responda APENAS: {"valor":"descrição"}`,
      identidade:     `O cliente disse: "${resposta}". Tem identidade visual? Responda APENAS: {"valor":"descrição ou não definida"}`,
      tem_equipe:     `O cliente disse: "${resposta}". Precisa de profissional? Responda APENAS: {"valor":true ou false}`,
      equipe_tipo:    `O cliente disse: "${resposta}". Que tipo de profissional? Responda APENAS: {"valor":"nome"}`,
      equipe_qtd:     `O cliente disse: "${resposta}". Quantos profissionais? Responda APENAS: {"valor":0}`,
      equipe_horas:   `O cliente disse: "${resposta}". Horas por dia? Responda APENAS: {"valor":0}`,
      equipe_dias:    `O cliente disse: "${resposta}". Quantos dias? Responda APENAS: {"valor":0}`,
      equipe_perfil:  `O cliente disse: "${resposta}". Preferência de perfil? Responda APENAS: {"valor":"descrição ou nenhuma"}`,
      tem_gastro:     `O cliente disse: "${resposta}". Precisa de gastronomia? Responda APENAS: {"valor":true ou false}`,
      gastro_formato: `O cliente disse: "${resposta}". Formato da refeição? Responda APENAS: {"valor":"descrição"}`,
      gastro_pessoas: `O cliente disse: "${resposta}". Quantas pessoas? Responda APENAS: {"valor":0}`,
      gastro_horario: `O cliente disse: "${resposta}". Horário e duração? Responda APENAS: {"valor":"descrição"}`,
      gastro_restric: `O cliente disse: "${resposta}". Restrições alimentares? Responda APENAS: {"valor":"descrição ou nenhuma"}`,
      gastro_cozinha: `O cliente disse: "${resposta}". Tem cozinha? Responda APENAS: {"valor":true ou false}`,
      gastro_bar:     `O cliente disse: "${resposta}". Quer bar? Responda APENAS: {"valor":true ou false}`,
      servicos:       `O cliente disse: "${resposta}". Quais serviços ele quer? Liste apenas nomes de serviços confirmados. Responda APENAS: {"itens":["nome1","nome2"]}`,
    };
    const prompt = extrações[perguntaId];
    if (!prompt) return { valor: resposta };
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 150,
          system: 'Responda APENAS com JSON válido. Sem texto, sem markdown.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) { return { valor: resposta }; }
  };

  // ── Pergunta fixa do script (código conduz, sem IA inventar perguntas) ─────
  const perguntarProxima = (proximaP, confirmaAnterior = '') => {
    const intro = confirmaAnterior ? `Entendi, ${userName}! ` : '';
    const texto = `${intro}${proximaP.texto}`;
    setMessages(prev => [...prev, { role: 'assistant', content: texto, id: Date.now() }]);
  };

  // ── Após responder equipe_tipo: oferece opções do Firebase na região ───────
  const oferecerCardCatalogoSeNecessario = async (pergunta, dadosAtuais) => {
    if (!pergunta.oferecerCatalogo || pergunta.id !== 'equipe_tipo') return false;
    const tipo = dadosAtuais['equipe.tipo'];
    if (!tipo) return false;
    const chave = `equipe_${normalize(tipo)}`;
    if (dadosAtuais.selecoesCatalogo?.[chave]) return false;

    const cidadeNorm = normalize(dadosAtuais['evento.cidade'] || '');
    const opcoes = await buscarOpcoesServico(tipo, cidadeNorm);
    if (opcoes.length === 0) {
      const alt = buscarAlternativasCatalogo(tipo, todosServicosRef.current, cidadeNorm);
      if (alt.length > 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Não encontrei **${tipo}** exatamente assim na sua região, mas temos opções parecidas. Escolha a que melhor atende:`,
          id: Date.now(),
        }]);
        const opcoesAlt = await buscarOpcoesServico(alt[0].serviceName, cidadeNorm);
        if (opcoesAlt.length > 0) {
          faseRef.current = 'selecao';
          filaRef.current = [{ tipo: 'opcoes_servico', nomeServico: alt[0].serviceName, opcoes: opcoesAlt, id: `opcao_${chave}_${Date.now()}`, chaveCatalogo: chave }];
          setFilaCards(filaRef.current);
          exibirProximoCard(filaRef.current);
          return true;
        }
      }
      return false;
    }

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Ótimo! Veja as opções de **${tipo}** disponíveis na sua região:`,
      id: Date.now(),
    }]);
    faseRef.current = 'selecao';
    filaRef.current = [{ tipo: 'opcoes_servico', nomeServico: tipo, opcoes, id: `opcao_${chave}_${Date.now()}`, chaveCatalogo: chave }];
    setFilaCards(filaRef.current);
    exibirProximoCard(filaRef.current);
    return true;
  };

  // ── Fase de seleção: cards dinâmicos do Firebase + pagamento ───────────────
  const iniciarFaseSelecao = async (dadosFinais) => {
    faseRef.current = 'selecao';
    const cidadeNorm = normalize(dadosFinais['evento.cidade'] || '');
    const servicosPedidos = dadosFinais['servicosNecessarios'] || [];
    const { mapeados, emAnalise } = mapearParaNomesCatalogo(servicosPedidos, todosServicosRef.current, cidadeNorm);

    if (mapeados.length > 0) {
      dadosFinais.servicosNecessarios = mapeados;
      dadosRef.current = { ...dadosFinais };
      setDadosColetados(dadosFinais);
    }
    if (emAnalise.length > 0) {
      dadosFinais.itensEmAnalise = [...new Set([...(dadosFinais.itensEmAnalise || []), ...emAnalise])];
      emAnalise.forEach(item => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ **${item}** não está cadastrado na sua região agora. Nosso coordenador vai buscar antes da aprovação final.`,
          id: Date.now() + Math.random(),
        }]);
      });
    }

    const novosCards = [];

    // Se estande modular → adiciona card de modelos no início da fila
    const tipoEstande = (dadosFinais['estrutura.tipoEstande'] || '').toLowerCase();
    if (tipoEstande.includes('modular') && modelosEspeciais.length > 0 && !dadosFinais.modeloEstandeEscolhido) {
      novosCards.push({ tipo: 'modelos', id: `modelos_${Date.now()}` });
    }
    for (const nomeServico of mapeados) {
      const chave = `servico_${normalize(nomeServico)}`;
      if (dadosFinais.selecoesCatalogo?.[chave]) continue;
      const opcoes = await buscarOpcoesServico(nomeServico, cidadeNorm);
      if (opcoes.length > 0) {
        novosCards.push({ tipo: 'opcoes_servico', nomeServico, opcoes, id: `opcao_${nomeServico}_${Date.now()}`, chaveCatalogo: chave });
      }
    }

    novosCards.push({ tipo: 'pagamento', id: `pagamento_${Date.now()}` });
    filaRef.current = novosCards;
    setFilaCards(novosCards);
    if (novosCards.length > 0) exibirProximoCard(novosCards);
    else {
      faseRef.current = 'pagamento';
      filaRef.current = [{ tipo: 'pagamento', id: `pagamento_${Date.now()}` }];
      setFilaCards(filaRef.current);
      exibirProximoCard(filaRef.current);
    }
  };

  const registrarSelecaoCard = (card, opcao, negado = false) => {
    const d = { ...dadosRef.current };
    d.selecoesCatalogo = { ...(d.selecoesCatalogo || {}) };
    if (card.chaveCatalogo) {
      d.selecoesCatalogo[card.chaveCatalogo] = negado ? { negado: true } : opcao;
    }
    if (!negado && opcao) {
      const lista = Array.isArray(d.opcoesSelecionadas) ? d.opcoesSelecionadas : [];
      d.opcoesSelecionadas = [...lista, { servico: card.nomeServico, ...opcao }];
      const nomes = Array.isArray(d.servicosNecessarios) ? d.servicosNecessarios : [];
      if (!nomes.includes(opcao.serviceName || card.nomeServico)) {
        d.servicosNecessarios = [...nomes, opcao.serviceName || card.nomeServico];
      }
    }
    dadosRef.current = d;
    setDadosColetados(d);
  };

  const concluirPagamento = (valorPagamento) => {
    const json = montarBriefingJson(dadosRef.current);
    json.formaPagamento = valorPagamento;
    setBriefingJson(json);
    faseRef.current = 'pagamento';
    setStep('review');
  };

  const continuarAposCard = async () => {
    if (filaRef.current.length > 0) return;
    if (faseRef.current === 'selecao' && idxRef.current >= PERGUNTAS.length) {
      return;
    }
    faseRef.current = 'coleta';
    const proximoIdx = proximaPerguntaIdx(dadosRef.current, 0);
    if (proximoIdx < 0) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Perfeito, ${userName}! Agora vou mostrar as opções disponíveis na sua região. 🎉`,
        id: Date.now(),
      }]);
      await iniciarFaseSelecao(dadosRef.current);
      return;
    }
    idxRef.current = proximoIdx;
    setIdxPergunta(proximoIdx);
    perguntarProxima(PERGUNTAS[proximoIdx]);
  };

  const processarRespostaCard = async (text) => {
    const cardAtual = filaRef.current[0];
    if (!cardAtual) return;

    if (cardAtual.tipo === 'opcoes_servico') {
      if (text.toLowerCase().includes('não preciso')) {
        registrarSelecaoCard(cardAtual, null, true);
      } else {
        const op = opcoesCardSelecionadas[cardAtual.id];
        if (op) registrarSelecaoCard(cardAtual, op);
      }
      setOpcoesCardSelecionadas(prev => { const n = { ...prev }; delete n[cardAtual.id]; return n; });
      avancarFila();
      if (filaRef.current.length === 0) await continuarAposCard();
      return;
    }

    if (cardAtual.tipo === 'pagamento') {
      const mapPag = {
        '50% na entrada + 50% no final do evento': '50_50',
        '30, 60 e 90 dias': '30_60_90',
        'À vista': 'a_vista',
      };
      const valor = mapPag[text] || formaPagamento;
      if (valor) {
        setFormaPagamento(valor);
        avancarFila();
        concluirPagamento(valor);
      }
    }
  };

  // ── enviar mensagem ───────────────────────────────────────────────────────
  const sendMessage = async (textoForçado) => {
    const text = (textoForçado || input).trim();
    if (!text || loading) return;
    if (filaRef.current.length > 0 && !textoForçado) return;
    setInput('');

    const userMsg = { role: 'user', content: text, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Cards / pagamento (fase selecao)
      if (faseRef.current !== 'coleta' && textoForçado && filaRef.current.length > 0) {
        await processarRespostaCard(text);
        return;
      }

      const pergAtual = PERGUNTAS[idxRef.current];
      if (!pergAtual) { setLoading(false); return; }

      let novosDados = { ...dadosRef.current };

      // Extração em massa (textão) — mapeia todos os campos da lista PERGUNTAS
      if (text.length > 60) {
        try {
          const resAll = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 800,
              system: 'Responda APENAS com JSON válido. Sem texto, sem markdown.',
              messages: [{ role: 'user', content: `O cliente descreveu o evento:\n"${text}"\n\nExtraia SOMENTE o que foi claramente mencionado. Campos não mencionados = null.\nResponda APENAS:\n${SCHEMA_EXTRACAO_MASSA}\n\nRegras extras:\n- tem_estrutura/tem_equipe/tem_gastro/tem_servicos: true/false/null\n- equipe_tipo_mencionado: ex "Recepcionista"\n- servicos_mencionados: array com nomes citados (LED, som, DJ...)\n- servicosNecessarios: mesmo que servicos_mencionados se houver` }],
            }),
          });
          const resAllData = await resAll.json();
          const resAllText = (resAllData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
          const extraido = JSON.parse(resAllText.replace(/```json|```/g, '').trim());
          novosDados = aplicarExtracaoMassa(extraido, novosDados);
        } catch (e) { console.error('Erro na extração em massa:', e); }
      }

      // Extração da pergunta atual
      const dados = await interpretarResposta(pergAtual.id, text);
      if (pergAtual.id === 'local' && dados.cidade) {
        novosDados['evento.cidade']   = dados.cidade;
        novosDados['evento.local']    = dados.local || text;
        novosDados['evento.endereco'] = dados.endereco || '';
      } else if (pergAtual.id === 'horario' && dados.inicio) {
        novosDados['evento.horarioInicio'] = dados.inicio;
        novosDados['evento.horarioFim']    = dados.fim || '';
        novosDados['evento.horario']       = `${dados.inicio} às ${dados.fim || ''}`;
      } else if (pergAtual.id === 'servicos') {
        const itens = dados.itens || (Array.isArray(dados.valor) ? dados.valor : []);
        const cidadeNorm = normalize(novosDados['evento.cidade'] || '');
        const { mapeados, emAnalise } = mapearParaNomesCatalogo(itens.length ? itens : [text], todosServicosRef.current, cidadeNorm);
        novosDados['servicosNecessarios'] = mapeados;
        if (emAnalise.length > 0) novosDados.itensEmAnalise = [...new Set([...(novosDados.itensEmAnalise || []), ...emAnalise])];
      } else if (dados.valor !== undefined && dados.valor !== null) {
        novosDados[pergAtual.campo] = dados.valor;
      } else if (!campoRespondido(novosDados, pergAtual.campo)) {
        novosDados[pergAtual.campo] = text;
      }

      novosDados = sincronizarDadosInferidos(novosDados);
      dadosRef.current = novosDados;
      setDadosColetados(novosDados);

      // Estande modular → card (padrão que funciona)
      if (pergAtual.id === 'tipo_estande' && String(dados.valor || novosDados['estrutura.tipoEstande'] || '').toLowerCase().includes('modular') && modelosEspeciais.length > 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Ótimo! Veja os modelos disponíveis:', id: Date.now() }]);
        setMessages(prev => [...prev, { role: 'assistant', content: '', type: 'modelos', id: Date.now() + 1 }]);
        const proximoIdx = proximaPerguntaIdx(novosDados, idxRef.current + 1);
        idxRef.current = proximoIdx >= 0 ? proximoIdx : PERGUNTAS.length;
        setIdxPergunta(idxRef.current);
        return;
      }

      // Equipe → card dinâmico do Firebase
      if (pergAtual.id === 'equipe_tipo') {
        const pausou = await oferecerCardCatalogoSeNecessario(pergAtual, novosDados);
        if (pausou) return;
      }

      // Próxima pergunta não respondida (varre desde o início)
      const proximoIdx = proximaPerguntaIdx(novosDados, 0);
      idxRef.current = proximoIdx >= 0 ? proximoIdx : PERGUNTAS.length;
      setIdxPergunta(idxRef.current);

      if (proximoIdx < 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Perfeito, ${userName}! Agora vou mostrar as opções disponíveis na sua região. 🎉`,
          id: Date.now(),
        }]);
        await iniciarFaseSelecao(novosDados);
        return;
      }

      perguntarProxima(PERGUNTAS[proximoIdx], text);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, tive um problema. Pode repetir?', id: Date.now() }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // ── Monta o briefingJson com os dadosColetados (após pagamento) ───────────
  const montarBriefingJson = (dados) => {
    const di = dados['evento.dataInicio'] || '';
    const df = dados['evento.dataFim'] || '';
    let diasDuracao = 1;
    if (di && df) {
      const toISO = s => { const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s; };
      const diff = (new Date(toISO(df)) - new Date(toISO(di))) / 86400000;
      diasDuracao = Math.max(1, diff + 1);
    }
    const modelo = modeloSelecionado ? {
      id: modeloSelecionado.id,
      nome: modeloSelecionado.nome,
      areaM2: modeloSelecionado.areaM2,
      precoBase: modeloSelecionado.precoBase,
      diasProducao: modeloSelecionado.diasProducao,
    } : null;

    return {
      evento: {
        tipo:             dados['evento.tipo'] || '',
        nome:             dados['evento.nome'] || '',
        dataInicio:       dados['evento.dataInicio'] || '',
        dataFim:          dados['evento.dataFim'] || '',
        diasDuracao,
        horarioInicio:    dados['evento.horarioInicio'] || '',
        horarioFim:       dados['evento.horarioFim'] || '',
        horario:          dados['evento.horario'] || '',
        cidade:           dados['evento.cidade'] || '',
        local:            dados['evento.local'] || '',
        endereco:         dados['evento.endereco'] || '',
        visitantesPorDia: parseInt(dados['evento.visitantesPorDia']) || 0,
        nomeEmpresa:      dados['evento.nomeEmpresa'] || '',
      },
      estrutura: {
        ativo:            dados['estrutura.ativo'] === true,
        areaM2:           parseFloat(dados['estrutura.areaM2']) || 0,
        alturaTeto:       dados['estrutura.alturaTeto'] || '',
        diasMontagem:     parseInt(dados['estrutura.diasMontagem']) || 0,
        restricoes:       dados['estrutura.restricoes'] || '',
        energia:          dados['estrutura.energia'] || '',
        identidadeVisual: dados['estrutura.identidadeVisual'] || '',
        tipoEstande:      dados['estrutura.tipoEstande'] || '',
        observacoes:      '',
      },
      tipoEstande: (dados['estrutura.tipoEstande'] || '').toLowerCase().includes('modular') ? 'modular'
        : (dados['estrutura.tipoEstande'] || '').toLowerCase().includes('personal') ? 'personalizado' : '',
      modeloEstande: modelo,
      equipe: {
        produtor: { ativo: dados['equipe.produtor'] === true, dias: 0, observacoes: '' },
        itens: dados['equipe.ativo'] === true ? [{
          tipo:        dados['equipe.tipo'] || '',
          quantidade:  parseInt(dados['equipe.quantidade']) || 0,
          horasPorDia: parseFloat(dados['equipe.horas']) || 0,
          dias:        parseInt(dados['equipe.dias']) || 0,
          observacoes: dados['equipe.perfil'] || '',
        }] : [],
      },
      gastronomia: {
        alimentos: {
          ativo:      dados['gastronomia.ativo'] === true,
          formato:    dados['gastronomia.formato'] || '',
          pessoas:    parseInt(dados['gastronomia.pessoas']) || 0,
          horario:    dados['gastronomia.horario'] || '',
          restricoes: dados['gastronomia.restricoes'] || '',
          cozinha:    dados['gastronomia.cozinha'] === true,
          observacoes: '',
        },
        bar: { ativo: dados['gastronomia.bar'] === true, tipo: '', bebidas: '', horas: 0, bartender: false, observacoes: '' },
      },
      servicosNecessarios: dados['servicosNecessarios'] || [],
      opcoesSelecionadas:  dados['opcoesSelecionadas'] || [],
      selecoesCatalogo:    dados['selecoesCatalogo'] || {},
      itensEmAnalise:      dados['itensEmAnalise'] || [],
      formaPagamento:      dados.formaPagamento || formaPagamento || '',
    };
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
              {eq.produtor?.ativo && <Field label="Produtor de eventos" value="Sim" />}
              {(eq.itens || []).map((item, i) => (
                <Field key={i} label={item.tipo || 'Profissional'}
                  value={`${item.quantidade || '?'} × ${item.horasPorDia || '?'}h/dia${item.dias ? ` · ${item.dias} dia(s)` : ''}${item.observacoes ? ` · ${item.observacoes}` : ''}`} />
              ))}
            </Grid2>
          </Section>
          {briefingJson.opcoesSelecionadas?.length > 0 && (
            <Section title="Opções selecionadas">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {briefingJson.opcoesSelecionadas.map((op, i) => (
                  <div key={i} style={{ fontSize: 13, color: '#E8F4FF' }}>
                    <strong>{op.servico || op.serviceName}</strong>: {op.nome}{op.valor ? ` — R$ ${parseFloat(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                  </div>
                ))}
              </div>
            </Section>
          )}
          {briefingJson.itensEmAnalise?.length > 0 && (
            <Section title="Itens em análise">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {briefingJson.itensEmAnalise.map((s, i) => (
                  <span key={i} style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', color: '#ffb800', fontSize: 12 }}>{s}</span>
                ))}
              </div>
            </Section>
          )}
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
                  <button onClick={async () => {
                    const d = { ...dadosRef.current, 'estrutura.modeloId': modeloSelecionado.id, modeloEstandeEscolhido: modeloSelecionado };
                    if (modeloSelecionado.areaM2 && !campoRespondido(d, 'estrutura.areaM2')) d['estrutura.areaM2'] = modeloSelecionado.areaM2;
                    dadosRef.current = d;
                    setDadosColetados(d);
                    setMessages(prev => [...prev, { role: 'user', content: `Quero o ${modeloSelecionado.nome} (${modeloSelecionado.areaM2}m²)`, id: Date.now() }]);
                    const proximoIdx = proximaPerguntaIdx(d, 0);
                    idxRef.current = proximoIdx >= 0 ? proximoIdx : PERGUNTAS.length;
                    setIdxPergunta(idxRef.current);
                    if (proximoIdx < 0) {
                      setMessages(prev => [...prev, { role: 'assistant', content: `Perfeito, ${userName}! Agora vou mostrar as opções disponíveis na sua região. 🎉`, id: Date.now() }]);
                      await iniciarFaseSelecao(d);
                    } else {
                      perguntarProxima(PERGUNTAS[proximoIdx]);
                    }
                  }}
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
