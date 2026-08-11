import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─────────────────────────────────────────────────────────────────────────────
// DESTINOS FIXOS — cada um representa um campo real que o resto do sistema
// (orçamento, cronograma, financeiro, catálogo) já lê hoje. O TIPO de cada
// destino é travado aqui — não pode ser escolhido livremente na tela, senão
// arriscaria uma pergunta de tipo errado alimentar um campo que o sistema
// espera de outro jeito. Os nomes/chaves batem exatamente com os campos do
// "dados" no ClienteChat.js, pra facilitar a ligação na Fase 4.
//
// valoresFixos: quando presente, as OPÇÕES de resposta também são travadas
// (o texto do botão pode mudar, o valor salvo no banco não).
// ─────────────────────────────────────────────────────────────────────────────
// Mesma lista de Áreas usada em FornecedorServicos.js — usada no seletor de
// serviço específico (Área > Categoria > Sub-Serviço) das perguntas.
const TIPOS_AREA = [
  { id: 'estrutura',      label: 'Estrutura' },
  { id: 'operacao',       label: 'Operacao' },
  { id: 'entretenimento', label: 'Entretenimento' },
  { id: 'gastronomia',    label: 'Gastronomia' },
];

const DESTINOS_FIXOS = {
  'raiz.tipoEvento':        { label: 'Tipo de Evento (pergunta raiz)', tipo: 'roteador', grupo: 'Raiz' },

  'evento.nomeEmpresa':     { label: 'Nome da Empresa', tipo: 'texto_livre', grupo: 'Evento' },
  'evento.nomeEvento':      { label: 'Nome do Evento', tipo: 'texto_livre', grupo: 'Evento' },
  'evento.dataInicio':      { label: 'Data de Início', tipo: 'data', grupo: 'Evento' },
  'evento.dataFim':         { label: 'Data de Fim', tipo: 'data', grupo: 'Evento' },
  'evento.horario':         { label: 'Horário (início e fim)', tipo: 'horario', grupo: 'Evento' },
  'evento.local':           { label: 'Local e Cidade', tipo: 'localizacao', grupo: 'Evento' },
  'evento.visitantesPorDia':{ label: 'Visitantes por Dia', tipo: 'numero', grupo: 'Evento' },

  'pagamento.formaPagamento': {
    label: 'Forma de Pagamento', tipo: 'multipla_escolha', grupo: 'Pagamento',
    valoresFixos: [
      { valor: '50_50',    labelPadrao: '50% na entrada + 50% no final do evento' },
      { valor: '30_60_90', labelPadrao: '30, 60 e 90 dias' },
      { valor: 'a_vista',  labelPadrao: 'À vista' },
    ],
  },

  'stand.temStand':       { label: 'Vai ter Stand?', tipo: 'sim_nao', grupo: 'Stand' },
  'stand.tipoEstande':    {
    label: 'Tipo de Stand', tipo: 'multipla_escolha', grupo: 'Stand',
    valoresFixos: [
      { valor: 'modular',       labelPadrao: 'Modular — pronto e padronizado' },
      { valor: 'personalizado', labelPadrao: 'Personalizado — exclusivo, criado do zero' },
    ],
  },
  'stand.modeloEspecial':   { label: 'Escolha do Modelo (catálogo de modelos especiais)', tipo: 'catalogo_modelos', grupo: 'Stand' },
  'stand.standDescricao':   { label: 'Descrição do Stand Personalizado', tipo: 'texto_longo', grupo: 'Stand' },
  'stand.standImagensUrls': { label: 'Upload — Imagens de Referência do Stand', tipo: 'upload', grupo: 'Stand' },
  'stand.areaM2':           { label: 'Área do Stand (m²)', tipo: 'numero', grupo: 'Stand' },
  'stand.alturaTeto':       { label: 'Altura do Teto', tipo: 'texto_livre', grupo: 'Stand' },
  'stand.diasMontagem':     { label: 'Dias de Antecedência p/ Montagem', tipo: 'numero', grupo: 'Stand' },
  'stand.restricoes':       { label: 'Restrições de Acesso ao Local', tipo: 'texto_livre', grupo: 'Stand' },
  'stand.identidadeVisual': { label: 'Já tem Identidade Visual?', tipo: 'sim_nao', grupo: 'Stand' },
  'stand.identidadeImagensUrls': { label: 'Upload — Arquivos de Identidade Visual', tipo: 'upload', grupo: 'Stand' },
  'stand.usarCampanha':     { label: 'Usar Identidade de Campanha de Marketing Ativa', tipo: 'campanha_marketing', grupo: 'Stand' },

  'produtor.temProdutor':   { label: 'Precisa de Produtor?', tipo: 'sim_nao', grupo: 'Produtor' },

  'catalogo.estrutura':       { label: 'Catálogo — Estrutura', tipo: 'catalogo', setor: 'estrutura', grupo: 'Catálogo' },
  'catalogo.equipe':          { label: 'Catálogo — Equipe / Operação', tipo: 'catalogo', setor: 'operacao', grupo: 'Catálogo' },
  'catalogo.gastronomia':     { label: 'Catálogo — Gastronomia', tipo: 'catalogo', setor: 'gastronomia', grupo: 'Catálogo' },
  'catalogo.entretenimento':  { label: 'Catálogo — Equipamentos / Atrações', tipo: 'catalogo', setor: 'entretenimento', grupo: 'Catálogo' },
  'catalogo.especifico':      { label: 'Catálogo — Serviço Específico (escolha exata)', tipo: 'catalogo_especifico', grupo: 'Catálogo' }, // em vez de uma categoria inteira, você escolhe Área > Categoria > Sub-Serviço exato — pra perguntas objetivas ligadas a um serviço só

  'extra.infoExtra':        { label: 'Informação Extra / Pedido Especial', tipo: 'texto_longo', grupo: 'Extras' },

  'generico':               { label: '— Campo Genérico (livre, não conecta a nenhum cálculo) —', tipo: null, grupo: 'Livre' },
};

const TIPOS_LABEL = {
  roteador:        'Roteador (raiz)',
  sim_nao:         'Sim / Não',
  multipla_escolha:'Múltipla escolha',
  texto_livre:     'Texto livre (curto)',
  texto_longo:     'Texto livre (longo)',
  numero:          'Número',
  data:            'Data',
  horario:         'Horário',
  localizacao:     'Localização (cidade + local)',
  upload:          'Upload de arquivo',
  catalogo:        'Serviço de catálogo',
  catalogo_especifico: 'Serviço específico (escolha exata)',
  catalogo_modelos:'Catálogo de modelos especiais',
};

const QUEM_RESPONDE_OPCOES = [
  { valor: 'todos',          label: 'Todos' },
  { valor: 'cliente_comum',  label: 'Só cliente comum' },
  { valor: 'franqueado',     label: 'Só franqueado / tenant' },
];

const PERGUNTA_VAZIA = {
  texto: '', subtitulo: '', destino: '', tipo: null, setor: null,
  opcoes: [], quemResponde: 'todos', ativo: true,
  perguntaPaiId: null, condicaoRespostaPai: null,
  condicaoExibicao: null, // { verificarDestino, contemTexto } — pergunta condicional (ver DESTINOS que aceitam checagem abaixo)
  // Preenchidos só quando destino === 'catalogo.especifico' (ver seletor Área > Categoria > Sub-Serviço)
  servicoId: null, servicoNome: '', servicoCategoriaId: null, servicoCategoriaNome: '', servicoTipoServico: null,
  mostrarNoBriefingStand: false, // pergunta genérica cuja resposta deve aparecer no briefing (seção Stand)
};

// Destinos cuja resposta dá pra checar numa condição (catálogos = lista de itens
// escolhidos; múltipla escolha/sim-não = valor único). "generico" fica de fora
// porque seu tipo varia livremente.
const DESTINOS_CHECAVEIS = Object.entries(DESTINOS_FIXOS).filter(([k, v]) => k !== 'generico' && (v.tipo === 'catalogo' || v.tipo === 'multipla_escolha' || v.tipo === 'sim_nao' || v.tipo === 'campanha_marketing'));

const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 };

export default function BancoPerguntas() {
  const [perguntas, setPerguntas] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editando, setEditando]   = useState(null); // null = nova
  const [form, setForm]           = useState(PERGUNTA_VAZIA);
  // Quando != null, o formulário abre já vinculado como sub-pergunta desta:
  const [criandoSubDe, setCriandoSubDe] = useState(null); // { pai, valorCondicao }
  const [expandidas, setExpandidas] = useState({});
  // Catálogo de serviços (Área > Categoria > Sub-Serviço) — usado no seletor
  // de "Serviço Específico". Mesma coleção 'services' que FornecedorServicos.js lê.
  const [catalogoServicos, setCatalogoServicos] = useState([]);
  const [selTipo, setSelTipo]           = useState(null);
  const [selCategoria, setSelCategoria] = useState(null);

  useEffect(() => { carregar(); carregarCatalogoServicos(); }, []);

  const carregarCatalogoServicos = async () => {
    const snap = await getDocs(collection(db, 'services'));
    setCatalogoServicos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const carregar = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'perguntas'));
    setPerguntas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const destinoInfo = form.destino ? DESTINOS_FIXOS[form.destino] : null;
  const destinoTravado = !!(destinoInfo && destinoInfo.tipo); // genérico e vazio ficam livres

  // Perguntas de topo (sem pai) — a raiz não aparece na lista comum, ela é especial
  const perguntasTopo = perguntas.filter(p => !p.perguntaPaiId && p.destino !== 'raiz.tipoEvento').sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const perguntaRaiz  = perguntas.find(p => p.destino === 'raiz.tipoEvento');
  const filhasDe = (paiId) => perguntas.filter(p => p.perguntaPaiId === paiId);

  // Gera um documento de texto com todas as perguntas cadastradas (incluindo
  // sub-perguntas, em hierarquia) e onde cada uma está vinculada — pra mandar
  // pra quem vai construir os fluxos.
  const exportarPerguntas = () => {
    const linhas = [];
    linhas.push('PERGUNTAS CADASTRADAS — REALIZE HUB');
    linhas.push(`Exportado em ${new Date().toLocaleDateString('pt-BR')}`);
    linhas.push('='.repeat(60));
    linhas.push('');

    const descreverVinculo = (p) => {
      if (p.destino === 'generico') return 'Campo genérico (livre, não conecta a nenhum cálculo)';
      if (p.destino === 'catalogo.especifico') {
        const partes = [p.servicoNome, p.servicoCategoriaNome, p.servicoTipoServico].filter(Boolean);
        return `Serviço Específico — ${partes.join(' > ') || '(não configurado)'}`;
      }
      const info = DESTINOS_FIXOS[p.destino];
      return info ? info.label : (p.destino || '(sem destino)');
    };

    const descreverLinha = (p, nivel) => {
      const prefixo = '  '.repeat(nivel) + (nivel > 0 ? '└─ ' : '');
      linhas.push(`${prefixo}[${p.ativo === false ? 'INATIVA' : 'ativa'}] ${p.texto}`);
      const detalheIndent = '  '.repeat(nivel + 1);
      linhas.push(`${detalheIndent}Tipo: ${TIPOS_LABEL[p.tipo] || p.tipo || '—'}`);
      linhas.push(`${detalheIndent}Vinculada a: ${descreverVinculo(p)}`);
      if (p.subtitulo) linhas.push(`${detalheIndent}Subtítulo: ${p.subtitulo}`);
      if (p.opcoes?.length > 0) linhas.push(`${detalheIndent}Opções: ${p.opcoes.map(o => o.label).join(' | ')}`);
      const quemResp = QUEM_RESPONDE_OPCOES.find(q => q.valor === p.quemResponde)?.label;
      if (quemResp && p.quemResponde !== 'todos') linhas.push(`${detalheIndent}Só responde: ${quemResp}`);
      if (p.condicaoExibicao?.verificarDestino) {
        const alvo = p.condicaoExibicao.verificarDestino.startsWith('pergunta:')
          ? (perguntas.find(x => x.id === p.condicaoExibicao.verificarDestino.replace('pergunta:', ''))?.texto || '(pergunta apagada)')
          : (DESTINOS_FIXOS[p.condicaoExibicao.verificarDestino]?.label || p.condicaoExibicao.verificarDestino);
        linhas.push(`${detalheIndent}Pergunta Condicional: aparece se "${alvo}" contém "${p.condicaoExibicao.contemTexto}"`);
      }
      if (p.mostrarNoBriefingStand) linhas.push(`${detalheIndent}★ Aparece no briefing (seção Stand)`);
      linhas.push('');
      filhasDe(p.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).forEach(filha => descreverLinha(filha, nivel + 1));
    };

    perguntasTopo.forEach(p => descreverLinha(p, 0));

    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perguntas-realizehub-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const moverIrma = async (p, irmas, direcao) => {
    const lista = [...irmas].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const idx = lista.findIndex(x => x.id === p.id);
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= lista.length) return;
    const vizinha = lista[novoIdx];
    // Troca a "ordem" das duas — se algum dos dois nunca teve ordem definida
    // (perguntas antigas, antes desse campo existir), usa o índice como base.
    const ordemP = p.ordem ?? idx;
    const ordemV = vizinha.ordem ?? novoIdx;
    try {
      await updateDoc(doc(db, 'perguntas', p.id), { ordem: ordemV });
      await updateDoc(doc(db, 'perguntas', vizinha.id), { ordem: ordemP });
      setPerguntas(prev => prev.map(x => {
        if (x.id === p.id) return { ...x, ordem: ordemV };
        if (x.id === vizinha.id) return { ...x, ordem: ordemP };
        return x;
      }));
    } catch (e) { console.error(e); }
  };

  const abrirNova = (destinoPreSelecionado) => {
    setEditando(null);
    setCriandoSubDe(null);
    setSelTipo(null); setSelCategoria(null);
    setForm({ ...PERGUNTA_VAZIA, destino: destinoPreSelecionado || '' });
    setShowForm(true);
  };

  // Pergunta Condicional — mesmo formulário de sempre, só que já nasce marcada
  // como condicional (mostra os campos "verificar destino" / "contém texto").
  // Continua sendo uma pergunta de topo normal — entra na lista do Tipo de
  // Evento na posição que você escolher, só que pode ser pulada em runtime.
  const abrirNovaCondicional = () => {
    setEditando(null);
    setCriandoSubDe(null);
    setSelTipo(null); setSelCategoria(null);
    setForm({ ...PERGUNTA_VAZIA, condicaoExibicao: { verificarDestino: '', contemTexto: '' } });
    setShowForm(true);
  };

  const setCondicao = (campo, valor) => {
    setForm(p => ({ ...p, condicaoExibicao: { ...(p.condicaoExibicao || {}), [campo]: valor } }));
  };

  const abrirNovaSub = (pai, valorCondicao) => {
    setEditando(null);
    setCriandoSubDe({ pai, valorCondicao });
    setSelTipo(null); setSelCategoria(null);
    setForm({ ...PERGUNTA_VAZIA, perguntaPaiId: pai.id, condicaoRespostaPai: valorCondicao });
    setShowForm(true);
  };

  const abrirEditar = (p) => {
    setEditando(p);
    setCriandoSubDe(null);
    setSelTipo(p.servicoTipoServico || null);
    setSelCategoria(p.servicoCategoriaId || null);
    setForm({ ...PERGUNTA_VAZIA, ...p });
    setShowForm(true);
  };

  const handleDestinoChange = (destino) => {
    const info = DESTINOS_FIXOS[destino];
    setSelTipo(null); setSelCategoria(null);
    setForm(p => ({
      ...p,
      destino,
      tipo: info?.tipo || null,
      setor: info?.setor || null,
      servicoId: null, servicoNome: '', servicoCategoriaId: null, servicoCategoriaNome: '', servicoTipoServico: null,
      // Se o destino já tem valores fixos, pré-popula as opções com o label padrão
      opcoes: info?.valoresFixos ? info.valoresFixos.map(v => ({ valor: v.valor, label: v.labelPadrao })) : (info?.tipo === 'sim_nao' ? [{ valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }] : []),
    }));
  };

  // Seleção do sub-serviço no seletor de 3 colunas
  const selecionarServicoEspecifico = (sub, categoria) => {
    setForm(p => ({
      ...p,
      servicoId: sub.id, servicoNome: sub.name,
      servicoCategoriaId: categoria.id, servicoCategoriaNome: categoria.name,
      servicoTipoServico: selTipo,
    }));
  };

  const categoriasDoTipoSel = selTipo ? catalogoServicos.filter(s => !s.parentId && s.tipo === selTipo && s.active !== false) : [];
  const subsDaCategoriaSel  = selCategoria ? catalogoServicos.filter(s => s.parentId === selCategoria && s.active !== false) : [];
  // Perguntas "soltas" (destino genérico) do tipo Sim/Não ou Múltipla Escolha
  // — essas não têm um destino fixo pra identificar, então aparecem pelo
  // próprio texto no seletor de condição ("Verificar resposta de").
  const perguntasGenericasCheaveis = perguntas.filter(p => p.destino === 'generico' && (p.tipo === 'sim_nao' || p.tipo === 'multipla_escolha') && p.id !== editando?.id);

  const setOpcaoLabel = (idx, label) => {
    setForm(p => ({ ...p, opcoes: p.opcoes.map((o, i) => i === idx ? { ...o, label } : o) }));
  };

  const addOpcaoLivre = () => {
    setForm(p => ({ ...p, opcoes: [...p.opcoes, { valor: `op_${Date.now()}`, label: '' }] }));
  };

  const removerOpcaoLivre = (idx) => {
    setForm(p => ({ ...p, opcoes: p.opcoes.filter((_, i) => i !== idx) }));
  };

  const salvar = async () => {
    if (!form.texto.trim()) { alert('Preencha o texto da pergunta.'); return; }
    if (!form.destino) { alert('Escolha um destino para a resposta.'); return; }
    if (form.condicaoExibicao && (!form.condicaoExibicao.verificarDestino || !form.condicaoExibicao.contemTexto.trim())) {
      alert('Preencha os dois campos da condição (qual resposta verificar e qual texto procurar).');
      return;
    }
    if (form.tipo === 'catalogo_especifico' && !form.servicoId) {
      alert('Escolha o serviço específico (Área > Categoria > Sub-Serviço) que essa pergunta vai oferecer.');
      return;
    }
    const precisaOpcoes = form.tipo === 'multipla_escolha' || form.tipo === 'sim_nao';
    if (precisaOpcoes && form.opcoes.filter(o => o.label.trim()).length < 2) {
      alert('Adicione pelo menos 2 opções com texto preenchido.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        texto: form.texto.trim(),
        subtitulo: (form.subtitulo || '').trim(),
        destino: form.destino,
        tipo: form.tipo,
        setor: form.setor || null,
        opcoes: precisaOpcoes ? form.opcoes.filter(o => o.label.trim()) : [],
        quemResponde: form.quemResponde,
        ativo: form.ativo,
        perguntaPaiId: form.perguntaPaiId || null,
        condicaoRespostaPai: form.condicaoRespostaPai || null,
        condicaoExibicao: form.condicaoExibicao ? { verificarDestino: form.condicaoExibicao.verificarDestino, contemTexto: form.condicaoExibicao.contemTexto.trim() } : null,
        servicoId: form.tipo === 'catalogo_especifico' ? form.servicoId : null,
        servicoNome: form.tipo === 'catalogo_especifico' ? form.servicoNome : '',
        servicoCategoriaId: form.tipo === 'catalogo_especifico' ? form.servicoCategoriaId : null,
        servicoCategoriaNome: form.tipo === 'catalogo_especifico' ? form.servicoCategoriaNome : '',
        servicoTipoServico: form.tipo === 'catalogo_especifico' ? form.servicoTipoServico : null,
        mostrarNoBriefingStand: form.destino === 'generico' && (form.tipo === 'sim_nao' || form.tipo === 'multipla_escolha' || form.tipo === 'upload' || form.tipo === 'numero' || form.tipo === 'texto_livre' || form.tipo === 'texto_longo') ? !!form.mostrarNoBriefingStand : false,
        ordem: form.ordem ?? Date.now(),
        updatedAt: serverTimestamp(),
      };
      if (editando) {
        await updateDoc(doc(db, 'perguntas', editando.id), data);
      } else {
        await addDoc(collection(db, 'perguntas'), { ...data, createdAt: serverTimestamp() });
      }
      await carregar();
      setShowForm(false);
    } catch (e) { console.error(e); alert('Erro ao salvar pergunta.'); }
    finally { setSaving(false); }
  };

  const excluir = async (p) => {
    const temFilhas = filhasDe(p.id).length > 0;
    const msg = temFilhas
      ? `Excluir "${p.texto}"? Isso também vai excluir ${filhasDe(p.id).length} sub-pergunta(s) vinculada(s).`
      : `Excluir "${p.texto}"?`;
    if (!window.confirm(msg)) return;
    try {
      // Exclui recursivamente as sub-perguntas também
      const excluirComFilhas = async (id) => {
        const filhas = perguntas.filter(x => x.perguntaPaiId === id);
        for (const f of filhas) await excluirComFilhas(f.id);
        await deleteDoc(doc(db, 'perguntas', id));
      };
      await excluirComFilhas(p.id);
      await carregar();
    } catch (e) { console.error(e); alert('Erro ao excluir.'); }
  };

  const criarRaizSeNaoExiste = async () => {
    if (perguntaRaiz) return;
    await addDoc(collection(db, 'perguntas'), {
      texto: 'Qual o tipo de evento?',
      subtitulo: '',
      destino: 'raiz.tipoEvento',
      tipo: 'roteador',
      setor: null,
      opcoes: [],
      quemResponde: 'todos',
      ativo: true,
      perguntaPaiId: null,
      condicaoRespostaPai: null,
      ordem: 0,
      createdAt: serverTimestamp(),
    });
    await carregar();
  };

  // ── Renderiza uma pergunta + suas sub-perguntas recursivamente ────────────
  const renderPergunta = (p, nivel, irmas) => {
    const filhas = filhasDe(p.id);
    const info = DESTINOS_FIXOS[p.destino];
    const temOpcoesParaSub = p.tipo === 'multipla_escolha' || p.tipo === 'sim_nao';
    const expandido = expandidas[p.id] !== false; // default expandido
    const irmasOrdenadas = [...irmas].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const idxIrma = irmasOrdenadas.findIndex(x => x.id === p.id);

    return (
      <div key={p.id} style={{ marginLeft: nivel * 24 }}>
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, opacity: p.ativo === false ? 0.5 : 1 }}>
          {filhas.length > 0 && (
            <button onClick={() => setExpandidas(e => ({ ...e, [p.id]: !expandido }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8', width: 16 }}>
              {expandido ? '▾' : '▸'}
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <button onClick={() => moverIrma(p, irmas, -1)} disabled={idxIrma === 0} style={{ background: 'none', border: 'none', cursor: idxIrma === 0 ? 'default' : 'pointer', color: idxIrma === 0 ? '#e2e8f0' : '#64748b', fontSize: 11, lineHeight: 1, padding: 0 }}>▲</button>
            <button onClick={() => moverIrma(p, irmas, 1)} disabled={idxIrma === irmasOrdenadas.length - 1} style={{ background: 'none', border: 'none', cursor: idxIrma === irmasOrdenadas.length - 1 ? 'default' : 'pointer', color: idxIrma === irmasOrdenadas.length - 1 ? '#e2e8f0' : '#64748b', fontSize: 11, lineHeight: 1, padding: 0 }}>▼</button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.texto}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: '#f1f5f9', color: '#64748b' }}>{TIPOS_LABEL[p.tipo] || p.tipo}</span>
              {p.quemResponde !== 'todos' && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'rgba(102,126,234,0.1)', color: '#667eea' }}>
                  {QUEM_RESPONDE_OPCOES.find(q => q.valor === p.quemResponde)?.label}
                </span>
              )}
              {p.ativo === false && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>INATIVA</span>}
              {p.condicaoExibicao && (() => {
                const vd = p.condicaoExibicao.verificarDestino;
                const labelVerificado = vd?.startsWith('pergunta:')
                  ? (perguntas.find(pp => pp.id === vd.replace('pergunta:', ''))?.texto || 'pergunta removida')
                  : (DESTINOS_FIXOS[vd]?.label || vd);
                return (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'rgba(102,126,234,0.1)', color: '#667eea' }} title={`Só aparece se "${labelVerificado}" contiver "${p.condicaoExibicao.contemTexto}"`}>
                    ⚡ CONDICIONAL
                  </span>
                );
              })()}
              {p.mostrarNoBriefingStand && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'rgba(0,229,196,0.1)', color: '#00b894' }} title="A resposta aparece no briefing, na seção Stand">
                  📋 NO BRIEFING (STAND)
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {info?.label || p.destino}
              {p.tipo === 'catalogo_especifico' && p.servicoNome && (
                <span> — {TIPOS_AREA.find(t => t.id === p.servicoTipoServico)?.label} › {p.servicoCategoriaNome} › <strong>{p.servicoNome}</strong></span>
              )}
            </div>
          </div>
          {temOpcoesParaSub && (
            <div style={{ display: 'flex', gap: 4 }}>
              {p.opcoes.map(o => (
                <button key={o.valor} onClick={() => abrirNovaSub(p, o.valor)} title={`+ sub-pergunta se responder "${o.label}"`}
                  style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px dashed rgba(102,126,234,0.4)', background: 'none', color: '#667eea', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  + se "{o.label}"
                </button>
              ))}
            </div>
          )}
          <button onClick={() => abrirEditar(p)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>Editar</button>
          <button onClick={() => excluir(p)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>Excluir</button>
        </div>
        {expandido && filhas.sort((a, b) => (a.ordem||0)-(b.ordem||0)).map(f => renderPergunta(f, nivel + 1, filhas))}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Banco de Perguntas</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Perguntas reutilizáveis pro chat do cliente — monte os Tipos de Evento com elas depois</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportarPerguntas} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #cbd5e1', background: 'none', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            ⬇ Exportar
          </button>
          <button onClick={abrirNovaCondicional} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px dashed #667eea', background: 'none', color: '#667eea', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            + Pergunta Condicional
          </button>
          <button onClick={() => abrirNova()} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            + Nova Pergunta
          </button>
        </div>
      </div>

      {/* Pergunta raiz — bloco especial, sempre no topo */}
      <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: 'rgba(102,126,234,0.05)', border: '1px solid rgba(102,126,234,0.2)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#667eea', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Pergunta Raiz (sempre a primeira — decide o Tipo de Evento)</div>
        {perguntaRaiz ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>{perguntaRaiz.texto}</span>
            <button onClick={() => abrirEditar(perguntaRaiz)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>Editar texto</button>
          </div>
        ) : (
          <button onClick={criarRaizSeNaoExiste} style={{ padding: '8px 16px', borderRadius: 8, border: '1px dashed #667eea', background: 'none', color: '#667eea', fontSize: 12, cursor: 'pointer' }}>
            + Criar pergunta raiz padrão ("Qual o tipo de evento?")
          </button>
        )}
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>As opções de resposta dela são os próprios Tipos de Evento — configure isso na tela "Tipos de Evento".</div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : perguntasTopo.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❓</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhuma pergunta cadastrada ainda</div>
        </div>
      ) : (
        <div>{perguntasTopo.map(p => renderPergunta(p, 0, perguntasTopo))}</div>
      )}

      {/* Modal criar/editar */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                {editando ? 'Editar Pergunta' : criandoSubDe ? `Sub-pergunta de "${criandoSubDe.pai.texto}"` : 'Nova Pergunta'}
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {criandoSubDe && (
                <div style={{ fontSize: 12, color: '#667eea', background: 'rgba(102,126,234,0.06)', padding: '8px 12px', borderRadius: 8 }}>
                  Só aparece se a resposta de "{criandoSubDe.pai.texto}" for <strong>{criandoSubDe.pai.opcoes.find(o=>o.valor===criandoSubDe.valorCondicao)?.label}</strong>
                </div>
              )}

              {form.condicaoExibicao && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(102,126,234,0.05)', border: '1px dashed rgba(102,126,234,0.4)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#667eea', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pergunta Condicional</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Essa pergunta só entra no fluxo se, em algum momento antes dela, o cliente tiver escolhido algo que bate com a condição abaixo. Se não bater, ela é pulada — o fluxo segue normal.
                  </div>
                  <div>
                    <label style={lbl}>Verificar resposta de</label>
                    <select value={form.condicaoExibicao.verificarDestino} onChange={e => setCondicao('verificarDestino', e.target.value)} style={{ ...inp, background: 'white' }}>
                      <option value="">Selecione...</option>
                      <optgroup label="Catálogos">
                        {DESTINOS_CHECAVEIS.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </optgroup>
                      {perguntasGenericasCheaveis.length > 0 && (
                        <optgroup label="Perguntas Sim/Não e Múltipla Escolha (avulsas)">
                          {perguntasGenericasCheaveis.map(p => <option key={p.id} value={`pergunta:${p.id}`}>{p.texto}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Mostrar se a resposta contiver o texto</label>
                    <input value={form.condicaoExibicao.contemTexto} onChange={e => setCondicao('contemTexto', e.target.value)} style={inp} placeholder='Ex: "recepcion" (não precisa ser a palavra exata, nem maiúscula/minúscula)' />
                  </div>
                </div>
              )}

              <div>
                <label style={lbl}>Texto da pergunta *</label>
                <input value={form.texto} onChange={e => setF('texto', e.target.value)} style={inp} placeholder="Ex: Qual o tamanho da área do stand?" />
              </div>

              <div>
                <label style={lbl}>Subtítulo / texto de apoio (opcional)</label>
                <input value={form.subtitulo} onChange={e => setF('subtitulo', e.target.value)} style={inp} placeholder="Ex: em metros quadrados" />
              </div>

              <div>
                <label style={lbl}>Destino da resposta *</label>
                <select value={form.destino} onChange={e => handleDestinoChange(e.target.value)} style={{ ...inp, background: 'white' }} disabled={!!editando}>
                  <option value="">Selecione...</option>
                  {Object.entries(
                    Object.entries(DESTINOS_FIXOS).reduce((acc, [k, v]) => {
                      (acc[v.grupo] = acc[v.grupo] || []).push([k, v]);
                      return acc;
                    }, {})
                  ).map(([grupo, itens]) => (
                    <optgroup key={grupo} label={grupo}>
                      {itens.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                {editando && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Destino não pode ser trocado depois de criada — exclua e crie outra se precisar mudar.</div>}
              </div>

              {form.destino && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f8faff', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Tipo desta pergunta: </span>
                  <strong style={{ fontSize: 12, color: '#1e293b' }}>{TIPOS_LABEL[form.tipo] || (form.tipo === null ? 'livre — escolha abaixo' : form.tipo)}</strong>
                  {destinoTravado && <span style={{ fontSize: 10, color: '#94a3b8' }}> (travado por este destino)</span>}
                </div>
              )}

              {/* Se destino genérico, deixa escolher o tipo livremente */}
              {form.destino === 'generico' && (
                <div>
                  <label style={lbl}>Tipo da pergunta</label>
                  <select value={form.tipo || ''} onChange={e => {
                    const novoTipo = e.target.value;
                    setForm(p => ({
                      ...p,
                      tipo: novoTipo,
                      opcoes: novoTipo === 'sim_nao' ? [{ valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }] : (novoTipo === 'multipla_escolha' ? p.opcoes : []),
                    }));
                  }} style={{ ...inp, background: 'white' }}>
                    <option value="">Selecione...</option>
                    {Object.entries(TIPOS_LABEL).filter(([k]) => !['roteador','catalogo','catalogo_especifico','catalogo_modelos'].includes(k)).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  {(form.tipo === 'sim_nao' || form.tipo === 'multipla_escolha' || form.tipo === 'upload' || form.tipo === 'numero' || form.tipo === 'texto_livre' || form.tipo === 'texto_longo') && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!form.mostrarNoBriefingStand} onChange={e => setForm(p => ({ ...p, mostrarNoBriefingStand: e.target.checked }))} />
                      Mostrar a resposta no briefing, na seção Stand
                    </label>
                  )}
                </div>
              )}

              {/* Seletor de Serviço Específico — Área > Categoria > Sub-Serviço,
                  mesmo padrão de FornecedorServicos.js. Troca a "categoria inteira"
                  por um serviço exato (ex: "Roupa Recepcionista" dentro de
                  Operacao > Vestuário), pra perguntas objetivas. */}
              {form.tipo === 'catalogo_especifico' && (
                <div>
                  <label style={lbl}>Serviço específico *</label>
                  {form.servicoId && (
                    <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(102,126,234,0.08)', border: '1px solid rgba(102,126,234,0.25)', fontSize: 12, color: '#1e293b' }}>
                      <strong>{form.servicoNome}</strong>
                      <span style={{ color: '#64748b' }}> — {TIPOS_AREA.find(t => t.id === form.servicoTipoServico)?.label} › {form.servicoCategoriaNome}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', height: 220 }}>
                    <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', padding: '4px 8px' }}>Área</div>
                      {TIPOS_AREA.map(t => (
                        <div key={t.id} onClick={() => { setSelTipo(t.id); setSelCategoria(null); }}
                          style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginBottom: 2, background: selTipo === t.id ? 'rgba(102,126,234,0.1)' : 'none', color: selTipo === t.id ? '#667eea' : '#475569', fontWeight: selTipo === t.id ? 600 : 400 }}>
                          {t.label}
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', padding: '4px 8px' }}>Categoria</div>
                      {!selTipo ? (
                        <div style={{ fontSize: 11, color: '#cbd5e1', padding: '6px 10px' }}>Selecione uma área</div>
                      ) : categoriasDoTipoSel.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#cbd5e1', padding: '6px 10px' }}>Nenhuma categoria</div>
                      ) : categoriasDoTipoSel.map(cat => (
                        <div key={cat.id} onClick={() => setSelCategoria(cat.id)}
                          style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginBottom: 2, background: selCategoria === cat.id ? 'rgba(102,126,234,0.1)' : 'none', color: selCategoria === cat.id ? '#667eea' : '#475569', fontWeight: selCategoria === cat.id ? 600 : 400 }}>
                          {cat.name}
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', padding: '4px 8px' }}>Sub-Serviço</div>
                      {!selCategoria ? (
                        <div style={{ fontSize: 11, color: '#cbd5e1', padding: '6px 10px' }}>Selecione uma categoria</div>
                      ) : subsDaCategoriaSel.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#cbd5e1', padding: '6px 10px' }}>Nenhum sub-serviço</div>
                      ) : subsDaCategoriaSel.map(sub => {
                        const categoria = catalogoServicos.find(c => c.id === selCategoria);
                        return (
                          <div key={sub.id} onClick={() => selecionarServicoEspecifico(sub, categoria)}
                            style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginBottom: 2, background: form.servicoId === sub.id ? 'rgba(102,126,234,0.15)' : 'none', color: form.servicoId === sub.id ? '#667eea' : '#475569', fontWeight: form.servicoId === sub.id ? 600 : 400 }}>
                            {sub.name}{form.servicoId === sub.id && ' ✓'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Opções — só pra multipla_escolha / sim_nao */}
              {(form.tipo === 'multipla_escolha' || form.tipo === 'sim_nao') && (
                <div>
                  <label style={lbl}>Opções de resposta</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form.opcoes.map((o, i) => (
                      <div key={o.valor} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input value={o.label} onChange={e => setOpcaoLabel(i, e.target.value)} style={{ ...inp, flex: 1 }} placeholder="Texto do botão" />
                        {destinoInfo?.valoresFixos ? (
                          <span style={{ fontSize: 10, color: '#94a3b8', width: 90 }}>({o.valor})</span>
                        ) : (
                          <button onClick={() => removerOpcaoLivre(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
                        )}
                      </div>
                    ))}
                    {!destinoInfo?.valoresFixos && form.destino !== 'generico' && form.tipo === 'sim_nao' ? null : !destinoInfo?.valoresFixos && (
                      <button onClick={addOpcaoLivre} style={{ padding: '7px', borderRadius: 8, border: '1.5px dashed #cbd5e1', background: 'none', color: '#667eea', fontSize: 12, cursor: 'pointer' }}>+ Adicionar opção</button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label style={lbl}>Quem responde essa pergunta?</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {QUEM_RESPONDE_OPCOES.map(q => (
                    <button key={q.valor} onClick={() => setF('quemResponde', q.valor)}
                      style={{ padding: '9px', borderRadius: 8, border: `1.5px solid ${form.quemResponde === q.valor ? '#667eea' : '#e2e8f0'}`, background: form.quemResponde === q.valor ? 'rgba(102,126,234,0.06)' : 'white', color: form.quemResponde === q.valor ? '#667eea' : '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="pergunta-ativa" checked={form.ativo} onChange={e => setF('ativo', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#667eea' }} />
                <label htmlFor="pergunta-ativa" style={{ fontSize: 13, color: '#475569', cursor: 'pointer' }}>Pergunta ativa</label>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvar} disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar pergunta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
