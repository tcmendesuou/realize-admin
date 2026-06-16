import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot, updateDoc, addDoc, serverTimestamp, writeBatch, deleteDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebase/config';
import ChatPanel from './ChatPanel';

const STATUS_MAP = {
  analyzing:  { label: 'EM ANÁLISE',   color: '#FFA726', bg: 'rgba(255,167,38,0.15)' },
  approved:   { label: 'APROVADO',     color: '#66BB6A', bg: 'rgba(102,187,106,0.15)' },
  rejected:   { label: 'REJEITADO',    color: '#EF5350', bg: 'rgba(239,83,80,0.15)' },
  inProgress: { label: 'EM ANDAMENTO', color: '#0080FF', bg: 'rgba(0,128,255,0.15)' },
  completed:  { label: 'CONCLUÍDO',    color: '#66BB6A', bg: 'rgba(102,187,106,0.15)' },
};

export default function ProjetoScreen({ projectId, onBack, userData }) {
  const [project, setProject]     = useState(null);
  const [client, setClient]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('briefing');

  // Ajusta aba inicial baseado no perfil
  useEffect(() => {
    if (userData?.systemRole === 'fornecedor') setActiveTab('info');
  }, [userData?.systemRole]);

  // Fornecedor
  const [supplierJob, setSupplierJob]     = useState(null);   // primeiro job (compat)
  const [supplierJobsMine, setSupplierJobsMine] = useState([]); // todos os jobs do fornecedor
  const [confirming, setConfirming]       = useState(false);
  const [supplierJobs, setSupplierJobs]   = useState([]);
  const [gerandoOrcamento, setGerandoOrcamento] = useState(false);
  const [editandoJob, setEditandoJob]           = useState(null);  // id do job sendo editado
  const [editJobForm, setEditJobForm]           = useState({});
  const [trocandoJob, setTrocandoJob]           = useState(null);  // id do job para trocar fornecedor
  const [fornecedoresAlt, setFornecedoresAlt]   = useState([]);    // fornecedores alternativos
  const [salvandoJob, setSalvandoJob]           = useState(false);

  // Tarefas
  const [tasks, setTasks]               = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [showConcluidas, setShowConcluidas]       = useState(false);
  const [showFornConcluidos, setShowFornConcluidos] = useState(false);
  const [todasExpandidas, setTodasExpandidas] = useState(true);
  const [propostasExpandidas, setPropostasExpandidas] = useState(true);
  const [tasksExpandidas, setTasksExpandidas] = useState({});
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [aprovacaoModal, setAprovacaoModal] = useState(null); // { task, tipo: 'pre'|'execucao'|'entrega' }
  const [aprovacaoArquivos, setAprovacaoArquivos] = useState([]);
  const [aprovacaoObs, setAprovacaoObs] = useState('');
  const [uploadingAprov, setUploadingAprov] = useState(false);
  const [newTask, setNewTask]     = useState({ name: '', descricao: '', prazo: '', prioridade: 'normal' });
  const [savingTask, setSavingTask] = useState(false);

  // Envio de cotação
  const [enviandoCotacao, setEnviandoCotacao] = useState(false);
  const [confirmEnvio, setConfirmEnvio] = useState(false);
  const [confirmRelatorio, setConfirmRelatorio] = useState(false);
  const [enviandoRelatorio, setEnviandoRelatorio] = useState(false);
  const [chatAberto, setChatAberto]     = useState(false);
  const [chatNaoLidas, setChatNaoLidas] = useState(0);
  const isFornecedor = userData?.systemRole === 'fornecedor';
  const [coordChatId, setCoordChatId]   = useState(null);
  const [coordChatInfo, setCoordChatInfo] = useState(null);

  const handleEnviarCotacao = async () => {
    setEnviandoCotacao(true);
    try {
      const jobsSnap = await getDocs(query(collection(db, 'supplierJobs'), where('budgetId', '==', projectId), where('status', '==', 'draft')));
      const batch = writeBatch(db);
      jobsSnap.docs.forEach(d => batch.update(d.ref, { status: 'pending', enviadoEm: serverTimestamp() }));
      batch.update(doc(db, 'budgets', projectId), { cotacaoEnviadaEm: serverTimestamp(), updatedAt: serverTimestamp() });
      await batch.commit();
      setConfirmEnvio(false);
    } catch (e) { console.error('Erro ao enviar cotação:', e); }
    finally { setEnviandoCotacao(false); }
  };

  const handleEnviarRelatorio = async () => {
    setEnviandoRelatorio(true);
    try {
      const itens = projectTasks.map(t => ({
        serviceName: t.serviceName,
        supplierName: t.supplierName || '',
        fase: t.fase,
        status: t.status,
        observacaoFornecedor: t.observacaoFornecedor || '',
        valor: t.valor || 0,
      }));
      const totalServicos = itens.reduce((acc, t) => acc + (t.valor || 0), 0);
      await updateDoc(doc(db, 'budgets', projectId), {
        status: 'completed',
        workspaceStage: 'Concluido',
        concluidoEm: serverTimestamp(),
        relatorioFinal: {
          geradoEm: new Date().toISOString(),
          itens,
          totalServicos,
          enviadoPor: userData?.name || 'Coordenador',
        },
        timeline: [...(project.timeline || []), {
          action: 'relatorio_enviado',
          description: `Relatório final enviado ao cliente por ${userData?.name}`,
          userId: userData?.id,
          userName: userData?.name,
          timestamp: new Date(),
        }],
        updatedAt: serverTimestamp(),
      });
      setConfirmRelatorio(false);
    } catch (e) { console.error(e); alert('Erro ao enviar relatório.'); }
    finally { setEnviandoRelatorio(false); }
  };

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(doc(db, 'budgets', projectId), async snap => {
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() };
      setProject(data);

      // Busca dados do cliente
      if (data.clientUserId) {
        try {
          const cSnap = await getDoc(doc(db, 'users', data.clientUserId));
          if (cSnap.exists()) setClient({ id: cSnap.id, ...cSnap.data() });
        } catch (e) { console.error(e); }
      }

      // Busca supplierJobs do projeto
      try {
        const sjAllSnap = await getDocs(query(collection(db, 'supplierJobs'), where('budgetId', '==', snap.id)));
        const allJobs = sjAllSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Busca nomes dos fornecedores
        const supplierIds = [...new Set(allJobs.map(j => j.supplierId).filter(Boolean))];
        const supplierNames = {};
        await Promise.all(supplierIds.map(async sid => {
          try {
            const uSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', sid)));
            if (!uSnap.empty) {
              const d = uSnap.docs[0].data();
              supplierNames[sid] = d.companyName || d.name;
            }
          } catch {}
        }));

        const allJobsComNome = allJobs.map(j => ({
          ...j,
          supplierName: supplierNames[j.supplierId] || j.confirmedBy || 'Fornecedor',
        }));

        setSupplierJobs(allJobsComNome);
        // Se for fornecedor, filtra todos os jobs dele
        if (userData?.systemRole === 'fornecedor') {
          const mine = allJobsComNome.filter(j => j.supplierId === userData.id);
          setSupplierJobsMine(mine);
          if (mine.length > 0) setSupplierJob(mine[0]);
        }
      } catch (e) { console.error(e); }

      // Carrega tarefas do budget
      setTasks(data.tasks || []);
      setLoading(false);
    });
    return () => unsub();
  }, [projectId, userData?.id]);

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('budgetId', '==', projectId)),
      snap => setProjectTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [projectId]);

  const handleAddTask = async () => {
    if (!newTask.name.trim()) { alert('Nome da tarefa obrigatório'); return; }
    setSavingTask(true);
    try {
      const task = {
        taskId: `task-${Date.now()}`,
        name: newTask.name.trim(),
        descricao: newTask.descricao.trim(),
        prazo: newTask.prazo,
        prioridade: newTask.prioridade,
        status: 'todo',
        assignedTo: userData?.id,
        assignedToName: userData?.name,
        createdAt: new Date(),
        createdBy: userData?.name,
      };
      const updatedTasks = [...(project.tasks || []), task];
      await updateDoc(doc(db, 'budgets', projectId), {
        tasks: updatedTasks,
        updatedAt: serverTimestamp(),
        timeline: [...(project.timeline || []), {
          action: 'task_added',
          description: `Tarefa "${task.name}" criada por ${userData?.name}`,
          userId: userData?.id,
          userName: userData?.name,
          timestamp: new Date(),
        }],
      });
      setNewTask({ name: '', descricao: '', prazo: '', prioridade: 'normal' });
      setShowTaskForm(false);
    } catch (e) { console.error(e); alert('Erro ao salvar tarefa.'); }
    finally { setSavingTask(false); }
  };

  const handleTaskStatus = async (taskId, newStatus) => {
    const updatedTasks = tasks.map(t => t.taskId === taskId ? { ...t, status: newStatus, updatedAt: new Date() } : t);
    await updateDoc(doc(db, 'budgets', projectId), {
      tasks: updatedTasks,
      updatedAt: serverTimestamp(),
      timeline: [...(project.timeline || []), {
        action: 'task_updated',
        description: `Tarefa atualizada para "${newStatus}" por ${userData?.name}`,
        userId: userData?.id,
        userName: userData?.name,
        timestamp: new Date(),
      }],
    });
  };

  const handleConfirmarItem = async (sjId, serviceName) => {
    setConfirming(true);
    try {
      await updateDoc(doc(db, 'supplierJobs', sjId), {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        confirmedBy: userData?.name,
      });

      // Cancela outros fornecedores concorrentes para o mesmo serviço neste budget
      const concorrentes = await getDocs(query(
        collection(db, 'supplierJobs'),
        where('budgetId', '==', projectId),
        where('serviceName', '==', serviceName)
      ));
      await Promise.all(concorrentes.docs
        .filter(d => d.id !== sjId && d.data().status === 'pending')
        .map(d => updateDoc(d.ref, { status: 'cancelled', cancelledAt: serverTimestamp(), cancelledReason: 'Outro fornecedor confirmou primeiro' }))
      );

      // Atualiza timeline
      await updateDoc(doc(db, 'budgets', projectId), {
        timeline: [
          ...(project.timeline || []),
          { action: 'supplier_confirmed', description: `Fornecedor "${userData?.name}" confirmou: ${serviceName}`, userId: userData?.id, userName: userData?.name, timestamp: new Date() }
        ],
        updatedAt: serverTimestamp(),
      });
      setSupplierJobsMine(prev => prev.map(sj => sj.id === sjId ? { ...sj, status: 'confirmed' } : sj));
    } catch (e) { console.error(e); alert('Erro ao confirmar.'); }
    finally { setConfirming(false); }
  };

  const handleRecusarItem = async (sjId, serviceName) => {
    if (!window.confirm(`Recusar "${serviceName}"?`)) return;
    setConfirming(true);
    try {
      await updateDoc(doc(db, 'supplierJobs', sjId), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: userData?.name,
      });
      await updateDoc(doc(db, 'budgets', projectId), {
        timeline: [
          ...(project.timeline || []),
          { action: 'supplier_rejected', description: `Fornecedor "${userData?.name}" recusou: ${serviceName}`, userId: userData?.id, userName: userData?.name, timestamp: new Date() }
        ],
        updatedAt: serverTimestamp(),
      });
      setSupplierJobsMine(prev => prev.map(sj => sj.id === sjId ? { ...sj, status: 'rejected' } : sj));
    } catch (e) { console.error(e); alert('Erro ao recusar.'); }
    finally { setConfirming(false); }
  };

  // Fluxo de aprovação de tasks
  const handleConcluirTask = async (task) => {
    // Busca configuração de aprovações do serviço no catálogo
    try {
      const svcSnap = await getDocs(query(collection(db, 'services'), where('name', '==', task.serviceName)));
      let svc = svcSnap.docs[0]?.data() || {};

      // Se não achou em services, busca em modelosEspeciais pelo nome
      if (!svcSnap.docs.length) {
        const meSnap = await getDocs(query(collection(db, 'modelosEspeciais'), where('nome', '==', task.serviceName)));
        if (meSnap.docs.length) {
          svc = meSnap.docs[0].data();
        }
      }

      if (task.fase === 'preparacao') {
        // Task de preparação → sempre exige pré-aprovação do cliente antes de gerar execução
        setAprovacaoModal({ task, tipo: 'pre', label: 'Pré-aprovação', svc });
        setAprovacaoArquivos([]);
        setAprovacaoObs('');
        return;
      }

      if (task.fase === 'execucao') {
        // Task de execução → verifica aprovação de execução (no dia do evento)
        if (svc.aprovacaoExecucao) {
          setAprovacaoModal({ task, tipo: 'execucao', label: 'Aprovação de Execução', svc });
          setAprovacaoArquivos([]);
          setAprovacaoObs('');
          return;
        }
        // Ou aprovação de entrega (encerramento do projeto)
        if (svc.aprovacaoEntrega) {
          setAprovacaoModal({ task, tipo: 'entrega', label: 'Aprovação de Entrega', svc });
          setAprovacaoArquivos([]);
          setAprovacaoObs('');
          return;
        }
      }
    } catch (e) { console.error(e); }
    // Sem aprovação configurada — conclui direto
    await updateDoc(doc(db, 'tasks', task.id), { status: 'concluido', concluidoAt: serverTimestamp(), updatedAt: serverTimestamp() });
  };

  const handleEnviarParaAprovacao = async () => {
    if (!aprovacaoModal) return;
    setUploadingAprov(true);
    try {
      const storage = getStorage();
      const urls = [];
      for (const file of aprovacaoArquivos) {
        const storageRef = ref(storage, `aprovacoes/${aprovacaoModal.task.budgetId}/${aprovacaoModal.task.id}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        urls.push({ nome: file.name, url });
      }
      const statusNovo = aprovacaoModal.tipo === 'pre' ? 'aguardando_pre_aprovacao' : aprovacaoModal.tipo === 'execucao' ? 'aguardando_aprovacao_execucao' : 'aguardando_aprovacao_entrega';
      await updateDoc(doc(db, 'tasks', aprovacaoModal.task.id), {
        status: statusNovo,
        aprovacaoTipo:    aprovacaoModal.tipo,
        aprovacaoArquivos: urls,
        aprovacaoObs:     aprovacaoObs,
        aprovacaoEnviadaEm: serverTimestamp(),
        updatedAt:        serverTimestamp(),
      });
      setAprovacaoModal(null);
      setAprovacaoArquivos([]);
      setAprovacaoObs('');
    } catch (e) { console.error(e); alert('Erro ao enviar para aprovação.'); }
    finally { setUploadingAprov(false); }
  };

  // Disparo automático quando todos os supplierJobs forem respondidos
  useEffect(() => {
    if (!project || !supplierJobs.length) return;
    if (project.status !== 'analyzing') return;
    const todosRespondidos = supplierJobs.every(j => j.status === 'confirmed' || j.status === 'rejected');
    const algumConfirmado  = supplierJobs.some(j => j.status === 'confirmed');
    if (todosRespondidos && algumConfirmado) {
      handleGerarOrcamento();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierJobs]);

  // Escuta naoLidas do chat flutuante (fornecedor e cliente)
  useEffect(() => {
    if (!projectId || (!isFornecedor && userData?.systemRole !== 'cliente')) return;
    const chatId = isFornecedor
      ? `${projectId}_${userData?.id}`
      : `${projectId}_cliente`;
    const unsub = onSnapshot(doc(db, 'chats', chatId), snap => {
      if (snap.exists()) setChatNaoLidas(snap.data().naoLidas || 0);
    });
    return () => unsub();
  }, [projectId, isFornecedor, userData?.id]);

  const handleGerarOrcamento = async () => {
    setGerandoOrcamento(true);
    try {
      // Busca preços dos supplierServices confirmados
      const confirmed = supplierJobs.filter(j => j.status === 'confirmed');
      let totalOrcamento = 0;
      const itensOrcamento = [];
      const calcDiasEvento = () => {
        const ini = project.briefingData?.evento?.dataInicio || project.startDate;
        const fim = project.briefingData?.evento?.dataFim    || project.endDate;
        if (ini && fim) {
          const d1 = new Date(ini + 'T12:00:00');
          const d2 = new Date(fim + 'T12:00:00');
          const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
          return diff > 0 ? diff : 1;
        }
        return project.briefingData?.evento?.diasDuracao || project.eventDiasDuracao || 1;
      };
      const diasEvento = calcDiasEvento();

      for (const sj of confirmed) {
        // Usa preco/unidade/horas diretamente do supplierJob (nova arquitetura)
        const preco   = parseFloat(sj.preco || 0);
        const unidade = (sj.unidade || 'por evento').toLowerCase();
        const _det    = (project.briefingData?.equipe?.itens || []).find(e => e.tipo === sj.serviceName) || {};
        const horasEvento = (() => {
          const ini = sj.eventHorarioInicio || project.briefingData?.evento?.horarioInicio;
          const fim = sj.eventHorarioFim   || project.briefingData?.evento?.horarioFim;
          if (ini && fim) { const [h1,m1]=ini.split(':').map(Number),[h2,m2]=fim.split(':').map(Number); const h=(h2*60+m2-h1*60-m1)/60; return h>0?h:0; }
          return 0;
        })();
        const horas    = parseFloat(sj.horasPorDia || _det.horasPorDia) || horasEvento;
        const qtd      = parseFloat(sj.quantidade  || _det.quantidade)  || 1;
        const diasServ = parseFloat(sj.diasServico || _det.dias) || diasEvento;
        const visitantes = parseFloat(sj.eventVisitantes || project.guestCount) || 0;
        const subtotal = unidade.includes('hora')   ? preco * horas * diasServ * qtd
                       : unidade.includes('dia')    ? preco * diasServ * qtd
                       : unidade.includes('pessoa') ? preco * visitantes * diasServ
                       : preco; // por evento
        if (preco > 0) {
          totalOrcamento += subtotal;
          itensOrcamento.push({
            supplierName: sj.supplierName || sj.confirmedBy || sj.supplierId,
            serviceName:  sj.serviceName,
            opcaoNome:    sj.opcaoNome || '',
            preco,
            unidade:      sj.unidade || 'por evento',
            horas, qtd, diasServ,
            diasEvento,
            subtotal,
          });
        }
      }

      // Busca config global de fee e impostos
      const configSnap = await getDoc(doc(db, 'config', 'financeiro'));
      const configFin = configSnap.exists() ? configSnap.data() : { fee: 10, impostos: 18 };
      const pctFee = parseFloat(configFin.fee || 10) / 100;
      const pctImpostos = parseFloat(configFin.impostos || 18) / 100;
      const valorFee = totalOrcamento * pctFee;
      const valorImpostos = (totalOrcamento + valorFee) * pctImpostos;
      const totalCliente = totalOrcamento + valorFee + valorImpostos;

      await updateDoc(doc(db, 'budgets', projectId), {
        status: 'pendingApproval',
        workspaceStage: 'Aguardando',
        orcamentoFinal: {
          subtotalFornecedores: totalOrcamento,
          valorFee,
          valorImpostos,
          total: totalCliente,
          pctFee: configFin.fee,
          pctImpostos: configFin.impostos,
          itens: itensOrcamento,
          geradoEm: new Date(),
        },
        timeline: [...(project.timeline || []), {
          action: 'orcamento_gerado',
          description: `Orçamento final gerado — R$ ${totalCliente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — enviado para aprovação do cliente`,
          userId: userData?.id, userName: userData?.name, timestamp: new Date(),
        }],
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); alert('Erro ao gerar orçamento.'); }
    finally { setGerandoOrcamento(false); }
  };

  const handleEditarJob = (sj) => {
    setEditandoJob(sj.id);
    setEditJobForm({
      preco:        sj.preco || '',
      diasPreparo:  sj.diasPreparo || '',
      diasMontagem: sj.diasMontagem || '',
      observacao:   sj.observacaoFornecedor || '',
    });
    setTrocandoJob(null);
  };

  const handleSalvarJob = async (sjId) => {
    setSalvandoJob(true);
    try {
      await updateDoc(doc(db, 'supplierJobs', sjId), {
        preco:                parseFloat(editJobForm.preco) || 0,
        diasPreparo:          parseInt(editJobForm.diasPreparo) || 0,
        diasMontagem:         parseInt(editJobForm.diasMontagem) || 0,
        observacaoFornecedor: editJobForm.observacao,
        updatedAt:            serverTimestamp(),
      });
      setEditandoJob(null);
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSalvandoJob(false); }
  };

  const handleTrocarFornecedor = async (sj) => {
    setTrocandoJob(sj.id);
    setEditandoJob(null);
    try {
      // Busca fornecedores que têm esse serviço
      const nome = sj.serviceName || (sj.serviceNames || [])[0] || '';
      const svSnap = await getDocs(query(
        collection(db, 'supplierServices'),
        where('serviceName', '==', nome),
        where('ativo', '!=', false)
      ));
      const alts = svSnap.docs
        .map(d => ({ ...d.data(), svId: d.id }))
        .filter(s => s.supplierId !== sj.supplierId);
      // Busca nomes dos fornecedores
      const comNomes = await Promise.all(alts.map(async s => {
        try {
          const uSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', s.supplierId)));
          const nome = uSnap.docs[0]?.data()?.name || s.supplierId;
          return { ...s, supplierName: nome };
        } catch { return { ...s, supplierName: s.supplierId }; }
      }));
      setFornecedoresAlt(comNomes);
    } catch (e) { console.error(e); setFornecedoresAlt([]); }
  };

  const handleConfirmarTroca = async (sj, novoFornecedor) => {
    setSalvandoJob(true);
    try {
      // Cancela o job atual
      await updateDoc(doc(db, 'supplierJobs', sj.id), { status: 'cancelled', updatedAt: serverTimestamp() });
      // Cria novo job para o novo fornecedor
      await addDoc(collection(db, 'supplierJobs'), {
        supplierId:        novoFornecedor.supplierId,
        budgetId:          sj.budgetId,
        eventName:         sj.eventName,
        clientName:        sj.clientName,
        eventDate:         sj.eventDate,
        serviceNames:      sj.serviceNames,
        serviceName:       sj.serviceName,
        serviceParentName: sj.serviceParentName,
        tipoServico:       sj.tipoServico,
        preco:             novoFornecedor.preco || sj.preco,
        unidade:           novoFornecedor.unidade || sj.unidade,
        diasPreparo:       novoFornecedor.diasPreparo || sj.diasPreparo,
        diasMontagem:      novoFornecedor.diasMontagem || sj.diasMontagem,
        stage:             'proposta',
        status:            'pending',
        createdAt:         serverTimestamp(),
      });
      setTrocandoJob(null);
      setFornecedoresAlt([]);
    } catch (e) { console.error(e); alert('Erro ao trocar fornecedor.'); }
    finally { setSalvandoJob(false); }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDateShort = (str) => {
    if (!str) return '—';
    if (str.includes('-')) {
      const [y, m, d] = str.split('-');
      return `${d}/${m}/${y}`;
    }
    return str;
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ color: '#7BAFD4', fontSize: 14 }}>Carregando projeto...</div>
    </div>
  );

  if (!project) return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#7BAFD4' }}>Projeto não encontrado.</p>
        <button onClick={onBack} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: 'none', border: '1px solid #7BAFD4', color: '#7BAFD4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Voltar</button>
      </div>
    </div>
  );

  const ev      = project.briefingData?.evento || {};
  const est     = project.briefingData?.estrutura || {};
  const equipe  = project.briefingData?.equipe || {};
  const servicos = project.briefingData?.servicosNecessarios || [];
  const statusInfo = STATUS_MAP[project.status] || STATUS_MAP.analyzing;


  const isCoord      = userData?.systemRole === 'workspace';
  const cronograma   = project.cronograma?.etapas || [];
  const tabs = isFornecedor ? [
    { id: 'info',       label: 'Visão Geral' },
    { id: 'cronograma', label: 'Cronograma' },
    { id: 'tasks',      label: 'Propostas' },
  ] : [
    { id: 'briefing',   label: 'Briefing' },
    { id: 'cronograma', label: `Cronograma${cronograma.length ? ` (${cronograma.length})` : ''}` },
    { id: 'tasks',      label: `Tarefas${tasks.length ? ` (${tasks.length})` : ''}` },
    { id: 'relatorio',  label: 'Relatório' },
    { id: 'timeline',   label: 'Histórico' },
  ];

  const inp = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f2f5; }
        .ps-wrap { min-height: 100vh; background: #f0f2f5; font-family: 'Outfit', sans-serif; color: #1a2e40; }
        .ps-topbar { background: #0D1B2A; padding: 0 36px; display: flex; align-items: center; justify-content: space-between; height: 60px; border-bottom: 1px solid rgba(0,180,255,0.1); position: sticky; top: 0; z-index: 10; }
        .ps-back { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #7BAFD4; font-size: 13px; background: none; border: none; font-family: 'Outfit', sans-serif; transition: color 0.15s; }
        .ps-back:hover { color: #00E5C4; }
        .ps-hero { background: #0D1B2A; padding: 28px 36px 0; border-bottom: 1px solid rgba(0,180,255,0.08); }
        .ps-hero-title { font-size: 26px; font-weight: 300; color: #E8F4FF; margin-bottom: 6px; }
        .ps-hero-meta { display: flex; gap: 20px; font-size: 13px; color: #7BAFD4; margin-bottom: 16px; flex-wrap: wrap; }
        .ps-tabs { display: flex; gap: 4px; }
        .ps-tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 300; color: rgba(123,175,212,0.6); border-bottom: 2px solid transparent; transition: all 0.15s; }
        .ps-tab:hover { color: #7BAFD4; }
        .ps-tab.active { color: #00E5C4; border-bottom-color: #00E5C4; font-weight: 400; }
        .ps-body { padding: 28px 36px; max-width: 900px; }
        .ps-card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #e8eaed; }
        .ps-card-title { font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #00E5C4; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f0f2f5; }
        .ps-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ps-info-item { display: flex; flex-direction: column; gap: 3px; }
        .ps-info-item.full { grid-column: 1 / -1; }
        .ps-info-label { font-size: 11px; color: #8a9bb0; letter-spacing: 0.5px; text-transform: uppercase; }
        .ps-info-value { font-size: 14px; color: #1a2e40; font-weight: 400; }
        .ps-bool { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; }
        .ps-bool-yes { color: #10b981; }
        .ps-bool-no { color: #94a3b8; }
        .ps-tag { display: inline-block; padding: 3px 10px; borderRadius: 20px; font-size: 11px; font-weight: 600; background: rgba(0,229,196,0.1); color: #00E5C4; margin: 3px; border-radius: 20px; }
        .ps-task-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 8px; border: 1px solid #f0f2f5; margin-bottom: 8px; transition: all 0.15s; }
        .ps-task-item:hover { border-color: #c7d2fe; }
        .ps-tl-item { display: flex; gap: 16px; padding: 14px 0; position: relative; }
        .ps-tl-item:not(:last-child)::after { content: ''; position: absolute; left: 15px; top: 42px; bottom: 0; width: 1px; background: #e8eaed; }
        .ps-tl-dot { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; background: rgba(0,229,196,0.1); border: 2px solid rgba(0,229,196,0.3); display: flex; align-items: center; justify-content: center; font-size: 10px; color: #00E5C4; z-index: 1; }
        @media (max-width: 600px) { .ps-topbar { padding: 0 16px; } .ps-hero { padding: 20px 16px 0; } .ps-body { padding: 16px; } .ps-info-grid { grid-template-columns: 1fr; } }
        @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); } 70% { box-shadow: 0 0 0 5px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
      `}</style>

      <div className="ps-wrap">

        {/* TOPBAR */}
        <div className="ps-topbar">
          <button className="ps-back" onClick={onBack}>← Voltar</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 400, color: '#E8F4FF' }}>{project.eventName || 'Projeto'}</span>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, letterSpacing: 1, background: statusInfo.bg, color: statusInfo.color }}>
              {statusInfo.label}
            </span>
          </div>
          <div style={{ width: 80 }} />
        </div>

        {/* HERO */}
        <div className="ps-hero">
          <h1 className="ps-hero-title">{project.eventName || project.eventTypeName || 'Projeto'}</h1>
          <div className="ps-hero-meta">
            {project.numeroPedido && <span style={{ color: '#00E5C4', fontWeight: 500, letterSpacing: 1 }}>{project.numeroPedido}</span>}
            <span>{project.eventTypeName || '—'}</span>
            {ev.local && <span>{ev.local}</span>}
            {project.startDate && <span>{formatDateShort(project.startDate)}{project.endDate && project.endDate !== project.startDate ? ` até ${formatDateShort(project.endDate)}` : ''}</span>}
            <span>Criado em {formatDate(project.createdAt)}</span>
          </div>
          <div className="ps-tabs">
            {tabs.map(t => (
              <button key={t.id} className={`ps-tab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* BODY */}
        <div className="ps-body">

          {/* ── VISÃO GERAL (fornecedor) ── */}
          {activeTab === 'info' && isFornecedor && (
            <>
              {/* ── BRIEFING COMPARTILHADO (mesmo layout para todos) ── */}
              {(() => {
                const bd2      = project.briefingData || {};
                const ev2      = bd2.evento || {};
                const est2     = bd2.estrutura || {};
                const equipe2  = bd2.equipe || {};
                const opcoes   = bd2.opcoesSelecionadas || [];
                const labelPag = { '50_50': '50% entrada + 50% final', '30_60_90': '30 / 60 / 90 dias', 'a_vista': 'À vista' };
                const InfoRow  = ({ label, value, full }) => value ? (
                  <div className={`ps-info-item${full ? ' full' : ''}`}>
                    <span className="ps-info-label">{label}</span>
                    <span className="ps-info-value">{value}</span>
                  </div>
                ) : null;
                return (
                  <>
                    {/* Resumo IA */}
                    {project.descricaoBriefing && (
                      <div className="ps-card">
                        <div className="ps-card-title">Sobre o Evento</div>
                        <div style={{ background: 'rgba(0,229,196,0.04)', border: '1px solid rgba(0,229,196,0.12)', borderRadius: 10, padding: '14px 18px' }}>
                          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{project.descricaoBriefing}</p>
                        </div>
                      </div>
                    )}

                    {/* Evento */}
                    <div className="ps-card">
                      <div className="ps-card-title">Evento</div>
                      <div className="ps-info-grid">
                        <InfoRow label="Empresa"          value={ev2.nomeEmpresa} />
                        <InfoRow label="Tipo"             value={ev2.tipo || project.eventTypeName} />
                        <InfoRow label="Nome"             value={ev2.nome || project.eventName} />
                        <InfoRow label="Data início"      value={formatDateShort(ev2.dataInicio || project.startDate)} />
                        <InfoRow label="Data término"     value={formatDateShort(ev2.dataFim || project.endDate)} />
                        <InfoRow label="Horário"          value={ev2.horarioInicio ? `${ev2.horarioInicio} às ${ev2.horarioFim || ''}` : null} />
                        <InfoRow label="Cidade"           value={ev2.cidade} />
                        <InfoRow label="Local"            value={ev2.local || project.location} />
                        <InfoRow label="Participantes/dia" value={ev2.visitantesPorDia ? `${ev2.visitantesPorDia} pessoas` : (project.guestCount ? `${project.guestCount} pessoas` : null)} />
                        <InfoRow label="Pagamento"        value={labelPag[bd2.formaPagamento]} />
                        {!isFornecedor && <InfoRow label="Coordenador" value={project.assignedToName} />}
                      </div>
                    </div>

                    {/* Informações Adicionais */}
                    {bd2.infoExtra && (
                      <div className="ps-card" style={{ borderLeft: '3px solid #667eea' }}>
                        <div className="ps-card-title">Informações Adicionais</div>
                        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{bd2.infoExtra}</p>
                      </div>
                    )}

                    {/* Stand */}
                    {est2.ativo && (
                      <div className="ps-card">
                        <div className="ps-card-title">Stand</div>
                        <div className="ps-info-grid">
                          <InfoRow label="Tipo"            value={est2.tipoEstande === 'modular' ? 'Modular' : est2.tipoEstande === 'personalizado' ? 'Personalizado' : null} />
                          {bd2.modeloEstande?.nome && <InfoRow label="Modelo" value={bd2.modeloEstande.nome} />}
                          <InfoRow label="Área"            value={est2.areaM2 > 0 ? `${est2.areaM2} m²` : null} />
                          <InfoRow label="Altura do teto"  value={est2.alturaTeto} />
                          <InfoRow label="Dias de montagem" value={est2.diasMontagem > 0 ? `${est2.diasMontagem} dias antes` : null} />
                          {est2.restricoes
                            ? <div className="ps-info-item full"><span className="ps-info-label">Restrições de acesso</span><span className="ps-info-value" style={{ color: '#ef4444' }}>{est2.restricoes}</span></div>
                            : est2.tipoEstande && <InfoRow label="Restrições" value="Sem restrições" />}
                          <InfoRow label="Identidade visual" value={est2.identidadeVisual === 'sim' ? '✓ Sim, enviada' : est2.identidadeVisual === 'nao' ? '✗ Não definida' : null} />
                          {est2.standDescricao && <div className="ps-info-item full"><span className="ps-info-label">Descrição do stand</span><span className="ps-info-value" style={{ whiteSpace: 'pre-wrap' }}>{est2.standDescricao}</span></div>}
                          {est2.standImagensUrls?.length > 0 && (
                            <div className="ps-info-item full">
                              <span className="ps-info-label">Imagens de referência</span>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                {est2.standImagensUrls.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt={`ref ${i+1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          {est2.identidadeImagensUrls?.length > 0 && (
                            <div className="ps-info-item full">
                              <span className="ps-info-label">Arquivos de identidade visual</span>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                {est2.identidadeImagensUrls.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0080FF', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid #e0e8ff', background: '#f0f4ff' }}>
                                    📎 Arquivo {i+1}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Produtor */}
                    {equipe2.produtor?.ativo && (
                      <div className="ps-card">
                        <div className="ps-card-title">Produtor de Eventos</div>
                        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>✓ Cliente solicitou Produtor Executivo dedicado para o evento.</p>
                      </div>
                    )}

                    {/* Serviços por categoria */}
                    {['estrutura', 'operacao', 'gastronomia', 'entretenimento'].map(tipo => {
                      const itens = opcoes.filter(o => o.tipoServico === tipo);
                      if (!itens.length) return null;
                      const labelTipo = { estrutura: 'Estrutura', operacao: 'Equipe Operacional', gastronomia: 'Gastronomia', entretenimento: 'Entretenimento' }[tipo];
                      const corTipo  = { estrutura: '#0080FF', operacao: '#00E5C4', gastronomia: '#66BB6A', entretenimento: '#FFA726' }[tipo];
                      return (
                        <div key={tipo} className="ps-card">
                          <div className="ps-card-title" style={{ color: corTipo }}>{labelTipo}</div>
                          <div className="ps-info-grid">
                            {itens.map((op, i) => {
                              const det = equipe2.itens?.find(e => e.tipo === op.serviceName);
                              return (
                                <div key={i} className="ps-info-item full" style={{ borderBottom: i < itens.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: 8, marginBottom: 4 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                      <span className="ps-info-label">{op.serviceName}</span>
                                      {op.nome && <div style={{ fontSize: 12, color: '#667eea', marginTop: 2 }}>Opção: {op.nome}</div>}
                                      {det && (det.quantidade > 0 || det.horasPorDia > 0 || det.dias > 0) && (
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                          {det.quantidade > 0 && `${det.quantidade} profissional(is)`}
                                          {det.horasPorDia > 0 && ` · ${det.horasPorDia}h/dia`}
                                          {det.dias > 0 && ` · ${det.dias} dia(s)`}
                                          {det.observacoes && ` · ${det.observacoes}`}
                                        </div>
                                      )}
                                    </div>
                                    {op.valor > 0 && !isFornecedor && (
                                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <span className="ps-info-value" style={{ color: '#00E5C4', fontWeight: 700 }}>
                                          R$ {Number(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                        {op.unidade && <div style={{ fontSize: 10, color: '#94a3b8' }}>{op.unidade}</div>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </>
          )}

          {/* ── BRIEFING (coordenador) ── */}
          {activeTab === 'briefing' && !isFornecedor && (
            <>
              {/* Cliente — só coordenador vê */}
              <div className="ps-card">
                <div className="ps-card-title">Cliente</div>
                <div className="ps-info-grid">
                  <div className="ps-info-item"><span className="ps-info-label">Nome</span><span className="ps-info-value">{client?.name || project.clientName || '—'}</span></div>
                  <div className="ps-info-item"><span className="ps-info-label">Empresa</span><span className="ps-info-value">{client?.companyName || '—'}</span></div>
                  <div className="ps-info-item"><span className="ps-info-label">Email</span><span className="ps-info-value">{client?.email || '—'}</span></div>
                  <div className="ps-info-item"><span className="ps-info-label">Telefone</span><span className="ps-info-value">{client?.phone || '—'}</span></div>
                  <div className="ps-info-item"><span className="ps-info-label">Atribuído em</span><span className="ps-info-value">{formatDate(project.assignedAt)}</span></div>
                </div>
              </div>

              {/* ── BRIEFING COMPARTILHADO (mesmo layout para todos) ── */}
              {(() => {
                const bd2      = project.briefingData || {};
                const ev2      = bd2.evento || {};
                const est2     = bd2.estrutura || {};
                const equipe2  = bd2.equipe || {};
                const opcoes   = bd2.opcoesSelecionadas || [];
                const labelPag = { '50_50': '50% entrada + 50% final', '30_60_90': '30 / 60 / 90 dias', 'a_vista': 'À vista' };
                const InfoRow  = ({ label, value, full }) => value ? (
                  <div className={`ps-info-item${full ? ' full' : ''}`}>
                    <span className="ps-info-label">{label}</span>
                    <span className="ps-info-value">{value}</span>
                  </div>
                ) : null;
                return (
                  <>
                    {/* Resumo IA */}
                    {project.descricaoBriefing && (
                      <div className="ps-card">
                        <div className="ps-card-title">Sobre o Evento</div>
                        <div style={{ background: 'rgba(0,229,196,0.04)', border: '1px solid rgba(0,229,196,0.12)', borderRadius: 10, padding: '14px 18px' }}>
                          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{project.descricaoBriefing}</p>
                        </div>
                      </div>
                    )}

                    {/* Evento */}
                    <div className="ps-card">
                      <div className="ps-card-title">Evento</div>
                      <div className="ps-info-grid">
                        <InfoRow label="Empresa"          value={ev2.nomeEmpresa} />
                        <InfoRow label="Tipo"             value={ev2.tipo || project.eventTypeName} />
                        <InfoRow label="Nome"             value={ev2.nome || project.eventName} />
                        <InfoRow label="Data início"      value={formatDateShort(ev2.dataInicio || project.startDate)} />
                        <InfoRow label="Data término"     value={formatDateShort(ev2.dataFim || project.endDate)} />
                        <InfoRow label="Horário"          value={ev2.horarioInicio ? `${ev2.horarioInicio} às ${ev2.horarioFim || ''}` : null} />
                        <InfoRow label="Cidade"           value={ev2.cidade} />
                        <InfoRow label="Local"            value={ev2.local || project.location} />
                        <InfoRow label="Participantes/dia" value={ev2.visitantesPorDia ? `${ev2.visitantesPorDia} pessoas` : (project.guestCount ? `${project.guestCount} pessoas` : null)} />
                        <InfoRow label="Pagamento"        value={labelPag[bd2.formaPagamento]} />
                        {!isFornecedor && <InfoRow label="Coordenador" value={project.assignedToName} />}
                      </div>
                    </div>

                    {/* Informações Adicionais */}
                    {bd2.infoExtra && (
                      <div className="ps-card" style={{ borderLeft: '3px solid #667eea' }}>
                        <div className="ps-card-title">Informações Adicionais</div>
                        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{bd2.infoExtra}</p>
                      </div>
                    )}

                    {/* Stand */}
                    {est2.ativo && (
                      <div className="ps-card">
                        <div className="ps-card-title">Stand</div>
                        <div className="ps-info-grid">
                          <InfoRow label="Tipo"            value={est2.tipoEstande === 'modular' ? 'Modular' : est2.tipoEstande === 'personalizado' ? 'Personalizado' : null} />
                          {bd2.modeloEstande?.nome && <InfoRow label="Modelo" value={bd2.modeloEstande.nome} />}
                          <InfoRow label="Área"            value={est2.areaM2 > 0 ? `${est2.areaM2} m²` : null} />
                          <InfoRow label="Altura do teto"  value={est2.alturaTeto} />
                          <InfoRow label="Dias de montagem" value={est2.diasMontagem > 0 ? `${est2.diasMontagem} dias antes` : null} />
                          {est2.restricoes
                            ? <div className="ps-info-item full"><span className="ps-info-label">Restrições de acesso</span><span className="ps-info-value" style={{ color: '#ef4444' }}>{est2.restricoes}</span></div>
                            : est2.tipoEstande && <InfoRow label="Restrições" value="Sem restrições" />}
                          <InfoRow label="Identidade visual" value={est2.identidadeVisual === 'sim' ? '✓ Sim, enviada' : est2.identidadeVisual === 'nao' ? '✗ Não definida' : null} />
                          {est2.standDescricao && <div className="ps-info-item full"><span className="ps-info-label">Descrição do stand</span><span className="ps-info-value" style={{ whiteSpace: 'pre-wrap' }}>{est2.standDescricao}</span></div>}
                          {est2.standImagensUrls?.length > 0 && (
                            <div className="ps-info-item full">
                              <span className="ps-info-label">Imagens de referência</span>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                {est2.standImagensUrls.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt={`ref ${i+1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          {est2.identidadeImagensUrls?.length > 0 && (
                            <div className="ps-info-item full">
                              <span className="ps-info-label">Arquivos de identidade visual</span>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                {est2.identidadeImagensUrls.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0080FF', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid #e0e8ff', background: '#f0f4ff' }}>
                                    📎 Arquivo {i+1}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Produtor */}
                    {equipe2.produtor?.ativo && (
                      <div className="ps-card">
                        <div className="ps-card-title">Produtor de Eventos</div>
                        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>✓ Cliente solicitou Produtor Executivo dedicado para o evento.</p>
                      </div>
                    )}

                    {/* Serviços por categoria */}
                    {['estrutura', 'operacao', 'gastronomia', 'entretenimento'].map(tipo => {
                      const itens = opcoes.filter(o => o.tipoServico === tipo);
                      if (!itens.length) return null;
                      const labelTipo = { estrutura: 'Estrutura', operacao: 'Equipe Operacional', gastronomia: 'Gastronomia', entretenimento: 'Entretenimento' }[tipo];
                      const corTipo  = { estrutura: '#0080FF', operacao: '#00E5C4', gastronomia: '#66BB6A', entretenimento: '#FFA726' }[tipo];
                      return (
                        <div key={tipo} className="ps-card">
                          <div className="ps-card-title" style={{ color: corTipo }}>{labelTipo}</div>
                          <div className="ps-info-grid">
                            {itens.map((op, i) => {
                              const det = equipe2.itens?.find(e => e.tipo === op.serviceName);
                              return (
                                <div key={i} className="ps-info-item full" style={{ borderBottom: i < itens.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: 8, marginBottom: 4 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                      <span className="ps-info-label">{op.serviceName}</span>
                                      {op.nome && <div style={{ fontSize: 12, color: '#667eea', marginTop: 2 }}>Opção: {op.nome}</div>}
                                      {det && (det.quantidade > 0 || det.horasPorDia > 0 || det.dias > 0) && (
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                          {det.quantidade > 0 && `${det.quantidade} profissional(is)`}
                                          {det.horasPorDia > 0 && ` · ${det.horasPorDia}h/dia`}
                                          {det.dias > 0 && ` · ${det.dias} dia(s)`}
                                          {det.observacoes && ` · ${det.observacoes}`}
                                        </div>
                                      )}
                                    </div>
                                    {op.valor > 0 && !isFornecedor && (
                                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <span className="ps-info-value" style={{ color: '#00E5C4', fontWeight: 700 }}>
                                          R$ {Number(op.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                        {op.unidade && <div style={{ fontSize: 10, color: '#94a3b8' }}>{op.unidade}</div>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}


              {/* Relatório Final */}
              {project.status === 'completed' && project.relatorioFinal && (() => {
                const rel = project.relatorioFinal;
                const itens = rel.itens || [];
                const valorTotal = itens.reduce((acc, i) => acc + (i.valor || 0), 0);
                const dataGeracao = rel.geradoEm ? new Date(rel.geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                return (
                  <div className="ps-card" style={{ border: '1px solid rgba(102,187,106,0.3)', background: 'rgba(102,187,106,0.02)' }}>
                    <div className="ps-card-title" style={{ color: '#66BB6A' }}>Relatorio Final</div>

                    {/* Resumo */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
                      <div style={{ background: 'rgba(102,187,106,0.08)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(102,187,106,0.2)' }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Status</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#66BB6A' }}>Concluido</div>
                      </div>
                      <div style={{ background: '#f8faff', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Servicos</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{rel.totalServicos || itens.length}</div>
                      </div>
                      {valorTotal > 0 && (
                        <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(0,229,196,0.15)' }}>
                          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Valor total</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                      )}
                      <div style={{ background: '#f8faff', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Encerrado em</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{dataGeracao}</div>
                      </div>
                    </div>

                    {/* Itens do relatório */}
                    {itens.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Servicos Executados</div>
                        {itens.map((item, i) => (
                          <div key={i} style={{ borderRadius: 8, border: '1px solid #e2e8f0', padding: '12px 14px', marginBottom: 8, background: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                              <div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{item.serviceName}</span>
                                {item.serviceParentName && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{item.serviceParentName}</span>}
                                <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: item.fase === 'preparacao' ? 'rgba(123,175,212,0.15)' : 'rgba(0,229,196,0.1)', color: item.fase === 'preparacao' ? '#7BAFD4' : '#00E5C4' }}>
                                  {item.fase === 'preparacao' ? 'PREP' : 'EXEC'}
                                </span>
                              </div>
                              {item.valor > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#00E5C4' }}>R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                              {item.supplierName && <span style={{ fontSize: 11, color: '#667eea' }}>{item.supplierName}</span>}
                              {item.dataInicio && <span style={{ fontSize: 11, color: '#94a3b8' }}>Inicio: {item.dataInicio.split('-').reverse().join('/')}</span>}
                              {item.dataEntrega && <span style={{ fontSize: 11, color: '#94a3b8' }}>Entrega: {item.dataEntrega.split('-').reverse().join('/')}</span>}
                            </div>
                            {item.observacaoFornecedor && (
                              <div style={{ marginTop: 6, fontSize: 11, color: '#475569', background: '#f8faff', borderRadius: 6, padding: '6px 10px' }}>
                                Obs. fornecedor: {item.observacaoFornecedor}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {/* ── CRONOGRAMA GANTT ── */}
          {activeTab === 'cronograma' && (() => {
            if (cronograma.length === 0) return (
              <div className="ps-card" style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
                Cronograma ainda não gerado
              </div>
            );

            // Cores por fase da barra
            const COR_PREPARO   = '#7BAFD4';  // azul claro
            const COR_MONTAGEM  = '#FFA726';  // laranja
            const COR_EXECUCAO  = '#00E5C4';  // teal
            const COR_ATRASADO  = '#ef4444';  // vermelho
            const COR_CONCLUIDO = '#94a3b8';  // cinza
            const TIPO_COR = { administrativo: '#7BAFD4', estrutura: '#0080FF', operacao: '#00E5C4', entretenimento: '#FFA726', gastronomia: '#66BB6A' };
            const hoje = new Date(); hoje.setHours(0,0,0,0);
            const toDate = s => { if (!s) return null; const [y,m,d] = s.split('-'); return new Date(y, m-1, d); };
            const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
            const fmtShort = s => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}`; };

            // Ordena por dataInicio
            const etapasOrdenadas = [...cronograma].sort((a,b) => {
              const da = toDate(a.dataInicio || a.di);
              const db2 = toDate(b.dataInicio || b.di);
              return (da||0) - (db2||0);
            });

            // Range de datas para o Gantt
            const datas = etapasOrdenadas.flatMap(e => [
              toDate(e.dataInicio || e.di),
              toDate(e.dataEntrega || e.de),
            ]).filter(Boolean);
            const minDate = datas.length ? new Date(Math.min(...datas)) : hoje;
            const maxDate = datas.length ? new Date(Math.max(...datas)) : hoje;
            minDate.setDate(minDate.getDate() - 3);
            maxDate.setDate(maxDate.getDate() + 5);
            const totalDias = Math.max(1, Math.round((maxDate - minDate) / 86400000));

            const posLeft = d => d ? Math.max(0, Math.round((d - minDate) / 86400000) / totalDias * 100) : 0;
            const posWidth = (di, de) => {
              if (!di || !de) return 2;
              const w = Math.max(0.5, Math.round((de - di) / 86400000) / totalDias * 100);
              return Math.min(w, 100 - posLeft(di));
            };
            const hojePos = posLeft(hoje);

            // Fornecedores por responsável
            const fornecedorNome = {};
            supplierJobs.forEach(sj => {
              if (sj.supplierName) fornecedorNome[sj.serviceName] = sj.supplierName;
            });

            // Gera marcadores de datas — diário se range < 14 dias, senão a cada 3 dias
            const marcadores = [];
            const cur = new Date(minDate);
            const intervalo = totalDias <= 14 ? 1 : totalDias <= 30 ? 3 : 7;
            while (cur <= maxDate) {
              marcadores.push(new Date(cur));
              cur.setDate(cur.getDate() + intervalo);
            }

            const ROW_H = 44;
            const LABEL_W = 180;

            return (
              <div className="ps-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="ps-card-title" style={{ margin: 0 }}>Cronograma de Produção</div>
                  {/* Legenda por fase */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                      [COR_PREPARO,   'Preparo'],
                      [COR_MONTAGEM,  'Montagem'],
                      [COR_EXECUCAO,  'Execução'],
                      [COR_ATRASADO,  'Atrasado'],
                      [COR_CONCLUIDO, 'Concluído'],
                    ].map(([cor, label]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 12, height: 8, borderRadius: 2, background: cor, opacity: label === 'Concluído' ? 0.5 : 1 }} />
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{label}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 2, height: 10, background: '#ef4444' }} />
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>Hoje</span>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', padding: '0 0 16px' }}>
                  <div style={{ minWidth: 700 }}>
                    {/* Header de datas */}
                    <div style={{ display: 'flex', marginLeft: LABEL_W, borderBottom: '1px solid #f0f2f5', position: 'relative', height: 28 }}>
                      {marcadores.map((d, i) => (
                        <div key={i} style={{ position: 'absolute', left: `${posLeft(d)}%`, fontSize: 9, color: '#94a3b8', paddingTop: 6, borderLeft: '1px solid #f0f2f5', paddingLeft: 3, whiteSpace: 'nowrap' }}>
                          {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </div>
                      ))}
                    </div>

                    {/* Linhas do Gantt */}
                    {etapasOrdenadas.map((etapa, i) => {
                      const di  = toDate(etapa.dataInicio || etapa.di);
                      const de  = toDate(etapa.dataEntrega || etapa.de);
                      const cor = TIPO_COR[etapa.tipo] || '#7BAFD4';
                      const atrasado = de && de < hoje && etapa.status !== 'concluido';
                      const concluido = etapa.status === 'concluido';
                      const left  = posLeft(di);
                      const width = posWidth(di, de);
                      const isMine = isFornecedor && supplierJobsMine.some(sj =>
                        etapa.responsavel?.toLowerCase().includes((sj.serviceName||'').toLowerCase())
                      );
                      const fornNome = fornecedorNome[etapa.responsavel] || etapa.responsavel;

                      // Busca supplierJob para pegar dias de preparo e montagem
                      const sjEtapa = supplierJobs.find(j =>
                        etapa.responsavel?.toLowerCase().includes((j.serviceName||'').toLowerCase()) ||
                        (j.serviceName||'').toLowerCase().includes((etapa.nome||'').toLowerCase())
                      );
                      const dPreparo  = sjEtapa?.diasPreparo  || 0;
                      const dMontagem = sjEtapa?.diasMontagem || 0;
                      const totalDiasEtapa = di && de ? Math.max(1, Math.round((de - di) / 86400000)) : 0;
                      const dExecucao = Math.max(0, totalDiasEtapa - dPreparo - dMontagem);

                      // Calcula largura de cada segmento
                      const wTotal = posWidth(di, de);
                      const wPreparo   = totalDiasEtapa > 0 ? (dPreparo / totalDiasEtapa) * wTotal : 0;
                      const wMontagem  = totalDiasEtapa > 0 ? (dMontagem / totalDiasEtapa) * wTotal : 0;
                      const wExecucao  = Math.max(0, wTotal - wPreparo - wMontagem);
                      const temSegmentos = (dPreparo > 0 || dMontagem > 0) && !concluido && !atrasado;

                      return (
                        <div key={etapa.id || i} style={{ display: 'flex', alignItems: 'center', height: ROW_H, borderBottom: '1px solid #f8faff', background: i % 2 === 0 ? 'white' : '#fafbff' }}>
                          {/* Label */}
                          <div style={{ width: LABEL_W, flexShrink: 0, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: isMine ? 700 : 500, color: isMine ? COR_EXECUCAO : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {isMine && '★ '}{etapa.nome}
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {fornNome !== etapa.responsavel ? fornNome : etapa.responsavel}
                            </div>
                          </div>

                          {/* Área do Gantt */}
                          <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                            {/* Linha de hoje */}
                            {hojePos >= 0 && hojePos <= 100 && (
                              <div style={{ position: 'absolute', left: `${hojePos}%`, top: 0, bottom: 0, width: 2, background: '#ef444455', zIndex: 2 }} />
                            )}
                            {/* Barra segmentada ou simples */}
                            {di && de && (
                              temSegmentos ? (
                                // Barra com 3 segmentos: Preparo | Montagem | Execução
                                <div style={{ position: 'absolute', left: `${left}%`, width: `${wTotal}%`, top: '50%', transform: 'translateY(-50%)', height: 20, borderRadius: 4, display: 'flex', overflow: 'hidden', zIndex: 1, minWidth: 6 }}
                                  title={`${etapa.nome}: ${fmtShort(etapa.dataInicio||etapa.di)} → ${fmtShort(etapa.dataEntrega||etapa.de)} | Preparo: ${dPreparo}d | Montagem: ${dMontagem}d | Execução: ${dExecucao}d`}>
                                  {wPreparo > 0 && (
                                    <div style={{ width: `${(wPreparo/wTotal)*100}%`, background: COR_PREPARO, borderRight: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 2 }}>
                                      {wPreparo/wTotal > 0.15 && <span style={{ fontSize: 8, color: 'white', fontWeight: 700 }}>{dPreparo}d</span>}
                                    </div>
                                  )}
                                  {wMontagem > 0 && (
                                    <div style={{ width: `${(wMontagem/wTotal)*100}%`, background: COR_MONTAGEM, borderRight: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 2 }}>
                                      {wMontagem/wTotal > 0.15 && <span style={{ fontSize: 8, color: 'white', fontWeight: 700 }}>{dMontagem}d</span>}
                                    </div>
                                  )}
                                  {wExecucao > 0 && (
                                    <div style={{ width: `${(wExecucao/wTotal)*100}%`, background: COR_EXECUCAO, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 2 }}>
                                      {wExecucao/wTotal > 0.15 && <span style={{ fontSize: 8, color: 'white', fontWeight: 700 }}>{dExecucao}d</span>}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                // Barra simples (sem segmentos, concluída ou atrasada)
                                <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: '50%', transform: 'translateY(-50%)', height: 20, borderRadius: 4, background: atrasado ? `${COR_ATRASADO}cc` : concluido ? `${COR_CONCLUIDO}88` : `${cor}cc`, border: `1px solid ${atrasado ? COR_ATRASADO : concluido ? COR_CONCLUIDO : cor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 1, minWidth: 4 }}
                                  title={`${etapa.nome}: ${fmtShort(etapa.dataInicio||etapa.di)} → ${fmtShort(etapa.dataEntrega||etapa.de)}`}>
                                  {width > 8 && <span style={{ fontSize: 9, color: 'white', fontWeight: 600, whiteSpace: 'nowrap', paddingLeft: 4 }}>{fmtShort(etapa.dataEntrega||etapa.de)}</span>}
                                </div>
                              )
                            )}
                            {atrasado && (
                              <div style={{ position: 'absolute', left: `${left + width + 0.5}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap' }}>⚠</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Lista detalhada abaixo do Gantt */}
                <div style={{ padding: '0 24px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 10px' }}>Detalhes</div>
                  {etapasOrdenadas.map((etapa, i) => {
                    const cor = TIPO_COR[etapa.tipo] || '#7BAFD4';
                    const di  = toDate(etapa.dataInicio || etapa.di);
                    const de  = toDate(etapa.dataEntrega || etapa.de);
                    const atrasado = de && de < hoje && etapa.status !== 'concluido';
                    const sj  = supplierJobs.find(j => etapa.responsavel?.toLowerCase().includes((j.serviceName||'').toLowerCase()));
                    return (
                      <div key={etapa.id || i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f8faff', alignItems: 'flex-start' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: atrasado ? '#ef4444' : cor, flexShrink: 0, marginTop: 5 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{etapa.nome}</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                              {atrasado && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚠ Atrasado</span>}
                              {etapa.dataInicio && <span style={{ fontSize: 11, color: '#64748b' }}>{fmtShort(etapa.dataInicio||etapa.di)} → {fmtShort(etapa.dataEntrega||etapa.de)}</span>}
                              {etapa.diasAntes > 0 && <span style={{ fontSize: 10, color: '#94a3b8' }}>{etapa.diasAntes}d antes</span>}
                            </div>
                          </div>
                          {etapa.descricao && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{etapa.descricao}</div>}
                          <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, color: cor, fontWeight: 600, textTransform: 'capitalize' }}>{etapa.tipo}</span>
                            {sj?.supplierName && <span style={{ fontSize: 10, color: '#667eea' }}>{sj.supplierName}</span>}
                            {etapa.responsavel && !sj?.supplierName && <span style={{ fontSize: 10, color: '#94a3b8' }}>{etapa.responsavel}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── BRIEFING ── */}
          {/* ── MINHA TAREFA (fornecedor) ── */}
          {activeTab === 'tasks' && isFornecedor && (() => {
            const myTasks          = projectTasks.filter(t => t.supplierId === userData?.id);
            const myPendentes      = myTasks.filter(t => t.status !== 'concluido');
            const myConcluidas     = myTasks.filter(t => t.status === 'concluido');
            const TIPO_COR         = { estrutura: '#0080FF', operacao: '#00E5C4', entretenimento: '#FFA726', gastronomia: '#66BB6A', administrativo: '#7BAFD4' };
            const hoje2            = new Date(); hoje2.setHours(0,0,0,0);
            const isExp = id => tasksExpandidas[id] !== undefined ? tasksExpandidas[id] : todasExpandidas;
            const toggle = id => setTasksExpandidas(p => ({ ...p, [id]: !isExp(id) }));

            const renderTaskForn = (task) => {
              const corFase2 = task.fase === 'preparacao' ? '#7BAFD4' : task.fase === 'execucao' ? '#00E5C4' : null;
              const cor      = corFase2 || TIPO_COR[task.tipoServico] || '#7BAFD4';
              const deDate   = task.dataEntrega ? new Date(task.dataEntrega) : null;
              const atrasada = deDate && deDate < hoje2 && task.status !== 'concluido';
              const expanded = isExp(task.id);
              return (
                <div key={task.id} style={{ borderRadius: 12, border: `1px solid ${atrasada ? 'rgba(239,68,68,0.2)' : '#e2e8f0'}`, background: atrasada ? 'rgba(239,68,68,0.02)' : 'white', overflow: 'hidden', marginBottom: 10 }}>
                  {/* Header clicável */}
                  <div onClick={() => toggle(task.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: expanded ? '1px solid #f8faff' : 'none' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>▶</span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: atrasada ? '#ef4444' : cor, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.nome || task.serviceName}</span>
                        {task.fase && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: task.fase === 'preparacao' ? 'rgba(123,175,212,0.15)' : 'rgba(0,229,196,0.15)', color: task.fase === 'preparacao' ? '#7BAFD4' : '#00E5C4' }}>{task.fase === 'preparacao' ? 'PREPARAÇÃO' : 'EXECUÇÃO'}</span>}
                      </div>
                      {task.serviceParentName && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{task.serviceParentName}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      {atrasada && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚠ Atrasada</span>}
                      {task.dataEntrega && !expanded && <span style={{ fontSize: 11, color: '#94a3b8' }}>{task.dataEntrega.split('-').reverse().join('/')}</span>}
                      {task.valor > 0 && !expanded && <span style={{ fontSize: 12, fontWeight: 700, color: '#00E5C4' }}>R$ {task.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                    </div>
                  </div>
                  {/* Detalhes */}
                  {expanded && (
                    <>
                      <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                        {task.valor > 0 && <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,229,196,0.15)' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Seu valor</div><div style={{ fontSize: 15, fontWeight: 700, color: '#00E5C4' }}>R$ {task.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>R$ {task.preco?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × {task.diasEvento}d</div></div>}
                        {task.dataInicio && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Início</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.dataInicio.split('-').reverse().join('/')}</div></div>}
                        {task.dataEntrega && <div style={{ background: atrasada ? 'rgba(239,68,68,0.06)' : '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Entrega</div><div style={{ fontSize: 13, fontWeight: 600, color: atrasada ? '#ef4444' : '#1e293b' }}>{task.dataEntrega.split('-').reverse().join('/')}</div></div>}
                        {task.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Preparo</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.diasPreparo} dias</div></div>}
                        {task.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Montagem</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.diasMontagem} dias</div></div>}
                        {task.diasEvento > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Duração</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.diasEvento} dia(s)</div></div>}
                        {(ev.local || ev.cidade || project.location) && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px', gridColumn: '1/-1' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Local do evento</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{ev.local || ev.cidade || project.location}</div></div>}
                        {(ev.horarioInicio || ev.horario) && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Horário</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{ev.horarioInicio || ev.horario}</div></div>}
                        {task.descricao && <div style={{ background: 'rgba(123,175,212,0.06)', borderRadius: 8, padding: '8px 12px', gridColumn: '1/-1', border: '1px solid rgba(123,175,212,0.15)' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Especificacao do servico</div><div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>{task.descricao}</div></div>}
                        {task.observacao && <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 12px', gridColumn: '1/-1' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Observacao</div><div style={{ fontSize: 12, color: '#475569' }}>{task.observacao}</div></div>}
                      </div>

                      {/* Observações do Cliente — mapeadas do briefingData */}
                      {(() => {
                        const bd = project.briefingData || {};
                        const nomeLC = (task.serviceName || '').toLowerCase();
                        const linhas = [];
                        if (nomeLC.includes('recepcion') || nomeLC.includes('hostess')) {
                          const r = bd.equipe?.recepcionistas;
                          if (r?.perfil) linhas.push(`Perfil: ${r.perfil}`);
                          if (r?.vestuario) linhas.push(`Vestuário: ${r.vestuario}`);
                          if (r?.horasPorDia) linhas.push(`Horas/dia: ${r.horasPorDia}h`);
                        }
                        if (nomeLC.includes('led') || nomeLC.includes('neon') || nomeLC.includes('painel')) {
                          const p = bd.entretenimento?.painelLED;
                          if (p?.tamanho) linhas.push(`Tamanho: ${p.tamanho}`);
                          if (p?.objetivo) linhas.push(`Objetivo: ${p.objetivo}`);
                          if (p?.ambiente) linhas.push(`Ambiente: ${p.ambiente}`);
                          if (p?.conteudo) linhas.push(`Conteúdo: ${p.conteudo}`);
                          if (p?.operador === true) linhas.push('Precisa de operador técnico');
                        }
                        if (nomeLC.includes('som') || nomeLC.includes('audio') || nomeLC.includes('pa')) {
                          const s = bd.entretenimento?.som;
                          if (s?.objetivo) linhas.push(`Objetivo: ${s.objetivo}`);
                          if (s?.ambiente) linhas.push(`Ambiente: ${s.ambiente}`);
                          if (s?.microfone) linhas.push(`Microfone: ${s.microfone}`);
                        }
                        if (nomeLC.includes('dj')) {
                          const d = bd.entretenimento?.dj;
                          if (d?.horas) linhas.push(`Horas: ${d.horas}h`);
                          if (d?.estilo) linhas.push(`Estilo: ${d.estilo}`);
                          if (d?.equipamento) linhas.push(`Equipamento: ${d.equipamento}`);
                        }
                        if (nomeLC.includes('seguran')) {
                          const s = bd.equipe?.seguranca;
                          if (s?.quantidade) linhas.push(`Quantidade: ${s.quantidade}`);
                          if (s?.horasPorDia) linhas.push(`Horas/dia: ${s.horasPorDia}h`);
                        }
                        if (nomeLC.includes('buffet') || nomeLC.includes('gastronomia') || nomeLC.includes('bar') || nomeLC.includes('aliment')) {
                          const g = bd.gastronomia;
                          if (g?.formato) linhas.push(`Formato: ${g.formato}`);
                          if (g?.pessoas) linhas.push(`Pessoas: ${g.pessoas}`);
                          if (g?.nivel) linhas.push(`Nível: ${g.nivel}`);
                        }
                        if (linhas.length === 0) return null;
                        return (
                          <div style={{ margin: '0 16px 12px', background: 'rgba(123,175,212,0.06)', border: '1px solid rgba(123,175,212,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10, color: '#7BAFD4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Observações do Cliente</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {linhas.map((l, i) => <div key={i} style={{ fontSize: 12, color: '#475569' }}>• {l}</div>)}
                            </div>
                          </div>
                        );
                      })()}
                      <div style={{ padding: '0 16px 14px' }}>
                        <textarea defaultValue={task.observacaoFornecedor || ''}
                          onBlur={async e => { if (e.target.value !== (task.observacaoFornecedor || '')) await updateDoc(doc(db, 'tasks', task.id), { observacaoFornecedor: e.target.value, updatedAt: serverTimestamp() }); }}
                          placeholder="Suas observações sobre esta tarefa..."
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 50, boxSizing: 'border-box', outline: 'none', color: '#475569' }} />
                      </div>
                      {/* Botão concluir / status de aprovação */}
                      {task.status === 'pendente' || task.status === 'em_andamento' || task.status === 'ajuste' ? (
                        <div style={{ padding: '0 16px 14px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          {task.status === 'ajuste' && (
                            <div style={{ flex: 1, fontSize: 11, color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                              ⚠ Ajuste solicitado — revise e envie novamente
                            </div>
                          )}
                          <button onClick={() => handleConcluirTask(task)}
                            style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                            {task.status === 'ajuste' ? 'Reenviar para aprovação' : 'Concluir'}
                          </button>
                        </div>
                      ) : (task.status === 'aguardando_pre_aprovacao' || task.status === 'aguardando_aprovacao_execucao' || task.status === 'aguardando_aprovacao_entrega') ? (
                        <div style={{ padding: '0 16px 14px' }}>
                          <div style={{ background: 'rgba(255,167,38,0.08)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,167,38,0.2)', fontSize: 12, color: '#FFA726', fontWeight: 500 }}>
                            ⏳ Aguardando aprovação do cliente...
                            {task.aprovacaoArquivos?.length > 0 && (
                              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {task.aprovacaoArquivos.map((f, i) => (
                                  <a key={i} href={f.url} target="_blank" rel="noreferrer"
                                    style={{ fontSize: 11, color: '#667eea', textDecoration: 'none', background: 'rgba(102,126,234,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                                    📎 {f.nome}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            };

            return (
              <div className="ps-card">
                <div className="ps-card-title">Minha Tarefa</div>

                {myTasks.length > 0 ? (
                  <>
                    {/* Header com controle global */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                        Tarefas ({myConcluidas.length}/{myTasks.length} concluídas)
                      </div>
                      <button onClick={() => { setTodasExpandidas(s => !s); setTasksExpandidas({}); }}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {todasExpandidas ? '⊟ Recolher todas' : '⊞ Expandir todas'}
                      </button>
                    </div>
                    {/* Pendentes */}
                    {myPendentes.map(renderTaskForn)}
                    {/* Concluídas */}
                    {myConcluidas.length > 0 && (
                      <>
                        <button onClick={() => setShowConcluidas(s => !s)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 }}>
                          <span style={{ transform: showConcluidas ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                          Concluídas ({myConcluidas.length})
                        </button>
                        {showConcluidas && myConcluidas.map(renderTaskForn)}
                      </>
                    )}
                  </>
                ) : (
                  /* Sem tasks formais — mostra jobs pendentes de confirmação */
                  supplierJobsMine.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Nenhuma tarefa encontrada</div>
                  ) : null
                )}

                {/* Jobs pendentes de confirmação (pré-aprovação) */}
                {supplierJobsMine.length > 0 && (
                  <div style={{ marginTop: myTasks.length > 0 ? 20 : 0 }}>
                    {myTasks.length > 0 && <div style={{ height: 1, background: '#f0f2f5', marginBottom: 16 }} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#7BAFD4', letterSpacing: 0.5 }}>
                        Propostas ({supplierJobsMine.length})
                      </div>
                      <button onClick={() => { setPropostasExpandidas(s => !s); }}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {propostasExpandidas ? '⊟ Recolher todas' : '⊞ Expandir todas'}
                      </button>
                    </div>
                    {supplierJobsMine.map(sj => {
                      const nome        = sj.serviceName || (sj.serviceNames || [])[0];
                      const isPending   = sj.status === 'pending' || !sj.status;
                      const isConfirmed = sj.status === 'confirmed';
                      const isRejected  = sj.status === 'rejected';
                      const calcDias2 = () => {
                        const ini = project.briefingData?.evento?.dataInicio || project.startDate;
                        const fim = project.briefingData?.evento?.dataFim    || project.endDate;
                        if (ini && fim) { const d1 = new Date(ini+'T12:00:00'), d2 = new Date(fim+'T12:00:00'); const diff = Math.round((d2-d1)/(1000*60*60*24))+1; return diff > 0 ? diff : 1; }
                        return project.briefingData?.evento?.diasDuracao || 1;
                      };
                      const diasEvento  = calcDias2();
                      const _p1 = parseFloat(sj.preco || 0);
                      const _u1 = (sj.unidade || '').toLowerCase();
                      // Busca dados operacionais: primeiro do sj, depois do briefing
                      const _detBriefing = (project.briefingData?.equipe?.itens || []).find(e => e.tipo === sj.serviceName) || {};
                      const _horasEv1 = (() => {
                        const ini = sj.eventHorarioInicio || project.briefingData?.evento?.horarioInicio;
                        const fim = sj.eventHorarioFim   || project.briefingData?.evento?.horarioFim;
                        if (ini && fim) { const [h1,m1]=ini.split(':').map(Number),[h2,m2]=fim.split(':').map(Number); const h=(h2*60+m2-h1*60-m1)/60; return h>0?h:0; }
                        return 0;
                      })();
                      const _h1 = parseFloat(sj.horasPorDia || _detBriefing.horasPorDia) || _horasEv1;
                      const _q1 = parseFloat(sj.quantidade  || _detBriefing.quantidade)  || 1;
                      const _d1 = parseFloat(sj.diasServico || _detBriefing.dias) || diasEvento;
                      const valorTotal = _p1 ? (
                        _u1.includes('hora')   ? _p1 * _h1 * _d1 * _q1 :
                        _u1.includes('dia')    ? _p1 * _d1 * _q1 :
                        _u1.includes('pessoa') ? _p1 * (sj.eventVisitantes || diasEvento) * _d1 :
                        _p1
                      ) : null;
                      const sjExp       = tasksExpandidas[sj.id] !== undefined ? tasksExpandidas[sj.id] : propostasExpandidas;
                      return (
                        <div key={sj.id} style={{ borderRadius: 12, border: `1px solid ${isConfirmed ? 'rgba(16,185,129,0.3)' : isRejected ? 'rgba(239,68,68,0.3)' : 'rgba(123,175,212,0.35)'}`, background: isConfirmed ? 'rgba(16,185,129,0.04)' : isRejected ? 'rgba(239,68,68,0.04)' : 'rgba(123,175,212,0.06)', overflow: 'hidden', marginBottom: 10 }}>
                          {/* Header clicável */}
                          <div onClick={() => setTasksExpandidas(p => ({ ...p, [sj.id]: !sjExp }))}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: sjExp ? '1px solid #f8faff' : 'none' }}>
                            <span style={{ fontSize: 11, color: '#94a3b8', transform: sjExp ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>▶</span>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: (!sj.supplierName || sj.supplierName === 'Fornecedor') ? '#ef4444' : isConfirmed ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b', flexShrink: 0, animation: (!sj.supplierName || sj.supplierName === 'Fornecedor') ? 'pulse-red 1.5s infinite' : 'none' }} />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nome}</span>
                              {sj.serviceParentName && !sjExp && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{sj.serviceParentName}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                              {valorTotal && !sjExp && <span style={{ fontSize: 12, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                              {isConfirmed && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>✓ Confirmado</span>}
                              {isRejected && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>✗ Recusado</span>}
                            </div>
                          </div>
                          {/* Detalhes expansíveis */}
                          {sjExp && (
                            <>
                              <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                                {sj.opcaoNome && <div style={{ background: 'rgba(102,126,234,0.06)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(102,126,234,0.15)', gridColumn: '1/-1' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Opção solicitada</div><div style={{ fontSize: 14, fontWeight: 600, color: '#667eea' }}>{sj.opcaoNome}</div></div>}
                                {(sj.quantidade || sj.horasPorDia || sj.diasServico || sj.observacoes) && <div style={{ background: 'rgba(0,229,196,0.04)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,229,196,0.1)', gridColumn: '1/-1' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 5 }}>Solicitação do cliente</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{sj.quantidade && <span style={{ fontSize: 12, color: '#1e293b' }}><strong>{sj.quantidade}</strong> profissional(is)</span>}{sj.horasPorDia && <span style={{ fontSize: 12, color: '#1e293b' }}><strong>{sj.horasPorDia}h</strong>/dia</span>}{sj.diasServico && <span style={{ fontSize: 12, color: '#1e293b' }}><strong>{sj.diasServico}</strong> dia(s)</span>}{sj.observacoes && <span style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>&#x201c;{sj.observacoes}&#x201d;</span>}</div></div>}
                                {valorTotal && <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,229,196,0.15)' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Seu valor</div><div style={{ fontSize: 15, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{sj.unidade || ''}</div></div>}
                                {sj.eventDate && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Data do evento</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.eventDate.split('-').reverse().join('/')}{sj.eventDateFim && sj.eventDateFim !== sj.eventDate ? ` a ${sj.eventDateFim.split('-').reverse().join('/')}` : ''}</div></div>}
                                {(sj.eventHorarioInicio || ev.horarioInicio) && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Horário</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.eventHorarioInicio || ev.horarioInicio}{(sj.eventHorarioFim || ev.horarioFim) ? ` às ${sj.eventHorarioFim || ev.horarioFim}` : ''}</div></div>}
                                {(sj.eventLocal || sj.eventCidade || ev.local || ev.cidade) && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px', gridColumn: '1/-1' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Local</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.eventLocal || ev.local || ''}{(sj.eventCidade || ev.cidade) ? ` — ${sj.eventCidade || ev.cidade}` : ''}</div></div>}
                                {(sj.eventVisitantes || ev.visitantesPorDia) > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Participantes</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.eventVisitantes || ev.visitantesPorDia} pessoas</div></div>}
                                {sj.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Preparo</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasPreparo} dias</div></div>}
                                {sj.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Montagem</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasMontagem} dias</div></div>}
                                <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Duração</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{diasEvento} dia(s)</div></div>
                                {(project.financeiro?.formaPagamento || project.briefingData?.formaPagamento) && (
                                  <div style={{ background: 'rgba(255,167,38,0.06)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(255,167,38,0.2)', gridColumn: '1/-1' }}>
                                    <div style={{ fontSize: 10, color: '#FFA726', textTransform: 'uppercase', marginBottom: 3, fontWeight: 700 }}>Forma de Pagamento</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                      {(project.financeiro?.formaPagamento || project.briefingData?.formaPagamento) === '50_50' && '50% na entrada + 50% no final do evento'}
                                      {(project.financeiro?.formaPagamento || project.briefingData?.formaPagamento) === '30_60_90' && '30, 60 e 90 dias'}
                                      {(project.financeiro?.formaPagamento || project.briefingData?.formaPagamento) === 'a_vista' && 'À vista'}
                                    </div>
                                  </div>
                                )}
                                {sj.observacao && <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 12px', gridColumn: '1/-1' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Observacao</div><div style={{ fontSize: 12, color: '#475569' }}>{sj.observacao}</div></div>}
                              </div>

                              {/* Observações do Cliente — mapeadas do briefingData */}
                              {(() => {
                                const bd = project.briefingData || {};
                                const nomeLC = (sj.serviceName || '').toLowerCase();
                                const linhas = [];

                                // Recepcionista / Hostess
                                if (nomeLC.includes('recepcion') || nomeLC.includes('hostess')) {
                                  const r = bd.equipe?.recepcionistas;
                                  if (r?.perfil) linhas.push(`Perfil: ${r.perfil}`);
                                  if (r?.vestuario) linhas.push(`Vestuário: ${r.vestuario}`);
                                  if (r?.horasPorDia) linhas.push(`Horas/dia: ${r.horasPorDia}h`);
                                }
                                // LED / Painel
                                if (nomeLC.includes('led') || nomeLC.includes('neon') || nomeLC.includes('painel')) {
                                  const p = bd.entretenimento?.painelLED;
                                  if (p?.tamanho) linhas.push(`Tamanho: ${p.tamanho}`);
                                  if (p?.objetivo) linhas.push(`Objetivo: ${p.objetivo}`);
                                  if (p?.ambiente) linhas.push(`Ambiente: ${p.ambiente}`);
                                  if (p?.conteudo) linhas.push(`Conteúdo: ${p.conteudo}`);
                                  if (p?.operador === true) linhas.push('Precisa de operador técnico');
                                }
                                // Som / DJ
                                if (nomeLC.includes('som') || nomeLC.includes('audio') || nomeLC.includes('pa')) {
                                  const s = bd.entretenimento?.som;
                                  if (s?.objetivo) linhas.push(`Objetivo: ${s.objetivo}`);
                                  if (s?.ambiente) linhas.push(`Ambiente: ${s.ambiente}`);
                                  if (s?.microfone) linhas.push(`Microfone: ${s.microfone}`);
                                }
                                if (nomeLC.includes('dj')) {
                                  const d = bd.entretenimento?.dj;
                                  if (d?.horas) linhas.push(`Horas: ${d.horas}h`);
                                  if (d?.estilo) linhas.push(`Estilo: ${d.estilo}`);
                                  if (d?.equipamento) linhas.push(`Equipamento: ${d.equipamento}`);
                                }
                                // Segurança
                                if (nomeLC.includes('seguran')) {
                                  const s = bd.equipe?.seguranca;
                                  if (s?.quantidade) linhas.push(`Quantidade: ${s.quantidade}`);
                                  if (s?.horasPorDia) linhas.push(`Horas/dia: ${s.horasPorDia}h`);
                                }
                                // Gastronomia
                                if (nomeLC.includes('buffet') || nomeLC.includes('gastronomia') || nomeLC.includes('bar') || nomeLC.includes('aliment')) {
                                  const g = bd.gastronomia;
                                  if (g?.formato) linhas.push(`Formato: ${g.formato}`);
                                  if (g?.pessoas) linhas.push(`Pessoas: ${g.pessoas}`);
                                  if (g?.nivel) linhas.push(`Nível: ${g.nivel}`);
                                }

                                if (linhas.length === 0) return null;
                                return (
                                  <div style={{ margin: '0 16px 12px', background: 'rgba(123,175,212,0.06)', border: '1px solid rgba(123,175,212,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                                    <div style={{ fontSize: 10, color: '#7BAFD4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Observações do Cliente</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {linhas.map((l, i) => (
                                        <div key={i} style={{ fontSize: 12, color: '#475569' }}>• {l}</div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}

                              <div style={{ padding: '0 16px 14px' }}>
                                <textarea defaultValue={sj.observacaoFornecedor || ''}
                                  onBlur={async e => { if (e.target.value !== (sj.observacaoFornecedor || '')) await updateDoc(doc(db, 'supplierJobs', sj.id), { observacaoFornecedor: e.target.value, updatedAt: serverTimestamp() }); }}
                                  placeholder="Observações (especificações técnicas...)"
                                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 50, boxSizing: 'border-box', outline: 'none', color: '#475569' }} />
                              </div>
                              {isPending && (
                                <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', justifyContent: 'flex-end' }}>
                                  <button onClick={() => handleRecusarItem(sj.id, nome)} disabled={confirming} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Recusar</button>
                                  <button onClick={() => handleConfirmarItem(sj.id, nome)} disabled={confirming} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Confirmar</button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                    {supplierJobsMine.every(sj => sj.status === 'confirmed' || sj.status === 'rejected') && (
                      <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)', padding: 16, textAlign: 'center', marginTop: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#10b981' }}>✓ Todas as tarefas respondidas!</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── TAREFAS ── */}          {/* ── TAREFAS ── */}
          {activeTab === 'tasks' && !isFornecedor && (() => {
            const todosConfirmados = supplierJobs.length > 0 && supplierJobs.every(j => j.status === 'confirmed');
            const temDraft = supplierJobs.some(j => j.status === 'draft');
            const enviadoEm = project.cotacaoEnviadaEm;
            return (
            <div className="ps-card">
              {/* Botão Enviar Cotação — topo das tarefas */}
              {isCoord && (
                <div style={{ marginBottom: 20 }}>
                  {!temDraft && enviadoEm ? (
                    <div style={{ background: 'rgba(102,187,106,0.06)', border: '1px solid rgba(102,187,106,0.2)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 16, color: '#66BB6A' }}>✓</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#66BB6A' }}>Cotacao Enviada</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{enviadoEm?.toDate ? enviadoEm.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                      </div>
                    </div>
                  ) : temDraft ? (
                    confirmEnvio ? (
                      <div style={{ background: 'rgba(255,167,38,0.06)', border: '1px solid rgba(255,167,38,0.25)', borderRadius: 12, padding: '16px 20px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#FFA726', marginBottom: 6 }}>Confirmar envio da cotacao?</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Os fornecedores serao notificados e poderao confirmar ou recusar cada servico.</div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={handleEnviarCotacao} disabled={enviandoCotacao} style={{ padding: '8px 20px', background: '#00E5C4', border: 'none', borderRadius: 8, color: '#0D1B2A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                            {enviandoCotacao ? 'Enviando...' : 'Confirmar'}
                          </button>
                          <button onClick={() => setConfirmEnvio(false)} style={{ padding: '8px 20px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmEnvio(true)} style={{ width: '100%', padding: '14px 20px', background: 'linear-gradient(135deg, #00E5C4, #0080FF)', border: 'none', borderRadius: 12, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', letterSpacing: 0.3 }}>
                        Enviar Cotacao para Fornecedores
                      </button>
                    )
                  ) : null}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="ps-card-title" style={{ margin: 0 }}>Fornecedores e Tarefas</div>
                <button onClick={() => setShowTaskForm(s => !s)}
                  style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00E5C4,#0080FF)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  + Nova Tarefa
                </button>
              </div>

              {/* Tasks formais da collection (pós-aprovação) */}
              {projectTasks.length > 0 && (() => {
                const TIPO_COR = { estrutura: '#0080FF', operacao: '#00E5C4', entretenimento: '#FFA726', gastronomia: '#66BB6A', administrativo: '#7BAFD4' };
                const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
                const tasksPendentes  = projectTasks.filter(t => t.status !== 'concluido');
                const tasksConcluidas = projectTasks.filter(t => t.status === 'concluido');

                const isExpanded = (id) => tasksExpandidas[id] !== undefined ? tasksExpandidas[id] : todasExpandidas;
                const toggleTask = (id) => setTasksExpandidas(prev => ({ ...prev, [id]: !isExpanded(id) }));

                const renderTaskCoord = (task, isConcluida = false) => {
                  const corFase = task.fase === 'preparacao' ? '#7BAFD4' : task.fase === 'execucao' ? '#00E5C4' : null;
                  const cor = corFase || TIPO_COR[task.tipoServico] || '#7BAFD4';
                  const deDate = task.dataEntrega ? new Date(task.dataEntrega) : null;
                  const atrasada = deDate && deDate < hoje2 && task.status !== 'concluido';
                  const calcDias3 = () => {
                    const ini = project.briefingData?.evento?.dataInicio || project.startDate;
                    const fim = project.briefingData?.evento?.dataFim    || project.endDate;
                    if (ini && fim) { const d1 = new Date(ini+'T12:00:00'), d2 = new Date(fim+'T12:00:00'); const diff = Math.round((d2-d1)/(1000*60*60*24))+1; return diff > 0 ? diff : 1; }
                    return project.briefingData?.evento?.diasDuracao || 1;
                  };
                  const diasEvento = calcDias3();
                  const _pt = parseFloat(task.preco || 0);
                  const _ut = (task.unidade || '').toLowerCase();
                  const _ht = parseFloat(task.horasPorDia) || 0;
                  const _qt = parseFloat(task.quantidade)  || 1;
                  const _dt = parseFloat(task.diasServico) || diasEvento;
                  const valorTotal = task.valor || (_pt ? (
                    _ut.includes('hora')   ? _pt * _ht * _dt * _qt :
                    _ut.includes('dia')    ? _pt * _dt * _qt :
                    _ut.includes('pessoa') ? _pt * (task.eventVisitantes || diasEvento) :
                    _pt
                  ) : 0);
                  const expanded = isExpanded(task.id);
                  return (
                    <div key={task.id} style={{ borderRadius: 10, border: `1px solid ${atrasada ? 'rgba(239,68,68,0.2)' : '#e2e8f0'}`, marginBottom: 8, overflow: 'hidden', background: atrasada ? 'rgba(239,68,68,0.02)' : 'white' }}>
                      {/* Header clicável */}
                      <div onClick={() => toggleTask(task.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: expanded ? '1px solid #f8faff' : 'none' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block', flexShrink: 0 }}>▶</span>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: atrasada ? '#ef4444' : cor, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.nome || task.serviceName}</span>
                          {task.supplierName && <span style={{ fontSize: 11, color: '#667eea', marginLeft: 8 }}>{task.supplierName}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          {atrasada && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚠ Atrasada</span>}
                          {task.dataEntrega && !expanded && <span style={{ fontSize: 11, color: '#94a3b8' }}>{task.dataEntrega.split('-').reverse().join('/')}</span>}
                          <select value={task.status || 'pendente'} onChange={async e => {
                            await updateDoc(doc(db, 'tasks', task.id), { status: e.target.value, updatedAt: serverTimestamp() });
                          }} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', background: 'white' }}>
                            <option value="pendente">Pendente</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="concluido">Concluído</option>
                          </select>
                        </div>
                      </div>
                      {/* Detalhes expansíveis */}
                      {expanded && (
                        <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                          {valorTotal > 0 && (
                            <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '7px 10px', border: '1px solid rgba(0,229,196,0.15)' }}>
                              <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Valor</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            </div>
                          )}
                          {task.dataInicio && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Início</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{task.dataInicio.split('-').reverse().join('/')}</div></div>}
                          {task.dataEntrega && <div style={{ background: atrasada ? 'rgba(239,68,68,0.06)' : '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Entrega</div><div style={{ fontSize: 12, fontWeight: 600, color: atrasada ? '#ef4444' : '#1e293b' }}>{task.dataEntrega.split('-').reverse().join('/')}</div></div>}
                          {task.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Preparo</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{task.diasPreparo}d</div></div>}
                          {task.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Montagem</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{task.diasMontagem}d</div></div>}
                          {task.observacao && <div style={{ background: '#fffbeb', borderRadius: 8, padding: '7px 10px', gridColumn: '1/-1' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Obs.</div><div style={{ fontSize: 11, color: '#475569' }}>{task.observacao}</div></div>}
                          {task.observacaoFornecedor && <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '7px 10px', gridColumn: '1/-1' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Obs. fornecedor</div><div style={{ fontSize: 11, color: '#475569' }}>{task.observacaoFornecedor}</div></div>}
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                        Tarefas do Projeto ({tasksConcluidas.length}/{projectTasks.length} concluídas)
                      </div>
                      <button onClick={() => { setTodasExpandidas(s => !s); setTasksExpandidas({}); }}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#64748b', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {todasExpandidas ? '⊟ Recolher todas' : '⊞ Expandir todas'}
                      </button>
                    </div>
                    {tasksPendentes.map(t => renderTaskCoord(t, false))}
                    {tasksConcluidas.length > 0 && (
                      <>
                        <button onClick={() => setShowConcluidas(s => !s)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>
                          <span style={{ transform: showConcluidas ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                          Concluídas ({tasksConcluidas.length})
                        </button>
                        {showConcluidas && tasksConcluidas.map(task => (
                          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid #f0f2f5', marginBottom: 6, opacity: 0.6 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{task.nome || task.serviceName}</span>
                              {task.supplierName && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{task.supplierName}</span>}
                            </div>
                            <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>✓ Concluída</span>
                          </div>
                        ))}
                      </>
                    )}
                    <div style={{ height: 1, background: '#f0f2f5', margin: '16px 0' }} />
                  </div>
                );
              })()}

              {/* Fornecedores */}
              {supplierJobs.length > 0 && (() => {
                const sjAtivos      = supplierJobs.filter(sj => sj.status !== 'cancelled');
                const sjConfirmados = sjAtivos.filter(sj => sj.status === 'confirmed' || sj.status === 'rejected');
                const sjPendentes   = sjAtivos.filter(sj => sj.status !== 'confirmed' && sj.status !== 'rejected');
                return (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                    Fornecedores ({supplierJobs.filter(j => j.status === 'confirmed').length}/{sjAtivos.length} confirmados)
                  </div>
                  {sjPendentes.map(sj => {
                    const nome        = sj.serviceName || (sj.serviceNames || [])[0];
                    const isConfirmed = sj.status === 'confirmed';
                    const isRejected  = sj.status === 'rejected';
                    const calcDiasEv = () => {
                      const ini = project.briefingData?.evento?.dataInicio || project.startDate;
                      const fim = project.briefingData?.evento?.dataFim    || project.endDate;
                      if (ini && fim) { const d = Math.round((new Date(fim+'T12:00:00')-new Date(ini+'T12:00:00'))/(864e5))+1; return d > 0 ? d : 1; }
                      return project.briefingData?.evento?.diasDuracao || 1;
                    };
                    const diasEvento  = calcDiasEv();
                    const _pv = parseFloat(sj.preco || 0);
                    const _uv = (sj.unidade || '').toLowerCase();
                    const _detV = (project.briefingData?.equipe?.itens || []).find(e => e.tipo === sj.serviceName) || {};
                    // Horas: usa do sj/briefing, ou calcula pelo horário do evento
                    const _horasEvento = (() => {
                      const ini = sj.eventHorarioInicio || project.briefingData?.evento?.horarioInicio;
                      const fim = sj.eventHorarioFim   || project.briefingData?.evento?.horarioFim;
                      if (ini && fim) {
                        const [h1, m1] = ini.split(':').map(Number);
                        const [h2, m2] = fim.split(':').map(Number);
                        const horas = (h2 * 60 + m2 - h1 * 60 - m1) / 60;
                        return horas > 0 ? horas : 0;
                      }
                      return 0;
                    })();
                    const _hv = parseFloat(sj.horasPorDia || _detV.horasPorDia) || _horasEvento;
                    const _qv = parseFloat(sj.quantidade  || _detV.quantidade)  || 1;
                    const _dv = parseFloat(sj.diasServico || _detV.dias) || diasEvento;
                    const valorTotal = _pv ? (
                      _uv.includes('hora')   ? _pv * _hv * _dv * _qv :
                      _uv.includes('dia')    ? _pv * _dv * _qv :
                      _uv.includes('pessoa') ? _pv * (sj.eventVisitantes || diasEvento) * _dv :
                      _pv
                    ) : null;
                    const isEditing   = editandoJob === sj.id;
                    const isTrocando  = trocandoJob === sj.id;
                    return (
                      <div key={sj.id} style={{ borderRadius: 10, border: `1px solid ${isConfirmed ? 'rgba(16,185,129,0.2)' : isRejected ? 'rgba(239,68,68,0.2)' : '#e2e8f0'}`, marginBottom: 10, overflow: 'hidden', background: isConfirmed ? 'rgba(16,185,129,0.02)' : isRejected ? 'rgba(239,68,68,0.02)' : 'white' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f8faff' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConfirmed ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nome}</div>
                            <div style={{ fontSize: 11, color: '#667eea', marginTop: 1, fontWeight: 500 }}>
                              {sj.supplierName || sj.confirmedBy || 'Aguardando resposta'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: isConfirmed ? 'rgba(16,185,129,0.1)' : isRejected ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: isConfirmed ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b' }}>
                              {isConfirmed ? '✓ Confirmado' : isRejected ? '✗ Recusado' : 'Aguardando'}
                            </span>
                            {!isEditing && !isTrocando && (
                              <>
                                <button onClick={() => handleEditarJob(sj)}
                                  style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                                <button onClick={() => handleTrocarFornecedor(sj)}
                                  style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(102,126,234,0.3)', background: 'none', color: '#667eea', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Trocar</button>
                                {isCoord && sj.supplierId && (
                                  <button onClick={async () => {
                                    const chatId = `${projectId}_${sj.supplierId}`;
                                    await setDoc(doc(db, 'chats', chatId), {
                                      budgetId:   projectId,
                                      supplierId: sj.supplierId,
                                      tipo:       'fornecedor',
                                      titulo:     project.eventName || 'Projeto',
                                      subtitulo:  `${project.numeroPedido || ''} • ${sj.supplierName || sj.serviceName}`,
                                      empresa:    sj.companyName || sj.supplierName || '',
                                      createdAt:  serverTimestamp(),
                                      naoLidas:   0,
                                    }, { merge: true });
                                    setCoordChatId(chatId);
                                    setCoordChatInfo({ titulo: project.eventName, subtitulo: `${project.numeroPedido || ''} • ${sj.supplierName || sj.serviceName}` });
                                  }} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,167,38,0.3)', background: 'none', color: '#FFA726', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>💬 Chat</button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Infos */}
                        {!isEditing && !isTrocando && (
                          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* Opção escolhida pelo cliente */}
                            {sj.opcaoNome && (
                              <div style={{ background: 'rgba(102,126,234,0.06)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(102,126,234,0.15)' }}>
                                <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Opção escolhida pelo cliente</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#667eea' }}>{sj.opcaoNome}</div>
                              </div>
                            )}
                            {/* Detalhes de equipe escolhidos pelo cliente */}
                            {(sj.quantidade || sj.horasPorDia || sj.diasServico || sj.observacoes) && (
                              <div style={{ background: 'rgba(0,229,196,0.04)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,229,196,0.1)' }}>
                                <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Solicitação do cliente</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                  {sj.quantidade && <span style={{ fontSize: 12, color: '#1e293b' }}><strong>{sj.quantidade}</strong> profissional(is)</span>}
                                  {sj.horasPorDia && <span style={{ fontSize: 12, color: '#1e293b' }}><strong>{sj.horasPorDia}h</strong>/dia</span>}
                                  {sj.diasServico && <span style={{ fontSize: 12, color: '#1e293b' }}><strong>{sj.diasServico}</strong> dia(s)</span>}
                                  {sj.observacoes && <span style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>"{sj.observacoes}"</span>}
                                </div>
                              </div>
                            )}
                            {/* Grid de infos numéricas */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                              {valorTotal && (
                                <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '7px 10px', border: '1px solid rgba(0,229,196,0.15)' }}>
                                  <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Valor total</div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                  <div style={{ fontSize: 9, color: '#94a3b8' }}>R$ {parseFloat(sj.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {sj.unidade ? `/ ${sj.unidade}` : ''}</div>
                                </div>
                              )}
                              {sj.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Preparo</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasPreparo} dias</div></div>}
                              {sj.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Montagem</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasMontagem} dias</div></div>}
                              <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Evento</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{(() => { const i = sj.eventDate, f = sj.eventDateFim; if (i && f) { const d = Math.round((new Date(f+'T12:00:00') - new Date(i+'T12:00:00'))/(864e5))+1; return d > 0 ? d : 1; } return diasEvento; })()} dias</div></div>
                              {sj.eventVisitantes > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Visitantes/dia</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.eventVisitantes}</div></div>}
                              {sj.eventCidade && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Cidade</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.eventCidade}</div></div>}
                              {sj.eventLocal && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Local</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{sj.eventLocal}</div></div>}
                              {sj.eventDate && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Data do evento</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{sj.eventDate?.split('-').reverse().join('/')}{sj.eventDateFim && sj.eventDateFim !== sj.eventDate ? ` → ${sj.eventDateFim.split('-').reverse().join('/')}` : ''}</div></div>}
                              {(sj.eventHorarioInicio || sj.eventHorarioFim) && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Horário</div><div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{sj.eventHorarioInicio} às {sj.eventHorarioFim}</div></div>}
                            </div>
                            {/* Observações */}
                            {sj.observacao && <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Observações</div><div style={{ fontSize: 12, color: '#475569' }}>{sj.observacao}</div></div>}
                            {sj.observacaoFornecedor && <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '8px 12px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Obs. do fornecedor</div><div style={{ fontSize: 12, color: '#475569' }}>{sj.observacaoFornecedor}</div></div>}
                            {/* Imagens do stand */}
                            {sj.standImagensUrls?.length > 0 && (
                              <div>
                                <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Imagens de referência do stand</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {sj.standImagensUrls.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noreferrer">
                                      <img src={url} alt={`ref ${i+1}`} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Form de edição */}
                        {isEditing && (
                          <div style={{ padding: '12px 16px', background: '#f8faff', borderTop: '1px solid #e0e8ff' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                              {[['Preço (R$)', 'preco', 'number'], ['Dias de preparo', 'diasPreparo', 'number'], ['Dias de montagem', 'diasMontagem', 'number']].map(([label, field, type]) => (
                                <div key={field}>
                                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>{label}</div>
                                  <input type={type} value={editJobForm[field]} onChange={e => setEditJobForm(p => ({ ...p, [field]: e.target.value }))}
                                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                              ))}
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>Observação</div>
                              <textarea value={editJobForm.observacao} onChange={e => setEditJobForm(p => ({ ...p, observacao: e.target.value }))}
                                style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 50, boxSizing: 'border-box', outline: 'none' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button onClick={() => setEditandoJob(null)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                              <button onClick={() => handleSalvarJob(sj.id)} disabled={salvandoJob}
                                style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                {salvandoJob ? 'Salvando...' : 'Salvar'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Troca de fornecedor */}
                        {isTrocando && (
                          <div style={{ padding: '12px 16px', background: '#f8faff', borderTop: '1px solid #e0e8ff' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#667eea', marginBottom: 10 }}>Selecione o novo fornecedor para "{nome}":</div>
                            {fornecedoresAlt.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>Nenhum outro fornecedor com este serviço cadastrado.</div>
                            ) : fornecedoresAlt.map(f => (
                              <div key={f.svId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 6, background: 'white' }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{f.supplierName}</div>
                                  <div style={{ fontSize: 11, color: '#94a3b8' }}>R$ {parseFloat(f.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {f.diasPreparo || 0}d preparo</div>
                                </div>
                                <button onClick={() => handleConfirmarTroca(sj, f)} disabled={salvandoJob}
                                  style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                  Selecionar
                                </button>
                              </div>
                            ))}
                            <button onClick={() => { setTrocandoJob(null); setFornecedoresAlt([]); }}
                              style={{ marginTop: 6, padding: '5px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Fornecedores confirmados/recusados em acordeão */}
                  {sjConfirmados.length > 0 && (
                    <>
                      <button onClick={() => setShowFornConcluidos(s => !s)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                        <span style={{ transform: showFornConcluidos ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                        Respondidos ({sjConfirmados.length})
                      </button>
                      {showFornConcluidos && sjConfirmados.map(sj => {
                        const nome2 = sj.serviceName || (sj.serviceNames || [])[0];
                        const isConfirmed2 = sj.status === 'confirmed';
                        const isRejected2  = sj.status === 'rejected';
                        const diasEvento2  = project.briefingData?.evento?.diasDuracao || 1;
                        const _p4 = parseFloat(sj.preco || 0);
                        const _u4 = (sj.unidade || '').toLowerCase();
                        const _det4 = (project.briefingData?.equipe?.itens || []).find(e => e.tipo === sj.serviceName) || {};
                        const _horasEv4 = (() => {
                          const ini = sj.eventHorarioInicio || project.briefingData?.evento?.horarioInicio;
                          const fim = sj.eventHorarioFim   || project.briefingData?.evento?.horarioFim;
                          if (ini && fim) { const [h1,m1]=ini.split(':').map(Number),[h2,m2]=fim.split(':').map(Number); const h=(h2*60+m2-h1*60-m1)/60; return h>0?h:0; }
                          return 0;
                        })();
                        const _h4 = parseFloat(sj.horasPorDia || _det4.horasPorDia) || _horasEv4;
                        const _q4 = parseFloat(sj.quantidade  || _det4.quantidade)  || 1;
                        const _d4 = parseFloat(sj.diasServico || _det4.dias) || diasEvento2;
                        const valorTotal2 = _p4 ? (
                          _u4.includes('hora')   ? _p4 * _h4 * _d4 * _q4 :
                          _u4.includes('dia')    ? _p4 * _d4 * _q4 :
                          _u4.includes('pessoa') ? _p4 * (sj.eventVisitantes || diasEvento2) * _d4 :
                          _p4
                        ) : null;
                        return (
                          <div key={sj.id} style={{ borderRadius: 10, border: `1px solid ${isConfirmed2 ? 'rgba(16,185,129,0.2)' : isRejected2 ? 'rgba(239,68,68,0.2)' : '#e2e8f0'}`, marginBottom: 10, overflow: 'hidden', background: isConfirmed2 ? 'rgba(16,185,129,0.02)' : isRejected2 ? 'rgba(239,68,68,0.02)' : 'white' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f8faff' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConfirmed2 ? '#10b981' : isRejected2 ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nome2}</div>
                                <div style={{ fontSize: 11, color: '#667eea', marginTop: 1, fontWeight: 500 }}>{sj.supplierName || sj.confirmedBy || 'Fornecedor'}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: isConfirmed2 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: isConfirmed2 ? '#10b981' : '#ef4444' }}>
                                  {isConfirmed2 ? '✓ Confirmado' : '✗ Recusado'}
                                </span>
                                <button onClick={() => handleEditarJob(sj)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                                <button onClick={() => handleTrocarFornecedor(sj)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(102,126,234,0.3)', background: 'none', color: '#667eea', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Trocar</button>
                              </div>
                            </div>
                            <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                              {valorTotal2 && <div style={{ background: 'rgba(0,229,196,0.06)', borderRadius: 8, padding: '7px 10px', border: '1px solid rgba(0,229,196,0.15)' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Valor total</div><div style={{ fontSize: 14, fontWeight: 700, color: '#00E5C4' }}>R$ {valorTotal2.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>}
                              {sj.diasPreparo > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Preparo</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasPreparo} dias</div></div>}
                              {sj.diasMontagem > 0 && <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Montagem</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sj.diasMontagem} dias</div></div>}
                              <div style={{ background: '#f8faff', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Evento</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{diasEvento2} dias</div></div>
                              {sj.observacaoFornecedor && <div style={{ background: '#fffbeb', borderRadius: 8, padding: '7px 10px', gridColumn: '1/-1' }}><div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Obs. fornecedor</div><div style={{ fontSize: 11, color: '#475569' }}>{sj.observacaoFornecedor}</div></div>}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {todosConfirmados && project.status !== 'pendingApproval' && project.status !== 'approved' && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(0,229,196,0.06)', borderRadius: 10, border: '1px solid rgba(0,229,196,0.2)', textAlign: 'center', fontSize: 13, color: '#00E5C4' }}>
                      {gerandoOrcamento ? '⏳ Gerando orçamento automaticamente...' : '✓ Processando — orçamento sendo enviado ao cliente'}
                    </div>
                  )}
                  {project.status === 'pendingApproval' && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(255,167,38,0.06)', borderRadius: 10, border: '1px solid rgba(255,167,38,0.2)', textAlign: 'center', fontSize: 13, color: '#FFA726', fontWeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span>⏳ Orçamento enviado — aguardando aprovação do cliente</span>
                      <button onClick={handleGerarOrcamento} disabled={gerandoOrcamento}
                        style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {gerandoOrcamento ? 'Recalculando...' : '↻ Recalcular orçamento'}
                      </button>
                    </div>
                  )}
                  {project.status === 'approved' && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center', fontSize: 13, color: '#10b981', fontWeight: 500 }}>
                      ✓ Orçamento aprovado pelo cliente!
                    </div>
                  )}
                  <div style={{ height: 1, background: '#f0f2f5', margin: '20px 0' }} />
                </div>
                );
              })()}

              {showTaskForm && (
                <div style={{ background: '#f8faff', borderRadius: 10, border: '1px solid #e0e8ff', padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={lbl}>Nome *</label>
                      <input value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))} style={inp} placeholder="Nome da tarefa" />
                    </div>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={lbl}>Descrição</label>
                      <input value={newTask.descricao} onChange={e => setNewTask(p => ({ ...p, descricao: e.target.value }))} style={inp} placeholder="Detalhes..." />
                    </div>
                    <div>
                      <label style={lbl}>Prazo</label>
                      <input type="date" value={newTask.prazo} onChange={e => setNewTask(p => ({ ...p, prazo: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Prioridade</label>
                      <select value={newTask.prioridade} onChange={e => setNewTask(p => ({ ...p, prioridade: e.target.value }))} style={{ ...inp, background: 'white' }}>
                        <option value="baixa">Baixa</option>
                        <option value="normal">Normal</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowTaskForm(false)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                    <button onClick={handleAddTask} disabled={savingTask} style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                      {savingTask ? 'Salvando...' : 'Criar Tarefa'}
                    </button>
                  </div>
                </div>
              )}

              {tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Nenhuma tarefa ainda</div>
              ) : tasks.map(t => {
                const PRIORIDADE = { baixa: '#94a3b8', normal: '#64748b', alta: '#f97316', urgente: '#ef4444' };
                const STATUS_TASK = { todo: { label: 'A Fazer', color: '#f59e0b' }, in_progress: { label: 'Em Andamento', color: '#3b82f6' }, done: { label: 'Concluída', color: '#10b981' } };
                const st = STATUS_TASK[t.status] || STATUS_TASK.todo;
                return (
                  <div key={t.taskId} className="ps-task-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 2 }}>{t.name}</div>
                      {t.descricao && <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.descricao}</div>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
                        {t.prazo && <span style={{ fontSize: 10, color: '#f59e0b' }}>📅 {t.prazo}</span>}
                        {t.prioridade && t.prioridade !== 'normal' && <span style={{ fontSize: 10, color: PRIORIDADE[t.prioridade], fontWeight: 600 }}>{t.prioridade.toUpperCase()}</span>}
                        {t.assignedToName && <span style={{ fontSize: 10, color: '#64748b' }}>👤 {t.assignedToName}</span>}
                      </div>
                    </div>
                    <select value={t.status || 'todo'} onChange={e => handleTaskStatus(t.taskId, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${st.color}44`, fontSize: 11, color: st.color, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', background: `${st.color}11` }}>
                      <option value="todo">A Fazer</option>
                      <option value="in_progress">Em Andamento</option>
                      <option value="done">Concluída</option>
                    </select>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* ── RELATÓRIO (coordenador) ── */}
          {activeTab === 'relatorio' && !isFornecedor && (() => {
            const allTasks = projectTasks;
            const todasConcluidas = allTasks.length > 0 && allTasks.every(t => t.status === 'concluido');
            const jaEnviado = project.status === 'completed' && project.relatorioFinal;
            return (
              <>
                {jaEnviado ? (
                  <div style={{ background: 'rgba(102,187,106,0.06)', border: '1px solid rgba(102,187,106,0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20, color: '#66BB6A' }}>✓</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#66BB6A' }}>Relatório enviado ao cliente</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        Por {project.relatorioFinal.enviadoPor} • {new Date(project.relatorioFinal.geradoEm).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                ) : !todasConcluidas ? (
                  <div style={{ background: 'rgba(255,167,38,0.06)', border: '1px solid rgba(255,167,38,0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#FFA726', marginBottom: 4 }}>Aguardando conclusão das tarefas</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {allTasks.filter(t => t.status === 'concluido').length}/{allTasks.length} tarefas concluídas.
                    </div>
                  </div>
                ) : confirmRelatorio ? (
                  <div style={{ background: 'rgba(102,187,106,0.06)', border: '1px solid rgba(102,187,106,0.25)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#66BB6A', marginBottom: 6 }}>Confirmar envio do relatório ao cliente?</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>O projeto será marcado como concluído.</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={handleEnviarRelatorio} disabled={enviandoRelatorio}
                        style={{ padding: '8px 20px', background: '#66BB6A', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                        {enviandoRelatorio ? 'Enviando...' : 'Confirmar'}
                      </button>
                      <button onClick={() => setConfirmRelatorio(false)}
                        style={{ padding: '8px 20px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmRelatorio(true)}
                    style={{ width: '100%', padding: '14px 20px', background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: 'none', borderRadius: 12, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', marginBottom: 20 }}>
                    Enviar Relatório Final ao Cliente
                  </button>
                )}

                {/* Resumo das tarefas */}
                <div className="ps-card">
                  <div className="ps-card-title">Resumo das Tarefas ({allTasks.length})</div>
                  {allTasks.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma tarefa criada ainda.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {allTasks.map(t => (
                        <div key={t.id} style={{ borderRadius: 8, border: '1px solid #e2e8f0', padding: '10px 14px', background: t.status === 'concluido' ? 'rgba(102,187,106,0.04)' : 'white' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{t.serviceName}</span>
                              <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 8, background: t.fase === 'preparacao' ? 'rgba(123,175,212,0.15)' : 'rgba(0,229,196,0.1)', color: t.fase === 'preparacao' ? '#7BAFD4' : '#00E5C4' }}>
                                {t.fase === 'preparacao' ? 'PREP' : 'EXEC'}
                              </span>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 10, background: t.status === 'concluido' ? 'rgba(102,187,106,0.1)' : 'rgba(255,167,38,0.1)', color: t.status === 'concluido' ? '#66BB6A' : '#FFA726' }}>
                              {t.status === 'concluido' ? '✓ Concluída' : 'Pendente'}
                            </span>
                          </div>
                          {t.supplierName && <div style={{ fontSize: 11, color: '#667eea', marginTop: 4 }}>{t.supplierName}</div>}
                          {t.observacaoFornecedor && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, background: '#f8faff', borderRadius: 6, padding: '4px 8px' }}>Obs: {t.observacaoFornecedor}</div>}
                          {t.valor > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: '#00E5C4', marginTop: 4 }}>R$ {t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* ── HISTÓRICO ── */}
          {activeTab === 'timeline' && (
            <div className="ps-card">
              <div className="ps-card-title">Histórico</div>
              {(!project.timeline || project.timeline.length === 0) ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Nenhum histórico ainda</div>
              ) : [...project.timeline].reverse().map((item, i) => (
                <div key={i} className="ps-tl-item">
                  <div className="ps-tl-dot">•</div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 14, color: '#1a2e40', marginBottom: 3 }}>{item.description}</div>
                    <div style={{ fontSize: 12, color: '#8a9bb0' }}>{item.userName} · {formatDate(item.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Modal de envio para aprovação */}
      {aprovacaoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{aprovacaoModal.label}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>{aprovacaoModal.task.nome || aprovacaoModal.task.serviceName}</div>

            {/* Upload de arquivos */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Arquivos / Fotos *</label>
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx"
                onChange={e => setAprovacaoArquivos(Array.from(e.target.files))}
                style={{ width: '100%', fontSize: 12, fontFamily: 'Outfit, sans-serif' }} />
              {aprovacaoArquivos.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#667eea' }}>
                  {aprovacaoArquivos.length} arquivo(s) selecionado(s)
                </div>
              )}
            </div>

            {/* Observação */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Observações</label>
              <textarea value={aprovacaoObs} onChange={e => setAprovacaoObs(e.target.value)}
                placeholder="Descreva o que foi entregue, detalhes relevantes..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'Outfit, sans-serif', resize: 'vertical', minHeight: 70, boxSizing: 'border-box', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAprovacaoModal(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
              <button onClick={handleEnviarParaAprovacao} disabled={uploadingAprov || aprovacaoArquivos.length === 0}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: aprovacaoArquivos.length === 0 ? '#e2e8f0' : 'linear-gradient(135deg,#667eea,#764ba2)', color: aprovacaoArquivos.length === 0 ? '#94a3b8' : 'white', fontSize: 13, fontWeight: 600, cursor: aprovacaoArquivos.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {uploadingAprov ? 'Enviando...' : 'Enviar para aprovação'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── CHAT COORDENADOR (abre via botão Chat nos fornecedores) ── */}
      {isCoord && coordChatId && coordChatInfo && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, width: 340, height: 480, background: 'rgba(10,22,38,0.98)', border: '1px solid rgba(255,167,38,0.3)', borderRadius: 14, zIndex: 1001, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ChatPanel
            chatId={coordChatId}
            title={coordChatInfo.titulo}
            subtitle={coordChatInfo.subtitulo}
            accentColor="#FFA726"
            userData={userData}
            onClose={() => { setCoordChatId(null); setCoordChatInfo(null); }}
          />
        </div>
      )}

      {/* ── CHAT FLUTUANTE (fornecedor/cliente) ── */}
      {(isFornecedor || userData?.systemRole === 'cliente') && project && (() => {
        const tipo = isFornecedor ? 'fornecedor' : 'cliente';
        const cor  = isFornecedor ? '#FFA726' : '#0080FF';
        const chatId = isFornecedor
          ? `${projectId}_${userData?.id}`
          : `${projectId}_cliente`;
        const titulo   = project.eventName || project.eventTypeName || 'Projeto';
        const subtitulo = isFornecedor
          ? `${project.numeroPedido || ''} • ${userData?.name || 'Fornecedor'}`
          : `${project.numeroPedido || ''} • Cliente`;

        const abrirChat = async () => {
          // Garante que o documento do chat existe
          await setDoc(doc(db, 'chats', chatId), {
            budgetId:  projectId,
            tipo,
            titulo:    `${titulo}`,
            subtitulo,
            empresa:   isFornecedor
              ? (userData?.companyName || userData?.name || '')
              : (client?.companyName || project.clientCompanyName || ''),
            createdAt: serverTimestamp(),
            naoLidas:  0,
          }, { merge: true });
          setChatAberto(true);
        };

        return (
          <>
            <button onClick={chatAberto ? () => setChatAberto(false) : abrirChat}
              style={{ position: 'fixed', bottom: 28, right: 28, width: 52, height: 52, borderRadius: '50%', border: 'none', background: cor, color: 'white', fontSize: 22, cursor: 'pointer', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 16px ${cor}55`, position: 'fixed' }}>
              💬
              {!chatAberto && chatNaoLidas > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: '#66BB6A', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: '2px solid #0D1B2A' }}>
                  {chatNaoLidas > 9 ? '9+' : chatNaoLidas}
                </span>
              )}
            </button>
            {chatAberto && (
              <div style={{ position: 'fixed', bottom: 90, right: 28, width: 340, height: 480, background: 'rgba(10,22,38,0.98)', border: `1px solid ${cor}40`, borderRadius: 14, zIndex: 1001, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ChatPanel
                  chatId={chatId}
                  title={titulo}
                  subtitle={subtitulo}
                  accentColor={cor}
                  userData={userData}
                  onClose={() => setChatAberto(false)}
                />
              </div>
            )}
          </>
        );
      })()}
    </>
  );
}
