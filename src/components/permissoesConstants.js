// Recursos (telas) por tipo de conta — base da matriz de permissões.
export const RECURSOS_POR_TIPO = {
  realize: [
    { id: 'projetos',                 label: 'Projetos / Kanban' },
    { id: 'financeiro',               label: 'Financeiro' },
    { id: 'cadastros',                label: 'Cadastros (usuários/cargos)' },
    { id: 'catalogo_servicos',        label: 'Catálogo de Serviços' },
    { id: 'fornecedores_homologacao', label: 'Fornecedores (homologação)' },
    { id: 'empresas_tenants',         label: 'Empresas / Tenants' },
    { id: 'chat_config',              label: 'Chat (Perguntas/Tipos de Evento)' },
    { id: 'script_ia',                label: 'Script da IA' },
  ],
  cliente: [
    { id: 'meus_eventos', label: 'Meus Eventos (Workspace)' },
    { id: 'historico',    label: 'Histórico' },
    { id: 'financeiro',   label: 'Financeiro (verba/parcelas)' },
    { id: 'agenda',       label: 'Agenda' },
    { id: 'franqueados',  label: 'Franqueados (só na empresa-mãe)' },
    { id: 'verbas',       label: 'Verbas (só na empresa-mãe)' },
  ],
  fornecedor: [
    { id: 'meus_jobs',     label: 'Meus Jobs / Propostas' },
    { id: 'meus_servicos', label: 'Meus Serviços' },
    { id: 'historico',     label: 'Histórico' },
    { id: 'financeiro',    label: 'Financeiro (repasses)' },
    { id: 'colaboradores', label: 'Colaboradores' },
  ],
};

export const TIPOS_CONTA = [
  { id: 'realize',    label: 'Realize (equipe interna)' },
  { id: 'cliente',    label: 'Cliente (empresa-mãe / franqueado)' },
  { id: 'fornecedor', label: 'Fornecedor' },
];

export const NIVEIS = [
  { valor: 1, label: '1 — Diretor (mais alto)' },
  { valor: 2, label: '2 — Gerente' },
  { valor: 3, label: '3 — Coordenador' },
  { valor: 4, label: '4 — Operacional' },
  { valor: 5, label: '5 — Visualizador (mais baixo)' },
];

export const ACOES = [
  { id: 'V', label: 'Ver' },
  { id: 'C', label: 'Criar' },
  { id: 'E', label: 'Editar' },
  { id: 'X', label: 'Excluir' },
  { id: 'A', label: 'Aprovar' },
];
