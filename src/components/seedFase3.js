import { setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─────────────────────────────────────────────────────────────────────────────
// Recria no Firestore, com precisão, a árvore de perguntas que já existe hoje
// (em código) no ClienteChat.js — pra Fase 3 do projeto "Chat sem IA".
// Usa IDs fixos (setDoc, não addDoc) — rodar mais de uma vez apenas
// sobrescreve com os mesmos dados, não duplica nada.
//
// Regra de sequência (usada na Fase 4, mas documentada aqui): entre
// irmãos (mesma perguntaPaiId), mostrar em ordem crescente de "ordem"
// cada um cujo condicaoRespostaPai seja null (sempre) OU bata com a
// resposta dada à pergunta-mãe.
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_EVENTO_PADRAO = [
  { id: 'tipo_feira',       nome: 'Feira / Exposição' },
  { id: 'tipo_congresso',   nome: 'Congresso / Conferência' },
  { id: 'tipo_lancamento',  nome: 'Lançamento de Produto' },
  { id: 'tipo_corporativo', nome: 'Evento Corporativo' },
  { id: 'tipo_show',        nome: 'Show / Entretenimento' },
  { id: 'tipo_outro',       nome: 'Outro' },
];

// Ordem de topo — hoje é idêntica pros 6 tipos (o sistema atual não
// diferencia fluxo por tipo de evento ainda).
const ORDEM_TOPO = [
  'stand_pergunta', 'evento_empresa', 'evento_nome', 'evento_data_inicio',
  'evento_data_fim', 'evento_horario', 'evento_local', 'evento_visitantes',
  'produtor_pergunta', 'estrutura_pergunta', 'equipe_pergunta',
  'gastro_pergunta', 'servicos_pergunta', 'info_extra', 'pagamento',
];

// id : { texto, subtitulo, tipo, destino, setor, opcoes, quemResponde, perguntaPaiId, condicaoRespostaPai, ordem }
const PERGUNTAS = {
  raiz: {
    texto: 'Qual o tipo de evento?', tipo: 'roteador', destino: 'raiz.tipoEvento',
    opcoes: TIPOS_EVENTO_PADRAO.map(t => ({ valor: t.id, label: t.nome })),
    quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 0,
  },

  stand_pergunta: {
    texto: 'Seu evento precisa de Stand?', tipo: 'sim_nao', destino: 'stand.temStand',
    opcoes: [{ valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }],
    quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 0,
  },
  stand_tipo: {
    texto: 'Qual o tipo de Stand?', tipo: 'multipla_escolha', destino: 'stand.tipoEstande',
    opcoes: [
      { valor: 'modular', label: 'Modular — pronto e padronizado' },
      { valor: 'personalizado', label: 'Personalizado — exclusivo, criado do zero' },
    ],
    quemResponde: 'todos', perguntaPaiId: 'stand_pergunta', condicaoRespostaPai: 'sim', ordem: 0,
  },
  stand_modelos: {
    texto: 'Escolha o modelo do seu Stand:', tipo: 'catalogo_modelos', destino: 'stand.modeloEspecial',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'stand_tipo', condicaoRespostaPai: 'modular', ordem: 0,
  },
  stand_personalizado_sabe: {
    texto: 'Você já sabe como gostaria do seu stand?', tipo: 'sim_nao', destino: 'generico',
    opcoes: [{ valor: 'sim', label: 'Sim, já tenho ideia' }, { valor: 'nao', label: 'Não, preciso de ajuda' }],
    quemResponde: 'todos', perguntaPaiId: 'stand_tipo', condicaoRespostaPai: 'personalizado', ordem: 1,
  },
  stand_personalizado_descricao: {
    texto: 'Descreva como você imagina o seu stand:', tipo: 'texto_longo', destino: 'stand.standDescricao',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'stand_personalizado_sabe', condicaoRespostaPai: 'sim', ordem: 0,
  },
  stand_personalizado_upload: {
    texto: 'Quer enviar imagens de referência?', subtitulo: 'Opcional', tipo: 'upload', destino: 'stand.standImagensUrls',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'stand_personalizado_sabe', condicaoRespostaPai: 'sim', ordem: 1,
  },
  stand_area: {
    texto: 'Qual o tamanho da área do stand em m²?', tipo: 'numero', destino: 'stand.areaM2',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'stand_personalizado_sabe', condicaoRespostaPai: null, ordem: 2,
  },
  stand_teto: {
    texto: 'Qual a altura do teto no local do evento?', tipo: 'texto_livre', destino: 'stand.alturaTeto',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'stand_tipo', condicaoRespostaPai: null, ordem: 2,
  },
  stand_montagem: {
    texto: 'Quantos dias antes o local estará disponível para montagem?', tipo: 'numero', destino: 'stand.diasMontagem',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'stand_teto', condicaoRespostaPai: null, ordem: 0,
  },
  stand_restricao: {
    texto: 'Tem alguma restrição de acesso no local?', tipo: 'sim_nao', destino: 'generico',
    opcoes: [{ valor: 'sim', label: 'Sim, tem restrição' }, { valor: 'nao', label: 'Não, sem restrições' }],
    quemResponde: 'todos', perguntaPaiId: 'stand_montagem', condicaoRespostaPai: null, ordem: 0,
  },
  stand_restricao_desc: {
    texto: 'Descreva as restrições:', tipo: 'texto_livre', destino: 'stand.restricoes',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'stand_restricao', condicaoRespostaPai: 'sim', ordem: 0,
  },
  stand_identidade: {
    texto: 'Já tem identidade visual definida?', tipo: 'sim_nao', destino: 'stand.identidadeVisual',
    opcoes: [{ valor: 'sim', label: 'Sim, já tenho' }, { valor: 'nao', label: 'Não ainda' }],
    quemResponde: 'todos', perguntaPaiId: 'stand_restricao', condicaoRespostaPai: null, ordem: 1,
  },
  stand_identidade_upload: {
    texto: 'Envie os arquivos da identidade visual:', tipo: 'upload', destino: 'stand.identidadeImagensUrls',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'stand_identidade', condicaoRespostaPai: 'sim', ordem: 0,
  },

  evento_empresa: {
    texto: 'Qual o nome da empresa organizadora?', tipo: 'texto_livre', destino: 'evento.nomeEmpresa',
    opcoes: [], quemResponde: 'cliente_comum', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 1,
  },
  evento_nome: {
    texto: 'Qual o nome do evento?', tipo: 'texto_livre', destino: 'evento.nomeEvento',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 2,
  },
  evento_data_inicio: {
    texto: 'Qual a data de início do evento?', tipo: 'data', destino: 'evento.dataInicio',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 3,
  },
  evento_data_fim: {
    texto: 'Qual a data de fim do evento?', tipo: 'data', destino: 'evento.dataFim',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 4,
  },
  evento_horario: {
    texto: 'Qual o horário do evento?', tipo: 'horario', destino: 'evento.horario',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 5,
  },
  evento_local: {
    texto: 'Qual o local e cidade do evento?', tipo: 'localizacao', destino: 'evento.local',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 6,
  },
  evento_visitantes: {
    texto: 'Quantos visitantes por dia são esperados?', tipo: 'numero', destino: 'evento.visitantesPorDia',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 7,
  },

  produtor_pergunta: {
    texto: 'Precisa de Produtor?', tipo: 'sim_nao', destino: 'produtor.temProdutor',
    opcoes: [{ valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }],
    quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 8,
  },

  estrutura_pergunta: {
    texto: 'Vai precisar de Estrutura?', subtitulo: 'stands especiais, mobiliário, tecnologia...', tipo: 'sim_nao', destino: 'generico',
    opcoes: [{ valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }],
    quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 9,
  },
  estrutura_catalogo: {
    texto: 'Selecione os serviços de Estrutura:', tipo: 'catalogo', destino: 'catalogo.estrutura', setor: 'estrutura',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'estrutura_pergunta', condicaoRespostaPai: 'sim', ordem: 0,
  },

  equipe_pergunta: {
    texto: 'Vai precisar de Equipe?', subtitulo: 'recepcionistas, seguranças, copeiras...', tipo: 'sim_nao', destino: 'generico',
    opcoes: [{ valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }],
    quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 10,
  },
  equipe_catalogo: {
    texto: 'Selecione os serviços de Equipe:', tipo: 'catalogo', destino: 'catalogo.equipe', setor: 'operacao',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'equipe_pergunta', condicaoRespostaPai: 'sim', ordem: 0,
  },

  gastro_pergunta: {
    texto: 'Vai precisar de alimentação ou bebidas?', tipo: 'sim_nao', destino: 'generico',
    opcoes: [{ valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }],
    quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 11,
  },
  gastro_catalogo: {
    texto: 'Selecione os serviços de Gastronomia:', tipo: 'catalogo', destino: 'catalogo.gastronomia', setor: 'gastronomia',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'gastro_pergunta', condicaoRespostaPai: 'sim', ordem: 0,
  },

  servicos_pergunta: {
    texto: 'Vai precisar de equipamentos ou atrações?', subtitulo: 'som, iluminação, fotografia...', tipo: 'sim_nao', destino: 'generico',
    opcoes: [{ valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }],
    quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 12,
  },
  servicos_catalogo: {
    texto: 'Selecione os equipamentos e atrações:', tipo: 'catalogo', destino: 'catalogo.entretenimento', setor: 'entretenimento',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: 'servicos_pergunta', condicaoRespostaPai: 'sim', ordem: 0,
  },

  info_extra: {
    texto: 'Falta alguma informação ou pedido especial?', tipo: 'texto_longo', destino: 'extra.infoExtra',
    opcoes: [], quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 13,
  },
  pagamento: {
    texto: 'Como prefere a forma de pagamento?', tipo: 'multipla_escolha', destino: 'pagamento.formaPagamento',
    opcoes: [
      { valor: '50_50', label: '50% na entrada + 50% no final do evento' },
      { valor: '30_60_90', label: '30, 60 e 90 dias' },
      { valor: 'a_vista', label: 'À vista' },
    ],
    quemResponde: 'todos', perguntaPaiId: null, condicaoRespostaPai: null, ordem: 14,
  },
};

export async function popularFase3(onProgresso) {
  const total = Object.keys(PERGUNTAS).length + TIPOS_EVENTO_PADRAO.length;
  let feito = 0;

  for (const [id, dadosPergunta] of Object.entries(PERGUNTAS)) {
    await setDoc(doc(db, 'perguntas', id), {
      subtitulo: '', setor: null, ativo: true,
      ...dadosPergunta,
    });
    feito++;
    onProgresso?.(feito, total, `Pergunta: ${dadosPergunta.texto.slice(0, 40)}...`);
  }

  for (const t of TIPOS_EVENTO_PADRAO) {
    await setDoc(doc(db, 'tiposEvento', t.id), {
      nome: t.nome, ativo: true, perguntasIds: ORDEM_TOPO,
    });
    feito++;
    onProgresso?.(feito, total, `Tipo de evento: ${t.nome}`);
  }
}
