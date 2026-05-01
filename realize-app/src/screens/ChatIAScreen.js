import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://www.realizehub.com.br/api/chat';

export default function ChatIAScreen({ navigation }) {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [user, setUser]           = useState(null);
  const [systemScript, setSystemScript] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    loadUser();
    loadScript();
  }, []);

  useEffect(() => {
    if (systemScript && messages.length === 0) {
      sendToIA('', true); // dispara mensagem inicial da IA
    }
  }, [systemScript]);

  const loadUser = async () => {
    const str = await AsyncStorage.getItem('loggedUser');
    if (str) setUser(JSON.parse(str));
  };

  const loadScript = async () => {
    try {
      const snap = await getDocs(collection(db, 'config'));
      const scriptDoc = snap.docs.find(d => d.id === 'aiScript');
      if (scriptDoc) setSystemScript(scriptDoc.data().content || '');
    } catch (e) { console.error(e); }
  };

  const sendToIA = async (userMessage, isInit = false) => {
    if (!userMessage.trim() && !isInit) return;
    setLoading(true);

    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const systemPrompt = `HOJE É: ${hoje}. Use sempre o ano correto (${new Date().getFullYear()}).\n\n` + systemScript;

    const newMessages = isInit ? [] : [...messages, { role: 'user', content: userMessage }];
    if (!isInit) setMessages(newMessages);

    const history = isInit
      ? [{ role: 'user', content: 'Olá, quero iniciar um novo evento.' }]
      : newMessages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: history,
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

      const assistantMsg = { role: 'assistant', content: text };
      setMessages(prev => [...(isInit ? [] : newMessages), assistantMsg]);

      // Verifica se tem JSON de briefing na resposta
      const jsonMatch = text.match(/```json([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const briefingJson = JSON.parse(jsonMatch[1].trim());
          if (briefingJson.evento || briefingJson.servicosNecessarios) {
            await salvarBriefing(briefingJson, [...(isInit ? [] : newMessages), assistantMsg]);
          }
        } catch (e) { /* JSON inválido, ignora */ }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível conectar com a IA. Tente novamente.');
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const salvarBriefing = async (briefingJson, chatMessages) => {
    if (!user) return;
    try {
      // Verifica se já existe budget para esse chat
      const existing = await getDocs(query(
        collection(db, 'budgets'),
        where('clientUserId', '==', user.id),
        where('status', '==', 'chatting')
      ));

      const budgetData = {
        clientUserId:   user.id,
        clientEmail:    user.email,
        clientName:     user.name,
        briefingData:   briefingJson,
        eventName:      briefingJson.evento?.nome || briefingJson.evento?.tipo || 'Novo Evento',
        eventTypeName:  briefingJson.evento?.tipo || 'Evento',
        status:         'analyzing',
        workspaceStage: 'Propostas',
        isMae:          true,
        chatHistory:    chatMessages.slice(-20),
        updatedAt:      serverTimestamp(),
      };

      if (!existing.empty) {
        await updateDoc(doc(db, 'budgets', existing.docs[0].id), budgetData);
      } else {
        await addDoc(collection(db, 'budgets'), {
          ...budgetData,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error('Erro ao salvar briefing:', e); }
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    sendToIA(msg);
  };

  const renderMessage = (msg, i) => {
    const isUser = msg.role === 'user';
    // Remove blocos de JSON da exibição
    const text = msg.content.replace(/```json[\s\S]*?```/g, '📋 Resumo do briefing gerado').trim();
    return (
      <View key={i} style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>R</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleIA]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{text}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Chat com a Realize</Text>
          <Text style={styles.headerSub}>Assistente de eventos</Text>
        </View>
      </View>

      {/* Mensagens */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && loading && (
          <View style={styles.msgRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>R</Text></View>
            <View style={styles.bubbleIA}>
              <ActivityIndicator size="small" color="#00E5C4" />
            </View>
          </View>
        )}
        {messages.map(renderMessage)}
        {loading && messages.length > 0 && (
          <View style={styles.msgRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>R</Text></View>
            <View style={[styles.bubbleIA, { paddingVertical: 14 }]}>
              <ActivityIndicator size="small" color="#00E5C4" />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Digite sua mensagem..."
          placeholderTextColor="rgba(123,175,212,0.4)"
          multiline
          maxLength={1000}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={loading || !input.trim()}
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: '#0A1628',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,180,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: '#7BAFD4', fontSize: 14 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#E8F4FF' },
  headerSub: { fontSize: 11, color: '#7BAFD4', marginTop: 1 },
  messages: { flex: 1 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14, gap: 8 },
  msgRowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,229,196,0.15)',
    borderWidth: 1, borderColor: 'rgba(0,229,196,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#00E5C4', fontSize: 13, fontWeight: '700' },
  bubble: {
    maxWidth: '78%', borderRadius: 16, padding: 12,
  },
  bubbleIA: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(0,180,255,0.1)',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: 'rgba(0,128,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(0,128,255,0.3)',
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, color: '#E8F4FF', lineHeight: 20 },
  bubbleTextUser: { color: '#E8F4FF' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#0A1628',
    borderTopWidth: 1, borderTopColor: 'rgba(0,180,255,0.1)',
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(0,180,255,0.2)',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    color: '#E8F4FF', fontSize: 14,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,229,196,0.8)',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  sendIcon: { color: 'white', fontSize: 20, fontWeight: '700' },
});
