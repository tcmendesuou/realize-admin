import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

// Cache em memória para não buscar toda vez
let tenantCache = {};

export function useTenant() {
  const [tenant, setTenant]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const detectTenant = async () => {
      const hostname = window.location.hostname; // ex: ford.realizehub.com.br
      const parts    = hostname.split('.');

      // Se for localhost ou realize principal → sem tenant
      const isMain = hostname === 'localhost'
        || hostname === 'realizehub.com.br'
        || hostname === 'www.realizehub.com.br'
        || !hostname.includes('.realizehub.com.br');

      if (isMain) { setTenant(null); setLoading(false); return; }

      // Extrai o slug: "ford.realizehub.com.br" → "ford"
      const slug = parts[0];

      // Usa cache se já buscou
      if (tenantCache[slug] !== undefined) {
        setTenant(tenantCache[slug]);
        setLoading(false);
        return;
      }

      try {
        const snap = await getDocs(query(
          collection(db, 'tenants'),
          where('slug', '==', slug),
          where('ativo', '==', true)
        ));

        if (!snap.empty) {
          const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
          tenantCache[slug] = data;
          setTenant(data);

          // Aplica tema visual do tenant
          if (data.corPrimaria)   document.documentElement.style.setProperty('--tenant-primary',   data.corPrimaria);
          if (data.corSecundaria) document.documentElement.style.setProperty('--tenant-secondary',  data.corSecundaria);
          if (data.corAcento)     document.documentElement.style.setProperty('--tenant-accent',     data.corAcento);
          if (data.logo)          document.querySelector('link[rel="icon"]')?.setAttribute('href', data.logo);
          if (data.nome)          document.title = data.nome;
        } else {
          tenantCache[slug] = null;
          setTenant(null);
        }
      } catch (e) {
        console.error('Erro ao detectar tenant:', e);
        setTenant(null);
      }
      setLoading(false);
    };

    detectTenant();
  }, []);

  return { tenant, loading };
}

// Helper — filtra recursos por tenant
// exclusiveTenants: [] = público (todos veem)
// exclusiveTenants: ["ford"] = só Ford vê
export function filtrarPorTenant(items, tenantId) {
  if (!tenantId) {
    // Admin Realize vê tudo
    return items;
  }
  return items.filter(item => {
    const exc = item.exclusiveTenants || [];
    return exc.length === 0 || exc.includes(tenantId);
  });
}
