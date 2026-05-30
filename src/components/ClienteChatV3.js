import React, { useState, useEffect, useRef } from 'react';
import { doc, collection, getDocs, addDoc, updateDoc, serverTimestamp, query, where, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Utilitários ──────────────────────────────────────────────────────────────
function extractJson(text) {
  const patterns = [
    /```json\s*([\s\S]*?)```/,
    /```\s*([\s\S]*?)```/,
    /(\{[\s\S]*\})/,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      try { return JSON.parse(m[1].trim()); } catch {}
    }
  }
  return null;
}

function toISODate(str) {
  if (!str) return '';
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ── Sub-componente carrossel de fotos ────────────────────────────────────────
function ModeloCarrossel({ fotos, idx, onPrev, onNext, onDot }) {
  if (!fotos?.length) return <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 32 }}>🏗️</span>;
  return (
    <>
      {fotos.map((url, i) => (
        <img key={url} src={url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: i === idx ? 'block' : 'none' }} />
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

// ── Componente principal ─────────────────────────────────────────────────────
export default function ClienteChat({ userData, onClose }) {
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [systemScript, setSystemScript] = useState('');
  const [briefingJson, setBriefingJson] = useState(null);
  const [formaPagamento, setFormaPagamento] = useState(null);
  const [submitting, setSubmitting]     = useState(false);

  // Fases: 'briefing' → 'equipamentos' → 'pagamento' → 'confirmacao' → 'sent'
  const [fase, setFase] = useState('briefing');

  // Cards de equipamentos
  const [equipPendentes, setEquipPendentes]   = useState([]); // serviços para mostrar cards
  const [equipAtual, setEquipAtual]           = useState(null); // serviço sendo exibido agora
  const [opcoesAtuais, setOpcoesAtuais]       = useState([]); // opções do Firestore
  const [opcaoSelecionada, setOpcaoSelecionada] = useState(null);
  const [equipSelecionados, setEquipSelecionados] = useState([]); // opções confirmadas

  // Cards de estande modular
  const [modelosEspeciais, setModelosEspeciais] = useState([]);
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [carrosselIdx, setCarrosselIdx]         = useState({});

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const userName  = userData?.name || userData?.email?.split('@')[0] || 'Cliente';
  const userId    = userData?.id;

  // ── Scroll ────────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, fase]);

  // ── Foco automático no input ──────────────────────────────────────────────
  useEffect(() => {
    if (fase === 'briefing' && !loading) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, loading, fase]);

  // ── Carrega script ────────────────────────────────────────────────────────
  useEffect(() => {
    getDocs(collection(db, 'config')).then(snap => {
      snap.docs.forEach(d => {
        if (d.id === 'aiScript' && d.data().script) setSystemScript(d.data().script);
      });
    }).catch(() => {});
  }, []);

  // ── Primeira mensagem ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!systemScript) return;
    addMsg('assistant', `Olá, **${userName}**! 😊 Sou a **Realize**, sua assistente de eventos.\n\nVou te ajudar a montar o pré-orçamento do seu evento. Para começar: **que tipo de evento você está planejando?**`);
  }, [systemScript]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const addMsg = (role, content, extras = {}) => {
    setMessages(prev => [...prev, { role, content, id: Date.now() + Math.random(), ...extras }]);
  };

  const renderText = (text) => text
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');

  // ── Envio de mensagem para a IA (FASE 1 - briefing) ──────────────────────
  const sendMessage = async (textoForcado) => {
    const text = (textoForcado || input).trim();
    if (!text || loading) return;
    setInput('');
    addMsg('user', text);
    setLoading(true);

    try {
      const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const systemPrompt = `CLIENTE: ${userName}. Chame-o pelo nome durante toda a conversa.\nHOJE É: ${hoje}.\n\n${systemScript}`;

      const history = messages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content && !m.type))
        .slice(-16)
        .map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: text });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages: history,
        }),
      });
      const data = await res.json();
      const assistantText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();

      // Limpa marcadores do texto
      const temMarcadorModelos   = assistantText.includes('[MOSTRAR_MODELOS]') || assistantText.includes('{MOSTRAR_MODELOS}');
      const temMarcadorPagamento = assistantText.includes('[ESCOLHER_PAGAMENTO]') || assistantText.includes('{ESCOLHER_PAGAMENTO}');
      const textoLimpo = assistantText
        .replace('[MOSTRAR_MODELOS]', '').replace('{MOSTRAR_MODELOS}', '')
        .replace('[ESCOLHER_PAGAMENTO]', '').replace('{ESCOLHER_PAGAMENTO}', '')
        .trim();

      // Detecta JSON do briefing
      const json = extractJson(assistantText);
      if (json?.evento) {
        setBriefingJson(json);
      }

      // Mostra modelos de estande se marcador presente
      if (temMarcadorModelos) {
        if (textoLimpo) addMsg('assistant', textoLimpo);
        try {
          const snap = await getDocs(query(collection(db, 'modelosEspeciais'), where('ativo', '==', true)));
          const modelos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setModelosEspeciais(modelos);
          if (modelos.length > 0) {
            addMsg('assistant', '', { type: 'modelos' });
          }
        } catch {}
        return;
      }

      // Mostra texto normal
      if (textoLimpo) addMsg('assistant', textoLimpo);

      // Quando a IA pede pagamento OU tem JSON → entra na FASE 2
      if (temMarcadorPagamento || json?.evento) {
        if (json?.evento) {
          setBriefingJson(json);
          await iniciarFase2(json);
        }
      }
    } catch (e) {
      console.error(e);
      addMsg('assistant', 'Desculpe, tive um problema. Pode repetir?');
    } finally {
      setLoading(false);
    }
  };

  // ── FASE 2 — Equipamentos (código controla) ───────────────────────────────
  const iniciarFase2 = async (json) => {
    const sm = json.servicosMencionados || {};
    const servicos = json.servicosNecessarios || [];

    // Monta lista de serviços para mostrar cards
    const pendentes = [];

    // LED
    if (sm.led || servicos.some(s => normalize(s).includes('led') || normalize(s).includes('neon'))) {
      pendentes.push({ tipo: 'led', label: 'Painel de LED', termos: ['led', 'painel de led', 'led / neon', 'neon'] });
    }
    // Som
    if (sm.som || servicos.some(s => normalize(s).includes('som') || normalize(s).includes('audio') || normalize(s).includes('pa'))) {
      pendentes.push({ tipo: 'som', label: 'Som / Áudio', termos: ['som', 'sistema pa', 'audio', 'caixa de som'] });
    }
    // DJ
    if (sm.dj || servicos.some(s => normalize(s).includes('dj'))) {
      pendentes.push({ tipo: 'dj', label: 'DJ', termos: ['dj', 'disc jockey'] });
    }
    // Foto
    if (sm.foto || servicos.some(s => normalize(s).includes('foto') || normalize(s).includes('video'))) {
      pendentes.push({ tipo: 'foto', label: 'Fotógrafo / Videomaker', termos: ['fotografo', 'videomaker', 'foto'] });
    }

    if (pendentes.length > 0) {
      setEquipPendentes(pendentes);
      setFase('equipamentos');
      await mostrarProximoEquip(pendentes, 0, json);
    } else {
      // Sem equipamentos → direto para pagamento
      setFase('pagamento');
      addMsg('assistant', `Perfeito, ${userName}! Já tenho todas as informações. Por último, qual a **forma de pagamento** preferida?`, { type: 'pagamento' });
    }
  };

  const mostrarProximoEquip = async (pendentes, idx, json) => {
    if (idx >= pendentes.length) {
      // Todos os equipamentos processados → pagamento
      setFase('pagamento');
      addMsg('assistant', `Ótimo! Por último, qual a **forma de pagamento** preferida?`, { type: 'pagamento' });
      return;
    }

    const equip = pendentes[idx];
    setEquipAtual({ ...equip, idx });
    setOpcaoSelecionada(null);

    // Busca opções no Firestore
    try {
      const svSnap = await getDocs(collection(db, 'supplierServices'));
      const todos = svSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
      const cidadeNorm = normalize(json?.evento?.cidade || '');

      const servicos = todos.filter(s => {
        if (cidadeNorm && s.regiao) {
          const reg = normalize(s.regiao);
          if (!reg.includes(cidadeNorm) && !cidadeNorm.includes(reg) && !reg.includes('todo') && !reg.includes('nacional')) return false;
        }
        return equip.termos.some(t => normalize(s.serviceName).includes(t) || t.includes(normalize(s.serviceName)) || normalize(s.serviceParentName).includes(t));
      });

      const comOpcoes = await Promise.all(servicos.map(async s => {
        try {
          const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
          return opSnap.docs.map(d => ({ id: d.id, supplierId: s.supplierId, serviceName: s.serviceName, serviceParentName: s.serviceParentName, tipoServico: s.tipoServico, diasPreparo: s.diasPreparo || 0, diasMontagem: s.diasMontagem || 0, ...d.data() }));
        } catch { return []; }
      }));
      const opcoes = comOpcoes.flat();

      if (opcoes.length > 0) {
        setOpcoesAtuais(opcoes);
        addMsg('assistant', '', { type: 'opcoes_equip' });
      } else {
        // Não disponível
        addMsg('assistant', `⚠️ **${equip.label}** não está disponível na sua região no momento. Nossa equipe vai buscar fornecedores e te retorna antes da aprovação final.`);
        setBriefingJson(prev => ({
          ...prev,
          itensEmAnalise: [...(prev?.itensEmAnalise || []), equip.label],
        }));
        // Avança para próximo
        await mostrarProximoEquip(pendentes, idx + 1, json);
      }
    } catch (e) {
      console.error(e);
      await mostrarProximoEquip(pendentes, idx + 1, json);
    }
  };

  const confirmarOpcao = async (opcao) => {
    setEquipSelecionados(prev => [...prev, { ...opcao, equipTipo: equipAtual?.tipo }]);
    addMsg('user', `Quero: ${opcao.nome}${opcao.caracteristica ? ' (' + opcao.caracteristica + ')' : ''}`);
    addMsg('assistant', `✓ **${opcao.nome}** selecionado!`);
    const proximoIdx = (equipAtual?.idx || 0) + 1;
    await mostrarProximoEquip(equipPendentes, proximoIdx, briefingJson);
  };

  const pularOpcao = async () => {
    addMsg('user', 'Não preciso desse item');
    const proximoIdx = (equipAtual?.idx || 0) + 1;
    await mostrarProximoEquip(equipPendentes, proximoIdx, briefingJson);
  };

  // ── FASE 4 — Confirmação ──────────────────────────────────────────────────
  const iniciarFase4 = async (pagamento) => {
    setFase('confirmacao');
    setLoading(true);
    try {
      const json = briefingJson;
      const servicos = [...new Set([
        ...(json?.servicosNecessarios || []),
        ...equipSelecionados.map(e => e.serviceName),
      ])].filter(Boolean);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: 'Você é a Realize, assistente de eventos. Escreva em português, tom simpático e profissional.',
          messages: [{
            role: 'user',
            content: `Faça um resumo bonito e amigável do briefing abaixo para o cliente ${userName} confirmar. Use emojis discretos. Máximo 8 linhas.\n\nEvento: ${json?.evento?.nome || json?.evento?.tipo}\nData: ${json?.evento?.dataInicio} às ${json?.evento?.horarioInicio}\nLocal: ${json?.evento?.local || json?.evento?.cidade}\nPessoas: ${json?.evento?.visitantesPorDia}\nServiços: ${servicos.join(', ')}\nPagamento: ${pagamento === '50_50' ? '50% entrada + 50% final' : pagamento === '30_60_90' ? '30/60/90 dias' : 'À vista'}`,
          }],
        }),
      });
      const data = await res.json();
      const resumo = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      addMsg('assistant', resumo);
      addMsg('assistant', '', { type: 'confirmar' });
    } catch (e) {
      addMsg('assistant', 'Tudo certo! Clique em **Confirmar** para enviar o briefing.');
      addMsg('assistant', '', { type: 'confirmar' });
    } finally {
      setLoading(false);
    }
  };

  // ── handleConfirm — salva no Firestore ───────────────────────────────────
  const handleConfirm = async () => {
    if (!briefingJson) return;
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
          numeroPedido = `OP-${String(proximo).padStart(4, '0')}-${new Date().getFullYear().toString().slice(-2)}`;
        });
      } catch (e) { console.error(e); }

      // Monta servicosNecessarios final (briefing + opções escolhidas)
      const servicosBase = briefingJson.servicosNecessarios || [];
      const servicosEquip = equipSelecionados.map(e => e.serviceName).filter(Boolean);
      const servicosFinais = [...new Set([...servicosBase, ...servicosEquip])];

      // Dias de duração
      const di = toISODate(briefingJson.evento?.dataInicio || '');
      const df = toISODate(briefingJson.evento?.dataFim || '');
      let diasDuracao = 1;
      if (di && df) { const diff = (new Date(df) - new Date(di)) / 86400000; diasDuracao = Math.max(1, diff + 1); }

      const briefingFinal = {
        ...briefingJson,
        servicosNecessarios: servicosFinais,
        formaPagamento: formaPagamento || '',
        evento: { ...briefingJson.evento, diasDuracao },
        equipamentosSelecionados: equipSelecionados,
      };

      const budgetRef = await addDoc(collection(db, 'budgets'), {
        clientUserId:   userId,
        clientName:     userName,
        eventName:      briefingJson.evento?.nome || briefingJson.evento?.tipo || 'Novo Evento',
        eventTypeName:  briefingJson.evento?.tipo || '',
        startDate:      toISODate(briefingJson.evento?.dataInicio || ''),
        endDate:        toISODate(briefingJson.evento?.dataFim || ''),
        location:       briefingJson.evento?.endereco || briefingJson.evento?.local || briefingJson.evento?.cidade || '',
        guestCount:     briefingJson.evento?.visitantesPorDia || 0,
        status:         'analyzing',
        workspaceStage: 'Propostas',
        isMae:          true,
        numeroPedido,
        briefingData:   briefingFinal,
        itensEmAnalise: briefingJson.itensEmAnalise || [],
        financeiro:     { formaPagamento: formaPagamento || '' },
        assignedTo,
        assignedToName,
        assignedAt:     assignedTo ? serverTimestamp() : null,
        createdAt:      serverTimestamp(),
        updatedAt:      serverTimestamp(),
      });

      // Tarefas para itens em análise
      for (const item of (briefingJson.itensEmAnalise || [])) {
        await addDoc(collection(db, 'tasks'), {
          budgetId:   budgetRef.id,
          tipo:       'analise',
          nome:       `⚠️ Item em análise: ${item}`,
          descricao:  `Cliente solicitou "${item}" — não disponível nos fornecedores cadastrados. Buscar solução antes da aprovação.`,
          status:     'pendente',
          prioridade: 'alta',
          fase:       'analise',
          assignedTo,
          createdAt:  serverTimestamp(),
        });
      }

      // SupplierJobs
      try {
        const suppServSnap = await getDocs(collection(db, 'supplierServices'));
        const todosServicos = suppServSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
        const cidadeEvento = normalize(briefingJson.evento?.cidade || '');

        // Filtra por serviços necessários
        const suppServs = todosServicos.filter(s => {
          if (s.regiao) {
            const reg = normalize(s.regiao);
            if (!reg.includes(cidadeEvento) && !cidadeEvento.includes(reg) && !reg.includes('todo') && !reg.includes('nacional')) return false;
          }
          const svcName = normalize(s.serviceName);
          const parentName = normalize(s.serviceParentName);
          const sinonimos = {
            'recepcionista': ['recepcionista', 'hostess', 'recepcao'],
            'hostess':       ['recepcionista', 'hostess'],
            'dj':            ['dj', 'disc jockey'],
            'seguranca':     ['seguranca', 'vigilancia', 'segurança patrimonial'],
            'limpeza':       ['limpeza', 'auxiliar de limpeza'],
            'led':           ['led', 'painel de led', 'led / neon', 'neon'],
            'som':           ['som', 'sistema pa', 'sistema de som', 'audio'],
          };
          if (servicosFinais.some(sn => normalize(sn) === svcName || normalize(sn) === parentName)) return true;
          if (servicosFinais.some(sn => { const snNorm = normalize(sn); return snNorm.includes(svcName) || svcName.includes(snNorm); })) return true;
          for (const [, terms] of Object.entries(sinonimos)) {
            const svcMatch = terms.some(t => svcName.includes(t) || t.includes(svcName));
            if (svcMatch && servicosFinais.some(sn => terms.some(t => normalize(sn).includes(t) || t.includes(normalize(sn))))) return true;
          }
          return false;
        });

        // Deduplicação
        const vistos = new Set();
        for (const sv of suppServs) {
          const key = `${sv.supplierId}__${sv.serviceName}`;
          if (vistos.has(key)) continue;
          vistos.add(key);

          // Observações técnicas do briefing
          const obs = [];
          const bEquip = briefingJson.equipamentos || {};
          if (normalize(sv.serviceName).includes('led') || normalize(sv.serviceParentName).includes('led')) {
            const led = bEquip.led || {};
            if (led.observacoes)  obs.push(led.observacoes);
            // Opção escolhida
            const opcEscolhida = equipSelecionados.find(e => e.equipTipo === 'led');
            if (opcEscolhida) obs.push(`Opção escolhida: ${opcEscolhida.nome}${opcEscolhida.caracteristica ? ' (' + opcEscolhida.caracteristica + ')' : ''}`);
          }
          if (normalize(sv.tipoServico) === 'estrutura' || normalize(sv.serviceParentName).includes('estande')) {
            const est = briefingJson.estrutura || {};
            if (est.areaM2)          obs.push(`Área: ${est.areaM2}m²`);
            if (est.alturaTeto)      obs.push(`Altura teto: ${est.alturaTeto}`);
            if (est.diasMontagem)    obs.push(`Dias montagem: ${est.diasMontagem}`);
            if (est.restricoes)      obs.push(`Restrições: ${est.restricoes}`);
            if (est.identidadeVisual) obs.push(`Identidade visual: ${est.identidadeVisual}`);
          }
          const profBriefing = (briefingJson.equipe?.itens || []).find(i => normalize(i.tipo) === normalize(sv.serviceName));
          if (profBriefing?.observacoes) obs.push(`Perfil: ${profBriefing.observacoes}`);

          await addDoc(collection(db, 'supplierJobs'), {
            supplierId:          sv.supplierId,
            budgetId:            budgetRef.id,
            eventName:           briefingJson.evento?.nome || 'Novo Evento',
            eventTypeName:       briefingJson.evento?.tipo || '',
            clientName:          userName,
            eventDate:           toISODate(briefingJson.evento?.dataInicio || ''),
            eventDateFim:        toISODate(briefingJson.evento?.dataFim || ''),
            eventLocal:          briefingJson.evento?.endereco || briefingJson.evento?.local || briefingJson.evento?.cidade || '',
            eventCidade:         briefingJson.evento?.cidade || '',
            eventHorarioInicio:  briefingJson.evento?.horarioInicio || '',
            eventHorarioFim:     briefingJson.evento?.horarioFim || '',
            eventDiasDuracao:    diasDuracao,
            eventVisitantes:     briefingJson.evento?.visitantesPorDia || 0,
            serviceNames:        [sv.serviceName],
            serviceName:         sv.serviceName,
            serviceParentName:   sv.serviceParentName || '',
            tipoServico:         sv.tipoServico || '',
            preco:               sv.preco || 0,
            unidade:             sv.unidade || '',
            diasPreparo:         sv.diasPreparo || 0,
            diasMontagem:        sv.diasMontagem || 0,
            observacaoCliente:   obs.join(' | '),
            stage:               'proposta',
            status:              'draft',
            createdAt:           serverTimestamp(),
          });
        }

        // Estande modular
        const pedidoModular = servicosFinais.some(sn => normalize(sn).includes('modular') || normalize(sn).includes('estande'));
        if (pedidoModular && modeloSelecionado) {
          try {
            const tiposSnap = await getDocs(collection(db, 'tiposEspeciais'));
            const todosTipos = tiposSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const tipoDoModelo = todosTipos.find(t => t.id === modeloSelecionado.tipoEspecialId || t.nome?.toLowerCase().includes('modular'));
            const fornecedores = tipoDoModelo?.fornecedoresAutorizados || [];
            const fornVistos = new Set();
            for (const forn of fornecedores) {
              if (fornVistos.has(forn.id)) continue;
              fornVistos.add(forn.id);
              await addDoc(collection(db, 'supplierJobs'), {
                supplierId: forn.id, supplierName: forn.nome || '',
                budgetId: budgetRef.id, eventName: briefingJson.evento?.nome || 'Novo Evento',
                clientName: userName, eventDate: toISODate(briefingJson.evento?.dataInicio || ''),
                eventLocal: briefingJson.evento?.endereco || briefingJson.evento?.local || '',
                eventCidade: briefingJson.evento?.cidade || '',
                eventHorarioInicio: briefingJson.evento?.horarioInicio || '',
                eventHorarioFim: briefingJson.evento?.horarioFim || '',
                eventDiasDuracao: diasDuracao, eventVisitantes: briefingJson.evento?.visitantesPorDia || 0,
                serviceNames: [modeloSelecionado.nome], serviceName: modeloSelecionado.nome,
                serviceParentName: tipoDoModelo?.nome || 'Estande Modular', tipoServico: 'estrutura',
                modeloEspecialId: modeloSelecionado.id, preco: modeloSelecionado.precoBase || 0,
                unidade: 'por evento', diasPreparo: modeloSelecionado.diasProducao || 0, diasMontagem: 0,
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
        const dataEvento = toISODate(briefingJson.evento?.dataInicio || '');
        const hoje = new Date().toISOString().split('T')[0];

        const cronRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6', max_tokens: 8000,
            system: 'Responda APENAS com JSON válido. Sem texto, sem markdown. Comece com {.',
            messages: [{ role: 'user', content: `Monte cronograma de produção. APENAS JSON.\nEvento:${briefingJson.evento?.nome||briefingJson.evento?.tipo},data:${dataEvento},dias:${diasDuracao},cidade:${briefingJson.evento?.cidade||''}\nServiços:${servicosFinais.join(',')}\nTempos:${servicosResumidos||'padrão'}\nHoje:${hoje}\nRegras: máximo 10 etapas, ordem lógica, datas de trás pra frente, nunca antes de hoje (${hoje}), prazoInviavel:true se menos de 5 dias\nJSON:{"prazoInviavel":false,"etapas":[{"id":"e1","n":"nome","d":"desc","r":"responsavel","di":"YYYY-MM-DD","de":"YYYY-MM-DD","da":0,"s":"pendente","t":"administrativo","atrasado":false}]}` }],
          }),
        });
        const cronData = await cronRes.json();
        const cronText = (cronData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        let cronJson = null;
        try { cronJson = JSON.parse(cronText.replace(/```json|```/g, '').trim()); } catch {}
        if (cronJson?.etapas?.length > 0) {
          const etapas = cronJson.etapas.map(e => ({
            id: e.id || e.n, nome: e.n || e.nome, descricao: e.d || e.descricao || '',
            responsavel: e.r || 'coordenador', dataInicio: e.di || '', dataEntrega: e.de || '',
            diasAntes: e.da ?? 0, status: e.s || 'pendente', tipo: e.t || 'administrativo',
          }));
          await updateDoc(doc(db, 'budgets', budgetRef.id), { cronograma: { etapas, prazoInviavel: cronJson.prazoInviavel || false } });
        }
      } catch (e) { console.error('Erro cronograma:', e); }

      // Descrição do briefing
      try {
        const descRes = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6', max_tokens: 800,
            system: 'Especialista em eventos. Português, profissional, sem markdown, texto corrido.',
            messages: [{ role: 'user', content: `Escreva descrição profissional para equipe interna. Máximo 3 parágrafos.\nEvento: ${briefingJson.evento?.nome||briefingJson.evento?.tipo}\nTipo: ${briefingJson.evento?.tipo}\nData: ${briefingJson.evento?.dataInicio} a ${briefingJson.evento?.dataFim}\nLocal: ${briefingJson.evento?.local||briefingJson.evento?.cidade}\nVisitantes: ${briefingJson.evento?.visitantesPorDia}\nServiços: ${servicosFinais.join(', ')}\nEquipe: ${JSON.stringify(briefingJson.equipe?.itens||[])}` }],
          }),
        });
        const descData = await descRes.json();
        const descText = (descData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (descText) await updateDoc(doc(db, 'budgets', budgetRef.id), { descricaoBriefing: descText });
      } catch (e) { console.error('Erro descrição:', e); }

      setFase('sent');
    } catch (e) {
      console.error('Erro ao salvar:', e);
      alert('Erro ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (fase === 'sent') {
    return (
      <div style={S.overlay}>
        <div style={{ ...S.modal, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#E8F4FF', marginBottom: 8 }}>Briefing enviado!</div>
          <div style={{ fontSize: 13, color: '#7BAFD4', marginBottom: 24 }}>Nossa equipe já recebeu e vai montar seu pré-orçamento em breve.</div>
          <button onClick={onClose} style={S.btnPrimary}>Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.overlay}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; }
        .v3-input:focus { outline: none; border-color: rgba(0,229,196,0.4) !important; }
        @keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
      `}</style>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={S.avatar}>✨</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>Realize</div>
              <div style={{ fontSize: 10, color: '#00E5C4' }}>Assistente de Eventos</div>
            </div>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {/* Mensagens */}
        <div style={S.msgArea}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 4 }}>

              {/* Card de modelos de estande */}
              {msg.type === 'modelos' && (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 10 }}>Escolha o modelo de estande:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    {modelosEspeciais.map(m => {
                      const fotos = m.fotos?.length > 0 ? m.fotos.map(f => f.url) : (m.fotoUrl ? [m.fotoUrl] : []);
                      const sel = modeloSelecionado?.id === m.id;
                      return (
                        <div key={m.id} onClick={() => setModeloSelecionado(m)}
                          style={{ borderRadius: 10, border: `2px solid ${sel ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: sel ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', overflow: 'hidden' }}>
                          <div style={{ height: 90, position: 'relative', background: 'rgba(0,128,255,0.08)' }}>
                            <ModeloCarrossel fotos={fotos} idx={carrosselIdx[m.id] || 0}
                              onPrev={() => setCarrosselIdx(p => ({ ...p, [m.id]: ((p[m.id]||0)-1+fotos.length)%fotos.length }))}
                              onNext={() => setCarrosselIdx(p => ({ ...p, [m.id]: ((p[m.id]||0)+1)%fotos.length }))}
                              onDot={i => setCarrosselIdx(p => ({ ...p, [m.id]: i }))} />
                          </div>
                          <div style={{ padding: '8px 10px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#E8F4FF' }}>{m.nome}</div>
                            {m.areaM2 && <div style={{ fontSize: 10, color: '#7BAFD4' }}>📐 {m.areaM2}m²</div>}
                            {m.precoBase > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#00E5C4' }}>R$ {m.precoBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {modeloSelecionado && (
                    <button onClick={() => {
                      addMsg('user', `Quero o ${modeloSelecionado.nome}`);
                      addMsg('assistant', `✓ **${modeloSelecionado.nome}** selecionado!`);
                      setBriefingJson(prev => ({ ...prev, modeloEstande: modeloSelecionado, servicosNecessarios: [...(prev?.servicosNecessarios||[]), modeloSelecionado.nome] }));
                    }} style={{ ...S.btnPrimary, width: '100%' }}>
                      Confirmar: {modeloSelecionado.nome} →
                    </button>
                  )}
                </div>
              )}

              {/* Card de opções de equipamento */}
              {msg.type === 'opcoes_equip' && equipAtual && (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: 12, color: '#7BAFD4', marginBottom: 8 }}>Opções de **{equipAtual.label}** disponíveis:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                    {opcoesAtuais.map(op => {
                      const sel = opcaoSelecionada?.id === op.id;
                      return (
                        <div key={op.id} onClick={() => setOpcaoSelecionada(op)}
                          style={{ padding: '12px 14px', borderRadius: 10, border: `2px solid ${sel ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: sel ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>{op.nome}</div>
                          {op.caracteristica && <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 2 }}>{op.caracteristica}</div>}
                          {op.valor && <div style={{ fontSize: 14, fontWeight: 700, color: '#00E5C4', marginTop: 4 }}>R$ {parseFloat(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {op.unidade||''}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={pularOpcao} style={{ ...S.btnSecondary, flex: 1 }}>Não preciso</button>
                    {opcaoSelecionada && (
                      <button onClick={() => confirmarOpcao(opcaoSelecionada)} style={{ ...S.btnPrimary, flex: 2 }}>
                        Confirmar: {opcaoSelecionada.nome} →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Card de pagamento */}
              {msg.type === 'pagamento' && (
                <div style={{ width: '100%', marginTop: 8 }}>
                  {msg.content && <div style={S.bubble(false)} dangerouslySetInnerHTML={{ __html: renderText(msg.content) }} />}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {[
                      { label: '50% na entrada + 50% no final', valor: '50_50' },
                      { label: '30, 60 e 90 dias', valor: '30_60_90' },
                      { label: 'À vista', valor: 'a_vista' },
                    ].map(op => (
                      <button key={op.valor} onClick={() => {
                        setFormaPagamento(op.valor);
                        addMsg('user', op.label);
                        iniciarFase4(op.valor);
                      }}
                        style={{ padding: '12px 16px', borderRadius: 10, border: `2px solid ${formaPagamento === op.valor ? '#00E5C4' : 'rgba(0,180,255,0.2)'}`, background: formaPagamento === op.valor ? 'rgba(0,229,196,0.1)' : 'rgba(255,255,255,0.03)', color: formaPagamento === op.valor ? '#00E5C4' : '#E8F4FF', fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif' }}>
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Card de confirmar */}
              {msg.type === 'confirmar' && (
                <button onClick={handleConfirm} disabled={submitting}
                  style={{ ...S.btnPrimary, width: '100%', marginTop: 12, opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Enviando...' : '✓ Confirmar e Enviar Briefing'}
                </button>
              )}

              {/* Mensagem normal */}
              {!msg.type && msg.content && (
                <div style={S.bubble(msg.role === 'user')} dangerouslySetInnerHTML={{ __html: renderText(msg.content) }} />
              )}

            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5C4', animation: `bounce 1s ${i*0.15}s infinite` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input — só na fase briefing */}
        {fase === 'briefing' && (
          <div style={S.inputArea}>
            <input
              ref={inputRef}
              className="v3-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Digite sua resposta..."
              disabled={loading}
              style={S.input}
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{ ...S.sendBtn, opacity: (!input.trim() || loading) ? 0.5 : 1 }}>↑</button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Outfit, sans-serif' },
  modal:   { background: '#0D1B2A', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 20, width: '100%', maxWidth: 560, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:  { padding: '14px 20px', borderBottom: '1px solid rgba(0,180,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(10,22,38,0.8)', flexShrink: 0 },
  avatar:  { width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 },
  closeBtn: { background: 'none', border: 'none', color: '#7BAFD4', fontSize: 20, cursor: 'pointer' },
  msgArea: { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 },
  bubble:  (isMine) => ({ maxWidth: '85%', padding: '10px 14px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? '#0080FF' : 'rgba(255,255,255,0.06)', color: '#E8F4FF', fontSize: 13, lineHeight: 1.6 }),
  inputArea: { padding: '10px 16px', borderTop: '1px solid rgba(0,180,255,0.1)', background: 'rgba(10,22,38,0.8)', display: 'flex', gap: 8, flexShrink: 0 },
  input:   { flex: 1, padding: '9px 14px', borderRadius: 20, border: '1px solid rgba(0,180,255,0.2)', background: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif' },
  sendBtn: { width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  btnPrimary: { padding: '12px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' },
  btnSecondary: { padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' },
};
