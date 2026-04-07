import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, getDocs, doc, getDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function QuestionsScreen({ route, navigation }) {
  const { eventType } = route.params;
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadQuestions();
  }, []);

  useEffect(() => {
    calculatePrice();
  }, [answers]);

  const loadQuestions = async () => {
    try {
      const flowDoc = await getDoc(doc(db, 'eventFlows', eventType.id));
      
      if (!flowDoc.exists()) {
        alert('Nenhum fluxo configurado para este tipo de evento ainda.');
        navigation.goBack();
        return;
      }

      const flowData = flowDoc.data();
      const questionsSnapshot = await getDocs(collection(db, 'questions'));
      const allQuestions = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      let orderedQuestions = [];

      if (flowData.items) {
        // NOVA ESTRUTURA
        orderedQuestions = flowData.items
          .filter(item => item.itemType === 'question')
          .sort((a, b) => a.order - b.order)
          .map(flowItem => allQuestions.find(q => q.id === flowItem.itemId))
          .filter(q => q && q.active !== false && q.responsibleRole === 'client');
      } else if (flowData.questions) {
        // ESTRUTURA ANTIGA
        orderedQuestions = flowData.questions
          .sort((a, b) => a.order - b.order)
          .map(flowQ => allQuestions.find(q => q.id === flowQ.questionId))
          .filter(q => q && q.active !== false && q.responsibleRole === 'client');
      }

      if (orderedQuestions.length === 0) {
        alert('Nenhuma pergunta para o cliente neste fluxo.');
        navigation.goBack();
        return;
      }

      setQuestions(orderedQuestions);
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao carregar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = () => {
    let total = 0;
    const numberOfPeople = answers['numberOfPeople'] || 0;
    Object.keys(answers).forEach(questionId => {
      const question = questions.find(q => q.id === questionId);
      const answer = answers[questionId];
      if (question && question.options && answer) {
        if (Array.isArray(answer)) {
          answer.forEach(optionId => {
            const option = question.options.find(opt => opt.id === optionId);
            if (option) {
              total += (option.basePrice || 0) + (option.pricePerPerson || 0) * numberOfPeople;
            }
          });
        } else {
          const option = question.options.find(opt => opt.id === answer);
          if (option) {
            total += (option.basePrice || 0) + (option.pricePerPerson || 0) * numberOfPeople;
          }
        }
      }
    });
    setEstimatedPrice(total);
  };

  const handleAnswer = (value) => {
    setAnswers({ ...answers, [questions[currentIndex].id]: value });
  };

  const handleSubAnswer = (subQuestionId, value) => {
    setAnswers({ ...answers, [subQuestionId]: value });
  };

  // Gerar próximo número de orçamento
  const generateBudgetNumber = async () => {
    try {
      const q = query(
        collection(db, 'budgets'),
        orderBy('budgetNumber', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return 1001; // Primeiro orçamento
      }
      
      const lastBudget = snapshot.docs[0].data();
      return (lastBudget.budgetNumber || 1000) + 1;
    } catch (error) {
      console.error('Erro ao gerar número:', error);
      // Se der erro, gera um número aleatório alto
      return Math.floor(Math.random() * 9000) + 1000;
    }
  };

  // Salvar orçamento no Firebase
  const submitBudget = async () => {
    setSubmitting(true);
    
    try {
      // Gerar número do orçamento
      const budgetNumber = await generateBudgetNumber();

      // Preparar dados do orçamento
      const budgetData = {
        budgetNumber,
        eventTypeId: eventType.id,
        eventTypeName: eventType.name,
        status: 'analyzing',
        estimatedTotal: estimatedPrice,
        answers: answers,
        createdAt: new Date(),
        updatedAt: new Date(),
        clientName: answers['clientName'] || 'Cliente',
        clientEmail: answers['clientEmail'] || '',
        clientPhone: answers['clientPhone'] || '',
        guestsCount: answers['guestsCount'] || answers['numberOfPeople'] || 0,
        eventDate: answers['eventDate'] || null,
      };

      // Salvar no Firestore
      const docRef = await addDoc(collection(db, 'budgets'), budgetData);

      console.log('Orçamento salvo com ID:', docRef.id);

      // Navegar para tela de sucesso - CORRIGIDO AQUI!
      navigation.reset({
        index: 0,
        routes: [
          { name: 'ClientHome' },  // ← MUDOU DE 'Home' PARA 'ClientHome'
          { 
            name: 'Summary', 
            params: { 
              eventType, 
              answers, 
              questions, 
              estimatedPrice,
              budgetNumber,
              budgetId: docRef.id
            } 
          }
        ],
      });

    } catch (error) {
      console.error('Erro ao salvar orçamento:', error);
      Alert.alert('Erro', 'Não foi possível salvar o orçamento. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    const currentQuestion = questions[currentIndex];
    
    // Se for finalização, salvar direto (sem validação)
    if (currentQuestion.specialType === 'finalization') {
      submitBudget();
      return;
    }
    
    // Validar resposta obrigatória (só para perguntas normais)
    if (currentQuestion.required && !answers[currentQuestion.id]) {
      alert('Esta pergunta é obrigatória.');
      return;
    }

    // Próxima pergunta
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      submitBudget();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.loadingText}>Carregando perguntas...</Text>
        <Text style={styles.loadingSubtext}>Preparando seu questionário personalizado</Text>
      </View>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Nenhuma pergunta disponível</Text>
        <TouchableOpacity style={styles.backButtonError} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonErrorText}>← Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentQuestion.id];

  // Verificar se deve mostrar sub-perguntas
  const shouldShowSubQuestions = currentQuestion.hasSubQuestion && 
    currentQuestion.subQuestions && 
    currentQuestion.subQuestions.length > 0 && 
    currentAnswer === currentQuestion.subQuestionTrigger;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.progressText}>
            {currentIndex + 1} de {questions.length}
          </Text>
        </View>
        
        {/* PROGRESS BAR */}
        <View style={styles.progressBarContainer}>
          <LinearGradient 
            colors={['#00FFAA', '#00BFFF', '#0040FF']} 
            start={{ x: 0, y: 0 }} 
            end={{ x: 1, y: 0 }} 
            style={[styles.progressBar, { width: `${((currentIndex + 1) / questions.length) * 100}%` }]}
          />
        </View>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.eventType}>
          {eventType.icon} {eventType.name}
        </Text>

        {/* FINALIZATION SPECIAL */}
        {currentQuestion.specialType === 'finalization' ? (
          <View style={styles.finalizationContainer}>
            <Text style={styles.finalizationText}>✓ Pronto para finalizar?</Text>
            <Text style={styles.finalizationSubtext}>
              Revise suas respostas e confirme o envio do seu pré-orçamento.{'\n\n'}
              Nossa equipe analisará as informações e entrará em contato em breve!
            </Text>
            {estimatedPrice > 0 && (
              <View style={styles.finalPriceBox}>
                <Text style={styles.finalPriceLabel}>Estimativa Total</Text>
                <Text style={styles.finalPriceValue}>
                  R$ {estimatedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <>
            <Text style={styles.questionText}>{currentQuestion.text}</Text>
            {currentQuestion.required && <Text style={styles.required}>* Obrigatório</Text>}

            {/* TIPO: TEXT */}
            {currentQuestion.type === 'text' && (
              <View style={styles.inputContainer}>
                <LinearGradient colors={['#00FFAA', '#00BFFF', '#0040FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.inputGradient}>
                  <TextInput
                    style={[styles.input, styles.textInput]}
                    value={currentAnswer || ''}
                    onChangeText={handleAnswer}
                    placeholder="Digite sua resposta..."
                    placeholderTextColor="#969696"
                    multiline
                  />
                </LinearGradient>
              </View>
            )}

            {/* TIPO: NUMBER */}
            {currentQuestion.type === 'number' && (
              <View style={styles.inputContainer}>
                <LinearGradient colors={['#00FFAA', '#00BFFF', '#0040FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.inputGradient}>
                  <TextInput
                    style={styles.input}
                    value={currentAnswer ? String(currentAnswer) : ''}
                    onChangeText={(text) => handleAnswer(text.replace(/[^0-9]/g, ''))}
                    placeholder="Digite um número..."
                    placeholderTextColor="#969696"
                    keyboardType="numeric"
                  />
                </LinearGradient>
              </View>
            )}

            {/* TIPO: DATE */}
            {currentQuestion.type === 'date' && (
              <View style={styles.inputContainer}>
                <LinearGradient colors={['#00FFAA', '#00BFFF', '#0040FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.inputGradient}>
                  <TextInput
                    style={styles.input}
                    value={currentAnswer || ''}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9]/g, '');
                      let formatted = cleaned;
                      if (cleaned.length >= 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
                      if (cleaned.length >= 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
                      handleAnswer(formatted);
                    }}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor="#969696"
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </LinearGradient>
                <Text style={styles.inputHint}>Formato: dia/mês/ano (ex: 15/12/2025)</Text>
              </View>
            )}

            {/* TIPO: CURRENCY */}
            {currentQuestion.type === 'currency' && (
              <View style={styles.inputContainer}>
                <LinearGradient colors={['#00FFAA', '#00BFFF', '#0040FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.inputGradient}>
                  <View style={styles.currencyInputWrapper}>
                    <Text style={styles.currencySymbol}>R$</Text>
                    <TextInput
                      style={[styles.input, styles.currencyInput]}
                      value={currentAnswer ? String(currentAnswer) : ''}
                      onChangeText={(text) => {
                        const cleaned = text.replace(/[^0-9]/g, '');
                        handleAnswer(cleaned);
                      }}
                      placeholder="0,00"
                      placeholderTextColor="#969696"
                      keyboardType="numeric"
                    />
                  </View>
                </LinearGradient>
                <Text style={styles.inputHint}>Digite o valor em centavos (ex: 10000 = R$ 100,00)</Text>
              </View>
            )}

            {/* TIPO: YESNO */}
            {currentQuestion.type === 'yesno' && (
              <View style={styles.yesNoContainer}>
                <TouchableOpacity style={styles.yesNoButton} onPress={() => handleAnswer('yes')}>
                  <LinearGradient 
                    colors={currentAnswer === 'yes' ? ['#00FFAA', '#00BFFF', '#0040FF'] : ['transparent', 'transparent']} 
                    start={{ x: 0, y: 0 }} 
                    end={{ x: 1, y: 0 }} 
                    style={styles.yesNoGradient}
                  >
                    <Text style={[styles.yesNoText, currentAnswer === 'yes' && styles.yesNoTextActive]}>
                      {currentAnswer === 'yes' ? '✓ ' : ''}Sim
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={styles.yesNoButton} onPress={() => handleAnswer('no')}>
                  <LinearGradient 
                    colors={currentAnswer === 'no' ? ['#00FFAA', '#00BFFF', '#0040FF'] : ['transparent', 'transparent']} 
                    start={{ x: 0, y: 0 }} 
                    end={{ x: 1, y: 0 }} 
                    style={styles.yesNoGradient}
                  >
                    <Text style={[styles.yesNoText, currentAnswer === 'no' && styles.yesNoTextActive]}>
                      {currentAnswer === 'no' ? '✓ ' : ''}Não
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* TIPO: MULTIPLE (Escolha única) */}
            {currentQuestion.type === 'multiple' && currentQuestion.options && currentQuestion.options.length > 0 && (
              <View style={styles.optionsContainer}>
                {currentQuestion.options.map((option) => {
                  const isSelected = currentAnswer === option.id;
                  return (
                    <TouchableOpacity key={option.id} onPress={() => handleAnswer(option.id)}>
                      <LinearGradient 
                        colors={isSelected ? ['#00FFAA', '#00BFFF', '#0040FF'] : ['transparent', 'transparent']} 
                        start={{ x: 0, y: 0 }} 
                        end={{ x: 1, y: 0 }} 
                        style={styles.optionGradient}
                      >
                        <View style={[styles.optionButton, !isSelected && styles.optionButtonOutline]}>
                          <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                            {isSelected ? '✓ ' : ''}{option.label}
                          </Text>
                          {(option.basePrice > 0 || option.pricePerPerson > 0) && (
                            <Text style={[styles.optionPrice, isSelected && styles.optionPriceActive]}>
                              {option.basePrice > 0 && `R$ ${option.basePrice.toLocaleString('pt-BR')}`}
                              {option.pricePerPerson > 0 && ` + R$ ${option.pricePerPerson}/pessoa`}
                            </Text>
                          )}
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* TIPO: MULTISELECT (Múltipla escolha) */}
            {currentQuestion.type === 'multiselect' && currentQuestion.options && currentQuestion.options.length > 0 && (
              <View style={styles.optionsContainer}>
                {currentQuestion.options.map((option) => {
                  const current = currentAnswer || [];
                  const isSelected = Array.isArray(current) && current.includes(option.id);
                  return (
                    <TouchableOpacity key={option.id} onPress={() => {
                      const current = currentAnswer || [];
                      isSelected ? 
                        handleAnswer(current.filter(id => id !== option.id)) : 
                        handleAnswer([...current, option.id]);
                    }}>
                      <LinearGradient 
                        colors={isSelected ? ['#00FFAA', '#00BFFF', '#0040FF'] : ['transparent', 'transparent']} 
                        start={{ x: 0, y: 0 }} 
                        end={{ x: 1, y: 0 }} 
                        style={styles.optionGradient}
                      >
                        <View style={[styles.optionButton, !isSelected && styles.optionButtonOutline]}>
                          <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                            {isSelected ? '✓ ' : ''}{option.label}
                          </Text>
                          {(option.basePrice > 0 || option.pricePerPerson > 0) && (
                            <Text style={[styles.optionPrice, isSelected && styles.optionPriceActive]}>
                              {option.basePrice > 0 && `R$ ${option.basePrice.toLocaleString('pt-BR')}`}
                              {option.pricePerPerson > 0 && ` + R$ ${option.pricePerPerson}/pessoa`}
                            </Text>
                          )}
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* SUB-PERGUNTAS */}
        {shouldShowSubQuestions && (
          <View style={styles.subQuestionsContainer}>
            <Text style={styles.subQuestionsTitle}>📋 Informações Adicionais</Text>
            {currentQuestion.subQuestions.map((subQ) => {
              const subAnswer = answers[subQ.id];
              return (
                <View key={subQ.id} style={styles.subQuestionCard}>
                  <Text style={styles.subQuestionText}>{subQ.text}</Text>
                  {subQ.required && <Text style={styles.subRequired}>* Obrigatório</Text>}

                  {/* TIPO: TEXT */}
                  {subQ.type === 'text' && (
                    <View style={styles.subInputContainer}>
                      <LinearGradient colors={['#00FFAA', '#00BFFF', '#0040FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.inputGradient}>
                        <TextInput
                          style={[styles.input, styles.subInput]}
                          value={subAnswer || ''}
                          onChangeText={(val) => handleSubAnswer(subQ.id, val)}
                          placeholder="Digite sua resposta..."
                          placeholderTextColor="#969696"
                          multiline
                        />
                      </LinearGradient>
                    </View>
                  )}

                  {/* TIPO: NUMBER */}
                  {subQ.type === 'number' && (
                    <View style={styles.subInputContainer}>
                      <LinearGradient colors={['#00FFAA', '#00BFFF', '#0040FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.inputGradient}>
                        <TextInput
                          style={styles.input}
                          value={subAnswer ? String(subAnswer) : ''}
                          onChangeText={(text) => handleSubAnswer(subQ.id, text.replace(/[^0-9]/g, ''))}
                          placeholder="Digite um número..."
                          placeholderTextColor="#969696"
                          keyboardType="numeric"
                        />
                      </LinearGradient>
                    </View>
                  )}

                  {/* TIPO: MULTIPLE (Escolha única) */}
                  {subQ.type === 'multiple' && subQ.options && subQ.options.length > 0 && (
                    <View style={styles.optionsContainer}>
                      {subQ.options.map((option) => {
                        const isSelected = subAnswer === option.id;
                        return (
                          <TouchableOpacity key={option.id} onPress={() => handleSubAnswer(subQ.id, option.id)}>
                            <LinearGradient 
                              colors={isSelected ? ['#00FFAA', '#00BFFF', '#0040FF'] : ['transparent', 'transparent']} 
                              start={{ x: 0, y: 0 }} 
                              end={{ x: 1, y: 0 }} 
                              style={styles.optionGradient}
                            >
                              <View style={[styles.optionButton, !isSelected && styles.optionButtonOutline]}>
                                <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                                  {isSelected ? '✓ ' : ''}{option.label}
                                </Text>
                                {(option.basePrice > 0 || option.pricePerPerson > 0) && (
                                  <Text style={[styles.optionPrice, isSelected && styles.optionPriceActive]}>
                                    {option.basePrice > 0 && `R$ ${option.basePrice.toLocaleString('pt-BR')}`}
                                    {option.pricePerPerson > 0 && ` + R$ ${option.pricePerPerson}/pessoa`}
                                  </Text>
                                )}
                              </View>
                            </LinearGradient>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* TIPO: MULTISELECT (Múltipla Escolha) */}
                  {subQ.type === 'multiselect' && subQ.options && subQ.options.length > 0 && (
                    <View style={styles.optionsContainer}>
                      {subQ.options.map((option) => {
                        const current = subAnswer || [];
                        const isSelected = Array.isArray(current) && current.includes(option.id);
                        return (
                          <TouchableOpacity key={option.id} onPress={() => {
                            const current = subAnswer || [];
                            isSelected ? 
                              handleSubAnswer(subQ.id, current.filter(id => id !== option.id)) : 
                              handleSubAnswer(subQ.id, [...current, option.id]);
                          }}>
                            <LinearGradient 
                              colors={isSelected ? ['#00FFAA', '#00BFFF', '#0040FF'] : ['transparent', 'transparent']} 
                              start={{ x: 0, y: 0 }} 
                              end={{ x: 1, y: 0 }} 
                              style={styles.optionGradient}
                            >
                              <View style={[styles.optionButton, !isSelected && styles.optionButtonOutline]}>
                                <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                                  {isSelected ? '✓ ' : ''}{option.label}
                                </Text>
                                {(option.basePrice > 0 || option.pricePerPerson > 0) && (
                                  <Text style={[styles.optionPrice, isSelected && styles.optionPriceActive]}>
                                    {option.basePrice > 0 && `R$ ${option.basePrice.toLocaleString('pt-BR')}`}
                                    {option.pricePerPerson > 0 && ` + R$ ${option.pricePerPerson}/pessoa`}
                                  </Text>
                                )}
                              </View>
                            </LinearGradient>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* AVISO: Sem opções */}
        {(currentQuestion.type === 'multiple' || currentQuestion.type === 'multiselect') && (!currentQuestion.options || currentQuestion.options.length === 0) && (
          <View style={styles.noOptionsContainer}>
            <Text style={styles.noOptionsText}>⚠️ Esta pergunta ainda não tem opções configuradas</Text>
          </View>
        )}

        {/* ESTIMATIVA DE PREÇO */}
        {estimatedPrice > 0 && currentQuestion.specialType !== 'finalization' && (
          <View style={styles.priceContainer}>
            <LinearGradient 
              colors={['#00FFAA', '#00BFFF', '#0040FF']} 
              start={{ x: 0, y: 0 }} 
              end={{ x: 1, y: 1 }} 
              style={styles.priceGradient}
            >
              <Text style={styles.priceLabel}>Estimativa atual:</Text>
              <Text style={styles.priceValue}>R$ {estimatedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text>
            </LinearGradient>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {currentIndex > 0 && (
          <TouchableOpacity style={styles.previousButton} onPress={handlePrevious}>
            <Text style={styles.previousButtonText}>← Anterior</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={[styles.nextButton, currentIndex === 0 && styles.nextButtonFull]} 
          onPress={handleNext}
          disabled={submitting}
        >
          <LinearGradient 
            colors={['#00FFAA', '#00BFFF', '#0040FF']} 
            start={{ x: 0, y: 0 }} 
            end={{ x: 1, y: 0 }} 
            style={styles.nextButtonGradient}
          >
            <Text style={styles.nextButtonText}>
              {submitting ? 'Enviando...' : 
               currentQuestion.specialType === 'finalization' ? '✓ Finalizar e Enviar' : 
               currentIndex === questions.length - 1 ? 'Finalizar' : 'Próximo →'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A2E40' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A2E40' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#CED7EB', fontWeight: '600' },
  loadingSubtext: { marginTop: 8, fontSize: 14, color: '#969696' },
  errorText: { fontSize: 18, color: '#FF6B6B', textAlign: 'center', marginBottom: 20 },
  backButtonError: { backgroundColor: '#00BFFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  backButtonErrorText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  header: { backgroundColor: '#1A2E40', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A3E50' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  backButton: { color: '#00BFFF', fontSize: 16, fontWeight: '600' },
  progressText: { color: '#CED7EB', fontSize: 16, fontWeight: '600' },
  progressBarContainer: { height: 4, backgroundColor: '#2A3E50', borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 2 },
  content: { flex: 1, padding: 20 },
  eventType: { fontSize: 18, color: '#969696', marginBottom: 20, textAlign: 'center' },
  questionText: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 10 },
  required: { fontSize: 14, color: '#00FFAA', marginBottom: 20 },
  
  finalizationContainer: { backgroundColor: 'rgba(0, 255, 170, 0.1)', padding: 24, borderRadius: 16, borderWidth: 2, borderColor: '#00FFAA', marginBottom: 20 },
  finalizationText: { fontSize: 20, fontWeight: 'bold', color: '#00FFAA', textAlign: 'center', marginBottom: 12 },
  finalizationSubtext: { fontSize: 15, color: '#CED7EB', textAlign: 'center', lineHeight: 22 },
  finalPriceBox: { marginTop: 20, padding: 16, backgroundColor: 'rgba(0, 191, 255, 0.1)', borderRadius: 12, alignItems: 'center' },
  finalPriceLabel: { fontSize: 14, color: '#CED7EB', marginBottom: 4 },
  finalPriceValue: { fontSize: 32, fontWeight: 'bold', color: '#00FFAA' },
  
  inputContainer: { marginBottom: 20 },
  inputGradient: { borderRadius: 12, padding: 2 },
  input: { backgroundColor: '#1A2E40', borderRadius: 10, padding: 15, fontSize: 16, color: '#FFFFFF' },
  textInput: { minHeight: 80, textAlignVertical: 'top' },
  inputHint: { fontSize: 13, color: '#969696', marginTop: 8, marginLeft: 4 },
  currencyInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A2E40', borderRadius: 10, paddingLeft: 15 },
  currencySymbol: { fontSize: 18, fontWeight: 'bold', color: '#00FFAA', marginRight: 8 },
  currencyInput: { flex: 1, paddingLeft: 0 },
  yesNoContainer: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  yesNoButton: { flex: 1, borderRadius: 12 },
  yesNoGradient: { borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: '#00BFFF' },
  yesNoText: { fontSize: 18, fontWeight: '600', color: '#CED7EB' },
  yesNoTextActive: { color: '#FFFFFF' },
  optionsContainer: { gap: 12, marginBottom: 20 },
  optionGradient: { borderRadius: 12, padding: 2 },
  optionButton: { backgroundColor: '#1A2E40', borderRadius: 10, padding: 15 },
  optionButtonOutline: { borderWidth: 2, borderColor: '#00BFFF' },
  optionText: { fontSize: 16, fontWeight: '600', color: '#CED7EB', marginBottom: 5 },
  optionTextActive: { color: '#FFFFFF' },
  optionPrice: { fontSize: 14, color: '#969696' },
  optionPriceActive: { color: '#CED7EB' },
  
  subQuestionsContainer: { marginTop: 20, paddingTop: 20, borderTopWidth: 2, borderTopColor: '#2A3E50' },
  subQuestionsTitle: { fontSize: 16, fontWeight: '600', color: '#00BFFF', marginBottom: 16 },
  subQuestionCard: { backgroundColor: 'rgba(0, 191, 255, 0.05)', padding: 16, borderRadius: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#00BFFF' },
  subQuestionText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginBottom: 6 },
  subRequired: { fontSize: 12, color: '#00FFAA', marginBottom: 12 },
  subInputContainer: { marginTop: 8 },
  subInput: { minHeight: 60 },
  
  noOptionsContainer: { backgroundColor: 'rgba(255, 107, 107, 0.1)', padding: 20, borderRadius: 12, borderWidth: 2, borderColor: '#FF6B6B', marginBottom: 20 },
  noOptionsText: { color: '#FF6B6B', fontSize: 15, textAlign: 'center', fontWeight: '600' },
  priceContainer: { marginTop: 20, marginBottom: 20, borderRadius: 12 },
  priceGradient: { padding: 20, borderRadius: 12, alignItems: 'center' },
  priceLabel: { fontSize: 14, color: '#FFFFFF', marginBottom: 5, opacity: 0.9 },
  priceValue: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF' },
  footer: { flexDirection: 'row', padding: 20, gap: 10, backgroundColor: '#1A2E40', borderTopWidth: 1, borderTopColor: '#2A3E50' },
  previousButton: { flex: 1, backgroundColor: 'transparent', borderRadius: 12, padding: 15, alignItems: 'center', borderWidth: 2, borderColor: '#00BFFF' },
  previousButtonText: { fontSize: 16, fontWeight: '600', color: '#00BFFF' },
  nextButton: { flex: 1, borderRadius: 12 },
  nextButtonFull: { flex: 1 },
  nextButtonGradient: { borderRadius: 12, padding: 15, alignItems: 'center' },
  nextButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
