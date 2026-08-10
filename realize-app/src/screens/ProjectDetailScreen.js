import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Platform, Image, Modal,
} from 'react-native';
import {
  doc, onSnapshot, collection, getDocs, query,
  where, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

import DemandaPanelMobile from './DemandaPanelMobile';
import { criarTasksParaFornecedores } from './aprovacaoOrcamento';

const STATUS_CONFIG = {
  analyzing:       { label: 'Em análise',            color: '#FFA726' },
  pendingApproval: { label: 'Orçamento disponível',  color: '#0080FF' },
  pendingAdminApproval: { label: 'Aguardando Admin', color: '#AB47BC' },
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
  const [fotoAmpliada, setFotoAmpliada] = useState(null); // { fotos: [], idx: 0 }
  const [etapaFotos, setEtapaFotos] = useState([]);
  const [demandasAbertas, setDemandasAbertas] = useState([]);
  const [demandaAberta, setDemandaAberta] = useState(null); // demanda sendo vista no momento

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

  // Fotos das Etapas do Evento — só leitura no mobile por enquanto (quem sobe é
  // o Fornecedor, que ainda não tem tela própria no celular).
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'budgets', budgetId, 'etapaFotos'),
      snap => setEtapaFotos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [budgetId]);

  // Demandas abertas desse projeto — o Cliente vê e responde pelo celular.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'demandas'), where('budgetId', '==', budgetId), where('status', '==', 'aberta')),
      snap => setDemandasAbertas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [budgetId]);

  const handleAprovarOrcamento = async () => {
    // Empresas com estrutura de franquia (tenantId) passam por uma segunda
    // aprovação — a do Admin da empresa — antes das tarefas irem pros
    // fornecedores. Clientes sem tenant seguem direto, como sempre foi.
    const precisaAprovacaoAdmin = !!project.tenantId;
    Alert.alert(
      'Aprovar orçamento',
      precisaAprovacaoAdmin
        ? 'Confirmar aprovação? Ainda vai passar pela aprovação do Admin da empresa antes de ir pros fornecedores.'
        : 'Confirmar aprovação do orçamento?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: async () => {
          setAprovando(true);
          try {
            await updateDoc(doc(db, 'budgets', budgetId), {
              status: precisaAprovacaoAdmin ? 'pendingAdminApproval' : 'approved',
              workspaceStage: 'Aguardando',
              approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
              timeline: [...(project.timeline || []), {
                action: precisaAprovacaoAdmin ? 'approved_by_unit' : 'approved',
                description: precisaAprovacaoAdmin ? 'Orçamento aprovado pela unidade (app) — aguardando aprovação do Admin' : 'Orçamento aprovado pelo cliente (app)',
                timestamp: new Date(),
              }],
            });
            if (!precisaAprovacaoAdmin) {
              await criarTasksParaFornecedores(project);
            } else {
              try {
                const adminsSnap = await getDocs(query(
                  collection(db, 'users'),
                  where('tenantId', '==', project.tenantId),
                  where('roleName', '==', 'Administrador da Empresa')
                ));
                await Promise.all(adminsSnap.docs.map(d => addDoc(collection(db, 'notificacoes', d.id, 'items'), {
                  titulo: 'Orçamento aguardando sua aprovação',
                  mensagem: `O orçamento do evento "${project.eventName || ''}" foi aprovado pela unidade e está esperando sua aprovação final.`,
                  tipo: 'acao', budgetId: project.id, lida: false, createdAt: serverTimestamp(),
                })));
              } catch (e) { console.error('notif admin tenant:', e); }
            }
            Alert.alert('✓ Aprovado!', precisaAprovacaoAdmin ? 'Aguardando aprovação do Admin da empresa.' : 'Orçamento aprovado com sucesso.');
          } catch (e) { console.error(e); Alert.alert('Erro', 'Não foi possível aprovar.'); }
          finally { setAprovando(false); }
        }},
      ]
    );
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

  const isImageFile = nome => /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(nome || '');

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
  const est = project.briefingData?.estrutura || {};
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
            ['Empresa', ev.nomeEmpresa],
            ['Tipo', ev.tipo],
            ['Data início', ev.dataInicio ? fmtDate(ev.dataInicio) : null],
            ['Data fim', ev.dataFim ? fmtDate(ev.dataFim) : null],
            ['Duração', ev.diasDuracao ? `${ev.diasDuracao} dia(s)` : null],
            ['Horário', ev.horarioInicio ? `${ev.horarioInicio} às ${ev.horarioFim || ''}` : null],
            ['Cidade', ev.cidade],
            ['Local', ev.local],
            ['Visitantes/dia', ev.visitantesPorDia],
            ['Pagamento', { '50_50': '50% + 50%', '30_60_90': '30/60/90 dias', 'a_vista': 'À vista' }[project.briefingData?.formaPagamento] || project.briefingData?.formaPagamento],
          ].filter(([,v]) => v).map(([label, val]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Stand */}
        {est.ativo && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Stand</Text>
            {[
              ['Tipo', est.tipoEstande === 'modular' ? 'Modular' : 'Personalizado'],
              ['Área', est.areaM2 > 0 ? `${est.areaM2} m²` : null],
              ['Teto', est.alturaTeto],
              ['Montagem', est.diasMontagem > 0 ? `${est.diasMontagem} dias antes` : null],
              ['Restrições', est.restricoes],
              ['Identidade visual', est.identidadeVisual === 'sim' ? 'Sim, enviada' : 'Não definida'],
            ].filter(([,v]) => v).map(([label, val]) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{val}</Text>
              </View>
            ))}
          </View>
        )}

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
                  {task.aprovacaoArquivos?.length > 0 && (() => {
                    const fotos = task.aprovacaoArquivos.filter(f => isImageFile(f.nome));
                    const outros = task.aprovacaoArquivos.filter(f => !isImageFile(f.nome));
                    return (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                        {fotos.map((f, i) => (
                          <TouchableOpacity key={`foto-${i}`} onPress={() => setFotoAmpliada({ fotos: fotos.map(x => x.url), idx: i })}>
                            <Image source={{ uri: f.url }} style={styles.aprovThumb} />
                          </TouchableOpacity>
                        ))}
                        {outros.map((f, i) => (
                          <TouchableOpacity key={`arq-${i}`} onPress={() => Linking.openURL(f.url)}
                            style={styles.fileBtn}>
                            <Text style={styles.fileBtnText}>📎 {f.nome}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    );
                  })()}
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
            <View style={{ marginTop: 8, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, color: '#475569' }}>Subtotal serviços</Text>
                <Text style={{ fontSize: 12, color: '#475569' }}>R$ {parseFloat(orcamento.subtotalFornecedores || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text>
              </View>
              {orcamento.valorFee > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>Taxa de serviço ({orcamento.pctFee}%)</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>R$ {parseFloat(orcamento.valorFee).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text>
                </View>
              )}
              {orcamento.valorImpostos > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>Impostos ({orcamento.pctImpostos}%)</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>R$ {parseFloat(orcamento.valorImpostos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text>
                </View>
              )}
            </View>
            <View style={styles.orcTotal}>
              <Text style={styles.orcTotalLabel}>Total</Text>
              <Text style={styles.orcTotalVal}>R$ {parseFloat(orcamento.total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</Text>
            </View>
            <Text style={styles.orcObs}>* Valores de referência.</Text>
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

        {/* Etapas do Evento — linha do tempo com fotos (só leitura no celular) */}
        {/* Só aparece depois que a proposta foi aprovada. */}
        {(project.etapasProjeto || []).length > 0 && !['analyzing', 'pendingApproval', 'rejected'].includes(project.status) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Etapas do Evento</Text>
            {project.etapasProjeto.map((etapa, i) => {
              const fotosEtapa = etapaFotos.filter(f => f.etapaId === etapa.id);
              const temFoto = fotosEtapa.length > 0;
              return (
                <View key={etapa.id} style={styles.etapaRow}>
                  <View style={styles.etapaLinhaCol}>
                    <View style={[styles.etapaDot, temFoto && styles.etapaDotAtivo]} />
                    {i < project.etapasProjeto.length - 1 && <View style={styles.etapaLinha} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 16 }}>
                    <Text style={styles.etapaNome}>{etapa.nome}</Text>
                    {!temFoto ? (
                      <Text style={styles.etapaSemFoto}>Nenhuma foto ainda.</Text>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                        {fotosEtapa.map((f, idx) => (
                          <TouchableOpacity key={f.id} onPress={() => setFotoAmpliada({ fotos: fotosEtapa.map(x => x.url), idx })}>
                            <Image source={{ uri: f.url }} style={styles.aprovThumb} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Demandas abertas — pedido formal mediado pelo Coordenador */}
        {demandasAbertas.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📋 Demandas</Text>
            {demandasAbertas.map(d => (
              <TouchableOpacity key={d.id} onPress={() => setDemandaAberta(d)} style={styles.demandaRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskName}>{d.taskNome || 'Tarefa'}</Text>
                  {d.ultimaMsg && <Text style={styles.taskSub}>{d.ultimaMsg}</Text>}
                </View>
                {(d.naoLidasCliente || 0) > 0 && (
                  <View style={styles.demandaBadge}>
                    <Text style={styles.demandaBadgeText}>{d.naoLidasCliente > 9 ? '9+' : d.naoLidasCliente}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Demanda — thread de mensagens em tela cheia */}
      <Modal visible={!!demandaAberta} animationType="slide" onRequestClose={() => setDemandaAberta(null)}>
        {demandaAberta && (
          <DemandaPanelMobile
            demanda={demandaAberta}
            budgetId={budgetId}
            coordenadorId={project.assignedTo}
            userData={user}
            onClose={() => setDemandaAberta(null)}
          />
        )}
      </Modal>

      {/* Visualizador de foto em tela cheia */}
      <Modal visible={!!fotoAmpliada} transparent animationType="fade" onRequestClose={() => setFotoAmpliada(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada && (
            <>
              <Image source={{ uri: fotoAmpliada.fotos[fotoAmpliada.idx] }} style={styles.modalImage} resizeMode="contain" />
              {fotoAmpliada.fotos.length > 1 && (
                <View style={styles.modalNav}>
                  <TouchableOpacity onPress={() => setFotoAmpliada(f => ({ ...f, idx: (f.idx - 1 + f.fotos.length) % f.fotos.length }))} style={styles.modalNavBtn}>
                    <Text style={styles.modalNavText}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalNavCount}>{fotoAmpliada.idx + 1} / {fotoAmpliada.fotos.length}</Text>
                  <TouchableOpacity onPress={() => setFotoAmpliada(f => ({ ...f, idx: (f.idx + 1) % f.fotos.length }))} style={styles.modalNavBtn}>
                    <Text style={styles.modalNavText}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ccd4ea' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ccd4ea' },
  errorText: { color: '#475569', fontSize: 14, marginBottom: 16 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingBottom: 14, paddingHorizontal: 20,
    backgroundColor: '#0A1628',
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,180,255,0.1)',
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn: { padding: 6 },
  backText: { color: '#7BAFD4', fontSize: 20 },
  backBtnLarge: { marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#475569' },
  backBtnText: { color: '#475569', fontSize: 14 },
  headerCenter: { flex: 1, gap: 4 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#E8F4FF' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1 },
  card: { backgroundColor: '#e3eafa', borderRadius: 14, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: '#1e293b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(61,76,107,0.15)', textAlign: 'center' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(61,76,107,0.1)' },
  infoLabel: { fontSize: 12, color: '#475569' },
  infoValue: { fontSize: 12, color: '#1e293b', fontWeight: '600', flex: 1, textAlign: 'right' },
  // Aprovações
  aprovCard: { borderRadius: 10, borderWidth: 1, backgroundColor: 'white', padding: 12, marginBottom: 10 },
  aprovTipo: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  aprovNome: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  aprovSupplier: { fontSize: 11, color: '#475569', marginBottom: 4 },
  aprovObs: { fontSize: 12, color: '#475569', marginBottom: 8, fontStyle: 'italic' },
  fileBtn: { padding: '6px 12px', borderRadius: 6, backgroundColor: 'rgba(102,126,234,0.1)', borderWidth: 1, borderColor: 'rgba(102,126,234,0.3)', marginRight: 8 },
  fileBtnText: { fontSize: 12, color: '#667eea' },
  aprovThumb: { width: 72, height: 72, borderRadius: 8, marginRight: 8, backgroundColor: 'rgba(0,0,0,0.06)' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalImage: { width: '92%', height: '75%' },
  modalNav: { position: 'absolute', bottom: 40, flexDirection: 'row', alignItems: 'center', gap: 20 },
  modalNavBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  modalNavText: { color: 'white', fontSize: 32, fontWeight: '300' },
  modalNavCount: { color: 'white', fontSize: 13 },
  aprovBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  // Orçamento
  orcItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(61,76,107,0.1)' },
  orcItemName: { fontSize: 13, color: '#1e293b', fontWeight: '600' },
  orcItemSub: { fontSize: 11, color: '#475569', marginTop: 2 },
  orcItemVal: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  orcTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,128,255,0.25)' },
  orcTotalLabel: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  orcTotalVal: { fontSize: 22, fontWeight: '700', color: '#0080FF' },
  orcObs: { fontSize: 11, color: '#64748b', marginTop: 10, lineHeight: 16 },
  orcBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnRecusar: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', alignItems: 'center' },
  btnRecusarText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  btnAprovar: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  btnAprovarOrc: { flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: '#0080FF', alignItems: 'center' },
  btnAprovarText: { color: 'white', fontSize: 13, fontWeight: '700' },
  // Tasks
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(61,76,107,0.1)' },
  taskDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  taskName: { fontSize: 13, color: '#1e293b', fontWeight: '600' },
  taskSub: { fontSize: 11, color: '#475569', marginTop: 1 },
  taskDate: { fontSize: 10, color: '#475569', marginTop: 2 },
  taskStatus: { fontSize: 10, fontWeight: '700' },
  neutralText: { fontSize: 13, color: '#475569', lineHeight: 20, textAlign: 'center', paddingVertical: 8 },
  // Etapas
  etapaRow: { flexDirection: 'row' },
  etapaLinhaCol: { alignItems: 'center', width: 20 },
  etapaDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'white', borderWidth: 2, borderColor: 'rgba(61,76,107,0.35)' },
  etapaDotAtivo: { backgroundColor: '#00b894', borderColor: '#00b894' },
  etapaLinha: { flex: 1, width: 2, backgroundColor: 'rgba(61,76,107,0.15)', marginTop: 2 },
  etapaNome: { fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  etapaSemFoto: { fontSize: 11, color: '#64748b' },
  // Demandas
  demandaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(61,76,107,0.1)' },
  demandaBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  demandaBadgeText: { fontSize: 10, fontWeight: '700', color: 'white' },
});
