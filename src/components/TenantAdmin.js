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
 const [formFranq, setFormFranq] = useState({ nome: '', email: '', senha: '', unidade: '', cidade: '', verbaMensal: '', verbaAnual: '' });
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
 verbaMensal: parseFloat(formFranq.verbaMensal) || 0,
 verbalAnual: parseFloat(formFranq.verbalAnual) || 0,
 active: true,
 createdAt: serverTimestamp(),
 createdBy: userData?.id,
 });
 setFormFranq({ nome: '', email: '', senha: '', unidade: '', cidade: '', verbaMensal: '', verbalAnual: '' });
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
 <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 24 }}>Gestão de Verbas</div>
 <div style={{ ...card, marginBottom: 20 }}>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
 <div>
 <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Modo de verba</div>
 <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{tenant?.modoVerba === 'pool' ? 'Pool (mensal/anual)' : 'Por evento'}</div>
 </div>
 <div>
 <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Total verba anual distribuída</div>
 <div style={{ fontSize: 18, fontWeight: 700, color: corPrimary }}>{formatBRL(totalVerba)}</div>
 </div>
 <div>
 <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Total utilizado</div>
 <div style={{ fontSize: 18, fontWeight: 700, color: corAccent }}>{formatBRL(totalGasto)}</div>
 </div>
 </div>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
 {franqueados.map(f => {
 const gastoFranq = eventos.filter(e => e.clientUserId === f.id).reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
 const verba = (f.verbaMensal || 0) * 12 + (f.verbalAnual || 0);
 const pct = verba > 0 ? Math.min(100, Math.round(gastoFranq / verba * 100)) : 0;
 return (
 <div key={f.id} style={card}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
 <div>
 <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{f.name}</div>
 <div style={{ fontSize: 12, color: '#94a3b8' }}>{f.unidade} {f.cidade ? `· ${f.cidade}` : ''}</div>
 </div>
 <div style={{ textAlign: 'right' }}>
 <div style={{ fontSize: 13, color: '#94a3b8' }}>Mensal: <strong>{formatBRL(f.verbaMensal)}</strong></div>
 <div style={{ fontSize: 13, color: '#94a3b8' }}>Anual: <strong>{formatBRL(f.verbalAnual)}</strong></div>
 </div>
 </div>
 {/* Barra de uso */}
 <div style={{ background: '#f1f5f9', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 6 }}>
 <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#ef4444' : pct > 60 ? '#FFA726' : corAccent, borderRadius: 6, transition: 'width 0.5s' }} />
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
 <span>{formatBRL(gastoFranq)} utilizado</span>
 <span>{pct}% da verba anual</span>
 </div>
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
 <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Senha temporária *</label><input type="password" value={formFranq.senha} onChange={e => setFormFranq(p => ({...p, senha: e.target.value}))} style={inp} placeholder="Mínimo 6 caracteres" /></div>
 <div><label style={lbl}>Unidade / Loja</label><input value={formFranq.unidade} onChange={e => setFormFranq(p => ({...p, unidade: e.target.value}))} style={inp} placeholder="Ex: Ford SP Centro" /></div>
 <div><label style={lbl}>Cidade</label><input value={formFranq.cidade} onChange={e => setFormFranq(p => ({...p, cidade: e.target.value}))} style={inp} placeholder="São Paulo" /></div>
 <div><label style={lbl}>Verba mensal (R$)</label><input type="number" value={formFranq.verbaMensal} onChange={e => setFormFranq(p => ({...p, verbaMensal: e.target.value}))} style={inp} placeholder="0,00" /></div>
 <div><label style={lbl}>Verba anual (R$)</label><input type="number" value={formFranq.verbalAnual} onChange={e => setFormFranq(p => ({...p, verbalAnual: e.target.value}))} style={inp} placeholder="0,00" /></div>
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
