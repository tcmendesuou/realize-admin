import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Mesmo padrão da web (src/hooks/usePermissoes.js): sem cargoId = acesso
// total (compatibilidade com contas antigas). Só restringe quem já tem
// cargo atribuído de propósito.
export function usePermissoes(userData) {
  const [cargo, setCargo] = useState(null);
  const [loadingCargo, setLoadingCargo] = useState(!!userData?.cargoId);

  useEffect(() => {
    if (!userData?.cargoId) { setCargo(null); setLoadingCargo(false); return; }
    setLoadingCargo(true);
    getDoc(doc(db, 'cargos', userData.cargoId))
      .then(snap => setCargo(snap.exists() ? { id: snap.id, ...snap.data() } : null))
      .catch(err => { console.error('Erro ao carregar cargo:', err); setCargo(null); })
      .finally(() => setLoadingCargo(false));
  }, [userData?.cargoId]);

  const pode = (recurso, acao) => {
    if (!userData?.cargoId || !cargo) return true;
    const permissoesFinais = { ...(cargo.permissoes || {}), ...(userData.permissoesCustom || {}) };
    return (permissoesFinais[recurso] || '').includes(acao);
  };

  return { cargo, loadingCargo, pode };
}
