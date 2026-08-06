import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePermissoes } from '../hooks/usePermissoes';

const STATUS_CONFIG = {
  analyzing:       { label: 'Em Análise',           color: '#FFA726' },
  pendingApproval: { label: 'Orçamento disponível', color: '#0080FF' },
  approved:        { label: 'Aprovado',             color: '#00E5C4' },
  inProgress:      { label: 'Em andamento',         color: '#0080FF' },
  completed:       { label: 'Concluído',            color: '#66BB6A' },
  rejected:        { label: 'Cancelado',            color: '#EF5350' },
};

// ─────────────────────────────────────────────────────────────────────────────
// ClientHomeScreen — Fase 1 (reconstrução): Home do Cliente/Franqueado no
// celular. Mesma cara/estrutura do Workspace da web (ClienteHome.js) —
// header grande/centralizado, eventos ativos, permissão real do cargo.
//
// Escopo dessa fase: só Workspace (ver + criar evento). Histórico, Financeiro
// e Agenda ficam pra próxima leva. A visão "matriz vê tudo das unidades"
// também fica pra depois — por ora mostra só os eventos da própria pessoa.
// ─────────────────────────────────────────────────────────────────────────────
export default function ClientHomeScreen({ navigation }) {
  const [userData, setUserData]   = useState(null);
  const [tenantData, setTenantData] = useState(null);
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { pode, loadingCargo } = usePermissoes(userData);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const userStr = await AsyncStorage.getItem('loggedUser');
    if (!userStr) { navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); return; }
    const user = JSON.parse(userStr);
    setUserData(user);

    const tenantStr = await AsyncStorage.getItem('tenantData');
    if (tenantStr) setTenantData(JSON.parse(tenantStr));

    await carregarEventos(user);
  };

  const carregarEventos = async (user) => {
    try {
      const q = query(collection(db, 'budgets'), where('clientUserId', '==', user.uid || user.id));
      const snap = await getDocs(q);
      const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => e.isMae !== false)
        .filter(e => e.status !== 'completed' && e.status !== 'rejected')
        .sort((a, b) => {
          const dA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
          const dB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
          return dB - dA;
        });
      setEvents(lista);
    } catch (e) {
      console.error('Erro ao carregar eventos:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (userData) carregarEventos(userData);
  }, [userData]);

  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) { /* já pode estar deslogado */ }
    await AsyncStorage.multiRemove(['loggedUser', 'tenantData']);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const getProjectName = (e) => e.eventName || e.briefingData?.evento?.nome || e.eventTypeName || 'Evento';
  const formatDate = (ts) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('pt-BR');
  };

  if (loading || loadingCargo) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00E5C4" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  const empresa = tenantData?.nome || userData?.companyName || '';
  const cargo = userData?.roleName || '';

  return (
    <View style={styles.container}>
      {/* Header — nome grande e centralizado, igual a web */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.userName}>{userData?.name}</Text>
          <Text style={styles.userMeta}>
            {empresa}{empresa && cargo ? ' · ' : ''}{cargo}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5C4" />}
      >
        <View style={styles.centralizado}>
          {pode('meus_eventos', 'C') && (
            <TouchableOpacity style={styles.newButton} onPress={() => navigation.navigate('ChatIA')}>
              <Text style={styles.newButtonText}>+ Novo Evento</Text>
            </TouchableOpacity>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workspace</Text>
            <Text style={styles.sectionSubtitle}>{events.length} evento(s) ativo(s)</Text>

            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>Nenhum evento ainda</Text>
                <Text style={styles.emptyText}>Toque em "+ Novo Evento" para começar</Text>
              </View>
            ) : (
              events.map(ev => {
                const st = STATUS_CONFIG[ev.status] || { label: 'Aguardando', color: '#78909C' };
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={styles.card}
                    onPress={() => navigation.navigate('ProjectDetail', { budgetId: ev.id })}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{getProjectName(ev)}</Text>
                      <View style={[styles.badge, { backgroundColor: st.color }]}>
                        <Text style={styles.badgeText}>{st.label}</Text>
                      </View>
                    </View>
                    {ev.eventTypeName && <Text style={styles.cardSub}>{ev.eventTypeName}</Text>}
                    {ev.numeroPedido && <Text style={styles.cardNumber}>{ev.numeroPedido}</Text>}
                    <Text style={styles.cardDate}>Criado em {formatDate(ev.createdAt)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1626' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A1626' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#7BAFD4' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,180,255,0.08)',
  },
  headerCenter: { alignItems: 'center', flex: 1 },
  userName: { fontSize: 19, fontWeight: '600', color: '#E8F4FF' },
  userMeta: { fontSize: 12, color: '#7BAFD4', marginTop: 2 },
  logoutBtn: { padding: 6, width: 40 },
  logoutText: { color: '#EF5350', fontSize: 13 },

  content: { flex: 1, paddingHorizontal: 20 },
  contentInner: { alignItems: 'center' },
  centralizado: { width: '100%', maxWidth: 480 },

  newButton: {
    marginTop: 20, marginBottom: 8, borderRadius: 12, padding: 16, alignItems: 'center',
    backgroundColor: '#00E5C4',
  },
  newButtonText: { fontSize: 15, fontWeight: '700', color: '#0A1626' },

  section: { marginTop: 24, marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#E8F4FF' },
  sectionSubtitle: { fontSize: 13, color: '#7BAFD4', marginTop: 2, marginBottom: 14 },

  emptyState: {
    alignItems: 'center', padding: 40, backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,180,255,0.1)', borderStyle: 'dashed',
  },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#E8F4FF', marginBottom: 4 },
  emptyText: { fontSize: 13, color: '#7BAFD4', textAlign: 'center' },

  card: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(0,180,255,0.1)',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#E8F4FF', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700', color: 'white' },
  cardSub: { fontSize: 12, color: '#7BAFD4', marginBottom: 2 },
  cardNumber: { fontSize: 11, color: 'rgba(123,175,212,0.5)', marginBottom: 6 },
  cardDate: { fontSize: 11, color: 'rgba(123,175,212,0.5)' },
});
