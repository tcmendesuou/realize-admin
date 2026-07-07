import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, serverTimestamp, query, where, runTransaction, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

// ── Helpers ───────────────────────────────────────────────────────────────────
const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ── Etapas da barra de progresso ──────────────────────────────────────────────
const ETAPAS = ['Stand', 'Evento', 'Serviços', 'Extras', 'Pagamento'];
const STEP_ETAPA = {
  stand_pergunta: 0, stand_tipo: 0, stand_modelos: 0, stand_personalizado_sabe: 0,
  stand_personalizado_descricao: 0, stand_personalizado_upload: 0, stand_area: 0,
  stand_teto: 0, stand_montagem: 0, stand_restricao: 0, stand_restricao_desc: 0,
  stand_identidade: 0, stand_identidade_upload: 0,
  evento_empresa: 1, evento_tipo: 1, evento_nome: 1, evento_data_inicio: 1,
  evento_data_fim: 1, evento_horario: 1, evento_local: 1, evento_visitantes: 1,
  produtor_pergunta: 2, estrutura_pergunta: 2, estrutura_selecao: 2, estrutura_opcoes: 2,
  equipe_pergunta: 2, equipe_selecao: 2, equipe_opcoes: 2, equipe_detalhes: 2, vestuario_recepcao: 2,
  gastro_pergunta: 2, gastro_selecao: 2, gastro_opcoes: 2,
  servicos_pergunta: 2, servicos_selecao: 2, servicos_opcoes: 2,
  info_extra: 3, pagamento: 4, revisao: 4, sent: 4,
};

// ── Barra de progresso ────────────────────────────────────────────────────────
const ProgressBar = ({ step }) => {
  const etapaAtual = STEP_ETAPA[step] ?? 0;
  return (
    <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        {ETAPAS.map((label, i) => (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: i < etapaAtual ? 'linear-gradient(135deg,#00E5C4,#0080FF)'
                          : i === etapaAtual ? 'linear-gradient(135deg,#00E5C4,#0080FF)'
                          : 'rgba(255,255,255,0.07)',
                border: i === etapaAtual ? '2px solid #00E5C4' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: i <= etapaAtual ? 'white' : 'rgba(123,175,212,0.4)',
                fontFamily: 'Outfit, sans-serif', transition: 'all 0.3s', boxShadow: i === etapaAtual ? '0 0 12px rgba(0,229,196,0.4)' : 'none',
              }}>
                {i < etapaAtual ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 9, color: i === etapaAtual ? '#00E5C4' : 'rgba(123,175,212,0.4)', fontFamily: 'Outfit, sans-serif', fontWeight: i === etapaAtual ? 700 : 400, whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < ETAPAS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < etapaAtual ? 'linear-gradient(90deg,#00E5C4,#0080FF)' : 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 18, transition: 'all 0.3s' }} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ── Componentes base ──────────────────────────────────────────────────────────
const Pergunta = ({ children }) => (
  <div style={{ fontSize: 22, fontWeight: 700, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif', lineHeight: 1.4, marginBottom: 28, textAlign: 'center' }}
    dangerouslySetInnerHTML={{ __html: (typeof children === 'string' ? children : '').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#00E5C4">$1</strong>').replace(/\n/g, '<br/>') }} />
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
  <input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} min={min} max={max} autoFocus={autoFocus}
    style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1.5px solid rgba(0,180,255,0.25)', background: 'rgba(255,255,255,0.05)', color: '#E8F4FF', fontSize: 16, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s' }}
    onFocus={e => e.target.style.borderColor = 'rgba(0,229,196,0.5)'}
    onBlur={e => e.target.style.borderColor = 'rgba(0,180,255,0.25)'} />
);

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

const Row = ({ label, value }) => value ? (
  <div style={{ display: 'flex', gap: 10 }}>
    <span style={{ fontSize: 11, fontWeight: 700, color: '#7BAFD4', minWidth: 90, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 2 }}>{label}</span>
    <span style={{ fontSize: 13, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif', flex: 1, lineHeight: 1.5 }}>{value}</span>
  </div>
) : null;

const HORARIOS = ['06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00','22:30','23:00','23:30'];

// ── Componentes de step isolados ──────────────────────────────────────────────
const StepOpcoes = ({ servicos, onConfirm }) => {
  const [idx, setIdx]     = useState(0);
  const [sels, setSels]   = useState([]);
  const iniciouRef        = useRef(false);
  const servAtual         = servicos[idx];
  if (!servAtual) { onConfirm(sels); return null; }

  const avancar = (op) => {
    const novo = op ? [...sels, {
      supplierId: servAtual.supplierId, supplierName: servAtual.supplierName || '',
      serviceName: servAtual.serviceName, serviceParentName: servAtual.serviceParentName || '',
      tipoServico: servAtual.tipoServico, id: servAtual.id,
      opcaoCatalogoId: op.id || '', opcaoNome: op.nome || '',
      valor: op.valor || 0, unidade: op.unidade || '',
      diasPreparo: servAtual.diasPreparo || 0, diasMontagem: servAtual.diasMontagem || 0,
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

const StepEquipeDetalhes = ({ equipe, onConfirm }) => {
  const [idx, setIdx]   = useState(0);
  const [qtd, setQtd]   = useState('');
  const [horas, setHoras] = useState('');
  const [diasD, setDiasD] = useState('');
  const [obs, setObs]   = useState('');
  const [det, setDet]   = useState({});
  const serv = equipe[idx];
  if (!serv) { onConfirm(det); return null; }
  const avancar = () => {
    const novo = { ...det, [serv.serviceName]: { quantidade: qtd, horasPorDia: horas, dias: diasD, observacoes: obs } };
    setDet(novo);
    if (idx + 1 < equipe.length) { setIdx(i => i + 1); setQtd(''); setHoras(''); setDiasD(''); setObs(''); }
    else onConfirm(novo);
  };
  const selStyle = { width: '100%', padding: '14px', borderRadius: 12, border: '1.5px solid rgba(0,180,255,0.25)', background: 'rgba(255,255,255,0.05)', color: '#E8F4FF', fontSize: 16, fontFamily: 'Outfit, sans-serif', outline: 'none' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <Pergunta>{`Detalhes para **${serv.serviceName}**${equipe.length > 1 ? ` (${idx + 1}/${equipe.length})` : ''}`}</Pergunta>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase' }}>Quantos?</div><Inp type="number" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="2" min="1" /></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase' }}>Horas/dia</div><Inp type="number" value={horas} onChange={e => setHoras(e.target.value)} placeholder="8" min="1" /></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase' }}>Dias</div><Inp type="number" value={diasD} onChange={e => setDiasD(e.target.value)} placeholder="3" min="1" /></div>
      </div>
      <Inp value={obs} onChange={e => setObs(e.target.value)} placeholder="Preferência específica (opcional)" />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={avancar} disabled={!qtd && !horas && !diasD} />
      </div>
    </div>
  );
};

const StepRevisao = ({ dados, modeloSelecionado, submitting, onConfirm, onReset }) => {
  const LABEL_PAG = { '50_50': '50% + 50%', '30_60_90': '30/60/90 dias', 'a_vista': 'À vista' };
  const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,180,255,0.12)', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dados.tipoEstande && <Row label="Stand" value={dados.tipoEstande === 'modular' ? `Modular — ${modeloSelecionado?.nome || ''}` : 'Personalizado'} />}
        <Row label="Empresa"   value={dados.nomeEmpresa} />
        <Row label="Evento"    value={`${dados.tipoEvento}${dados.nomeEvento ? ` — ${dados.nomeEvento}` : ''}`} />
        <Row label="Data"      value={`${dados.dataInicio ? new Date(dados.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : ''} → ${dados.dataFim ? new Date(dados.dataFim + 'T12:00:00').toLocaleDateString('pt-BR') : ''}`} />
        <Row label="Horário"   value={`${dados.horarioInicio} às ${dados.horarioFim}`} />
        <Row label="Local"     value={`${dados.cidade}${dados.local ? ` — ${dados.local}` : ''}`} />
        <Row label="Pessoas"   value={`${dados.visitantesPorDia}/dia`} />
        {dados.temProdutor && <Row label="Produtor" value="Sim" />}
        {todas.length > 0 && <Row label="Serviços" value={todas.map(s => `${s.serviceName}${s.opcaoNome ? ` (${s.opcaoNome})` : ''}`).join(' · ')} />}
        {dados.infoExtra && <Row label="Obs" value={dados.infoExtra} />}
        <Row label="Pagamento" value={LABEL_PAG[dados.formaPagamento] || dados.formaPagamento} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={onConfirm} submitting={submitting}>{submitting ? 'Enviando...' : 'Confirmar e Enviar →'}</BtnAvancar>
      </div>
      <button onClick={onReset} style={{ background: 'none', border: 'none', color: 'rgba(123,175,212,0.5)', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textDecoration: 'underline', textAlign: 'center', marginTop: 4 }}>Recomeçar do início</button>
    </div>
  );
};


// ── Componentes para steps com estado local ───────────────────────────────────
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
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase' }}>Início</div>
          <select value={inicio} onChange={e => setInicio(e.target.value)} style={selStyle}>
            <option value="">--</option>{HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
          </select></div>
        <div><div style={{ fontSize: 11, color: '#7BAFD4', marginBottom: 6, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase' }}>Término</div>
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
  const [local, setLocal]   = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <Inp value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade" autoFocus />
      <Inp value={local}  onChange={e => setLocal(e.target.value)}  placeholder="Local / endereço (opcional)" />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={() => onConfirm(cidade, local)} disabled={!cidade} />
      </div>
    </div>
  );
};

const StepDiasInline = ({ dataInicio, onConfirm }) => {
  const [dias, setDias] = useState('1');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {['1','2','3','4','5','6','7'].map(d => (
          <button key={d} onClick={() => setDias(d)}
            style={{ flex: 1, padding: '14px 0', borderRadius: 12, border: `1.5px solid ${dias === d ? '#00E5C4' : 'rgba(0,180,255,0.2)'}`, background: dias === d ? 'rgba(0,229,196,0.08)' : 'rgba(255,255,255,0.03)', color: dias === d ? '#00E5C4' : '#7BAFD4', fontSize: 16, fontWeight: dias === d ? 700 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textAlign: 'center', transition: 'all 0.15s' }}>
            {d}
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(123,175,212,0.5)', fontFamily: 'Outfit, sans-serif' }}>dias</div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <BtnAvancar onClick={() => {
          const d = new Date(dataInicio + 'T12:00:00');
          d.setDate(d.getDate() + parseInt(dias) - 1);
          onConfirm(d.toISOString().split('T')[0]);
        }} />
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

// ── Componente principal ──────────────────────────────────────────────────────
export default function ClienteChat({ userData, onClose, tenant }) {
  const userName = userData?.name || userData?.displayName || 'Cliente';
  const userId   = userData?.uid  || userData?.id || '';
  const tenantId = tenant?.id || userData?.tenantId || null;

  const [step, setStep]         = useState('stand_pergunta');
  const [historico, setHistorico] = useState([]); // { step, resposta } — para voltar
  const [submitting, setSubmitting] = useState(false);
  const [loadingOpcoes, setLoadingOpcoes] = useState(false);
  const [listaVestuario, setListaVestuario] = useState([]);
  const [animDir, setAnimDir]   = useState('in'); // 'in' | 'out'

  const [dados, setDados] = useState({
    temStand: null, tipoEstande: null, standDescricao: '', standImagensUrls: [],
    areaM2: '', alturaTeto: '', diasMontagem: '', restricoes: '', identidadeVisual: null, identidadeImagensUrls: [],
    nomeEmpresa: tenantId ? (userData?.companyName || '') : '', tipoEvento: '', nomeEvento: '', dataInicio: '', dataFim: '',
    horarioInicio: '', horarioFim: '', cidade: '', local: '', visitantesPorDia: '',
    temProdutor: null,
    estruturaSelecionada: [], equipeSelecionada: [], gastronomeSelecionada: [], servicosSelecionados: [],
    equipeDetalhes: {}, infoExtra: '', formaPagamento: '',
  });

  const [modelosEspeciais,  setModelosEspeciais]  = useState([]);
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [carrosselIdx,      setCarrosselIdx]      = useState({});

  const [listaEstrutura, setListaEstrutura] = useState([]);
  const [listaEquipe,    setListaEquipe]    = useState([]);
  const [listaGastro,    setListaGastro]    = useState([]);
  const [listaServicos,  setListaServicos]  = useState([]);

  const [uploadingStand, setUploadingStand] = useState(false);
  const [uploadingIdent, setUploadingIdent] = useState(false);
  const standInputRef = useRef();
  const identInputRef = useRef();

  useEffect(() => {
    getDocs(collection(db, 'modelosEspeciais'))
      .then(snap => {
        const todos = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.ativo !== false);
        // Filtra por tenant: exclusiveTenants vazio = público, senão só o tenant atual vê
        const filtrados = tenantId
          ? todos.filter(m => !m.exclusiveTenants?.length || m.exclusiveTenants.includes(tenantId))
          : todos;
        setModelosEspeciais(filtrados);
      })
      .catch(console.error);
  }, []);

  const BLOQUEADOS_ESTRUTURA = ['estande', 'stand', 'desenvolvimento'];
  const BLOQUEADOS_EQUIPE    = ['produtor', 'roupa', 'vestuario', 'vestuário'];

  const carregarTipo = async (tipo, setter) => {
    setLoadingOpcoes(true);
    try {
      const snap = await getDocs(query(collection(db, 'supplierServices'), where('tipoServico', '==', tipo)));
      const servs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
      const bloqueados = tipo === 'estrutura' ? BLOQUEADOS_ESTRUTURA : tipo === 'operacao' ? BLOQUEADOS_EQUIPE : [];
      const filtrados = servs.filter(s => {
        const nome = normalize(s.serviceName || '') + ' ' + normalize(s.serviceParentName || '');
        if (bloqueados.some(b => nome.includes(b))) return false;
        // Filtro por tenant: exclusiveTenants vazio = público
        if (tenantId) {
          const exc = s.exclusiveTenants || [];
          if (exc.length > 0 && !exc.includes(tenantId)) return false;
        }
        return true;
      });
      const comOpcoes = await Promise.all(filtrados.map(async s => {
        const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
        const opsForn = opSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.ativo !== false);

        // Enriquece cada opção com valor/unidade do catálogo admin (services/{serviceId}/opcoes)
        const opsEnriquecidas = await Promise.all(opsForn.map(async opForn => {
          if (opForn.opcaoCatalogoId && s.serviceId) {
            try {
              const catSnap = await getDocs(collection(db, 'services', s.serviceId, 'opcoes'));
              const opCat = catSnap.docs.find(cd => cd.id === opForn.opcaoCatalogoId);
              if (opCat) {
                return { ...opForn, valor: opCat.data().valor ?? 0, unidade: opCat.data().unidade ?? '', nome: opForn.nome || opCat.data().nome || '' };
              }
            } catch (e) { console.error('Erro ao buscar opcao catalogo:', e); }
          }
          return opForn;
        }));

        return { ...s, opcoes: opsEnriquecidas };
      }));
      setter(comOpcoes.filter(s => s.opcoes.length > 0));
    } catch (e) { console.error(e); setter([]); }
    finally { setLoadingOpcoes(false); }
  };

  const set  = (key, val) => setDados(p => ({ ...p, [key]: typeof val === 'function' ? val(p[key]) : val }));

  // Navegação com histórico para voltar
  const ir = (nextStep, dadosExtra) => {
    if (dadosExtra) setDados(p => ({ ...p, ...dadosExtra }));
    setAnimDir('in');
    setHistorico(p => [...p, step]);
    setStep(nextStep);
  };

  const voltar = () => {
    if (historico.length === 0) return;
    setAnimDir('out');
    const prev = historico[historico.length - 1];
    setHistorico(p => p.slice(0, -1));
    setStep(prev);
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
    } catch (e) { console.error(e); alert('Erro ao enviar imagens.'); }
    finally { setUploading(false); }
  };

  const montarBriefingJson = () => {
    const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados];
    return {
      evento: { tipo: dados.tipoEvento, nome: dados.nomeEvento, dataInicio: dados.dataInicio, dataFim: dados.dataFim, horario: `${dados.horarioInicio} às ${dados.horarioFim}`, horarioInicio: dados.horarioInicio, horarioFim: dados.horarioFim, cidade: dados.cidade, local: dados.local, endereco: dados.local, visitantesPorDia: parseInt(dados.visitantesPorDia) || 0, nomeEmpresa: dados.nomeEmpresa,
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
        eventName: bj.evento?.nome || bj.evento?.tipo || 'Novo Evento', eventTypeName: bj.evento?.tipo || '',
        startDate: bj.evento?.dataInicio || '', endDate: bj.evento?.dataFim || '',
        location: bj.evento?.local || bj.evento?.cidade || '', guestCount: bj.evento?.visitantesPorDia || 0,
        status: 'analyzing', workspaceStage: 'Propostas', isMae: true, numeroPedido,
        briefingData: { ...bj, formaPagamento: dados.formaPagamento },
        financeiro: { formaPagamento: dados.formaPagamento },
        assignedTo, assignedToName, assignedAt: assignedTo ? serverTimestamp() : null,
        // Tenant — grava vazio se for Realize normal
        tenantId: tenantId || null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      try {
        const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados];
        const vistos = new Set();
        for (const sel of todas) {
          const key = `${sel.supplierId}__${sel.serviceName}`;
          if (vistos.has(key)) continue; vistos.add(key);
          const isEst = normalize(sel.serviceName).includes('estande') || normalize(sel.serviceParentName || '').includes('estande');
          if (isEst && dados.tipoEstande === 'modular') continue;
          // Detalhes de equipe (quantidade, horas, dias, observacoes)
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
            opcaoCatalogoId: sel.opcaoCatalogoId || '',
            opcaoNome:        sel.opcaoNome       || '',
            preco: sel.valor || 0, unidade: sel.unidade || '',
            diasPreparo: sel.diasPreparo || 0, diasMontagem: sel.diasMontagem || 0,
            // Detalhes de equipe (preenchidos pelo cliente)
            quantidade:   detEquipe.quantidade   ? parseInt(detEquipe.quantidade)   : null,
            horasPorDia:  detEquipe.horasPorDia  ? parseFloat(detEquipe.horasPorDia) : null,
            diasServico:  detEquipe.dias         ? parseInt(detEquipe.dias)         : null,
            observacoes:  detEquipe.observacoes  || '',
            stage: 'proposta', status: 'draft', createdAt: serverTimestamp(),
          });
        }
        if (dados.temProdutor) {
          const ps = await getDocs(collection(db, 'supplierServices'));
          for (const p of ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => normalize(s.serviceName).includes('produtor') && s.ativo !== false)) {
            await addDoc(collection(db, 'supplierJobs'), { supplierId: p.supplierId, budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', clientName: userName, eventDate: bj.evento?.dataInicio || '', serviceName: p.serviceName, serviceParentName: p.serviceParentName || '', tipoServico: p.tipoServico || 'operacao', preco: 0, unidade: '', stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
          }
        }
        if (dados.tipoEstande === 'modular' && modeloSelecionado) {
          const ts = await getDocs(collection(db, 'tiposEspeciais'));
          const tm = ts.docs.map(d => ({ id: d.id, ...d.data() })).find(t => t.id === modeloSelecionado.tipoEspecialId || t.nome?.toLowerCase().includes('modular'));
          for (const f of (tm?.fornecedoresAutorizados || [])) {
            await addDoc(collection(db, 'supplierJobs'), { supplierId: f.id, supplierName: f.nome || '', budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', clientName: userName, eventDate: bj.evento?.dataInicio || '', serviceName: modeloSelecionado.nome, serviceParentName: tm?.nome || 'Estande Modular', tipoServico: 'estrutura', modeloEspecialId: modeloSelecionado.id, preco: modeloSelecionado.precoBase || 0, unidade: 'por evento', diasPreparo: modeloSelecionado.diasProducao || 0, diasMontagem: 0, stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
          }
        }
        if (dados.tipoEstande === 'personalizado') {
          await addDoc(collection(db, 'supplierJobs'), { supplierId: '', budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', clientName: userName, serviceName: 'Desenvolvimento de Stand', serviceParentName: 'Estandes Personalizados', tipoServico: 'estrutura', observacoes: dados.standDescricao || 'Cliente solicitou atendimento.', standImagensUrls: dados.standImagensUrls || [], preco: 0, unidade: '', stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
        }
      } catch (e) { console.error('Erro supplierJobs:', e); }

      // Cronograma não é mais gerado aqui — ele é montado depois, na aprovação
      // do orçamento (ClienteProjetoScreen.js), com base nos fornecedores
      // realmente confirmados e nos prazos reais deles (diasPreparo/diasMontagem).
      // Antes, uma IA "inventava" etapas genéricas nesse ponto, sem dados reais.

      try {
        const dr = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system: 'Especialista em eventos. PT-BR. Sem markdown.', messages: [{ role: 'user', content: `Parágrafo curto (max 3 linhas) descrevendo o evento.\nEvento:${bj.evento?.nome||bj.evento?.tipo}\nData:${bj.evento?.dataInicio} a ${bj.evento?.dataFim}\nLocal:${bj.evento?.local||bj.evento?.cidade}\nVisitantes:${bj.evento?.visitantesPorDia}\nServiços:${(bj.servicosNecessarios||[]).join(', ')}` }] }) });
        const dd = await dr.json();
        const dt = (dd.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (dt) await updateDoc(doc(db, 'budgets', budgetRef.id), { descricaoBriefing: dt });
      } catch (e) { console.error('Erro descrição:', e); }

      setStep('sent');
    } catch (err) { console.error(err); alert('Erro ao enviar. Tente novamente.'); }
    finally { setSubmitting(false); }
  };

  // ── Render de cada step ───────────────────────────────────────────────────
  const renderConteudo = () => {
    // ── STAND ────────────────────────────────────────────────────────────────
    if (step === 'stand_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>{`Olá, **${userName}**! 😊\n\nSeu evento precisa de **Stand**?`}</Pergunta>
        <OpcaoBtn onClick={() => ir('stand_tipo', { temStand: true })}>Sim</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('evento_empresa', { temStand: false })}>Não</OpcaoBtn>
      </div>
    );

    if (step === 'stand_tipo') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Qual o tipo de Stand?</Pergunta>
        <OpcaoBtn onClick={() => ir('stand_modelos', { tipoEstande: 'modular' })}>🏗 Modular — pronto e padronizado</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('stand_personalizado_sabe', { tipoEstande: 'personalizado' })}>✏️ Personalizado — exclusivo, criado do zero</OpcaoBtn>
      </div>
    );

    if (step === 'stand_modelos') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Escolha o **modelo** do seu Stand:</Pergunta>
        {modelosEspeciais.length === 0
          ? <div style={{ color: '#7BAFD4', textAlign: 'center', padding: 20 }}>Nenhum modelo disponível.</div>
          : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {modelosEspeciais.map(m => {
                const fotos = m.fotos?.length > 0 ? m.fotos.map(f => f.url) : (m.fotoUrl ? [m.fotoUrl] : []);
                return (
                  <div key={m.id} onClick={() => setModeloSelecionado(m)}
                    style={{ borderRadius: 12, border: `2px solid ${modeloSelecionado?.id === m.id ? '#00E5C4' : 'rgba(0,180,255,0.15)'}`, background: modeloSelecionado?.id === m.id ? 'rgba(0,229,196,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s' }}>
                    <div style={{ height: 130, background: 'rgba(0,128,255,0.08)', position: 'relative' }}>
                      {fotos.length > 0 ? <ModeloCarrossel fotos={fotos} idx={carrosselIdx[m.id]||0} onPrev={() => setCarrosselIdx(p => ({ ...p, [m.id]: ((p[m.id]||0)-1+fotos.length)%fotos.length }))} onNext={() => setCarrosselIdx(p => ({ ...p, [m.id]: ((p[m.id]||0)+1)%fotos.length }))} onDot={i => setCarrosselIdx(p => ({ ...p, [m.id]: i }))} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(123,175,212,0.3)', fontSize: 11 }}>Sem foto</div>}
                      {modeloSelecionado?.id === m.id && <div style={{ position: 'absolute', top: 8, right: 8, background: '#00E5C4', color: '#0A1626', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, fontFamily: 'Outfit, sans-serif' }}>✓</div>}
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif' }}>{m.nome}</div>
                      {m.descricao && <div style={{ fontSize: 11, color: '#7BAFD4', marginTop: 3 }}>{m.descricao}</div>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {m.areaM2 && <span style={{ fontSize: 10, background: 'rgba(0,229,196,0.1)', color: '#00E5C4', padding: '2px 6px', borderRadius: 6, fontFamily: 'Outfit, sans-serif' }}>📐 {m.areaM2}m²</span>}
                        {m.altura && <span style={{ fontSize: 10, background: 'rgba(0,180,255,0.1)', color: '#7BAFD4', padding: '2px 6px', borderRadius: 6, fontFamily: 'Outfit, sans-serif' }}>↕ {m.altura}m</span>}
                        {m.diasProducao > 0 && <span style={{ fontSize: 10, background: 'rgba(255,167,38,0.1)', color: '#FFA726', padding: '2px 6px', borderRadius: 6, fontFamily: 'Outfit, sans-serif' }}>⏱ {m.diasProducao}d</span>}
                        {m.precoBase > 0 && <span style={{ fontSize: 10, background: 'rgba(102,187,106,0.1)', color: '#66BB6A', padding: '2px 6px', borderRadius: 6, fontFamily: 'Outfit, sans-serif' }}>R$ {m.precoBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                      </div>
                      {m.caracteristicas?.length > 0 && <div style={{ marginTop: 6 }}>{m.caracteristicas.map((c, i) => <span key={i} style={{ fontSize: 10, color: '#7BAFD4', background: 'rgba(255,255,255,0.05)', padding: '2px 5px', borderRadius: 5, marginRight: 4, fontFamily: 'Outfit, sans-serif', display: 'inline-block', marginTop: 2 }}>{c}</span>)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <BtnAvancar onClick={() => ir('stand_teto')} disabled={!modeloSelecionado}>
            {modeloSelecionado ? `${modeloSelecionado.nome} →` : 'Selecione um modelo'}
          </BtnAvancar>
        </div>
      </div>
    );

    if (step === 'stand_personalizado_sabe') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Você já sabe como gostaria do seu stand?</Pergunta>
        <OpcaoBtn onClick={() => ir('stand_personalizado_descricao')}>Sim, já tenho ideia</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('stand_area', { standDescricao: 'Cliente solicitou atendimento para desenvolver stand personalizado.' })}>Não, preciso de ajuda</OpcaoBtn>
      </div>
    );

    if (step === 'stand_personalizado_descricao') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Descreva como você imagina o seu **stand**:</Pergunta>
        <StepDescricaoInline onConfirm={desc => { set('standDescricao', desc); ir('stand_personalizado_upload'); }} />
      </div>
    );

    if (step === 'stand_personalizado_upload') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Quer enviar **imagens de referência**? *(opcional)*</Pergunta>
        <input ref={standInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files, 'standImagensUrls', setUploadingStand)} />
        <button onClick={() => standInputRef.current.click()} disabled={uploadingStand}
          style={{ padding: '16px', borderRadius: 12, border: '1.5px dashed rgba(0,180,255,0.3)', background: 'none', color: '#7BAFD4', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textAlign: 'center' }}>
          {uploadingStand ? 'Enviando...' : dados.standImagensUrls.length > 0 ? `✓ ${dados.standImagensUrls.length} imagem(ns) — Adicionar mais` : '+ Selecionar imagens'}
        </button>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => ir('stand_area')} style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Pular</button>
          <BtnAvancar onClick={() => ir('stand_area')}>{dados.standImagensUrls.length > 0 ? 'Continuar →' : 'Pular →'}</BtnAvancar>
        </div>
      </div>
    );

    if (step === 'stand_area') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Qual o **tamanho da área** do stand em m²?</Pergunta>
        <StepInputSimples type="number" placeholder="Ex: 36" min="1" autoFocus onConfirm={val => ir('stand_teto', { areaM2: val })} />
      </div>
    );

    if (step === 'stand_teto') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Qual a **altura do teto** no local do evento?</Pergunta>
        <StepInputSimples placeholder="Ex: 3m, 4,5m..." autoFocus onConfirm={val => ir('stand_montagem', { alturaTeto: val })} />
      </div>
    );

    if (step === 'stand_montagem') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>**Quantos dias antes** o local estará disponível para montagem?</Pergunta>
        <StepInputSimples type="number" placeholder="Ex: 2" min="0" autoFocus onConfirm={val => ir('stand_restricao', { diasMontagem: val })} />
      </div>
    );

    if (step === 'stand_restricao') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Tem alguma **restrição de acesso** no local?</Pergunta>
        <OpcaoBtn onClick={() => ir('stand_restricao_desc')}>Sim, tem restrição</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('stand_identidade', { restricoes: '' })}>Não, sem restrições</OpcaoBtn>
      </div>
    );

    if (step === 'stand_restricao_desc') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Descreva as **restrições**:</Pergunta>
        <StepInputSimples placeholder="Ex: altura máx. 3m, acesso somente de manhã..." autoFocus onConfirm={val => ir('stand_identidade', { restricoes: val })} />
      </div>
    );

    if (step === 'stand_identidade') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Já tem **identidade visual** definida?</Pergunta>
        <OpcaoBtn onClick={() => ir('stand_identidade_upload', { identidadeVisual: true })}>Sim, já tenho</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('evento_empresa', { identidadeVisual: false })}>Não ainda</OpcaoBtn>
      </div>
    );

    if (step === 'stand_identidade_upload') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Envie os **arquivos** da identidade visual:</Pergunta>
        <input ref={identInputRef} type="file" accept="image/*,.pdf,.ai,.eps" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files, 'identidadeImagensUrls', setUploadingIdent)} />
        <button onClick={() => identInputRef.current.click()} disabled={uploadingIdent}
          style={{ padding: '16px', borderRadius: 12, border: '1.5px dashed rgba(0,229,196,0.3)', background: 'none', color: '#7BAFD4', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textAlign: 'center' }}>
          {uploadingIdent ? 'Enviando...' : dados.identidadeImagensUrls.length > 0 ? `✓ ${dados.identidadeImagensUrls.length} arquivo(s) — Adicionar mais` : '+ Selecionar arquivos'}
        </button>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <BtnAvancar onClick={() => ir('evento_empresa')}>{dados.identidadeImagensUrls.length > 0 ? 'Continuar →' : 'Pular por agora →'}</BtnAvancar>
        </div>
      </div>
    );

    // ── EVENTO ───────────────────────────────────────────────────────────────
    if (step === 'evento_empresa') {
      // Tenant/franqueado: pula a pergunta e usa companyName já preenchido no estado
      if (tenantId) { ir('evento_tipo'); return null; }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <Pergunta>Qual o nome da **empresa organizadora**?</Pergunta>
          <StepInputSimples placeholder="Nome da empresa (ou deixe em branco)" autoFocus optional onConfirm={val => ir('evento_tipo', { nomeEmpresa: val })} />
        </div>
      );
    }

    if (step === 'evento_tipo') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <Pergunta>Qual o **tipo** do evento?</Pergunta>
        {['Feira / Exposição','Congresso / Conferência','Lançamento de Produto','Evento Corporativo','Show / Entretenimento','Outro'].map(t => (
          <OpcaoBtn key={t} onClick={() => ir('evento_nome', { tipoEvento: t })} selected={dados.tipoEvento === t}>{t}</OpcaoBtn>
        ))}
      </div>
    );

    if (step === 'evento_nome') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>O evento já tem um **nome**?</Pergunta>
        <StepInputSimples placeholder="Nome do evento (ou deixe em branco)" autoFocus optional onConfirm={val => ir('evento_data_inicio', { nomeEvento: val })} />
      </div>
    );

    if (step === 'evento_data_inicio') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Qual a **data de início** do evento?</Pergunta>
        <input type="date" defaultValue="" min={new Date().toISOString().split('T')[0]} onChange={e => set('dataInicio', e.target.value)}
          style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1.5px solid rgba(0,180,255,0.25)', background: 'rgba(255,255,255,0.05)', color: '#E8F4FF', fontSize: 16, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <BtnAvancar onClick={() => ir('evento_data_fim')} disabled={!dados.dataInicio} />
        </div>
      </div>
    );

    if (step === 'evento_data_fim') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>**Quantos dias** vai durar o evento?</Pergunta>
        <StepDiasInline dataInicio={dados.dataInicio} onConfirm={dataFim => ir('evento_horario', { dataFim })} />
      </div>
    );

    if (step === 'evento_horario') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Qual o **horário** do evento?</Pergunta>
        <StepHorarioInline onConfirm={(inicio, fim) => ir('evento_local', { horarioInicio: inicio, horarioFim: fim })} />
      </div>
    );

    if (step === 'evento_local') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Qual a **cidade e o local** do evento?</Pergunta>
        <StepLocalInline onConfirm={(cidade, local) => ir('evento_visitantes', { cidade, local })} />
      </div>
    );

    if (step === 'evento_visitantes') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>**Quantas pessoas** participarão por dia?</Pergunta>
        <StepInputSimples type="number" placeholder="Ex: 500" min="1" autoFocus onConfirm={val => ir('produtor_pergunta', { visitantesPorDia: val })} />
      </div>
    );

    // ── PRODUTOR ─────────────────────────────────────────────────────────────
    if (step === 'produtor_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Gostaria de um **Produtor de Eventos** dedicado?</Pergunta>
        <OpcaoBtn onClick={() => ir('estrutura_pergunta', { temProdutor: true })}>Sim, quero um produtor</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('estrutura_pergunta', { temProdutor: false })}>Não preciso</OpcaoBtn>
      </div>
    );

    // ── ESTRUTURA ────────────────────────────────────────────────────────────
    if (step === 'estrutura_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Vai precisar de **estrutura física**?
*(palco, tendas, backdrop, iluminação...)*</Pergunta>
        <OpcaoBtn onClick={async () => { await carregarTipo('estrutura', setListaEstrutura); ir('estrutura_selecao'); }}>Sim</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('equipe_pergunta')}>Não</OpcaoBtn>
      </div>
    );

    if (step === 'estrutura_selecao') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Selecione os itens de **estrutura**:</Pergunta>
        <StepMultiSelect servicos={listaEstrutura} loading={loadingOpcoes}
          onConfirm={e => { setListaEstrutura(e); ir('estrutura_opcoes'); }}
          onSkip={() => ir('equipe_pergunta')} />
      </div>
    );

    if (step === 'estrutura_opcoes') return (
      <StepOpcoes servicos={listaEstrutura} onConfirm={sels => { set('estruturaSelecionada', sels); ir('equipe_pergunta'); }} />
    );

    // ── EQUIPE ───────────────────────────────────────────────────────────────
    if (step === 'equipe_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Vai precisar de algum **profissional**?
*(recepcionista, segurança, DJ...)*</Pergunta>
        <OpcaoBtn onClick={async () => { await carregarTipo('operacao', setListaEquipe); ir('equipe_selecao'); }}>Sim</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('gastro_pergunta')}>Não</OpcaoBtn>
      </div>
    );

    if (step === 'equipe_selecao') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Selecione os **profissionais**:</Pergunta>
        <StepMultiSelect servicos={listaEquipe} loading={loadingOpcoes}
          onConfirm={e => { setListaEquipe(e); ir('equipe_opcoes'); }}
          onSkip={() => ir('gastro_pergunta')} />
      </div>
    );

    if (step === 'equipe_opcoes') return (
      <StepOpcoes servicos={listaEquipe} onConfirm={sels => { set('equipeSelecionada', sels); ir('equipe_detalhes'); }} />
    );

    if (step === 'equipe_detalhes') return (
      <StepEquipeDetalhes equipe={dados.equipeSelecionada} onConfirm={async det => {
        set('equipeDetalhes', det);
        // Verifica se tem recepcionista — busca opções de vestuário
        const temRecepcao = dados.equipeSelecionada.some(s =>
          (s.serviceName || '').toLowerCase().includes('recepcion')
        );
        if (temRecepcao) {
          try {
            const { collection, getDocs, query, where } = await import('firebase/firestore');
            // Busca no catálogo admin (services) — sem filtrar por tipo para não perder nada
            const snap = await getDocs(collection(db, 'services'));
            const norm = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            // Pega o sub-serviço "Roupa Recepcionista" (filho de Vestuário)
            const vestuarios = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => {
              const n = norm(s.name);
              return n.includes('roupa') && n.includes('recepcionist');
            });
            // Busca opções de cada serviço de vestuário
            const comOpcoes = await Promise.all(vestuarios.map(async v => {
              const opSnap = await getDocs(collection(db, 'services', v.id, 'opcoes'));
              return { ...v, serviceName: v.name, opcoes: opSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.ativo !== false) };
            }));
            setListaVestuario(comOpcoes.filter(v => v.opcoes.length > 0));
            ir('vestuario_recepcao');
          } catch(e) { console.error(e); ir('gastro_pergunta'); }
        } else {
          ir('gastro_pergunta');
        }
      }} />
    );

    // ── VESTUÁRIO RECEPCIONISTA ──────────────────────────────────────────────
    if (step === 'vestuario_recepcao') {
      const opcoes = listaVestuario.flatMap(v => v.opcoes.map(op => ({ ...op, serviceName: v.serviceName, serviceParentName: v.serviceParentName })));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <Pergunta>Qual será o **vestuário das recepcionistas**?</Pergunta>
          {opcoes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(123,175,212,0.5)', textAlign: 'center', padding: 12 }}>Carregando opções...</div>
          ) : opcoes.map(op => (
            <OpcaoBtn key={op.id} onClick={() => { set('vestuarioRecepcao', { id: op.id, nome: op.nome, valor: op.valor, unidade: op.unidade, serviceName: op.serviceName }); ir('gastro_pergunta'); }}>
              {op.nome}
            </OpcaoBtn>
          ))}
          <OpcaoBtn onClick={() => ir('gastro_pergunta')}>Definir depois</OpcaoBtn>
        </div>
      );
    }

    // ── GASTRONOMIA ──────────────────────────────────────────────────────────
    if (step === 'gastro_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Vai precisar de **alimentação ou bebidas**?</Pergunta>
        <OpcaoBtn onClick={async () => { await carregarTipo('gastronomia', setListaGastro); ir('gastro_selecao'); }}>Sim</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('servicos_pergunta')}>Não</OpcaoBtn>
      </div>
    );

    if (step === 'gastro_selecao') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Selecione os serviços de **gastronomia**:</Pergunta>
        <StepMultiSelect servicos={listaGastro} loading={loadingOpcoes}
          onConfirm={e => { setListaGastro(e); ir('gastro_opcoes'); }}
          onSkip={() => ir('servicos_pergunta')} />
      </div>
    );

    if (step === 'gastro_opcoes') return (
      <StepOpcoes servicos={listaGastro} onConfirm={sels => { set('gastronomeSelecionada', sels); ir('servicos_pergunta'); }} />
    );

    // ── SERVIÇOS ─────────────────────────────────────────────────────────────
    if (step === 'servicos_pergunta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Vai precisar de **equipamentos ou atrações**?
*(som, iluminação, fotografia...)*</Pergunta>
        <OpcaoBtn onClick={async () => { await carregarTipo('entretenimento', setListaServicos); ir('servicos_selecao'); }}>Sim</OpcaoBtn>
        <OpcaoBtn onClick={() => ir('info_extra')}>Não</OpcaoBtn>
      </div>
    );

    if (step === 'servicos_selecao') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Selecione os **equipamentos e atrações**:</Pergunta>
        <StepMultiSelect servicos={listaServicos} loading={loadingOpcoes}
          onConfirm={e => { setListaServicos(e); ir('servicos_opcoes'); }}
          onSkip={() => ir('info_extra')} />
      </div>
    );

    if (step === 'servicos_opcoes') return (
      <StepOpcoes servicos={listaServicos} onConfirm={sels => { set('servicosSelecionados', sels); ir('info_extra'); }} />
    );

    // ── INFO EXTRA ────────────────────────────────────────────────────────────
    if (step === 'info_extra') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <Pergunta>Falta alguma **informação** ou pedido especial?</Pergunta>
        <StepTextareaSimples placeholder="Ex: acessibilidade, tema específico, restrições de marca..." optional onConfirm={val => ir('pagamento', { infoExtra: val })} />
      </div>
    );

    // ── PAGAMENTO ────────────────────────────────────────────────────────────
    if (step === 'pagamento') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <Pergunta>Como prefere a **forma de pagamento**?</Pergunta>
        {[
          { label: '50% na entrada + 50% no final do evento', valor: '50_50' },
          { label: '30, 60 e 90 dias', valor: '30_60_90' },
          { label: 'À vista', valor: 'a_vista' },
        ].map(op => (
          <OpcaoBtn key={op.valor} onClick={() => ir('revisao', { formaPagamento: op.valor })} selected={dados.formaPagamento === op.valor}>{op.label}</OpcaoBtn>
        ))}
      </div>
    );

    // ── REVISÃO ──────────────────────────────────────────────────────────────
    if (step === 'revisao') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <Pergunta>Tudo certo! Confira o **resumo**:</Pergunta>
        <StepRevisao dados={dados} modeloSelecionado={modeloSelecionado} submitting={submitting} onConfirm={handleConfirm} onReset={() => { setHistorico([]); setStep('stand_pergunta'); }} />
      </div>
    );

    // ── ENVIADO ───────────────────────────────────────────────────────────────
    if (step === 'sent') return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 60 }}>🎉</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif' }}>Proposta enviada!</div>
        <div style={{ fontSize: 15, color: '#7BAFD4', lineHeight: 1.6, fontFamily: 'Outfit, sans-serif', maxWidth: 380 }}>
          Nossa equipe recebeu seu briefing. Em breve um coordenador entrará em contato.
        </div>
        <BtnAvancar onClick={onClose}>Fechar</BtnAvancar>
      </div>
    );

    return null;
  };

  // ── Layout tela cheia ─────────────────────────────────────────────────────
  if (step === 'sent') return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(160deg,#0A1626 0%,#0D1F35 100%)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {renderConteudo()}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(160deg,#0A1626 0%,#0D1F35 100%)', zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Topo: botão voltar + logo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', flexShrink: 0 }}>
        <button onClick={historico.length > 0 ? voltar : onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', padding: '6px 10px', borderRadius: 8, transition: 'all 0.15s' }}>
          ← {historico.length > 0 ? 'Voltar' : 'Sair'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', fontFamily: 'Outfit, sans-serif' }}>R</div>
          <span style={{ fontSize: 13, color: '#7BAFD4', fontFamily: 'Outfit, sans-serif' }}>Realize Hub</span>
        </div>
        <button onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#7BAFD4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', padding: '6px 10px', borderRadius: 8, transition: 'all 0.15s' }}>
          Fechar ×
        </button>
      </div>

      {/* Barra de progresso */}
      <ProgressBar step={step} />

      {/* Conteúdo centralizado com scroll */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px 48px' }}>
        <div style={{ width: '100%', maxWidth: 520 }} key={step}>
          {renderConteudo()}
        </div>
      </div>
    </div>
  );
}
