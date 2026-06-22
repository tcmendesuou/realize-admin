import React, { useState, useEffect } from 'react';
import {
 collection, getDocs, addDoc, updateDoc, doc, getDoc, query,
 where, onSnapshot, serverTimestamp, orderBy
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/config';

// ── Helpers ───────────────────────────────────────────────────────────────────
const inp = { width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 };
const card = { background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' };

const formatBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = ts => ts?.toDate ? ts.toDate().toLocaleDateString('pt-BR') : '—';

export default function TenantAdmin({ userData, onLogout, tenant }) {
 const [tenantData, setTenantData] = useState(tenant || null);
 const tenantId = tenantData?.id || tenant?.id || userData?.tenantId;
 const corPrimary = tenantData?.corPrimaria || '#667eea';
 const corAccent = tenantData?.corAcento || '#00E5C4';
 const tenantNome = tenantData?.nome || 'Empresa';

 // Carrega tenant completo se vier só com ID (acesso direto sem subdomínio)
 useEffect(() => {
 if (tenant?.nome) { setTenantData(tenant); return; }
 const tid = tenant?.id || userData?.tenantId;
 if (!tid) return;
 getDocs(query(collection(db, 'tenants'), where('__name__', '==', tid)))
 .then(snap => { if (!snap.empty) setTenantData({ id: snap.docs[0].id, ...snap.docs[0].data() }); })
 .catch(console.error);
 }, [tenant, userData?.tenantId]);

 const [view, setView] = useState('overview'); // overview | franqueados | verbas | eventos
 const [franqueados, setFranqueados] = useState([]);
 const [eventos, setEventos] = useState([]);
 const [loading, setLoading] = useState(true);

 // Modal novo franqueado
 const [showNovoFranq, setShowNovoFranq] = useState(false);
 const [formFranq, setFormFranq] = useState({ nome: '', email: '', senha: '', unidade: '', cidade: '', funcao: '' });
 const [savingFranq, setSavingFranq] = useState(false);

 // Modal verba
 const [editandoVerba, setEditandoVerba] = useState(null); // { userId, verbaMensal, verbalAnual }
 const [savingVerba, setSavingVerba] = useState(false);

 useEffect(() => {
 if (!tenantId) return;
 setLoading(true);

 // Franqueados
 getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId), where('systemRole', '==', 'franqueado')))
 .then(snap => setFranqueados(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
 .catch(console.error);

 // Eventos/budgets do tenant
 const unsub = onSnapshot(
 query(collection(db, 'budgets'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc')),
 snap => { setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }
 );
 return () => unsub();
 }, [tenantId]);

 // ── Criar franqueado ─────────────────────────────────────────────────────────
 const handleCriarFranqueado = async () => {
 if (!formFranq.nome || !formFranq.email || !formFranq.senha) { alert('Nome, email e senha obrigatórios'); return; }
 setSavingFranq(true);
 try {
 // Cria auth
 const cred = await createUserWithEmailAndPassword(auth, formFranq.email, formFranq.senha);
 // Cria user no Firestore
 await addDoc(collection(db, 'users'), {
 uid: cred.user.uid,
 name: formFranq.nome,
 email: formFranq.email,
 systemRole: 'franqueado',
 tenantId,
 tenantRole: 'franqueado',
 unidade: formFranq.unidade,
 cidade: formFranq.cidade,
 funcao: formFranq.funcao || '',
 active: true,
 createdAt: serverTimestamp(),
 createdBy: userData?.id,
 });
 setFormFranq({ nome: '', email: '', senha: '', unidade: '', cidade: '', funcao: '' });
 setShowNovoFranq(false);
 // Recarrega
 const snap = await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId), where('systemRole', '==', 'franqueado')));
 setFranqueados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
 } catch (e) { console.error(e); alert(`Erro: ${e.message}`); }
 finally { setSavingFranq(false); }
 };

 // ── Salvar verba ─────────────────────────────────────────────────────────────
 const handleSalvarVerba = async () => {
 if (!editandoVerba) return;
 setSavingVerba(true);
 try {
 await updateDoc(doc(db, 'users', editandoVerba.id), {
 verbaMensal: parseFloat(editandoVerba.verbaMensal) || 0,
 verbalAnual: parseFloat(editandoVerba.verbalAnual) || 0,
 updatedAt: serverTimestamp(),
 });
 setFranqueados(p => p.map(f => f.id === editandoVerba.id ? { ...f, ...editandoVerba } : f));
 setEditandoVerba(null);
 } catch (e) { console.error(e); alert('Erro ao salvar verba.'); }
 finally { setSavingVerba(false); }
 };

 // ── Métricas ─────────────────────────────────────────────────────────────────
 const totalEventos = eventos.length;
 const eventosAtivos = eventos.filter(e => !['completed', 'rejected'].includes(e.status)).length;
 const totalGasto = eventos.reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
 const totalVerba = franqueados.reduce((acc, f) => acc + (f.verbaMensal || 0) * 12 + (f.verbalAnual || 0), 0);

 // ── Render ───────────────────────────────────────────────────────────────────
 return (
 <div style={{ minHeight: '100vh', background: '#f8faff', fontFamily: 'Outfit, sans-serif' }}>

 {/* Sidebar */}
 <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 220, background: corPrimary, display: 'flex', flexDirection: 'column', zIndex: 100 }}>
 {/* Logo */}
 <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
 {tenant?.logo
 ? <img src={tenant.logo} alt={tenantNome} style={{ height: 36, objectFit: 'contain' }} />
 : <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{tenantNome}</div>}
 <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Admin Portal</div>
 </div>
 {/* Nav */}
 <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
 {[
 { id: 'overview', icon: '', label: 'Visão Geral' },
 { id: 'franqueados', icon: '', label: 'Franqueados' },
 { id: 'eventos', icon: '', label: 'Eventos' },
 { id: 'verbas', icon: '', label: 'Verbas' },
 ].map(item => (
 <button key={item.id} onClick={() => setView(item.id)}
 style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: 'none', background: view === item.id ? 'rgba(255,255,255,0.15)' : 'none', color: 'white', fontSize: 13, fontWeight: view === item.id ? 600 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', textAlign: 'left' }}>
 <span>{item.icon}</span>{item.label}
 </button>
 ))}
 </nav>
 {/* Footer */}
 <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
 <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{userData?.name}</div>
 <button onClick={onLogout} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Sair</button>
 </div>
 </div>

 {/* Conteúdo */}
 <div style={{ marginLeft: 220, padding: '32px 32px' }}>

 {/* ── VISÃO GERAL ─────────────────────────────────────────────────── */}
 {view === 'overview' && (
 <>
 <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 24 }}>Visão Geral — {tenantNome}</div>
 {/* Cards de métricas */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
 {[
 { label: 'Franqueados', value: franqueados.length, icon: '', cor: corPrimary },
 { label: 'Eventos ativos', value: eventosAtivos, icon: '', cor: '#0080FF' },
 { label: 'Total de eventos',value: totalEventos, icon: '', cor: '#667eea' },
 { label: 'Verba utilizada', value: formatBRL(totalGasto), icon: '', cor: '#66BB6A' },
 ].map((m, i) => (
 <div key={i} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
 <div style={{ fontSize: 22 }}>{m.icon}</div>
 <div style={{ fontSize: 24, fontWeight: 700, color: m.cor }}>{m.value}</div>
 <div style={{ fontSize: 12, color: '#94a3b8' }}>{m.label}</div>
 </div>
 ))}
 </div>

 {/* Últimos eventos */}
 <div style={card}>
 <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Últimos Eventos</div>
 {loading ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
 : eventos.slice(0, 8).map(ev => {
 const franq = franqueados.find(f => f.id === ev.clientUserId);
 return (
 <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid #f8faff' }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{ev.eventName || 'Sem nome'}</div>
 <div style={{ fontSize: 11, color: '#94a3b8' }}>{franq?.name || ev.clientName} · {formatDate(ev.createdAt)}</div>
 </div>
 <div style={{ fontSize: 13, fontWeight: 700, color: corAccent }}>{formatBRL(ev.orcamentoFinal?.total)}</div>
 <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: ev.status === 'approved' ? 'rgba(102,187,106,0.1)' : 'rgba(255,167,38,0.1)', color: ev.status === 'approved' ? '#16a34a' : '#d97706' }}>
 {ev.status === 'approved' ? 'APROVADO' : ev.status === 'analyzing' ? 'EM ANÁLISE' : ev.status?.toUpperCase()}
 </div>
 </div>
 );
 })}
 </div>
 </>
 )}

 {/* ── FRANQUEADOS ──────────────────────────────────────────────────── */}
 {view === 'franqueados' && (
 <>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
 <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Franqueados</div>
 <button onClick={() => setShowNovoFranq(true)}
 style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
 + Novo Franqueado
 </button>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
 {franqueados.map(f => {
 const evsFranq = eventos.filter(e => e.clientUserId === f.id);
 const gastoFranq = evsFranq.reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
 return (
 <div key={f.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
 <div style={{ width: 44, height: 44, borderRadius: '50%', background: corPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
 {(f.name || 'F')[0].toUpperCase()}
 </div>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{f.name}</div>
 <div style={{ fontSize: 12, color: '#94a3b8' }}>{f.email} {f.unidade ? `· ${f.unidade}` : ''} {f.cidade ? `· ${f.cidade}` : ''}</div>
 </div>
 <div style={{ textAlign: 'right', flexShrink: 0 }}>
 <div style={{ fontSize: 12, color: '#94a3b8' }}>{evsFranq.length} evento(s)</div>
 <div style={{ fontSize: 13, fontWeight: 700, color: corAccent }}>{formatBRL(gastoFranq)} utilizado</div>
 </div>
 <button onClick={() => setEditandoVerba({ ...f })}
 style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${corPrimary}`, background: 'none', color: corPrimary, fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>
 Gerenciar verba
 </button>
 </div>
 );
 })}
 {franqueados.length === 0 && !loading && (
 <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
 <div style={{ fontSize: 36, marginBottom: 10 }}></div>
 <div>Nenhum franqueado cadastrado ainda.</div>
 </div>
 )}
 </div>
 </>
 )}

 {/* ── EVENTOS ──────────────────────────────────────────────────────── */}
 {view === 'eventos' && (
 <>
 <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 24 }}>Todos os Eventos</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
 {eventos.map(ev => {
 const franq = franqueados.find(f => f.id === ev.clientUserId);
 return (
 <div key={ev.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{ev.eventName || 'Sem nome'}</div>
 <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
 {franq?.name || ev.clientName} · {ev.location || ev.briefingData?.evento?.cidade || '—'} · {formatDate(ev.createdAt)}
 </div>
 <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
 {ev.startDate ? new Date(ev.startDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
 {ev.endDate && ev.endDate !== ev.startDate ? ` → ${new Date(ev.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
 </div>
 </div>
 <div style={{ textAlign: 'right', flexShrink: 0 }}>
 <div style={{ fontSize: 15, fontWeight: 700, color: corAccent }}>{formatBRL(ev.orcamentoFinal?.total)}</div>
 <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, padding: '2px 8px', borderRadius: 6, display: 'inline-block', background: ev.status === 'approved' ? 'rgba(102,187,106,0.1)' : ev.status === 'analyzing' ? 'rgba(255,167,38,0.1)' : 'rgba(102,126,234,0.1)', color: ev.status === 'approved' ? '#16a34a' : ev.status === 'analyzing' ? '#d97706' : '#667eea' }}>
 {ev.status === 'approved' ? 'APROVADO' : ev.status === 'analyzing' ? 'EM ANÁLISE' : (ev.status || '—').toUpperCase()}
 </div>
 </div>
 </div>
 );
 })}
 {eventos.length === 0 && !loading && (
 <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
 <div style={{ fontSize: 36, marginBottom: 10 }}></div>
 <div>Nenhum evento ainda.</div>
 </div>
 )}
 </div>
 </>
 )}

        {/* ── VERBAS ───────────────────────────────────────────────────────── */}
        {view === 'verbas' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Gestão de Verbas</div>
              <button onClick={() => setShowNovaVerba(true)}
                style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                + Adicionar Verba
              </button>
            </div>

            {/* Pool geral */}
            {(() => {
              const totalPool    = verbasGerais.reduce((acc, v) => acc + (v.valor || 0), 0);
              const totalAlocado = franqueados.reduce((acc, f) => acc + (f.saldoVerba || 0), 0);
              const totalUsado   = franqueados.reduce((acc, f) => acc + (eventos.filter(e => e.clientUserId === f.id).reduce((a, e) => a + (e.orcamentoFinal?.total || 0), 0)), 0);
              const pctAlocado   = totalPool > 0 ? Math.min(100, Math.round(totalAlocado / totalPool * 100)) : 0;
              return (
                <div style={{ ...card, marginBottom: 20, borderLeft: `4px solid ${corPrimary}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>Carteira Geral</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div><div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Total disponível</div><div style={{ fontSize: 18, fontWeight: 700, color: corPrimary }}>{formatBRL(totalPool)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Alocado</div><div style={{ fontSize: 18, fontWeight: 700, color: '#FFA726' }}>{formatBRL(totalAlocado)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Livre para alocar</div><div style={{ fontSize: 18, fontWeight: 700, color: corAccent }}>{formatBRL(totalPool - totalAlocado)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Utilizado em eventos</div><div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{formatBRL(totalUsado)}</div></div>
                  </div>
                  <div style={{ background: '#f1f5f9', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ width: `${pctAlocado}%`, height: '100%', background: pctAlocado > 80 ? '#ef4444' : pctAlocado > 60 ? '#FFA726' : corPrimary, borderRadius: 6, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>{pctAlocado}% alocado</div>
                  {verbasGerais.length > 0 && (
                    <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Histórico de cargas</div>
                      {verbasGerais.map(v => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8faff' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{formatBRL(v.valor)}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {v.descricao && `${v.descricao} · `}
                              {v.dataInicio && new Date(v.dataInicio+'T12:00:00').toLocaleDateString('pt-BR')}
                              {v.dataFim && ` → ${new Date(v.dataFim+'T12:00:00').toLocaleDateString('pt-BR')}`}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDate(v.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Por franqueado */}
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Verbas por Franqueado</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {franqueados.map(f => {
                const gastoFranq = eventos.filter(e => e.clientUserId === f.id).reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
                const saldo      = f.saldoVerba || 0;
                const pct        = saldo > 0 ? Math.min(100, Math.round(gastoFranq / saldo * 100)) : 0;
                return (
                  <div key={f.id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{f.name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{f.funcao || ''}{f.unidade ? ` · ${f.unidade}` : ''}{f.cidade ? ` · ${f.cidade}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: corPrimary }}>{formatBRL(saldo)}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>saldo disponível</div>
                        </div>
                        <button onClick={() => { setShowGerenciarVerba(f); setValorAtribuir(''); }}
                          style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${corPrimary}`, background: 'none', color: corPrimary, fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                          Gerenciar
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Utilizado: <strong style={{ color: gastoFranq > saldo ? '#ef4444' : '#1e293b' }}>{formatBRL(gastoFranq)}</strong></div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Restante: <strong style={{ color: corAccent }}>{formatBRL(Math.max(0, saldo - gastoFranq))}</strong></div>
                    </div>
                    <div style={{ background: '#f1f5f9', borderRadius: 6, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#ef4444' : pct > 60 ? '#FFA726' : corAccent, borderRadius: 6, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{pct}% utilizado</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
 </div>

 {/* ── Modal Novo Franqueado ─────────────────────────────────────────── */}
 {showNovoFranq && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
 onClick={e => { if (e.target === e.currentTarget) setShowNovoFranq(false); }}>
 <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
 <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Novo Franqueado</div>
 <button onClick={() => setShowNovoFranq(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
 </div>
 <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
 <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Nome completo *</label><input value={formFranq.nome} onChange={e => setFormFranq(p => ({...p, nome: e.target.value}))} style={inp} placeholder="Nome do franqueado" /></div>
 <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Email *</label><input type="email" value={formFranq.email} onChange={e => setFormFranq(p => ({...p, email: e.target.value}))} style={inp} placeholder="email@franquia.com" /></div>
 <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Senha *</label><input type="password" value={formFranq.senha} onChange={e => setFormFranq(p => ({...p, senha: e.target.value}))} style={inp} placeholder="Mínimo 6 caracteres" /></div>
 <div><label style={lbl}>Unidade / Loja</label><input value={formFranq.unidade} onChange={e => setFormFranq(p => ({...p, unidade: e.target.value}))} style={inp} placeholder="Ex: Ford SP Centro" /></div>
 <div><label style={lbl}>Cidade</label><input value={formFranq.cidade} onChange={e => setFormFranq(p => ({...p, cidade: e.target.value}))} style={inp} placeholder="São Paulo" /></div>
 <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Função</label><input value={formFranq.funcao || ''} onChange={e => setFormFranq(p => ({...p, funcao: e.target.value}))} style={inp} placeholder="Ex: Gerente de Marketing" /></div>
 </div>
 <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
 <button onClick={() => setShowNovoFranq(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
 <button onClick={handleCriarFranqueado} disabled={savingFranq}
 style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: savingFranq ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: savingFranq ? 0.7 : 1 }}>
 {savingFranq ? 'Criando...' : 'Criar franqueado'}
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

      {/* ── Modal Nova Verba Geral ───────────────────────────────────────── */}
      {showNovaVerba && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowNovaVerba(false); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Adicionar Verba</div>
              <button onClick={() => setShowNovaVerba(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lbl}>Valor (R$) *</label>
                <input type="number" value={formVerba.valor} onChange={e => setFormVerba(p => ({...p, valor: e.target.value}))} style={inp} placeholder="Ex: 500000" /></div>
              <div><label style={lbl}>Descrição</label>
                <input value={formVerba.descricao} onChange={e => setFormVerba(p => ({...p, descricao: e.target.value}))} style={inp} placeholder="Ex: Q1 2026" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Data início</label>
                  <input type="date" value={formVerba.dataInicio} onChange={e => setFormVerba(p => ({...p, dataInicio: e.target.value}))} style={{ ...inp, colorScheme: 'light' }} /></div>
                <div><label style={lbl}>Data fim</label>
                  <input type="date" value={formVerba.dataFim} onChange={e => setFormVerba(p => ({...p, dataFim: e.target.value}))} style={{ ...inp, colorScheme: 'light' }} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowNovaVerba(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={handleAdicionarVerba} disabled={savingVerba2}
                  style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: savingVerba2 ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: savingVerba2 ? 0.7 : 1 }}>
                  {savingVerba2 ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Gerenciar Verba do Franqueado ──────────────────────────── */}
      {showGerenciarVerba && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowGerenciarVerba(null); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Verba — {showGerenciarVerba.name}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Saldo atual: {formatBRL(showGerenciarVerba.saldoVerba || 0)}</div>
              </div>
              <button onClick={() => setShowGerenciarVerba(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={lbl}>Valor a atribuir (R$) *</label>
                <input type="number" value={valorAtribuir} onChange={e => setValorAtribuir(e.target.value)} style={inp} placeholder="Ex: 50000" /></div>
              <div><label style={lbl}>Período de uso</label>
                <input value={periodoAtribuir} onChange={e => setPeriodoAtribuir(e.target.value)} style={inp} placeholder="Ex: Janeiro 2026 / Q1 2026" /></div>
              {(() => {
                const totalPool = verbasGerais.reduce((acc, v) => acc + (v.valor || 0), 0);
                const totalAloc = franqueados.reduce((acc, f) => acc + (f.saldoVerba || 0), 0);
                const livre     = totalPool - totalAloc;
                const val       = parseFloat(valorAtribuir) || 0;
                return val > livre ? (
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ef4444' }}>
                    Valor maior que a verba livre disponível ({formatBRL(livre)})
                  </div>
                ) : val > 0 ? (
                  <div style={{ background: 'rgba(102,187,106,0.06)', border: '1px solid rgba(102,187,106,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#16a34a' }}>
                    Verba livre após atribuição: {formatBRL(livre - val)}
                  </div>
                ) : null;
              })()}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowGerenciarVerba(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={handleAtribuirVerba} disabled={savingVerba || !valorAtribuir}
                  style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: !valorAtribuir || savingVerba ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: !valorAtribuir ? 0.5 : 1 }}>
                  {savingVerba ? 'Salvando...' : 'Atribuir verba'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

 {/* ── Modal Gerenciar Verba ─────────────────────────────────────────── */}
 {editandoVerba && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
 onClick={e => { if (e.target === e.currentTarget) setEditandoVerba(null); }}>
 <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
 <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Verba — {editandoVerba.name}</div>
 <button onClick={() => setEditandoVerba(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
 </div>
 <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div><label style={lbl}>Verba mensal (R$)</label>
 <input type="number" value={editandoVerba.verbaMensal || ''} onChange={e => setEditandoVerba(p => ({...p, verbaMensal: e.target.value}))} style={inp} placeholder="0,00" /></div>
 <div><label style={lbl}>Verba anual (R$)</label>
 <input type="number" value={editandoVerba.verbalAnual || ''} onChange={e => setEditandoVerba(p => ({...p, verbalAnual: e.target.value}))} style={inp} placeholder="0,00" /></div>
 <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
 <button onClick={() => setEditandoVerba(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
 <button onClick={handleSalvarVerba} disabled={savingVerba}
 style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: savingVerba ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
 {savingVerba ? 'Salvando...' : 'Salvar verba'}
 </button>
 </div>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
