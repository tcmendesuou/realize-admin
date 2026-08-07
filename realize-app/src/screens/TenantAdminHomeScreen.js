import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Modal, Image, Platform,
} from 'react-native';
import {
  collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { criarTasksParaFornecedores } from './aprovacaoOrcamento';

const formatBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (ts) => ts?.toDate ? ts.toDate().toLocaleDateString('pt-BR') : '';

const TABS = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'acao', label: 'Ação Pendente' },
  { id: 'franqueados', label: 'Colaboradores' },
  { id: 'unidades', label: 'Unidades' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'verbas', label: 'Verbas' },
  { id: 'marketing', label: 'Marketing' },
];

export default function TenantAdminHomeScreen({ navigation }) {
  const [userData, setUserData]   = useState(null);
  const [tenantData, setTenantData] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('overview');

  const [franqueados, setFranqueados] = useState([]);
  const [unidades, setUnidades]       = useState([]);
  const [eventos, setEventos]         = useState([]);
  const [campanhas, setCampanhas]     = useState([]);
  const [cargosCliente, setCargosCliente] = useState([]);

  const [processando, setProcessando] = useState(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const userStr = await AsyncStorage.getItem('loggedUser');
    if (!userStr) { navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); return; }
    const user = JSON.parse(userStr);
    setUserData(user);
    const tenantStr = await AsyncStorage.getItem('tenantData');
    const tenant = tenantStr ? JSON.parse(tenantStr) : null;
    setTenantData(tenant);
    if (user.tenantId) await carregarTudo(user.tenantId);
    setLoading(false);
  };

  const carregarTudo = async (tenantId) => {
    try {
      const [fSnap, uSnap, cSnap, campSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId), where('systemRole', '==', 'cliente'))),
        getDocs(collection(db, 'tenants', tenantId, 'unidades')),
        getDocs(collection(db, 'cargos')),
        getDocs(collection(db, 'tenants', tenantId, 'campanhas')),
      ]);
      setFranqueados(fSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUnidades(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCargosCliente(cSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.tipoConta === 'cliente'));
      setCampanhas(campSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const evSnap = await getDocs(query(collection(db, 'budgets'), where('tenantId', '==', tenantId)));
      setEventos(evSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) {}
    await AsyncStorage.multiRemove(['loggedUser', 'tenantData']);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const unidadeDe = (f) => {
    const u = unidades.find(x => x.id === f?.unidadeId);
    return { nome: u?.nome || f?.unidade || '', cidade: u?.cidade || f?.cidade || '' };
  };

  const eventosAguardandoAdmin = eventos.filter(e => e.status === 'pendingAdminApproval');
  const totalEventos  = eventos.length;
  const eventosAtivos = eventos.filter(e => !['completed', 'rejected'].includes(e.status)).length;
  const eventosAcontecendo = eventos.filter(e => e.workspaceStage === 'Acontecendo').length;
  const unidadesAtivas = unidades.filter(u => u.ativo !== false).length;
  const totalGasto = eventos.reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);

  const handleAprovarComoAdmin = async (ev) => {
    Alert.alert('Aprovar orçamento', `Aprovar o orçamento de "${ev.eventName || 'Sem nome'}"? Isso libera as tarefas pros fornecedores.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aprovar', onPress: async () => {
        setProcessando(ev.id);
        try {
          await updateDoc(doc(db, 'budgets', ev.id), {
            status: 'approved', approvedByAdminAt: serverTimestamp(), updatedAt: serverTimestamp(),
            timeline: [...(ev.timeline || []), { action: 'approved_by_admin', description: `Orçamento aprovado pelo Admin (${userData?.name || 'Admin'}, app)`, timestamp: new Date() }],
          });
          await criarTasksParaFornecedores(ev);
          setEventos(prev => prev.map(e => e.id === ev.id ? { ...e, status: 'approved' } : e));
        } catch (e) { console.error(e); Alert.alert('Erro', e.message || 'Não foi possível aprovar.'); }
        finally { setProcessando(null); }
      }},
    ]);
  };

  const handleRecusarComoAdmin = async (ev) => {
    Alert.alert('Recusar orçamento', `Recusar o orçamento de "${ev.eventName || 'Sem nome'}"? Ele volta pra unidade poder ajustar.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Recusar', style: 'destructive', onPress: async () => {
        setProcessando(ev.id);
        try {
          await updateDoc(doc(db, 'budgets', ev.id), {
            status: 'pendingApproval', updatedAt: serverTimestamp(),
            timeline: [...(ev.timeline || []), { action: 'rejected_by_admin', description: `Orçamento recusado pelo Admin (${userData?.name || 'Admin'}, app) — voltou pra unidade`, timestamp: new Date() }],
          });
          setEventos(prev => prev.map(e => e.id === ev.id ? { ...e, status: 'pendingApproval' } : e));
        } catch (e) { console.error(e); Alert.alert('Erro', 'Não foi possível recusar.'); }
        finally { setProcessando(null); }
      }},
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0080FF" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}><Text style={styles.logoutText}>Sair</Text></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerName}>{userData?.name}</Text>
          <Text style={styles.headerSub}>{tenantData?.nome}{userData?.roleName ? ` · ${userData.roleName}` : ''}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} onPress={() => setView(t.id)} style={[styles.tabBtn, view === t.id && styles.tabBtnAtivo]}>
            <Text style={[styles.tabText, view === t.id && styles.tabTextAtivo]}>
              {t.label}{t.id === 'acao' && eventosAguardandoAdmin.length > 0 ? ` (${eventosAguardandoAdmin.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {view === 'overview' && (
          <View style={styles.grid}>
            {[
              { label: 'Colaboradores', value: franqueados.length, cor: '#0080FF' },
              { label: 'Unidades ativas', value: unidadesAtivas, cor: '#AB47BC' },
              { label: 'Eventos ativos', value: eventosAtivos, cor: '#0080FF' },
              { label: 'Eventos acontecendo', value: eventosAcontecendo, cor: '#FFA726' },
              { label: 'Total de eventos', value: totalEventos, cor: '#667eea' },
              { label: 'Verba utilizada', value: formatBRL(totalGasto), cor: '#66BB6A' },
            ].map((m, i) => (
              <View key={i} style={styles.statCard}>
                <Text style={[styles.statValue, { color: m.cor }]}>{m.value}</Text>
                <Text style={styles.statLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        )}

        {view === 'acao' && (
          <View>
            <Text style={styles.sectionSub}>Orçamentos já aprovados pela unidade, aguardando sua aprovação final.</Text>
            {eventosAguardandoAdmin.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum orçamento aguardando aprovação no momento.</Text>
            ) : eventosAguardandoAdmin.map(ev => {
              const franq = franqueados.find(f => f.id === ev.clientUserId);
              return (
                <View key={ev.id} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>{ev.eventName || 'Sem nome'}</Text>
                  <Text style={styles.rowSub}>Pedido por {franq?.name || ev.clientName} {unidadeDe(franq).nome ? `· ${unidadeDe(franq).nome}` : ''}</Text>
                  <Text style={styles.rowSub}>
                    {ev.startDate ? new Date(ev.startDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    {ev.endDate && ev.endDate !== ev.startDate ? ` → ${new Date(ev.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                  </Text>
                  <Text style={styles.rowValor}>{formatBRL(ev.orcamentoFinal?.total)}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <TouchableOpacity onPress={() => handleRecusarComoAdmin(ev)} disabled={processando === ev.id} style={styles.btnRecusar}>
                      <Text style={styles.btnRecusarText}>Recusar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleAprovarComoAdmin(ev)} disabled={processando === ev.id} style={styles.btnAprovar}>
                      {processando === ev.id ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.btnAprovarText}>✓ Aprovar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {view === 'franqueados' && (
          <View>
            {franqueados.length === 0 ? <Text style={styles.emptyText}>Nenhum colaborador cadastrado ainda.</Text> : franqueados.map(f => (
              <View key={f.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{f.name}</Text>
                <Text style={styles.rowSub}>{f.email}</Text>
                <Text style={styles.rowSub}>{unidadeDe(f).nome ? `${unidadeDe(f).nome} · ` : ''}{f.roleName || ''}</Text>
                {f.active === false && <Text style={styles.badgeInativo}>INATIVO</Text>}
              </View>
            ))}
          </View>
        )}

        {view === 'unidades' && (
          <View>
            {unidades.length === 0 ? <Text style={styles.emptyText}>Nenhuma unidade cadastrada ainda.</Text> : unidades.map(u => (
              <View key={u.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{u.nome}{u.cidade ? ` — ${u.cidade}` : ''}</Text>
                <Text style={styles.rowSub}>Verba: {formatBRL(u.saldoVerba || 0)}{u.periodoUso ? ` · ${u.periodoUso}` : ''}</Text>
                {u.ativo === false && <Text style={styles.badgeInativo}>INATIVA</Text>}
              </View>
            ))}
          </View>
        )}

        {view === 'eventos' && (
          <View>
            {eventos.length === 0 ? <Text style={styles.emptyText}>Nenhum evento ainda.</Text> : eventos.map(ev => {
              const franq = franqueados.find(f => f.id === ev.clientUserId);
              return (
                <View key={ev.id} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>{ev.eventName || 'Sem nome'}</Text>
                  <Text style={styles.rowSub}>{franq?.name || ev.clientName} · {formatDate(ev.createdAt)}</Text>
                  <Text style={styles.rowValor}>{formatBRL(ev.orcamentoFinal?.total)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {view === 'verbas' && (
          <View>
            {unidades.map(u => (
              <View key={u.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{u.nome}</Text>
                <Text style={styles.rowSub}>Saldo: {formatBRL(u.saldoVerba || 0)}</Text>
              </View>
            ))}
            <Text style={styles.hintText}>Pra atribuir ou ajustar verba, use a versão web por enquanto.</Text>
          </View>
        )}

        {view === 'marketing' && (
          <View>
            {campanhas.length === 0 ? <Text style={styles.emptyText}>Nenhuma campanha criada ainda.</Text> : campanhas.map(c => (
              <View key={c.id} style={styles.rowCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.rowTitle}>{c.nome}</Text>
                  <Text style={[styles.badgeAtiva, { color: c.ativa ? '#16a34a' : '#64748b' }]}>{c.ativa ? 'ATIVA' : 'INATIVA'}</Text>
                </View>
                {c.arquivos?.filter(a => a.tipo === 'foto').length > 0 && (
                  <ScrollView horizontal style={{ marginTop: 8 }} showsHorizontalScrollIndicator={false}>
                    {c.arquivos.filter(a => a.tipo === 'foto').map((a, i) => (
                      <Image key={i} source={{ uri: a.url }} style={styles.campFoto} />
                    ))}
                  </ScrollView>
                )}
              </View>
            ))}
            <Text style={styles.hintText}>Pra criar campanha ou subir arquivos, use a versão web por enquanto.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ccd4ea' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ccd4ea' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 40, paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#0A1628',
  },
  logoutBtn: { width: 40 },
  logoutText: { color: '#ef4444', fontSize: 13 },
  headerName: { fontSize: 16, fontWeight: '700', color: '#E8F4FF' },
  headerSub: { fontSize: 11, color: '#7BAFD4', marginTop: 2 },
  tabsBar: { backgroundColor: '#0A1628', paddingBottom: 10, flexGrow: 0 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  tabBtnAtivo: { backgroundColor: '#0080FF' },
  tabText: { fontSize: 12, color: '#7BAFD4', fontWeight: '600' },
  tabTextAtivo: { color: 'white' },
  content: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  statCard: { width: '31%', backgroundColor: '#e3eafa', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10, color: '#475569', textAlign: 'center', marginTop: 4 },
  sectionSub: { fontSize: 12, color: '#475569', marginBottom: 14 },
  emptyText: { textAlign: 'center', color: '#475569', fontSize: 13, paddingVertical: 30 },
  hintText: { textAlign: 'center', color: '#7481a3', fontSize: 11, marginTop: 12, fontStyle: 'italic' },
  rowCard: { backgroundColor: '#e3eafa', borderRadius: 12, padding: 14, marginBottom: 10 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  rowSub: { fontSize: 12, color: '#475569', marginTop: 2 },
  rowValor: { fontSize: 15, fontWeight: '700', color: '#00b894', marginTop: 6 },
  badgeInativo: { fontSize: 9, fontWeight: '700', color: '#ef4444', marginTop: 6 },
  badgeAtiva: { fontSize: 9, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  campFoto: { width: 64, height: 64, borderRadius: 8, marginRight: 6 },
  btnRecusar: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', alignItems: 'center' },
  btnRecusarText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  btnAprovar: { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: '#0080FF', alignItems: 'center' },
  btnAprovarText: { color: 'white', fontSize: 13, fontWeight: '700' },
});
