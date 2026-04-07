import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function HomeScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      // Buscar projetos aprovados do cliente
      // TODO: Filtrar por clientId quando tivermos autenticação
      const q = query(
        collection(db, 'budgets'),
        where('status', '==', 'approved')
      );
      
      const querySnapshot = await getDocs(q);
      const projectsData = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .sort((a, b) => {
          // Ordenar manualmente por createdAt (mais recente primeiro)
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
          return dateB - dateA;
        });
      
      setProjects(projectsData);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Logo */}
      <View style={styles.header}>
        <Text style={styles.logo}>realize</Text>
        <Text style={styles.subtitle}>Gestão de Eventos</Text>
      </View>

      {/* Botão Principal */}
      <TouchableOpacity
        onPress={() => navigation.navigate('EventTypes')}
        style={styles.mainButtonContainer}
      >
        <LinearGradient
          colors={['#00D9FF', '#0066FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.mainButton}
        >
          <Text style={styles.mainButtonText}>Fazer um Orçamento</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Projetos em Andamento */}
      <View style={styles.projectsSection}>
        <Text style={styles.sectionTitle}>Projetos em Andamento</Text>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00D9FF" />
          </View>
        ) : projects.length > 0 ? (
          projects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={styles.projectCard}
              onPress={() => {
                // TODO: Navegar para detalhes do projeto
                console.log('Ver projeto:', project.id);
              }}
            >
              <View style={styles.projectHeader}>
                <Text style={styles.projectNumber}>#{project.budgetNumber}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>EM ANDAMENTO</Text>
                </View>
              </View>
              
              <Text style={styles.projectEventType}>{project.eventTypeName}</Text>
              
              {project.kickoffDate && (
                <Text style={styles.projectDate}>
                  Kickoff: {new Date(project.kickoffDate).toLocaleDateString('pt-BR')}
                </Text>
              )}

              {/* Barra de Progresso */}
              {project.taskProgress && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${project.taskProgress.percentage || 0}%` }
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {project.taskProgress.percentage || 0}%
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nenhum projeto em andamento</Text>
            <Text style={styles.emptySubtext}>
              Seus projetos aprovados aparecerão aqui
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a2332',
  },
  header: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 40,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#00D9FF',
    marginTop: 8,
    letterSpacing: 1,
  },
  mainButtonContainer: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  mainButton: {
    paddingVertical: 20,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  mainButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  projectsSection: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  projectCard: {
    backgroundColor: 'rgba(0, 217, 255, 0.08)',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.2)',
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00D9FF',
  },
  statusBadge: {
    backgroundColor: 'rgba(39, 174, 96, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#27ae60',
  },
  projectEventType: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  projectDate: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 12,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#27ae60',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#27ae60',
    minWidth: 40,
  },
  emptyState: {
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 217, 255, 0.2)',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});
