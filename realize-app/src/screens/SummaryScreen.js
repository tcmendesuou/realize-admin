import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function SummaryScreen({ route, navigation }) {
  const { eventType, answers, questions, estimatedPrice } = route.params;
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    
    setSubmitting(true);
    
    try {
      // Buscar dados do usuário logado
      const userStr = await AsyncStorage.getItem('loggedUser');
      if (!userStr) {
        Alert.alert('Erro', 'Usuário não encontrado. Faça login novamente.');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }]
        });
        return;
      }

      const user = JSON.parse(userStr);

      // Gerar número do orçamento (timestamp simples)
      const budgetNumber = Date.now().toString();

      // Criar documento no Firebase
      const budgetData = {
        budgetNumber,
        clientId: user.id,
        clientName: user.name,
        clientEmail: user.email,
        clientPhone: user.phone || '',
        companyId: user.companyId || '',
        companyName: user.companyName || '',
        eventTypeId: eventType.id,
        eventTypeName: eventType.name,
        answers,
        status: 'analyzing',
        estimatedTotal: estimatedPrice,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await addDoc(collection(db, 'budgets'), budgetData);

      Alert.alert(
        'Sucesso!',
        'Seu orçamento foi enviado com sucesso! Nossa equipe entrará em contato em breve.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'ClientHome' }]
              });
            }
          }
        ]
      );

    } catch (error) {
      console.error('Erro ao enviar orçamento:', error);
      Alert.alert(
        'Erro',
        'Não foi possível enviar o orçamento. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getAnswerDisplay = (question, answer) => {
    if (!answer) return 'Não respondido';

    switch (question.type) {
      case 'number':
      case 'text':
        return answer;
      
      case 'date':
        // Formatar data DD/MM/YYYY
        if (answer.toDate) {
          return answer.toDate().toLocaleDateString('pt-BR');
        }
        if (answer instanceof Date) {
          return answer.toLocaleDateString('pt-BR');
        }
        if (typeof answer === 'string') {
          const date = new Date(answer);
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('pt-BR');
          }
        }
        return answer;
      
      case 'currency':
        // Formatar moeda
        const value = typeof answer === 'string' ? parseFloat(answer) : answer;
        if (isNaN(value)) return answer;
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(value / 100);
      
      case 'yesno':
        return answer === 'yes' ? 'Sim' : 'Não';
      
      case 'multiple':
        const option = question.options?.find(opt => opt.id === answer);
        return option?.label || 'Não selecionado';
      
      case 'multiselect':
        if (!Array.isArray(answer)) return 'Não selecionado';
        const selectedOptions = question.options?.filter(opt => answer.includes(opt.id));
        return selectedOptions?.map(opt => opt.label).join(', ') || 'Não selecionado';
      
      default:
        return answer || 'Não informado';
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <LinearGradient
        colors={['#00FFAA', '#00BFFF', '#0040FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Resumo do Pré-Orçamento</Text>
        <Text style={styles.headerSubtitle}>{eventType.icon} {eventType.name}</Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* CARD DE PREÇO */}
        <View style={styles.priceCardContainer}>
          <LinearGradient
            colors={['#00FFAA', '#00BFFF', '#0040FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.priceCard}
          >
            <Text style={styles.priceLabel}>Valor Estimado Total</Text>
            <Text style={styles.priceValue}>
              R$ {estimatedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.priceDisclaimer}>
              * Valor aproximado, sujeito a alterações após análise detalhada
            </Text>
          </LinearGradient>
        </View>

        {/* RESPOSTAS */}
        <View style={styles.answersContainer}>
          <Text style={styles.sectionTitle}>Suas Respostas</Text>
          
          {questions.map((question) => (
            <View key={question.id} style={styles.answerCardContainer}>
              <LinearGradient
                colors={['#00FFAA', '#00BFFF', '#0040FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.answerCardGradient}
              >
                <View style={styles.answerCard}>
                  <Text style={styles.answerQuestion}>{question.text}</Text>
                  <Text style={styles.answerValue}>
                    {getAnswerDisplay(question, answers[question.id])}
                  </Text>
                </View>
              </LinearGradient>
            </View>
          ))}
        </View>

        {/* INFO PRÓXIMOS PASSOS */}
        <View style={styles.infoCardContainer}>
          <LinearGradient
            colors={['#00BFFF', '#0040FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.infoCard}
          >
            <Text style={styles.infoTitle}>O que acontece agora?</Text>
            <Text style={styles.infoText}>
              • Nossa equipe irá analisar suas informações{'\n'}
              • Entraremos em contato em até 24h{'\n'}
              • Faremos um orçamento detalhado{'\n'}
              • Ajustaremos os detalhes do seu evento
            </Text>
          </LinearGradient>
        </View>
      </ScrollView>

      {/* FOOTER */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.cancelButton}
          onPress={() => {
            Alert.alert(
              'Cancelar Orçamento',
              'Tem certeza que deseja cancelar? Suas respostas serão perdidas.',
              [
                { text: 'Continuar Editando', style: 'cancel' },
                {
                  text: 'Sim, Cancelar',
                  style: 'destructive',
                  onPress: () => {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'ClientHome' }]
                    });
                  }
                }
              ]
            );
          }}
          disabled={submitting}
        >
          <Text style={styles.cancelButtonText}>✕ Cancelar</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={submitting}
        >
          <Text style={styles.backButtonText}>← Voltar</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.submitButtonContainer}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <LinearGradient
            colors={submitting ? ['#666', '#888'] : ['#00FFAA', '#00BFFF', '#0040FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitButton}
          >
            <Text style={styles.submitButtonText}>
              {submitting ? 'Enviando...' : '✓ Enviar Orçamento'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A2E40',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },
  priceCardContainer: {
    margin: 20,
    borderRadius: 20,
  },
  priceCard: {
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  priceLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 5,
  },
  priceValue: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  priceDisclaimer: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.8,
    textAlign: 'center',
  },
  answersContainer: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
  },
  answerCardContainer: {
    marginBottom: 12,
    borderRadius: 12,
  },
  answerCardGradient: {
    borderRadius: 12,
    padding: 2,
  },
  answerCard: {
    backgroundColor: '#1A2E40',
    borderRadius: 10,
    padding: 15,
  },
  answerQuestion: {
    fontSize: 14,
    color: '#969696',
    marginBottom: 5,
  },
  answerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  infoCardContainer: {
    margin: 20,
    borderRadius: 12,
  },
  infoCard: {
    padding: 20,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 24,
    opacity: 0.95,
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
    backgroundColor: '#1A2E40',
    borderTopWidth: 1,
    borderTopColor: '#2A3E50',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  backButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00BFFF',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00BFFF',
  },
  submitButtonContainer: {
    flex: 2,
    borderRadius: 12,
  },
  submitButton: {
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
