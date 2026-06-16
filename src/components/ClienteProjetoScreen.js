import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, query, where,
  updateDoc, doc, addDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const STATUS_CONFIG = {
  analyzing:       { label: 'Em analise',           color: '#FFA726' },
  pendingApproval: { label: 'Orcamento disponivel', color: '#0080FF' },
  approved:        { label: 'Aprovado',             color: '#00E5C4' },
  inProgress:      { label: 'Em andamento',         color: '#0080FF' },
  completed:       { label: 'Concluido',            color: '#66BB6A' },
  rejected:        { label: 'Cancelado',            color: '#ef4444' },
};

function formatDateShort(str) {
  if (!str) return '—';
  if (str.includes('-')) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  return str;
}

function formatBRL(v) {
  return (parseFloat(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ClienteProjetoScreen({ budget, userData, onBack }) {
  const [activeTab, setActiveTab]             = useState('briefing');
  const [project, setProject]                 = useState(budget);
  const [tasksPendentes, setTasksPendentes]   = useState([]);
  const [aprovandoTask, setAprovandoTask]     = useState(false);
  const [aprovando, setAprovando]             = useState(false);

  // Escuta mudanças no budget em tempo real
  useEffect(() => {
    if (!budget?.id) return;
    const unsub = onSnapshot(doc(db, 'budgets', budget.id), snap => {
      if (snap.exists()) setProject({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [budget?.id]);

  // Escuta tasks pendentes de aprovação
  useEffect(() => {
    if (!budget?.id) return;
    const statusPendentes = [
      'aguardando_pre_aprovacao',
      'aguardando_aprovacao_execucao',
      'aguardando_aprovacao_entrega',
    ];
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('budgetId', '==', budget.id)),
      snap => {
        const pendentes = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => statusPendentes.includes(t.status));
        setTasksPendentes(pendentes);
      }
    );
    return () => unsub();
  }, [budget?.id]);

  // ── Aprovação de task ────────────────────────────────────────────────────
  const handleAprovarTask = async (task, aprovado) => {
    if (!aprovado && !window.confirm('Solicitar ajuste nesta entrega?')) return;
    setAprovandoTask(true);
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: aprovado ? 'concluido' : 'ajuste',
        aprovacaoClienteEm: serverTimestamp(),
        aprovacaoClienteOk: aprovado,
        updatedAt: serverTimestamp(),
      });

      if (aprovado && task.status === 'aguardando_aprovacao_execucao') {
        const allTasksSnap = await getDocs(query(collection(db, 'tasks'), where('budgetId', '==', task.budgetId)));
        const allTasks = allTasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const tasksExec = allTasks.filter(t => t.fase === 'execucao');
        const todasExecConcluidas = tasksExec.every(t => t.id === task.id ? true : t.status === 'concluido');
        if (todasExecConcluidas) {
          await updateDoc(doc(db, 'budgets', task.budgetId), {
            workspaceStage: 'Acontecendo',
            updatedAt: serverTimestamp(),
          });
        }
      }

      if (aprovado && task.fase === 'preparacao') {
        await addDoc(collection(db, 'tasks'), {
          budgetId:          task.budgetId,
          supplierJobId:     task.supplierJobId,
          supplierId:        task.supplierId,
          supplierName:      task.supplierName,
          serviceName:       task.serviceName,
          serviceParentName: task.serviceParentName,
          tipoServico:       task.tipoServico,
          nome:              `Execução — ${task.serviceName}`,
          descricao:         task.descricao || '',
          dataInicio:        task.dataInicio || '',
          dataEntrega:       task.dataEntrega || '',
          diasAntes:         task.diasAntes || 0,
          diasPreparo:       task.diasPreparo || 0,
          diasMontagem:      task.diasMontagem || 0,
          diasEvento:        task.diasEvento || 1,
          valor:             task.valor || 0,
          preco:             task.preco || 0,
          unidade:           task.unidade || '',
          fase:              'execucao',
          status:            'pendente',
          cor:               '#00E5C4',
          preAprovacao:      false,
          aprovacaoExecucao: task.aprovacaoExecucao || false,
          taskPreparacaoId:  task.id,
          createdAt:         serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); alert('Erro ao processar aprovação.'); }
    finally { setAprovandoTask(false); }
  };

  // ── Aprovar orçamento ────────────────────────────────────────────────────
  const handleAprovarOrcamento = async () => {
    if (!window.confirm('Aprovar este orçamento? O evento será confirmado.')) return;
    setAprovando(true);
    try {
      await updateDoc(doc(db, 'budgets', project.id), {
        status: 'approved',
        workspaceStage: 'Aguardando',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: [...(project.timeline || []), {
          action: 'approved',
          description: 'Orçamento aprovado pelo cliente',
          timestamp: new Date(),
        }],
      });

      const sjSnap = await getDocs(query(
        collection(db, 'supplierJobs'),
        where('budgetId', '==', project.id),
        where('status', '==', 'confirmed')
      ));
      const sjs = sjSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const cronograma = project.cronograma?.etapas || [];

      // Calcula diasEvento corretamente pelas datas
      const calcDias = () => {
        const ini = project.briefingData?.evento?.dataInicio || project.startDate;
        const fim = project.briefingData?.evento?.dataFim    || project.endDate;
        if (ini && fim) { const d = Math.round((new Date(fim+'T12:00:00')-new Date(ini+'T12:00:00'))/(864e5))+1; return d > 0 ? d : 1; }
        return project.briefingData?.evento?.diasDuracao || 1;
      };
      const diasEvento = calcDias();

      await Promise.all(sjs.map(async sj => {
        await updateDoc(doc(db, 'supplierJobs', sj.id), { stage: 'aguardando', updatedAt: serverTimestamp() });

        const etapa = cronograma.find(e =>
          (e.nome||'').toLowerCase().includes((sj.serviceName||'').toLowerCase()) ||
          (sj.serviceName||'').toLowerCase().includes((e.nome||'').toLowerCase())
        );

        // Busca preAprovacao e aprovacaoExecucao — tenta por opcaoCatalogoId primeiro, depois por nome
        let preAprovacao = false, aprovacaoExecucao = false;
        try {
          // 1. Pelo opcaoCatalogoId (sub-serviço direto)
          if (sj.opcaoCatalogoId) {
            const svcSnap = await getDocs(query(collection(db, 'services'), where('__name__', '==', sj.opcaoCatalogoId)));
            if (!svcSnap.empty) {
              // é uma opção — busca o pai (sub-serviço) para pegar os toggles
              const parentId = svcSnap.docs[0].data().parentId;
              if (parentId) {
                const parentSnap = await getDoc(doc(db, 'services', parentId));
                if (parentSnap.exists()) {
                  preAprovacao      = !!parentSnap.data().preAprovacao;
                  aprovacaoExecucao = !!parentSnap.data().aprovacaoExecucao;
                }
              }
            }
          }
          // 2. Fallback: busca pelo nome do serviço
          if (!preAprovacao && !aprovacaoExecucao) {
            const svcSnap = await getDocs(query(collection(db, 'services'), where('name', '==', sj.serviceName)));
            if (!svcSnap.empty) {
              preAprovacao      = !!svcSnap.docs[0].data().preAprovacao;
              aprovacaoExecucao = !!svcSnap.docs[0].data().aprovacaoExecucao;
            } else {
              const modeloSnap = await getDocs(query(collection(db, 'modelosEspeciais'), where('nome', '==', sj.serviceName)));
              if (!modeloSnap.empty) {
                preAprovacao      = !!modeloSnap.docs[0].data().preAprovacao;
                aprovacaoExecucao = !!modeloSnap.docs[0].data().aprovacaoExecucao;
              }
            }
          }
        } catch (e) { console.error(e); }

        // Calcula valor correto da task
        const _det    = (project.briefingData?.equipe?.itens || []).find(e => e.tipo === sj.serviceName) || {};
        const horasEv = (() => {
          const ini = sj.eventHorarioInicio || project.briefingData?.evento?.horarioInicio;
          const fim = sj.eventHorarioFim   || project.briefingData?.evento?.horarioFim;
          if (ini && fim) { const [h1,m1]=ini.split(':').map(Number),[h2,m2]=fim.split(':').map(Number); const h=(h2*60+m2-h1*60-m1)/60; return h>0?h:0; }
          return 0;
        })();
        const horas    = parseFloat(sj.horasPorDia || _det.horasPorDia) || horasEv;
        const qtd      = parseFloat(sj.quantidade  || _det.quantidade)  || 1;
        const diasServ = parseFloat(sj.diasServico || _det.dias) || diasEvento;
        const visitantes = parseFloat(sj.eventVisitantes || project.guestCount) || 0;
        const preco    = parseFloat(sj.preco || 0);
        const unidade  = (sj.unidade || '').toLowerCase();
        const valor    = unidade.includes('hora')   ? preco * horas * diasServ * qtd
                       : unidade.includes('dia')    ? preco * diasServ * qtd
                       : unidade.includes('pessoa') ? preco * visitantes * diasServ
                       : preco;

        const taskBase = {
          budgetId:          project.id,
          supplierJobId:     sj.id,
          supplierId:        sj.supplierId,
          supplierName:      sj.supplierName || sj.confirmedBy || '',
          serviceName:       sj.serviceName || '',
          serviceParentName: sj.serviceParentName || '',
          tipoServico:       sj.tipoServico || '',
          opcaoCatalogoId:   sj.opcaoCatalogoId || '',
          opcaoNome:         sj.opcaoNome || '',
          nome:              sj.serviceName || '',
          descricao:         etapa?.descricao || '',
          dataInicio:        etapa?.dataInicio || etapa?.di || '',
          dataEntrega:       etapa?.dataEntrega || etapa?.de || '',
          diasAntes:         etapa?.diasAntes || 0,
          diasPreparo:       sj.diasPreparo || 0,
          diasMontagem:      sj.diasMontagem || 0,
          diasEvento,
          horasPorDia:       horas,
          quantidade:        qtd,
          diasServico:       diasServ,
          eventHorarioInicio: sj.eventHorarioInicio || project.briefingData?.evento?.horarioInicio || '',
          eventHorarioFim:   sj.eventHorarioFim    || project.briefingData?.evento?.horarioFim    || '',
          eventLocal:        sj.eventLocal || project.location || '',
          eventVisitantes:   visitantes,
          valor,
          preco,
          unidade:           sj.unidade || '',
          observacoes:       sj.observacoes || '',
          preAprovacao,
          aprovacaoExecucao,
          createdAt:         serverTimestamp(),
        };

        if (preAprovacao) {
          await addDoc(collection(db, 'tasks'), { ...taskBase, fase: 'preparacao', nome: `Preparação — ${sj.serviceName}`, status: 'pendente', cor: '#7BAFD4' });
        } else {
          await addDoc(collection(db, 'tasks'), { ...taskBase, fase: 'execucao', nome: `Execução — ${sj.serviceName}`, status: 'pendente', cor: '#00E5C4' });
        }
      }));
    } catch (e) { console.error(e); alert('Erro ao aprovar.'); }
    finally { setAprovando(false); }
  };

  const handleRecusarOrcamento = async () => {
    if (!window.confirm('Recusar este orçamento?')) return;
    setAprovando(true);
    try {
      await updateDoc(doc(db, 'budgets', project.id), {
        status: 'rejected',
        workspaceStage: 'Propostas',
        updatedAt: serverTimestamp(),
        timeline: [...(project.timeline || []), {
          action: 'rejected',
          description: 'Orçamento recusado pelo cliente',
          timestamp: new Date(),
        }],
      });
      onBack();
    } catch (e) { alert('Erro ao recusar.'); }
    finally { setAprovando(false); }
  };

  if (!project) return null;

  const ev       = project.briefingData?.evento || {};
  const est      = project.briefingData?.estrutura || {};
  const servicos = project.briefingData?.servicosNecessarios || [];
  const statusInfo = STATUS_CONFIG[project.status] || STATUS_CONFIG.analyzing;
  const cronograma = project.cronograma?.etapas || [];
  const fin        = project.financeiro || {};
  const orcamento  = project.orcamentoFinal || {};

  const TABS = [
    { id: 'briefing',    label: 'Briefing' },
    { id: 'acao',        label: `Ação${tasksPendentes.length ? ` (${tasksPendentes.length})` : ''}` },
    { id: 'cronograma',  label: 'Cronograma' },
    { id: 'financeiro',  label: 'Financeiro' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .cps-wrap { min-height: 100vh; background: #f0f2f5; font-family: 'Outfit', sans-serif; color: #1a2e40; }
        .cps-topbar { background: #0D1B2A; padding: 0 36px; display: flex; align-items: center; justify-content: space-between; height: 60px; border-bottom: 1px solid rgba(0,180,255,0.1); position: sticky; top: 0; z-index: 10; }
        .cps-back { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #7BAFD4; font-size: 13px; background: none; border: none; font-family: 'Outfit', sans-serif; transition: color 0.15s; }
        .cps-back:hover { color: #00E5C4; }
        .cps-hero { background: #0D1B2A; padding: 28px 36px 0; border-bottom: 1px solid rgba(0,180,255,0.08); }
        .cps-hero-title { font-size: 26px; font-weight: 300; color: #E8F4FF; margin-bottom: 6px; }
        .cps-hero-meta { display: flex; gap: 20px; font-size: 13px; color: #7BAFD4; margin-bottom: 16px; flex-wrap: wrap; }
        .cps-tabs { display: flex; gap: 4px; }
        .cps-tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 300; color: rgba(123,175,212,0.6); border-bottom: 2px solid transparent; transition: all 0.15s; }
        .cps-tab:hover { color: #7BAFD4; }
        .cps-tab.active { color: #00E5C4; border-bottom-color: #00E5C4; font-weight: 500; }
        .cps-tab.alert { color: #FFA726; }
        .cps-tab.alert.active { color: #FFA726; border-bottom-color: #FFA726; }
        .cps-body { padding: 28px 36px; max-width: 860px; }
        .cps-card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #e8eaed; }
        .cps-card-title { font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #00E5C4; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f0f2f5; }
        .cps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .cps-info-label { font-size: 11px; color: #8a9bb0; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; }
        .cps-info-value { font-size: 14px; color: #1a2e40; }
        .cps-tag { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: rgba(0,229,196,0.1); color: #00E5C4; margin: 3px; }
        .cps-action-card { border-radius: 12px; padding: 18px; margin-bottom: 14px; }
        .cps-crono-item { display: flex; gap: 16px; padding: 14px 0; border-bottom: 1px solid #f0f2f5; }
        .cps-crono-dot { width: 10px; height: 10px; border-radius: 50%; background: #00E5C4; flex-shrink: 0; margin-top: 5px; }
        @media (max-width: 600px) { .cps-topbar { padding: 0 16px; } .cps-hero { padding: 20px 16px 0; } .cps-body { padding: 16px; } .cps-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="cps-wrap">

        {/* TOPBAR */}
        <div className="cps-topbar">
          <button className="cps-back" onClick={onBack}>← Voltar</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 400, color: '#E8F4FF' }}>{project.eventName || 'Projeto'}</span>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, letterSpacing: 1, background: `${statusInfo.color}18`, color: statusInfo.color }}>
              {statusInfo.label}
            </span>
          </div>
          <div style={{ width: 80 }} />
        </div>

        {/* HERO */}
        <div className="cps-hero">
          <h1 className="cps-hero-title">{project.eventName || project.eventTypeName || 'Projeto'}</h1>
          <div className="cps-hero-meta">
            {project.numeroPedido && <span style={{ color: '#00E5C4', fontWeight: 500, letterSpacing: 1 }}>{project.numeroPedido}</span>}
            <span>{project.eventTypeName || '—'}</span>
            {project.startDate && <span>{formatDateShort(project.startDate)}{project.endDate && project.endDate !== project.startDate ? ` até ${formatDateShort(project.endDate)}` : ''}</span>}
            {ev.local && <span>{ev.local}</span>}
          </div>
          <div className="cps-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`cps-tab${activeTab === t.id ? ' active' : ''}${t.id === 'acao' && tasksPendentes.length > 0 ? ' alert' : ''}`}
                onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* BODY */}
        <div className="cps-body">

          {/* ── ABA BRIEFING ── */}
          {activeTab === 'briefing' && (() => {
            const bd       = project.briefingData || {};
            const ev2      = bd.evento || {};
            const est2     = bd.estrutura || {};
            const equipe2  = bd.equipe || {};
            const gastro2  = bd.gastronomia?.alimentos || {};
            const opcoes   = bd.opcoesSelecionadas || [];
            const labelPag = { '50_50': '50% entrada + 50% final', '30_60_90': '30 / 60 / 90 dias', 'a_vista': 'À vista' };

            const InfoItem = ({ label, value }) => value ? (
              <div><div className="cps-info-label">{label}</div><div className="cps-info-value">{value}</div></div>
            ) : null;

            return (
            <>
              {/* Resumo IA */}
              {project.descricaoBriefing && (
                <div className="cps-card">
                  <div className="cps-card-title">Sobre o Evento</div>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{project.descricaoBriefing}</p>
                </div>
              )}

              {/* EVENTO */}
              <div className="cps-card">
                <div className="cps-card-title">Evento</div>
                <div className="cps-grid">
                  <InfoItem label="Empresa" value={ev2.nomeEmpresa} />
                  <InfoItem label="Tipo" value={ev2.tipo || project.eventTypeName} />
                  <InfoItem label="Nome" value={ev2.nome || project.eventName} />
                  <InfoItem label="Data início" value={formatDateShort(ev2.dataInicio || project.startDate)} />
                  <InfoItem label="Data término" value={formatDateShort(ev2.dataFim)} />
                  <InfoItem label="Horário" value={ev2.horarioInicio ? `${ev2.horarioInicio} às ${ev2.horarioFim || ''}` : null} />
                  <InfoItem label="Cidade" value={ev2.cidade} />
                  <InfoItem label="Local" value={ev2.local || project.location} />
                  <InfoItem label="Participantes/dia" value={ev2.visitantesPorDia ? `${ev2.visitantesPorDia} pessoas` : null} />
                  <InfoItem label="Pagamento" value={labelPag[bd.formaPagamento]} />
                </div>
              </div>

              {/* INFO EXTRA */}
              {bd.infoExtra && (
                <div className="cps-card" style={{ borderLeft: '3px solid #667eea' }}>
                  <div className="cps-card-title">Informações Adicionais</div>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }}>{bd.infoExtra}</p>
                </div>
              )}

              {/* STAND */}
              {est2.ativo && (
                <div className="cps-card">
                  <div className="cps-card-title">Stand</div>
                  <div className="cps-grid">
                    <InfoItem label="Tipo" value={est2.tipoEstande === 'modular' ? 'Modular' : est2.tipoEstande === 'personalizado' ? 'Personalizado' : null} />
                    {bd.modeloEstande && <InfoItem label="Modelo" value={bd.modeloEstande.nome} />}
                    <InfoItem label="Área" value={est2.areaM2 > 0 ? `${est2.areaM2} m²` : null} />
                    <InfoItem label="Altura do teto" value={est2.alturaTeto} />
                    <InfoItem label="Dias de montagem" value={est2.diasMontagem > 0 ? `${est2.diasMontagem} dias antes` : null} />
                    <InfoItem label="Restrições" value={est2.restricoes || (est2.restricoes === '' ? 'Sem restrições' : null)} />
                    <InfoItem label="Identidade visual" value={est2.identidadeVisual === 'sim' ? '✓ Sim' : est2.identidadeVisual === 'nao' ? 'Não definida ainda' : null} />
                    {est2.standDescricao && (
                      <div style={{ gridColumn: '1/-1' }}>
                        <div className="cps-info-label">Descrição do stand</div>
                        <div className="cps-info-value" style={{ whiteSpace: 'pre-wrap' }}>{est2.standDescricao}</div>
                      </div>
                    )}
                  </div>
                  {/* Imagens do stand */}
                  {est2.standImagensUrls?.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div className="cps-info-label" style={{ marginBottom: 8 }}>Imagens de referência</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {est2.standImagensUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`ref ${i+1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Arquivos de identidade visual */}
                  {est2.identidadeImagensUrls?.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div className="cps-info-label" style={{ marginBottom: 8 }}>Arquivos de identidade visual</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {est2.identidadeImagensUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0080FF', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid #e0e8ff', background: '#f0f4ff' }}>
                            📎 Arquivo {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PRODUTOR */}
              {equipe2.produtor?.ativo && (
                <div className="cps-card">
                  <div className="cps-card-title">Produtor de Eventos</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>✓ Cliente solicitou Produtor Executivo dedicado para o evento.</div>
                </div>
              )}

              {/* SERVIÇOS SELECIONADOS */}
              {opcoes.length > 0 && (
                <div className="cps-card">
                  <div className="cps-card-title">Serviços Selecionados</div>
                  {['estrutura', 'operacao', 'gastronomia', 'entretenimento'].map(tipo => {
                    const itens = opcoes.filter(o => o.tipoServico === tipo);
                    if (!itens.length) return null;
                    const labelTipo = { estrutura: 'Estrutura', operacao: 'Equipe', gastronomia: 'Gastronomia', entretenimento: 'Serviços e Entretenimento' }[tipo];
                    return (
                      <div key={tipo} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{labelTipo}</div>
                        {itens.map((op, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid #f0f2f5', marginBottom: 6, background: '#fafbff' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{op.serviceName}</div>
                              {op.nome && <div style={{ fontSize: 11, color: '#667eea', marginTop: 2 }}>Opção: {op.nome}</div>}
                              {/* Detalhes de equipe */}
                              {equipe2.itens?.find(e => e.tipo === op.serviceName) && (() => {
                                const det = equipe2.itens.find(e => e.tipo === op.serviceName);
                                return (
                                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                    {det.quantidade > 0 && `${det.quantidade} profissional(is)`}
                                    {det.horasPorDia > 0 && ` · ${det.horasPorDia}h/dia`}
                                    {det.dias > 0 && ` · ${det.dias} dia(s)`}
                                    {det.observacoes && ` · ${det.observacoes}`}
                                  </div>
                                );
                              })()}
                            </div>
                            {op.valor > 0 && (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#00E5C4' }}>
                                  {formatBRL(op.valor)}
                                </div>
                                {op.unidade && <div style={{ fontSize: 10, color: '#94a3b8' }}>{op.unidade}</div>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* GASTRONOMIA extra info */}
              {gastro2.ativo && (
                <div className="cps-card">
                  <div className="cps-card-title">Gastronomia</div>
                  <div className="cps-grid">
                    <InfoItem label="Serviço" value={gastro2.formato} />
                    <InfoItem label="Pessoas" value={gastro2.pessoas ? `${gastro2.pessoas} pessoas` : null} />
                    <InfoItem label="Restrições" value={gastro2.restricoes || 'Nenhuma'} />
                    <InfoItem label="Cozinha no local" value={gastro2.cozinha ? 'Sim' : 'Não'} />
                  </div>
                </div>
              )}
            </>
            );
          })()}

          {/* ── ABA AÇÃO ── */}
          {activeTab === 'acao' && (
            <>
              {/* Aprovação de orçamento */}
              {project.status === 'pendingApproval' && orcamento.total > 0 && (
                <div className="cps-card">
                  <div className="cps-card-title">Orçamento aguardando aprovação</div>

                  {(orcamento.itens || []).map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f2f5' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{item.serviceName}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          {item.supplierName} · {formatBRL(item.preco)} × {item.diasEvento} dia(s)
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{formatBRL(item.subtotal)}</div>
                    </div>
                  ))}

                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                      <span>Subtotal serviços</span>
                      <span>{formatBRL(orcamento.subtotalFornecedores)}</span>
                    </div>
                    {orcamento.valorFee > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                        <span>Taxa de serviço ({orcamento.pctFee}%)</span>
                        <span>{formatBRL(orcamento.valorFee)}</span>
                      </div>
                    )}
                    {orcamento.valorImpostos > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                        <span>Impostos ({orcamento.pctImpostos}%)</span>
                        <span>{formatBRL(orcamento.valorImpostos)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#0080FF', marginTop: 8, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                      <span>Total</span>
                      <span>{formatBRL(orcamento.total)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={handleRecusarOrcamento} disabled={aprovando}
                      style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      Recusar
                    </button>
                    <button onClick={handleAprovarOrcamento} disabled={aprovando}
                      style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: aprovando ? '#e2e8f0' : 'linear-gradient(135deg,#00E5C4,#0080FF)', color: aprovando ? '#94a3b8' : 'white', fontSize: 13, fontWeight: 600, cursor: aprovando ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      {aprovando ? 'Processando...' : '✓ Aprovar Orçamento'}
                    </button>
                  </div>
                </div>
              )}

              {/* Tasks pendentes */}
              {tasksPendentes.length === 0 && project.status !== 'pendingApproval' && (
                <div className="cps-card" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>Nenhuma ação pendente</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Você está em dia com todas as aprovações.</div>
                </div>
              )}

              {tasksPendentes.map(task => {
                const TIPO_LABEL = {
                  aguardando_pre_aprovacao:      { label: 'Pré-aprovação — Preparação do serviço', cor: '#7BAFD4' },
                  aguardando_aprovacao_execucao: { label: 'Aprovação de Execução — Entrega no evento', cor: '#667eea' },
                  aguardando_aprovacao_entrega:  { label: 'Aprovação de Entrega — Encerramento', cor: '#10b981' },
                };
                const tipoInfo = TIPO_LABEL[task.status] || { label: 'Aprovação', cor: '#FFA726' };
                return (
                  <div key={task.id} className="cps-card" style={{ borderLeft: `4px solid ${tipoInfo.cor}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: tipoInfo.cor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{tipoInfo.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{task.nome || task.serviceName}</div>
                    {task.supplierName && <div style={{ fontSize: 12, color: '#667eea', marginBottom: 10 }}>{task.supplierName}</div>}

                    {task.aprovacaoObs && (
                      <div style={{ fontSize: 13, color: '#475569', background: '#f8faff', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                        {task.aprovacaoObs}
                      </div>
                    )}

                    {task.aprovacaoArquivos?.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                        {task.aprovacaoArquivos.map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer"
                            style={{ fontSize: 12, color: '#667eea', textDecoration: 'none', background: 'rgba(102,126,234,0.08)', border: '1px solid rgba(102,126,234,0.2)', padding: '5px 12px', borderRadius: 8 }}>
                            📎 {f.nome}
                          </a>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleAprovarTask(task, false)} disabled={aprovandoTask}
                        style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        Solicitar Ajuste
                      </button>
                      <button onClick={() => handleAprovarTask(task, true)} disabled={aprovandoTask}
                        style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: aprovandoTask ? '#e2e8f0' : `linear-gradient(135deg,${tipoInfo.cor},#0080FF)`, color: aprovandoTask ? '#94a3b8' : 'white', fontSize: 12, fontWeight: 600, cursor: aprovandoTask ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {aprovandoTask ? 'Processando...' : '✓ Aprovar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* ── ABA CRONOGRAMA ── */}
          {activeTab === 'cronograma' && (
            <div className="cps-card">
              <div className="cps-card-title">Cronograma do Projeto</div>
              {cronograma.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                  Cronograma ainda não gerado.
                </div>
              ) : (
                <div>
                  {cronograma.map((etapa, i) => (
                    <div key={i} className="cps-crono-item">
                      <div style={{ paddingTop: 4 }}>
                        <div className="cps-crono-dot" style={{ background: etapa.cor || '#00E5C4' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 3 }}>{etapa.nome || etapa.etapa}</div>
                        {etapa.descricao && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{etapa.descricao}</div>}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {(etapa.dataInicio || etapa.di) && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                              Início: {formatDateShort(etapa.dataInicio || etapa.di)}
                            </span>
                          )}
                          {(etapa.dataEntrega || etapa.de) && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                              Entrega: {formatDateShort(etapa.dataEntrega || etapa.de)}
                            </span>
                          )}
                          {etapa.responsavel && (
                            <span style={{ fontSize: 11, color: '#667eea' }}>{etapa.responsavel}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ABA FINANCEIRO ── */}
          {activeTab === 'financeiro' && (
            <>
              {/* Resumo */}
              {(fin.valorTotal || orcamento.total) ? (
                <>
                  <div className="cps-card">
                    <div className="cps-card-title">Resumo Financeiro</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'Serviços', value: fin.valorFornecedores || orcamento.subtotalFornecedores, color: '#1e293b' },
                        { label: `Fee (${fin.fee || orcamento.pctFee || 0}%)`, value: fin.valorFee || orcamento.valorFee, color: '#00E5C4' },
                        { label: `Impostos (${fin.impostos || orcamento.pctImpostos || 0}%)`, value: fin.valorImpostos || orcamento.valorImpostos, color: '#ef4444' },
                        { label: 'Total', value: fin.valorTotal || orcamento.total, color: '#0080FF', bold: true },
                      ].map(s => (
                        <div key={s.label} style={{ background: '#f8faff', borderRadius: 10, padding: '14px 16px', border: s.bold ? '2px solid rgba(0,128,255,0.3)' : '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{s.label}</div>
                          <div style={{ fontSize: s.bold ? 18 : 15, fontWeight: 700, color: s.color }}>{formatBRL(s.value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Parcelas */}
                  {fin.parcelas?.length > 0 && (
                    <div className="cps-card">
                      <div className="cps-card-title">Parcelas</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {fin.parcelas.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: `1px solid ${p.pago ? 'rgba(16,185,129,0.3)' : '#e2e8f0'}`, background: p.pago ? 'rgba(16,185,129,0.04)' : 'white' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{i + 1}ª parcela — {p.percentual}%</div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Vencimento: {p.dataVenc || '—'}</div>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: p.pago ? '#10b981' : '#0080FF' }}>{formatBRL(p.valor)}</div>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: p.pago ? 'rgba(16,185,129,0.1)' : 'rgba(255,167,38,0.1)', color: p.pago ? '#10b981' : '#FFA726' }}>
                              {p.pago ? '✓ Pago' : 'Pendente'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Forma de pagamento */}
                  {fin.formaPagamento && (
                    <div className="cps-card">
                      <div className="cps-card-title">Forma de Pagamento</div>
                      <div style={{ fontSize: 14, color: '#1e293b' }}>
                        {fin.formaPagamento === '50_50' && '50% entrada + 50% final'}
                        {fin.formaPagamento === '30_60_90' && '30 / 60 / 90 dias'}
                        {fin.formaPagamento === '30_60_90_120' && '30 / 60 / 90 / 120 dias'}
                        {fin.formaPagamento === 'a_vista' && 'À vista'}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="cps-card" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Financeiro ainda não disponível. Aguardando aprovação do orçamento.</div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}
