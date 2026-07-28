import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─────────────────────────────────────────────────────────────────────────────
// usePermissoes — carrega o cargo do usuário logado (se ele tiver um) e
// devolve uma função pode(recurso, acao) pra checar permissão.
//
// REGRA DE SEGURANÇA: se o usuário NÃO tem cargoId (conta antiga, criada
// antes desse sistema existir), pode() sempre retorna true — acesso total,
// sem nenhuma restrição, exatamente como já era antes. A restrição só entra
// em vigor pra quem já tem um cargo atribuído de propósito.
// ─────────────────────────────────────────────────────────────────────────────
export function usePermissoes(userData) {
  const [cargo, setCargo] = useState(null);
  const [loading, setLoading] = useState(!!userData?.cargoId);

  useEffect(() => {
    if (!userData?.cargoId) { setCargo(null); setLoading(false); return; }
    setLoading(true);
    getDoc(doc(db, 'cargos', userData.cargoId))
      .then(snap => setCargo(snap.exists() ? { id: snap.id, ...snap.data() } : null))
      .catch(err => { console.error('Erro ao carregar cargo:', err); setCargo(null); })
      .finally(() => setLoading(false));
  }, [userData?.cargoId]);

  const pode = (recurso, acao) => {
    // Sem cargo definido = acesso total (compatibilidade com contas antigas)
    if (!userData?.cargoId || !cargo) return true;
    const permissoesFinais = { ...(cargo.permissoes || {}), ...(userData.permissoesCustom || {}) };
    return (permissoesFinais[recurso] || '').includes(acao);
  };

  return { cargo, loadingCargo: loading, pode };
}
