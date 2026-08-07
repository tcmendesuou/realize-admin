import React, { useState, useEffect } from 'react';
import {
 collection, getDocs, addDoc, updateDoc, doc, getDoc, deleteDoc, query,
 where, onSnapshot, serverTimestamp, orderBy
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { auth, db } from '../firebase/config';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { usePermissoes } from '../hooks/usePermissoes';
import PermissoesOverride from './PermissoesOverride';

// ── Helpers ───────────────────────────────────────────────────────────────────
const inp = { width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 };
const card = { background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' };

const formatBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = ts => ts?.toDate ? ts.toDate().toLocaleDateString('pt-BR') : '—';

export default function TenantAdmin({ userData, onLogout, tenant }) {
 const { pode } = usePermissoes(userData);
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
 const [unidades, setUnidades] = useState([]);
 const [cargosCliente, setCargosCliente] = useState([]);
 useEffect(() => {
   getDocs(query(collection(db, 'cargos'), where('tipoConta', '==', 'cliente'))).then(snap => {
     setCargosCliente(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.nivel||0)-(b.nivel||0)));
   }).catch(console.error);
 }, []);
 // Resolve nome/cidade da unidade vinculada — com fallback pros campos
 // antigos (unidade/cidade em texto livre), de quando ainda não existia
 // a coleção de Unidades.
 const unidadeDe = (f) => {
   const u = unidades.find(x => x.id === f.unidadeId);
   return { nome: u?.nome || f.unidade || '', cidade: u?.cidade || f.cidade || '' };
 };
 // Resolve nome do cargo vinculado — com fallback pro campo antigo "funcao"
 // (texto livre), de quando ainda não existia o catálogo de Cargos.
 const cargoDe = (f) => cargosCliente.find(c => c.id === f.cargoId)?.nome || f.funcao || '';
 const [eventos, setEventos] = useState([]);
 const [eventosComTenant, setEventosComTenant] = useState([]);
 const [semTenantBudgets, setSemTenantBudgets] = useState([]);
 const [loading, setLoading] = useState(true);

 // Modal novo franqueado
 const [showNovoFranq, setShowNovoFranq] = useState(false);
 const [formFranq, setFormFranq] = useState({ nome: '', email: '', senha: '', unidadeId: '', cargoId: '' });
 const [editandoFranq, setEditandoFranq] = useState(null);
 const [formEditFranq, setFormEditFranq] = useState({ nome: '', email: '', unidadeId: '', cargoId: '', active: true });
 const [savingEditFranq, setSavingEditFranq] = useState(false);
 const [savingFranq, setSavingFranq] = useState(false);

 // Modal verba
 const [savingVerba, setSavingVerba] = useState(false);
  const [verbasGerais, setVerbasGerais]   = useState([]);
  const [showNovaVerba, setShowNovaVerba] = useState(false);
  const [formVerba, setFormVerba]         = useState({ valor: '', descricao: '', dataInicio: '', dataFim: '' });
  const [savingVerba2, setSavingVerba2]   = useState(false);
  const [eventoSelecionado, setEventoSelecionado] = useState(null);
  const [showGerenciarVerba, setShowGerenciarVerba] = useState(null);
  const [valorAtribuir, setValorAtribuir] = useState('');
  const [periodoAtribuir, setPeriodoAtribuir] = useState('');

  // Marketing — campanhas com documentos/fotos/vídeos
  const [campanhas, setCampanhas] = useState([]);
  const [showNovaCampanha, setShowNovaCampanha] = useState(false);
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [savingCampanha, setSavingCampanha] = useState(false);
  const [uploadingCampanhaId, setUploadingCampanhaId] = useState(null);

  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(
      query(collection(db, 'tenants', tenantId, 'campanhas'), orderBy('createdAt', 'desc')),
      snap => setCampanhas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [tenantId]);

  const criarCampanha = async () => {
    if (!nomeCampanha.trim()) return;
    setSavingCampanha(true);
    try {
      await addDoc(collection(db, 'tenants', tenantId, 'campanhas'), {
        nome: nomeCampanha.trim(), ativa: false, arquivos: [], createdAt: serverTimestamp(),
      });
      setNomeCampanha(''); setShowNovaCampanha(false);
    } catch (e) { console.error(e); alert('Erro ao criar campanha.'); }
    finally { setSavingCampanha(false); }
  };

  const uploadArquivosCampanha = async (campanhaId, files, tipo) => {
    setUploadingCampanhaId(campanhaId);
    try {
      const storage = getStorage();
      const novos = [];
      for (const file of Array.from(files)) {
        const storageRef = ref(storage, `marketing/${tenantId}/${campanhaId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        novos.push({ tipo, nome: file.name, url });
      }
      const campanha = campanhas.find(c => c.id === campanhaId);
      await updateDoc(doc(db, 'tenants', tenantId, 'campanhas', campanhaId), {
        arquivos: [...(campanha?.arquivos || []), ...novos],
      });
    } catch (e) { console.error(e); alert('Erro ao enviar arquivo(s).'); }
    finally { setUploadingCampanhaId(null); }
  };

  const toggleAtivaCampanha = async (campanha) => {
    await updateDoc(doc(db, 'tenants', tenantId, 'campanhas', campanha.id), { ativa: !campanha.ativa });
  };

  const excluirCampanha = async (campanhaId) => {
    if (!window.confirm('Excluir essa campanha e todos os arquivos dela?')) return;
    await deleteDoc(doc(db, 'tenants', tenantId, 'campanhas', campanhaId));
  };

  const removerArquivoCampanha = async (campanha, idx) => {
    const novosArquivos = campanha.arquivos.filter((_, i) => i !== idx);
    await updateDoc(doc(db, 'tenants', tenantId, 'campanhas', campanha.id), { arquivos: novosArquivos });
  };

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);

    // Franqueados — tempo real
    const unsubFranq = onSnapshot(
      query(collection(db, 'users'), where('tenantId', '==', tenantId), where('systemRole', '==', 'cliente')),
      snap => {
        const franqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setFranqueados(franqs);

        // Busca budgets antigos sem tenantId pelos clientUserId dos franqueados
        const franqUids = [...new Set(franqs.flatMap(f => [f.uid, f.id].filter(Boolean)))];
        if (franqUids.length > 0) {
          const chunks = [];
          for (let i = 0; i < franqUids.length; i += 10) chunks.push(franqUids.slice(i, i+10));
          Promise.all(chunks.map(chunk =>
            getDocs(query(collection(db, 'budgets'), where('clientUserId', 'in', chunk)))
              .then(bSnap => bSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => !b.tenantId))
              .catch(() => [])
          )).then(results => {
            setSemTenantBudgets(results.flat());
          });
        }
      }
    );

    // Verbas gerais — tempo real
    const unsubVerbas = onSnapshot(
      collection(db, 'tenants', tenantId, 'verbas'),
      snap => {
        setVerbasGerais(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)));
      }
    );

    // Eventos por tenantId — tempo real
    const unsubEventos = onSnapshot(
      query(collection(db, 'budgets'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc')),
      snap => {
        const comTenant = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setEventosComTenant(comTenant);
        setLoading(false);
      }
    );

    // Unidades — tempo real
    const unsubUnidades = onSnapshot(
      collection(db, 'tenants', tenantId, 'unidades'),
      snap => {
        setUnidades(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.nome||'').localeCompare(b.nome||'')));
      }
    );

    return () => { unsubFranq(); unsubVerbas(); unsubEventos(); unsubUnidades(); };
  }, [tenantId]);

  // Combina eventos com e sem tenantId em tempo real
  useEffect(() => {
    const todos  = [...eventosComTenant, ...semTenantBudgets];
    const unicos = Array.from(new Map(todos.map(e => [e.id, e])).values());
    setEventos(unicos.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)));
  }, [eventosComTenant, semTenantBudgets]);


 const abrirEditarFranq = (f) => {
 setEditandoFranq(f);
 setFormEditFranq({ nome: f.name || '', email: f.email || '', unidadeId: f.unidadeId || '', cargoId: f.cargoId || '', active: f.active !== false });
 };

 const salvarEditFranq = async () => {
 if (!formEditFranq.nome.trim() || !formEditFranq.email.trim()) { alert('Nome e email são obrigatórios'); return; }
 if (!formEditFranq.cargoId) { alert('Selecione o cargo'); return; }
 setSavingEditFranq(true);
 try {
 const cargoEscolhido = cargosCliente.find(c => c.id === formEditFranq.cargoId);
 const emailMudou = formEditFranq.email.trim() !== (editandoFranq.email || '');

 // O e-mail é tratado à parte — precisa trocar o LOGIN de verdade no
 // Firebase Authentication (Admin SDK, só roda no servidor), senão o
 // colaborador fica com cadastro e login desincronizados e não consegue
 // mais entrar.
 if (emailMudou) {
 const idToken = await auth.currentUser.getIdToken();
 const resp = await fetch('/api/trocarEmailColaborador', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ idToken, userId: editandoFranq.id, novoEmail: formEditFranq.email.trim() }),
 });
 const data = await resp.json();
 if (!resp.ok) throw new Error(data.error || 'Erro ao trocar o e-mail de login.');
 }

 await updateDoc(doc(db, 'users', editandoFranq.id), {
 name: formEditFranq.nome.trim(),
 unidadeId: formEditFranq.unidadeId || null,
 cargoId: formEditFranq.cargoId,
 roleName: cargoEscolhido?.nome || '',
 active: formEditFranq.active,
 updatedAt: serverTimestamp(),
 });
 setFranqueados(prev => prev.map(f => f.id === editandoFranq.id ? { ...f, name: formEditFranq.nome.trim(), email: formEditFranq.email.trim(), unidadeId: formEditFranq.unidadeId || null, cargoId: formEditFranq.cargoId, roleName: cargoEscolhido?.nome || '', active: formEditFranq.active } : f));
 setEditandoFranq(null);
 } catch (e) { console.error(e); alert(`Erro: ${e.message}`); }
 finally { setSavingEditFranq(false); }
 };

 // ── Criar franqueado ─────────────────────────────────────────────────────────
 const handleCriarFranqueado = async () => {
 if (!formFranq.nome || !formFranq.email || !formFranq.senha) { alert('Nome, email e senha obrigatórios'); return; }
 if (!formFranq.cargoId) { alert('Selecione o cargo'); return; }
 setSavingFranq(true);
 // Cria um app secundário do Firebase só para este cadastro. Usar o "auth"
 // principal aqui trocaria a sessão logada para o usuário recém-criado
 // (comportamento padrão do Firebase Auth) — o app secundário evita isso.
 const secondaryApp = initializeApp(auth.app.options, `Secondary-${Date.now()}`);
 const secondaryAuth = getAuth(secondaryApp);
 try {
 // Cria auth (na instância secundária, não afeta a sessão do admin)
 const cred = await createUserWithEmailAndPassword(secondaryAuth, formFranq.email, formFranq.senha);
 const cargoEscolhido = cargosCliente.find(c => c.id === formFranq.cargoId);
 // Cria user no Firestore
 await addDoc(collection(db, 'users'), {
 uid: cred.user.uid,
 name: formFranq.nome,
 email: formFranq.email,
 systemRole: 'cliente',
 tipoConta: 'cliente',
 tenantId,
 companyName: tenantNome,
 unidadeId: formFranq.unidadeId || null,
 cargoId: formFranq.cargoId || '',
 roleName: cargoEscolhido?.nome || '',
 active: true,
 createdAt: serverTimestamp(),
 createdBy: userData?.id,
 });
 setFormFranq({ nome: '', email: '', senha: '', unidadeId: '', cargoId: '' });
 setShowNovoFranq(false);
 // Recarrega
 const snap = await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId), where('systemRole', '==', 'cliente')));
 setFranqueados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
 } catch (e) { console.error(e); alert(`Erro: ${e.message}`); }
 finally {
 // Encerra e descarta o app secundário — a sessão do admin nunca foi tocada
 try { await signOut(secondaryAuth); } catch (_) {}
 try { await deleteApp(secondaryApp); } catch (_) {}
 setSavingFranq(false);
 }
 };

 // ── Salvar verba ─────────────────────────────────────────────────────────────
  // ── Adicionar verba geral ──────────────────────────────────────────────────
  const handleAdicionarVerba = async () => {
    if (!formVerba.valor) { alert('Informe o valor'); return; }
    setSavingVerba2(true);
    try {
      const novaVerba = {
        valor:      parseFloat(formVerba.valor),
        descricao:  formVerba.descricao || '',
        dataInicio: formVerba.dataInicio || '',
        dataFim:    formVerba.dataFim    || '',
        createdAt:  serverTimestamp(),
        createdBy:  userData?.id,
      };
      const ref = await addDoc(collection(db, 'tenants', tenantId, 'verbas'), novaVerba);
      setVerbasGerais(p => [{ id: ref.id, ...novaVerba }, ...p]);
      setFormVerba({ valor: '', descricao: '', dataInicio: '', dataFim: '' });
      setShowNovaVerba(false);
    } catch (e) { console.error(e); alert('Erro ao adicionar verba.'); }
    finally { setSavingVerba2(false); }
  };

  // ── Atribuir verba ao franqueado ────────────────────────────────────────────
  const [showFormUnidade, setShowFormUnidade] = useState(false);
 const [editandoPermissoes, setEditandoPermissoes] = useState(null); // franqueado sendo editado
 const [permissoesCustomForm, setPermissoesCustomForm] = useState({});
 const [savingPermissoes, setSavingPermissoes] = useState(false);
  const [editandoUnidade, setEditandoUnidade] = useState(null);
  const [formUnidade, setFormUnidade] = useState({ nome: '', cidade: '', ativo: true });
  const [savingUnidade, setSavingUnidade] = useState(false);

  const abrirNovaUnidade = () => {
    setEditandoUnidade(null);
    setFormUnidade({ nome: '', cidade: '', ativo: true });
    setShowFormUnidade(true);
  };

  const abrirEditarUnidade = (u) => {
    setEditandoUnidade(u);
    setFormUnidade({ nome: u.nome || '', cidade: u.cidade || '', ativo: u.ativo !== false });
    setShowFormUnidade(true);
  };

  const salvarUnidade = async () => {
    if (!formUnidade.nome.trim()) { alert('Nome da unidade é obrigatório'); return; }
    setSavingUnidade(true);
    try {
      // Não mexe em saldoVerba/periodoUso aqui — isso é atribuído só pela
      // aba Verbas, pra não sobrescrever sem querer o saldo já existente.
      const data = {
        nome: formUnidade.nome.trim(),
        cidade: formUnidade.cidade.trim(),
        ativo: formUnidade.ativo,
        updatedAt: serverTimestamp(),
      };
      if (editandoUnidade) {
        await updateDoc(doc(db, 'tenants', tenantId, 'unidades', editandoUnidade.id), data);
      } else {
        await addDoc(collection(db, 'tenants', tenantId, 'unidades'), { ...data, saldoVerba: 0, periodoUso: '', createdAt: serverTimestamp() });
      }
      setShowFormUnidade(false);
    } catch (e) { console.error(e); alert('Erro ao salvar unidade.'); }
    finally { setSavingUnidade(false); }
  };

  const excluirUnidade = async (u) => {
    if (!window.confirm(`Excluir a unidade "${u.nome}"? Franqueados vinculados a ela não são apagados, mas ficarão sem unidade.`)) return;
    try { await deleteDoc(doc(db, 'tenants', tenantId, 'unidades', u.id)); }
    catch (e) { console.error(e); alert('Erro ao excluir.'); }
  };

  const abrirPermissoes = (f) => {
    setEditandoPermissoes(f);
    setPermissoesCustomForm(f.permissoesCustom || {});
  };

  const salvarPermissoes = async () => {
    setSavingPermissoes(true);
    try {
      await updateDoc(doc(db, 'users', editandoPermissoes.id), { permissoesCustom: permissoesCustomForm });
      setFranqueados(p => p.map(f => f.id === editandoPermissoes.id ? { ...f, permissoesCustom: permissoesCustomForm } : f));
      setEditandoPermissoes(null);
    } catch (e) { console.error(e); alert('Erro ao salvar permissões.'); }
    finally { setSavingPermissoes(false); }
  };

  const handleAtribuirVerba = async () => {
    if (!showGerenciarVerba || !valorAtribuir) { alert('Informe o valor'); return; }
    setSavingVerba(true);
    try {
      const novoSaldo = (parseFloat(showGerenciarVerba.saldoVerba) || 0) + parseFloat(valorAtribuir);
      const novoPeriodo = periodoAtribuir || showGerenciarVerba.periodoUso || '';
      if (showGerenciarVerba.tipo === 'matriz') {
        await updateDoc(doc(db, 'tenants', tenantId), { saldoVerba: novoSaldo, periodoUso: novoPeriodo, updatedAt: serverTimestamp() });
        setTenantData(p => ({ ...p, saldoVerba: novoSaldo, periodoUso: novoPeriodo }));
      } else {
        await updateDoc(doc(db, 'tenants', tenantId, 'unidades', showGerenciarVerba.id), { saldoVerba: novoSaldo, periodoUso: novoPeriodo, updatedAt: serverTimestamp() });
        setUnidades(p => p.map(u => u.id === showGerenciarVerba.id ? { ...u, saldoVerba: novoSaldo, periodoUso: novoPeriodo } : u));
      }
      setShowGerenciarVerba(null);
      setValorAtribuir('');
      setPeriodoAtribuir('');
    } catch (e) { console.error(e); alert('Erro ao atribuir verba.'); }
    finally { setSavingVerba(false); }
  };

 // ── Métricas ─────────────────────────────────────────────────────────────────
 const totalEventos = eventos.length;
 const eventosAtivos = eventos.filter(e => !['completed', 'rejected'].includes(e.status)).length;
 const totalGasto = eventos.reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
 const totalVerba = franqueados.reduce((acc, f) => acc + (f.verbaMensal || 0) * 12 + (f.verbalAnual || 0), 0);

 // ── Render ───────────────────────────────────────────────────────────────────
 return (
 <div style={{ minHeight: '100vh', background: '#ccd4ea', fontFamily: 'Outfit, sans-serif' }}>

 {/* Sidebar — mesmo visual do admin principal (App.css: .sidebar, .nav-item, etc.) */}
 <aside className="sidebar">
 <div className="sidebar-header" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
 {tenant?.logo
 ? <img src={tenant.logo} alt={tenantNome} style={{ height: 48, objectFit: 'contain', marginBottom: 8 }} />
 : <h1 className="logo">{tenantNome}</h1>}
 <p className="logo-subtitle" style={{ fontSize: 11, color: 'rgba(232,244,255,0.55)', letterSpacing: 1.5 }}>REALIZE<span style={{ color: '#00E5C4', fontWeight: 600 }}>HUB</span></p>
 </div>
 {/* Nav */}
 <nav className="sidebar-nav">
 {[
 { id: 'overview', label: 'Visão Geral' },
 { id: 'franqueados', label: 'Colaboradores' },
 { id: 'unidades', label: 'Unidades' },
 { id: 'eventos', label: 'Eventos' },
 { id: 'verbas', label: 'Verbas' },
 { id: 'marketing', label: 'Marketing' },
 ].map(item => (
 <button key={item.id} className={view === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setView(item.id)}>
 <span className="nav-text">{item.label}</span>
 </button>
 ))}
 </nav>
 {/* Footer */}
 <div className="sidebar-footer">
 <div className="user-info">
 <div className="user-avatar"></div>
 <div className="user-details">
 <p className="user-name">{userData?.name}</p>
 <p className="user-email">{userData?.email}</p>
 </div>
 </div>
 <button className="logout-btn" onClick={onLogout}>Sair</button>
 </div>
 </aside>

 {/* Conteúdo */}
 <div style={{ marginLeft: 230, padding: '32px 32px' }}>

        {/* Header de boas-vindas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 0 20px 0', marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
          <div />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{userData?.name}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {tenantNome}{userData?.roleName ? ` · ${userData.roleName}` : ''}
            </div>
          </div>
          <div />
        </div>

 {/* ── VISÃO GERAL ─────────────────────────────────────────────────── */}
 {view === 'overview' && (
 <>
 <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 24 }}>Visão Geral — {tenantNome}</div>
 {/* Cards de métricas */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
 {[
 { label: 'Colaboradores', value: franqueados.length, icon: '', cor: corPrimary },
 { label: 'Unidades ativas', value: unidades.filter(u => u.ativo !== false).length, icon: '', cor: '#AB47BC' },
 { label: 'Eventos ativos', value: eventosAtivos, icon: '', cor: '#0080FF' },
 { label: 'Eventos acontecendo', value: eventos.filter(e => e.workspaceStage === 'Acontecendo').length, icon: '', cor: '#FFA726' },
 { label: 'Total de eventos',value: totalEventos, icon: '', cor: '#667eea' },
 { label: 'Verba utilizada', value: formatBRL(totalGasto), icon: '', cor: '#66BB6A' },
 ].map((m, i) => (
 <div key={i} style={{ background: '#e3eafa', borderRadius: 14, padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
 <div style={{ fontSize: 22 }}>{m.icon}</div>
 <div style={{ fontSize: 24, fontWeight: 700, color: m.cor }}>{m.value}</div>
 <div style={{ fontSize: 12, color: '#475569' }}>{m.label}</div>
 </div>
 ))}
 </div>
 </>
 )}

 {/* ── FRANQUEADOS ──────────────────────────────────────────────────── */}
 {view === 'franqueados' && (
 <>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
 <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Colaboradores</div>
 {pode('franqueados', 'C') && (
 <button onClick={() => setShowNovoFranq(true)}
 style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
 + Novo Colaborador
 </button>
 )}
 </div>
 <div style={{ background: '#ccd4ea', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
 {franqueados.map(f => {
 const evsFranq = eventos.filter(e => e.clientUserId === f.id);
 const gastoFranq = evsFranq.filter(e => (e.financeiro?.parcelas?.length > 0) && e.financeiro.parcelas.every(p => p.pago)).reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
 return (
 <div key={f.id} style={{ background: '#e3eafa', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
 <div style={{ width: 44, height: 44, borderRadius: '50%', background: corPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
 {(f.name || 'F')[0].toUpperCase()}
 </div>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{f.name}</div>
 <div style={{ fontSize: 12, color: '#475569' }}>{f.email} {unidadeDe(f).nome ? `· ${unidadeDe(f).nome}` : ''} {unidadeDe(f).cidade ? `· ${unidadeDe(f).cidade}` : ''}</div>
 </div>
 <div style={{ textAlign: 'right', flexShrink: 0 }}>
 <div style={{ fontSize: 12, color: '#475569' }}>{evsFranq.length} evento(s)</div>
 <div style={{ fontSize: 13, fontWeight: 700, color: corAccent }}>{formatBRL(gastoFranq)} utilizado</div>
 </div>
 <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
 <button onClick={() => abrirEditarFranq(f)}
 style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(61,76,107,0.2)', background: 'none', color: '#3d4c6b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>
 Editar
 </button>
 <button onClick={() => abrirPermissoes(f)}
 style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(61,76,107,0.2)', background: 'none', color: '#3d4c6b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>
 Permissões
 </button>
 </div>
 </div>
 );
 })}
 {franqueados.length === 0 && !loading && (
 <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
 <div>Nenhum colaborador cadastrado ainda.</div>
 </div>
 )}
 </div>
 </>
 )}

 {/* ── UNIDADES ─────────────────────────────────────────────────────── */}
 {view === 'unidades' && (
 <>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
 <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Unidades</div>
 <button onClick={abrirNovaUnidade} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
 + Nova Unidade
 </button>
 </div>
 <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
 Cada unidade (ex: uma loja/filial) pode ter vários colaboradores vinculados a ela — verba e período de uso ficam na unidade, não em cada pessoa.
 </div>
 <div style={{ background: '#ccd4ea', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
 {unidades.map(u => (
 <div key={u.id} style={{ background: '#e3eafa', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, opacity: u.ativo === false ? 0.6 : 1 }}>
 <div style={{ flex: 1 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{u.nome}</span>
 {u.cidade && <span style={{ fontSize: 11, color: '#475569' }}>· {u.cidade}</span>}
 {u.ativo === false && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>INATIVA</span>}
 </div>
 <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
 Verba: {formatBRL(u.saldoVerba || 0)}{u.periodoUso ? ` · ${u.periodoUso}` : ''}
 </div>
 </div>
 <div style={{ display: 'flex', gap: 8 }}>
 <button onClick={() => abrirEditarUnidade(u)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(61,76,107,0.2)', background: 'none', color: '#3d4c6b', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
 <button onClick={() => excluirUnidade(u)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Excluir</button>
 </div>
 </div>
 ))}
 {unidades.length === 0 && !loading && (
 <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
 <div>Nenhuma unidade cadastrada ainda.</div>
 </div>
 )}
 </div>
 </>
 )}

 {/* ── EVENTOS ──────────────────────────────────────────────────────── */}
 {view === 'eventos' && (
 <>
 <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 24 }}>Todos os Eventos</div>
 <div style={{ background: '#ccd4ea', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
 {eventos.map(ev => {
 const franq = franqueados.find(f => f.id === ev.clientUserId);
 return (
 <div key={ev.id} onClick={() => setEventoSelecionado(ev)} style={{ cursor: 'pointer', background: '#e3eafa', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{ev.eventName || 'Sem nome'}</div>
 <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
 {franq?.name || ev.clientName} · {ev.location || ev.briefingData?.evento?.cidade || '—'} · {formatDate(ev.createdAt)}
 </div>
 <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
 {ev.startDate ? new Date(ev.startDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
 {ev.endDate && ev.endDate !== ev.startDate ? ` → ${new Date(ev.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
 </div>
 </div>
 <div style={{ textAlign: 'right', flexShrink: 0 }}>
 <div style={{ fontSize: 15, fontWeight: 700, color: corAccent }}>{formatBRL(ev.orcamentoFinal?.total)}</div>
 <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, padding: '2px 8px', borderRadius: 6, display: 'inline-block', background: ev.status === 'approved' ? 'rgba(102,187,106,0.15)' : ev.status === 'analyzing' ? 'rgba(255,167,38,0.15)' : 'rgba(102,126,234,0.15)', color: ev.status === 'approved' ? '#16a34a' : ev.status === 'analyzing' ? '#d97706' : '#667eea' }}>
 {ev.status === 'approved' ? 'APROVADO' : ev.status === 'analyzing' ? 'EM ANÁLISE' : (ev.status || '—').toUpperCase()}
 </div>
 </div>
 </div>
 );
 })}
 {eventos.length === 0 && !loading && (
 <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
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
              const totalSaldos  = franqueados.reduce((acc, f) => acc + (f.saldoVerba || 0), 0);
              // Utilizado = parcelas do cliente todas marcadas como pagas pelo
              // Financeiro (não basta o coordenador ter enviado o relatório).
              const estaPago = (e) => (e.financeiro?.parcelas?.length > 0) && e.financeiro.parcelas.every(p => p.pago);
              // Alocado = tudo que ainda não foi pago (e não foi cancelado) —
              // inclui eventos já concluídos mas aguardando confirmação do Financeiro.
              const totalAlocado = eventos.filter(e => e.status !== 'rejected' && !estaPago(e)).reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
              const totalUsado   = eventos.filter(estaPago).reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
              const livre        = Math.max(0, totalPool - totalAlocado - totalUsado);
              const pctAlocado   = totalPool > 0 ? Math.min(100, (totalAlocado / totalPool) * 100) : 0;
              const pctUsado     = totalPool > 0 ? Math.min(100, (totalUsado   / totalPool) * 100) : 0;
              return (
                <div style={{ background: '#e3eafa', borderRadius: 14, padding: '20px 24px', marginBottom: 20, borderLeft: `4px solid ${corPrimary}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#3d4c6b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>Carteira Geral</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>Total carregado</div><div style={{ fontSize: 18, fontWeight: 700, color: corPrimary }}>{formatBRL(totalPool)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>Alocado (em eventos)</div><div style={{ fontSize: 18, fontWeight: 700, color: '#FFA726' }}>{formatBRL(totalAlocado)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>Utilizado (pago)</div><div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{formatBRL(totalUsado)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>Livre</div><div style={{ fontSize: 18, fontWeight: 700, color: corAccent }}>{formatBRL(livre)}</div></div>
                  </div>
                  {/* Barra dupla: alocado (amarelo) + utilizado (vermelho) */}
                  <div style={{ borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 6, display: 'flex' }}>
                    <div style={{ width: `${pctUsado}%`, height: '100%', background: '#ef4444', transition: 'width 0.5s' }} />
                    <div style={{ width: `${pctAlocado}%`, height: '100%', background: '#FFA726', transition: 'width 0.5s' }} />
                    <div style={{ flex: 1, height: '100%', background: corAccent, opacity: 0.3, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 10, color: '#475569', marginBottom: 16 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />Utilizado {pctUsado.toFixed(1)}%</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFA726', display: 'inline-block' }} />Alocado {pctAlocado.toFixed(1)}%</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: corAccent, display: 'inline-block' }} />Livre {(100 - pctUsado - pctAlocado).toFixed(1)}%</span>
                  </div>
                  {verbasGerais.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(61,76,107,0.15)', paddingTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#3d4c6b', textTransform: 'uppercase', marginBottom: 8 }}>Histórico de cargas</div>
                      {verbasGerais.map(v => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(61,76,107,0.1)' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{formatBRL(v.valor)}</div>
                            <div style={{ fontSize: 11, color: '#475569' }}>
                              {v.descricao && `${v.descricao} · `}
                              {v.dataInicio && new Date(v.dataInicio+'T12:00:00').toLocaleDateString('pt-BR')}
                              {v.dataFim && ` → ${new Date(v.dataFim+'T12:00:00').toLocaleDateString('pt-BR')}`}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: '#475569' }}>{formatDate(v.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Por Unidade (+ Matriz) */}
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Verbas por Unidade</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                // Descobre a qual unidade (ou matriz, se nenhuma) um evento
                // pertence, olhando quem é o cliente dono do evento.
                const unidadeIdDoEvento = (e) => {
                  const f = franqueados.find(fr => fr.id === e.clientUserId || fr.uid === e.clientUserId);
                  return f?.unidadeId || null;
                };
                const estaPagoEv = (e) => (e.financeiro?.parcelas?.length > 0) && e.financeiro.parcelas.every(p => p.pago);
                const buckets = [
                  { tipo: 'matriz', id: tenantId, nome: 'Matriz (Empresa-mãe)', saldoVerba: tenantData?.saldoVerba || 0, periodoUso: tenantData?.periodoUso || '' },
                  ...unidades.map(u => ({ tipo: 'unidade', id: u.id, nome: u.nome, cidade: u.cidade, saldoVerba: u.saldoVerba || 0, periodoUso: u.periodoUso || '' })),
                ];
                return buckets.map(b => {
                  const evsBucket = eventos.filter(e => {
                    const uid = unidadeIdDoEvento(e);
                    return b.tipo === 'matriz' ? !uid : uid === b.id;
                  });
                  const alocBucket  = evsBucket.filter(e => e.status !== 'rejected' && !estaPagoEv(e)).reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
                  const usadoBucket = evsBucket.filter(estaPagoEv).reduce((acc, e) => acc + (e.orcamentoFinal?.total || 0), 0);
                  const saldo = b.saldoVerba || 0;
                  const pctA  = saldo > 0 ? Math.min(100, (alocBucket  / saldo) * 100) : 0;
                  const pctU  = saldo > 0 ? Math.min(100, (usadoBucket / saldo) * 100) : 0;
                  return (
                    <div key={b.id} style={{ background: '#e3eafa', borderRadius: 12, padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{b.nome}</div>
                          <div style={{ fontSize: 12, color: '#475569' }}>{b.tipo === 'matriz' ? 'Vê tudo da empresa' : b.cidade}{b.periodoUso ? ` · ${b.periodoUso}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: corPrimary }}>{formatBRL(saldo)}</div>
                            <div style={{ fontSize: 11, color: '#475569' }}>saldo atribuído</div>
                          </div>
                          <button onClick={() => { setShowGerenciarVerba(b); setValorAtribuir(''); setPeriodoAtribuir(''); }}
                            style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${corPrimary}`, background: 'none', color: corPrimary, fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                            Gerenciar
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: '#475569' }}>Alocado: <strong style={{ color: '#FFA726' }}>{formatBRL(alocBucket)}</strong></div>
                        <div style={{ fontSize: 12, color: '#475569' }}>Utilizado: <strong style={{ color: '#ef4444' }}>{formatBRL(usadoBucket)}</strong></div>
                        <div style={{ fontSize: 12, color: '#475569' }}>Livre: <strong style={{ color: corAccent }}>{formatBRL(Math.max(0, saldo - alocBucket - usadoBucket))}</strong></div>
                      </div>
                      <div style={{ borderRadius: 6, height: 8, overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${pctU}%`, height: '100%', background: '#ef4444', transition: 'width 0.5s' }} />
                        <div style={{ width: `${pctA}%`, height: '100%', background: '#FFA726', transition: 'width 0.5s' }} />
                        <div style={{ flex: 1, height: '100%', background: corAccent, opacity: 0.3, transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{(pctU + pctA).toFixed(1)}% comprometido</div>
                    </div>
                  );
                });
              })()}
            </div>
          </>
        )}

      {/* ── MARKETING ────────────────────────────────────────────────────── */}
      {view === 'marketing' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Marketing</div>
            <button onClick={() => setShowNovaCampanha(true)}
              style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              + Nova Campanha
            </button>
          </div>

          {campanhas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
              Nenhuma campanha criada ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {campanhas.map(camp => (
                <div key={camp.id} style={{ ...card }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{camp.nome}</div>
                      <button onClick={() => toggleAtivaCampanha(camp)}
                        style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', background: camp.ativa ? 'rgba(102,187,106,0.12)' : 'rgba(148,163,184,0.15)', color: camp.ativa ? '#16a34a' : '#64748b' }}>
                        {camp.ativa ? 'ATIVA' : 'INATIVA'}
                      </button>
                    </div>
                    <button onClick={() => excluirCampanha(camp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>🗑️</button>
                  </div>

                  {camp.arquivos?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                      {camp.arquivos.map((a, i) => (
                        <div key={i} style={{ position: 'relative', width: 90 }}>
                          {a.tipo === 'foto' ? (
                            <img src={a.url} alt={a.nome} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                          ) : (
                            <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 90, height: 90, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8faff', textDecoration: 'none', padding: 6, boxSizing: 'border-box' }}>
                              <span style={{ fontSize: 22 }}>{a.tipo === 'video' ? '🎬' : '📄'}</span>
                              <span style={{ fontSize: 9, color: '#64748b', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', marginTop: 4 }}>{a.nome}</span>
                            </a>
                          )}
                          <button onClick={() => removerArquivoCampanha(camp, i)}
                            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[['documento', '📄 Documentos', '.pdf,.doc,.docx,.ppt,.pptx'], ['foto', '🖼️ Fotos', 'image/*'], ['video', '🎬 Vídeos', 'video/*']].map(([tipo, label, accept]) => (
                      <label key={tipo} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px dashed #cbd5e1', background: uploadingCampanhaId === camp.id ? '#f1f5f9' : 'white', color: uploadingCampanhaId === camp.id ? '#94a3b8' : '#475569', fontSize: 12, fontWeight: 600, cursor: uploadingCampanhaId === camp.id ? 'not-allowed' : 'pointer' }}>
                        {uploadingCampanhaId === camp.id ? 'Enviando...' : `+ ${label}`}
                        <input type="file" multiple accept={accept} style={{ display: 'none' }} disabled={uploadingCampanhaId === camp.id}
                          onChange={e => { const fs = Array.from(e.target.files); e.target.value = ''; uploadArquivosCampanha(camp.id, fs, tipo); }} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

 </div>

 {/* ── Modal Novo Colaborador ─────────────────────────────────────────── */}
 {showNovoFranq && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
 onClick={e => { if (e.target === e.currentTarget) setShowNovoFranq(false); }}>
 <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
 <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Novo Colaborador</div>
 <button onClick={() => setShowNovoFranq(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
 </div>
 <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
 <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Nome completo *</label><input value={formFranq.nome} onChange={e => setFormFranq(p => ({...p, nome: e.target.value}))} style={inp} placeholder="Nome do colaborador" /></div>
 <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Email *</label><input type="email" value={formFranq.email} onChange={e => setFormFranq(p => ({...p, email: e.target.value}))} style={inp} placeholder="email@franquia.com" /></div>
 <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Senha *</label><input type="password" value={formFranq.senha} onChange={e => setFormFranq(p => ({...p, senha: e.target.value}))} style={inp} placeholder="Mínimo 6 caracteres" /></div>
 <div style={{ gridColumn: '1/-1' }}>
   <label style={lbl}>Unidade (opcional)</label>
   <select value={formFranq.unidadeId} onChange={e => setFormFranq(p => ({...p, unidadeId: e.target.value}))} style={{ ...inp, background: 'white' }}>
     <option value="">Sem unidade — pessoa da empresa-mãe</option>
     {unidades.filter(u => u.ativo !== false).map(u => (
       <option key={u.id} value={u.id}>{u.nome}{u.cidade ? ` — ${u.cidade}` : ''}</option>
     ))}
   </select>
   <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
     Sem unidade, essa pessoa enxerga os dados de <strong>toda a empresa</strong> (todas as unidades). Escolhendo uma unidade, ela só vê o que é daquela unidade específica.
   </div>
 </div>
 <div style={{ gridColumn: '1/-1' }}>
   <label style={lbl}>Cargo</label>
   <select value={formFranq.cargoId} onChange={e => setFormFranq(p => ({...p, cargoId: e.target.value}))} style={{ ...inp, background: 'white' }}>
     <option value="">Selecione o cargo...</option>
     {cargosCliente.map(c => (
       <option key={c.id} value={c.id}>{c.nome} (nível {c.nivel})</option>
     ))}
   </select>
   {cargosCliente.length === 0 && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>Nenhum cargo cadastrado — popule os cargos padrão em Admin → Cargos primeiro.</div>}
 </div>
 </div>
 <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
 <button onClick={() => setShowNovoFranq(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
 <button onClick={handleCriarFranqueado} disabled={savingFranq}
 style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: savingFranq ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: savingFranq ? 0.7 : 1 }}>
 {savingFranq ? 'Criando...' : 'Criar colaborador'}
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

      {/* ── Modal Detalhes do Evento ────────────────────────────────────── */}
      {eventoSelecionado && (() => {
        const ev2  = eventoSelecionado;
        const bd   = ev2.briefingData || {};
        const evt  = bd.evento || {};
        const est  = bd.estrutura || {};
        const opc  = bd.opcoesSelecionadas || [];
        const labelPag = { '50_50': '50% entrada + 50% final', '30_60_90': '30/60/90 dias', 'a_vista': 'À vista' };
        const labelStatus = { analyzing: 'Em análise', pendingApproval: 'Ag. aprovação', approved: 'Aprovado', completed: 'Concluído', rejected: 'Recusado' };
        const corStatus   = { analyzing: '#FFA726', pendingApproval: '#0080FF', approved: '#66BB6A', completed: '#00E5C4', rejected: '#ef4444' };
        const franq = franqueados.find(f => f.id === ev2.clientUserId || f.uid === ev2.clientUserId);

        const SecTitle = ({ children }) => (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 18, paddingBottom: 6, borderBottom: '1px solid #f0f2f5' }}>{children}</div>
        );
        const InfoRow = ({ label, value }) => value ? (
          <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', minWidth: 110, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
            <span style={{ fontSize: 13, color: '#1e293b', flex: 1 }}>{value}</span>
          </div>
        ) : null;

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}
            onClick={e => { if (e.target === e.currentTarget) setEventoSelecionado(null); }}>
            <div style={{ background: 'white', width: '100%', maxWidth: 560, height: '100vh', overflow: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{ev2.eventName || 'Evento'}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{ev2.numeroPedido} · {franq?.name || ev2.clientName}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: `${corStatus[ev2.status] || '#94a3b8'}18`, color: corStatus[ev2.status] || '#94a3b8' }}>
                      {labelStatus[ev2.status] || ev2.status}
                    </span>
                    {ev2.orcamentoFinal?.total > 0 && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: corPrimary }}>{formatBRL(ev2.orcamentoFinal.total)}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setEventoSelecionado(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>

              {/* Conteúdo */}
              <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto' }}>

                {/* Resumo IA */}
                {ev2.descricaoBriefing && (
                  <>
                    <SecTitle>Sobre o Evento</SecTitle>
                    <div style={{ background: '#f8faff', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#475569', lineHeight: 1.7 }}>{ev2.descricaoBriefing}</div>
                  </>
                )}

                {/* Evento */}
                <SecTitle>Dados do Evento</SecTitle>
                <InfoRow label="Colaborador"   value={franq?.name || ev2.clientName} />
                <InfoRow label="Tipo"          value={evt.tipo || ev2.eventTypeName} />
                <InfoRow label="Nome"          value={evt.nome || ev2.eventName} />
                <InfoRow label="Empresa"       value={evt.nomeEmpresa} />
                <InfoRow label="Data início"   value={ev2.startDate ? new Date(ev2.startDate+'T12:00:00').toLocaleDateString('pt-BR') : null} />
                <InfoRow label="Data término"  value={ev2.endDate ? new Date(ev2.endDate+'T12:00:00').toLocaleDateString('pt-BR') : null} />
                <InfoRow label="Horário"       value={evt.horarioInicio ? `${evt.horarioInicio} às ${evt.horarioFim}` : null} />
                <InfoRow label="Cidade"        value={evt.cidade} />
                <InfoRow label="Local"         value={evt.local || ev2.location} />
                <InfoRow label="Participantes" value={evt.visitantesPorDia ? `${evt.visitantesPorDia} pessoas/dia` : null} />
                <InfoRow label="Pagamento"     value={labelPag[bd.formaPagamento]} />

                {/* Stand */}
                {est.ativo && (
                  <>
                    <SecTitle>Stand</SecTitle>
                    <InfoRow label="Tipo"      value={est.tipoEstande === 'modular' ? 'Modular' : 'Personalizado'} />
                    {bd.modeloEstande?.nome && <InfoRow label="Modelo" value={bd.modeloEstande.nome} />}
                    <InfoRow label="Área"      value={est.areaM2 > 0 ? `${est.areaM2} m²` : null} />
                    <InfoRow label="Teto"      value={est.alturaTeto} />
                    <InfoRow label="Montagem"  value={est.diasMontagem > 0 ? `${est.diasMontagem} dias antes` : null} />
                    {est.restricoes && <InfoRow label="Restrições" value={est.restricoes} />}
                    <InfoRow label="Identidade visual" value={est.identidadeVisual === 'sim' ? 'Sim, enviada' : 'Não definida'} />
                  </>
                )}

                {/* Serviços */}
                {opc.length > 0 && (
                  <>
                    <SecTitle>Serviços Contratados</SecTitle>
                    {['estrutura','operacao','gastronomia','entretenimento'].map(tipo => {
                      const itens = opc.filter(o => o.tipoServico === tipo);
                      if (!itens.length) return null;
                      const labels = { estrutura: 'Estrutura', operacao: 'Equipe', gastronomia: 'Gastronomia', entretenimento: 'Entretenimento' };
                      const cores  = { estrutura: '#0080FF', operacao: '#00E5C4', gastronomia: '#66BB6A', entretenimento: '#FFA726' };
                      return (
                        <div key={tipo} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: cores[tipo], textTransform: 'uppercase', marginBottom: 6 }}>{labels[tipo]}</div>
                          {itens.map((op, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#fafbff', border: '1px solid #f0f2f5', marginBottom: 4 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{op.serviceName}</div>
                                {op.nome && <div style={{ fontSize: 11, color: '#667eea' }}>Opção: {op.nome}</div>}
                              </div>
                              {op.valor > 0 && (
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: corAccent }}>{formatBRL(op.valor)}</div>
                                  {op.unidade && <div style={{ fontSize: 10, color: '#94a3b8' }}>{op.unidade}</div>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Orçamento */}
                {ev2.orcamentoFinal?.itens?.length > 0 && (
                  <>
                    <SecTitle>Orçamento</SecTitle>
                    {ev2.orcamentoFinal.itens.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8faff' }}>
                        <div style={{ fontSize: 13, color: '#475569' }}>{item.serviceName}{item.opcaoNome ? ` — ${item.opcaoNome}` : ''}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{formatBRL(item.subtotal)}</div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: '2px solid #f0f2f5' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Total</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: corPrimary }}>{formatBRL(ev2.orcamentoFinal.total)}</div>
                    </div>
                  </>
                )}

                {/* Info extra */}
                {bd.infoExtra && (
                  <>
                    <SecTitle>Observações</SecTitle>
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{bd.infoExtra}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* ── Modal Editar Colaborador ─────────────────────────────────────── */}
      {editandoFranq && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setEditandoFranq(null); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Editar Colaborador</div>
              <button onClick={() => setEditandoFranq(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Nome completo *</label>
                <input value={formEditFranq.nome} onChange={e => setFormEditFranq(p => ({ ...p, nome: e.target.value }))} style={inp} placeholder="Nome do colaborador" />
              </div>
              <div>
                <label style={lbl}>Email *</label>
                <input type="email" value={formEditFranq.email} onChange={e => setFormEditFranq(p => ({ ...p, email: e.target.value }))} style={inp} placeholder="email@franquia.com" />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                  Mudar aqui troca o e-mail de <strong>login</strong> de verdade — ele vai precisar entrar com esse novo e-mail a partir de agora.
                </div>
              </div>
              <div>
                <label style={lbl}>Unidade</label>
                <select value={formEditFranq.unidadeId} onChange={e => setFormEditFranq(p => ({ ...p, unidadeId: e.target.value }))} style={{ ...inp, background: 'white' }}>
                  <option value="">Sem unidade — pessoa da empresa-mãe</option>
                  {unidades.filter(u => u.ativo !== false).map(u => (
                    <option key={u.id} value={u.id}>{u.nome}{u.cidade ? ` — ${u.cidade}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Cargo</label>
                <select value={formEditFranq.cargoId} onChange={e => setFormEditFranq(p => ({ ...p, cargoId: e.target.value }))} style={{ ...inp, background: 'white' }}>
                  <option value="">Selecione o cargo...</option>
                  {cargosCliente.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} (nível {c.nivel})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="franq-ativo" checked={formEditFranq.active} onChange={e => setFormEditFranq(p => ({ ...p, active: e.target.checked }))} style={{ width: 16, height: 16, accentColor: corPrimary }} />
                <label htmlFor="franq-ativo" style={{ fontSize: 13, color: '#475569', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Colaborador ativo (desmarcar bloqueia o acesso dele)</label>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setEditandoFranq(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={salvarEditFranq} disabled={savingEditFranq}
                  style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: savingEditFranq ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: savingEditFranq ? 0.7 : 1 }}>
                  {savingEditFranq ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Permissões por pessoa ──────────────────────────────────── */}
      {editandoPermissoes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setEditandoPermissoes(null); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Permissões — {editandoPermissoes.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Cargo: {cargoDe(editandoPermissoes) || '—'}</div>
              </div>
              <button onClick={() => setEditandoPermissoes(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 0, marginBottom: 12 }}>
                Vem do cargo por padrão. Ajustes aqui valem só pra essa pessoa.
              </p>
              <PermissoesOverride
                tipoConta="cliente"
                cargo={cargosCliente.find(c => c.id === editandoPermissoes.cargoId)}
                permissoesCustom={permissoesCustomForm}
                onChange={setPermissoesCustomForm}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16 }}>
                <button onClick={() => setEditandoPermissoes(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={salvarPermissoes} disabled={savingPermissoes} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: savingPermissoes ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: savingPermissoes ? 0.7 : 1 }}>
                  {savingPermissoes ? 'Salvando...' : 'Salvar permissões'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Nova/Editar Unidade ─────────────────────────────────────── */}
      {showFormUnidade && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowFormUnidade(false); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{editandoUnidade ? 'Editar Unidade' : 'Nova Unidade'}</div>
              <button onClick={() => setShowFormUnidade(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Nome da unidade *</label>
                <input value={formUnidade.nome} onChange={e => setFormUnidade(p => ({ ...p, nome: e.target.value }))} style={inp} placeholder="Ex: Loja 1 São Paulo" autoFocus />
              </div>
              <div>
                <label style={lbl}>Cidade</label>
                <input value={formUnidade.cidade} onChange={e => setFormUnidade(p => ({ ...p, cidade: e.target.value }))} style={inp} placeholder="Ex: São Paulo" />
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>A verba dessa unidade é atribuída depois, na aba "Verbas".</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="unidade-ativa" checked={formUnidade.ativo} onChange={e => setFormUnidade(p => ({ ...p, ativo: e.target.checked }))} style={{ width: 16, height: 16, accentColor: corPrimary }} />
                <label htmlFor="unidade-ativa" style={{ fontSize: 13, color: '#475569', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Unidade ativa</label>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowFormUnidade(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
                <button onClick={salvarUnidade} disabled={savingUnidade} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: savingUnidade ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: savingUnidade ? 0.7 : 1 }}>
                  {savingUnidade ? 'Salvando...' : editandoUnidade ? 'Salvar alterações' : 'Criar unidade'}
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
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Verba — {showGerenciarVerba.nome}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Saldo atual: {formatBRL(showGerenciarVerba.saldoVerba || 0)}{showGerenciarVerba.periodoUso ? ` · Período atual: ${showGerenciarVerba.periodoUso}` : ''}</div>
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
                const totalAloc = (tenantData?.saldoVerba || 0) + unidades.reduce((acc, u) => acc + (u.saldoVerba || 0), 0);
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

      {/* ── Modal Nova Campanha ──────────────────────────────────────────── */}
      {showNovaCampanha && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowNovaCampanha(false); }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Nova Campanha</div>
              <button onClick={() => setShowNovaCampanha(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Nome da campanha *</label>
                <input value={nomeCampanha} onChange={e => setNomeCampanha(e.target.value)} style={inp} placeholder="Ex: Campanha Verão 2026" autoFocus onKeyDown={e => e.key === 'Enter' && criarCampanha()} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f0f2f5' }}>
                <button onClick={() => setShowNovaCampanha(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={criarCampanha} disabled={savingCampanha || !nomeCampanha.trim()}
                  style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: corPrimary, color: 'white', fontSize: 13, fontWeight: 600, cursor: savingCampanha ? 'not-allowed' : 'pointer', opacity: !nomeCampanha.trim() ? 0.5 : 1 }}>
                  {savingCampanha ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

 {/* ── Modal Gerenciar Verba ─────────────────────────────────────────── */}
 </div>
 );
}
