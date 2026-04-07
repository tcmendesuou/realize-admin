import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import FlowBuilder from './FlowBuilder';
import '../styles/FlowBuilder.css';

function FlowBuilderWrapper() {
  const [eventTypes, setEventTypes] = useState([]);
  const [selectedEventType, setSelectedEventType] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEventTypes();
  }, []);

  const loadEventTypes = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'eventTypes'));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEventTypes(data);
    } catch (error) {
      console.error('Erro ao carregar tipos de evento:', error);
      alert('Erro ao carregar tipos de evento');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flow-wrapper-container">
        <div className="loading">Carregando...</div>
      </div>
    );
  }

  // Se tem eventType selecionado, mostra o FlowBuilder em FULLSCREEN
  if (selectedEventType) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#fff' }}>
        <FlowBuilder 
          eventType={selectedEventType} 
          onClose={() => setSelectedEventType(null)} 
        />
      </div>
    );
  }

  // Lista de eventTypes para selecionar
  return (
    <div className="flow-wrapper-container">
      <div className="flow-wrapper-header">
        <h2>Fluxos de Eventos</h2>
        <p className="subtitle">Selecione um tipo de evento para configurar seu fluxo</p>
      </div>

      <div className="event-types-grid">
        {eventTypes.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum tipo de evento cadastrado</p>
            <p className="helper-text">Crie tipos de eventos primeiro</p>
          </div>
        ) : (
          eventTypes.map(eventType => (
            <div 
              key={eventType.id} 
              className="event-type-card"
              onClick={() => setSelectedEventType(eventType)}
            >
              <h3>{eventType.name}</h3>
              {eventType.description && (
                <p className="description">{eventType.description}</p>
              )}
              <button className="btn-configure">
                Configurar Fluxo →
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default FlowBuilderWrapper;
