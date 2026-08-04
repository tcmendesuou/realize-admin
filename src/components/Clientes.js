import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const card = { background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' };
const inp  = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
const lbl  = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 };
const formatBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ─────────────────────────────────────────────────────────────────────────────
// Clientes — visão da Realize sobre cada tenant: números agregados (só
// leitura — colaboradores, unidades, eventos, verba) + aba Plano, onde se
// vincula qual opção de Implantação/Fee/Unidade esse cliente usa. Diferente
// da aba "Empresas", que é o cadastro básico (nome, logo, cores) do tenant.
// ─────────────────────────────────────────────────────────────────────────────
function ClienteDetalhe({ tenant, planos, onVoltar, onTenantAtualizado }) {
  const [view, setView] = useState('overview'); // overview | plano
  const [franqueados, setFranqueados] = useState([]);
  const [unidades, setUnidades]       = useState([]);
  const [eventos, setEventos]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [salvandoPlano, setSalvandoPlano] = useState(false);

  useEffect(() => {
    if (!tenant?.id) return;
    setLoading(true);
    const unsubF = onSnapshot(query(collection(db, 'users'), where('tenantId', '==', tenant.id), where('systemRole', '==', 'cliente')),
      snap => setFranqueados(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubU = onSnapshot(collection(db, 'tenants', tenant.id, 'unidades'),
      snap => setUnidades(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubE = onSnapshot(query(collection(db, 'budgets'), where('tenantId', '==', tenant.id)),
      snap => { setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    return () => { unsubF(); unsubU(); unsubE(); };
  }, [tenant?.id]);

  const totalEventos   = eventos.length;
  const eventosAtivos  = eventos.filter(e => !['completed', 'rejected'].includes(e.status)).length;
  const verbaGasta     = eventos.reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
  const verbaDisponivel = (tenant.saldoVerba || 0) + unidades.reduce((acc, u) => acc + (u.saldoVerba || 0), 0);

  const planosDoTipo = (tipo) => planos.filter(p => p.tipo === tipo);
  const planoAtual = (campo) => planos.find(p => p.id === tenant[campo]);

  const vincularPlano = async (campo, planoId) => {
    setSalvandoPlano(true);
    try {
      await updateDoc(doc(db, 'tenants', tenant.id), { [campo]: planoId || null, updatedAt: serverTimestamp() });
      onTenantAtualizado({ ...tenant, [campo]: planoId || null });
    } catch (e) { console.error(e); alert('Erro ao vincular plano.'); }
    finally { setSalvandoPlano(false); }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onVoltar} style={{ background: 'none', border: 'none', color: '#667eea', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>← Voltar</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>{tenant.nome}</h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 22, borderBottom: '1px solid #e2e8f0' }}>
        {[['overview', 'Visão Geral'], ['plano', 'Plano']].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            style={{ padding: '10px 18px', border: 'none', borderBottom: view === id ? '2px solid #667eea' : '2px solid transparent', background: 'none', color: view === id ? '#667eea' : '#64748b', fontWeight: view === id ? 600 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'overview' && (
        loading ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
            {[
              { label: 'Colaboradores',    value: franqueados.length },
              { label: 'Unidades',         value: unidades.length },
              { label: 'Eventos ativos',   value: eventosAtivos },
              { label: 'Total de eventos', value: totalEventos },
              { label: 'Verba disponível', value: formatBRL(verbaDisponivel) },
            ].map(m => (
              <div key={m.label} style={{ ...card, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#667eea' }}>{m.value}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{m.label}</div>
              </div>
            ))}
            <div style={{ ...card, textAlign: 'center', gridColumn: 'span 5' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Verba já usada em eventos</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#66BB6A' }}>{formatBRL(verbaGasta)}</div>
            </div>
          </div>
        )
      )}

      {view === 'plano' && (
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { campo: 'planoImplantacaoId', tipo: 'implantacao', titulo: 'Implantação', sufixo: 'R$' },
            { campo: 'planoFeeId',         tipo: 'fee',         titulo: 'Fee',          sufixo: '%' },
            { campo: 'planoUnidadeId',     tipo: 'unidade',     titulo: 'Unidades (mensalidade)', sufixo: 'R$/mês' },
          ].map(col => {
            const atual = planoAtual(col.campo);
            return (
              <div key={col.campo} style={{ ...card, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>{col.titulo}</div>
                <label style={lbl}>Plano vinculado</label>
                <select value={tenant[col.campo] || ''} disabled={salvandoPlano} onChange={e => vincularPlano(col.campo, e.target.value)} style={{ ...inp, background: 'white', marginBottom: 10 }}>
                  <option value="">Nenhum</option>
                  {planosDoTipo(col.tipo).map(p => (
                    <option key={p.id} value={p.id}>{p.nome} ({p.valor}{col.sufixo === '%' ? '%' : ` ${col.sufixo}`})</option>
                  ))}
                </select>
                {atual && (
                  <div style={{ fontSize: 12, color: '#667eea', fontWeight: 600, padding: '8px 10px', background: 'rgba(102,126,234,0.06)', borderRadius: 8 }}>
                    Atual: {atual.nome} — {atual.valor}{col.sufixo === '%' ? '%' : ` ${col.sufixo}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Clientes() {
  const [tenants, setTenants]     = useState([]);
  const [planos, setPlanos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selecionado, setSelecionado] = useState(null);

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    const [tenantsSnap, planosSnap] = await Promise.all([
      getDocs(collection(db, 'tenants')),
      getDocs(collection(db, 'planos')),
    ]);
    setTenants(tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')));
    setPlanos(planosSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  if (selecionado) {
    return (
      <ClienteDetalhe
        tenant={selecionado}
        planos={planos}
        onVoltar={() => setSelecionado(null)}
        onTenantAtualizado={(novo) => { setSelecionado(novo); setTenants(prev => prev.map(t => t.id === novo.id ? novo : t)); }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Clientes</h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Visão geral e plano de cada empresa cliente.</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
      ) : tenants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          Nenhum cliente cadastrado ainda — cadastre na aba "Empresas" primeiro.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {tenants.map(t => (
            <div key={t.id} onClick={() => setSelecionado(t)}
              style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{t.nome}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                {t.planoFeeId || t.planoUnidadeId || t.planoImplantacaoId ? 'Plano vinculado' : 'Sem plano vinculado'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
