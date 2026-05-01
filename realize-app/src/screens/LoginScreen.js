import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    // Validações
    if (!email.trim() || !password.trim()) {
      Alert.alert('Atenção', 'Preencha email e senha');
      return;
    }

    setLoading(true);

    try {
      // Buscar usuário no Firebase
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email.trim().toLowerCase()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        Alert.alert('Erro', 'Email não encontrado');
        setLoading(false);
        return;
      }

      const userData = snapshot.docs[0].data();
      const userId = snapshot.docs[0].id;

      // Verificar se usuário está ativo
      if (!userData.active) {
        Alert.alert('Acesso Negado', 'Seu usuário está inativo. Entre em contato com o administrador.');
        setLoading(false);
        return;
      }

      // Verificar senha (ATENÇÃO: Em produção, use hash!)
      if (userData.password !== password) {
        Alert.alert('Erro', 'Senha incorreta');
        setLoading(false);
        return;
      }

      // Salvar dados do usuário logado
      const loggedUser = {
        id: userId,
        name: userData.name,
        email: userData.email,
        userType: userData.systemRole,
        companyId: userData.companyId,
        companyName: userData.companyName,
        roleId: userData.roleId,
        roleName: userData.roleName,
        permissions: userData.permissions || {},
        projects: userData.projects || []
      };

      await AsyncStorage.setItem('loggedUser', JSON.stringify(loggedUser));

      // DEBUG: Ver o que está acontecendo
      console.log('==== LOGIN DEBUG ====');
      console.log('User Type:', userData.userType);
      console.log('User Type (tipo):', typeof userData.userType);
      console.log('É cliente?', userData.systemRole === 'cliente');
      console.log('====================');

      // Redirecionar baseado no tipo de usuário e cargo
      if (userData.systemRole === 'cliente') {
        // Cliente vai para ClientHome
        console.log('→ Redirecionando para ClientHome');
        navigation.reset({
          index: 0,
          routes: [{ name: 'ClientHome' }]
        });
      } else if (userData.systemRole === 'equipe' || userData.userTypeName === 'Equipe') {
        // Verificar se é Diretora ou Atendimento
        const cargo = userData.roleName?.toLowerCase() || '';
        
        if (cargo.includes('diretora')) {
          // Diretora vai para DiretoraPainel
          console.log('→ Redirecionando para DiretoraPainel');
          navigation.reset({
            index: 0,
            routes: [{ name: 'DiretoraPainel' }]
          });
        } else {
          // Atendimento vai para AtendimentoHome
          console.log('→ Redirecionando para AtendimentoHome');
          navigation.reset({
            index: 0,
            routes: [{ name: 'AtendimentoHome' }]
          });
        }
      } else {
        // Outros tipos (fornecedor, etc) vão para AtendimentoHome por padrão
        console.log('→ Redirecionando para AtendimentoHome');
        navigation.reset({
          index: 0,
          routes: [{ name: 'AtendimentoHome' }]
        });
      }

    } catch (error) {
      console.error('Erro no login:', error);
      Alert.alert('Erro', 'Não foi possível fazer login. Tente novamente.');
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
        {/* LOGO */}
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>realize</Text>
          <Text style={styles.tagline}>Gestão de Eventos</Text>
        </View>

        {/* FORMULÁRIO */}
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
            />
          </View>

          <TouchableOpacity 
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Entrar</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helpText}>
            Não tem cadastro? Entre em contato com o administrador.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a2332',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logo: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#00D9FF',
    letterSpacing: 1,
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F7FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#2c3e50',
  },
  loginButton: {
    backgroundColor: '#00D9FF',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonDisabled: {
    backgroundColor: '#95a5a6',
    shadowColor: '#000',
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  helpText: {
    fontSize: 13,
    color: '#7f8c8d',
    textAlign: 'center',
    marginTop: 20,
  },
});
