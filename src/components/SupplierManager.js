import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, addDoc, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase/config';

const STATUS_CONFIG = {
  pendente:    { label: 'Pendente',    bg: '#fef9c3', color: '#a16207', border: '#fde047' },
  homologado:  { label: 'Homologado', bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  recusado:    { label: 'Recusado',   bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
  inativo:     { label: 'Inativo',    bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
};

export default function SupplierManager() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState('todos');
  const [saving, setSaving] = useState(false);
  const [obs, setObs] = useState('');

  useEffect(() => { loadSuppliers(); }, []);

  const loadSuppliers = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'suppliers'), orderBy('createdAt', 'desc')));
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleHomologar = async () => {
    if (!window.confirm(`Homologar ${selected.tradeName || selected.companyName}? Isso criará um acesso de login para o fornecedor.`)) return;
    setSaving(true);
    try {
      // Verifica se já existe usuário com esse email
      const existing = await getDocs(query(collection(db, 'users'), where('email', '==', selected.email)));
      let userId = null;
      if (existing.empty) {
        // Cria usuário em users
        const userRef = await addDoc(collection(db, 'users'), {
          name: selected.contactName || selected.tradeName || selected.companyName,
          email: selected.email,
          phone: selected.phone || '',
          systemRole: 'fornecedor',
          active: true,
          supplierId: selected.id,
          companyName: selected.tradeName || selected.companyName,
          createdAt: new Date(),
        });
        userId = userRef.id;
      } else {
        userId = existing.docs[0].id;
        // Atualiza o systemRole caso esteja diferente
        await updateDoc(doc(db, 'users', userId), { systemRole: 'fornecedor', active: true, supplierId: selected.id });
      }
      // Atualiza o supplier
      await updateDoc(doc(db, 'suppliers', selected.id), { status: 'homologado', userId, obs, updatedAt: new Date() });
      await loadSuppliers();
      setSelected(prev => prev ? { ...prev, status: 'homologado', userId } : null);
      alert('Fornecedor homologado! Acesso de login criado.');
    } catch (e) { console.error(e); alert('Erro ao homologar.'); }
    finally { setSaving(false); }
  };

  const handleStatus = async (id, newStatus) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'suppliers', id), { status: newStatus, obs, updatedAt: new Date() });
      // Se inativar, desativa o usuário também
      if (newStatus === 'inativo' && selected?.userId) {
        await updateDoc(doc(db, 'users', selected.userId), { active: false });
      }
      // Se reativar de recusado para homologado, reativa o usuário
      if (newStatus === 'homologado' && selected?.userId) {
        await updateDoc(doc(db, 'users', selected.userId), { active: true });
      }
      await loadSuppliers();
      setSelected(prev => prev ? { ...prev, status: newStatus, obs } : null);
    } catch (e) { console.error(e); alert('Erro ao atualizar.'); }
    finally { setSaving(false); }
  };

  const handleExcluir = async () => {
    const nome = selected.tradeName || selected.companyName;
    if (!window.confirm(`Excluir o fornecedor "${nome}"? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      // Remove o usuário vinculado se existir
      if (selected.userId) {
        await deleteDoc(doc(db, 'users', selected.userId));
      }
      // Remove supplierServices vinculados
      const svSnap = await getDocs(query(collection(db, 'supplierServices'), where('supplierId', '==', selected.id)));
      await Promise.all(svSnap.docs.map(d => deleteDoc(doc(db, 'supplierServices', d.id))));
      // Remove o supplier
      await deleteDoc(doc(db, 'suppliers', selected.id));
      setSelected(null);
      await loadSuppliers();
    } catch (e) { console.error(e); alert('Erro ao excluir.'); }
    finally { setSaving(false); }
  };

  const filtered = filterStatus === 'todos' ? suppliers : suppliers.filter(s => s.status === filterStatus);
  const counts = { todos: suppliers.length, pendente: suppliers.filter(s => s.status === 'pendente').length, homologado: suppliers.filter(s => s.status === 'homologado').length, recusado: suppliers.filter(s => s.status === 'recusado').length };

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', display: 'flex', gap: 20, height: '100%', minHeight: 0 }}>

      {/* Coluna esquerda — lista */}
      <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['todos','Todos'], ['pendente','Pendentes'], ['homologado','Homologados'], ['recusado','Recusados']].map(([val, label]) => (
            <button key={val} onClick={() => setFilterStatus(val)}
              style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${filterStatus === val ? '#667eea' : '#e2e8f0'}`, background: filterStatus === val ? '#667eea' : 'white', color: filterStatus === val ? 'white' : '#64748b', fontSize: 12, fontWeight: filterStatus === val ? 600 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              {label} {counts[val] > 0 && <span style={{ marginLeft: 4, background: filterStatus === val ? 'rgba(255,255,255,0.3)' : '#f1f5f9', padding: '1px 6px', borderRadius: 10 }}>{counts[val]}</span>}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Nenhum fornecedor encontrado</div>
          ) : filtered.map(s => {
            const st = STATUS_CONFIG[s.status] || STATUS_CONFIG.pendente;
            return (
              <div key={s.id} onClick={() => { setSelected(s); setObs(s.obs || ''); }}
                style={{ background: 'white', borderRadius: 10, border: `1px solid ${selected?.id === s.id ? '#667eea' : '#e2e8f0'}`, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: selected?.id === s.id ? '0 0 0 2px rgba(102,126,234,0.2)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{s.tradeName || s.companyName}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, border: `1px solid ${st.border}`, flexShrink: 0, marginLeft: 8 }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{s.city}{s.state ? ` / ${s.state}` : ''}</div>
                {s.serviceNames?.length > 0 && (
                  <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {s.serviceNames.slice(0, 3).map((sn, i) => (
                      <span key={i} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#f0f3ff', color: '#667eea' }}>{sn}</span>
                    ))}
                    {s.serviceNames.length > 3 && <span style={{ fontSize: 10, color: '#94a3b8' }}>+{s.serviceNames.length - 3}</span>}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5 }}>
                  {s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('pt-BR') : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coluna direita — detalhe */}
      <div style={{ flex: 1, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
            Selecione um fornecedor para ver os detalhes
          </div>
        ) : (
          <>
            {/* Header do detalhe */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>{selected.tradeName || selected.companyName}</h2>
                {selected.tradeName && <div style={{ fontSize: 12, color: '#94a3b8' }}>{selected.companyName}</div>}
              </div>
              {(() => { const st = STATUS_CONFIG[selected.status] || STATUS_CONFIG.pendente; return (
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 12, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
              ); })()}
            </div>

            {/* Conteúdo */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Dados */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>Dados da Empresa</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    ['CNPJ', selected.cnpj],
                    ['E-mail', selected.email],
                    ['Telefone', selected.phone],
                    ['Localização', `${selected.city}${selected.state ? ` / ${selected.state}` : ''}`],
                    ['Site', selected.website],
                    ['Contato', `${selected.contactName}${selected.contactRole ? ` — ${selected.contactRole}` : ''}`],
                  ].filter(([_, v]) => v).map(([label, value]) => (
                    <div key={label} style={{ background: '#f8faff', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13, color: '#334155' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Serviços */}
              {selected.serviceNames?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>Serviços</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selected.serviceNames.map((sn, i) => (
                      <span key={i} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#f0f3ff', color: '#667eea', fontWeight: 500 }}>{sn}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Descrição */}
              {selected.description && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Descrição</div>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, background: '#f8faff', borderRadius: 8, padding: '12px 14px' }}>{selected.description}</p>
                </div>
              )}

              {/* Observação interna */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Observação interna</div>
                <textarea value={obs} onChange={e => setObs(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', resize: 'vertical', height: 70, boxSizing: 'border-box', outline: 'none' }}
                  placeholder="Anotações internas sobre este fornecedor..." />
              </div>
            </div>

            {/* Ações */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
              {selected.status !== 'homologado' && (
                <button onClick={handleHomologar} disabled={saving}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  Homologar
                </button>
              )}
              {selected.status !== 'recusado' && (
                <button onClick={() => handleStatus(selected.id, 'recusado')} disabled={saving}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  ✕ Recusar
                </button>
              )}
              {selected.status === 'homologado' && (
                <button onClick={() => handleStatus(selected.id, 'inativo')} disabled={saving}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  Inativar
                </button>
              )}
              {obs !== (selected.obs || '') && (
                <button onClick={() => handleStatus(selected.id, selected.status)} disabled={saving}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #667eea', background: 'none', color: '#667eea', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                  Salvar obs.
                </button>
              )}
              <button onClick={handleExcluir} disabled={saving}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                Excluir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
