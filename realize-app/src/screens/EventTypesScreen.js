import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function EventTypesScreen({ navigation }) {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEventTypes();
  }, []);

  const loadEventTypes = async () => {
    try {
      const q = query(
        collection(db, 'eventTypes'),
        where('active', '==', true),
        orderBy('order', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const types = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setEventTypes(types);
    } catch (error) {
      console.error('Erro ao carregar tipos:', error);
      alert('Erro ao carregar tipos de evento');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectType = (type) => {
    navigation.navigate('Questions', { eventType: type });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER COM CÍRCULO GRADIENTE */}
      <View style={styles.header}>
        <View style={styles.circleContainer}>
          {/* Círculo com gradiente */}
          <LinearGradient
            colors={['#00FFAA', '#00BFFF', '#0040FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientCircle}
          >
            <View style={styles.innerCircle}>
              <Text style={styles.logoText}>realize</Text>
            </View>
          </LinearGradient>
        </View>
        
        <Text style={styles.subtitle}>Gerencie seu evento de forma simples</Text>
      </View>

      {/* CONTEÚDO */}
      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <Text style={styles.title}>Que tipo de evento você quer realizar?</Text>

        {/* CARDS DE TIPOS */}
        {eventTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={styles.typeCard}
            onPress={() => handleSelectType(type)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#00FFAA', '#00BFFF', '#0040FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradientBorder}
            >
              <View style={styles.cardInner}>
                <View style={styles.cardIconContainer}>
                  <LinearGradient
                    colors={['#00FFAA', '#00BFFF', '#0040FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconGradient}
                  >
                    <Text style={styles.typeIcon}>{type.icon}</Text>
                  </LinearGradient>
                </View>
                
                <View style={styles.cardContent}>
                  <Text style={styles.typeName}>{type.name}</Text>
                </View>
                
                <Text style={styles.arrow}>→</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A2E40',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A2E40',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#CED7EB',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  circleContainer: {
    marginBottom: 20,
  },
  gradientCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    padding: 4,
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  innerCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 86,
    backgroundColor: '#1A2E40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#CED7EB',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 25,
    textAlign: 'center',
  },
  typeCard: {
    marginBottom: 15,
    borderRadius: 16,
  },
  cardGradientBorder: {
    borderRadius: 16,
    padding: 2,
  },
  cardInner: {
    backgroundColor: '#1A2E40',
    borderRadius: 14,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconContainer: {
    marginRight: 15,
  },
  iconGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeIcon: {
    fontSize: 30,
  },
  cardContent: {
    flex: 1,
  },
  typeName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  arrow: {
    fontSize: 24,
    color: '#00BFFF',
    fontWeight: 'bold',
  },
});
