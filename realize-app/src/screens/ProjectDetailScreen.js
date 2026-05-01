import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Platform,
} from 'react-native';
import {
  doc, onSnapshot, collection, getDocs, query,
  where, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STATUS_CONFIG = {
  analyzing:       { label: 'Em análise',            color: '#FFA726' },
  pendingApproval: { label: 'Orçamento disponível',  color: '#0080FF' },
  approved:        { label: 'Aprovado',               color: '#00E5C4' },
  inProgress:      { label: 'Em andamento',           color: '#0080FF' },
  completed:       { label: 'Concluído',              color: '#66BB6A' },
  rejected:        { label: 'Cancelado',              color: '#ef4444' },
};

export default function ProjectDetailScreen({ route, navigation }) {
  const { budgetId } = route.params;
  const [project, setProject]   = useState(null);
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [aprovando, setAprovando] = useState(false);
  const [user, setUser]         = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('loggedUser').then(s => { if (s) setUser(JSON.parse(s)); });
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'budgets', budgetId), snap => {
      if (snap.exists()) setProject({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
    return () => unsub();
  }, [budgetId]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('budgetId', '==', budgetId)),
      snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [budgetId]);

  const handleAprovarOrcamento = async () => {
    Alert.alert('Aprovar orçamento', 'Confirmar aprovação do orçamento?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        setAprovando(true);
        try {
          await updateDoc(doc(db, 'budgets', budgetId), {
            status: 'approved', workspaceStage: 'Aguardando',
            approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
            timeline: [...(project.timeline || []), { action: 'approved', description: 'Orçamento aprovado pelo cliente (app)', timestamp: new Date() }],
          });
          // Cria tasks dos supplierJobs
          const sjSnap = await getDocs(query(collection(db, 'supplierJobs'), where('budgetId', '==', budgetId), where('status', '==', 'confirmed')));
          const sjs = sjSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const diasEvento = project.briefingData?.evento?.diasDuracao || 1;
          const cronograma = project.cronograma?.etapas || [];
          for (const sj of sjs) {
            await updateDoc(doc(db, 'supplierJobs', sj.id), { stage: 'aguardando', updatedAt: serverTimestamp() });
            const etapa = cronograma.find(e =>
              (e.nome||'').toLowerCase().includes((sj.serviceName||'').toLowerCase()) ||
              (sj.serviceName||'').toLowerCase().includes((e.nome||'').toLowerCase())
            );
            await addDoc(collection(db, 'tasks'), {
              budgetId, supplierJobId: sj.id, supplierId: sj.supplierId,
              supplierName: sj.supplierName || '', serviceName: sj.serviceName || '',
              serviceParentName: sj.serviceParentName || '', tipoServico: sj.tipoServico || '',
              nome: sj.serviceName || '', descricao: etapa?.descricao || '',
              dataInicio: etapa?.dataInicio || '', dataEntrega: etapa?.dataEntrega || '',
              diasPreparo: sj.diasPreparo || 0, diasMontagem: sj.diasMontagem || 0,
              diasEvento, valor: sj.preco ? parseFloat(sj.preco) * diasEvento : 0,
              preco: parseFloat(sj.preco || 0), unidade: sj.unidade || '',
              status: 'pendente', createdAt: serverTimestamp(),
            });
          }
          Alert.alert('✓ Aprovado!', 'Orçamento aprovado com sucesso.');
        } catch (e) { console.error(e); Alert.alert('Erro', 'Não foi possível aprovar.'); }
        finally { setAprovando(false); }
      }},
    ]);
  };

  const handleRecusarOrcamento = async () => {
    Alert.alert('Recusar orçamento', 'Deseja recusar este orçamento?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Recusar', style: 'destructive', onPress: async () => {
        try {
          await updateDoc(doc(db, 'budgets', budgetId), {
            status: 'rejected', workspaceStage: 'Propostas', updatedAt: serverTimestamp(),
            timeline: [...(project.timeline || []), { action: 'rejected', description: 'Orçamento recusado pelo cliente (app)', timestamp: new Date() }],
          });
        } catch (e) { Alert.alert('Erro', 'Não foi possível recusar.'); }
      }},
    ]);
  };

  const handleAprovarTask = async (task, aprovado) => {
    const msg = aprovado ? 'Aprovar esta entrega?' : 'Solicitar ajuste nesta entrega?';
    Alert.alert(aprovado ? 'Aprovar' : 'Solicitar ajuste', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        try {
          await updateDoc(doc(db, 'tasks', task.id), {
            status: aprovado ? 'concluido' : 'ajuste',
            aprovacaoClienteEm: serverTimestamp(),
            aprovacaoClienteOk: aprovado,
            updatedAt: serverTimestamp(),
          });
        } catch (e) { Alert.alert('Erro', 'Não foi possível processar.'); }
      }},
    ]);
  };

  const fmtDate = str => {
    if (!str) return '—';
    const [y,m,d] = str.split('-');
    return `${d}/${m}/${y}`;
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#00E5C4" />
    </View>
  );

  if (!project) return (
    <View style={styles.center}>
      <Text style={styles.errorText}>Projeto não encontrado</Text>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnLarge}>
        <Text style={styles.backBtnText}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );

  const statusInfo = STATUS_CONFIG[project.status] || STATUS_CONFIG.analyzing;
  const ev = project.briefingData?.evento || {};
  const orcamento = project.orcamentoFinal;
  const tasksPendAprov = tasks.filter(t =>
    ['aguardando_pre_aprovacao','aguardando_aprovacao_execucao','aguardando_aprovacao_entrega'].includes(t.status)
  );
  const tasksPendentes  = tasks.filter(t => t.status === 'pendente' || t.status === 'em_andamento' || t.status === 'ajuste');
  const tasksConcluidas = tasks.filter(t => t.status === 'concluido');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {project.eventName || ev.nome || ev.tipo || 'Evento'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '22', borderColor: statusInfo.color + '44' }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

        {/* Dados do evento */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informações do Evento</Text>
          {[
            ['Tipo', ev.tipo],
            ['Data início', ev.dataInicio ? fmtDate(ev.dataInicio) : null],
            ['Data fim', ev.dataFim ? fmtDate(ev.dataFim) : null],
            ['Duração', ev.diasDuracao ? `${ev.diasDuracao} dia(s)` : null],
            ['Local', ev.local || ev.cidade],
            ['Visitantes/dia', ev.visitantesPorDia],
          ].filter(([,v]) => v).map(([label, val]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Aprovações de tasks pendentes */}
        {tasksPendAprov.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚡ Aprovações Pendentes</Text>
            {tasksPendAprov.map(task => {
              const TIPO_LABEL = {
                aguardando_pre_aprovacao:      { label: 'Pré-aprovação',         color: '#7BAFD4' },
                aguardando_aprovacao_execucao: { label: 'Aprovação de Execução', color: '#667eea' },
                aguardando_aprovacao_entrega:  { label: 'Aprovação de Entrega',  color: '#10b981' },
              };
              const info = TIPO_LABEL[task.status] || { label: 'Aprovação', color: '#FFA726' };
              return (
                <View key={task.id} style={[styles.aprovCard, { borderColor: info.color + '44' }]}>
                  <Text style={[styles.aprovTipo, { color: info.color }]}>{info.label}</Text>
                  <Text style={styles.aprovNome}>{task.nome || task.serviceName}</Text>
                  {task.supplierName && <Text style={styles.aprovSupplier}>{task.supplierName}</Text>}
                  {task.aprovacaoObs ? <Text style={styles.aprovObs}>{task.aprovacaoObs}</Text> : null}
                  {task.aprovacaoArquivos?.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                      {task.aprovacaoArquivos.map((f, i) => (
                        <TouchableOpacity key={i} onPress={() => Linking.openURL(f.url)}
                          style={styles.fileBtn}>
                          <Text style={styles.fileBtnText}>📎 {f.nome}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                  <View style={styles.aprovBtns}>
                    <TouchableOpacity onPress={() => handleAprovarTask(task, false)} style={styles.btnRecusar}>
                      <Text style={styles.btnRecusarText}>Solicitar ajuste</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleAprovarTask(task, true)} style={[styles.btnAprovar, { backgroundColor: info.color }]}>
                      <Text style={styles.btnAprovarText}>✓ Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Orçamento */}
        {project.status === 'pendingApproval' && orcamento && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Orçamento Final</Text>
            {(orcamento.itens || []).map((item, i) => (
              <View key={i} style={styles.orcItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orcItemName}>{item.serviceName}</Text>
                  <Text style={styles.orcItemSub}>{item.supplierName} · R$ {parseFloat(item.preco||0).toLocaleString('pt-BR',{minimumFractionDigits:2})} × {item.diasEvento}d</Text>
                </View>
                <Text style={styles.orcItemVal}>R$ {parseFloat(item.subtotal||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</Text>
              </View>
            ))}
            <View style={styles.orcTotal}>
              <Text style={styles.orcTotalLabel}>Total</Text>
              <Text style={styles.orcTotalVal}>R$ {parseFloat(orcamento.total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</Text>
            </View>
            <Text style={styles.orcObs}>* Valores de referência. Taxa de serviço e impostos adicionados na proposta final.</Text>
            <View style={styles.orcBtns}>
              <TouchableOpacity onPress={handleRecusarOrcamento} disabled={aprovando} style={styles.btnRecusar}>
                <Text style={styles.btnRecusarText}>Recusar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAprovarOrcamento} disabled={aprovando} style={styles.btnAprovarOrc}>
                {aprovando
                  ? <ActivityIndicator size="small" color="white" />
                  : <Text style={styles.btnAprovarText}>✓ Aprovar Orçamento</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tasks pendentes */}
        {tasksPendentes.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tarefas em andamento</Text>
            {tasksPendentes.map(task => {
              const COR = { pendente: '#f59e0b', em_andamento: '#0080FF', ajuste: '#ef4444' };
              const cor = COR[task.status] || '#7BAFD4';
              return (
                <View key={task.id} style={styles.taskRow}>
                  <View style={[styles.taskDot, { backgroundColor: cor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskName}>{task.nome || task.serviceName}</Text>
                    {task.supplierName && <Text style={styles.taskSub}>{task.supplierName}</Text>}
                    {task.dataEntrega && <Text style={styles.taskDate}>Entrega: {fmtDate(task.dataEntrega)}</Text>}
                    {task.status === 'ajuste' && <Text style={[styles.taskDate, { color: '#ef4444' }]}>⚠ Ajuste solicitado</Text>}
                  </View>
                  <Text style={[styles.taskStatus, { color: cor }]}>
                    {task.status === 'pendente' ? 'Pendente' : task.status === 'em_andamento' ? 'Em andamento' : 'Ajuste'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Tasks concluídas */}
        {tasksConcluidas.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>✓ Concluídas ({tasksConcluidas.length})</Text>
            {tasksConcluidas.map(task => (
              <View key={task.id} style={[styles.taskRow, { opacity: 0.6 }]}>
                <View style={[styles.taskDot, { backgroundColor: '#10b981' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskName}>{task.nome || task.serviceName}</Text>
                  {task.supplierName && <Text style={styles.taskSub}>{task.supplierName}</Text>}
                </View>
                <Text style={[styles.taskStatus, { color: '#10b981' }]}>✓</Text>
              </View>
            ))}
          </View>
        )}

        {/* Status neutro */}
        {project.status !== 'pendingApproval' && tasks.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.neutralText}>
              {project.status === 'analyzing' ? '⏳ Seu pedido está em análise. Em breve você receberá o orçamento.' :
               project.status === 'approved'  ? '✓ Orçamento aprovado! A equipe está trabalhando no seu evento.' :
               project.status === 'rejected'  ? '✗ Este pedido foi cancelado.' :
               'Acompanhe o andamento do seu evento aqui.'}
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D1B2A' },
  errorText: { color: '#7BAFD4', fontSize: 14, marginBottom: 16 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingBottom: 14, paddingHorizontal: 20,
    backgroundColor: '#0A1628',
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,180,255,0.1)',
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn: { padding: 6 },
  backText: { color: '#7BAFD4', fontSize: 20 },
  backBtnLarge: { marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#7BAFD4' },
  backBtnText: { color: '#7BAFD4', fontSize: 14 },
  headerCenter: { flex: 1, gap: 4 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#E8F4FF' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1 },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,180,255,0.1)', padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 11, fontWeight: '700', color: '#00E5C4', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,180,255,0.08)' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  infoLabel: { fontSize: 12, color: '#7BAFD4' },
  infoValue: { fontSize: 12, color: '#E8F4FF', fontWeight: '500', flex: 1, textAlign: 'right' },
  // Aprovações
  aprovCard: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 10 },
  aprovTipo: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  aprovNome: { fontSize: 14, fontWeight: '600', color: '#E8F4FF', marginBottom: 2 },
  aprovSupplier: { fontSize: 11, color: '#7BAFD4', marginBottom: 4 },
  aprovObs: { fontSize: 12, color: '#7BAFD4', marginBottom: 8, fontStyle: 'italic' },
  fileBtn: { padding: '6px 12px', borderRadius: 6, backgroundColor: 'rgba(102,126,234,0.1)', borderWidth: 1, borderColor: 'rgba(102,126,234,0.3)', marginRight: 8 },
  fileBtnText: { fontSize: 12, color: '#667eea' },
  aprovBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  // Orçamento
  orcItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  orcItemName: { fontSize: 13, color: '#E8F4FF', fontWeight: '500' },
  orcItemSub: { fontSize: 11, color: '#7BAFD4', marginTop: 2 },
  orcItemVal: { fontSize: 13, fontWeight: '600', color: '#E8F4FF' },
  orcTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,128,255,0.2)' },
  orcTotalLabel: { fontSize: 15, fontWeight: '600', color: '#E8F4FF' },
  orcTotalVal: { fontSize: 22, fontWeight: '700', color: '#0080FF' },
  orcObs: { fontSize: 11, color: 'rgba(123,175,212,0.4)', marginTop: 10, lineHeight: 16 },
  orcBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnRecusar: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', alignItems: 'center' },
  btnRecusarText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  btnAprovar: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  btnAprovarOrc: { flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: '#0080FF', alignItems: 'center' },
  btnAprovarText: { color: 'white', fontSize: 13, fontWeight: '700' },
  // Tasks
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  taskDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  taskName: { fontSize: 13, color: '#E8F4FF', fontWeight: '500' },
  taskSub: { fontSize: 11, color: '#7BAFD4', marginTop: 1 },
  taskDate: { fontSize: 10, color: '#7BAFD4', marginTop: 2 },
  taskStatus: { fontSize: 10, fontWeight: '700' },
  neutralText: { fontSize: 13, color: '#7BAFD4', lineHeight: 20, textAlign: 'center', paddingVertical: 8 },
});
