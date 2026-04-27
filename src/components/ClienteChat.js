import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, collection, getDocs, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

function extractJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { return null; }
  }
  const m2 = text.match(/\{[\s\S]*"evento"[\s\S]*\}/);
  if (m2) { try { return JSON.parse(m2[0]); } catch { return null; } }
  return null;
}

export default function ClienteChat({ userData, onClose }) {
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [systemScript, setSystemScript] = useState('');
  const [pricingData, setPricingData]   = useState([]);
  const [briefingJson, setBriefingJson] = useState(null);
  const [step, setStep]                 = useState('chat');
  const [submitting, setSubmitting]     = useState(false);
  const [assistantName, setAssistantName] = useState('Realize');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const userId   = userData?.id;
  const userName = userData?.name || userData?.email?.split('@')[0] || 'Cliente';

  // ── carrega script e pricing ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'aiScript'));
        if (snap.exists()) {
          const content = snap.data().content || '';
          setSystemScript(content);
          // Extrai o nome da IA do script
          const nameMatch = content.match(/[Ss]eu nome [eé] [""]?([A-Za-zÀ-ú]+)[""]?/);
          if (nameMatch) setAssistantName(nameMatch[1]);
        }
      } catch (e) { console.error('Erro ao carregar script:', e); }

      try {
        const snap = await getDocs(collection(db, 'servicePricing'));
        setPricingData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error('Erro ao carregar pricing:', e); }
    })();
  }, []);

  // ── mensagem inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!assistantName) return;
    setMessages([{
      role: 'assistant',
      content: `Olá! Sou a **${assistantName}**, assistente de eventos da Realize Hub. 😊\n\nVou te ajudar a planejar seu evento e montar um pré-orçamento. Para começar: **que tipo de evento você está pensando?**\n\n_(Pode ser uma feira, congresso, lançamento de produto, evento corporativo...)_`,
      id: 'init',
    }]);
  }, [assistantName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── enviar mensagem ───────────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: text, id: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const history = updated.map(m => ({ role: m.role, content: m.content }));

      const pricingSummary = pricingData.length > 0
        ? `\n\nTABELA DE PREÇOS (resumo):\n${pricingData.slice(0, 40).map(p =>
            `- ${p.tipo || ''} | ${p.subServiceId || p.serviceId || ''} | ${p.estado || 'SP'} | ${p.custoHora ? `R$${p.custoHora}/h` : ''} ${p.custoDiaria ? `R$${p.custoDiaria}/dia` : ''}`
          ).join('\n')}`
        : '';

      const systemPrompt = systemScript + pricingSummary;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: history,
        }),
      });

      const data = await response.json();

      const assistantText = data.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      const assistantMsg = { role: 'assistant', content: assistantText, id: Date.now() + 1 };
      setMessages(prev => [...prev, assistantMsg]);

      const json = extractJson(assistantText);
      if (json && json.evento) {
        setBriefingJson(json);
      }
    } catch (err) {
      console.error('Erro na API:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Desculpe, tive um problema de conexão. Pode repetir a última mensagem?',
        id: Date.now() + 2,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
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
        briefingData: briefingJson,
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
        console.log('supplierServices encontrados:', todosServicos.length, todosServicos.map(s => s.serviceName));

        // Extrai palavras-chave
        const keywords = servicosNecessarios.flatMap(sn =>
          sn.toLowerCase().split(/[\s/,]+/).filter(w => w.length > 2)
        );
        console.log('keywords:', keywords);

        const suppServs = todosServicos.filter(s => {
          if (s.ativo === false) return false;
          const nameLC = (s.serviceName || '').toLowerCase();
          const parentLC = (s.serviceParentName || '').toLowerCase();
          if (servicosNecessarios.includes(s.serviceName)) return true;
          if (servicosNecessarios.includes(s.serviceParentName)) return true;
          return keywords.some(kw => nameLC.includes(kw) || parentLC.includes(kw));
        });
        console.log('suppServs matched:', suppServs.length, suppServs.map(s => s.serviceName));

        const supplierMap = {};
        suppServs.forEach(s => {
          if (!supplierMap[s.supplierId]) supplierMap[s.supplierId] = [];
          supplierMap[s.supplierId].push(s.serviceName);
        });
        console.log('supplierMap:', supplierMap);

        for (const [supplierId, servicos] of Object.entries(supplierMap)) {
          await addDoc(collection(db, 'supplierJobs'), {
            supplierId,
            budgetId: budgetRef.id,
            eventName: briefingJson.evento?.nome || briefingJson.evento?.tipo || 'Novo Evento',
            clientName: userName,
            eventDate: briefingJson.evento?.dataInicio || '',
            serviceNames: servicos,
            stage: 'proposta',
            status: 'pending',
            createdAt: serverTimestamp(),
          });
          console.log('supplierJob criado para:', supplierId);
        }
      } catch (e) { console.error('Erro ao criar supplierJobs:', e); }

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
      .replace(/```json[\s\S]*?```/g, '<div class="bia-json-block">📋 Resumo do briefing gerado</div>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

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
              <Field label="Montagem" value={est.montagem ? 'Sim' : 'Não'} />
              <Field label="Iluminação" value={est.iluminacao ? 'Sim' : 'Não'} />
              <Field label="Som" value={est.som ? 'Sim' : 'Não'} />
              <Field label="Telão" value={est.telao ? 'Sim' : 'Não'} />
              <Field label="Mobiliário" value={est.mobiliario ? 'Sim' : 'Não'} />
            </Grid2>
          </Section>
          <Section title="Equipe Operacional">
            <Grid2>
              {eq.recepcionistas?.quantidade > 0 && <Field label="Recepcionistas" value={`${eq.recepcionistas.quantidade} × ${eq.recepcionistas.horasPorDia}h/dia`} />}
              {eq.seguranca?.quantidade > 0 && <Field label="Segurança" value={`${eq.seguranca.quantidade} × ${eq.seguranca.horasPorDia}h/dia`} />}
              {eq.limpeza?.quantidade > 0 && <Field label="Limpeza" value={`${eq.limpeza.quantidade} × ${eq.limpeza.horasPorDia}h/dia`} />}
            </Grid2>
          </Section>
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
          <button onClick={() => setStep('review')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
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
            <div className="bia-msg-bubble"
              style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.role === 'user' ? 'rgba(0,128,255,0.18)' : 'rgba(255,255,255,0.04)', border: msg.role === 'user' ? '1px solid rgba(0,128,255,0.3)' : '1px solid rgba(0,180,255,0.1)', fontSize: 13, lineHeight: 1.6, color: '#E8F4FF', fontFamily: 'Outfit, sans-serif' }}
              dangerouslySetInnerHTML={{ __html: renderText(msg.content) }}
            />
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
        <button className="bia-send-btn" onClick={sendMessage} disabled={loading || !input.trim()}
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
