// aprovacaoOrcamento.js (mobile)
//
// Mesma lógica do arquivo compartilhado da web — cria as "tasks" pros
// fornecedores depois que um orçamento é aprovado de vez (última palavra).
// Usada tanto pelo ProjectDetailScreen.js (Cliente, quando não tem
// segunda aprovação) quanto pelo TenantAdminHomeScreen.js (Admin da
// Empresa, segunda aprovação).
import { collection, addDoc, updateDoc, doc, getDocs, getDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function criarTasksParaFornecedores(project) {
  const sjSnap = await getDocs(query(
    collection(db, 'supplierJobs'),
    where('budgetId', '==', project.id),
    where('status', '==', 'confirmed')
  ));
  const sjs = sjSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const calcDias = () => {
    const ini = project.briefingData?.evento?.dataInicio || project.startDate;
    const fim = project.briefingData?.evento?.dataFim    || project.endDate;
    if (ini && fim) { const d = Math.round((new Date(fim+'T12:00:00')-new Date(ini+'T12:00:00'))/(864e5))+1; return d > 0 ? d : 1; }
    return project.briefingData?.evento?.diasDuracao || 1;
  };
  const diasEvento = calcDias();
  const dataInicioEvento = project.briefingData?.evento?.dataInicio || project.startDate || '';
  const dataFimEvento    = project.briefingData?.evento?.dataFim    || project.endDate    || dataInicioEvento;
  const addDias = (dataStr, dias) => {
    if (!dataStr) return '';
    const d = new Date(dataStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
  };
  const etapasCronograma = [];

  await Promise.all(sjs.map(async sj => {
    await updateDoc(doc(db, 'supplierJobs', sj.id), { stage: 'aguardando', updatedAt: serverTimestamp() });

    let preAprovacao = false, aprovacaoExecucao = false;
    try {
      if (sj.opcaoCatalogoId) {
        const svcSnap = await getDocs(query(collection(db, 'services'), where('__name__', '==', sj.opcaoCatalogoId)));
        if (!svcSnap.empty) {
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

    const diasMontagemSj = parseFloat(sj.diasMontagem) || 0;
    const diasPreparoSj  = parseFloat(sj.diasPreparo)  || 0;
    const prazoInicioPreparo = addDias(dataInicioEvento, -(diasPreparoSj + diasMontagemSj));
    const prazoFimPreparo    = addDias(dataInicioEvento, -diasMontagemSj);

    if (diasPreparoSj > 0) {
      etapasCronograma.push({ id: `prep_${sj.id}`, nome: `Preparação — ${sj.serviceName}`, descricao: `Preparação de ${sj.serviceName}`, responsavel: sj.supplierName || sj.serviceName || '', tipo: 'preparo', status: 'pendente', dataInicio: prazoInicioPreparo, dataEntrega: prazoFimPreparo });
    }
    if (diasMontagemSj > 0) {
      etapasCronograma.push({ id: `mont_${sj.id}`, nome: `Montagem — ${sj.serviceName}`, descricao: `Montagem de ${sj.serviceName}`, responsavel: sj.supplierName || sj.serviceName || '', tipo: 'montagem', status: 'pendente', dataInicio: addDias(dataInicioEvento, -diasMontagemSj), dataEntrega: dataInicioEvento });
    }
    etapasCronograma.push({ id: `exec_${sj.id}`, nome: `Evento — ${sj.serviceName}`, descricao: `Execução de ${sj.serviceName} durante o evento`, responsavel: sj.supplierName || sj.serviceName || '', tipo: 'execucao', status: 'pendente', dataInicio: dataInicioEvento, dataEntrega: dataFimEvento });

    const taskBase = {
      budgetId: project.id, supplierJobId: sj.id, supplierId: sj.supplierId,
      supplierName: sj.supplierName || sj.confirmedBy || '', serviceName: sj.serviceName || '',
      serviceParentName: sj.serviceParentName || '', tipoServico: sj.tipoServico || '',
      opcaoCatalogoId: sj.opcaoCatalogoId || '', opcaoNome: sj.opcaoNome || '',
      nome: sj.serviceName || '', descricao: sj.observacoes || '',
      dataInicio: preAprovacao ? prazoInicioPreparo : dataInicioEvento,
      dataEntrega: preAprovacao ? prazoFimPreparo    : dataFimEvento,
      diasAntes: diasPreparoSj + diasMontagemSj,
      diasPreparo: sj.diasPreparo || 0, diasMontagem: sj.diasMontagem || 0,
      diasEvento, horasPorDia: horas, quantidade: qtd, diasServico: diasServ,
      eventHorarioInicio: sj.eventHorarioInicio || project.briefingData?.evento?.horarioInicio || '',
      eventHorarioFim: sj.eventHorarioFim || project.briefingData?.evento?.horarioFim || '',
      eventLocal: sj.eventLocal || project.location || '', eventVisitantes: visitantes,
      valor, preco, unidade: sj.unidade || '', observacoes: sj.observacoes || '',
      preAprovacao, aprovacaoExecucao, createdAt: serverTimestamp(),
    };

    if (preAprovacao) {
      await addDoc(collection(db, 'tasks'), { ...taskBase, fase: 'preparacao', nome: `Preparação — ${sj.serviceName}`, status: 'pendente', cor: '#7BAFD4' });
    } else {
      await addDoc(collection(db, 'tasks'), { ...taskBase, fase: 'execucao', nome: `Execução — ${sj.serviceName}`, status: 'pendente', cor: '#00E5C4' });
    }
  }));

  await updateDoc(doc(db, 'budgets', project.id), { cronograma: { etapas: etapasCronograma, prazoInviavel: false } });

  try {
    if (project.assignedTo) {
      await addDoc(collection(db, 'notificacoes', project.assignedTo, 'items'), {
        titulo: 'Orcamento aprovado',
        mensagem: `O orcamento do evento "${project.eventName || ''}" foi aprovado. Envie a cotacao para os fornecedores.`,
        tipo: 'acao', budgetId: project.id, lida: false, createdAt: serverTimestamp(),
      });
    }
  } catch (e) { console.error('notif coord:', e); }
}
