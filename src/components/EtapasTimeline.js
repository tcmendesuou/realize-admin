import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebase/config';

// ─────────────────────────────────────────────────────────────────────────────
// EtapasTimeline — linha do tempo vertical das Etapas do evento (diferente do
// Cronograma/Gantt, que é a agenda de datas). As Etapas vêm fixas do Tipo de
// Evento no momento da criação do projeto (project.etapasProjeto), e qualquer
// Fornecedor envolvido pode subir fotos em qualquer uma delas — sem texto,
// só fotos — pra o Cliente acompanhar o andamento sem precisar cobrar nada.
// Cada foto guarda quem enviou (supplierName) e quando, pra ficar no histórico.
// ─────────────────────────────────────────────────────────────────────────────
export default function EtapasTimeline({ project, userData, isFornecedor }) {
  const [fotos, setFotos]               = useState([]);
  const [loadingFotos, setLoadingFotos] = useState(true);
  const [enviandoEtapaId, setEnviandoEtapaId] = useState(null);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);

  const etapas = project?.etapasProjeto || [];

  useEffect(() => {
    if (!project?.id) return;
    const unsub = onSnapshot(
      query(collection(db, 'budgets', project.id, 'etapaFotos'), orderBy('createdAt', 'asc')),
      snap => { setFotos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingFotos(false); },
      () => setLoadingFotos(false)
    );
    return () => unsub();
  }, [project?.id]);

  const handleUpload = async (etapaId, files) => {
    if (!files?.length) return;
    setEnviandoEtapaId(etapaId);
    try {
      const storage = getStorage();
      const supplierId = userData?.supplierId || userData?.id;
      const supplierName = userData?.name || 'Fornecedor';
      for (const file of Array.from(files)) {
        const storageRef = ref(storage, `etapas/${project.id}/${etapaId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await addDoc(collection(db, 'budgets', project.id, 'etapaFotos'), {
          etapaId, url, nome: file.name,
          supplierId: supplierId || '', supplierName,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); alert('Erro ao enviar foto(s). Tente novamente.'); }
    finally { setEnviandoEtapaId(null); }
  };

  const formatData = (ts) => ts?.toDate ? ts.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  if (etapas.length === 0) {
    return (
      <div className="ps-card" style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
        Nenhuma etapa configurada para este tipo de evento.
      </div>
    );
  }

  return (
    <div className="ps-card">
      <div className="ps-card-title" style={{ marginBottom: 22 }}>Etapas do Evento</div>
      <div style={{ position: 'relative', paddingLeft: 26 }}>
        <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: '#e2e8f0' }} />
        {etapas.map((etapa, i) => {
          const fotosEtapa = fotos.filter(f => f.etapaId === etapa.id);
          const temFoto = fotosEtapa.length > 0;
          return (
            <div key={etapa.id} style={{ position: 'relative', marginBottom: i === etapas.length - 1 ? 0 : 26 }}>
              <div style={{ position: 'absolute', left: -26, top: 3, width: 16, height: 16, borderRadius: '50%', background: temFoto ? '#00E5C4' : 'white', border: `3px solid ${temFoto ? '#00E5C4' : '#cbd5e1'}`, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>{etapa.nome}</div>

              {loadingFotos ? null : !temFoto ? (
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>Nenhuma foto ainda.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {fotosEtapa.map(f => (
                    <img key={f.id} src={f.url} alt={f.nome} onClick={() => setFotoAmpliada(f)}
                      title={`Enviado por ${f.supplierName || 'Fornecedor'} em ${formatData(f.createdAt)}`}
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid #e2e8f0' }} />
                  ))}
                </div>
              )}

              {isFornecedor && (
                <label style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, background: enviandoEtapaId === etapa.id ? '#f1f5f9' : 'rgba(0,229,196,0.1)', color: enviandoEtapaId === etapa.id ? '#94a3b8' : '#00b894', fontSize: 12, fontWeight: 600, cursor: enviandoEtapaId === etapa.id ? 'not-allowed' : 'pointer', border: '1px solid rgba(0,229,196,0.3)' }}>
                  {enviandoEtapaId === etapa.id ? 'Enviando...' : '+ Adicionar foto(s)'}
                  <input type="file" multiple accept="image/*" style={{ display: 'none' }} disabled={enviandoEtapaId === etapa.id}
                    onChange={e => { const fs = Array.from(e.target.files); e.target.value = ''; handleUpload(etapa.id, fs); }} />
                </label>
              )}
            </div>
          );
        })}
      </div>

      {fotoAmpliada && (
        <div onClick={() => setFotoAmpliada(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20 }}>
          <img src={fotoAmpliada.url} style={{ maxWidth: '90%', maxHeight: '80%', borderRadius: 8 }} />
          <div style={{ color: 'white', fontSize: 13, marginTop: 12 }}>
            Enviado por {fotoAmpliada.supplierName || 'Fornecedor'} em {formatData(fotoAmpliada.createdAt)}
          </div>
        </div>
      )}
    </div>
  );
}
