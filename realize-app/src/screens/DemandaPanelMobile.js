import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import {
  collection, addDoc, onSnapshot, query, orderBy,
  updateDoc, doc, serverTimestamp, increment,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { db } from '../firebase/config';

// ─────────────────────────────────────────────────────────────────────────────
// DemandaPanelMobile — versão Cliente da Demanda no celular. Mesmas regras da
// web: mensagem do Coordenador é liberada na hora; mensagem do Cliente nasce
// "aguardando liberação" — só o Coordenador vê até decidir liberar pro
// Fornecedor. Requer expo-image-picker (se ainda não estiver no projeto,
// rodar: npx expo install expo-image-picker).
// ─────────────────────────────────────────────────────────────────────────────
export default function DemandaPanelMobile({ demanda, budgetId, coordenadorId, userData, onClose }) {
  const [msgs, setMsgs]         = useState([]);
  const [input, setInput]       = useState('');
  const [imagens, setImagens]   = useState([]); // uris locais escolhidas, ainda não enviadas
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!demanda?.id) return;
    const unsub = onSnapshot(
      query(collection(db, 'demandas', demanda.id, 'msgs'), orderBy('createdAt', 'asc')),
      snap => setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [demanda?.id]);

  useEffect(() => {
    if ((demanda?.naoLidasCliente || 0) > 0) {
      updateDoc(doc(db, 'demandas', demanda.id), { naoLidasCliente: 0 }).catch(() => {});
    }
  }, [demanda?.id]);

  const msgsVisiveis = msgs.filter(m => {
    if (m.senderRole === 'coordenador') return true;
    if (m.senderId === userData?.id) return true;
    return m.liberada === true;
  });

  const escolherImagens = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      setImagens(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  };

  const enviar = async () => {
    const texto = input.trim();
    if (!texto && imagens.length === 0) return;
    if (enviando) return;
    setEnviando(true);
    try {
      const anexos = [];
      if (imagens.length > 0) {
        const storage = getStorage();
        for (const uri of imagens) {
          const resp = await fetch(uri);
          const blob = await resp.blob();
          const nome = uri.split('/').pop() || `foto_${Date.now()}.jpg`;
          const storageRef = ref(storage, `demandas/${demanda.id}/${Date.now()}_${nome}`);
          await uploadBytes(storageRef, blob);
          const url = await getDownloadURL(storageRef);
          anexos.push({ nome, url });
        }
      }

      await addDoc(collection(db, 'demandas', demanda.id, 'msgs'), {
        text: texto,
        anexos,
        senderId: userData?.id, senderName: userData?.name || 'Cliente', senderRole: 'cliente',
        liberada: false,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'demandas', demanda.id), {
        updatedAt: serverTimestamp(),
        ultimaMsg: (texto || '📎 Anexo').slice(0, 60),
        naoLidasCoordenador: increment(1),
      });

      try {
        if (coordenadorId) {
          await addDoc(collection(db, 'notificacoes', coordenadorId, 'items'), {
            titulo: 'Nova Demanda aguardando você',
            mensagem: `${userData?.name || 'Cliente'} respondeu sobre "${demanda.taskNome || 'uma tarefa'}".`,
            tipo: 'acao',
            budgetId,
            lida: false,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) { console.error('notif demanda mobile:', e); }

      setInput(''); setImagens([]);
    } catch (e) { console.error(e); }
    finally { setEnviando(false); }
  };

  const formatTime = (ts) => ts?.toDate ? ts.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const corLado = { fornecedor: '#FFA726', cliente: '#0080FF', coordenador: '#667eea' };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>📋 Demanda</Text>
          {demanda?.taskNome && <Text style={styles.headerSub}>{demanda.taskNome}</Text>}
        </View>
        <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={styles.msgs} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {msgsVisiveis.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma mensagem visível ainda.</Text>
        ) : msgsVisiveis.map(m => {
          const isMine = m.senderId === userData?.id;
          const cor = corLado[m.senderRole] || '#7BAFD4';
          return (
            <View key={m.id} style={{ alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
              {!isMine && <Text style={[styles.senderName, { color: cor }]}>{m.senderName} · {m.senderRole}</Text>}
              <View style={[styles.bubble, { backgroundColor: isMine ? cor : 'rgba(255,255,255,0.06)' }]}>
                {!!m.text && <Text style={[styles.bubbleText, { color: isMine ? '#0D1B2A' : '#E8F4FF' }]}>{m.text}</Text>}
                {m.anexos?.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: m.text ? 6 : 0 }}>
                    {m.anexos.map((a, i) => (
                      <Image key={i} source={{ uri: a.url }} style={styles.anexoThumb} />
                    ))}
                  </ScrollView>
                )}
              </View>
              {!isMine && m.senderRole !== 'coordenador' && m.liberada && (
                <Text style={styles.liberadaTag}>liberado pelo coordenador</Text>
              )}
              <Text style={styles.timeText}>{formatTime(m.createdAt)}</Text>
            </View>
          );
        })}
      </ScrollView>

      {imagens.length > 0 && (
        <ScrollView horizontal style={styles.imagensPendentes} showsHorizontalScrollIndicator={false}>
          {imagens.map((uri, i) => (
            <View key={i} style={{ marginRight: 8 }}>
              <Image source={{ uri }} style={styles.imagemPendente} />
              <TouchableOpacity onPress={() => setImagens(prev => prev.filter((_, idx) => idx !== i))} style={styles.removerImagem}>
                <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        <TouchableOpacity onPress={escolherImagens} style={styles.anexarBtn}>
          <Text style={{ fontSize: 20 }}>📎</Text>
        </TouchableOpacity>
        <TextInput
          value={input} onChangeText={setInput}
          placeholder={demanda?.id ? 'Digite uma mensagem...' : 'Descreva o pedido...'}
          placeholderTextColor="rgba(123,175,212,0.5)"
          style={styles.input}
          multiline
        />
        <TouchableOpacity onPress={enviar} disabled={(!input.trim() && imagens.length === 0) || enviando} style={[styles.sendBtn, ((!input.trim() && imagens.length === 0) || enviando) && { opacity: 0.5 }]}>
          {enviando ? <ActivityIndicator size="small" color="#0D1B2A" /> : <Text style={styles.sendBtnText}>↑</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingBottom: 14, paddingHorizontal: 20,
    borderBottomWidth: 3, borderBottomColor: '#667eea',
    backgroundColor: '#0A1628',
  },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#E8F4FF' },
  headerSub: { fontSize: 12, color: '#667eea', marginTop: 2 },
  closeBtn: { fontSize: 22, color: '#7BAFD4' },
  msgs: { flex: 1, padding: 16 },
  emptyText: { textAlign: 'center', color: 'rgba(123,175,212,0.5)', fontSize: 13, marginTop: 40 },
  senderName: { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  bubble: { maxWidth: '82%', padding: 10, borderRadius: 14 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  anexoThumb: { width: 90, height: 90, borderRadius: 8, marginRight: 6, backgroundColor: 'rgba(0,0,0,0.2)' },
  liberadaTag: { fontSize: 10, color: 'rgba(16,185,129,0.8)', marginTop: 3 },
  timeText: { fontSize: 10, color: 'rgba(123,175,212,0.4)', marginTop: 3 },
  imagensPendentes: { paddingHorizontal: 12, paddingTop: 8 },
  imagemPendente: { width: 60, height: 60, borderRadius: 8 },
  removerImagem: { position: 'absolute', top: -6, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,180,255,0.1)',
    backgroundColor: '#0A1628',
  },
  anexarBtn: { padding: 6 },
  input: {
    flex: 1, maxHeight: 100, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(102,126,234,0.3)',
    backgroundColor: 'rgba(255,255,255,0.04)', color: '#E8F4FF', fontSize: 14,
  },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#667eea', alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: 'white', fontSize: 18, fontWeight: '700' },
});
