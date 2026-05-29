import React, { useState, useEffect, useRef } from 'react';
import { doc, collection, getDocs, addDoc, updateDoc, serverTimestamp, query, where, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Utilitários ──────────────────────────────────────────────────────────────
function toISODate(str) {
  if (!str) return '';
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ── Carrossel de fotos ────────────────────────────────────────────────────────
function ModeloCarrossel({ fotos, idx, onPrev, onNext, onDot }) {
  if (!fotos?.length) return <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 32 }}>🏗️</span>;
  return (
    <>
      {fotos.map((url, i) => (
        <img key={url} src={url} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', display: i === idx ? 'block' : 'none' }} />
      ))}
      {fotos.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); onPrev(); }} style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 16, zIndex: 2 }}>‹</button>
          <button onClick={e => { e.stopPropagation(); onNext(); }} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 16, zIndex: 2 }}>›</button>
          <div style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
            {fotos.map((_, i) => <div key={i} onClick={e => { e.stopPropagation(); onDot(i); }} style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? 'white' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }} />)}
          </div>
        </>
      )}
    </>
  );
}

// ── Perguntas fixas por bloco ────────────────────────────────────────────────
const PERGUNTAS = {
  // BLOCO 1 — Evento
  tipo_evento:       (nome) => `Olá, ${nome}! 😊 Sou a **Realize**, sua assistente de eventos. Vamos começar!\n\nQual o **tipo do evento** que você está planejando? *(feira, congresso, lançamento de produto, evento corporativo, pessoal...)*`,
  nome_evento:       () => `Ótimo! O evento já tem um **nome** definido?`,
  data_inicio:       () => `Qual a **data de início** do evento? *(formato DD/MM/AAAA)*`,
  data_fim:          () => `Qual a **data de término**? *(se for 1 dia só, repita a mesma data)*`,
  horario:           () => `Qual o **horário de início e término**? *(ex: 18h às 22h)*`,
  local:             () => `Qual a **cidade e o local** do evento? *(se já definido, me passe o endereço completo)*`,
  visitantes:        () => `Quantas **pessoas** participarão por dia?`,
  empresa:           () => `Tem nome de **empresa organizadora**?`,
  // BLOCO 2 — Produtor
  produtor:          (nome) => `${nome}, você gostaria de um **Produtor de Eventos** dedicado para acompanhar todo o projeto? Ele coordenaria todos os fornecedores e garantiria que tudo saísse perfeito no dia.`,
  // BLOCO 3 — Estrutura
  precisa_estrutura: () => `Agora vamos falar sobre **Estrutura**.\n\nVocê vai precisar de alguma estrutura física? *(estande, palco, tendas, backdrop...)*`,
  area_m2:           () => `Qual o **tamanho da área** disponível em m²?`,
  altura_teto:       () => `Qual a **altura do teto** ou espaço disponível no local?`,
  dias_montagem:     () => `Quantos **dias antes do evento** o local estará disponível para montagem?`,
  restricoes_local:  () => `O local tem alguma **restrição de acesso**? *(horário, elevador, rampa, altura máxima...)*`,
  energia:           () => `Vai precisar de **energia elétrica dedicada**?`,
  identidade_visual: () => `Já tem **identidade visual** definida? *(logo, cores, materiais)*`,
  tipo_estande:      () => `Você prefere um **estande modular** *(modelos prontos)* ou criado **do zero** com identidade exclusiva?`,
  ambientes:         () => `Quais **ambientes** precisa dentro do estande? *(recepção, sala de reunião, copa, depósito...)*`,
  moveis:            () => `Vai precisar de **móveis**? *(sofá, balcão, mesas, cadeiras)*`,
  monitor:           () => `Vai precisar de **TV ou monitor** no estande?`,
  // BLOCO 4 — Equipe
  precisa_equipe:    () => `Agora sobre **Equipe**.\n\nVai precisar de algum profissional no evento? *(recepcionista, hostess, segurança, limpeza, fotógrafo...)*`,
  equipe_tipo:       () => `Que tipo de profissional você precisa?`,
  equipe_qtd:        (tipo) => `Quantos **${tipo}** você vai precisar?`,
  equipe_horas:      (tipo) => `Quantas **horas por dia** os ${tipo} vão trabalhar?`,
  equipe_dias:       () => `Por **quantos dias**?`,
  equipe_perfil:     (tipo) => `Tem alguma **preferência específica** para os ${tipo}? *(vestuário, gênero, idioma, etnia, aparência...)*`,
  mais_equipe:       () => `Precisa de **mais algum tipo** de profissional?`,
  // BLOCO 5 — Equipamentos
  precisa_equip:     () => `Agora sobre **Equipamentos e Entretenimento**.\n\nVai precisar de algum equipamento ou atração? *(painel de LED, som, DJ, fotógrafo...)*`,
  led_objetivo:      () => `Qual o **objetivo do painel de LED**? *(vídeos institucionais, transmissão ao vivo, fotos...)*`,
  led_ambiente:      () => `O ambiente é **interno ou externo**?`,
  led_conteudo:      () => `**Quem vai fornecer o conteúdo**? *(você mesmo, agência, produzir do zero)*`,
  led_operador:      () => `Vai precisar de **operador técnico** no dia?`,
  som_objetivo:      () => `Qual o **objetivo do som**? *(música ambiente, apresentações, discursos...)*`,
  som_ambiente:      () => `O ambiente é **interno ou externo**?`,
  som_microfone:     () => `Vai precisar de **microfone**? Quantos e qual tipo? *(lapela, bastão, pedestal)*`,
  som_operador:      () => `Vai precisar de **operador de som** no dia?`,
  dj_horas:          () => `Quantas **horas de apresentação** o DJ vai fazer?`,
  dj_estilo:         () => `Qual o **estilo musical**? *(corporativo, festa, lounge, eletrônico)*`,
  dj_equip:          () => `O DJ vai precisar trazer **equipamento completo**?`,
  foto_horas:        () => `Quantas **horas de cobertura** você precisa?`,
  foto_objetivo:     () => `Qual o **objetivo**? *(registro interno, transmissão, redes sociais)*`,
  mais_equip:        () => `Precisa de **mais algum equipamento** ou atração?`,
  // BLOCO 6 — Gastronomia
  precisa_gastro:    () => `Agora sobre **Gastronomia**.\n\nVai precisar de alimentação ou bebidas no evento?`,
  gastro_formato:    () => `Qual o **formato**? *(coffee break, coquetel, almoço sentado, jantar, brunch)*`,
  gastro_pessoas:    () => `Quantas **pessoas** serão atendidas?`,
  gastro_horario:    () => `Qual o **horário e duração** do serviço?`,
  gastro_restricoes: () => `Tem **restrições alimentares** relevantes? *(vegano, sem glúten, kosher...)*`,
  gastro_cozinha:    () => `O local tem **cozinha disponível** para o fornecedor?`,
  bar_tipo:          () => `Sobre o bar: **open bar ou bar pago**?`,
  bar_bebidas:       () => `Quais **bebidas**? *(não alcoólico, cerveja, drinks, vinho, destilados)*`,
  bar_horas:         () => `Quantas **horas de operação**?`,
  bar_bartender:     () => `Vai precisar de **bartender**?`,
  // BLOCO 7 — Pagamento
  pagamento:         () => `Perfeito! Já tenho todas as informações que preciso. 🎉\n\nPor último: qual a **forma de pagamento** preferida?`,
};

// ── Fluxo de steps ───────────────────────────────────────────────────────────
// Cada step tem: id, pergunta, campo no briefing, próximo step (ou função para decidir)
const FLUXO = [
  { id: 'tipo_evento',       campo: 'evento.tipo' },
  { id: 'nome_evento',       campo: 'evento.nome' },
  { id: 'data_inicio',       campo: 'evento.dataInicio' },
  { id: 'data_fim',          campo: 'evento.dataFim' },
  { id: 'horario',           campo: 'evento.horario' },
  { id: 'local',             campo: 'evento.local' },
  { id: 'visitantes',        campo: 'evento.visitantesPorDia' },
  { id: 'empresa',           campo: 'evento.nomeEmpresa' },
  { id: 'produtor',          campo: 'equipe.produtor', tipo: 'sim_nao' },
  { id: 'precisa_estrutura', campo: 'estrutura.ativo', tipo: 'sim_nao' },
  { id: 'precisa_equipe',    campo: 'equipe.ativo', tipo: 'sim_nao' },
  { id: 'precisa_equip',     campo: 'equipamentos.ativo', tipo: 'sim_nao' },
  { id: 'precisa_gastro',    campo: 'gastronomia.ativo', tipo: 'sim_nao' },
  { id: 'pagamento',         campo: 'formaPagamento', tipo: 'pagamento' },
];

export default function ClienteChat({ userData, onClose }) {
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [step, setStep]                   = useState('chat');
  const [submitting, setSubmitting]       = useState(false);
  const [formaPagamento, setFormaPagamento] = useState(null);

  // Dados coletados
  const [briefing, setBriefing] = useState({
    evento:       { tipo: '', nome: '', dataInicio: '', dataFim: '', horarioInicio: '', horarioFim: '', cidade: '', local: '', endereco: '', visitantesPorDia: 0, nomeEmpresa: '' },
    estrutura:    { ativo: false, areaM2: 0, alturaTeto: '', diasMontagem: 0, restricoes: '', energia: '', identidadeVisual: '', tipoEstande: '', ambientes: '', moveis: '', monitor: '', observacoes: '' },
    equipe:       { ativo: false, produtor: false, itens: [] },
    equipamentos: { ativo: false, led: null, som: null, dj: null, foto: null, outros: [] },
    gastronomia:  { ativo: false, alimentos: null, bar: null },
    servicosNecessarios: [],
    itensEmAnalise: [],
  });

  // Estado do fluxo de perguntas
  const [stepAtual, setStepAtual]             = useState('tipo_evento');
  const [subStep, setSubStep]                 = useState(null); // para sub-fluxos (equipe, equip)
  const [equipeAtual, setEquipeAtual]         = useState(null); // profissional sendo coletado
  const [equipAtual, setEquipAtual]           = useState(null); // equipamento sendo coletado
  const [aguardandoResposta, setAguardandoResposta] = useState(false);
  const [dadosExtraidos, setDadosExtraidos]         = useState({}); // dados extraídos da primeira msg

  // Cards
  const [modelosEspeciais, setModelosEspeciais] = useState([]);
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [carrosselIdx, setCarrosselIdx]         = useState({});
  const [opcoesLed, setOpcoesLed]               = useState([]);
  const [opcaoLedSelecionada, setOpcaoLedSelecionada] = useState(null);
  const [opcoesIndisponiveis, setOpcoesIndisponiveis] = useState([]);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const userName  = userData?.name || userData?.email?.split('@')[0] || 'Cliente';
  const userId    = userData?.id;

  // ── Scroll automático ─────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Primeira mensagem ─────────────────────────────────────────────────────
  useEffect(() => {
    addMsg('assistant', PERGUNTAS.tipo_evento(userName));
  }, []);

  // ── Helpers de mensagem ───────────────────────────────────────────────────
  const addMsg = (role, content, extras = {}) => {
    setMessages(prev => [...prev, { role, content, id: Date.now() + Math.random(), ...extras }]);
  };

  // ── Interpreta resposta via IA (extração simples de dado) ─────────────────
  const interpretarResposta = async (perguntaId, resposta) => {
    const prompts = {
      tipo_evento:    `O cliente disse: "${resposta}". Extraia o tipo do evento em 2-4 palavras. Responda APENAS: {"valor": "tipo aqui"}`,
      nome_evento:    `O cliente disse: "${resposta}". Qual o nome do evento? Se não definido, responda null. Responda APENAS: {"valor": "nome ou null"}`,
      data_inicio:    `O cliente disse: "${resposta}". Extraia a data de início no formato DD/MM/AAAA. Responda APENAS: {"valor": "DD/MM/AAAA"}`,
      data_fim:       `O cliente disse: "${resposta}". Extraia a data de fim no formato DD/MM/AAAA. Responda APENAS: {"valor": "DD/MM/AAAA"}`,
      horario:        `O cliente disse: "${resposta}". Extraia horário de início e fim. Responda APENAS: {"inicio": "HHh", "fim": "HHh"}`,
      local:          `O cliente disse: "${resposta}". Extraia cidade, local e endereço. Responda APENAS: {"cidade": "", "local": "", "endereco": ""}`,
      visitantes:     `O cliente disse: "${resposta}". Extraia o número de visitantes por dia. Responda APENAS: {"valor": 0}`,
      empresa:        `O cliente disse: "${resposta}". Qual o nome da empresa? Se não informado, null. Responda APENAS: {"valor": "nome ou null"}`,
      produtor:       `O cliente disse: "${resposta}". Quer um produtor de eventos? Responda APENAS: {"valor": true ou false}`,
      precisa_estrutura: `O cliente disse: "${resposta}". Precisa de estrutura física? Responda APENAS: {"valor": true ou false}`,
      area_m2:        `O cliente disse: "${resposta}". Qual a área em m²? Responda APENAS: {"valor": 0}`,
      altura_teto:    `O cliente disse: "${resposta}". Qual a altura? Responda APENAS: {"valor": "altura aqui"}`,
      dias_montagem:  `O cliente disse: "${resposta}". Quantos dias antes para montagem? Responda APENAS: {"valor": 0}`,
      restricoes_local: `O cliente disse: "${resposta}". Quais restrições de acesso? Responda APENAS: {"valor": "descrição ou nenhuma"}`,
      energia:        `O cliente disse: "${resposta}". Precisa de energia dedicada? Responda APENAS: {"valor": "descrição"}`,
      identidade_visual: `O cliente disse: "${resposta}". Tem identidade visual? Responda APENAS: {"valor": "descrição ou não definida"}`,
      tipo_estande:   `O cliente disse: "${resposta}". Quer estande modular ou do zero? Responda APENAS: {"valor": "modular" ou "zero"}`,
      ambientes:      `O cliente disse: "${resposta}". Quais ambientes no estande? Responda APENAS: {"valor": "descrição"}`,
      moveis:         `O cliente disse: "${resposta}". Quais móveis? Responda APENAS: {"valor": "descrição ou não"}`,
      monitor:        `O cliente disse: "${resposta}". Precisa de TV/monitor? Responda APENAS: {"valor": "descrição ou não"}`,
      precisa_equipe: `O cliente disse: "${resposta}". Precisa de equipe? Responda APENAS: {"valor": true ou false}`,
      equipe_tipo:    `O cliente disse: "${resposta}". Que tipo de profissional? Responda APENAS: {"valor": "nome do profissional"}`,
      equipe_qtd:     `O cliente disse: "${resposta}". Quantos profissionais? Responda APENAS: {"valor": 0}`,
      equipe_horas:   `O cliente disse: "${resposta}". Quantas horas por dia? Responda APENAS: {"valor": 0}`,
      equipe_dias:    `O cliente disse: "${resposta}". Por quantos dias? Responda APENAS: {"valor": 0}`,
      equipe_perfil:  `O cliente disse: "${resposta}". Qual o perfil específico? Responda APENAS: {"valor": "descrição ou nenhum"}`,
      mais_equipe:    `O cliente disse: "${resposta}". Precisa de mais algum profissional? Responda APENAS: {"valor": true ou false, "tipo": "nome se sim"}`,
      precisa_equip:  `O cliente disse: "${resposta}". Precisa de equipamentos? Liste o que pediu. Responda APENAS: {"valor": true ou false, "itens": ["led", "som", "dj", "foto"]}`,
      led_objetivo:   `O cliente disse: "${resposta}". Qual objetivo do LED? Responda APENAS: {"valor": "descrição"}`,
      led_ambiente:   `O cliente disse: "${resposta}". Interno ou externo? Responda APENAS: {"valor": "interno" ou "externo"}`,
      led_conteudo:   `O cliente disse: "${resposta}". Quem fornece conteúdo? Responda APENAS: {"valor": "descrição"}`,
      led_operador:   `O cliente disse: "${resposta}". Precisa de operador? Responda APENAS: {"valor": true ou false}`,
      som_objetivo:   `O cliente disse: "${resposta}". Objetivo do som? Responda APENAS: {"valor": "descrição"}`,
      som_ambiente:   `O cliente disse: "${resposta}". Interno ou externo? Responda APENAS: {"valor": "interno" ou "externo"}`,
      som_microfone:  `O cliente disse: "${resposta}". Precisa de microfone? Responda APENAS: {"valor": "descrição ou não"}`,
      som_operador:   `O cliente disse: "${resposta}". Precisa de operador? Responda APENAS: {"valor": true ou false}`,
      dj_horas:       `O cliente disse: "${resposta}". Quantas horas? Responda APENAS: {"valor": 0}`,
      dj_estilo:      `O cliente disse: "${resposta}". Estilo musical? Responda APENAS: {"valor": "descrição"}`,
      dj_equip:       `O cliente disse: "${resposta}". Precisa trazer equipamento? Responda APENAS: {"valor": true ou false}`,
      foto_horas:     `O cliente disse: "${resposta}". Quantas horas? Responda APENAS: {"valor": 0}`,
      foto_objetivo:  `O cliente disse: "${resposta}". Objetivo? Responda APENAS: {"valor": "descrição"}`,
      mais_equip:     `O cliente disse: "${resposta}". Precisa de mais equipamentos? Responda APENAS: {"valor": true ou false}`,
      precisa_gastro: `O cliente disse: "${resposta}". Precisa de gastronomia? Responda APENAS: {"valor": true ou false, "itens": ["alimentos", "bar"]}`,
      gastro_formato: `O cliente disse: "${resposta}". Formato da refeição? Responda APENAS: {"valor": "descrição"}`,
      gastro_pessoas: `O cliente disse: "${resposta}". Quantas pessoas? Responda APENAS: {"valor": 0}`,
      gastro_horario: `O cliente disse: "${resposta}". Horário e duração? Responda APENAS: {"valor": "descrição"}`,
      gastro_restricoes: `O cliente disse: "${resposta}". Restrições alimentares? Responda APENAS: {"valor": "descrição ou nenhuma"}`,
      gastro_cozinha: `O cliente disse: "${resposta}". Tem cozinha disponível? Responda APENAS: {"valor": true ou false}`,
      bar_tipo:       `O cliente disse: "${resposta}". Open bar ou pago? Responda APENAS: {"valor": "open" ou "pago"}`,
      bar_bebidas:    `O cliente disse: "${resposta}". Quais bebidas? Responda APENAS: {"valor": "descrição"}`,
      bar_horas:      `O cliente disse: "${resposta}". Quantas horas? Responda APENAS: {"valor": 0}`,
      bar_bartender:  `O cliente disse: "${resposta}". Precisa de bartender? Responda APENAS: {"valor": true ou false}`,
    };

    const prompt = prompts[perguntaId];
    if (!prompt) return { valor: resposta };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 100,
          system: 'Responda APENAS com JSON válido. Sem texto, sem markdown, sem explicações.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch (e) {
      console.error('Erro ao interpretar:', e);
      return { valor: resposta };
    }
  };

  // ── Busca opções de um serviço no Firestore ───────────────────────────────
  const buscarOpcoes = async (nomeServico, cidade) => {
    const svSnap = await getDocs(collection(db, 'supplierServices'));
    const todos = svSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
    const nomeNorm = normalize(nomeServico);
    const cidadeNorm = normalize(cidade || '');

    const servicos = todos.filter(s => {
      if (cidadeNorm && s.regiao) {
        const reg = normalize(s.regiao);
        if (!reg.includes(cidadeNorm) && !cidadeNorm.includes(reg) && !reg.includes('todo') && !reg.includes('nacional')) return false;
      }
      return normalize(s.serviceName).includes(nomeNorm) || nomeNorm.includes(normalize(s.serviceName)) ||
             normalize(s.serviceParentName).includes(nomeNorm) || nomeNorm.includes(normalize(s.serviceParentName));
    });

    const comOpcoes = await Promise.all(servicos.map(async s => {
      try {
        const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
        return opSnap.docs.map(d => ({ id: d.id, supplierId: s.supplierId, serviceName: s.serviceName, serviceParentName: s.serviceParentName, tipoServico: s.tipoServico, diasPreparo: s.diasPreparo || 0, diasMontagem: s.diasMontagem || 0, ...d.data() }));
      } catch { return []; }
    }));
    return comOpcoes.flat();
  };

  // ── Extrai múltiplos campos de uma resposta longa ────────────────────────
  const extrairMultiplosCampos = async (texto) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          system: 'Responda APENAS com JSON válido. Sem texto, sem markdown, sem explicações.',
          messages: [{ role: 'user', content: `O cliente descreveu o evento: "${texto}"\n\nExtraia APENAS os campos que estão claramente mencionados. Para campos não mencionados, use null.\nResponda APENAS: {"tipo":null,"nome":null,"dataInicio":null,"dataFim":null,"horarioInicio":null,"horarioFim":null,"cidade":null,"local":null,"endereco":null,"visitantes":null,"empresa":null,"precisaEstrutura":null,"precisaEquipe":null,"tiposEquipe":null,"precisaLed":null,"precisaSom":null,"precisaDj":null,"precisaFoto":null,"precisaGastronomia":null}` }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) { return {}; }
  };

  // ── Processa resposta do usuário ──────────────────────────────────────────
  const processarResposta = async (texto) => {
    setAguardandoResposta(true);
    setLoading(true);

    try {
      // Se é a primeira mensagem e é longa, extrai tudo de uma vez e salva no state
      let extraido = dadosExtraidos;
      if (stepAtual === 'tipo_evento' && texto.length > 60) {
        extraido = await extrairMultiplosCampos(texto);
        setDadosExtraidos(extraido);
      }

      const dados = await interpretarResposta(subStep || stepAtual, texto);

      // ── SUB-FLUXOS ──
      if (subStep) {
        await processarSubStep(subStep, dados, texto);
        return;
      }

      // ── FLUXO PRINCIPAL ──
      switch (stepAtual) {
        case 'tipo_evento': {
          // Aplica tudo que foi extraído de uma vez
          if (Object.keys(extraido).length > 0) {
            setBriefing(p => ({
              ...p,
              evento: {
                ...p.evento,
                tipo:             extraido.tipo       || dados.valor || texto,
                nome:             extraido.nome       || p.evento.nome,
                dataInicio:       extraido.dataInicio || p.evento.dataInicio,
                dataFim:          extraido.dataFim    || p.evento.dataFim,
                horarioInicio:    extraido.horarioInicio || p.evento.horarioInicio,
                horarioFim:       extraido.horarioFim    || p.evento.horarioFim,
                cidade:           extraido.cidade     || p.evento.cidade,
                local:            extraido.local      || p.evento.local,
                endereco:         extraido.endereco   || p.evento.endereco,
                visitantesPorDia: extraido.visitantes || p.evento.visitantesPorDia,
                nomeEmpresa:      extraido.empresa    || p.evento.nomeEmpresa,
              }
            }));
          } else {
            setBriefing(p => ({ ...p, evento: { ...p.evento, tipo: dados.valor || texto } }));
          }
          // Avança pulando perguntas já respondidas
          if (extraido.nome)       { setStepAtual('data_inicio');  if (!extraido.dataInicio)  { addMsg('assistant', PERGUNTAS.data_inicio()); break; } }
          else                     { setStepAtual('nome_evento');   addMsg('assistant', PERGUNTAS.nome_evento()); break; }
          if (extraido.dataInicio) { setStepAtual('data_fim');      if (!extraido.dataFim)     { addMsg('assistant', PERGUNTAS.data_fim()); break; } }
          if (extraido.dataFim)    { setStepAtual('horario');       if (!extraido.horarioInicio){ addMsg('assistant', PERGUNTAS.horario()); break; } }
          if (extraido.horarioInicio){ setStepAtual('local');       if (!extraido.cidade)      { addMsg('assistant', PERGUNTAS.local()); break; } }
          if (extraido.cidade)     { setStepAtual('visitantes');    if (!extraido.visitantes)  { addMsg('assistant', PERGUNTAS.visitantes()); break; } }
          if (extraido.visitantes) { setStepAtual('empresa');       if (!extraido.empresa)     { addMsg('assistant', PERGUNTAS.empresa()); break; } }
          if (extraido.empresa !== null) { setStepAtual('produtor'); addMsg('assistant', PERGUNTAS.produtor(userName)); break; }
          setStepAtual('produtor');
          addMsg('assistant', PERGUNTAS.produtor(userName));
          break;
        }
        case 'nome_evento': {
          setBriefing(p => ({ ...p, evento: { ...p.evento, nome: dados.valor || texto } }));
          if (extraido.dataInicio) {
            setBriefing(p => ({ ...p, evento: { ...p.evento, dataInicio: extraido.dataInicio } }));
            if (extraido.dataFim) {
              setBriefing(p => ({ ...p, evento: { ...p.evento, dataFim: extraido.dataFim } }));
              if (extraido.horarioInicio) {
                setBriefing(p => ({ ...p, evento: { ...p.evento, horarioInicio: extraido.horarioInicio, horarioFim: extraido.horarioFim || '' } }));
                if (extraido.cidade) {
                  setBriefing(p => ({ ...p, evento: { ...p.evento, cidade: extraido.cidade, local: extraido.local || '', endereco: extraido.endereco || '' } }));
                  if (extraido.visitantes) {
                    setBriefing(p => ({ ...p, evento: { ...p.evento, visitantesPorDia: extraido.visitantes } }));
                    setStepAtual('empresa'); addMsg('assistant', PERGUNTAS.empresa()); break;
                  }
                  setStepAtual('visitantes'); addMsg('assistant', PERGUNTAS.visitantes()); break;
                }
                setStepAtual('local'); addMsg('assistant', PERGUNTAS.local()); break;
              }
              setStepAtual('horario'); addMsg('assistant', PERGUNTAS.horario()); break;
            }
            setStepAtual('data_fim'); addMsg('assistant', PERGUNTAS.data_fim()); break;
          }
          setStepAtual('data_inicio');
          addMsg('assistant', PERGUNTAS.data_inicio());
          break;
        }
        case 'data_inicio': {
          setBriefing(p => ({ ...p, evento: { ...p.evento, dataInicio: dados.valor || texto } }));
          if (extraido.dataFim) {
            setBriefing(p => ({ ...p, evento: { ...p.evento, dataFim: extraido.dataFim } }));
            if (extraido.horarioInicio) {
              setBriefing(p => ({ ...p, evento: { ...p.evento, horarioInicio: extraido.horarioInicio, horarioFim: extraido.horarioFim || '' } }));
              if (extraido.cidade) {
                setBriefing(p => ({ ...p, evento: { ...p.evento, cidade: extraido.cidade, local: extraido.local || '', endereco: extraido.endereco || '' } }));
                if (extraido.visitantes) {
                  setBriefing(p => ({ ...p, evento: { ...p.evento, visitantesPorDia: extraido.visitantes } }));
                  setStepAtual('empresa'); addMsg('assistant', PERGUNTAS.empresa()); break;
                }
                setStepAtual('visitantes'); addMsg('assistant', PERGUNTAS.visitantes()); break;
              }
              setStepAtual('local'); addMsg('assistant', PERGUNTAS.local()); break;
            }
            setStepAtual('horario'); addMsg('assistant', PERGUNTAS.horario()); break;
          }
          setStepAtual('data_fim');
          addMsg('assistant', PERGUNTAS.data_fim());
          break;
        }
        case 'data_fim': {
          setBriefing(p => ({ ...p, evento: { ...p.evento, dataFim: dados.valor || texto } }));
          if (extraido.horarioInicio) {
            setBriefing(p => ({ ...p, evento: { ...p.evento, horarioInicio: extraido.horarioInicio, horarioFim: extraido.horarioFim || '' } }));
            if (extraido.cidade) {
              setBriefing(p => ({ ...p, evento: { ...p.evento, cidade: extraido.cidade, local: extraido.local || '', endereco: extraido.endereco || '' } }));
              if (extraido.visitantes) {
                setBriefing(p => ({ ...p, evento: { ...p.evento, visitantesPorDia: extraido.visitantes } }));
                setStepAtual('empresa'); addMsg('assistant', PERGUNTAS.empresa()); break;
              }
              setStepAtual('visitantes'); addMsg('assistant', PERGUNTAS.visitantes()); break;
            }
            setStepAtual('local'); addMsg('assistant', PERGUNTAS.local()); break;
          }
          setStepAtual('horario');
          addMsg('assistant', PERGUNTAS.horario());
          break;
        }
        case 'horario': {
          setBriefing(p => ({ ...p, evento: { ...p.evento, horarioInicio: dados.inicio || '', horarioFim: dados.fim || '' } }));
          if (extraido.cidade) {
            setBriefing(p => ({ ...p, evento: { ...p.evento, cidade: extraido.cidade, local: extraido.local || '', endereco: extraido.endereco || '' } }));
            if (extraido.visitantes) {
              setBriefing(p => ({ ...p, evento: { ...p.evento, visitantesPorDia: extraido.visitantes } }));
              setStepAtual('empresa'); addMsg('assistant', PERGUNTAS.empresa()); break;
            }
            setStepAtual('visitantes'); addMsg('assistant', PERGUNTAS.visitantes()); break;
          }
          setStepAtual('local');
          addMsg('assistant', PERGUNTAS.local());
          break;
        }
        case 'local': {
          setBriefing(p => ({ ...p, evento: { ...p.evento, cidade: dados.cidade || '', local: dados.local || texto, endereco: dados.endereco || '' } }));
          if (extraido.visitantes) {
            setBriefing(p => ({ ...p, evento: { ...p.evento, visitantesPorDia: extraido.visitantes } }));
            setStepAtual('empresa'); addMsg('assistant', PERGUNTAS.empresa()); break;
          }
          setStepAtual('visitantes');
          addMsg('assistant', PERGUNTAS.visitantes());
          break;
        }
        case 'visitantes': {
          setBriefing(p => ({ ...p, evento: { ...p.evento, visitantesPorDia: parseInt(dados.valor) || 0 } }));
          setStepAtual('empresa');
          addMsg('assistant', PERGUNTAS.empresa());
          break;
        }
        case 'empresa': {
          setBriefing(p => ({ ...p, evento: { ...p.evento, nomeEmpresa: dados.valor || '' } }));
          setStepAtual('produtor');
          addMsg('assistant', PERGUNTAS.produtor(userName));
          break;
        }
        case 'produtor': {
          const querProdutor = dados.valor === true || dados.valor === 'true';
          setBriefing(p => ({ ...p, equipe: { ...p.equipe, produtor: querProdutor } }));
          if (querProdutor) {
            setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'Produtor de Eventos'] }));
          }
          // Pula estrutura se já extraído como false
          if (extraido.precisaEstrutura === false || extraido.precisaEstrutura === 'false') {
            setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, ativo: false } }));
            setStepAtual('precisa_equipe');
            addMsg('assistant', PERGUNTAS.precisa_equipe());
          } else {
            setStepAtual('precisa_estrutura');
            addMsg('assistant', PERGUNTAS.precisa_estrutura());
          }
          break;
        }
        case 'precisa_estrutura': {
          const precisaEstrutura = dados.valor === true || dados.valor === 'true';
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, ativo: precisaEstrutura } }));
          if (precisaEstrutura) {
            setStepAtual('area_m2');
            addMsg('assistant', PERGUNTAS.area_m2());
          } else {
            setStepAtual('precisa_equipe');
            addMsg('assistant', PERGUNTAS.precisa_equipe());
          }
          break;
        }
        case 'area_m2': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, areaM2: parseFloat(dados.valor) || 0 } }));
          setStepAtual('altura_teto');
          addMsg('assistant', PERGUNTAS.altura_teto());
          break;
        }
        case 'altura_teto': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, alturaTeto: dados.valor || texto } }));
          setStepAtual('dias_montagem');
          addMsg('assistant', PERGUNTAS.dias_montagem());
          break;
        }
        case 'dias_montagem': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, diasMontagem: parseInt(dados.valor) || 0 } }));
          setStepAtual('restricoes_local');
          addMsg('assistant', PERGUNTAS.restricoes_local());
          break;
        }
        case 'restricoes_local': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, restricoes: dados.valor || texto } }));
          setStepAtual('energia');
          addMsg('assistant', PERGUNTAS.energia());
          break;
        }
        case 'energia': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, energia: dados.valor || texto } }));
          setStepAtual('identidade_visual');
          addMsg('assistant', PERGUNTAS.identidade_visual());
          break;
        }
        case 'identidade_visual': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, identidadeVisual: dados.valor || texto } }));
          setStepAtual('tipo_estande');
          addMsg('assistant', PERGUNTAS.tipo_estande());
          break;
        }
        case 'tipo_estande': {
          const tipo = (dados.valor || '').toLowerCase();
          const ehModular = tipo.includes('modular');
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, tipoEstande: ehModular ? 'modular' : 'zero' } }));
          if (ehModular) {
            // Carrega modelos modulares
            addMsg('assistant', 'Ótimo! Deixa eu buscar os modelos disponíveis para você...');
            try {
              const snap = await getDocs(query(collection(db, 'modelosEspeciais'), where('ativo', '==', true)));
              const modelos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              setModelosEspeciais(modelos);
              if (modelos.length > 0) {
                setMessages(prev => [...prev, { role: 'assistant', content: '', type: 'modelos', id: Date.now() }]);
                setStepAtual('aguardando_modelo');
              } else {
                setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'Estande Modular'] }));
                setStepAtual('precisa_equipe');
                addMsg('assistant', PERGUNTAS.precisa_equipe());
              }
            } catch (e) {
              setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'Estande Modular'] }));
              setStepAtual('precisa_equipe');
              addMsg('assistant', PERGUNTAS.precisa_equipe());
            }
          } else {
            setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'Estande Personalizado'] }));
            setStepAtual('ambientes');
            addMsg('assistant', PERGUNTAS.ambientes());
          }
          break;
        }
        case 'ambientes': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, ambientes: dados.valor || texto } }));
          setStepAtual('moveis');
          addMsg('assistant', PERGUNTAS.moveis());
          break;
        }
        case 'moveis': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, moveis: dados.valor || texto } }));
          setStepAtual('monitor');
          addMsg('assistant', PERGUNTAS.monitor());
          break;
        }
        case 'monitor': {
          setBriefing(p => ({ ...p, estrutura: { ...p.estrutura, monitor: dados.valor || texto } }));
          setStepAtual('precisa_equipe');
          addMsg('assistant', PERGUNTAS.precisa_equipe());
          break;
        }
        case 'precisa_equipe': {
          const precisaEquipe = dados.valor === true || dados.valor === 'true';
          setBriefing(p => ({ ...p, equipe: { ...p.equipe, ativo: precisaEquipe } }));
          if (precisaEquipe) {
            setStepAtual('equipe_tipo');
            addMsg('assistant', PERGUNTAS.equipe_tipo());
          } else {
            setStepAtual('precisa_equip');
            addMsg('assistant', PERGUNTAS.precisa_equip());
          }
          break;
        }
        case 'equipe_tipo': {
          const tipo = dados.valor || texto;
          setEquipeAtual({ tipo, qtd: 0, horas: 0, dias: 0, perfil: '' });
          setStepAtual('equipe_qtd');
          addMsg('assistant', PERGUNTAS.equipe_qtd(tipo));
          break;
        }
        case 'equipe_qtd': {
          setEquipeAtual(p => ({ ...p, qtd: parseInt(dados.valor) || 1 }));
          setStepAtual('equipe_horas');
          addMsg('assistant', PERGUNTAS.equipe_horas(equipeAtual?.tipo || 'profissional'));
          break;
        }
        case 'equipe_horas': {
          setEquipeAtual(p => ({ ...p, horas: parseFloat(dados.valor) || 0 }));
          setStepAtual('equipe_dias');
          addMsg('assistant', PERGUNTAS.equipe_dias());
          break;
        }
        case 'equipe_dias': {
          setEquipeAtual(p => ({ ...p, dias: parseInt(dados.valor) || 1 }));
          setStepAtual('equipe_perfil');
          addMsg('assistant', PERGUNTAS.equipe_perfil(equipeAtual?.tipo || 'profissional'));
          break;
        }
        case 'equipe_perfil': {
          const prof = { ...equipeAtual, perfil: dados.valor || texto };
          setBriefing(p => ({
            ...p,
            equipe: { ...p.equipe, itens: [...(p.equipe.itens || []), prof] },
            servicosNecessarios: [...p.servicosNecessarios, prof.tipo],
          }));
          setEquipeAtual(null);
          setStepAtual('mais_equipe');
          addMsg('assistant', PERGUNTAS.mais_equipe());
          break;
        }
        case 'mais_equipe': {
          const maisEquipe = dados.valor === true || dados.valor === 'true';
          if (maisEquipe) {
            setStepAtual('equipe_tipo');
            addMsg('assistant', PERGUNTAS.equipe_tipo());
          } else {
            setStepAtual('precisa_equip');
            addMsg('assistant', PERGUNTAS.precisa_equip());
          }
          break;
        }
        case 'precisa_equip': {
          const precisaEquip = dados.valor === true || dados.valor === 'true';
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, ativo: precisaEquip } }));
          if (precisaEquip) {
            const itens = dados.itens || [];
            if (itens.includes('led') || (texto.toLowerCase().includes('led') || texto.toLowerCase().includes('painel'))) {
              setEquipAtual('led');
              setStepAtual('led_objetivo');
              addMsg('assistant', PERGUNTAS.led_objetivo());
            } else if (itens.includes('som') || texto.toLowerCase().includes('som')) {
              setEquipAtual('som');
              setStepAtual('som_objetivo');
              addMsg('assistant', PERGUNTAS.som_objetivo());
            } else if (itens.includes('dj') || texto.toLowerCase().includes('dj')) {
              setEquipAtual('dj');
              setStepAtual('dj_horas');
              addMsg('assistant', PERGUNTAS.dj_horas());
            } else if (itens.includes('foto') || texto.toLowerCase().includes('foto')) {
              setEquipAtual('foto');
              setStepAtual('foto_horas');
              addMsg('assistant', PERGUNTAS.foto_horas());
            } else {
              setStepAtual('mais_equip');
              addMsg('assistant', PERGUNTAS.mais_equip());
            }
          } else {
            setStepAtual('precisa_gastro');
            addMsg('assistant', PERGUNTAS.precisa_gastro());
          }
          break;
        }
        case 'led_objetivo': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, led: { ...p.equipamentos.led, objetivo: dados.valor || texto } } }));
          setStepAtual('led_ambiente');
          addMsg('assistant', PERGUNTAS.led_ambiente());
          break;
        }
        case 'led_ambiente': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, led: { ...p.equipamentos.led, ambiente: dados.valor || texto } } }));
          setStepAtual('led_conteudo');
          addMsg('assistant', PERGUNTAS.led_conteudo());
          break;
        }
        case 'led_conteudo': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, led: { ...p.equipamentos.led, conteudo: dados.valor || texto } } }));
          setStepAtual('led_operador');
          addMsg('assistant', PERGUNTAS.led_operador());
          break;
        }
        case 'led_operador': {
          const operador = dados.valor === true || dados.valor === 'true';
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, led: { ...p.equipamentos.led, operador } } }));
          // Busca opções de LED
          addMsg('assistant', 'Deixa eu verificar as opções de painel de LED disponíveis para você...');
          const termosLed = ['led', 'painel de led', 'led / neon', 'neon'];
          let opcoes = [];
          for (const termo of termosLed) {
           opcoes = await buscarOpcoes(termo, briefing.evento.cidade);
           if (opcoes.length > 0) break;
          }
          if (opcoes.length > 0) {
            setOpcoesLed(opcoes);
            setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'LED / Neon'] }));
            setMessages(prev => [...prev, { role: 'assistant', content: '', type: 'opcoes_led', id: Date.now() }]);
            setStepAtual('aguardando_led');
          } else {
            // Não disponível — item em análise
            setBriefing(p => ({
              ...p,
              itensEmAnalise: [...p.itensEmAnalise, 'Painel de LED'],
              servicosNecessarios: [...p.servicosNecessarios, 'LED / Neon'],
            }));
            addMsg('assistant', `⚠️ Não encontrei opções de painel de LED disponíveis na sua região no momento. Nossa equipe vai buscar fornecedores e te retorna antes da aprovação final.\n\nVamos continuar!`);
            setStepAtual('mais_equip');
            addMsg('assistant', PERGUNTAS.mais_equip());
          }
          break;
        }
        case 'som_objetivo': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, som: { ...p.equipamentos.som, objetivo: dados.valor || texto } } }));
          setStepAtual('som_ambiente');
          addMsg('assistant', PERGUNTAS.som_ambiente());
          break;
        }
        case 'som_ambiente': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, som: { ...p.equipamentos.som, ambiente: dados.valor || texto } } }));
          setStepAtual('som_microfone');
          addMsg('assistant', PERGUNTAS.som_microfone());
          break;
        }
        case 'som_microfone': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, som: { ...p.equipamentos.som, microfone: dados.valor || texto } } }));
          setStepAtual('som_operador');
          addMsg('assistant', PERGUNTAS.som_operador());
          break;
        }
        case 'som_operador': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, som: { ...p.equipamentos.som, operador: dados.valor } } }));
          setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'Sistema PA'] }));
          setStepAtual('mais_equip');
          addMsg('assistant', PERGUNTAS.mais_equip());
          break;
        }
        case 'dj_horas': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, dj: { ...p.equipamentos.dj, horas: parseFloat(dados.valor) || 0 } } }));
          setStepAtual('dj_estilo');
          addMsg('assistant', PERGUNTAS.dj_estilo());
          break;
        }
        case 'dj_estilo': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, dj: { ...p.equipamentos.dj, estilo: dados.valor || texto } } }));
          setStepAtual('dj_equip');
          addMsg('assistant', PERGUNTAS.dj_equip());
          break;
        }
        case 'dj_equip': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, dj: { ...p.equipamentos.dj, equipamento: dados.valor } } }));
          setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'DJ'] }));
          setStepAtual('mais_equip');
          addMsg('assistant', PERGUNTAS.mais_equip());
          break;
        }
        case 'foto_horas': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, foto: { ...p.equipamentos.foto, horas: parseFloat(dados.valor) || 0 } } }));
          setStepAtual('foto_objetivo');
          addMsg('assistant', PERGUNTAS.foto_objetivo());
          break;
        }
        case 'foto_objetivo': {
          setBriefing(p => ({ ...p, equipamentos: { ...p.equipamentos, foto: { ...p.equipamentos.foto, objetivo: dados.valor || texto } } }));
          setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'Fotógrafo de Evento'] }));
          setStepAtual('mais_equip');
          addMsg('assistant', PERGUNTAS.mais_equip());
          break;
        }
        case 'mais_equip': {
          const maisEquip = dados.valor === true || dados.valor === 'true';
          if (maisEquip) {
            setStepAtual('precisa_equip');
            addMsg('assistant', 'Que equipamento ou atração você precisa?');
          } else {
            setStepAtual('precisa_gastro');
            addMsg('assistant', PERGUNTAS.precisa_gastro());
          }
          break;
        }
        case 'precisa_gastro': {
          const precisaGastro = dados.valor === true || dados.valor === 'true';
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, ativo: precisaGastro } }));
          if (precisaGastro) {
            const itens = dados.itens || [];
            if (itens.includes('alimentos') || !itens.includes('bar')) {
              setStepAtual('gastro_formato');
              addMsg('assistant', PERGUNTAS.gastro_formato());
            } else {
              setStepAtual('bar_tipo');
              addMsg('assistant', PERGUNTAS.bar_tipo());
            }
          } else {
            setStepAtual('pagamento');
            addMsg('assistant', PERGUNTAS.pagamento());
          }
          break;
        }
        case 'gastro_formato': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, alimentos: { ...p.gastronomia.alimentos, formato: dados.valor || texto } } }));
          setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'Buffet Completo'] }));
          setStepAtual('gastro_pessoas');
          addMsg('assistant', PERGUNTAS.gastro_pessoas());
          break;
        }
        case 'gastro_pessoas': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, alimentos: { ...p.gastronomia.alimentos, pessoas: parseInt(dados.valor) || 0 } } }));
          setStepAtual('gastro_horario');
          addMsg('assistant', PERGUNTAS.gastro_horario());
          break;
        }
        case 'gastro_horario': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, alimentos: { ...p.gastronomia.alimentos, horario: dados.valor || texto } } }));
          setStepAtual('gastro_restricoes');
          addMsg('assistant', PERGUNTAS.gastro_restricoes());
          break;
        }
        case 'gastro_restricoes': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, alimentos: { ...p.gastronomia.alimentos, restricoes: dados.valor || texto } } }));
          setStepAtual('gastro_cozinha');
          addMsg('assistant', PERGUNTAS.gastro_cozinha());
          break;
        }
        case 'gastro_cozinha': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, alimentos: { ...p.gastronomia.alimentos, cozinha: dados.valor } } }));
          setStepAtual('pagamento');
          addMsg('assistant', PERGUNTAS.pagamento());
          break;
        }
        case 'bar_tipo': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, bar: { ...p.gastronomia.bar, tipo: dados.valor || texto } } }));
          setBriefing(p => ({ ...p, servicosNecessarios: [...p.servicosNecessarios, 'Bar'] }));
          setStepAtual('bar_bebidas');
          addMsg('assistant', PERGUNTAS.bar_bebidas());
          break;
        }
        case 'bar_bebidas': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, bar: { ...p.gastronomia.bar, bebidas: dados.valor || texto } } }));
          setStepAtual('bar_horas');
          addMsg('assistant', PERGUNTAS.bar_horas());
          break;
        }
        case 'bar_horas': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, bar: { ...p.gastronomia.bar, horas: parseFloat(dados.valor) || 0 } } }));
          setStepAtual('bar_bartender');
          addMsg('assistant', PERGUNTAS.bar_bartender());
          break;
        }
        case 'bar_bartender': {
          setBriefing(p => ({ ...p, gastronomia: { ...p.gastronomia, bar: { ...p.gastronomia.bar, bartender: dados.valor } } }));
          setStepAtual('pagamento');
          addMsg('assistant', PERGUNTAS.pagamento());
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.error('Erro ao processar resposta:', e);
    } finally {
      setAguardandoResposta(false);
      setLoading(false);
    }
  };

  const processarSubStep = async (sub, dados, texto) => {
    // reservado para extensões futuras
    setSubStep(null);
    setAguardandoResposta(false);
    setLoading(false);
  };

  // ── Enviar mensagem ───────────────────────────────────────────────────────
  const sendMessage = async (textoForcado) => {
    const text = (textoForcado || input).trim();
    if (!text || loading || stepAtual === 'aguardando_modelo' || stepAtual === 'aguardando_led') return;
    setInput('');
    addMsg('user', text);
    await processarResposta(text);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Seleção de modelo modular ─────────────────────────────────────────────
  const confirmarModelo = (modelo) => {
    setBriefing(p => ({
      ...p,
      estrutura: { ...p.estrutura, modeloEscolhido: modelo },
      servicosNecessarios: [...p.servicosNecessarios, modelo.nome],
    }));
    setModeloSelecionado(modelo);
    addMsg('user', `Quero o ${modelo.nome} (${modelo.areaM2}m²)`);
    addMsg('assistant', `Ótima escolha! O **${modelo.nome}** foi selecionado. ✓`);
    setStepAtual('precisa_equipe');
    setTimeout(() => addMsg('assistant', PERGUNTAS.precisa_equipe()), 500);
  };

  // ── Seleção de opção de LED ───────────────────────────────────────────────
  const confirmarLed = (opcao) => {
    setBriefing(p => ({
      ...p,
      equipamentos: { ...p.equipamentos, led: { ...p.equipamentos.led, opcaoEscolhida: opcao } },
    }));
    setOpcaoLedSelecionada(opcao);
    addMsg('user', `Quero a opção ${opcao.nome}${opcao.caracteristica ? ' (' + opcao.caracteristica + ')' : ''}`);
    addMsg('assistant', `Perfeito! **${opcao.nome}** selecionado. ✓`);
    setStepAtual('mais_equip');
    setTimeout(() => addMsg('assistant', PERGUNTAS.mais_equip()), 500);
  };

  // ── Salvar no Firestore ───────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!formaPagamento) return;
    setSubmitting(true);
    try {
      // Busca coordenador
      let assignedTo = null, assignedToName = null;
      try {
        const coordSnap = await getDocs(query(collection(db, 'users'), where('roleName', '==', 'Coordenador'), where('active', '==', true)));
        const coords = coordSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (coords.length > 0) {
          const budgetsSnap = await getDocs(query(collection(db, 'budgets'), where('status', '==', 'analyzing')));
          const contagem = {};
          budgetsSnap.docs.forEach(d => { const at = d.data().assignedTo; if (at) contagem[at] = (contagem[at] || 0) + 1; });
          const escolhido = coords.reduce((menor, c) => (contagem[c.id] || 0) < (contagem[menor.id] || 0) ? c : menor);
          assignedTo = escolhido.id;
          assignedToName = escolhido.name;
        }
      } catch (e) { console.error(e); }

      // Número do pedido
      let numeroPedido = '';
      try {
        const contadorRef = doc(db, 'config', 'contadores');
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(contadorRef);
          const atual = snap.exists() ? (snap.data().orcamentos || 0) : 0;
          const proximo = atual + 1;
          transaction.set(contadorRef, { orcamentos: proximo }, { merge: true });
          const ano = new Date().getFullYear().toString().slice(-2);
          numeroPedido = `OP-${String(proximo).padStart(4, '0')}-${ano}`;
        });
      } catch (e) { console.error(e); }

      // Deduplicar servicosNecessarios
      const servicosUnicos = [...new Set(briefing.servicosNecessarios.filter(Boolean))];

      // Calcula diasDuracao
      const di = toISODate(briefing.evento.dataInicio);
      const df = toISODate(briefing.evento.dataFim);
      let diasDuracao = 1;
      if (di && df) {
        const diff = (new Date(df) - new Date(di)) / (1000 * 60 * 60 * 24);
        diasDuracao = Math.max(1, diff + 1);
      }

      const briefingFinal = {
        ...briefing,
        evento: { ...briefing.evento, diasDuracao },
        servicosNecessarios: servicosUnicos,
        formaPagamento,
      };

      const budgetRef = await addDoc(collection(db, 'budgets'), {
        clientUserId:   userId,
        clientName:     userName,
        eventName:      briefing.evento.nome || briefing.evento.tipo || 'Novo Evento',
        eventTypeName:  briefing.evento.tipo || '',
        startDate:      toISODate(briefing.evento.dataInicio || ''),
        endDate:        toISODate(briefing.evento.dataFim || ''),
        location:       briefing.evento.local || briefing.evento.cidade || '',
        guestCount:     briefing.evento.visitantesPorDia || 0,
        status:         'analyzing',
        workspaceStage: 'Propostas',
        isMae:          true,
        numeroPedido,
        briefingData:   briefingFinal,
        itensEmAnalise: briefing.itensEmAnalise || [],
        financeiro:     { formaPagamento },
        assignedTo,
        assignedToName,
        assignedAt:     assignedTo ? serverTimestamp() : null,
        createdAt:      serverTimestamp(),
        updatedAt:      serverTimestamp(),
      });

      // Tarefas para itens em análise
      for (const item of (briefing.itensEmAnalise || [])) {
        await addDoc(collection(db, 'tasks'), {
          budgetId:   budgetRef.id,
          tipo:       'analise',
          nome:       `⚠️ Item em análise: ${item}`,
          descricao:  `Cliente solicitou "${item}" — não disponível na rede de fornecedores. Buscar solução antes da aprovação.`,
          status:     'pendente',
          prioridade: 'alta',
          fase:       'analise',
          assignedTo,
          createdAt:  serverTimestamp(),
        });
      }

      // SupplierJobs
      try {
        const suppSnap = await getDocs(collection(db, 'supplierServices'));
        const todos = suppSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
        const cidadeNorm = normalize(briefing.evento.cidade || '');

        const filtrados = todos.filter(s => {
          if (s.regiao) {
            const reg = normalize(s.regiao);
            if (!reg.includes(cidadeNorm) && !cidadeNorm.includes(reg) && !reg.includes('todo') && !reg.includes('nacional')) return false;
          }
          const svcNorm = normalize(s.serviceName);
          const parNorm = normalize(s.serviceParentName);
          return servicosUnicos.some(sn => {
            const snNorm = normalize(sn);
            return snNorm === svcNorm || snNorm === parNorm || snNorm.includes(svcNorm) || svcNorm.includes(snNorm);
          });
        });

        const vistos = new Set();
        for (const sv of filtrados) {
          const key = `${sv.supplierId}__${sv.serviceName}`;
          if (vistos.has(key)) continue;
          vistos.add(key);
          await addDoc(collection(db, 'supplierJobs'), {
            supplierId:         sv.supplierId,
            budgetId:           budgetRef.id,
            eventName:          briefing.evento.nome || briefing.evento.tipo || 'Novo Evento',
            eventTypeName:      briefing.evento.tipo || '',
            clientName:         userName,
            eventDate:          toISODate(briefing.evento.dataInicio || ''),
            eventDateFim:       toISODate(briefing.evento.dataFim || ''),
            eventLocal:         briefing.evento.endereco || briefing.evento.local || briefing.evento.cidade || '',
            eventCidade:        briefing.evento.cidade || '',
            eventHorarioInicio: briefing.evento.horarioInicio || '',
            eventHorarioFim:    briefing.evento.horarioFim || '',
            eventDiasDuracao:   diasDuracao,
            eventVisitantes:    briefing.evento.visitantesPorDia || 0,
            serviceNames:       [sv.serviceName],
            serviceName:        sv.serviceName,
            serviceParentName:  sv.serviceParentName || '',
            tipoServico:        sv.tipoServico || '',
            preco:              sv.preco || 0,
            unidade:            sv.unidade || '',
            diasPreparo:        sv.diasPreparo || 0,
            diasMontagem:       sv.diasMontagem || 0,
            observacaoCliente:  (() => {
              const obs = [];
              // Observações de equipe
              const profissional = (briefing.equipe?.itens || []).find(i => normalize(i.tipo) === normalize(sv.serviceName));
              if (profissional?.perfil) obs.push(`Perfil: ${profissional.perfil}`);
              // Observações de LED
              if (normalize(sv.serviceName).includes('led') || normalize(sv.serviceParentName).includes('led')) {
                const led = briefing.equipamentos?.led;
                if (led?.objetivo)  obs.push(`Objetivo: ${led.objetivo}`);
                if (led?.ambiente)  obs.push(`Ambiente: ${led.ambiente}`);
                if (led?.conteudo)  obs.push(`Conteúdo: ${led.conteudo}`);
                if (led?.operador !== undefined) obs.push(`Operador: ${led.operador ? 'Sim' : 'Não'}`);
                if (led?.opcaoEscolhida) obs.push(`Opção escolhida: ${led.opcaoEscolhida.nome}`);
              }
              // Observações de estrutura
              if (normalize(sv.tipoServico) === 'estrutura' || normalize(sv.serviceParentName).includes('estande')) {
                const est = briefing.estrutura;
                if (est?.areaM2)          obs.push(`Área: ${est.areaM2}m²`);
                if (est?.alturaTeto)      obs.push(`Altura teto: ${est.alturaTeto}`);
                if (est?.diasMontagem)    obs.push(`Dias montagem: ${est.diasMontagem}`);
                if (est?.restricoes)      obs.push(`Restrições: ${est.restricoes}`);
                if (est?.identidadeVisual) obs.push(`Identidade visual: ${est.identidadeVisual}`);
                if (est?.energia)         obs.push(`Energia: ${est.energia}`);
              }
              return obs.join(' | ') || '';
            })(),
            stage:              'proposta',
            status:             'draft',
            createdAt:          serverTimestamp(),
          });
        }

        // SupplierJob para estande modular
        const modeloEscolhido = briefing.estrutura?.modeloEscolhido;
        if (modeloEscolhido) {
          try {
            const tiposSnap = await getDocs(collection(db, 'tiposEspeciais'));
            const todosTipos = tiposSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const tipoDoModelo = todosTipos.find(t => t.id === modeloEscolhido.tipoEspecialId || t.nome?.toLowerCase().includes('modular'));
            const fornecedores = tipoDoModelo?.fornecedoresAutorizados || [];
            const fornVistos = new Set();
            for (const forn of fornecedores) {
              if (fornVistos.has(forn.id)) continue;
              fornVistos.add(forn.id);
              await addDoc(collection(db, 'supplierJobs'), {
                supplierId: forn.id, supplierName: forn.nome || '',
                budgetId: budgetRef.id, eventName: briefing.evento.nome || 'Novo Evento',
                clientName: userName, eventDate: toISODate(briefing.evento.dataInicio || ''),
                eventLocal: briefing.evento.endereco || briefing.evento.local || '',
                eventHorarioInicio: briefing.evento.horarioInicio || '', eventHorarioFim: briefing.evento.horarioFim || '',
                eventDiasDuracao: diasDuracao, eventVisitantes: briefing.evento.visitantesPorDia || 0,
                serviceNames: [modeloEscolhido.nome], serviceName: modeloEscolhido.nome,
                serviceParentName: tipoDoModelo?.nome || 'Estande Modular', tipoServico: 'estrutura',
                modeloEspecialId: modeloEscolhido.id, preco: modeloEscolhido.precoBase || 0,
                unidade: 'por evento', diasPreparo: modeloEscolhido.diasProducao || 0, diasMontagem: 0,
                stage: 'proposta', status: 'draft', createdAt: serverTimestamp(),
              });
            }
          } catch (e) { console.error(e); }
        }
      } catch (e) { console.error('Erro ao criar supplierJobs:', e); }

      // Cronograma via IA
      try {
        const svSnap = await getDocs(collection(db, 'supplierServices'));
        const svAll = svSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
        const servicosResumidos = svAll.filter(s => s.diasPreparo > 0 || s.diasMontagem > 0)
          .map(s => `${s.serviceName}:preparo=${s.diasPreparo||0}d,montagem=${s.diasMontagem||0}d`).join(';');
        const dataEvento = toISODate(briefing.evento.dataInicio || '');
        const hoje = new Date().toISOString().split('T')[0];

        const cronRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 8000,
            system: 'Responda APENAS com JSON válido. Sem texto, sem markdown, sem explicações. O JSON deve começar com { e ser parseável por JSON.parse(). Mesmo com prazo inviável, responda só o JSON.',
            messages: [{ role: 'user', content: `Monte cronograma de produção. Responda APENAS JSON.\nEvento:${briefing.evento.nome||briefing.evento.tipo},data:${dataEvento},dias:${diasDuracao},cidade:${briefing.evento.cidade||''}\nServiços:${servicosUnicos.join(',')}\nTempos:${servicosResumidos||'padrão'}\nHoje:${hoje}\nRegras: máximo 10 etapas, ordem lógica, datas de trás pra frente, nunca antes de hoje (${hoje}), se inviável adicione "prazoInviavel":true\nJSON:{"prazoInviavel":false,"etapas":[{"id":"e1","n":"nome","d":"desc","r":"responsavel","di":"YYYY-MM-DD","de":"YYYY-MM-DD","da":0,"s":"pendente","t":"administrativo","atrasado":false}]}` }],
          }),
        });
        const cronData = await cronRes.json();
        const cronText = (cronData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        let cronJson = null;
        try { cronJson = JSON.parse(cronText.replace(/```json|```/g, '').trim()); } catch (e) { console.error('Erro cronograma:', e); }
        if (cronJson?.etapas?.length > 0) {
          const etapas = cronJson.etapas.map(e => ({
            id: e.id || e.n, nome: e.n || e.nome, descricao: e.d || e.descricao || '',
            responsavel: e.r || 'coordenador', dataInicio: e.di || '', dataEntrega: e.de || '',
            diasAntes: e.da ?? 0, status: e.s || 'pendente', tipo: e.t || 'administrativo',
          }));
          await updateDoc(doc(db, 'budgets', budgetRef.id), { cronograma: { etapas, prazoInviavel: cronJson.prazoInviavel || false } });
        }
      } catch (e) { console.error('Erro ao gerar cronograma:', e); }

      // Descrição do briefing
      try {
        const descRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6', max_tokens: 800,
            system: 'Especialista em eventos. Escreva em português, tom profissional. Sem markdown, texto corrido.',
            messages: [{ role: 'user', content: `Escreva descrição profissional deste evento para equipe interna. Máximo 3 parágrafos.\nEvento: ${briefing.evento.nome||briefing.evento.tipo}\nTipo: ${briefing.evento.tipo}\nData: ${briefing.evento.dataInicio} a ${briefing.evento.dataFim}\nLocal: ${briefing.evento.local||briefing.evento.cidade}\nVisitantes: ${briefing.evento.visitantesPorDia}\nServiços: ${servicosUnicos.join(', ')}\nObservações da equipe: ${JSON.stringify(briefing.equipe?.itens||[])}` }],
          }),
        });
        const descData = await descRes.json();
        const descText = (descData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (descText) await updateDoc(doc(db, 'budgets', budgetRef.id), { descricaoBriefing: descText });
      } catch (e) { console.error('Erro ao gerar descrição:', e); }

      setStep('sent');
    } catch (e) {
      console.error('Erro ao salvar:', e);
      alert('Erro ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const renderText = (text) => text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  if (step === 'sent') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#0D1B2A', borderRadius: 20, padding: 40, maxWidth: 400, textAlign: 'center', fontFamily: 'Outfit, sans-serif' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#E8F4FF', marginBottom: 8 }}>Briefing enviado!</div>
          <div style={{ fontSize: 13, color: '#7BAFD4', marginBottom: 24 }}>Nossa equipe já recebeu e vai montar seu pré-orçamento em breve.</div>
          <button onClick={onClose} style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 20, width: '100%', maxWidth: 560, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(0,180,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(10,22,38,0.8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✨</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>Realize</div>
              <div style={{ fontSize: 10, color: '#00E5C4' }}>Assistente de Eventos</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Mensagens */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.type === 'modelos' ? (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 10 }}>Escolha o modelo de estande:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {modelosEspeciais.map(m => {
                      const fotos = m.fotos?.length > 0 ? m.fotos.map(f => f.url) : (m.fotoUrl ? [m.fotoUrl] : []);
                      return (
                        <div key={m.id} onClick={() => setModeloSelecionado(m)}
                          style={{ borderRadius: 10, border: `2px solid ${modeloSelecionado?.id === m.id ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: modeloSelecionado?.id === m.id ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', overflow: 'hidden' }}>
                          <div style={{ height: 100, overflow: 'hidden', background: 'rgba(0,128,255,0.08)', position: 'relative' }}>
                            <ModeloCarrossel fotos={fotos} idx={carrosselIdx[m.id] || 0}
                              onPrev={() => setCarrosselIdx(p => ({ ...p, [m.id]: ((p[m.id] || 0) - 1 + fotos.length) % fotos.length }))}
                              onNext={() => setCarrosselIdx(p => ({ ...p, [m.id]: ((p[m.id] || 0) + 1) % fotos.length }))}
                              onDot={i => setCarrosselIdx(p => ({ ...p, [m.id]: i }))} />
                          </div>
                          <div style={{ padding: '8px 10px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#E8F4FF' }}>{m.nome}</div>
                            {m.areaM2 && <div style={{ fontSize: 10, color: '#7BAFD4' }}>📐 {m.areaM2}m²</div>}
                            {m.precoBase && <div style={{ fontSize: 12, fontWeight: 700, color: '#00E5C4' }}>R$ {m.precoBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {modeloSelecionado && (
                    <button onClick={() => confirmarModelo(modeloSelecionado)}
                      style={{ marginTop: 10, width: '100%', padding: 10, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      Confirmar: {modeloSelecionado.nome} →
                    </button>
                  )}
                </div>
              ) : msg.type === 'opcoes_led' ? (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 10 }}>Opções de Painel de LED disponíveis:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {opcoesLed.map(op => (
                      <div key={op.id} onClick={() => setOpcaoLedSelecionada(op)}
                        style={{ padding: '12px 14px', borderRadius: 10, border: `2px solid ${opcaoLedSelecionada?.id === op.id ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: opcaoLedSelecionada?.id === op.id ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>{op.nome}</div>
                        {op.caracteristica && <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>{op.caracteristica}</div>}
                        {op.valor && <div style={{ fontSize: 14, fontWeight: 700, color: '#00E5C4', marginTop: 4 }}>R$ {parseFloat(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {op.unidade || ''}</div>}
                      </div>
                    ))}
                  </div>
                  {opcaoLedSelecionada && (
                    <button onClick={() => confirmarLed(opcaoLedSelecionada)}
                      style={{ marginTop: 10, width: '100%', padding: 10, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      Confirmar: {opcaoLedSelecionada.nome} →
                    </button>
                  )}
                </div>
              ) : msg.type === 'pagamento' ? (
                <div style={{ width: '100%' }}>
                  {[
                    { label: '50% na entrada + 50% no final', valor: '50_50' },
                    { label: '30, 60 e 90 dias', valor: '30_60_90' },
                    { label: 'À vista', valor: 'a_vista' },
                  ].map(op => (
                    <button key={op.valor} onClick={() => { setFormaPagamento(op.valor); addMsg('user', op.label); setStepAtual('resumo'); setTimeout(() => mostrarResumo(), 300); }}
                      style={{ display: 'block', width: '100%', marginBottom: 8, padding: '12px 16px', borderRadius: 10, border: `2px solid ${formaPagamento === op.valor ? '#00E5C4' : 'rgba(0,180,255,0.2)'}`, background: formaPagamento === op.valor ? 'rgba(0,229,196,0.1)' : 'rgba(255,255,255,0.03)', color: formaPagamento === op.valor ? '#00E5C4' : '#E8F4FF', fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif' }}>
                      {op.label}
                    </button>
                  ))}
                </div>
              ) : msg.content ? (
                <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.role === 'user' ? '#0080FF' : 'rgba(255,255,255,0.06)', color: '#E8F4FF', fontSize: 13, lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: renderText(msg.content) }} />
              ) : null}
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5C4', animation: `bounce 1s ${i * 0.15}s infinite` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Resumo + Confirmar */}
        {stepAtual === 'resumo' && formaPagamento && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(0,180,255,0.1)', background: 'rgba(10,22,38,0.8)' }}>
            <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 8 }}>
              📋 <strong style={{ color: '#E8F4FF' }}>Resumo:</strong> {briefing.evento.nome || briefing.evento.tipo} • {briefing.evento.dataInicio} • {briefing.evento.cidade} • {[...new Set(briefing.servicosNecessarios)].join(', ')}
            </div>
            <button onClick={handleConfirm} disabled={submitting}
              style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: submitting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              {submitting ? 'Enviando...' : '✓ Confirmar e Enviar Briefing'}
            </button>
          </div>
        )}

        {/* Input */}
        {stepAtual !== 'aguardando_modelo' && stepAtual !== 'aguardando_led' && stepAtual !== 'resumo' && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,180,255,0.1)', background: 'rgba(10,22,38,0.8)', display: 'flex', gap: 8 }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Digite sua resposta..." disabled={loading || aguardandoResposta}
              style={{ flex: 1, padding: '9px 14px', borderRadius: 20, border: '1px solid rgba(0,180,255,0.2)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }} />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading || aguardandoResposta}
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (!input.trim() || loading) ? 0.5 : 1 }}>
              ↑
            </button>
          </div>
        )}

        <style>{`@keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }`}</style>
      </div>
    </div>
  );

  function mostrarResumo() {
    addMsg('assistant', `Perfeito! Aqui está o resumo do seu briefing:\n\n**Evento:** ${briefing.evento.nome || briefing.evento.tipo}\n**Data:** ${briefing.evento.dataInicio}${briefing.evento.dataFim && briefing.evento.dataFim !== briefing.evento.dataInicio ? ` até ${briefing.evento.dataFim}` : ''}\n**Horário:** ${briefing.evento.horarioInicio} às ${briefing.evento.horarioFim}\n**Local:** ${briefing.evento.local || briefing.evento.cidade}\n**Pessoas:** ${briefing.evento.visitantesPorDia}\n**Serviços:** ${[...new Set(briefing.servicosNecessarios)].join(', ')}\n**Pagamento:** ${formaPagamento === '50_50' ? '50% entrada + 50% final' : formaPagamento === '30_60_90' ? '30/60/90 dias' : 'À vista'}\n\nEstá tudo correto? Clique em **Confirmar** para enviar!`);
  }
}
