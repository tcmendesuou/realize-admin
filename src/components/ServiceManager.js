import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import ServicoEspecialManager from './ServicoEspecialManager';
import { db } from '../firebase/config';

const TIPOS = [
  { id: 'estrutura',      label: 'Estrutura',      color: '#0080FF', desc: 'Equipamentos, montagem, locacao — custo por diaria' },
  { id: 'operacao',       label: 'Operacao',        color: '#00E5C4', desc: 'Pessoas, servicos — custo por hora trabalhada' },
  { id: 'entretenimento', label: 'Entretenimento',  color: '#FFA726', desc: 'Artistas, midia, fotografia e atracoes' },
  { id: 'gastronomia',    label: 'Gastronomia',     color: '#66BB6A', desc: 'Alimentacao, buffet e servicos gastronômicos' },
];

// ── Seed Entretenimento e Gastronomia (nao apaga existentes) ──────────────────
const SEED_ENT_GASTRO = {
  entretenimento: [
    { name: 'Fotografia', description: 'Cobertura fotografica do evento', subs: [
      { name: 'Fotografo de Evento', description: 'Cobertura fotografica completa' },
      { name: 'Fotografo de Produto', description: 'Fotografia de produtos e estande' },
      { name: 'Ensaio / Retrato', description: 'Ensaios e retratos corporativos' },
    ]},
    { name: 'Filmagem / Video', description: 'Cobertura audiovisual e edicao', subs: [
      { name: 'Cinegrafista', description: 'Filmagem profissional do evento' },
      { name: 'Drone', description: 'Filmagem aerea com drone' },
      { name: 'Editor de Video', description: 'Edicao e pos-producao de video' },
      { name: 'Transmissao ao Vivo', description: 'Live streaming e transmissao online' },
    ]},
    { name: 'DJ / Musica', description: 'Discotecagem e selecao musical', subs: [
      { name: 'DJ', description: 'Discotecagem e selecao musical' },
      { name: 'Banda', description: 'Banda ao vivo para eventos' },
      { name: 'Musico Solo', description: 'Musico solo — piano, violao, saxofone etc' },
      { name: 'DJ + MC', description: 'Dupla DJ e mestre de cerimonias' },
    ]},
    { name: 'MC / Apresentador', description: 'Mestre de cerimonias e apresentacao', subs: [
      { name: 'MC de Evento', description: 'Mestre de cerimonias corporativo' },
      { name: 'Apresentador', description: 'Apresentador de palco e palestra' },
      { name: 'Interprete / Tradutor', description: 'Traducao simultanea e interpretacao' },
    ]},
    { name: 'Show / Atracao', description: 'Artistas e atracoes especiais', subs: [
      { name: 'Artista / Performer', description: 'Atracoes artisticas e performances' },
      { name: 'Magico / Ilusionista', description: 'Magica e ilusionismo para eventos' },
      { name: 'Humorista / Comediante', description: 'Stand-up e humor para eventos corporativos' },
      { name: 'Palestrante', description: 'Palestrante motivacional ou tecnico' },
    ]},
    { name: 'Photobooth / Interativo', description: 'Cabines de foto e experiencias interativas', subs: [
      { name: 'Photobooth', description: 'Cabine de fotos com impressao instantanea' },
      { name: 'Totem Digital', description: 'Totem interativo touch screen' },
      { name: 'Espelho Magico', description: 'Espelho interativo para fotos' },
      { name: 'Realidade Aumentada', description: 'Experiencias em realidade aumentada ou virtual' },
    ]},
  ],
  gastronomia: [
    { name: 'Buffet / Catering', description: 'Servico completo de alimentacao para eventos', subs: [
      { name: 'Buffet Completo', description: 'Servico de buffet com cardapio completo' },
      { name: 'Coffee Break', description: 'Coffee break para reunioes e eventos' },
      { name: 'Almoco / Jantar', description: 'Servico de almoco ou jantar formal' },
      { name: 'Finger Food', description: 'Aperitivos e finger food para coquetel' },
    ]},
    { name: 'Bar / Bebidas', description: 'Servico de bar e bebidas', subs: [
      { name: 'Open Bar', description: 'Servico de open bar completo' },
      { name: 'Chopeira / Cerveja', description: 'Locacao de chopeira e servico de cerveja' },
      { name: 'Sommelier', description: 'Sommelier e harmonizacao de vinhos' },
      { name: 'Bartender / Drinks', description: 'Bartender e drinks personalizados' },
      { name: 'Sucos / Mocktails', description: 'Sucos naturais e drinks sem alcool' },
    ]},
    { name: 'Confeitaria / Doceria', description: 'Bolos, doces e sobremesas', subs: [
      { name: 'Bolo Personalizado', description: 'Bolo decorado para o evento' },
      { name: 'Mesa de Doces', description: 'Mesa de doces e sobremesas' },
      { name: 'Bem-casado / Lembrancas', description: 'Bem-casados e lembrancinhas comestiveis' },
      { name: 'Chocolate / Fondue', description: 'Fondue de chocolate e sobremesas quentes' },
    ]},
    { name: 'Food Truck / Estacoes', description: 'Food trucks e estacoes gastronomicas', subs: [
      { name: 'Food Truck', description: 'Food truck para eventos externos' },
      { name: 'Estacao de Massas', description: 'Estacao ao vivo de massas e risotos' },
      { name: 'Estacao de Grelhados', description: 'Churrasco e grelhados ao vivo' },
      { name: 'Estacao de Crepe', description: 'Creperie ao vivo' },
    ]},
    { name: 'Degustacao / Premium', description: 'Experiencias gastronomicas premium', subs: [
      { name: 'Degustacao de Vinhos', description: 'Degustacao guiada de vinhos' },
      { name: 'Queijos e Frios', description: 'Mesa de queijos, frios e embutidos' },
      { name: 'Sushi / Japones', description: 'Estacao de sushi e culinaria japonesa' },
      { name: 'Chef a Domicilio', description: 'Chef exclusivo para o evento' },
    ]},
  ],
};

const SEED_PRICING_ENT_GASTRO = {
  // Entretenimento — custo/hora
  'Fotografo de Evento':    { custoHora: 150 },
  'Fotografo de Produto':   { custoHora: 180 },
  'Ensaio / Retrato':       { custoHora: 200 },
  'Cinegrafista':           { custoHora: 180 },
  'Drone':                  { custoHora: 250 },
  'Editor de Video':        { custoHora: 120 },
  'Transmissao ao Vivo':    { custoHora: 300 },
  'DJ':                     { custoHora: 200 },
  'Banda':                  { custoHora: 400 },
  'Musico Solo':            { custoHora: 200 },
  'DJ + MC':                { custoHora: 350 },
  'MC de Evento':           { custoHora: 300 },
  'Apresentador':           { custoHora: 350 },
  'Interprete / Tradutor':  { custoHora: 120 },
  'Artista / Performer':    { custoHora: 400 },
  'Magico / Ilusionista':   { custoHora: 350 },
  'Humorista / Comediante': { custoHora: 500 },
  'Palestrante':            { custoHora: 800 },
  'Photobooth':             { custoHora: 200 },
  'Totem Digital':          { custoHora: 150 },
  'Espelho Magico':         { custoHora: 250 },
  'Realidade Aumentada':    { custoHora: 400 },
  // Gastronomia — custo por pessoa (guardamos em custoHora por praticidade)
  'Buffet Completo':        { custoHora: 85  },
  'Coffee Break':           { custoHora: 35  },
  'Almoco / Jantar':        { custoHora: 120 },
  'Finger Food':            { custoHora: 45  },
  'Open Bar':               { custoHora: 65  },
  'Chopeira / Cerveja':     { custoHora: 40  },
  'Sommelier':              { custoHora: 250 },
  'Bartender / Drinks':     { custoHora: 55  },
  'Sucos / Mocktails':      { custoHora: 30  },
  'Bolo Personalizado':     { custoHora: 15  },
  'Mesa de Doces':          { custoHora: 25  },
  'Bem-casado / Lembrancas':{ custoHora: 8   },
  'Chocolate / Fondue':     { custoHora: 40  },
  'Food Truck':             { custoHora: 1200},
  'Estacao de Massas':      { custoHora: 350 },
  'Estacao de Grelhados':   { custoHora: 400 },
  'Estacao de Crepe':       { custoHora: 300 },
  'Degustacao de Vinhos':   { custoHora: 180 },
  'Queijos e Frios':        { custoHora: 60  },
  'Sushi / Japones':        { custoHora: 90  },
  'Chef a Domicilio':       { custoHora: 500 },
};

// ── Dados de seed ─────────────────────────────────────────────────────────────
const SEED_DATA = {
  estrutura: [
    { name: 'Montagem / Estande', description: 'Montagem e desmontagem de estandes e estruturas', subs: [
      { name: 'Estande Octanorm', description: 'Estrutura modular em octanorm' },
      { name: 'Estande Madeirado', description: 'Estrutura personalizada em MDF/madeira' },
      { name: 'Estande Misto', description: 'Combinacao de octanorm com madeirado' },
      { name: 'Backdrop / Painel', description: 'Painel de fundo para fotografias e apresentacoes' },
    ]},
    { name: 'Mobiliario / Locacao', description: 'Mesas, cadeiras, lounges e mobiliario em geral', subs: [
      { name: 'Cadeiras e Mesas', description: 'Cadeiras simples, mesas plásticas ou metálicas' },
      { name: 'Lounge / Sofa', description: 'Poltronas, sofas e mesas de centro' },
      { name: 'Balcao de Recepcao', description: 'Balcao para recepcao e atendimento' },
      { name: 'Mostruario / Display', description: 'Racks, gôndolas e displays para produtos' },
    ]},
    { name: 'Iluminacao', description: 'Iluminacao cenica, decorativa e arquitetural', subs: [
      { name: 'Iluminacao Cênica', description: 'Moving heads, refletores e iluminacao de palco' },
      { name: 'LED / Neon', description: 'Fitas de LED, letras luminosas e elementos decorativos' },
      { name: 'Iluminacao Arquitetural', description: 'Projetores e iluminacao de ambientacao' },
    ]},
    { name: 'Sonorizacao', description: 'Equipamentos de som, PA e microfones', subs: [
      { name: 'Sistema PA', description: 'Caixas de som, amplificadores e subwoofers' },
      { name: 'Microfones', description: 'Microfones com fio, sem fio e lapela' },
      { name: 'Mesa de Som', description: 'Mesa de mixagem e equipamentos de audio' },
    ]},
    { name: 'Tecnologia / AV', description: 'Teloes, projetores, paineis de LED e streaming', subs: [
      { name: 'Painel de LED', description: 'Painel LED indoor/outdoor para exibicao de conteudo' },
      { name: 'Projetor + Tela', description: 'Projetor e tela de projecao' },
      { name: 'TV / Monitor', description: 'Televisores e monitores para exposicao' },
      { name: 'Totem Digital', description: 'Totem interativo touch screen' },
    ]},
    { name: 'Tendas / Coberturas', description: 'Tendas, coberturas e estruturas metalicas', subs: [
      { name: 'Tenda Piramidal', description: 'Tenda piramidal para areas externas' },
      { name: 'Tenda Chapeu de Bruxa', description: 'Tenda chapeu de bruxa com calhas' },
      { name: 'Galpao / Estrutura Metalica', description: 'Estrutura metalica para grandes areas' },
    ]},
    { name: 'Climatizacao', description: 'Ar condicionado, ventiladores e climatizadores', subs: [
      { name: 'Ar Condicionado Split', description: 'Ar condicionado split para ambientes fechados' },
      { name: 'Climatizador Industrial', description: 'Climatizador evaporativo para areas grandes' },
      { name: 'Ventilador Industrial', description: 'Ventiladores de coluna ou pedestal' },
    ]},
    { name: 'Comunicacao Visual', description: 'Flyers, lonas, banners e sinalizacao', subs: [
      { name: 'Lona / Banner', description: 'Impressao em lona e banners' },
      { name: 'Adesivagem', description: 'Adesivos para vidros, paredes e pisos' },
      { name: 'Sinalizacao', description: 'Totens de sinalizacao e indicativos' },
      { name: 'Cenografia / Decoracao', description: 'Elementos decorativos e cenograficos' },
    ]},
    { name: 'Energia / Geradores', description: 'Geradores, nobreaks e infraestrutura eletrica', subs: [
      { name: 'Gerador', description: 'Gerador para eventos sem energia eletrica' },
      { name: 'Nobreak / UPS', description: 'Nobreak para equipamentos criticos' },
      { name: 'Quadro Eletrico', description: 'Infraestrutura eletrica temporaria' },
    ]},
  ],
  operacao: [
    { name: 'Recepcao / Hostess', description: 'Recepcionistas, hostess e promotoras', subs: [
      { name: 'Recepcionista', description: 'Recepcao e atendimento ao visitante' },
      { name: 'Hostess', description: 'Hostess para feiras e eventos corporativos' },
      { name: 'Promotora', description: 'Promotora de vendas e demonstracao de produtos' },
      { name: 'Interprete / Tradutor', description: 'Interprete e traducao simultanea' },
    ]},
    { name: 'Seguranca', description: 'Agentes de seguranca e controle de acesso', subs: [
      { name: 'Seguranca Patrimonial', description: 'Vigilante para seguranca do espaco' },
      { name: 'Controle de Acesso', description: 'Operador de credenciamento e acesso' },
      { name: 'Coordenador de Seguranca', description: 'Coordenacao da equipe de seguranca' },
    ]},
    { name: 'Limpeza / Conservacao', description: 'Limpeza e manutencao durante e apos o evento', subs: [
      { name: 'Auxiliar de Limpeza', description: 'Limpeza geral do espaco' },
      { name: 'Limpeza Pos-Evento', description: 'Limpeza completa ao final do evento' },
      { name: 'Jardineiro', description: 'Manutencao de areas verdes e decoracao' },
    ]},
    { name: 'Logistica / Carga', description: 'Carregadores, transporte e logistica', subs: [
      { name: 'Carregador', description: 'Carga e descarga de materiais' },
      { name: 'Motorista', description: 'Motorista para transporte de materiais e equipe' },
      { name: 'Operador de Empilhadeira', description: 'Operacao de empilhadeira para carga pesada' },
    ]},
    { name: 'Producao / Coordenacao', description: 'Producao executiva e coordenacao de evento', subs: [
      { name: 'Produtor Executivo', description: 'Coordenacao geral do evento' },
      { name: 'Assistente de Producao', description: 'Apoio operacional na producao' },
      { name: 'Runner', description: 'Apoio rapido e resolucao de demandas no evento' },
    ]},
    { name: 'Alimentacao / A&B', description: 'Servico de alimentacao e bebidas', subs: [
      { name: 'Garcom', description: 'Servico de mesa e atendimento' },
      { name: 'Bartender', description: 'Preparo e servico de drinks' },
      { name: 'Cozinheiro / Chef', description: 'Preparo de alimentos no local' },
      { name: 'Copeira', description: 'Servico de cafe, agua e apoio gastronomico' },
    ]},
    { name: 'Fotografia / Filmagem', description: 'Cobertura fotografica e audiovisual', subs: [
      { name: 'Fotografo', description: 'Cobertura fotografica do evento' },
      { name: 'Cinegrafista', description: 'Filmagem e cobertura audiovisual' },
      { name: 'Editor de Imagem', description: 'Edicao de fotos e videos pos-evento' },
      { name: 'Drone', description: 'Filmagem aerea com drone' },
    ]},
    { name: 'Saude / Primeiros Socorros', description: 'Equipe de saude e seguranca', subs: [
      { name: 'Enfermeiro', description: 'Atendimento de primeiros socorros' },
      { name: 'Socorrista / Paramédico', description: 'Atendimento pre-hospitalar' },
    ]},
    { name: 'Entretenimento / Show', description: 'Artistas, apresentadores e atracoes', subs: [
      { name: 'DJ', description: 'Discotecagem e selecao musical' },
      { name: 'MC / Apresentador', description: 'Mestre de cerimonias e conducao do evento' },
      { name: 'Musico / Banda', description: 'Musica ao vivo' },
    ]},
  ],
};

// Valores de mercado SP (referência base 2025)
const SEED_PRICING = {
  // Estrutura — custo/diaria
  'Estande Octanorm':       { custoDiaria: 180,  custoInstalacao: 400  },
  'Estande Madeirado':      { custoDiaria: 350,  custoInstalacao: 800  },
  'Estande Misto':          { custoDiaria: 280,  custoInstalacao: 600  },
  'Backdrop / Painel':      { custoDiaria: 120,  custoInstalacao: 200  },
  'Cadeiras e Mesas':       { custoDiaria: 8,    custoInstalacao: 0    },
  'Lounge / Sofa':          { custoDiaria: 180,  custoInstalacao: 0    },
  'Balcao de Recepcao':     { custoDiaria: 150,  custoInstalacao: 0    },
  'Mostruario / Display':   { custoDiaria: 60,   custoInstalacao: 0    },
  'Iluminacao Cenica':      { custoDiaria: 800,  custoInstalacao: 400  },
  'LED / Neon':             { custoDiaria: 250,  custoInstalacao: 150  },
  'Iluminacao Arquitetural':{ custoDiaria: 400,  custoInstalacao: 200  },
  'Sistema PA':             { custoDiaria: 600,  custoInstalacao: 300  },
  'Microfones':             { custoDiaria: 120,  custoInstalacao: 50   },
  'Mesa de Som':            { custoDiaria: 300,  custoInstalacao: 100  },
  'Painel de LED':          { custoDiaria: 1200, custoInstalacao: 600  },
  'Projetor + Tela':        { custoDiaria: 500,  custoInstalacao: 150  },
  'TV / Monitor':           { custoDiaria: 200,  custoInstalacao: 80   },
  'Totem Digital':          { custoDiaria: 350,  custoInstalacao: 100  },
  'Tenda Piramidal':        { custoDiaria: 400,  custoInstalacao: 300  },
  'Tenda Chapeu de Bruxa':  { custoDiaria: 600,  custoInstalacao: 400  },
  'Galpao / Estrutura Metalica': { custoDiaria: 1500, custoInstalacao: 1000 },
  'Ar Condicionado Split':  { custoDiaria: 350,  custoInstalacao: 200  },
  'Climatizador Industrial':{ custoDiaria: 250,  custoInstalacao: 0    },
  'Ventilador Industrial':  { custoDiaria: 80,   custoInstalacao: 0    },
  'Lona / Banner':          { custoDiaria: 0,    custoInstalacao: 0    },
  'Adesivagem':             { custoDiaria: 0,    custoInstalacao: 0    },
  'Sinalizacao':            { custoDiaria: 60,   custoInstalacao: 0    },
  'Cenografia / Decoracao': { custoDiaria: 500,  custoInstalacao: 300  },
  'Gerador':                { custoDiaria: 800,  custoInstalacao: 200  },
  'Nobreak / UPS':          { custoDiaria: 150,  custoInstalacao: 50   },
  'Quadro Eletrico':        { custoDiaria: 300,  custoInstalacao: 200  },
  // Operação — custo/hora
  'Recepcionista':          { custoHora: 28 },
  'Hostess':                { custoHora: 32 },
  'Promotora':              { custoHora: 30 },
  'Interprete / Tradutor':  { custoHora: 85 },
  'Seguranca Patrimonial':  { custoHora: 22 },
  'Controle de Acesso':     { custoHora: 20 },
  'Coordenador de Seguranca': { custoHora: 35 },
  'Auxiliar de Limpeza':    { custoHora: 18 },
  'Limpeza Pos-Evento':     { custoHora: 22 },
  'Jardineiro':             { custoHora: 25 },
  'Carregador':             { custoHora: 22 },
  'Motorista':              { custoHora: 30 },
  'Operador de Empilhadeira': { custoHora: 40 },
  'Produtor Executivo':     { custoHora: 120 },
  'Assistente de Producao': { custoHora: 45 },
  'Runner':                 { custoHora: 28 },
  'Garcom':                 { custoHora: 25 },
  'Bartender':              { custoHora: 35 },
  'Cozinheiro / Chef':      { custoHora: 55 },
  'Copeira':                { custoHora: 20 },
  'Fotografo':              { custoHora: 150 },
  'Cinegrafista':           { custoHora: 180 },
  'Editor de Imagem':       { custoHora: 120 },
  'Drone':                  { custoHora: 200 },
  'Enfermeiro':             { custoHora: 55 },
  'Socorrista / Paramédico':{ custoHora: 65 },
  'DJ':                     { custoHora: 200 },
  'MC / Apresentador':      { custoHora: 300 },
  'Musico / Banda':         { custoHora: 180 },
};

// ── Sub-serviço form ──────────────────────────────────────────────────────────
const APROVACOES_CONFIG = [
  { key: 'preAprovacao',        label: 'Pré-aprovação',          desc: 'Fornecedor executa a preparação e envia para aprovação do cliente. Se aprovado, o sistema gera a task de execução (ex: modelo, projeto, amostra)', cor: '#7BAFD4' },
  { key: 'aprovacaoExecucao',   label: 'Aprovação de Execução',  desc: 'Aprovação no dia do evento, quando o fornecedor entrega o serviço ao cliente (ex: estande montado, estrutura pronta)', cor: '#667eea' },
];


// ── Seletor de exclusividade por tenant ───────────────────────────────────────
function TenantSelector({ value = [], onChange }) {
  const [tenants, setTenants] = React.useState([]);
  React.useEffect(() => {
    import('../firebase/config').then(({ db }) => {
      import('firebase/firestore').then(({ collection, getDocs, query, where }) => {
        getDocs(query(collection(db, 'tenants'), where('ativo', '==', true)))
          .then(snap => setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
          .catch(console.error);
      });
    });
  }, []);

  const toggle = (id) => {
    const novo = value.includes(id) ? value.filter(x => x !== id) : [...value, id];
    onChange(novo);
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>Exclusividade por empresa</div>
      <div style={{ background: 'rgba(102,126,234,0.04)', border: '1px solid rgba(102,126,234,0.15)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>
          {value.length === 0 ? '✓ Visível para todos (sem restrição)' : `🔒 Exclusivo de ${value.length} empresa(s)`}
        </div>
        {tenants.length === 0 ? (
          <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Nenhuma empresa cadastrada ainda.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tenants.map(t => (
              <button key={t.id} onClick={() => toggle(t.id)} type="button"
                style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${value.includes(t.id) ? t.corPrimaria || '#667eea' : '#e2e8f0'}`, background: value.includes(t.id) ? `${t.corPrimaria || '#667eea'}18` : 'white', color: value.includes(t.id) ? t.corPrimaria || '#667eea' : '#64748b', fontSize: 11, fontWeight: value.includes(t.id) ? 700 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}>
                {value.includes(t.id) ? '✓' : '○'} {t.nome}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const UNIDADES = [
  { id: 'hora',    label: 'por hora' },
  { id: 'dia',     label: 'por dia' },
  { id: 'evento',  label: 'por evento' },
  { id: 'pessoa',  label: 'por pessoa' },
  { id: 'm2',      label: 'por m²' },
  { id: 'peca',    label: 'por peça' },
];

function SubServiceForm({ parentId, editData, onSave, onCancel }) {
  const [form, setForm] = useState(editData || {
    name: '', description: '', active: true,
    preAprovacao: false, aprovacaoExecucao: false,
    exclusiveTenants: [],
  });
  const [saving, setSaving] = useState(false);
  const [opcoes, setOpcoes]           = useState([]);
  const [loadingOpcoes, setLoadingOpcoes] = useState(false);
  const [novaOpcao, setNovaOpcao]     = useState({ nome: '', valor: '', unidade: 'hora' });
  const [savingOpcao, setSavingOpcao] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Carrega opções existentes ao editar
  useEffect(() => {
    if (!editData?.id) return;
    setLoadingOpcoes(true);
    getDocs(collection(db, 'services', editData.id, 'opcoes'))
      .then(snap => setOpcoes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setLoadingOpcoes(false));
  }, [editData?.id]);

  const handleAddOpcao = async () => {
    if (!novaOpcao.nome.trim() || !novaOpcao.valor) { alert('Preencha nome e valor da opcao'); return; }
    if (!editData?.id) { alert('Salve o sub-servico antes de adicionar opcoes'); return; }
    setSavingOpcao(true);
    try {
      const ref = await addDoc(collection(db, 'services', editData.id, 'opcoes'), {
        nome: novaOpcao.nome.trim(),
        valor: parseFloat(novaOpcao.valor),
        unidade: novaOpcao.unidade,
        ativo: true,
        createdAt: new Date(),
      });
      setOpcoes(p => [...p, { id: ref.id, nome: novaOpcao.nome.trim(), valor: parseFloat(novaOpcao.valor), unidade: novaOpcao.unidade, ativo: true }]);
      setNovaOpcao({ nome: '', valor: '', unidade: 'hora' });
    } catch (e) { console.error(e); alert('Erro ao salvar opcao.'); }
    finally { setSavingOpcao(false); }
  };

  const handleToggleOpcao = async (op) => {
    await updateDoc(doc(db, 'services', editData.id, 'opcoes', op.id), { ativo: !op.ativo });
    setOpcoes(p => p.map(o => o.id === op.id ? { ...o, ativo: !o.ativo } : o));
  };

  const handleDeleteOpcao = async (op) => {
    if (!window.confirm(`Excluir opcao "${op.nome}"?`)) return;
    await deleteDoc(doc(db, 'services', editData.id, 'opcoes', op.id));
    setOpcoes(p => p.filter(o => o.id !== op.id));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Nome obrigatorio'); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name, description: form.description, active: form.active,
        preAprovacao:      !!form.preAprovacao,
        aprovacaoExecucao: !!form.aprovacaoExecucao,
        parentId, updatedAt: new Date(),
        exclusiveTenants: form.exclusiveTenants || [],
      };
      if (editData?.id) {
        await updateDoc(doc(db, 'services', editData.id), data);
      } else {
        await addDoc(collection(db, 'services'), { ...data, createdAt: new Date() });
      }
      onSave();
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const inp = { padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <div style={{ background: '#f8faff', borderRadius: 8, border: '1px solid #e0e8ff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#667eea', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {editData ? 'Editar sub-servico' : 'Novo sub-servico'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
        <div><label style={lbl}>Nome *</label><input value={form.name} onChange={e => setF('name', e.target.value)} style={inp} placeholder="Ex: Recepcionista" /></div>
        <div><label style={lbl}>Descricao</label><input value={form.description} onChange={e => setF('description', e.target.value)} style={inp} placeholder="Breve descricao" /></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input type="checkbox" id={`sub-act-${editData?.id || 'new'}`} checked={form.active !== false} onChange={e => setF('active', e.target.checked)} style={{ width: 14, height: 14, accentColor: '#667eea' }} />
        <label htmlFor={`sub-act-${editData?.id || 'new'}`} style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>Ativo</label>
      </div>

      {/* Aprovações */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Aprovações necessárias
        </div>
        {APROVACOES_CONFIG.map(ap => (
          <div key={ap.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: form[ap.key] ? ap.cor : '#64748b' }}>{ap.label}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{ap.desc}</div>
            </div>
            {/* Toggle */}
            <div onClick={() => setF(ap.key, !form[ap.key])}
              style={{ width: 40, height: 22, borderRadius: 11, background: form[ap.key] ? ap.cor : '#e2e8f0', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginLeft: 12 }}>
              <div style={{ position: 'absolute', top: 3, left: form[ap.key] ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Opções de preço */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Opcoes de Preco
        </div>
        {!editData?.id && (
          <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 8 }}>
            Salve o sub-servico primeiro para adicionar opcoes.
          </div>
        )}
        {editData?.id && (
          <>
            {/* Lista de opções existentes */}
            {loadingOpcoes ? (
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Carregando...</div>
            ) : opcoes.length === 0 ? (
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>Nenhuma opcao cadastrada.</div>
            ) : (
              <div style={{ marginBottom: 10 }}>
                {opcoes.map(op => (
                  <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f1f5f9', opacity: op.ativo ? 1 : 0.5 }}>
                    <div style={{ flex: 1, fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{op.nome}</div>
                    <div style={{ fontSize: 12, color: '#667eea', fontWeight: 600 }}>
                      R$ {Number(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      {UNIDADES.find(u => u.id === op.unidade)?.label || op.unidade}
                    </div>
                    <button onClick={() => handleToggleOpcao(op)}
                      style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: `1px solid ${op.ativo ? '#fde68a' : '#bbf7d0'}`, background: 'none', color: op.ativo ? '#d97706' : '#16a34a', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      {op.ativo ? '⏸' : '▶'}
                    </button>
                    <button onClick={() => handleDeleteOpcao(op)}
                      style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: '1px solid #fecaca', background: 'none', color: '#ef4444', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {/* Formulário nova opção */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Nome da opcao</label>
                <input value={novaOpcao.nome} onChange={e => setNovaOpcao(p => ({ ...p, nome: e.target.value }))}
                  style={{ ...inp, fontSize: 11, padding: '5px 8px' }} placeholder="Ex: Standard" />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Valor (R$)</label>
                <input type="number" value={novaOpcao.valor} onChange={e => setNovaOpcao(p => ({ ...p, valor: e.target.value }))}
                  style={{ ...inp, fontSize: 11, padding: '5px 8px' }} placeholder="0,00" />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Unidade</label>
                <select value={novaOpcao.unidade} onChange={e => setNovaOpcao(p => ({ ...p, unidade: e.target.value }))}
                  style={{ ...inp, fontSize: 11, padding: '5px 8px' }}>
                  {UNIDADES.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
              <button onClick={handleAddOpcao} disabled={savingOpcao}
                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#667eea', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' }}>
                {savingOpcao ? '...' : '+ Add'}
              </button>
            </div>
          </>
        )}
      </div>

      <TenantSelector value={form.exclusiveTenants || []} onChange={v => setF('exclusiveTenants', v)} />

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// ── Painel de opções (somente leitura, painel direito) ────────────────────────
function OpcoesPanel({ subId, color }) {
  const [opcoes, setOpcoes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subId) return;
    setLoading(true);
    getDocs(collection(db, 'services', subId, 'opcoes'))
      .then(snap => setOpcoes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [subId]);

  return (
    <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16, marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        Opcoes de Preco
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Carregando...</div>
      ) : opcoes.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
          Nenhuma opcao cadastrada. Clique em "Editar sub-servico" para adicionar.
        </div>
      ) : (
        <div>
          {opcoes.filter(o => o.ativo !== false).map(op => (
            <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{op.nome}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color }}>
                R$ {Number(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '2px 7px', borderRadius: 10 }}>
                {UNIDADES.find(u => u.id === op.unidade)?.label || op.unidade}
              </div>
            </div>
          ))}
          {opcoes.filter(o => o.ativo === false).length > 0 && (
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>
              + {opcoes.filter(o => o.ativo === false).length} opcao(oes) inativa(s)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ServiceManager() {
  const [viewMode, setViewMode] = useState('catalogo'); // 'catalogo' | 'especiais'
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipoAtivo, setTipoAtivo] = useState('estrutura');
  const [form, setForm] = useState({ name: '', description: '', active: true });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [showSubForm, setShowSubForm] = useState(null);
  const [editingSub, setEditingSub] = useState(null);
  // Cascata
  const [selCategoria, setSelCategoria] = useState(null);
  const [selSub, setSelSub]             = useState(null);

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'services'), orderBy('name')));
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Nome obrigatorio'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'services', editing), { ...form, exclusiveTenants: form.exclusiveTenants || [], updatedAt: new Date() });
      } else {
        await addDoc(collection(db, 'services'), { ...form, tipo: tipoAtivo, parentId: null, exclusiveTenants: form.exclusiveTenants || [], createdAt: new Date() });
      }
      await loadServices();
      setForm({ name: '', description: '', active: true });
      setEditing(null);
      setShowForm(false);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este servico e todos os sub-servicos?')) return;
    const subs = services.filter(s => s.parentId === id);
    for (const sub of subs) await deleteDoc(doc(db, 'services', sub.id));
    await deleteDoc(doc(db, 'services', id));
    await loadServices();
  };

  const toggleActive = async (s) => {
    await updateDoc(doc(db, 'services', s.id), { active: !s.active });
    await loadServices();
  };

  const [seeding, setSeeding] = useState(false);
  const [seedingEG, setSeedingEG] = useState(false);

  const handleSeedEntGastro = async () => {
    if (!window.confirm('Adicionar servicos de Entretenimento e Gastronomia? Os servicos existentes nao serao alterados.')) return;
    setSeedingEG(true);
    try {
      // Busca nomes existentes para nao duplicar
      const snap = await getDocs(collection(db, 'services'));
      const existingNames = new Set(snap.docs.map(d => d.data().name));

      for (const [tipo, grupos] of Object.entries(SEED_ENT_GASTRO)) {
        for (const grupo of grupos) {
          let parentId;
          if (existingNames.has(grupo.name)) {
            // Ja existe — pega o id
            parentId = snap.docs.find(d => d.data().name === grupo.name)?.id;
          } else {
            const ref = await addDoc(collection(db, 'services'), {
              name: grupo.name, description: grupo.description,
              tipo, parentId: null, active: true, createdAt: new Date(),
            });
            parentId = ref.id;
          }
          for (const sub of grupo.subs) {
            if (existingNames.has(sub.name)) continue; // nao duplica
            const subRef = await addDoc(collection(db, 'services'), {
              name: sub.name, description: sub.description,
              tipo, parentId, active: true, createdAt: new Date(),
            });
            const preco = SEED_PRICING_ENT_GASTRO[sub.name];
            if (preco) {
              await addDoc(collection(db, 'servicePricing'), {
                tipo, subServiceId: subRef.id, serviceId: parentId,
                subServiceName: sub.name,
                estado: 'Sao Paulo - Capital',
                custoHora: preco.custoHora.toString(),
                observacoes: 'Valor de referencia — mercado SP 2025',
                ativo: true, createdAt: new Date(),
              });
            }
          }
        }
      }
      await loadServices();
      alert('Entretenimento e Gastronomia adicionados com sucesso!');
    } catch (e) { console.error(e); alert('Erro ao adicionar servicos.'); }
    finally { setSeedingEG(false); }
  };

  const handleSeed = async () => {
    if (!window.confirm('Isso vai APAGAR todos os servicos existentes e criar a estrutura completa com valores de mercado (SP). Continuar?')) return;
    setSeeding(true);
    try {
      // Apaga tudo
      const snap = await getDocs(collection(db, 'services'));
      for (const d of snap.docs) await deleteDoc(doc(db, 'services', d.id));
      const pSnap = await getDocs(collection(db, 'servicePricing'));
      for (const d of pSnap.docs) await deleteDoc(doc(db, 'servicePricing', d.id));

      // Cria serviços, sub-serviços e preços
      for (const [tipo, grupos] of Object.entries(SEED_DATA)) {
        for (const grupo of grupos) {
          const parentRef = await addDoc(collection(db, 'services'), {
            name: grupo.name, description: grupo.description,
            tipo, parentId: null, active: true, createdAt: new Date(),
          });
          for (const sub of grupo.subs) {
            const subRef = await addDoc(collection(db, 'services'), {
              name: sub.name, description: sub.description,
              tipo, parentId: parentRef.id, active: true, createdAt: new Date(),
            });
            // Adiciona preço de referência SP
            const preco = SEED_PRICING[sub.name];
            if (preco) {
              await addDoc(collection(db, 'servicePricing'), {
                tipo, subServiceId: subRef.id, serviceId: parentRef.id,
                subServiceName: sub.name,
                estado: 'Sao Paulo - Capital',
                ...(tipo === 'operacao'
                  ? { custoHora: preco.custoHora.toString() }
                  : { custoDiaria: preco.custoDiaria.toString(), custoInstalacao: preco.custoInstalacao.toString() }
                ),
                observacoes: 'Valor de referencia — mercado SP 2025',
                ativo: true, createdAt: new Date(),
              });
            }
          }
        }
      }
      await loadServices();
      alert('Estrutura completa criada com sucesso! Valores de referencia SP 2025 incluidos.');
    } catch (e) { console.error(e); alert('Erro ao popular dados.'); }
    finally { setSeeding(false); }
  };
  if (viewMode === 'especiais') {
    return <ServicoEspecialManager />;
  }

  const tipoConfig   = TIPOS.find(t => t.id === tipoAtivo);
  const categorias   = services.filter(s => !s.parentId && s.tipo === tipoAtivo);
  const subsDaCateg  = selCategoria ? services.filter(s => s.parentId === selCategoria) : [];
  const color        = tipoConfig?.color || '#667eea';

  const inp = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Serviços</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Catálogo de serviços para eventos</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['catalogo', 'Catálogo'], ['especiais', 'Serviços Especiais']].map(([id, label]) => (
              <button key={id} onClick={() => setViewMode(id)}
                style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${viewMode === id ? '#667eea' : '#e2e8f0'}`, background: viewMode === id ? '#f0f3ff' : 'white', color: viewMode === id ? '#667eea' : '#64748b', fontSize: 12, fontWeight: viewMode === id ? 600 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {label}
              </button>
            ))}
          </div>
          {(services.filter(s => !s.tipo).length > 0 || services.length === 0) && (
            <button onClick={handleSeed} disabled={seeding}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(102,126,234,0.3)', background: 'rgba(102,126,234,0.06)', color: '#667eea', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              {seeding ? 'Criando...' : 'Popular com dados de mercado'}
            </button>
          )}
          <button onClick={handleSeedEntGastro} disabled={seedingEG}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: '#FFA726', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            {seedingEG ? 'Adicionando...' : '+ Entretenimento e Gastronomia'}
          </button>
        </div>
      </div>

      {/* Tabs de tipo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        {TIPOS.map(t => (
          <button key={t.id} onClick={() => { setTipoAtivo(t.id); setSelCategoria(null); setSelSub(null); setEditingSub(null); setShowSubForm(null); }}
            style={{ padding: '8px 18px', borderRadius: 10, border: `1.5px solid ${tipoAtivo === t.id ? t.color : '#e2e8f0'}`, background: tipoAtivo === t.id ? `${t.color}15` : 'white', color: tipoAtivo === t.id ? t.color : '#64748b', fontSize: 13, fontWeight: tipoAtivo === t.id ? 700 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : (
        /* Layout cascata */
        <div style={{ display: 'flex', flex: 1, gap: 0, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', minHeight: 500 }}>

          {/* Col 1 — Categorias */}
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e2e8f0', overflowY: 'auto', background: '#fafbff' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Categoria</span>
              <button onClick={() => { setForm({ name: '', description: '', active: true }); setEditing(null); setShowForm(true); setSelCategoria(null); setSelSub(null); }}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: `1px solid ${color}44`, background: 'none', color, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>+ Nova</button>
            </div>
            {/* Form de nova categoria */}
            {showForm && !editing && (
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={{ ...inp, padding: '6px 10px', fontSize: 12, marginBottom: 6 }} placeholder="Nome da categoria" />
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...inp, padding: '6px 10px', fontSize: 12, marginBottom: 8 }} placeholder="Descrição" />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setShowForm(false); }} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                  <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '5px', borderRadius: 5, border: 'none', background: color, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>{saving ? '...' : 'Salvar'}</button>
                </div>
              </div>
            )}
            {categorias.length === 0 ? (
              <div style={{ padding: 20, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Nenhuma categoria</div>
            ) : categorias.map(cat => (
              <div key={cat.id} onClick={() => { setSelCategoria(cat.id); setSelSub(null); setEditingSub(null); setShowSubForm(null); }}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: selCategoria === cat.id ? `${color}10` : 'none', borderLeft: `3px solid ${selCategoria === cat.id ? color : 'transparent'}`, transition: 'all 0.15s', opacity: cat.active !== false ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: selCategoria === cat.id ? 600 : 400, color: selCategoria === cat.id ? color : '#1e293b' }}>{cat.name}</span>
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setForm({ name: cat.name, description: cat.description || '', active: cat.active !== false }); setEditing(cat.id); setShowForm(true); }}
                      style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>✎</button>
                    <button onClick={() => handleDelete(cat.id)}
                      style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, border: '1px solid #fecaca', background: 'none', color: '#ef4444', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>✕</button>
                  </div>
                </div>
                {cat.description && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{cat.description}</div>}
                <div style={{ fontSize: 10, color, marginTop: 2 }}>
                  {services.filter(s => s.parentId === cat.id).length} sub-serviço(s)
                </div>
              </div>
            ))}
            {/* Form editar categoria inline */}
            {showForm && editing && (
              <div style={{ padding: '10px 12px', background: '#f0f3ff', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#667eea', marginBottom: 8 }}>Editar categoria</div>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={{ ...inp, padding: '6px 10px', fontSize: 12, marginBottom: 6 }} />
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...inp, padding: '6px 10px', fontSize: 12, marginBottom: 8 }} placeholder="Descrição" />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                  <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '5px', borderRadius: 5, border: 'none', background: color, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>{saving ? '...' : 'Salvar'}</button>
                </div>
              </div>
            )}
          </div>

          {/* Col 2 — Sub-serviços */}
          <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #e2e8f0', overflowY: 'auto', background: 'white' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Sub-serviço</span>
              {selCategoria && (
                <button onClick={() => { setShowSubForm(selCategoria); setEditingSub(null); setSelSub(null); }}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: `1px solid ${color}44`, background: 'none', color, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>+ Novo</button>
              )}
            </div>
            {!selCategoria ? (
              <div style={{ padding: 20, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Selecione uma categoria</div>
            ) : (
              <>
                {showSubForm === selCategoria && !editingSub && (
                  <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0', background: '#f8faff' }}>
                    <SubServiceForm parentId={selCategoria}
                      onSave={() => { setShowSubForm(null); loadServices(); }}
                      onCancel={() => setShowSubForm(null)} />
                  </div>
                )}
                {subsDaCateg.length === 0 && showSubForm !== selCategoria && (
                  <div style={{ padding: 20, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Nenhum sub-serviço ainda</div>
                )}
                {subsDaCateg.map(sub => (
                  <div key={sub.id}>
                    <div onClick={() => { setSelSub(sub); setEditingSub(null); setShowSubForm(null); }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: selSub?.id === sub.id ? `${color}08` : editingSub?.id === sub.id ? '#f8faff' : 'none', borderLeft: `3px solid ${selSub?.id === sub.id || editingSub?.id === sub.id ? color : 'transparent'}`, opacity: sub.active !== false ? 1 : 0.5, transition: 'all 0.15s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: selSub?.id === sub.id ? 600 : 400, color: selSub?.id === sub.id ? color : '#1e293b' }}>{sub.name}</div>
                          {sub.description && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{sub.description}</div>}
                          {(sub.preAprovacao || sub.aprovacaoExecucao) && (
                            <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                              {sub.preAprovacao      && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(123,175,212,0.15)', color: '#7BAFD4' }}>Pré</span>}
                              {sub.aprovacaoExecucao && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(102,126,234,0.15)', color: '#667eea' }}>Exec</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditingSub(sub); setSelSub(null); setShowSubForm(null); }}
                            style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>✎</button>
                          <button onClick={() => toggleActive(sub)}
                            style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: `1px solid ${sub.active !== false ? '#fde68a' : '#bbf7d0'}`, background: 'none', color: sub.active !== false ? '#d97706' : '#16a34a', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                            {sub.active !== false ? '⏸' : '▶'}
                          </button>
                          <button onClick={async () => { if (window.confirm(`Excluir "${sub.name}"?`)) { await deleteDoc(doc(db, 'services', sub.id)); if (selSub?.id === sub.id) setSelSub(null); loadServices(); } }}
                            style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: '1px solid #fecaca', background: 'none', color: '#ef4444', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>✕</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Painel direito — detalhes do sub-serviço ou formulário de edição */}
          <div style={{ flex: 1, overflowY: 'auto', background: '#fafbff', padding: 20 }}>
            {editingSub ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>
                  Editar sub-serviço
                </div>
                <SubServiceForm parentId={selCategoria} editData={editingSub}
                  onSave={() => { setEditingSub(null); loadServices(); }}
                  onCancel={() => setEditingSub(null)} color={color} />
              </div>
            ) : !selSub ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
                Selecione um sub-serviço para ver os detalhes
              </div>
            ) : (
              <div>
                {/* Título */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{selSub.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                    {tipoConfig?.label} › {categorias.find(c => c.id === selCategoria)?.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: selSub.active !== false ? '#dcfce7' : '#f1f5f9', color: selSub.active !== false ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                      {selSub.active !== false ? 'Ativo' : 'Inativo'}
                    </span>
                    <button onClick={() => { setEditingSub(selSub); setSelSub(null); }}
                      style={{ fontSize: 12, padding: '3px 12px', borderRadius: 20, border: `1px solid ${color}44`, background: `${color}10`, color, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>
                      Editar sub-serviço
                    </button>
                  </div>
                </div>

                {selSub.description && (
                  <div style={{ marginBottom: 16, padding: '10px 14px', background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
                    {selSub.description}
                  </div>
                )}

                {/* Aprovações */}
                <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Aprovações configuradas</div>
                  {[
                    { key: 'preAprovacao',        label: 'Pré-aprovação',          desc: 'Fornecedor prepara e envia para aprovação do cliente. Se aprovado, gera a task de execução', cor: '#7BAFD4' },
                    { key: 'aprovacaoExecucao',   label: 'Aprovação de Execução',  desc: 'Aprovação no dia do evento, quando o fornecedor entrega o serviço', cor: '#667eea' },
                  ].map(ap => (
                    <div key={ap.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: selSub[ap.key] ? ap.cor : '#64748b' }}>{ap.label}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{ap.desc}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: selSub[ap.key] ? `${ap.cor}15` : '#f1f5f9', color: selSub[ap.key] ? ap.cor : '#94a3b8' }}>
                        {selSub[ap.key] ? '✓ Ativo' : 'Inativo'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Aviso se nenhuma aprovação */}
                {!selSub.preAprovacao && !selSub.aprovacaoExecucao && (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                    Nenhuma aprovação configurada. Clique em "Editar sub-serviço" para configurar.
                  </div>
                )}

                {/* Opções de preço */}
                <OpcoesPanel subId={selSub.id} color={color} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
