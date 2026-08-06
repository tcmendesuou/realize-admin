import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// LoginScreen — Fase 1 (reconstrução): usa Firebase Auth de verdade (igual a
// web), em vez de comparar senha em texto puro direto no Firestore. Depois de
// autenticar, busca o documento em "users" pelo uid — não mais só por email
// com senha solta.
// ─────────────────────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const buscarUserDoc = async (uid, emailBusca) => {
    // Prioridade: acha pelo uid (identidade real do Firebase Auth). Só cai
    // pra busca por email se, por algum motivo, o campo uid ainda não
    // estiver gravado no documento (conta bem antiga).
    const porUid = await getDocs(query(collection(db, 'users'), where('uid', '==', uid)));
    if (!porUid.empty) return { id: porUid.docs[0].id, ...porUid.docs[0].data() };
    const porEmail = await getDocs(query(collection(db, 'users'), where('email', '==', emailBusca)));
    if (!porEmail.empty) return { id: porEmail.docs[0].id, ...porEmail.docs[0].data() };
    return null;
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Atenção', 'Preencha email e senha');
      return;
    }
    setLoading(true);
    try {
      const emailLimpo = email.trim().toLowerCase();
      const cred = await signInWithEmailAndPassword(auth, emailLimpo, password);
      const userDoc = await buscarUserDoc(cred.user.uid, emailLimpo);

      if (!userDoc) {
        Alert.alert('Erro', 'Não encontramos seu cadastro. Fale com o administrador.');
        setLoading(false);
        return;
      }
      if (userDoc.active === false) {
        Alert.alert('Acesso Negado', 'Seu usuário está inativo. Entre em contato com o administrador.');
        setLoading(false);
        return;
      }

      // Se o usuário for do tipo Cliente (empresa-mãe ou franqueado), busca
      // também os dados da Empresa (nome/logo) e — se tiver unidade — os
      // dados da própria unidade, pra já deixar tudo pronto pro Home.
      let tenantData = null;
      if (userDoc.tipoConta === 'cliente' && userDoc.tenantId) {
        try {
          const tenantSnap = await getDoc(doc(db, 'tenants', userDoc.tenantId));
          if (tenantSnap.exists()) tenantData = { id: tenantSnap.id, ...tenantSnap.data() };
        } catch (e) { console.error('Erro ao buscar empresa:', e); }
      }

      await AsyncStorage.setItem('loggedUser', JSON.stringify(userDoc));
      if (tenantData) await AsyncStorage.setItem('tenantData', JSON.stringify(tenantData));
      else await AsyncStorage.removeItem('tenantData');

      // Fase 1: só o fluxo de Cliente/Franqueado está pronto no celular.
      // Os outros perfis (Fornecedor, Realize) ainda vão pra tela antiga,
      // até serem reconstruídos nas próximas fases.
      if (userDoc.tipoConta === 'cliente' || userDoc.systemRole === 'cliente') {
        navigation.reset({ index: 0, routes: [{ name: 'ClientHome' }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'AtendimentoHome' }] });
      }
    } catch (error) {
      console.error('Erro no login:', error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        Alert.alert('Erro', 'Email ou senha incorretos.');
      } else {
        Alert.alert('Erro', 'Não foi possível fazer login. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.centralizado}>
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>realize<Text style={styles.logoAccent}>hub</Text></Text>
            <Text style={styles.tagline}>Gestão de Eventos</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Login</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="seu@email.com"
                placeholderTextColor="#95a5a6"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Senha</Text>
              <TextInput
                style={styles.input}
                placeholder="Digite sua senha"
                placeholderTextColor="#95a5a6"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#0A1626" /> : <Text style={styles.loginButtonText}>Entrar</Text>}
            </TouchableOpacity>

            <Text style={styles.helpText}>
              Não tem cadastro? Entre em contato com o administrador.
            </Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1626' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  centralizado: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 34, fontWeight: '300', color: '#E8F4FF', letterSpacing: 2 },
  logoAccent: { color: '#00E5C4', fontWeight: '600' },
  tagline: { fontSize: 14, color: '#7BAFD4', marginTop: 8, letterSpacing: 1 },
  form: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  formTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 24, textAlign: 'center' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  input: {
    backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12,
    padding: 16, fontSize: 16, color: '#1e293b',
  },
  loginButton: {
    backgroundColor: '#00E5C4', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 12,
    shadowColor: '#00E5C4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  loginButtonDisabled: { backgroundColor: '#94a3b8', shadowColor: '#000' },
  loginButtonText: { fontSize: 17, fontWeight: '700', color: '#0A1626' },
  helpText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 20 },
});
