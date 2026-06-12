import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, serverTimestamp, query, where, runTransaction, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

// ── Helpers ───────────────────────────────────────────────────────────────────
const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const Overlay = ({ children, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', background: 'linear-gradient(160deg,#0A1626 0%,#0D1F35 100%)', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
      {children}
    </div>
  </div>
);

const Header = ({ assistantName, onClose }) => (
  <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,180,255,0.1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white', fontFamily: 'Outfit, sans-serif' }}>R</div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif' }}>{assistantName || 'Realize'}</div>
      <div style={{ fontSize: 10, color: '#7BAFD4', fontFamily: 'Outfit, sans-serif' }}>Assistente de eventos Realize Hub</div>
    </div>
    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#7BAFD4', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
  </div>
);

const BotMsg = ({ children }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0, fontFamily: 'Outfit, sans-serif' }}>R</div>
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,180,255,0.12)', borderRadius: '4px 14px 14px 14px', padding: '10px 14px', fontSize: 13, color: '#E8F4FF', lineHeight: 1.6, fontFamily: 'Outfit, sans-serif', maxWidth: '85%' }}
      dangerouslySetInnerHTML={{ __html: (typeof children === 'string' ? children : '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
  </div>
);

const UserMsg = ({ children }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
    <div style={{ background: 'linear-gradient(135deg,#0080FF,#0060CC)', borderRadius: '14px 4px 14px 14px', padding: '10px 14px', fontSize: 13, color: 'white', maxWidth: '80%', fontFamily: 'Outfit, sans-serif', lineHeight: 1.5 }}>{children}</div>
  </div>
);

const Btn = ({ onClick, children, variant = 'outline', disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '10px 16px', borderRadius: 10,
    border: variant === 'solid' ? 'none' : '1px solid rgba(0,180,255,0.25)',
    background: variant === 'solid' ? 'linear-gradient(135deg,#00E5C4,#0080FF)' : 'rgba(255,255,255,0.04)',
    color: variant === 'solid' ? 'white' : '#7BAFD4',
    fontSize: 13, fontWeight: variant === 'solid' ? 700 : 500,
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif',
    width: '100%', textAlign: 'left', opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
  }}>{children}</button>
);

const Inp = ({ value, onChange, placeholder, type = 'text', min, onKeyDown }) => (
  <input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} min={min}
    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
);

const CheckBtn = ({ checked, onClick, children }) => (
  <button onClick={onClick}
    style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${checked ? 'rgba(0,229,196,0.5)' : 'rgba(0,180,255,0.2)'}`, background: checked ? 'rgba(0,229,196,0.08)' : 'rgba(255,255,255,0.03)', color: checked ? '#00E5C4' : '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
    <span style={{ fontSize: 16 }}>{checked ? '☑' : '☐'}</span> {children}
  </button>
);

const ModeloCarrossel = ({ fotos, idx, onPrev, onNext, onDot }) => (
  <div style={{ position: 'relative', height: '100%' }}>
    <img src={fotos[idx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    {fotos.length > 1 && <>
      <button onClick={e => { e.stopPropagation(); onPrev(); }} style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>‹</button>
      <button onClick={e => { e.stopPropagation(); onNext(); }} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>›</button>
      <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {fotos.map((_, i) => <div key={i} onClick={e => { e.stopPropagation(); onDot(i); }} style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? 'white' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }} />)}
      </div>
    </>}
  </div>
);

const Row = ({ label, value }) => value ? (
  <div style={{ display: 'flex', gap: 8 }}>
    <span style={{ fontSize: 11, fontWeight: 700, color: '#7BAFD4', minWidth: 90, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 1 }}>{label}</span>
    <span style={{ fontSize: 12, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif', flex: 1, lineHeight: 1.5 }}>{value}</span>
  </div>
) : null;

// ── Step components (isolados para evitar useState em render) ─────────────────
const StepInput = ({ botText, placeholder, type, min, onConfirm, confirmLabel = 'Continuar →', optional = false }) => {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <BotMsg>{botText}</BotMsg>
      <Inp type={type} value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} min={min}
        onKeyDown={e => { if (e.key === 'Enter' && (val || optional)) onConfirm(val); }} />
      <Btn variant="solid" disabled={!val && !optional} onClick={() => onConfirm(val)}>{confirmLabel}</Btn>
    </div>
  );
};

const StepTextarea = ({ botText, placeholder, onConfirm, optional = false }) => {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <BotMsg>{botText}</BotMsg>
      <textarea value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#E8F4FF', fontSize: 13, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 80, boxSizing: 'border-box', outline: 'none' }} />
      <Btn variant="solid" disabled={!val && !optional} onClick={() => onConfirm(val)}>
        {optional && !val ? 'Nada a acrescentar →' : 'Continuar →'}
      </Btn>
    </div>
  );
};

const StepHorario = ({ onConfirm }) => {
  const [inicio, setInicio] = useState('');
  const [fim, setFim]       = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <BotMsg>Qual o **horário** do evento?</BotMsg>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Início</div><Inp type="time" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Término</div><Inp type="time" value={fim} onChange={e => setFim(e.target.value)} /></div>
      </div>
      <Btn variant="solid" disabled={!inicio || !fim} onClick={() => onConfirm(inicio, fim)}>Continuar →</Btn>
    </div>
  );
};

const StepLocal = ({ onConfirm }) => {
  const [cidade, setCidade] = useState('');
  const [local, setLocal]   = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <BotMsg>Qual a **cidade e o local** do evento?</BotMsg>
      <Inp value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade" />
      <Inp value={local}  onChange={e => setLocal(e.target.value)}  placeholder="Local / endereço (se já definido)" />
      <Btn variant="solid" disabled={!cidade} onClick={() => onConfirm(cidade, local)}>Continuar →</Btn>
    </div>
  );
};

const StepData = ({ onConfirm }) => {
  const [dia, setDia]   = useState('');
  const [mes, setMes]   = useState('');
  const [ano, setAno]   = useState('');
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const valido = dia && mes && ano && ano.length === 4;
  const confirmar = () => {
    const d = dia.padStart(2,'0');
    const m = mes.padStart(2,'0');
    const iso = `${ano}-${m}-${d}`;
    onConfirm(iso, `${d}/${m}/${ano}`);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Dia</div>
          <Inp type="number" value={dia} onChange={e => setDia(e.target.value)} placeholder="Ex: 15" min="1" max="31" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Mês</div>
          <select value={mes} onChange={e => setMes(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.2)', background: 'rgba(10,22,38,0.9)', color: mes ? '#E8F4FF' : 'rgba(123,175,212,0.5)', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }}>
            <option value="">Mês</option>
            {meses.map((m, i) => <option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Ano</div>
          <Inp type="number" value={ano} onChange={e => setAno(e.target.value)} placeholder="2026" min="2024" />
        </div>
      </div>
      <Btn variant="solid" disabled={!valido} onClick={confirmar}>Continuar →</Btn>
    </div>
  );
};

const StepEquipeDetalhes = ({ equipe, onConfirm }) => {
  const [idx, setIdx]     = useState(0);
  const [qtd, setQtd]     = useState('');
  const [horas, setHoras] = useState('');
  const [dias, setDias]   = useState('');
  const [obs, setObs]     = useState('');
  const [detalhes, setDetalhes] = useState({});

  const servAtual = equipe[idx];
  if (!servAtual) { onConfirm(detalhes); return null; }

  const avancar = () => {
    const novo = { ...detalhes, [servAtual.serviceName]: { quantidade: qtd, horasPorDia: horas, dias, observacoes: obs } };
    setDetalhes(novo);
    if (idx + 1 < equipe.length) {
      setIdx(i => i + 1);
      setQtd(''); setHoras(''); setDias(''); setObs('');
    } else onConfirm(novo);
  };

  const temUmCampo = qtd || horas || dias;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <BotMsg>{`Detalhes para **${servAtual.serviceName}**${equipe.length > 1 ? ` (${idx + 1}/${equipe.length})` : ''}:`}</BotMsg>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Quantos?</div><Inp type="number" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="Ex: 2" min="1" /></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Horas/dia</div><Inp type="number" value={horas} onChange={e => setHoras(e.target.value)} placeholder="Ex: 8" min="1" /></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Dias</div><Inp type="number" value={dias} onChange={e => setDias(e.target.value)} placeholder="Ex: 3" min="1" /></div>
      </div>
      <Inp value={obs} onChange={e => setObs(e.target.value)} placeholder="Preferência específica (opcional)" />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Btn variant="solid" disabled={!temUmCampo} onClick={avancar} style={{ width: '50%' }}>Continuar →</Btn>
      </div>
    </div>
  );
};

const StepOpcoes = ({ servicos, tipo, onConfirm }) => {
  const [idx, setIdx]       = useState(0);
  const [selecionados, setSel] = useState([]);
  const servAtual = servicos[idx];
  if (!servAtual) { onConfirm(selecionados); return null; }

  const avancar = (opcaoEscolhida) => {
    if (opcaoEscolhida) {
      setSel(p => [...p, {
        supplierId: servAtual.supplierId, supplierName: servAtual.supplierName || '',
        serviceName: servAtual.serviceName, serviceParentName: servAtual.serviceParentName || '',
        tipoServico: servAtual.tipoServico, id: servAtual.id,
        opcaoCatalogoId: opcaoEscolhida.id || '',
        opcaoNome: opcaoEscolhida.nome || '',
        valor: opcaoEscolhida.valor || 0, unidade: opcaoEscolhida.unidade || '',
        diasPreparo: servAtual.diasPreparo || 0, diasMontagem: servAtual.diasMontagem || 0,
      }]);
    }
    if (idx + 1 < servicos.length) setIdx(i => i + 1);
    else onConfirm(opcaoEscolhida ? [...selecionados, {
      supplierId: servAtual.supplierId, supplierName: servAtual.supplierName || '',
      serviceName: servAtual.serviceName, serviceParentName: servAtual.serviceParentName || '',
      tipoServico: servAtual.tipoServico, id: servAtual.id,
      opcaoCatalogoId: opcaoEscolhida.id || '', opcaoNome: opcaoEscolhida.nome || '',
      valor: opcaoEscolhida.valor || 0, unidade: opcaoEscolhida.unidade || '',
      diasPreparo: servAtual.diasPreparo || 0, diasMontagem: servAtual.diasMontagem || 0,
    }] : selecionados);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <BotMsg>Opções disponíveis para **{servAtual.serviceName}** ({idx + 1}/{servicos.length}):</BotMsg>
      {servAtual.opcoes.map(op => (
        <Btn key={op.id} onClick={() => avancar(op)}>
          {op.nome}{op.caracteristica ? ` — ${op.caracteristica}` : ''}
        </Btn>
      ))}
      <Btn onClick={() => avancar(null)}>Não preciso de {servAtual.serviceName}</Btn>
    </div>
  );
};

const StepMultiSelect = ({ botText, servicos, loading, onConfirm, onSkip }) => {
  const [sel, setSel] = useState({});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <BotMsg>{botText}</BotMsg>
      {loading ? <div style={{ color: '#7BAFD4', fontSize: 12, textAlign: 'center', padding: 12 }}>Carregando...</div>
        : servicos.map(s => <CheckBtn key={s.id} checked={!!sel[s.id]} onClick={() => setSel(p => ({ ...p, [s.id]: !p[s.id] }))}>{s.serviceName}</CheckBtn>)}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Btn variant="solid" onClick={() => {
          const escolhidos = servicos.filter(s => sel[s.id]);
          if (escolhidos.length > 0) onConfirm(escolhidos);
          else onSkip();
        }} style={{ width: '50%' }}>Confirmar →</Btn>
      </div>
      <Btn onClick={onSkip}>Não preciso</Btn>
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function ClienteChat({ userData, onClose }) {
  const userName      = userData?.name || userData?.displayName || 'Cliente';
  const userId        = userData?.uid  || userData?.id || '';
  const assistantName = 'Chat com a Realize';

  const [step, setStep]           = useState('stand_pergunta');
  const [historico, setHistorico] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingOpcoes, setLoadingOpcoes] = useState(false);

  const [dados, setDados] = useState({
    temStand: null, tipoEstande: null, standDescricao: '', standImagensUrls: [],
    areaM2: '', alturaTeto: '', diasMontagem: '', restricoes: '', identidadeVisual: null, identidadeImagensUrls: [],
    nomeEmpresa: '', tipoEvento: '', nomeEvento: '', dataInicio: '', dataFim: '',
    horarioInicio: '', horarioFim: '', cidade: '', local: '', visitantesPorDia: '',
    temProdutor: null,
    estruturaSelecionada: [], equipeSelecionada: [], gastronomeSelecionada: [], servicosSelecionados: [],
    equipeDetalhes: {}, infoExtra: '', formaPagamento: '',
  });

  const [modelosEspeciais,  setModelosEspeciais]  = useState([]);
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [carrosselIdx,      setCarrosselIdx]      = useState({});

  // Listas de serviços carregados
  const [listaEstrutura, setListaEstrutura] = useState([]);
  const [listaEquipe,    setListaEquipe]    = useState([]);
  const [listaGastro,    setListaGastro]    = useState([]);
  const [listaServicos,  setListaServicos]  = useState([]);

  const [uploadingStand, setUploadingStand] = useState(false);
  const [uploadingIdent, setUploadingIdent] = useState(false);
  const standInputRef = useRef();
  const identInputRef = useRef();
  const bottomRef     = useRef();

  // Ao entrar em cada step, adiciona a pergunta do bot no histórico
  const perguntasDoStep = {
    stand_pergunta:             `Olá, **${userName}**! 😊 Sou a Realize, assistente de eventos da Realize Hub.\n\nVou te ajudar a criar a proposta do seu evento. Seu evento precisa de **Stand**?`,
    stand_tipo:                 'Prefere um Stand **Modular** *(pronto e padronizado)* ou **Personalizado** *(exclusivo, criado do zero)*?',
    stand_modelos:              'Confira os modelos disponíveis e escolha o que combina com seu evento:',
    stand_personalizado_sabe:   'Você já sabe como gostaria do seu stand?',
    stand_personalizado_descricao: 'Descreva como você imagina o seu stand e, se quiser, envie imagens de referência:',
    stand_personalizado_upload: 'Quer enviar imagens de referência? *(opcional)*',
    stand_area:                 'Qual o **tamanho da área** do stand em m²?',
    stand_teto:                 'Qual a **altura do teto** no local do evento?',
    stand_montagem:             '**Quantos dias antes** do evento o local estará disponível para montagem?',
    stand_restricao:            'Tem alguma **restrição de acesso** no local? *(altura de caminhões, horário, etc.)*',
    stand_restricao_desc:       'Descreva as restrições:',
    stand_identidade:           'Já tem **identidade visual** definida para o evento?',
    stand_identidade_upload:    'Envie as artes/arquivos da identidade visual:',
    evento_empresa:             'Agora os dados do evento! Tem nome de **empresa organizadora**?',
    evento_tipo:                'Qual o **tipo do evento**?',
    evento_nome:                'O evento já tem um **nome** definido?',
    evento_data_inicio:         'Qual a **data de início** do evento?',
    evento_data_fim:            'Qual a **data de término**? *(se for 1 dia, selecione a mesma data)*',
    evento_horario:             'Qual o **horário** do evento?',
    evento_local:               'Qual a **cidade e o local** do evento?',
    evento_visitantes:          '**Quantas pessoas** participarão por dia?',
    produtor_pergunta:          'Gostaria de um **Produtor de Eventos** dedicado para coordenar tudo no dia?',
    estrutura_pergunta:         'Vai precisar de alguma **estrutura física**? *(palco, tendas, backdrop, iluminação...)*',
    estrutura_selecao:          'Selecione os itens de **estrutura** que você precisa:',
    equipe_pergunta:            'Vai precisar de algum **profissional** no evento? *(recepcionista, segurança, DJ...)*',
    equipe_selecao:             'Selecione os **profissionais** que você precisa:',
    gastro_pergunta:            'Vai precisar de **alimentação ou bebidas**?',
    gastro_selecao:             'Selecione os serviços de **gastronomia**:',
    servicos_pergunta:          'Vai precisar de algum **equipamento ou atração**? *(som, iluminação, DJ, fotografia...)*',
    servicos_selecao:           'Selecione os **equipamentos e atrações**:',
    info_extra:                 'Falta alguma informação ou pedido especial que queira acrescentar?',
    pagamento:                  'Última etapa! Como prefere a **forma de pagamento**?',
  };

  const stepAnteriorRef = useRef(null);
  useEffect(() => {
    if (step !== stepAnteriorRef.current) {
      const pergunta = perguntasDoStep[step];
      if (pergunta) setHistorico(p => [...p, { role: 'bot', text: pergunta }]);
      stepAnteriorRef.current = step;
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80);
  }, [step]);

  useEffect(() => {
    getDocs(collection(db, 'modelosEspeciais'))
      .then(snap => setModelosEspeciais(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.ativo !== false)))
      .catch(console.error);
  }, []);

  // Palavras que nunca devem aparecer na seleção de estrutura/equipe
  const BLOQUEADOS_ESTRUTURA = ['estande', 'stand', 'desenvolvimento'];
  const BLOQUEADOS_EQUIPE    = ['produtor'];

  const carregarTipo = async (tipo, setter) => {
    setLoadingOpcoes(true);
    try {
      const snap = await getDocs(query(collection(db, 'supplierServices'), where('tipoServico', '==', tipo)));
      const servs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);

      // Aplica filtros por tipo
      const bloqueados = tipo === 'estrutura' ? BLOQUEADOS_ESTRUTURA
                       : tipo === 'operacao'  ? BLOQUEADOS_EQUIPE
                       : [];
      const filtrados = servs.filter(s => {
        const nome = normalize(s.serviceName || '') + ' ' + normalize(s.serviceParentName || '');
        return !bloqueados.some(b => nome.includes(b));
      });

      const comOpcoes = await Promise.all(filtrados.map(async s => {
        const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
        const opcoes = opSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.ativo !== false);
        return { ...s, opcoes };
      }));
      setter(comOpcoes.filter(s => s.opcoes.length > 0));
    } catch (e) { console.error(e); setter([]); }
    finally { setLoadingOpcoes(false); }
  };

  const set = (key, val) => setDados(p => ({ ...p, [key]: typeof val === 'function' ? val(p[key]) : val }));
  const addBot  = text => setHistorico(p => [...p, { role: 'bot',  text }]);
  const addUser = text => setHistorico(p => [...p, { role: 'user', text }]);

  const ir = (nextStep, botText) => {
    if (botText) addBot(botText);
    setStep(nextStep);
  };

  const handleUpload = async (files, campo, setUploading) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        const r = storageRef(storage, `briefings/${userId}/${Date.now()}_${file.name}`);
        await uploadBytes(r, file);
        urls.push(await getDownloadURL(r));
      }
      set(campo, urls);
      addUser(`${urls.length} imagem(ns) enviada(s)`);
    } catch (e) { console.error(e); alert('Erro ao enviar imagens.'); }
    finally { setUploading(false); }
  };

  const montarBriefingJson = () => {
    const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados];
    return {
      evento: {
        tipo: dados.tipoEvento, nome: dados.nomeEvento,
        dataInicio: dados.dataInicio, dataFim: dados.dataFim,
        horario: `${dados.horarioInicio} às ${dados.horarioFim}`,
        horarioInicio: dados.horarioInicio, horarioFim: dados.horarioFim,
        cidade: dados.cidade, local: dados.local, endereco: dados.local,
        visitantesPorDia: parseInt(dados.visitantesPorDia) || 0,
        nomeEmpresa: dados.nomeEmpresa, diasDuracao: 1,
      },
      estrutura: {
        ativo: dados.temStand === true, tipoEstande: dados.tipoEstande || '',
        areaM2: parseFloat(dados.areaM2) || 0, alturaTeto: dados.alturaTeto,
        diasMontagem: parseInt(dados.diasMontagem) || 0, restricoes: dados.restricoes,
        identidadeVisual: dados.identidadeVisual ? 'sim' : 'nao',
        identidadeImagensUrls: dados.identidadeImagensUrls,
        standDescricao: dados.standDescricao, standImagensUrls: dados.standImagensUrls, observacoes: '',
      },
      tipoEstande: dados.tipoEstande || '',
      modeloEstande: modeloSelecionado || null,
      equipe: {
        produtor: { ativo: dados.temProdutor === true, dias: 0, observacoes: '' },
        itens: dados.equipeSelecionada.map(s => ({
          tipo: s.serviceName,
          quantidade:  parseInt(dados.equipeDetalhes[s.serviceName]?.quantidade) || 1,
          horasPorDia: parseFloat(dados.equipeDetalhes[s.serviceName]?.horasPorDia) || 0,
          dias:        parseInt(dados.equipeDetalhes[s.serviceName]?.dias) || 0,
          observacoes: dados.equipeDetalhes[s.serviceName]?.observacoes || '',
        })),
      },
      gastronomia: {
        alimentos: { ativo: dados.gastronomeSelecionada.length > 0, formato: dados.gastronomeSelecionada.map(s => s.serviceName).join(', '), pessoas: parseInt(dados.visitantesPorDia) || 0, restricoes: '', cozinha: false, observacoes: '' },
        bar: { ativo: false },
      },
      servicosNecessarios: todas.map(s => s.serviceName),
      opcoesSelecionadas: todas.map(s => ({ supplierId: s.supplierId, serviceName: s.serviceName, serviceParentName: s.serviceParentName, tipoServico: s.tipoServico, opcaoCatalogoId: s.opcaoCatalogoId || '', nome: s.opcaoNome || '', valor: s.valor || null, unidade: s.unidade || '' })),
      selecoesCatalogo: {}, itensEmAnalise: [],
      infoExtra: dados.infoExtra, formaPagamento: dados.formaPagamento,
    };
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    const bj = montarBriefingJson();
    try {
      let assignedTo = null, assignedToName = null;
      try {
        const coordSnap = await getDocs(query(collection(db, 'users'), where('roleName', '==', 'Coordenador'), where('active', '==', true)));
        const coords = coordSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (coords.length > 0) {
          const bSnap = await getDocs(query(collection(db, 'budgets'), where('status', '==', 'analyzing')));
          const cont = {}; bSnap.docs.forEach(d => { const at = d.data().assignedTo; if (at) cont[at] = (cont[at] || 0) + 1; });
          const e = coords.reduce((m, c) => (cont[c.id] || 0) < (cont[m.id] || 0) ? c : m);
          assignedTo = e.id; assignedToName = e.name;
        }
      } catch (e) { console.error(e); }

      let numeroPedido = '';
      try {
        const cr = doc(db, 'config', 'contadores');
        await runTransaction(db, async t => {
          const snap = await t.get(cr);
          const prox = (snap.exists() ? (snap.data().orcamentos || 0) : 0) + 1;
          t.set(cr, { orcamentos: prox }, { merge: true });
          numeroPedido = `OP-${String(prox).padStart(4, '0')}-${new Date().getFullYear().toString().slice(-2)}`;
        });
      } catch (e) { console.error(e); }

      const budgetRef = await addDoc(collection(db, 'budgets'), {
        clientUserId: userId, clientName: userName,
        eventName: bj.evento?.nome || bj.evento?.tipo || 'Novo Evento',
        eventTypeName: bj.evento?.tipo || '',
        startDate: bj.evento?.dataInicio || '', endDate: bj.evento?.dataFim || '',
        location: bj.evento?.local || bj.evento?.cidade || '',
        guestCount: bj.evento?.visitantesPorDia || 0,
        status: 'analyzing', workspaceStage: 'Propostas', isMae: true, numeroPedido,
        briefingData: { ...bj, formaPagamento: dados.formaPagamento },
        financeiro: { formaPagamento: dados.formaPagamento },
        assignedTo, assignedToName, assignedAt: assignedTo ? serverTimestamp() : null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      try {
        const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados];
        const vistos = new Set();
        for (const sel of todas) {
          const key = `${sel.supplierId}__${sel.serviceName}`;
          if (vistos.has(key)) continue; vistos.add(key);
          const isEstande = normalize(sel.serviceName).includes('estande') || normalize(sel.serviceParentName || '').includes('estande');
          if (isEstande && dados.tipoEstande === 'modular') continue;
          await addDoc(collection(db, 'supplierJobs'), {
            supplierId: sel.supplierId, supplierName: sel.supplierName || '', budgetId: budgetRef.id,
            eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '',
            clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '',
            eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '',
            eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '',
            eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0,
            serviceNames: [sel.serviceName], serviceName: sel.serviceName, serviceParentName: sel.serviceParentName || '',
            tipoServico: sel.tipoServico || '', opcaoCatalogoId: sel.opcaoCatalogoId || '',
            preco: sel.valor || 0, unidade: sel.unidade || '',
            diasPreparo: sel.diasPreparo || 0, diasMontagem: sel.diasMontagem || 0,
            stage: 'proposta', status: 'draft', createdAt: serverTimestamp(),
          });
        }

        if (dados.temProdutor) {
          const prodSnap = await getDocs(collection(db, 'supplierServices'));
          const prods = prodSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => normalize(s.serviceName).includes('produtor') && s.ativo !== false);
          for (const ps of prods) {
            await addDoc(collection(db, 'supplierJobs'), {
              supplierId: ps.supplierId, budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento',
              clientName: userName, eventDate: bj.evento?.dataInicio || '',
              serviceName: ps.serviceName, serviceParentName: ps.serviceParentName || '',
              tipoServico: ps.tipoServico || 'operacao', preco: 0, unidade: '',
              stage: 'proposta', status: 'draft', createdAt: serverTimestamp(),
            });
          }
        }

        if (dados.tipoEstande === 'modular' && modeloSelecionado) {
          const tiposSnap = await getDocs(collection(db, 'tiposEspeciais'));
          const todosTipos = tiposSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const tipoDoModelo = todosTipos.find(t => t.id === modeloSelecionado.tipoEspecialId || t.nome?.toLowerCase().includes('modular') || t.nome?.toLowerCase().includes('estande'));
          for (const forn of (tipoDoModelo?.fornecedoresAutorizados || [])) {
            await addDoc(collection(db, 'supplierJobs'), {
              supplierId: forn.id, supplierName: forn.nome || '', budgetId: budgetRef.id,
              eventName: bj.evento?.nome || 'Novo Evento', clientName: userName, eventDate: bj.evento?.dataInicio || '',
              serviceName: modeloSelecionado.nome, serviceParentName: tipoDoModelo?.nome || 'Estande Modular',
              tipoServico: 'estrutura', modeloEspecialId: modeloSelecionado.id,
              preco: modeloSelecionado.precoBase || 0, unidade: 'por evento',
              diasPreparo: modeloSelecionado.diasProducao || 0, diasMontagem: 0,
              stage: 'proposta', status: 'draft', createdAt: serverTimestamp(),
            });
          }
        }

        if (dados.tipoEstande === 'personalizado') {
          await addDoc(collection(db, 'supplierJobs'), {
            supplierId: '', budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', clientName: userName,
            serviceName: 'Desenvolvimento de Stand', serviceParentName: 'Estandes Personalizados', tipoServico: 'estrutura',
            observacoes: dados.standDescricao || 'Cliente solicitou atendimento para desenvolver stand personalizado.',
            standImagensUrls: dados.standImagensUrls || [], preco: 0, unidade: '',
            stage: 'proposta', status: 'draft', createdAt: serverTimestamp(),
          });
        }
      } catch (e) { console.error('Erro supplierJobs:', e); }

      try {
        const svSnap = await getDocs(collection(db, 'supplierServices'));
        const svAll  = svSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
        const servicosResumidos = svAll.filter(s => s.diasPreparo > 0 || s.diasMontagem > 0).map(s => `${s.serviceName}:preparo=${s.diasPreparo||0}d,montagem=${s.diasMontagem||0}d`).join(';');
        const hoje = new Date().toISOString().split('T')[0];
        const cronRes = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, system: 'Responda APENAS com JSON válido e compacto. Sem texto, sem markdown, sem backticks.', messages: [{ role: 'user', content: `Monte cronograma de produção para evento corporativo. Responda APENAS JSON compacto.\nEvento:${bj.evento?.nome||bj.evento?.tipo},data:${bj.evento?.dataInicio},cidade:${bj.evento?.cidade}\nServiços:${(bj.servicosNecessarios||[]).join(',')}\nTempos:${servicosResumidos||'padrão'}\nHoje:${hoje}\nJSON:{"prazoInviavel":false,"etapas":[{"id":"e1","n":"nome","d":"desc","r":"coordenador","di":"YYYY-MM-DD","de":"YYYY-MM-DD","da":30,"s":"pendente","t":"administrativo","atrasado":false}]}` }] }) });
        const cronData = await cronRes.json();
        const cronText = (cronData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        const cronJson = JSON.parse(cronText.replace(/```json|```/g, '').trim());
        if (cronJson?.etapas?.length > 0) {
          const etapas = cronJson.etapas.map(e => ({ id: e.id||e.n, nome: e.n||e.nome, descricao: e.d||e.descricao||'', responsavel: e.r||'coordenador', dataInicio: e.di||'', dataEntrega: e.de||'', diasAntes: e.da??0, dependencias: e.dep||[], status: e.s||'pendente', tipo: e.t||'administrativo' }));
          await updateDoc(doc(db, 'budgets', budgetRef.id), { cronograma: { etapas, prazoInviavel: cronJson.prazoInviavel || false } });
        }
      } catch (e) { console.error('Erro cronograma:', e); }

      try {
        const descRes = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system: 'Especialista em eventos. Português brasileiro, tom profissional. Sem markdown.', messages: [{ role: 'user', content: `Escreva UM parágrafo curto (máx 3 linhas) descrevendo o evento para equipe interna.\nEvento: ${bj.evento?.nome||bj.evento?.tipo}\nData: ${bj.evento?.dataInicio} a ${bj.evento?.dataFim}\nLocal: ${bj.evento?.local||bj.evento?.cidade}\nVisitantes: ${bj.evento?.visitantesPorDia}\nServiços: ${(bj.servicosNecessarios||[]).join(', ')}` }] }) });
        const descData = await descRes.json();
        const descText = (descData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (descText) await updateDoc(doc(db, 'budgets', budgetRef.id), { descricaoBriefing: descText });
      } catch (e) { console.error('Erro descrição:', e); }

      setStep('sent');
    } catch (err) { console.error('Erro ao salvar:', err); alert('Erro ao enviar. Tente novamente.'); }
    finally { setSubmitting(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const renderStep = () => {
    if (step === 'stand_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>{`Olá, **${userName}**! 😊 Sou a Realize, assistente de eventos da Realize Hub.\n\nVou te ajudar a criar a proposta do seu evento. Seu evento precisa de **Stand**?`}</BotMsg>
        <Btn onClick={() => { addUser('Sim'); set('temStand', true); ir('stand_tipo'); }}>Sim</Btn>
        <Btn onClick={() => { addUser('Não'); set('temStand', false); ir('evento_empresa', 'Sem problemas! Vamos para os dados do evento.'); }}>Não</Btn>
      </div>
    );

    if (step === 'stand_tipo') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Prefere um Stand **Modular** *(pronto e padronizado)* ou **Personalizado** *(exclusivo, criado do zero)*?</BotMsg>
        <Btn onClick={() => { addUser('Modular'); set('tipoEstande', 'modular'); ir('stand_modelos'); }}>Modular</Btn>
        <Btn onClick={() => { addUser('Personalizado'); set('tipoEstande', 'personalizado'); ir('stand_personalizado_sabe'); }}>Personalizado</Btn>
      </div>
    );

    if (step === 'stand_modelos') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BotMsg>Confira os modelos disponíveis e escolha o que combina com seu evento:</BotMsg>
        {modelosEspeciais.length === 0
          ? <div style={{ fontSize: 12, color: '#7BAFD4', textAlign: 'center', padding: 16 }}>Nenhum modelo disponível no momento.</div>
          : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {modelosEspeciais.map(m => {
                const fotos = m.fotos?.length > 0 ? m.fotos.map(f => f.url) : (m.fotoUrl ? [m.fotoUrl] : []);
                return (
                  <div key={m.id} onClick={() => setModeloSelecionado(m)}
                    style={{ borderRadius: 12, border: `2px solid ${modeloSelecionado?.id === m.id ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: modeloSelecionado?.id === m.id ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s' }}>
                    {/* Fotos */}
                    <div style={{ height: 140, background: 'rgba(0,128,255,0.08)', position: 'relative' }}>
                      {fotos.length > 0
                        ? <ModeloCarrossel fotos={fotos} idx={carrosselIdx[m.id] || 0}
                            onPrev={() => setCarrosselIdx(p => ({ ...p, [m.id]: ((p[m.id]||0) - 1 + fotos.length) % fotos.length }))}
                            onNext={() => setCarrosselIdx(p => ({ ...p, [m.id]: ((p[m.id]||0) + 1) % fotos.length }))}
                            onDot={i => setCarrosselIdx(p => ({ ...p, [m.id]: i }))} />
                        : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(123,175,212,0.3)', fontSize: 11 }}>Sem foto</div>}
                      {modeloSelecionado?.id === m.id && <div style={{ position: 'absolute', top: 8, right: 8, background: '#00E5C4', color: '#0A1626', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, fontFamily: 'Outfit, sans-serif' }}>✓ Selecionado</div>}
                    </div>
                    {/* Infos completas */}
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif' }}>{m.nome}</div>
                      {m.descricao && <div style={{ fontSize: 11, color: '#7BAFD4', lineHeight: 1.4, fontFamily: 'Outfit, sans-serif' }}>{m.descricao}</div>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                        {m.areaM2 && <span style={{ fontSize: 10, background: 'rgba(0,229,196,0.1)', color: '#00E5C4', padding: '2px 7px', borderRadius: 8, fontFamily: 'Outfit, sans-serif' }}>📐 {m.areaM2}m²</span>}
                        {m.altura && <span style={{ fontSize: 10, background: 'rgba(0,180,255,0.1)', color: '#7BAFD4', padding: '2px 7px', borderRadius: 8, fontFamily: 'Outfit, sans-serif' }}>↕ {m.altura}m alt.</span>}
                        {m.diasProducao > 0 && <span style={{ fontSize: 10, background: 'rgba(255,167,38,0.1)', color: '#FFA726', padding: '2px 7px', borderRadius: 8, fontFamily: 'Outfit, sans-serif' }}>⏱ {m.diasProducao}d produção</span>}
                        {m.precoBase > 0 && <span style={{ fontSize: 10, background: 'rgba(102,187,106,0.1)', color: '#66BB6A', padding: '2px 7px', borderRadius: 8, fontFamily: 'Outfit, sans-serif' }}>R$ {m.precoBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                      </div>
                      {m.caracteristicas?.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 10, color: 'rgba(123,175,212,0.6)', fontFamily: 'Outfit, sans-serif', marginBottom: 3 }}>INCLUSO:</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {m.caracteristicas.map((c, i) => <span key={i} style={{ fontSize: 10, color: '#7BAFD4', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 6, fontFamily: 'Outfit, sans-serif' }}>{c}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>}
        <Btn variant="solid" disabled={!modeloSelecionado} onClick={() => { addUser(`Modelo: ${modeloSelecionado.nome}`); ir('stand_area'); }}>
          {modeloSelecionado ? `Confirmar: ${modeloSelecionado.nome} →` : 'Selecione um modelo'}
        </Btn>
      </div>
    );

    if (step === 'stand_personalizado_sabe') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Você já sabe como gostaria do seu stand?</BotMsg>
        <Btn onClick={() => { addUser('Sim, já tenho ideia'); ir('stand_personalizado_descricao'); }}>Sim, já tenho ideia</Btn>
        <Btn onClick={() => { addUser('Não, preciso de ajuda'); set('standDescricao', 'Cliente solicitou atendimento para desenvolver stand personalizado.'); ir('stand_area', 'Sem problemas! Um atendente entrará em contato para ajudá-lo. Vamos continuar com os dados.'); }}>Não, preciso de ajuda</Btn>
      </div>
    );

    if (step === 'stand_personalizado_descricao') return (
      <StepTextarea botText="Descreva como você imagina o seu stand e, se quiser, envie imagens de referência:"
        placeholder="Ex: Stand em L, com balcão, iluminação LED azul, parede com logo..."
        onConfirm={val => {
          set('standDescricao', val); addUser(val);
          // Upload opcional
          ir('stand_personalizado_upload');
        }} />
    );

    if (step === 'stand_personalizado_upload') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BotMsg>Quer enviar imagens de referência? *(opcional)*</BotMsg>
        <input ref={standInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files, 'standImagensUrls', setUploadingStand)} />
        <button onClick={() => standInputRef.current.click()} disabled={uploadingStand}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px dashed rgba(0,180,255,0.3)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textAlign: 'center' }}>
          {uploadingStand ? 'Enviando...' : dados.standImagensUrls.length > 0 ? `${dados.standImagensUrls.length} imagem(ns) — Adicionar mais` : '+ Enviar imagens de referência'}
        </button>
        <Btn variant="solid" onClick={() => ir('stand_area')}>
          {dados.standImagensUrls.length > 0 ? 'Continuar →' : 'Pular →'}
        </Btn>
      </div>
    );

    if (step === 'stand_area') return (
      <StepInput botText="Qual o **tamanho da área** do stand em m²?" type="number" placeholder="Ex: 36" min="1"
        onConfirm={val => { set('areaM2', val); addUser(`${val} m²`); ir('stand_teto'); }} />
    );

    if (step === 'stand_teto') return (
      <StepInput botText="Qual a **altura do teto** no local do evento?" placeholder="Ex: 3m, 4,5m..."
        onConfirm={val => { set('alturaTeto', val); addUser(val); ir('stand_montagem'); }} />
    );

    if (step === 'stand_montagem') return (
      <StepInput botText="**Quantos dias antes** do evento o local estará disponível para montagem?" type="number" placeholder="Ex: 2" min="0"
        onConfirm={val => { set('diasMontagem', val); addUser(`${val} dia(s)`); ir('stand_restricao'); }} />
    );

    if (step === 'stand_restricao') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Tem alguma **restrição de acesso** no local? *(altura de caminhões, horário, etc.)*</BotMsg>
        <Btn onClick={() => ir('stand_restricao_desc')}>Sim, tem restrição</Btn>
        <Btn onClick={() => { addUser('Sem restrições'); set('restricoes', ''); ir('stand_identidade'); }}>Não, sem restrições</Btn>
      </div>
    );

    if (step === 'stand_restricao_desc') return (
      <StepInput botText="Descreva as restrições:" placeholder="Ex: altura máx. 3m, acesso somente de manhã..."
        onConfirm={val => { set('restricoes', val); addUser(val); ir('stand_identidade'); }} />
    );

    if (step === 'stand_identidade') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Já tem **identidade visual** definida para o evento?</BotMsg>
        <Btn onClick={() => { addUser('Sim, já tenho'); set('identidadeVisual', true); ir('stand_identidade_upload'); }}>Sim, já tenho</Btn>
        <Btn onClick={() => { addUser('Não ainda'); set('identidadeVisual', false); ir('evento_empresa'); }}>Não ainda</Btn>
      </div>
    );

    if (step === 'stand_identidade_upload') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BotMsg>Envie as artes/arquivos da identidade visual:</BotMsg>
        <input ref={identInputRef} type="file" accept="image/*,.pdf,.ai,.eps" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files, 'identidadeImagensUrls', setUploadingIdent)} />
        <button onClick={() => identInputRef.current.click()} disabled={uploadingIdent}
          style={{ padding: '12px 14px', borderRadius: 10, border: '1px dashed rgba(0,229,196,0.3)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textAlign: 'center' }}>
          {uploadingIdent ? 'Enviando...' : dados.identidadeImagensUrls.length > 0 ? `${dados.identidadeImagensUrls.length} arquivo(s) — Adicionar mais` : '+ Selecionar arquivos'}
        </button>
        <Btn variant="solid" onClick={() => ir('evento_empresa', 'Artes recebidas! Agora os dados do evento.')}>
          {dados.identidadeImagensUrls.length > 0 ? 'Continuar →' : 'Pular por enquanto →'}
        </Btn>
      </div>
    );

    // ── EVENTO ──────────────────────────────────────────────────────────────
    if (step === 'evento_empresa') return (
      <StepInput botText="Agora os dados do evento! Tem nome de **empresa organizadora**?" placeholder="Nome da empresa (ou deixe em branco)" optional
        onConfirm={val => { set('nomeEmpresa', val); addUser(val || 'Sem empresa'); ir('evento_tipo'); }} />
    );

    if (step === 'evento_tipo') {
      const tipos = ['Feira / Exposição', 'Congresso / Conferência', 'Lançamento de Produto', 'Evento Corporativo', 'Show / Entretenimento', 'Outro'];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <BotMsg>Qual o **tipo do evento**?</BotMsg>
          {tipos.map(t => <Btn key={t} onClick={() => { set('tipoEvento', t); addUser(t); ir('evento_nome'); }}>{t}</Btn>)}
        </div>
      );
    }

    if (step === 'evento_nome') return (
      <StepInput botText="O evento já tem um **nome** definido?" placeholder="Nome do evento (ou deixe em branco)" optional
        onConfirm={val => { set('nomeEvento', val); addUser(val || 'Sem nome ainda'); ir('evento_data_inicio'); }} />
    );

    if (step === 'evento_data_inicio') return (
      <StepData onConfirm={(val, label) => { set('dataInicio', val); addUser(label); ir('evento_data_fim'); }} />
    );

    if (step === 'evento_data_fim') return (
      <StepData onConfirm={(val, label) => { set('dataFim', val); addUser(label); ir('evento_horario'); }} />
    );

    if (step === 'evento_horario') return (
      <StepHorario onConfirm={(inicio, fim) => { set('horarioInicio', inicio); set('horarioFim', fim); addUser(`${inicio} às ${fim}`); ir('evento_local'); }} />
    );

    if (step === 'evento_local') return (
      <StepLocal onConfirm={(cidade, local) => { set('cidade', cidade); set('local', local); addUser(`${cidade}${local ? ` — ${local}` : ''}`); ir('evento_visitantes'); }} />
    );

    if (step === 'evento_visitantes') return (
      <StepInput botText="**Quantas pessoas** participarão por dia?" type="number" placeholder="Ex: 500" min="1"
        onConfirm={val => { set('visitantesPorDia', val); addUser(`${val} pessoas/dia`); ir('produtor_pergunta'); }} />
    );

    // ── PRODUTOR ────────────────────────────────────────────────────────────
    if (step === 'produtor_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Gostaria de um **Produtor de Eventos** dedicado para coordenar tudo no dia?</BotMsg>
        <Btn onClick={() => { addUser('Sim'); set('temProdutor', true); ir('estrutura_pergunta', 'Ótimo! Um Produtor Executivo será alocado.'); }}>Sim</Btn>
        <Btn onClick={() => { addUser('Não'); set('temProdutor', false); ir('estrutura_pergunta'); }}>Não</Btn>
      </div>
    );

    // ── ESTRUTURA ───────────────────────────────────────────────────────────
    if (step === 'estrutura_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Vai precisar de alguma **estrutura física**? *(palco, tendas, backdrop, iluminação...)*</BotMsg>
        <Btn onClick={async () => { addUser('Sim'); await carregarTipo('estrutura', setListaEstrutura); ir('estrutura_selecao'); }}>Sim</Btn>
        <Btn onClick={() => { addUser('Não'); ir('equipe_pergunta'); }}>Não</Btn>
      </div>
    );

    if (step === 'estrutura_selecao') return (
      <StepMultiSelect botText="Selecione os itens de **estrutura** que você precisa:" servicos={listaEstrutura} loading={loadingOpcoes}
        onConfirm={escolhidos => { addUser(escolhidos.map(s => s.serviceName).join(', ')); setListaEstrutura(escolhidos); ir('estrutura_opcoes'); }}
        onSkip={() => { addUser('Não preciso de estrutura'); ir('equipe_pergunta'); }} />
    );

    if (step === 'estrutura_opcoes') return (
      <StepOpcoes servicos={listaEstrutura} tipo="estrutura"
        onConfirm={sels => { set('estruturaSelecionada', sels); ir('equipe_pergunta'); }} />
    );

    // ── EQUIPE ──────────────────────────────────────────────────────────────
    if (step === 'equipe_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Vai precisar de algum **profissional** no evento? *(recepcionista, segurança, DJ...)*</BotMsg>
        <Btn onClick={async () => { addUser('Sim'); await carregarTipo('operacao', setListaEquipe); ir('equipe_selecao'); }}>Sim</Btn>
        <Btn onClick={() => { addUser('Não'); ir('gastro_pergunta'); }}>Não</Btn>
      </div>
    );

    if (step === 'equipe_selecao') return (
      <StepMultiSelect botText="Selecione os **profissionais** que você precisa:" servicos={listaEquipe} loading={loadingOpcoes}
        onConfirm={escolhidos => { addUser(escolhidos.map(s => s.serviceName).join(', ')); setListaEquipe(escolhidos); ir('equipe_opcoes'); }}
        onSkip={() => { addUser('Não preciso de equipe'); ir('gastro_pergunta'); }} />
    );

    if (step === 'equipe_opcoes') return (
      <StepOpcoes servicos={listaEquipe} tipo="operacao"
        onConfirm={sels => { set('equipeSelecionada', sels); ir('equipe_detalhes'); }} />
    );

    if (step === 'equipe_detalhes') return (
      <StepEquipeDetalhes equipe={dados.equipeSelecionada}
        onConfirm={detalhes => { set('equipeDetalhes', detalhes); ir('gastro_pergunta'); }} />
    );

    // ── GASTRONOMIA ─────────────────────────────────────────────────────────
    if (step === 'gastro_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Vai precisar de **alimentação ou bebidas**?</BotMsg>
        <Btn onClick={async () => { addUser('Sim'); await carregarTipo('gastronomia', setListaGastro); ir('gastro_selecao'); }}>Sim</Btn>
        <Btn onClick={() => { addUser('Não'); ir('servicos_pergunta'); }}>Não</Btn>
      </div>
    );

    if (step === 'gastro_selecao') return (
      <StepMultiSelect botText="Selecione os serviços de **gastronomia**:" servicos={listaGastro} loading={loadingOpcoes}
        onConfirm={escolhidos => { addUser(escolhidos.map(s => s.serviceName).join(', ')); setListaGastro(escolhidos); ir('gastro_opcoes'); }}
        onSkip={() => { addUser('Não preciso de gastronomia'); ir('servicos_pergunta'); }} />
    );

    if (step === 'gastro_opcoes') return (
      <StepOpcoes servicos={listaGastro} tipo="gastronomia"
        onConfirm={sels => { set('gastronomeSelecionada', sels); ir('servicos_pergunta'); }} />
    );

    // ── SERVIÇOS / ENTRETENIMENTO ────────────────────────────────────────────
    if (step === 'servicos_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BotMsg>Vai precisar de algum **equipamento ou atração**? *(som, iluminação, DJ, fotografia...)*</BotMsg>
        <Btn onClick={async () => { addUser('Sim'); await carregarTipo('entretenimento', setListaServicos); ir('servicos_selecao'); }}>Sim</Btn>
        <Btn onClick={() => { addUser('Não'); ir('info_extra'); }}>Não</Btn>
      </div>
    );

    if (step === 'servicos_selecao') return (
      <StepMultiSelect botText="Selecione os **equipamentos e atrações**:" servicos={listaServicos} loading={loadingOpcoes}
        onConfirm={escolhidos => { addUser(escolhidos.map(s => s.serviceName).join(', ')); setListaServicos(escolhidos); ir('servicos_opcoes'); }}
        onSkip={() => { addUser('Não preciso'); ir('info_extra'); }} />
    );

    if (step === 'servicos_opcoes') return (
      <StepOpcoes servicos={listaServicos} tipo="entretenimento"
        onConfirm={sels => { set('servicosSelecionados', sels); ir('info_extra'); }} />
    );

    // ── INFO EXTRA ──────────────────────────────────────────────────────────
    if (step === 'info_extra') return (
      <StepTextarea botText="Falta alguma informação ou pedido especial que queira acrescentar?" optional
        placeholder="Ex: acessibilidade, tema específico, restrições de marca..."
        onConfirm={val => { set('infoExtra', val); if (val.trim()) addUser(val); ir('pagamento'); }} />
    );

    // ── PAGAMENTO ───────────────────────────────────────────────────────────
    if (step === 'pagamento') {
      const opcoes = [
        { label: '50% na entrada + 50% no final do evento', valor: '50_50' },
        { label: '30, 60 e 90 dias',                        valor: '30_60_90' },
        { label: 'À vista',                                  valor: 'a_vista' },
      ];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <BotMsg>Última etapa! Como prefere a **forma de pagamento**?</BotMsg>
          {opcoes.map(op => <Btn key={op.valor} onClick={() => { set('formaPagamento', op.valor); addUser(op.label); ir('revisao'); }}>{op.label}</Btn>)}
        </div>
      );
    }

    // ── REVISÃO ─────────────────────────────────────────────────────────────
    if (step === 'revisao') {
      const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados];
      const labelPag = { '50_50': '50% + 50%', '30_60_90': '30/60/90 dias', 'a_vista': 'À vista' };
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <BotMsg>Perfeito! Aqui está o resumo do seu pedido. Confirma?</BotMsg>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,180,255,0.12)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dados.tipoEstande && <Row label="Stand" value={dados.tipoEstande === 'modular' ? `Modular — ${modeloSelecionado?.nome || ''}` : `Personalizado`} />}
            <Row label="Empresa" value={dados.nomeEmpresa} />
            <Row label="Evento"  value={`${dados.tipoEvento}${dados.nomeEvento ? ` — ${dados.nomeEvento}` : ''}`} />
            <Row label="Data"    value={`${dados.dataInicio ? new Date(dados.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : ''} → ${dados.dataFim ? new Date(dados.dataFim + 'T12:00:00').toLocaleDateString('pt-BR') : ''}`} />
            <Row label="Horário" value={`${dados.horarioInicio} às ${dados.horarioFim}`} />
            <Row label="Local"   value={`${dados.cidade}${dados.local ? ` — ${dados.local}` : ''}`} />
            <Row label="Pessoas" value={`${dados.visitantesPorDia}/dia`} />
            {dados.temProdutor && <Row label="Produtor" value="Sim" />}
            {todas.length > 0 && <Row label="Serviços" value={todas.map(s => `${s.serviceName}${s.opcaoNome ? ` (${s.opcaoNome})` : ''}`).join(' · ')} />}
            {dados.infoExtra && <Row label="Obs" value={dados.infoExtra} />}
            <Row label="Pagamento" value={labelPag[dados.formaPagamento] || dados.formaPagamento} />
          </div>
          <Btn variant="solid" disabled={submitting} onClick={handleConfirm}>
            {submitting ? 'Enviando...' : 'Confirmar e Enviar Proposta →'}
          </Btn>
          <Btn onClick={() => ir('stand_pergunta')}>Recomeçar do início</Btn>
        </div>
      );
    }

    // ── ENVIADO ─────────────────────────────────────────────────────────────
    if (step === 'sent') return (
      <div style={{ textAlign: 'center', padding: '30px 20px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <div style={{ fontSize: 48 }}>🎉</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif' }}>Proposta enviada com sucesso!</div>
        <div style={{ fontSize: 13, color: '#7BAFD4', lineHeight: 1.6, fontFamily: 'Outfit, sans-serif' }}>
          Nossa equipe recebeu seu briefing e em breve um coordenador entrará em contato.
        </div>
        <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Fechar</button>
      </div>
    );

    return null;
  };

  return (
    <Overlay onClose={onClose}>
      <Header assistantName={assistantName} onClose={onClose} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px', scrollBehavior: 'smooth' }}>
        {historico.map((msg, i) =>
          msg.role === 'bot' ? <BotMsg key={i}>{msg.text}</BotMsg> : <UserMsg key={i}>{msg.text}</UserMsg>
        )}
        {renderStep()}
        <div ref={bottomRef} />
      </div>
    </Overlay>
  );
}
