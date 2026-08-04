import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, serverTimestamp, query, where, runTransaction, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

// ─────────────────────────────────────────────────────────────────────────────
// ClienteChatV4 — motor de chat orientado a dados (lê o Firestore em vez de
// texto fixo no código). Arquivo 100% novo — o ClienteChat.js original
// continua existindo intocado. Reaproveita os MESMOS componentes visuais e a
// MESMA lógica final de envio (montarBriefingJson/handleConfirm), só a forma
// de decidir "qual pergunta vem agora" que é diferente (lê a árvore do banco
// em vez deif/else fixos).
// ─────────────────────────────────────────────────────────────────────────────

const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const HORARIOS = ['06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00','22:30','23:00','23:30'];

// ── Componentes base (idênticos ao ClienteChat.js) ───────────────────────────
const Pergunta = ({ children, subtitulo }) => (
  <div>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif', lineHeight: 1.4, marginBottom: subtitulo ? 8 : 28, textAlign: 'center' }}
      dangerouslySetInnerHTML={{ __html: (typeof children === 'string' ? children : '').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#00E5C4">$1</strong>').replace(/\n/g, '<br/>') }} />
    {subtitulo && <div style={{ fontSize: 13, color: '#7BAFD4', textAlign: 'center', marginBottom: 28 }}>{subtitulo}</div>}
  </div>
);

const OpcaoBtn = ({ onClick, children, selected }) => (
  <button onClick={onClick} style={{
    width: '100%', padding: '14px 20px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
    fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, transition: 'all 0.15s',
    border: `1.5px solid ${selected ? '#00E5C4' : 'rgba(0,180,255,0.2)'}`,
    background: selected ? 'rgba(0,229,196,0.08)' : 'rgba(255,255,255,0.03)',
    color: selected ? '#00E5C4' : '#7BAFD4',
    display: 'flex', alignItems: 'center', gap: 12,
  }}>
    <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected ? '#00E5C4' : 'rgba(0,180,255,0.3)'}`, background: selected ? '#00E5C4' : 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0A1626' }} />}
    </span>
    {children}
  </button>
);

const CheckOpcao = ({ checked, onClick, children }) => (
  <button onClick={onClick} style={{
    width: '100%', padding: '14px 20px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
    fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, transition: 'all 0.15s',
    border: `1.5px solid ${checked ? '#00E5C4' : 'rgba(0,180,255,0.2)'}`,
    background: checked ? 'rgba(0,229,196,0.08)' : 'rgba(255,255,255,0.03)',
    color: checked ? '#00E5C4' : '#7BAFD4',
    display: 'flex', alignItems: 'center', gap: 12,
  }}>
    <span style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? '#00E5C4' : 'rgba(0,180,255,0.3)'}`, background: checked ? '#00E5C4' : 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#0A1626', fontWeight: 700 }}>
      {checked && '✓'}
    </span>
    {children}
  </button>
);

const BtnAvancar = ({ onClick, disabled, children = 'Continuar →', submitting }) => (
  <button onClick={onClick} disabled={disabled || submitting} style={{
    padding: '14px 40px', borderRadius: 12, border: 'none',
    background: disabled ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg,#00E5C4,#0080FF)',
    color: disabled ? 'rgba(123,175,212,0.4)' : 'white',
    fontSize: 15, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'Outfit, sans-serif', transition: 'all 0.2s',
    boxShadow: disabled ? 'none' : '0 4px 20px rgba(0,229,196,0.25)',
  }}>{submitting ? 'Enviando...' : children}</button>
);

const Inp = ({ value, onChange, placeholder, type = 'text', min, max, onKeyDown, autoFocus }) => (
  <input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} min={min} max={max} autoFocus={autoFocus} lang="pt-BR"
    style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1.5px solid rgba(0,180,255,0.25)', background: 'rgba(255,255,255,0.05)', color: '#E8F4FF', fontSize: 16, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
);

// Lista completa de estados — usada no seletor de Estado do evento, pra
// conseguir comparar com a região de atendimento cadastrada pelo fornecedor
// (FornecedorServicos.js), que hoje é uma lista fixa de estados/regiões.
const ESTADOS_BR = [
  'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal',
  'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul',
  'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
  'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia',
  'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins',
];

// Compara o Estado do evento com a Região de atendimento do fornecedor
// (REGIOES em FornecedorServicos.js). "Nacional" atende qualquer estado;
// "São Paulo - Capital/Interior" contam como o estado São Paulo; os demais
// nomes da lista batem 1:1 com o estado; "Outros" é o resto (estados que não
// têm região própria cadastrável ainda, ex: os da região Norte/Nordeste).
const ESTADOS_COM_REGIAO_PROPRIA = ['São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Paraná', 'Santa Catarina', 'Rio Grande do Sul', 'Bahia', 'Goiás', 'Distrito Federal'];
const estadoBateComRegiao = (estadoEvento, regiaoFornecedor) => {
  if (!regiaoFornecedor) return true; // sem região cadastrada — não filtra (compatibilidade)
  if (regiaoFornecedor === 'Nacional') return true;
  if (!estadoEvento) return true; // evento sem estado informado — não filtra (compatibilidade)
  if (regiaoFornecedor === 'São Paulo - Capital' || regiaoFornecedor === 'São Paulo - Interior') return estadoEvento === 'São Paulo';
  if (regiaoFornecedor === 'Outros') return !ESTADOS_COM_REGIAO_PROPRIA.includes(estadoEvento);
  return regiaoFornecedor === estadoEvento;
};

const Row = ({ label, value }) => value ? (
  <div style={{ display: 'flex', gap: 10 }}>
    <span style={{ fontSize: 11, fontWeight: 700, color: '#7BAFD4', minWidth: 90, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 2 }}>{label}</span>
    <span style={{ fontSize: 13, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif', flex: 1, lineHeight: 1.5 }}>{value}</span>
  </div>
) : null;

const ModeloCarrossel = ({ fotos, idx, onPrev, onNext, onDot }) => (
  <div style={{ position: 'relative', height: '100%' }}>
    <img src={fotos[idx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    {fotos.length > 1 && <>
      <button onClick={e => { e.stopPropagation(); onPrev(); }} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', fontSize: 14 }}>‹</button>
      <button onClick={e => { e.stopPropagation(); onNext(); }} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', fontSize: 14 }}>›</button>
      <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
        {fotos.map((_, i) => <div key={i} onClick={e => { e.stopPropagation(); onDot(i); }} style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? 'white' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }} />)}
      </div>
    </>}
  </div>
);

// ── Steps de input (idênticos ao ClienteChat.js) ─────────────────────────────
const StepInputSimples = ({ placeholder, type, min, onConfirm, optional, autoFocus }) => {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <Inp type={type||'text'} value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} min={min} autoFocus={autoFocus}
        onKeyDown={e => { if (e.key === 'Enter' && (val || optional)) onConfirm(val); }} />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={() => onConfirm(val)} disabled={!val && !optional}>{optional && !val ? 'Pular →' : 'Continuar →'}</BtnAvancar>
      </div>
    </div>
  );
};

const StepTextareaSimples = ({ placeholder, optional, onConfirm }) => {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <textarea value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1.5px solid rgba(0,180,255,0.25)', background: 'rgba(255,255,255,0.05)', color: '#E8F4FF', fontSize: 15, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 100, boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={() => onConfirm(val)} disabled={!val && !optional}>{optional && !val ? 'Nada a acrescentar →' : 'Continuar →'}</BtnAvancar>
      </div>
    </div>
  );
};

const StepHorarioInline = ({ onConfirm }) => {
  const [inicio, setInicio] = useState('');
  const [fim, setFim]       = useState('');
  const selStyle = { width: '100%', padding: '14px', borderRadius: 12, border: '1.5px solid rgba(0,180,255,0.25)', background: 'rgba(10,22,38,0.95)', color: '#E8F4FF', fontSize: 15, fontFamily: 'Outfit, sans-serif', outline: 'none', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, textTransform: 'uppercase' }}>Início</div>
          <select value={inicio} onChange={e => setInicio(e.target.value)} style={selStyle}>
            <option value="">--</option>{HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
          </select></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, textTransform: 'uppercase' }}>Término</div>
          <select value={fim} onChange={e => setFim(e.target.value)} style={selStyle}>
            <option value="">--</option>{HORARIOS.filter(h => !inicio || h > inicio).map(h => <option key={h} value={h}>{h}</option>)}
          </select></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={() => onConfirm(inicio, fim)} disabled={!inicio || !fim || fim <= inicio} />
      </div>
    </div>
  );
};

const StepLocalInline = ({ onConfirm }) => {
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [local, setLocal]   = useState('');
  const selStyle = { width: '100%', padding: '14px', borderRadius: 12, border: '1.5px solid rgba(0,180,255,0.25)', background: 'rgba(10,22,38,0.95)', color: '#E8F4FF', fontSize: 15, fontFamily: 'Outfit, sans-serif', outline: 'none', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <Inp value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade" autoFocus />
      <select value={estado} onChange={e => setEstado(e.target.value)} style={selStyle}>
        <option value="">Estado...</option>
        {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
      </select>
      <Inp value={local}  onChange={e => setLocal(e.target.value)}  placeholder="Local / endereço (opcional)" />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={() => onConfirm(cidade, local, estado)} disabled={!cidade || !estado} />
      </div>
    </div>
  );
};

// Calendário visual — clica no dia e já confirma, sem depender do navegador
// nem do sistema operacional pro formato (o input nativo type="date" mostra
// no idioma do aparelho, então não dava pra garantir dia/mês/ano só com
// CSS/atributo).
const MESES_BR = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA_BR = ['D','S','T','Q','Q','S','S'];
const StepCalendarBR = ({ onConfirm }) => {
  const hoje = new Date();
  const [mesAtual, setMesAtual] = useState(hoje.getMonth());
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear());
  const [selecionado, setSelecionado] = useState(null);

  const primeiroDiaSemana = new Date(anoAtual, mesAtual, 1).getDay();
  const diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
  const celulas = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];

  const mudarMes = (delta) => {
    let m = mesAtual + delta, a = anoAtual;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    setMesAtual(m); setAnoAtual(a);
  };

  const escolherDia = (d) => {
    if (!d) return;
    const valor = `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    setSelecionado(valor);
    onConfirm(valor);
  };

  return (
    <div style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(0,180,255,0.2)', borderRadius: 14, padding: 16, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => mudarMes(-1)} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 20, cursor: 'pointer', padding: '4px 10px' }}>‹</button>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#E8F4FF' }}>{MESES_BR[mesAtual]} {anoAtual}</div>
        <button onClick={() => mudarMes(1)} style={{ background: 'none', border: 'none', color: '#7BAFD4', fontSize: 20, cursor: 'pointer', padding: '4px 10px' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {DIAS_SEMANA_BR.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, color: 'rgba(123,175,212,0.55)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {celulas.map((d, i) => {
          const valorCel = d ? `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
          const isSel = !!valorCel && valorCel === selecionado;
          return (
            <div key={i} onClick={() => escolherDia(d)}
              style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: d ? 'pointer' : 'default', fontSize: 13, color: !d ? 'transparent' : (isSel ? '#0D1B2A' : '#E8F4FF'), background: isSel ? '#00E5C4' : 'transparent', fontWeight: isSel ? 700 : 400 }}>
              {d || '·'}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StepDescricaoInline = ({ onConfirm }) => {
  const [desc, setDesc] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Stand em L, balcão de atendimento, iluminação LED azul..."
        style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1.5px solid rgba(0,180,255,0.25)', background: 'rgba(255,255,255,0.05)', color: '#E8F4FF', fontSize: 15, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 100, boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={() => onConfirm(desc)} disabled={!desc.trim()} />
      </div>
    </div>
  );
};

const StepMultiSelect = ({ servicos, loading, onConfirm, onSkip }) => {
  const [sel, setSel] = useState({});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      {loading
        ? <div style={{ color: '#7BAFD4', fontSize: 14, textAlign: 'center', padding: 20 }}>Carregando...</div>
        : servicos.map(s => <CheckOpcao key={s.id} checked={!!sel[s.id]} onClick={() => setSel(p => ({ ...p, [s.id]: !p[s.id] }))}>{s.serviceName}</CheckOpcao>)
      }
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={onSkip} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Não preciso</button>
        <BtnAvancar onClick={() => { const e = servicos.filter(s => sel[s.id]); e.length > 0 ? onConfirm(e) : onSkip(); }}>Confirmar →</BtnAvancar>
      </div>
    </div>
  );
};

const StepOpcoes = ({ servicos, onConfirm }) => {
  const [idx, setIdx]   = useState(0);
  const [sels, setSels] = useState([]);
  const servAtual = servicos[idx];
  if (!servAtual) { onConfirm(sels); return null; }
  const avancar = (op) => {
    const novo = op ? [...sels, {
      supplierId: servAtual.supplierId, supplierName: servAtual.supplierName || '',
      serviceName: servAtual.serviceName, serviceParentName: servAtual.serviceParentName || '',
      tipoServico: servAtual.tipoServico, id: servAtual.id,
      opcaoCatalogoId: op.id || '', opcaoNome: op.nome || '',
      valor: op.valor || 0, unidade: op.unidade || '',
      diasPreparo: op.diasPreparo || 0, diasMontagem: op.diasMontagem || 0,
    }] : sels;
    if (idx + 1 < servicos.length) { setSels(novo); setIdx(i => i + 1); }
    else onConfirm(novo);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <Pergunta>{`Opções disponíveis para **${servAtual.serviceName}**${servicos.length > 1 ? ` (${idx + 1}/${servicos.length})` : ''}:`}</Pergunta>
      {servAtual.opcoes.map(op => (
        <OpcaoBtn key={op.id} onClick={() => avancar(op)}>
          <span>{op.nome}{op.caracteristica ? ` — ${op.caracteristica}` : ''}</span>
        </OpcaoBtn>
      ))}
      <OpcaoBtn onClick={() => avancar(null)}>Não preciso de {servAtual.serviceName}</OpcaoBtn>
    </div>
  );
};

const StepEquipeDetalhes = ({ equipe, onConfirm }) => {
  const [idx, setIdx]     = useState(0);
  const [qtd, setQtd]     = useState('');
  const [horas, setHoras] = useState('');
  const [diasD, setDiasD] = useState('');
  const [obs, setObs]     = useState('');
  const [det, setDet]     = useState({});
  const serv = equipe[idx];
  if (!serv) { onConfirm(det); return null; }
  const avancar = () => {
    const novo = { ...det, [serv.serviceName]: { quantidade: qtd, horasPorDia: horas, dias: diasD, observacoes: obs } };
    setDet(novo);
    if (idx + 1 < equipe.length) { setIdx(i => i + 1); setQtd(''); setHoras(''); setDiasD(''); setObs(''); }
    else onConfirm(novo);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <Pergunta>{`Detalhes para **${serv.serviceName}**${equipe.length > 1 ? ` (${idx + 1}/${equipe.length})` : ''}`}</Pergunta>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, textTransform: 'uppercase' }}>Quantos?</div><Inp type="number" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="2" min="1" /></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, textTransform: 'uppercase' }}>Horas/dia</div><Inp type="number" value={horas} onChange={e => setHoras(e.target.value)} placeholder="8" min="1" /></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, textTransform: 'uppercase' }}>Dias</div><Inp type="number" value={diasD} onChange={e => setDiasD(e.target.value)} placeholder="3" min="1" /></div>
      </div>
      <Inp value={obs} onChange={e => setObs(e.target.value)} placeholder="Preferência específica (opcional)" />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={avancar} disabled={!qtd && !horas && !diasD} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function ClienteChatV4({ userData, onClose, tenant }) {
  const userName = userData?.name || userData?.displayName || 'Cliente';
  const userId   = userData?.uid  || userData?.id || '';
  const tenantId = tenant?.id || userData?.tenantId || null;
  const perfilQuemResponde = tenantId ? 'franqueado' : 'cliente_comum';

  // ── Carregamento das perguntas/tipos do Firestore ──────────────────────────
  const [carregando, setCarregando]   = useState(true);
  const [perguntasMap, setPerguntasMap] = useState({}); // id -> pergunta
  const [tiposEvento, setTiposEvento] = useState([]);
  const [erroCarga, setErroCarga]     = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pSnap, tSnap] = await Promise.all([
          getDocs(collection(db, 'perguntas')),
          getDocs(collection(db, 'tiposEvento')),
        ]);
        const map = {};
        pSnap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
        setPerguntasMap(map);
        setTiposEvento(tSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.ativo !== false));
      } catch (e) { console.error(e); setErroCarga(true); }
      finally { setCarregando(false); }
    })();
  }, []);

  const filhosDe = (paiId, valorResposta) => Object.values(perguntasMap)
    .filter(p => p.perguntaPaiId === paiId && p.ativo !== false)
    .filter(p => (p.condicaoRespostaPai == null || p.condicaoRespostaPai === valorResposta))
    .filter(p => p.quemResponde === 'todos' || p.quemResponde === perfilQuemResponde)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  // ── Estado do fluxo ──────────────────────────────────────────────────────
  const raizPergunta = Object.values(perguntasMap).find(p => p.destino === 'raiz.tipoEvento');
  const [tipoEscolhidoId, setTipoEscolhidoId] = useState(null);
  const [topoIdx, setTopoIdx]       = useState(0);   // índice na lista perguntasIds do tipo escolhido
  const [pilha, setPilha]           = useState([]);  // navegação dentro de sub-perguntas
  const [stepAtualId, setStepAtualId] = useState('raiz'); // 'raiz' | 'sent' | id de pergunta | 'revisao'
  const [passoEspecial, setPassoEspecial] = useState(null); // 'equipe_detalhes' | 'vestuario_recepcao'
  const [historicoNav, setHistoricoNav] = useState([]); // pra permitir "voltar"

  const [submitting, setSubmitting] = useState(false);
  const [loadingOpcoes, setLoadingOpcoes] = useState(false);
  const [listaCatalogo, setListaCatalogo] = useState([]); // lista genérica usada pelo passo de catálogo atual
  const [faseCatalogo, setFaseCatalogo]   = useState('selecao'); // 'selecao' | 'opcoes'
  const [opcoesEspecifico, setOpcoesEspecifico] = useState(null); // null = ainda não carregou; [] = carregou e não achou nada
  const [loadingEspecifico, setLoadingEspecifico] = useState(false);
  const [faseEspecifico, setFaseEspecifico] = useState('pergunta'); // 'pergunta' (Sim/Não) | 'opcoes' (mostra o catálogo)

  const [dados, setDados] = useState({
    temStand: null, tipoEstande: null, standDescricao: '', standImagensUrls: [],
    areaM2: '', alturaTeto: '', diasMontagem: '', restricoes: '', identidadeVisual: null, identidadeImagensUrls: [],
    nomeEmpresa: tenantId ? (userData?.companyName || '') : '', tipoEvento: '', nomeEvento: '', dataInicio: '', dataFim: '',
    horarioInicio: '', horarioFim: '', cidade: '', estado: '', local: '', visitantesPorDia: '',
    temProdutor: null,
    estruturaSelecionada: [], equipeSelecionada: [], gastronomeSelecionada: [], servicosSelecionados: [], especificosSelecionados: [],
    respostasGenericas: {}, // { [perguntaId]: valor } — respostas de perguntas soltas (Sim/Não, Múltipla Escolha sem destino fixo)
    equipeDetalhes: {}, infoExtra: '', formaPagamento: '',
  });
  const [modelosEspeciais, setModelosEspeciais] = useState([]);
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [carrosselIdx, setCarrosselIdx] = useState({});
  const [uploadingArquivo, setUploadingArquivo] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    getDocs(collection(db, 'modelosEspeciais')).then(snap => {
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.ativo !== false);
      setModelosEspeciais(tenantId ? todos.filter(m => !m.exclusiveTenants?.length || m.exclusiveTenants.includes(tenantId)) : todos);
    }).catch(console.error);
  }, [tenantId]);

  const set = (key, val) => setDados(p => ({ ...p, [key]: val }));

  const DESTINO_PARA_SETOR = { 'catalogo.estrutura': 'estrutura', 'catalogo.equipe': 'operacao', 'catalogo.gastronomia': 'gastronomia', 'catalogo.entretenimento': 'entretenimento' };
  const DESTINO_PARA_CAMPO_SEL = { 'catalogo.estrutura': 'estruturaSelecionada', 'catalogo.equipe': 'equipeSelecionada', 'catalogo.gastronomia': 'gastronomeSelecionada', 'catalogo.entretenimento': 'servicosSelecionados' };
  const BLOQUEADOS_ESTRUTURA = ['estande', 'stand', 'desenvolvimento'];
  const BLOQUEADOS_EQUIPE    = ['produtor', 'roupa', 'vestuario', 'vestuário'];

  const carregarCatalogo = async (setor, categoriaFiltro) => {
    setLoadingOpcoes(true);
    try {
      const snap = await getDocs(query(collection(db, 'supplierServices'), where('tipoServico', '==', setor)));
      const servs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
      const bloqueados = setor === 'estrutura' ? BLOQUEADOS_ESTRUTURA : setor === 'operacao' ? BLOQUEADOS_EQUIPE : [];
      const filtrados = servs.filter(s => {
        const nome = normalize(s.serviceName || '') + ' ' + normalize(s.serviceParentName || '');
        if (bloqueados.some(b => nome.includes(b))) return false;
        if (categoriaFiltro && !normalize(s.serviceParentName || '').includes(normalize(categoriaFiltro))) return false;
        if (tenantId) { const exc = s.exclusiveTenants || []; if (exc.length > 0 && !exc.includes(tenantId)) return false; }
        return true;
      });
      const comOpcoes = await Promise.all(filtrados.map(async s => {
        const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
        const opsForn = opSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.ativo !== false)
          // Só mostra opções cuja região de atendimento bate com o Estado do evento
          .filter(o => estadoBateComRegiao(dados.estado, o.regiao));
        const opsEnriquecidas = await Promise.all(opsForn.map(async opForn => {
          if (opForn.opcaoCatalogoId && s.serviceId) {
            try {
              const catSnap = await getDocs(collection(db, 'services', s.serviceId, 'opcoes'));
              const opCat = catSnap.docs.find(cd => cd.id === opForn.opcaoCatalogoId);
              if (opCat) return { ...opForn, valor: opCat.data().valor ?? 0, unidade: opCat.data().unidade ?? '', nome: opForn.nome || opCat.data().nome || '' };
            } catch (e) { console.error(e); }
          }
          return opForn;
        }));
        return { ...s, opcoes: opsEnriquecidas };
      }));
      setListaCatalogo(comOpcoes.filter(s => s.opcoes.length > 0));
    } catch (e) { console.error(e); setListaCatalogo([]); }
    finally { setLoadingOpcoes(false); }
  };

  // Carrega as opções de UM serviço específico (Área>Categoria>Sub-Serviço
  // escolhidos no Banco de Perguntas) — usado pelas perguntas tipo
  // "catalogo_especifico". Mais direto que carregarCatalogo: não navega por
  // categoria, já busca os fornecedores desse serviço exato e mostra as
  // opções deles direto, já filtradas por região (Estado do evento).
  const carregarServicoEspecifico = async (servicoId) => {
    setLoadingEspecifico(true);
    try {
      const snap = await getDocs(query(collection(db, 'supplierServices'), where('serviceId', '==', servicoId)));
      const servs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false)
        .filter(s => { if (tenantId) { const exc = s.exclusiveTenants || []; if (exc.length > 0 && !exc.includes(tenantId)) return false; } return true; });
      const todasOpcoes = [];
      for (const s of servs) {
        const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
        const opsForn = opSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.ativo !== false)
          .filter(o => estadoBateComRegiao(dados.estado, o.regiao));
        for (const opForn of opsForn) {
          let opFinal = opForn;
          if (opForn.opcaoCatalogoId && s.serviceId) {
            try {
              const catSnap = await getDocs(collection(db, 'services', s.serviceId, 'opcoes'));
              const opCat = catSnap.docs.find(cd => cd.id === opForn.opcaoCatalogoId);
              if (opCat) opFinal = { ...opForn, valor: opCat.data().valor ?? 0, unidade: opCat.data().unidade ?? '', nome: opForn.nome || opCat.data().nome || '' };
            } catch (e) { console.error(e); }
          }
          todasOpcoes.push({ ...opFinal, serviceName: s.serviceName, serviceParentName: s.serviceParentName, tipoServico: s.tipoServico, supplierId: s.supplierId, supplierName: s.supplierName, opcaoNome: opFinal.nome || '' });
        }
      }
      setOpcoesEspecifico(todasOpcoes);
    } catch (e) { console.error(e); setOpcoesEspecifico([]); }
    finally { setLoadingEspecifico(false); }
  };

  const handleUpload = async (files, campo) => {
    if (!files?.length) return;
    setUploadingArquivo(true);
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        const r = storageRef(storage, `briefings/${userId}/${Date.now()}_${file.name}`);
        await uploadBytes(r, file);
        urls.push(await getDownloadURL(r));
      }
      set(campo, urls);
    } catch (e) { console.error(e); alert('Erro ao enviar imagens.'); }
    finally { setUploadingArquivo(false); }
  };

  // ── Navegação: avança pra "próximo" dado a resposta da pergunta atual ──────
  const empilharHistorico = () => setHistoricoNav(h => [...h, {
    tipoEscolhidoId, topoIdx, pilha, stepAtualId, passoEspecial, dados, faseCatalogo,
  }]);

  const voltar = () => {
    if (historicoNav.length === 0) return;
    const prev = historicoNav[historicoNav.length - 1];
    setHistoricoNav(h => h.slice(0, -1));
    setTipoEscolhidoId(prev.tipoEscolhidoId); setTopoIdx(prev.topoIdx); setPilha(prev.pilha);
    setStepAtualId(prev.stepAtualId); setPassoEspecial(prev.passoEspecial); setDados(prev.dados);
    setFaseCatalogo(prev.faseCatalogo);
  };

  const avancarDaRaiz = (tipoId) => {
    empilharHistorico();
    setTipoEscolhidoId(tipoId);
    setTopoIdx(0);
    setPilha([]);
    const tipo = tiposEvento.find(t => t.id === tipoId);
    const primeiraId = tipo?.perguntasIds?.[0];
    if (primeiraId) setStepAtualId(primeiraId); else setStepAtualId('revisao');
  };

  // Checa se a "condicaoExibicao" de uma pergunta condicional foi atendida —
  // olha o campo já respondido (via DESTINO_PARA_CAMPO_SEL, se for catálogo,
  // ou o valor direto salvo em "dados", se for múltipla escolha/sim-não) e
  // procura o texto configurado (contemTexto) dentro dele.
  const condicaoAtendida = (pergunta) => {
    const cond = pergunta.condicaoExibicao;
    if (!cond || !cond.verificarDestino) return true;
    const alvo = normalize(cond.contemTexto || '');
    // Pergunta solta (Sim/Não ou Múltipla Escolha sem destino fixo) — cada uma
    // tem seu próprio espaço em dados.respostasGenericas, guardado pelo ID.
    if (cond.verificarDestino.startsWith('pergunta:')) {
      const perguntaId = cond.verificarDestino.replace('pergunta:', '');
      const valorBruto = dados.respostasGenericas?.[perguntaId];
      const valorTexto = typeof valorBruto === 'boolean' ? (valorBruto ? 'sim' : 'nao') : String(valorBruto || '');
      return normalize(valorTexto).includes(alvo);
    }
    const campoSel = DESTINO_PARA_CAMPO_SEL[cond.verificarDestino];
    if (campoSel) {
      // destino de catálogo: procura entre os itens escolhidos (serviceName)
      const selecionados = dados[campoSel] || [];
      return selecionados.some(s => normalize(s.serviceName || s.nome || '').includes(alvo));
    }
    // destino de múltipla escolha / sim-não: valor único salvo em "dados"
    const campo = campoDoDestino(cond.verificarDestino);
    const valorBruto = dados[campo];
    // Sim/Não fica salvo como true/false — converte pra texto antes de comparar
    const valorTexto = typeof valorBruto === 'boolean' ? (valorBruto ? 'sim' : 'nao') : String(valorBruto || '');
    return normalize(valorTexto).includes(alvo);
  };

  // Avança pra próxima pergunta de topo (ou revisão, se acabou a lista)
  const proximoTopo = (novoIdx) => {
    const tipo = tiposEvento.find(t => t.id === tipoEscolhidoId);
    const lista = tipo?.perguntasIds || [];
    // pula perguntas que não se aplicam a este perfil (quemResponde) ou cuja
    // condição de exibição (pergunta condicional) não foi atendida
    let i = novoIdx;
    while (i < lista.length) {
      const p = perguntasMap[lista[i]];
      if (p && p.ativo !== false && (p.quemResponde === 'todos' || p.quemResponde === perfilQuemResponde) && condicaoAtendida(p)) break;
      i++;
    }
    setTopoIdx(i);
    setPilha([]);
    if (i < lista.length) setStepAtualId(lista[i]);
    else setStepAtualId('revisao');
  };

  // Chamado quando a pergunta ATUAL (id=perguntaId) foi respondida com valorResposta.
  // dadosExtra é opcional — já grava no "dados" antes de navegar.
  const responder = (perguntaId, valorResposta, dadosExtra) => {
    empilharHistorico();
    if (dadosExtra) setDados(p => ({ ...p, ...dadosExtra }));

    const pergunta = perguntasMap[perguntaId];

    // Gancho especial: depois do catálogo de Equipe, pergunta detalhes por
    // pessoa e (se tiver recepcionista) o vestuário dela — igual ao fluxo
    // original, mantido em código por ser um caso bem específico.
    if (pergunta?.destino === 'catalogo.equipe') {
      setPassoEspecial('equipe_detalhes');
      return;
    }

    const filhos = filhosDe(perguntaId, valorResposta);
    if (filhos.length > 0) {
      setPilha(p => [...p, { lista: filhos, index: 0 }]);
      setStepAtualId(filhos[0].id);
      return;
    }
    avancarNaPilha();
  };

  // Sobe a pilha de sub-perguntas procurando o próximo irmão pendente
  const avancarNaPilha = () => {
    setPilha(pAtual => {
      let p = [...pAtual];
      while (p.length > 0) {
        const topo = p[p.length - 1];
        const novoIndex = topo.index + 1;
        if (novoIndex < topo.lista.length) {
          p[p.length - 1] = { ...topo, index: novoIndex };
          setStepAtualId(topo.lista[novoIndex].id);
          return p;
        }
        p = p.slice(0, -1);
      }
      // acabou a subárvore inteira desta pergunta de topo
      proximoTopo(topoIdx + 1);
      return [];
    });
  };

  // ── Fim do gancho especial de Equipe ────────────────────────────────────────
  // OBS: o desvio automático de "vestuário da recepcionista" que existia aqui
  // foi retirado (01/08/2026) — essa pergunta agora é uma Pergunta Condicional
  // normal (destino catalogo.vestuario), configurada no Banco de Perguntas e
  // posicionada logo depois de "Catálogo — Equipe/Operação" no Tipo de Evento.
  // Ela passa pelo motor de catálogo genérico (mesma lógica de Estrutura/
  // Gastronomia), então já entra no resumo, no orçamento e gera pedido de
  // verdade pro fornecedor — sem precisar de nenhum código especial.
  const finalizarEquipeDetalhes = async (det) => {
    set('equipeDetalhes', det);
    setPassoEspecial(null);
    avancarNaPilha();
  };

  // ── Envio final — idêntico ao ClienteChat.js original ───────────────────────
  const montarBriefingJson = () => {
    const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados, ...dados.especificosSelecionados];
    return {
      evento: { tipo: dados.tipoEvento, nome: dados.nomeEvento, dataInicio: dados.dataInicio, dataFim: dados.dataFim, horario: `${dados.horarioInicio} às ${dados.horarioFim}`, horarioInicio: dados.horarioInicio, horarioFim: dados.horarioFim, cidade: dados.cidade, estado: dados.estado, local: dados.local, endereco: dados.local, visitantesPorDia: parseInt(dados.visitantesPorDia) || 0, nomeEmpresa: dados.nomeEmpresa,
        diasDuracao: (() => { if (dados.dataInicio && dados.dataFim) { const d = Math.round((new Date(dados.dataFim+'T12:00:00') - new Date(dados.dataInicio+'T12:00:00'))/(864e5))+1; return d > 0 ? d : 1; } return 1; })() },
      estrutura: { ativo: dados.temStand === true, tipoEstande: dados.tipoEstande || '', areaM2: parseFloat(dados.areaM2) || 0, alturaTeto: dados.alturaTeto, diasMontagem: parseInt(dados.diasMontagem) || 0, restricoes: dados.restricoes, identidadeVisual: dados.identidadeVisual ? 'sim' : 'nao', identidadeImagensUrls: dados.identidadeImagensUrls, standDescricao: dados.standDescricao, standImagensUrls: dados.standImagensUrls, observacoes: '' },
      tipoEstande: dados.tipoEstande || '', modeloEstande: modeloSelecionado || null,
      equipe: { produtor: { ativo: dados.temProdutor === true, dias: 0, observacoes: '' }, itens: dados.equipeSelecionada.map(s => ({ tipo: s.serviceName, quantidade: parseInt(dados.equipeDetalhes[s.serviceName]?.quantidade) || 1, horasPorDia: parseFloat(dados.equipeDetalhes[s.serviceName]?.horasPorDia) || 0, dias: parseInt(dados.equipeDetalhes[s.serviceName]?.dias) || 0, observacoes: dados.equipeDetalhes[s.serviceName]?.observacoes || '' })) },
      gastronomia: { alimentos: { ativo: dados.gastronomeSelecionada.length > 0, formato: dados.gastronomeSelecionada.map(s => s.serviceName).join(', '), pessoas: parseInt(dados.visitantesPorDia) || 0, restricoes: '', cozinha: false, observacoes: '' }, bar: { ativo: false } },
      servicosNecessarios: todas.map(s => s.serviceName),
      opcoesSelecionadas: todas.map(s => ({ supplierId: s.supplierId, serviceName: s.serviceName, serviceParentName: s.serviceParentName, tipoServico: s.tipoServico, opcaoCatalogoId: s.opcaoCatalogoId || '', nome: s.opcaoNome || '', valor: s.valor || null, unidade: s.unidade || '' })),
      selecoesCatalogo: {}, itensEmAnalise: [], infoExtra: dados.infoExtra, formaPagamento: dados.formaPagamento,
    };
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    const bj = montarBriefingJson();
    try {
      let assignedTo = null, assignedToName = null;
      try {
         const coordSnap = await getDocs(query(collection(db, 'users'), where('roleName', '==', 'Coordenador'), where('tipoConta', '==', 'realize'), where('active', '==', true)));
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

      // Etapas do evento — cópia fixa do Tipo de Evento no momento da criação
      // (se o Tipo for editado depois, projetos já criados não mudam).
      const tipoEscolhido = tiposEvento.find(t => t.id === tipoEscolhidoId);
      const etapasProjeto = (tipoEscolhido?.etapas || []).map(e => ({ id: e.id, nome: e.nome }));

      const budgetRef = await addDoc(collection(db, 'budgets'), {
        clientUserId: userId, clientName: userName,
        eventName: bj.evento?.nome || bj.evento?.tipo || 'Novo Evento', eventTypeName: bj.evento?.tipo || '',
        startDate: bj.evento?.dataInicio || '', endDate: bj.evento?.dataFim || '',
        location: bj.evento?.local || bj.evento?.cidade || '', guestCount: bj.evento?.visitantesPorDia || 0,
        status: 'analyzing', workspaceStage: 'Propostas', isMae: true, numeroPedido,
        briefingData: { ...bj, formaPagamento: dados.formaPagamento },
        financeiro: { formaPagamento: dados.formaPagamento },
        assignedTo, assignedToName, assignedAt: assignedTo ? serverTimestamp() : null,
        tenantId: tenantId || null,
        etapasProjeto,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      try {
        const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados, ...dados.especificosSelecionados];
        const vistos = new Set();
        for (const sel of todas) {
          const key = `${sel.supplierId}__${sel.serviceName}`;
          if (vistos.has(key)) continue; vistos.add(key);
          const isEst = normalize(sel.serviceName).includes('estande') || normalize(sel.serviceParentName || '').includes('estande');
          if (isEst && dados.tipoEstande === 'modular') continue;
          const detEquipe = dados.equipeDetalhes[sel.serviceName] || {};
          await addDoc(collection(db, 'supplierJobs'), {
            supplierId: sel.supplierId, supplierName: sel.supplierName || '', budgetId: budgetRef.id,
            eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '',
            clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '',
            eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '',
            eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '',
            eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0,
            serviceNames: [sel.serviceName], serviceName: sel.serviceName, serviceParentName: sel.serviceParentName || '',
            tipoServico: sel.tipoServico || '',
            opcaoCatalogoId: sel.opcaoCatalogoId || '', opcaoNome: sel.opcaoNome || '',
            preco: sel.valor || 0, unidade: sel.unidade || '',
            diasPreparo: sel.diasPreparo || 0, diasMontagem: sel.diasMontagem || 0,
            quantidade: detEquipe.quantidade ? parseInt(detEquipe.quantidade) : null,
            horasPorDia: detEquipe.horasPorDia ? parseFloat(detEquipe.horasPorDia) : null,
            diasServico: detEquipe.dias ? parseInt(detEquipe.dias) : null,
            observacoes: detEquipe.observacoes || '',
            stage: 'proposta', status: 'draft', createdAt: serverTimestamp(),
          });
        }
        if (dados.temProdutor) {
          const ps = await getDocs(collection(db, 'supplierServices'));
          for (const p of ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => normalize(s.serviceName).includes('produtor') && s.ativo !== false)) {
            await addDoc(collection(db, 'supplierJobs'), { supplierId: p.supplierId, budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '', clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '', eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '', eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '', eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0, serviceName: p.serviceName, serviceParentName: p.serviceParentName || '', tipoServico: p.tipoServico || 'operacao', preco: 0, unidade: '', stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
          }
        }
        if (dados.tipoEstande === 'modular' && modeloSelecionado) {
          const ts = await getDocs(collection(db, 'tiposEspeciais'));
          const tm = ts.docs.map(d => ({ id: d.id, ...d.data() })).find(t => t.id === modeloSelecionado.tipoEspecialId || t.nome?.toLowerCase().includes('modular'));
          // fornecedoresAutorizados agora é por EMPRESA (não por pessoa) —
          // busca todos os colaboradores ativos de cada empresa autorizada e
          // cria a proposta pra cada um deles poder ver/confirmar.
          for (const f of (tm?.fornecedoresAutorizados || [])) {
            const colabSnap = await getDocs(query(collection(db, 'users'), where('supplierId', '==', f.id), where('systemRole', '==', 'fornecedor'), where('active', '==', true)));
            const colaboradores = colabSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            for (const colab of colaboradores) {
              await addDoc(collection(db, 'supplierJobs'), { supplierId: colab.id, supplierName: f.nome || colab.companyName || '', budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '', clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '', eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '', eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '', eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0, serviceName: modeloSelecionado.nome, serviceParentName: tm?.nome || 'Estande Modular', tipoServico: 'estrutura', modeloEspecialId: modeloSelecionado.id, preco: modeloSelecionado.precoBase || 0, unidade: 'por evento', diasPreparo: modeloSelecionado.diasProducao || 0, diasMontagem: 0, stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
            }
          }
        }
        if (dados.tipoEstande === 'personalizado') {
          await addDoc(collection(db, 'supplierJobs'), { supplierId: '', budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '', clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '', eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '', eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '', eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0, serviceName: 'Desenvolvimento de Stand', serviceParentName: 'Estandes Personalizados', tipoServico: 'estrutura', observacoes: dados.standDescricao || 'Cliente solicitou atendimento.', standImagensUrls: dados.standImagensUrls || [], preco: 0, unidade: '', stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
        }
      } catch (e) { console.error('Erro supplierJobs:', e); }

      try {
        const dr = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system: 'Especialista em eventos. PT-BR. Sem markdown.', messages: [{ role: 'user', content: `Parágrafo curto (max 3 linhas) descrevendo o evento.\nEvento:${bj.evento?.nome||bj.evento?.tipo}\nData:${bj.evento?.dataInicio} a ${bj.evento?.dataFim}\nLocal:${bj.evento?.local||bj.evento?.cidade}\nVisitantes:${bj.evento?.visitantesPorDia}\nServiços:${(bj.servicosNecessarios||[]).join(', ')}` }] }) });
        const dd = await dr.json();
        const dt = (dd.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (dt) await updateDoc(doc(db, 'budgets', budgetRef.id), { descricaoBriefing: dt });
      } catch (e) { console.error('Erro descrição:', e); }

      setStepAtualId('sent');
    } catch (err) { console.error(err); alert('Erro ao enviar. Tente novamente.'); }
    finally { setSubmitting(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — genérico, baseado no "tipo" da pergunta atual
  // ─────────────────────────────────────────────────────────────────────────
  const renderPerguntaGenerica = (p) => {
    const opcoesOnClick = (valor) => {
      const valorConvertido = valor === 'sim' ? true : valor === 'nao' ? false : valor;
      const extra = { [campoDoDestino(p.destino)]: valorConvertido };
      if (p.destino === 'generico') extra.respostasGenericas = { ...dados.respostasGenericas, [p.id]: valorConvertido };
      responder(p.id, valor, extra);
    };

    if (p.tipo === 'sim_nao' || p.tipo === 'multipla_escolha') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          {p.opcoes.map(op => (
            <OpcaoBtn key={op.valor} onClick={() => opcoesOnClick(op.valor)}>{op.label}</OpcaoBtn>
          ))}
        </div>
      );
    }
    if (p.tipo === 'texto_livre') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          <StepInputSimples placeholder={p.subtitulo || 'Sua resposta'} autoFocus optional={p.quemResponde !== 'todos'}
            onConfirm={val => responder(p.id, val, { [campoDoDestino(p.destino)]: val })} />
        </div>
      );
    }
    if (p.tipo === 'texto_longo') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          <StepTextareaSimples placeholder={p.subtitulo || ''} optional
            onConfirm={val => responder(p.id, val, { [campoDoDestino(p.destino)]: val })} />
        </div>
      );
    }
    if (p.tipo === 'numero') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          <StepInputSimples type="number" placeholder="0" min="0" autoFocus
            onConfirm={val => responder(p.id, val, { [campoDoDestino(p.destino)]: val })} />
        </div>
      );
    }
    if (p.tipo === 'data') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          <StepCalendarBR
            onConfirm={val => responder(p.id, val, { [campoDoDestino(p.destino)]: val })} />
        </div>
      );
    }
    if (p.tipo === 'horario') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          <StepHorarioInline onConfirm={(inicio, fim) => responder(p.id, null, { horarioInicio: inicio, horarioFim: fim })} />
        </div>
      );
    }
    if (p.tipo === 'localizacao') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          <StepLocalInline onConfirm={(cidade, local, estado) => responder(p.id, null, { cidade, local, estado })} />
        </div>
      );
    }
    if (p.tipo === 'upload') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.ai,.eps" multiple style={{ display: 'none' }}
            onChange={e => handleUpload(e.target.files, campoDoDestino(p.destino))} />
          <button onClick={() => fileInputRef.current.click()} disabled={uploadingArquivo}
            style={{ padding: '16px', borderRadius: 12, border: '1.5px dashed rgba(0,180,255,0.3)', background: 'none', color: '#7BAFD4', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textAlign: 'center' }}>
            {uploadingArquivo ? 'Enviando...' : (dados[campoDoDestino(p.destino)]?.length > 0 ? `✓ ${dados[campoDoDestino(p.destino)].length} arquivo(s) — Adicionar mais` : '+ Selecionar arquivos')}
          </button>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <BtnAvancar onClick={() => responder(p.id, null)}>{dados[campoDoDestino(p.destino)]?.length > 0 ? 'Continuar →' : 'Pular →'}</BtnAvancar>
          </div>
        </div>
      );
    }
    if (p.tipo === 'catalogo_modelos') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta>{p.texto}</Pergunta>
          {modelosEspeciais.length === 0
            ? <div style={{ color: '#7BAFD4', textAlign: 'center', padding: 20 }}>Nenhum modelo disponível.</div>
            : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {modelosEspeciais.map(m => {
                  const fotos = m.fotos?.length > 0 ? m.fotos.map(f => f.url) : (m.fotoUrl ? [m.fotoUrl] : []);
                  return (
                    <div key={m.id} onClick={() => setModeloSelecionado(m)}
                      style={{ borderRadius: 12, border: `2px solid ${modeloSelecionado?.id === m.id ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: modeloSelecionado?.id === m.id ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', overflow: 'hidden' }}>
                      <div style={{ height: 130, background: 'rgba(0,128,255,0.08)', position: 'relative' }}>
                        {fotos.length > 0 ? <ModeloCarrossel fotos={fotos} idx={carrosselIdx[m.id]||0} onPrev={() => setCarrosselIdx(p2 => ({ ...p2, [m.id]: ((p2[m.id]||0)-1+fotos.length)%fotos.length }))} onNext={() => setCarrosselIdx(p2 => ({ ...p2, [m.id]: ((p2[m.id]||0)+1)%fotos.length }))} onDot={i => setCarrosselIdx(p2 => ({ ...p2, [m.id]: i }))} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(123,175,212,0.3)', fontSize: 11 }}>Sem foto</div>}
                        {modeloSelecionado?.id === m.id && <div style={{ position: 'absolute', top: 8, right: 8, background: '#00E5C4', color: '#0A1626', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>✓</div>}
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#E8F4FF' }}>{m.nome}</div>
                        {m.descricao && <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 3 }}>{m.descricao}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <BtnAvancar onClick={() => responder(p.id, null)} disabled={!modeloSelecionado}>{modeloSelecionado ? `${modeloSelecionado.nome} →` : 'Selecione um modelo'}</BtnAvancar>
          </div>
        </div>
      );
    }
    if (p.tipo === 'catalogo') {
      const setor = p.setor || DESTINO_PARA_SETOR[p.destino];
      const campoSel = DESTINO_PARA_CAMPO_SEL[p.destino] || 'servicosSelecionados';
      if (faseCatalogo === 'selecao' && listaCatalogo.length === 0 && !loadingOpcoes) {
        carregarCatalogo(setor);
      }
      if (faseCatalogo === 'selecao') {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            <Pergunta>{p.texto}</Pergunta>
            <StepMultiSelect servicos={listaCatalogo} loading={loadingOpcoes}
              onConfirm={sel => { setListaCatalogo(sel); setFaseCatalogo('opcoes'); }}
              onSkip={() => { setListaCatalogo([]); setFaseCatalogo('selecao'); responder(p.id, null); }} />
          </div>
        );
      }
      return (
        <StepOpcoes servicos={listaCatalogo} onConfirm={sels => {
          setDados(prev => ({ ...prev, [campoSel]: sels }));
          setListaCatalogo([]); setFaseCatalogo('selecao');
          responder(p.id, null);
        }} />
      );
    }
    if (p.tipo === 'catalogo_especifico') {
      // Pergunta objetiva ligada a UM serviço só (ex: "Roupa Recepcionista").
      // Tem 2 fases: primeiro pergunta Sim/Não (a pergunta em si), e só se a
      // resposta for Sim é que mostra as opções do fornecedor pra esse serviço.
      if (faseEspecifico === 'pergunta') {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
            <OpcaoBtn onClick={() => {
              setDados(prev => ({ ...prev, respostasGenericas: { ...prev.respostasGenericas, [p.id]: true } }));
              setFaseEspecifico('opcoes');
            }}>Sim</OpcaoBtn>
            <OpcaoBtn onClick={() => {
              setDados(prev => ({ ...prev, respostasGenericas: { ...prev.respostasGenericas, [p.id]: false } }));
              responder(p.id, 'nao');
            }}>Não</OpcaoBtn>
          </div>
        );
      }
      // faseEspecifico === 'opcoes' — resposta foi Sim, mostra o catálogo desse serviço
      if (opcoesEspecifico === null && !loadingEspecifico) {
        carregarServicoEspecifico(p.servicoId);
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <Pergunta>{p.servicoNome ? `Escolha: ${p.servicoNome}` : p.texto}</Pergunta>
          {loadingEspecifico || opcoesEspecifico === null ? (
            <div style={{ fontSize: 13, color: 'rgba(123,175,212,0.5)', textAlign: 'center', padding: 12 }}>Carregando opções...</div>
          ) : opcoesEspecifico.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(123,175,212,0.5)', textAlign: 'center', padding: 12 }}>Nenhuma opção disponível pra essa região no momento.</div>
          ) : opcoesEspecifico.map(op => (
            <OpcaoBtn key={`${op.supplierId}_${op.id}`} onClick={() => {
              setDados(prev => ({ ...prev, especificosSelecionados: [...prev.especificosSelecionados, op] }));
              setOpcoesEspecifico(null); setFaseEspecifico('pergunta');
              responder(p.id, null);
            }}>{op.nome}</OpcaoBtn>
          ))}
          <OpcaoBtn onClick={() => { setOpcoesEspecifico(null); setFaseEspecifico('pergunta'); responder(p.id, null); }}>Definir depois</OpcaoBtn>
        </div>
      );
    }
    return <div style={{ color: '#7BAFD4', textAlign: 'center' }}>Tipo de pergunta não suportado: {p.tipo}</div>;
  };

  const campoDoDestino = (destino) => {
    const MAPA = {
      'evento.nomeEmpresa': 'nomeEmpresa', 'evento.nomeEvento': 'nomeEvento', 'evento.dataInicio': 'dataInicio',
      'evento.dataFim': 'dataFim', 'evento.visitantesPorDia': 'visitantesPorDia',
      'pagamento.formaPagamento': 'formaPagamento', 'stand.tipoEstande': 'tipoEstande',
      'stand.standDescricao': 'standDescricao', 'stand.standImagensUrls': 'standImagensUrls',
      'stand.areaM2': 'areaM2', 'stand.alturaTeto': 'alturaTeto', 'stand.diasMontagem': 'diasMontagem',
      'stand.restricoes': 'restricoes', 'stand.identidadeVisual': 'identidadeVisual',
      'stand.identidadeImagensUrls': 'identidadeImagensUrls', 'extra.infoExtra': 'infoExtra',
    };
    return MAPA[destino] || 'generico';
  };

  // stand.temStand / produtor.temProdutor precisam virar boolean (sim/não)
  const responderComBooleano = (p, valor) => {
    const campo = p.destino === 'stand.temStand' ? 'temStand' : p.destino === 'produtor.temProdutor' ? 'temProdutor' : campoDoDestino(p.destino);
    responder(p.id, valor, { [campo]: valor === 'sim' });
  };

  // ── Roteamento de tela ──────────────────────────────────────────────────
  if (carregando) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0A1626', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7BAFD4', fontFamily: 'Outfit, sans-serif' }}>
        Carregando...
      </div>
    );
  }
  if (erroCarga || !raizPergunta) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0A1626', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7BAFD4', fontFamily: 'Outfit, sans-serif', flexDirection: 'column', gap: 16 }}>
        <div>Não foi possível carregar o chat. Faltam dados no admin (Chat → Banco de Perguntas).</div>
        <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #7BAFD4', background: 'none', color: '#7BAFD4', cursor: 'pointer' }}>Fechar</button>
      </div>
    );
  }

  let conteudo;
  if (stepAtualId === 'sent') {
    conteudo = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 60 }}>🎉</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#E8F4FF' }}>Proposta enviada!</div>
        <div style={{ fontSize: 15, color: '#7BAFD4', lineHeight: 1.6, maxWidth: 380 }}>Nossa equipe recebeu seu briefing. Em breve um coordenador entrará em contato.</div>
        <BtnAvancar onClick={onClose}>Fechar</BtnAvancar>
      </div>
    );
  } else if (stepAtualId === 'raiz') {
    conteudo = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>{`Olá, **${userName}**! 😊\n\n${raizPergunta.texto}`}</Pergunta>
        {raizPergunta.opcoes.map(op => {
          const tipo = tiposEvento.find(t => t.id === op.valor);
          if (!tipo) return null;
          return <OpcaoBtn key={op.valor} onClick={() => avancarDaRaiz(op.valor)}>{op.label}</OpcaoBtn>;
        })}
      </div>
    );
  } else if (passoEspecial === 'equipe_detalhes') {
    conteudo = <StepEquipeDetalhes equipe={dados.equipeSelecionada} onConfirm={finalizarEquipeDetalhes} />;
  } else if (stepAtualId === 'revisao') {
    const LABEL_PAG = { '50_50': '50% + 50%', '30_60_90': '30/60/90 dias', 'a_vista': 'À vista' };
    const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados, ...dados.especificosSelecionados];
    conteudo = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <Pergunta>Tudo certo! Confira o **resumo**:</Pergunta>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,180,255,0.12)', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dados.tipoEstande && <Row label="Stand" value={dados.tipoEstande === 'modular' ? `Modular — ${modeloSelecionado?.nome || ''}` : 'Personalizado'} />}
          <Row label="Empresa" value={dados.nomeEmpresa} />
          <Row label="Evento" value={`${dados.tipoEvento}${dados.nomeEvento ? ` — ${dados.nomeEvento}` : ''}`} />
          <Row label="Data" value={`${dados.dataInicio ? new Date(dados.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : ''} → ${dados.dataFim ? new Date(dados.dataFim + 'T12:00:00').toLocaleDateString('pt-BR') : ''}`} />
          <Row label="Horário" value={`${dados.horarioInicio} às ${dados.horarioFim}`} />
          <Row label="Local" value={`${dados.cidade}${dados.estado ? ` — ${dados.estado}` : ''}${dados.local ? ` — ${dados.local}` : ''}`} />
          <Row label="Pessoas" value={`${dados.visitantesPorDia}/dia`} />
          {dados.temProdutor && <Row label="Produtor" value="Sim" />}
          {todas.length > 0 && <Row label="Serviços" value={todas.map(s => `${s.serviceName}${s.opcaoNome ? ` (${s.opcaoNome})` : ''}`).join(' · ')} />}
          {dados.infoExtra && <Row label="Obs" value={dados.infoExtra} />}
          <Row label="Pagamento" value={LABEL_PAG[dados.formaPagamento] || dados.formaPagamento} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <BtnAvancar onClick={handleConfirm} submitting={submitting}>{submitting ? 'Enviando...' : 'Confirmar e Enviar →'}</BtnAvancar>
        </div>
      </div>
    );
  } else {
    const p = perguntasMap[stepAtualId];
    if (!p) {
      conteudo = <div style={{ color: '#7BAFD4' }}>Pergunta não encontrada — avançando...</div>;
    } else if (p.destino === 'stand.temStand' || p.destino === 'produtor.temProdutor') {
      conteudo = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <Pergunta subtitulo={p.subtitulo}>{p.texto}</Pergunta>
          {p.opcoes.map(op => <OpcaoBtn key={op.valor} onClick={() => responderComBooleano(p, op.valor)}>{op.label}</OpcaoBtn>)}
        </div>
      );
    } else {
      conteudo = renderPerguntaGenerica(p);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(160deg,#0A1626 0%,#0D1F35 100%)', zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', flexShrink: 0 }}>
        <button onClick={historicoNav.length > 0 ? voltar : onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', padding: '6px 10px', borderRadius: 8 }}>
          ← {historicoNav.length > 0 ? 'Voltar' : 'Sair'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>R</div>
          <span style={{ fontSize: 13, color: '#7BAFD4' }}>Realize Hub <span style={{ opacity: 0.4 }}>· v4 teste</span></span>
        </div>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', padding: '6px 10px', borderRadius: 8 }}>Fechar ×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px 48px' }}>
        <div style={{ width: '100%', maxWidth: 520 }} key={stepAtualId + (passoEspecial||'')}>
          {conteudo}
        </div>
      </div>
    </div>
  );
}
