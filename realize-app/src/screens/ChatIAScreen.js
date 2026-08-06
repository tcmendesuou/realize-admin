import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  collection, getDocs, addDoc, updateDoc, doc, query, where,
  serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// ChatIAScreen — Fase 1 (reconstrução completa): motor de chat orientado a
// dados, igual ao ClienteChatV4.js da web — lê Banco de Perguntas + Tipos de
// Evento do Firestore, navega a árvore condicional (sub-perguntas), e ao
// final gera o mesmo budget + supplierJobs que a web gera.
//
// Simplificações dessa primeira leva mobile (documentadas, ajustar depois):
// - Catálogo de modelos especiais (Estande Modular): mostra 1 foto por
//   modelo (sem carrossel ainda)
// - Detalhes por pessoa da Equipe e vestuário da recepcionista: mesmo
//   comportamento especial da web, adaptado pros componentes do celular
// ─────────────────────────────────────────────────────────────────────────────

const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const HORARIOS = ['06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00','22:30','23:00','23:30'];
const ESTADOS_BR = [
  'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal',
  'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul',
  'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
  'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia',
  'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins',
];
// Compara o Estado do evento com a Região de atendimento do fornecedor —
// mesma lógica do ClienteChatV4.js (web).
const ESTADOS_COM_REGIAO_PROPRIA = ['São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Paraná', 'Santa Catarina', 'Rio Grande do Sul', 'Bahia', 'Goiás', 'Distrito Federal'];
const estadoBateComRegiao = (estadoEvento, regiaoFornecedor) => {
  if (!regiaoFornecedor) return true;
  if (regiaoFornecedor === 'Nacional') return true;
  if (!estadoEvento) return true;
  if (regiaoFornecedor === 'São Paulo - Capital' || regiaoFornecedor === 'São Paulo - Interior') return estadoEvento === 'São Paulo';
  if (regiaoFornecedor === 'Outros') return !ESTADOS_COM_REGIAO_PROPRIA.includes(estadoEvento);
  return regiaoFornecedor === estadoEvento;
};
const BLOQUEADOS_ESTRUTURA = ['estande', 'stand', 'desenvolvimento'];
const BLOQUEADOS_EQUIPE    = ['produtor', 'roupa', 'vestuario', 'vestuário'];
const DESTINO_PARA_SETOR     = { 'catalogo.estrutura': 'estrutura', 'catalogo.equipe': 'operacao', 'catalogo.gastronomia': 'gastronomia', 'catalogo.entretenimento': 'entretenimento' };
const DESTINO_PARA_CAMPO_SEL = { 'catalogo.estrutura': 'estruturaSelecionada', 'catalogo.equipe': 'equipeSelecionada', 'catalogo.gastronomia': 'gastronomeSelecionada', 'catalogo.entretenimento': 'servicosSelecionados' };
const CAMPO_DESTINO = {
  'evento.nomeEmpresa': 'nomeEmpresa', 'evento.nomeEvento': 'nomeEvento', 'evento.dataInicio': 'dataInicio',
  'evento.dataFim': 'dataFim', 'evento.visitantesPorDia': 'visitantesPorDia',
  'pagamento.formaPagamento': 'formaPagamento', 'stand.tipoEstande': 'tipoEstande',
  'stand.standDescricao': 'standDescricao', 'stand.standImagensUrls': 'standImagensUrls',
  'stand.areaM2': 'areaM2', 'stand.alturaTeto': 'alturaTeto', 'stand.diasMontagem': 'diasMontagem',
  'stand.restricoes': 'restricoes', 'stand.identidadeVisual': 'identidadeVisual',
  'stand.identidadeImagensUrls': 'identidadeImagensUrls', 'extra.infoExtra': 'infoExtra',
  'stand.usarCampanha': 'usarCampanhaMarketing',
};

// ── Componentes base ─────────────────────────────────────────────────────────
const Pergunta = ({ texto, subtitulo }) => (
  <View style={{ marginBottom: 24 }}>
    <Text style={styles.perguntaTexto}>{(texto || '').replace(/\*\*/g, '')}</Text>
    {subtitulo ? <Text style={styles.perguntaSub}>{subtitulo}</Text> : null}
  </View>
);

const OpcaoBtn = ({ onPress, label, selected }) => (
  <TouchableOpacity onPress={onPress} style={[styles.opcaoBtn, selected && styles.opcaoBtnSel]}>
    <View style={[styles.radioCirc, selected && styles.radioCircSel]}>
      {selected && <View style={styles.radioDot} />}
    </View>
    <Text style={[styles.opcaoTexto, selected && styles.opcaoTextoSel]}>{label}</Text>
  </TouchableOpacity>
);

const CheckOpcao = ({ onPress, label, checked }) => (
  <TouchableOpacity onPress={onPress} style={[styles.opcaoBtn, checked && styles.opcaoBtnSel]}>
    <View style={[styles.checkQuad, checked && styles.checkQuadSel]}>
      {checked && <Text style={styles.checkMark}>✓</Text>}
    </View>
    <Text style={[styles.opcaoTexto, checked && styles.opcaoTextoSel]}>{label}</Text>
  </TouchableOpacity>
);

const BtnAvancar = ({ onPress, disabled, texto = 'Continuar →', loading }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled || loading} style={[styles.btnAvancar, disabled && styles.btnAvancarDisabled]}>
    {loading ? <ActivityIndicator color="#0A1626" /> : <Text style={styles.btnAvancarTexto}>{texto}</Text>}
  </TouchableOpacity>
);

// Calendário visual (Dia/Mês/Ano sempre nessa ordem, não depende do aparelho)
// — mesmo comportamento do calendário da web (StepCalendarBR).
const MESES_BR = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA_BR = ['D','S','T','Q','Q','S','S'];
const CalendarioMobile = ({ valorInicial, onSelecionar }) => {
  const hoje = new Date();
  const [mesAtual, setMesAtual] = useState(hoje.getMonth());
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear());
  const [selecionado, setSelecionado] = useState(valorInicial || null);

  const primeiroDiaSemana = new Date(anoAtual, mesAtual, 1).getDay();
  const diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
  const celulas = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];

  const mudarMes = (delta) => {
    let m = mesAtual + delta, a = anoAtual;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    setMesAtual(m); setAnoAtual(a);
  };

  const escolherDia = (d) => {
    if (!d) return;
    const valor = `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    setSelecionado(valor);
    onSelecionar(valor);
  };

  return (
    <View style={styles.calendarioBox}>
      <View style={styles.calendarioHeader}>
        <TouchableOpacity onPress={() => mudarMes(-1)} style={styles.calendarioNavBtn}><Text style={styles.calendarioNavTexto}>‹</Text></TouchableOpacity>
        <Text style={styles.calendarioMesAno}>{MESES_BR[mesAtual]} {anoAtual}</Text>
        <TouchableOpacity onPress={() => mudarMes(1)} style={styles.calendarioNavBtn}><Text style={styles.calendarioNavTexto}>›</Text></TouchableOpacity>
      </View>
      <View style={styles.calendarioSemana}>
        {DIAS_SEMANA_BR.map((d, i) => <Text key={i} style={styles.calendarioDiaSemana}>{d}</Text>)}
      </View>
      <View style={styles.calendarioGrid}>
        {celulas.map((d, i) => {
          const valorCel = d ? `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
          const isSel = !!valorCel && valorCel === selecionado;
          return (
            <TouchableOpacity key={i} disabled={!d} onPress={() => escolherDia(d)} style={[styles.calendarioCel, isSel && styles.calendarioCelSel]}>
              <Text style={[styles.calendarioCelTexto, isSel && styles.calendarioCelTextoSel]}>{d || ''}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// Carrossel de fotos do modelo de Estande — setas + bolinhas, igual a web.
const ModeloCarrosselMobile = ({ fotos, idx, onPrev, onNext, onDot }) => (
  <View style={{ width: '100%', height: '100%' }}>
    <Image source={{ uri: fotos[idx] }} style={styles.modeloImg} />
    {fotos.length > 1 && (
      <>
        <TouchableOpacity onPress={onPrev} style={[styles.carrosselSeta, { left: 4 }]}>
          <Text style={styles.carrosselSetaTexto}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNext} style={[styles.carrosselSeta, { right: 4 }]}>
          <Text style={styles.carrosselSetaTexto}>›</Text>
        </TouchableOpacity>
        <View style={styles.carrosselDots}>
          {fotos.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => onDot(i)} style={[styles.carrosselDot, i === idx && styles.carrosselDotAtivo]} />
          ))}
        </View>
      </>
    )}
  </View>
);

export default function ChatIAScreen({ navigation }) {
  const [userData, setUserData] = useState(null);
  const [tenantData, setTenantData] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [perguntasMap, setPerguntasMap] = useState({});
  const [tiposEvento, setTiposEvento] = useState([]);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const userStr = await AsyncStorage.getItem('loggedUser');
    if (userStr) setUserData(JSON.parse(userStr));
    const tenantStr = await AsyncStorage.getItem('tenantData');
    if (tenantStr) setTenantData(JSON.parse(tenantStr));

    try {
      const [pSnap, tSnap] = await Promise.all([
        getDocs(collection(db, 'perguntas')),
        getDocs(collection(db, 'tiposEvento')),
      ]);
      const map = {};
      pSnap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
      setPerguntasMap(map);
      setTiposEvento(tSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.ativo !== false));
    } catch (e) { console.error(e); setErroCarga(true); }
    finally { setCarregando(false); }
  };

  const userName = userData?.name || 'Cliente';
  const userId = userData?.uid || userData?.id || '';
  const tenantId = tenantData?.id || userData?.tenantId || null;
  const perfilQuemResponde = userData?.unidadeId || tenantId ? 'franqueado' : 'cliente_comum';

  const filhosDe = (paiId, valorResposta) => Object.values(perguntasMap)
    .filter(p => p.perguntaPaiId === paiId && p.ativo !== false)
    .filter(p => (p.condicaoRespostaPai == null || p.condicaoRespostaPai === valorResposta))
    .filter(p => p.quemResponde === 'todos' || p.quemResponde === perfilQuemResponde)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  const raizPergunta = Object.values(perguntasMap).find(p => p.destino === 'raiz.tipoEvento');

  const [tipoEscolhidoId, setTipoEscolhidoId] = useState(null);
  const [topoIdx, setTopoIdx] = useState(0);
  const [pilha, setPilha] = useState([]);
  const [stepAtualId, setStepAtualId] = useState('raiz');
  const [passoEspecial, setPassoEspecial] = useState(null);
  const [historicoNav, setHistoricoNav] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingOpcoes, setLoadingOpcoes] = useState(false);
  const [listaCatalogo, setListaCatalogo] = useState([]);
  const [faseCatalogo, setFaseCatalogo] = useState('selecao');
  const [modelosEspeciais, setModelosEspeciais] = useState([]);
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [carrosselIdx, setCarrosselIdx] = useState({});
  const [uploadingArquivo, setUploadingArquivo] = useState(false);
  const [opcoesEspecifico, setOpcoesEspecifico] = useState(null);
  const [loadingEspecifico, setLoadingEspecifico] = useState(false);
  const [faseEspecifico, setFaseEspecifico] = useState('pergunta'); // 'pergunta' (Sim/Não) | 'opcoes'
  const [campanhaAtiva, setCampanhaAtiva] = useState(undefined); // undefined = ainda não carregou; null = sem campanha ativa
  const [loadingCampanha, setLoadingCampanha] = useState(false);

  const [dados, setDados] = useState({
    temStand: null, tipoEstande: null, standDescricao: '', standImagensUrls: [],
    areaM2: '', alturaTeto: '', diasMontagem: '', restricoes: '', identidadeVisual: null, identidadeImagensUrls: [],
    usarCampanhaMarketing: null, identidadeCampanhaId: null, identidadeCampanhaNome: '',
    nomeEmpresa: tenantId ? (userData?.companyName || '') : '', tipoEvento: '', nomeEvento: '', dataInicio: '', dataFim: '',
    horarioInicio: '', horarioFim: '', cidade: '', estado: '', local: '', visitantesPorDia: '',
    temProdutor: null,
    estruturaSelecionada: [], equipeSelecionada: [], gastronomeSelecionada: [], servicosSelecionados: [], especificosSelecionados: [],
    equipeDetalhes: {}, infoExtra: '', formaPagamento: '',
    respostasGenericas: {},
  });

  useEffect(() => {
    getDocs(collection(db, 'modelosEspeciais')).then(snap => {
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.ativo !== false);
      setModelosEspeciais(tenantId ? todos.filter(m => !m.exclusiveTenants?.length || m.exclusiveTenants.includes(tenantId)) : todos);
    }).catch(console.error);
  }, [tenantId]);

  // Se a pergunta atual for "usar campanha de marketing" e não tem campanha
  // ativa pra mostrar, avança sozinha.
  useEffect(() => {
    if (campanhaAtiva !== null) return;
    const p = perguntasMap[stepAtualId];
    if (p?.tipo === 'campanha_marketing') {
      responder(p.id, null, { usarCampanhaMarketing: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhaAtiva, stepAtualId]);

  const set = (key, val) => setDados(p => ({ ...p, [key]: val }));

  const carregarCatalogo = async (setor) => {
    setLoadingOpcoes(true);
    try {
      const snap = await getDocs(query(collection(db, 'supplierServices'), where('tipoServico', '==', setor)));
      const servs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false);
      const bloqueados = setor === 'estrutura' ? BLOQUEADOS_ESTRUTURA : setor === 'operacao' ? BLOQUEADOS_EQUIPE : [];
      const filtrados = servs.filter(s => {
        const nome = normalize(s.serviceName || '') + ' ' + normalize(s.serviceParentName || '');
        if (bloqueados.some(b => nome.includes(b))) return false;
        if (tenantId) { const exc = s.exclusiveTenants || []; if (exc.length > 0 && !exc.includes(tenantId)) return false; }
        return true;
      });
      const comOpcoes = await Promise.all(filtrados.map(async s => {
        const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
        const opsForn = opSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.ativo !== false)
          .filter(o => estadoBateComRegiao(dados.estado, o.regiao));
        return { ...s, opcoes: opsForn };
      }));
      setListaCatalogo(comOpcoes.filter(s => s.opcoes.length > 0));
    } catch (e) { console.error(e); setListaCatalogo([]); }
    finally { setLoadingOpcoes(false); }
  };

  // Serviço específico exato (ex: "Roupa Recepcionista") — usado pelas
  // perguntas tipo "catalogo_especifico", mesma lógica da web.
  const carregarServicoEspecifico = async (servicoId) => {
    setLoadingEspecifico(true);
    try {
      const snap = await getDocs(query(collection(db, 'supplierServices'), where('serviceId', '==', servicoId)));
      const servs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ativo !== false)
        .filter(s => { if (tenantId) { const exc = s.exclusiveTenants || []; if (exc.length > 0 && !exc.includes(tenantId)) return false; } return true; });
      const todasOpcoes = [];
      for (const s of servs) {
        const opSnap = await getDocs(collection(db, 'supplierServices', s.id, 'opcoes'));
        const opsForn = opSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.ativo !== false)
          .filter(o => estadoBateComRegiao(dados.estado, o.regiao));
        for (const opForn of opsForn) {
          let opFinal = opForn;
          if (opForn.opcaoCatalogoId && s.serviceId) {
            try {
              const catSnap = await getDocs(collection(db, 'services', s.serviceId, 'opcoes'));
              const opCat = catSnap.docs.find(cd => cd.id === opForn.opcaoCatalogoId);
              if (opCat) opFinal = { ...opForn, valor: opCat.data().valor ?? 0, unidade: opCat.data().unidade ?? '', nome: opForn.nome || opCat.data().nome || '' };
            } catch (e) { console.error(e); }
          }
          todasOpcoes.push({ ...opFinal, serviceName: s.serviceName, serviceParentName: s.serviceParentName, tipoServico: s.tipoServico, supplierId: s.supplierId, supplierName: s.supplierName, opcaoNome: opFinal.nome || '' });
        }
      }
      setOpcoesEspecifico(todasOpcoes);
    } catch (e) { console.error(e); setOpcoesEspecifico([]); }
    finally { setLoadingEspecifico(false); }
  };

  // Campanha de Marketing ATIVA do tenant — mesma lógica da web.
  const carregarCampanhaAtiva = async () => {
    if (!tenantId) { setCampanhaAtiva(null); return; }
    setLoadingCampanha(true);
    try {
      const snap = await getDocs(query(collection(db, 'tenants', tenantId, 'campanhas'), where('ativa', '==', true)));
      const ativas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCampanhaAtiva(ativas.length > 0 ? ativas[0] : null);
    } catch (e) { console.error(e); setCampanhaAtiva(null); }
    finally { setLoadingCampanha(false); }
  };

  // ── Upload de imagens (múltiplas) via expo-image-picker ───────────────────
  const escolherImagens = async (campo) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permissão necessária', 'Precisamos de acesso às suas fotos.'); return; }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (resultado.canceled || !resultado.assets?.length) return;
    setUploadingArquivo(true);
    try {
      const urls = [];
      for (const asset of resultado.assets) {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const ext = asset.uri.split('.').pop() || 'jpg';
        const path = `briefings/${userId}/${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, blob);
        urls.push(await getDownloadURL(fileRef));
      }
      set(campo, [...(dados[campo] || []), ...urls]);
    } catch (e) { console.error(e); Alert.alert('Erro', 'Não foi possível enviar as imagens.'); }
    finally { setUploadingArquivo(false); }
  };

  // ── Navegação ────────────────────────────────────────────────────────────
  const empilharHistorico = () => setHistoricoNav(h => [...h, { tipoEscolhidoId, topoIdx, pilha, stepAtualId, passoEspecial, dados, faseCatalogo }]);

  const voltar = () => {
    if (historicoNav.length === 0) { navigation.goBack(); return; }
    const prev = historicoNav[historicoNav.length - 1];
    setHistoricoNav(h => h.slice(0, -1));
    setTipoEscolhidoId(prev.tipoEscolhidoId); setTopoIdx(prev.topoIdx); setPilha(prev.pilha);
    setStepAtualId(prev.stepAtualId); setPassoEspecial(prev.passoEspecial); setDados(prev.dados);
    setFaseCatalogo(prev.faseCatalogo);
  };

  const avancarDaRaiz = (tipoId) => {
    empilharHistorico();
    setTipoEscolhidoId(tipoId);
    setTopoIdx(0);
    setPilha([]);
    const tipo = tiposEvento.find(t => t.id === tipoId);
    const primeiraId = tipo?.perguntasIds?.[0];
    setStepAtualId(primeiraId || 'revisao');
  };

  // Checa se a condição de exibição de uma Pergunta Condicional foi atendida
  // — mesma lógica da web, incluindo o "dadosOverride" pra não depender do
  // estado já ter sido atualizado (React só aplica depois que a função termina).
  const condicaoAtendida = (pergunta, dadosOverride = {}) => {
    const dadosAtuais = { ...dados, ...dadosOverride };
    const cond = pergunta.condicaoExibicao;
    if (!cond || !cond.verificarDestino) return true;
    const alvo = normalize(cond.contemTexto || '');
    if (cond.verificarDestino.startsWith('pergunta:')) {
      const perguntaId = cond.verificarDestino.replace('pergunta:', '');
      const valorBruto = dadosAtuais.respostasGenericas?.[perguntaId];
      const valorTexto = typeof valorBruto === 'boolean' ? (valorBruto ? 'sim' : 'nao') : String(valorBruto || '');
      return normalize(valorTexto).includes(alvo);
    }
    const campoSel = DESTINO_PARA_CAMPO_SEL[cond.verificarDestino];
    if (campoSel) {
      const selecionados = dadosAtuais[campoSel] || [];
      return selecionados.some(s => normalize(s.serviceName || s.nome || '').includes(alvo));
    }
    const campo = CAMPO_DESTINO[cond.verificarDestino] || 'generico';
    const valorBruto = dadosAtuais[campo];
    const valorTexto = typeof valorBruto === 'boolean' ? (valorBruto ? 'sim' : 'nao') : String(valorBruto || '');
    return normalize(valorTexto).includes(alvo);
  };

  const proximoTopo = (novoIdx, dadosOverride = {}) => {
    const tipo = tiposEvento.find(t => t.id === tipoEscolhidoId);
    const lista = tipo?.perguntasIds || [];
    let i = novoIdx;
    while (i < lista.length) {
      const p = perguntasMap[lista[i]];
      if (p && p.ativo !== false && (p.quemResponde === 'todos' || p.quemResponde === perfilQuemResponde) && condicaoAtendida(p, dadosOverride)) break;
      i++;
    }
    setTopoIdx(i);
    setPilha([]);
    setStepAtualId(i < lista.length ? lista[i] : 'revisao');
  };

  const responder = (perguntaId, valorResposta, dadosExtra) => {
    empilharHistorico();
    if (dadosExtra) setDados(p => ({ ...p, ...dadosExtra }));
    const pergunta = perguntasMap[perguntaId];

    if (pergunta?.destino === 'catalogo.equipe') {
      setPassoEspecial('equipe_detalhes');
      return;
    }

    const filhos = filhosDe(perguntaId, valorResposta);
    if (filhos.length > 0) {
      setPilha(p => [...p, { lista: filhos, index: 0 }]);
      setStepAtualId(filhos[0].id);
      return;
    }
    avancarNaPilha(dadosExtra || {});
  };

  const avancarNaPilha = (dadosOverride = {}) => {
    setPilha(pAtual => {
      let p = [...pAtual];
      while (p.length > 0) {
        const topo = p[p.length - 1];
        const novoIndex = topo.index + 1;
        if (novoIndex < topo.lista.length) {
          p[p.length - 1] = { ...topo, index: novoIndex };
          setStepAtualId(topo.lista[novoIndex].id);
          return p;
        }
        p = p.slice(0, -1);
      }
      proximoTopo(topoIdx + 1, dadosOverride);
      return [];
    });
  };

  // ── Gancho especial: detalhes da Equipe + vestuário da recepcionista ──────
  const [equipeIdx, setEquipeIdx] = useState(0);
  const [equipeForm, setEquipeForm] = useState({ quantidade: '', horasPorDia: '', dias: '', observacoes: '' });

  const finalizarEquipeItem = () => {
    const equipe = dados.equipeSelecionada;
    const serv = equipe[equipeIdx];
    const novoDet = { ...dados.equipeDetalhes, [serv.serviceName]: equipeForm };
    set('equipeDetalhes', novoDet);
    setEquipeForm({ quantidade: '', horasPorDia: '', dias: '', observacoes: '' });
    if (equipeIdx + 1 < equipe.length) {
      setEquipeIdx(i => i + 1);
    } else {
      setEquipeIdx(0);
      finalizarEquipeDetalhes(novoDet);
    }
  };

  const finalizarEquipeDetalhes = async () => {
    setPassoEspecial(null);
    avancarNaPilha();
  };

  // ── Envio final — mesma lógica/schema da web (ClienteChatV4.js) ───────────
  const montarBriefingJson = () => {
    const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados, ...dados.especificosSelecionados];
    const respostasExtrasStand = Object.values(perguntasMap)
      .filter(p => p.mostrarNoBriefingStand && dados.respostasGenericas?.[p.id] !== undefined)
      .map(p => {
        const valorBruto = dados.respostasGenericas[p.id];
        const resposta = typeof valorBruto === 'boolean' ? (valorBruto ? 'Sim' : 'Não') : String(valorBruto);
        return { pergunta: p.texto, resposta };
      });
    return {
      evento: { tipo: dados.tipoEvento, nome: dados.nomeEvento, dataInicio: dados.dataInicio, dataFim: dados.dataFim, horario: `${dados.horarioInicio} às ${dados.horarioFim}`, horarioInicio: dados.horarioInicio, horarioFim: dados.horarioFim, cidade: dados.cidade, estado: dados.estado, local: dados.local, endereco: dados.local, visitantesPorDia: parseInt(dados.visitantesPorDia) || 0, nomeEmpresa: dados.nomeEmpresa,
        diasDuracao: (() => { if (dados.dataInicio && dados.dataFim) { const d = Math.round((new Date(dados.dataFim+'T12:00:00') - new Date(dados.dataInicio+'T12:00:00'))/(864e5))+1; return d > 0 ? d : 1; } return 1; })() },
      estrutura: { ativo: dados.temStand === true, tipoEstande: dados.tipoEstande || '', areaM2: parseFloat(dados.areaM2) || 0, alturaTeto: dados.alturaTeto, diasMontagem: parseInt(dados.diasMontagem) || 0, restricoes: dados.restricoes, identidadeVisual: dados.identidadeVisual ? 'sim' : 'nao', identidadeImagensUrls: dados.identidadeImagensUrls, standDescricao: dados.standDescricao, standImagensUrls: dados.standImagensUrls, observacoes: '', respostasExtras: respostasExtrasStand },
      tipoEstande: dados.tipoEstande || '', modeloEstande: modeloSelecionado || null,
      equipe: { produtor: { ativo: dados.temProdutor === true, dias: 0, observacoes: '' }, itens: dados.equipeSelecionada.map(s => ({ tipo: s.serviceName, quantidade: parseInt(dados.equipeDetalhes[s.serviceName]?.quantidade) || 1, horasPorDia: parseFloat(dados.equipeDetalhes[s.serviceName]?.horasPorDia) || 0, dias: parseInt(dados.equipeDetalhes[s.serviceName]?.dias) || 0, observacoes: dados.equipeDetalhes[s.serviceName]?.observacoes || '' })) },
      gastronomia: { alimentos: { ativo: dados.gastronomeSelecionada.length > 0, formato: dados.gastronomeSelecionada.map(s => s.serviceName).join(', '), pessoas: parseInt(dados.visitantesPorDia) || 0, restricoes: '', cozinha: false, observacoes: '' }, bar: { ativo: false } },
      servicosNecessarios: todas.map(s => s.serviceName),
      opcoesSelecionadas: todas.map(s => ({ supplierId: s.supplierId, serviceName: s.serviceName, serviceParentName: s.serviceParentName, tipoServico: s.tipoServico, opcaoCatalogoId: s.opcaoCatalogoId || '', nome: s.opcaoNome || '', valor: s.valor || null, unidade: s.unidade || '' })),
      selecoesCatalogo: {}, itensEmAnalise: [], infoExtra: dados.infoExtra, formaPagamento: dados.formaPagamento,
    };
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    const bj = montarBriefingJson();
    try {
      let assignedTo = null, assignedToName = null;
      try {
         const coordSnap = await getDocs(query(collection(db, 'users'), where('roleName', '==', 'Coordenador'), where('tipoConta', '==', 'realize'), where('active', '==', true)));
        const coords = coordSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (coords.length > 0) {
          const bSnap = await getDocs(query(collection(db, 'budgets'), where('status', '==', 'analyzing')));
          const cont = {}; bSnap.docs.forEach(d => { const at = d.data().assignedTo; if (at) cont[at] = (cont[at] || 0) + 1; });
          const e = coords.reduce((m, c) => (cont[c.id] || 0) < (cont[m.id] || 0) ? c : m);
          assignedTo = e.id; assignedToName = e.name;
        }
      } catch (e) { console.error(e); }

      let numeroPedido = '';
      try {
        const cr = doc(db, 'config', 'contadores');
        await runTransaction(db, async t => {
          const snap = await t.get(cr);
          const prox = (snap.exists() ? (snap.data().orcamentos || 0) : 0) + 1;
          t.set(cr, { orcamentos: prox }, { merge: true });
          numeroPedido = `OP-${String(prox).padStart(4, '0')}-${new Date().getFullYear().toString().slice(-2)}`;
        });
      } catch (e) { console.error(e); }

      const budgetRef = await addDoc(collection(db, 'budgets'), {
        clientUserId: userId, clientName: userName,
        eventName: bj.evento?.nome || bj.evento?.tipo || 'Novo Evento', eventTypeName: bj.evento?.tipo || '',
        startDate: bj.evento?.dataInicio || '', endDate: bj.evento?.dataFim || '',
        location: bj.evento?.local || bj.evento?.cidade || '', guestCount: bj.evento?.visitantesPorDia || 0,
        status: 'analyzing', workspaceStage: 'Propostas', isMae: true, numeroPedido,
        briefingData: { ...bj, formaPagamento: dados.formaPagamento },
        financeiro: { formaPagamento: dados.formaPagamento },
        assignedTo, assignedToName, assignedAt: assignedTo ? serverTimestamp() : null,
        tenantId: tenantId || null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      try {
        const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados, ...dados.especificosSelecionados];
        const vistos = new Set();
        for (const sel of todas) {
          const key = `${sel.supplierId}__${sel.serviceName}`;
          if (vistos.has(key)) continue; vistos.add(key);
          const isEst = normalize(sel.serviceName).includes('estande') || normalize(sel.serviceParentName || '').includes('estande');
          if (isEst && dados.tipoEstande === 'modular') continue;
          const detEquipe = dados.equipeDetalhes[sel.serviceName] || {};
          await addDoc(collection(db, 'supplierJobs'), {
            supplierId: sel.supplierId, supplierName: sel.supplierName || '', budgetId: budgetRef.id,
            eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '',
            clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '',
            eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '',
            eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '',
            eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0,
            serviceNames: [sel.serviceName], serviceName: sel.serviceName, serviceParentName: sel.serviceParentName || '',
            tipoServico: sel.tipoServico || '',
            opcaoCatalogoId: sel.opcaoCatalogoId || '', opcaoNome: sel.opcaoNome || '',
            preco: sel.valor || 0, unidade: sel.unidade || '',
            diasPreparo: sel.diasPreparo || 0, diasMontagem: sel.diasMontagem || 0,
            quantidade: detEquipe.quantidade ? parseInt(detEquipe.quantidade) : null,
            horasPorDia: detEquipe.horasPorDia ? parseFloat(detEquipe.horasPorDia) : null,
            diasServico: detEquipe.dias ? parseInt(detEquipe.dias) : null,
            observacoes: detEquipe.observacoes || '',
            stage: 'proposta', status: 'draft', createdAt: serverTimestamp(),
          });
        }
        if (dados.temProdutor) {
          const ps = await getDocs(collection(db, 'supplierServices'));
          for (const p of ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => normalize(s.serviceName).includes('produtor') && s.ativo !== false)) {
            await addDoc(collection(db, 'supplierJobs'), { supplierId: p.supplierId, budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '', clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '', eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '', eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '', eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0, serviceName: p.serviceName, serviceParentName: p.serviceParentName || '', tipoServico: p.tipoServico || 'operacao', preco: 0, unidade: '', stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
          }
        }
        if (dados.tipoEstande === 'modular' && modeloSelecionado) {
          const ts = await getDocs(collection(db, 'tiposEspeciais'));
          const tm = ts.docs.map(d => ({ id: d.id, ...d.data() })).find(t => t.id === modeloSelecionado.tipoEspecialId || t.nome?.toLowerCase().includes('modular'));
          for (const f of (tm?.fornecedoresAutorizados || [])) {
            const colabSnap = await getDocs(query(collection(db, 'users'), where('supplierId', '==', f.id), where('systemRole', '==', 'fornecedor'), where('active', '==', true)));
            for (const colab of colabSnap.docs.map(d => ({ id: d.id, ...d.data() }))) {
              await addDoc(collection(db, 'supplierJobs'), { supplierId: colab.id, supplierName: f.nome || '', budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '', clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '', eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '', eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '', eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0, serviceName: modeloSelecionado.nome, serviceParentName: tm?.nome || 'Estande Modular', tipoServico: 'estrutura', modeloEspecialId: modeloSelecionado.id, preco: modeloSelecionado.precoBase || 0, unidade: 'por evento', diasPreparo: modeloSelecionado.diasProducao || 0, diasMontagem: 0, stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
            }
          }
        }
        if (dados.tipoEstande === 'personalizado') {
          const obsStandPadrao = 'Cliente ainda não sabe como quer o stand — abra uma Demanda pra conversar com ele e entender o que precisa antes de montar a proposta.';
          const ss = await getDocs(collection(db, 'supplierServices'));
          const fornecedoresStand = ss.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(s => s.ativo !== false && normalize(s.serviceName || '').includes('desenvolvimento') && normalize(s.serviceName || '').includes('stand'));
          if (fornecedoresStand.length > 0) {
            for (const fs of fornecedoresStand) {
              const colabSnap = await getDocs(query(collection(db, 'users'), where('supplierId', '==', fs.supplierId), where('systemRole', '==', 'fornecedor'), where('active', '==', true)));
              for (const colab of colabSnap.docs.map(d => ({ id: d.id, ...d.data() }))) {
                await addDoc(collection(db, 'supplierJobs'), { supplierId: colab.id, supplierName: fs.supplierName || colab.companyName || '', budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '', clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '', eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '', eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '', eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0, serviceName: 'Desenvolvimento de Stand', serviceParentName: fs.serviceParentName || 'Estandes Personalizados', tipoServico: 'estrutura', observacoes: dados.standDescricao || obsStandPadrao, standImagensUrls: dados.standImagensUrls || [], preco: 0, unidade: '', stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
              }
            }
          } else {
            await addDoc(collection(db, 'supplierJobs'), { supplierId: '', budgetId: budgetRef.id, eventName: bj.evento?.nome || 'Novo Evento', eventTypeName: bj.evento?.tipo || '', clientName: userName, eventDate: bj.evento?.dataInicio || '', eventDateFim: bj.evento?.dataFim || '', eventLocal: bj.evento?.local || bj.evento?.cidade || '', eventCidade: bj.evento?.cidade || '', eventHorarioInicio: bj.evento?.horarioInicio || '', eventHorarioFim: bj.evento?.horarioFim || '', eventDiasDuracao: bj.evento?.diasDuracao || 1, eventVisitantes: bj.evento?.visitantesPorDia || 0, serviceName: 'Desenvolvimento de Stand', serviceParentName: 'Estandes Personalizados', tipoServico: 'estrutura', observacoes: dados.standDescricao || obsStandPadrao, standImagensUrls: dados.standImagensUrls || [], preco: 0, unidade: '', stage: 'proposta', status: 'draft', createdAt: serverTimestamp() });
          }
        }
      } catch (e) { console.error('Erro supplierJobs:', e); }

      setStepAtualId('sent');
    } catch (err) { console.error(err); Alert.alert('Erro', 'Não foi possível enviar. Tente novamente.'); }
    finally { setSubmitting(false); }
  };

  // ── Render genérico por tipo de pergunta ──────────────────────────────────
  const renderPerguntaGenerica = (p) => {
    if (p.tipo === 'sim_nao' || p.tipo === 'multipla_escolha') {
      return (
        <View>
          <Pergunta texto={p.texto} subtitulo={p.subtitulo} />
          {p.opcoes.map(op => {
            const valorConvertido = op.valor === 'sim' ? true : op.valor === 'nao' ? false : op.valor;
            const extra = { [CAMPO_DESTINO[p.destino] || 'generico']: valorConvertido };
            if (p.destino === 'generico') extra.respostasGenericas = { ...dados.respostasGenericas, [p.id]: valorConvertido };
            return <OpcaoBtn key={op.valor} label={op.label} onPress={() => responder(p.id, op.valor, extra)} />;
          })}
        </View>
      );
    }
    if (p.tipo === 'data') {
      return (
        <View>
          <Pergunta texto={p.texto} subtitulo={p.subtitulo} />
          <CalendarioMobile onSelecionar={val => responder(p.id, val, { [CAMPO_DESTINO[p.destino] || 'generico']: val })} />
        </View>
      );
    }
    if (p.tipo === 'texto_livre' || p.tipo === 'texto_longo' || p.tipo === 'numero') {
      const [valLocal, setValLocal] = [dados[`_temp_${p.id}`] || '', v => set(`_temp_${p.id}`, v)];
      return (
        <View>
          <Pergunta texto={p.texto} subtitulo={p.subtitulo} />
          <TextInput placeholderTextColor="rgba(232,244,255,0.35)"
            style={p.tipo === 'texto_longo' ? styles.inputArea : styles.input}
            value={valLocal}
            onChangeText={setValLocal}
            placeholder={p.subtitulo || 'Sua resposta'}
            keyboardType={p.tipo === 'numero' ? 'numeric' : 'default'}
            multiline={p.tipo === 'texto_longo'}
            autoFocus
          />
          <BtnAvancar onPress={() => responder(p.id, valLocal, { [CAMPO_DESTINO[p.destino] || 'generico']: valLocal })} disabled={!valLocal && p.quemResponde === 'todos'} />
        </View>
      );
    }
    if (p.tipo === 'horario') {
      const [ini, setIni] = [dados[`_h1_${p.id}`] || '', v => set(`_h1_${p.id}`, v)];
      const [fim, setFim] = [dados[`_h2_${p.id}`] || '', v => set(`_h2_${p.id}`, v)];
      return (
        <View>
          <Pergunta texto={p.texto} subtitulo={p.subtitulo} />
          <Text style={styles.miniLabel}>Início</Text>
          <ScrollView style={styles.scrollVertical} showsVerticalScrollIndicator={false}>
            {HORARIOS.map(h => <OpcaoBtn key={h} label={h} selected={ini === h} onPress={() => setIni(h)} />)}
          </ScrollView>
          <Text style={styles.miniLabel}>Término</Text>
          <ScrollView style={styles.scrollVertical} showsVerticalScrollIndicator={false}>
            {HORARIOS.filter(h => !ini || h > ini).map(h => <OpcaoBtn key={h} label={h} selected={fim === h} onPress={() => setFim(h)} />)}
          </ScrollView>
          <BtnAvancar onPress={() => responder(p.id, null, { horarioInicio: ini, horarioFim: fim })} disabled={!ini || !fim} />
        </View>
      );
    }
    if (p.tipo === 'localizacao') {
      const [cid, setCid] = [dados[`_c1_${p.id}`] || '', v => set(`_c1_${p.id}`, v)];
      const [loc, setLoc] = [dados[`_c2_${p.id}`] || '', v => set(`_c2_${p.id}`, v)];
      const [uf, setUf] = [dados[`_uf_${p.id}`] || '', v => set(`_uf_${p.id}`, v)];
      return (
        <View>
          <Pergunta texto={p.texto} subtitulo={p.subtitulo} />
          <TextInput placeholderTextColor="rgba(232,244,255,0.35)" style={styles.input} value={cid} onChangeText={setCid} placeholder="Cidade" autoFocus />
          <Text style={styles.miniLabel}>Estado</Text>
          <ScrollView style={styles.scrollVertical} showsVerticalScrollIndicator={false}>
            {ESTADOS_BR.map(e => <OpcaoBtn key={e} label={e} selected={uf === e} onPress={() => setUf(e)} />)}
          </ScrollView>
          <TextInput placeholderTextColor="rgba(232,244,255,0.35)" style={styles.input} value={loc} onChangeText={setLoc} placeholder="Local / endereço (opcional)" />
          <BtnAvancar onPress={() => responder(p.id, null, { cidade: cid, estado: uf, local: loc })} disabled={!cid || !uf} />
        </View>
      );
    }
    if (p.tipo === 'upload') {
      const campo = CAMPO_DESTINO[p.destino] || 'generico';
      const fotos = dados[campo] || [];
      return (
        <View>
          <Pergunta texto={p.texto} subtitulo={p.subtitulo} />
          <View style={styles.galeriaWrap}>
            {fotos.map((url, i) => <Image key={i} source={{ uri: url }} style={styles.thumbImg} />)}
          </View>
          <TouchableOpacity onPress={() => escolherImagens(campo)} disabled={uploadingArquivo} style={styles.uploadBtn}>
            {uploadingArquivo ? <ActivityIndicator color="#7BAFD4" /> : <Text style={styles.uploadBtnText}>{fotos.length > 0 ? '+ Adicionar mais fotos' : '+ Selecionar fotos'}</Text>}
          </TouchableOpacity>
          <BtnAvancar onPress={() => responder(p.id, null)} texto={fotos.length > 0 ? 'Continuar →' : 'Pular →'} />
        </View>
      );
    }
    if (p.tipo === 'catalogo_modelos') {
      return (
        <View>
          <Pergunta texto={p.texto} />
          {modelosEspeciais.map(m => {
            const fotos = m.fotos?.length > 0 ? m.fotos.map(f => f.url) : (m.fotoUrl ? [m.fotoUrl] : []);
            const sel = modeloSelecionado?.id === m.id;
            return (
              <TouchableOpacity key={m.id} onPress={() => setModeloSelecionado(m)} style={[styles.modeloCard, sel && styles.modeloCardSel]}>
                <View style={styles.modeloImgWrap}>
                  {fotos.length > 0 ? (
                    <ModeloCarrosselMobile
                      fotos={fotos}
                      idx={carrosselIdx[m.id] || 0}
                      onPrev={() => setCarrosselIdx(p2 => ({ ...p2, [m.id]: ((p2[m.id] || 0) - 1 + fotos.length) % fotos.length }))}
                      onNext={() => setCarrosselIdx(p2 => ({ ...p2, [m.id]: ((p2[m.id] || 0) + 1) % fotos.length }))}
                      onDot={i => setCarrosselIdx(p2 => ({ ...p2, [m.id]: i }))}
                    />
                  ) : (
                    <Text style={styles.semFotoTexto}>Sem foto</Text>
                  )}
                  {sel && <View style={styles.modeloSelBadge}><Text style={styles.modeloSelBadgeTexto}>✓</Text></View>}
                </View>
                <View style={{ padding: 12 }}>
                  <Text style={styles.modeloNome}>{m.nome}</Text>
                  {m.descricao ? <Text style={styles.modeloDescricao}>{m.descricao}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
          <BtnAvancar onPress={() => responder(p.id, null)} disabled={!modeloSelecionado} texto={modeloSelecionado ? `${modeloSelecionado.nome} →` : 'Selecione um modelo'} />
        </View>
      );
    }
    if (p.tipo === 'catalogo') {
      const setor = p.setor || DESTINO_PARA_SETOR[p.destino];
      const campoSel = DESTINO_PARA_CAMPO_SEL[p.destino] || 'servicosSelecionados';
      if (faseCatalogo === 'selecao' && listaCatalogo.length === 0 && !loadingOpcoes) carregarCatalogo(setor);

      if (faseCatalogo === 'selecao') {
        const [selecionados, setSelecionados] = [dados[`_sel_${p.id}`] || {}, v => set(`_sel_${p.id}`, v)];
        return (
          <View>
            <Pergunta texto={p.texto} />
            {loadingOpcoes ? <ActivityIndicator color="#00E5C4" /> : listaCatalogo.map(s => (
              <CheckOpcao key={s.id} label={s.serviceName} checked={!!selecionados[s.id]} onPress={() => setSelecionados({ ...selecionados, [s.id]: !selecionados[s.id] })} />
            ))}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity onPress={() => { setListaCatalogo([]); setFaseCatalogo('selecao'); responder(p.id, null); }} style={styles.btnSecundario}>
                <Text style={styles.btnSecundarioTexto}>Não preciso</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <BtnAvancar texto="Confirmar →" onPress={() => {
                  const escolhidos = listaCatalogo.filter(s => selecionados[s.id]);
                  if (escolhidos.length === 0) { setListaCatalogo([]); responder(p.id, null); return; }
                  setListaCatalogo(escolhidos);
                  setFaseCatalogo('opcoes');
                }} />
              </View>
            </View>
          </View>
        );
      }

      // Fase de opções — um serviço por vez
      const idxAtual = dados[`_catIdx_${p.id}`] || 0;
      const servAtual = listaCatalogo[idxAtual];
      if (!servAtual) {
        setDados(prev => ({ ...prev, [campoSel]: dados[`_catSels_${p.id}`] || [] }));
        setListaCatalogo([]); setFaseCatalogo('selecao');
        responder(p.id, null);
        return null;
      }
      const avancarOpcao = (op) => {
        const selsAtuais = dados[`_catSels_${p.id}`] || [];
        const novo = op ? [...selsAtuais, {
          supplierId: servAtual.supplierId, supplierName: servAtual.supplierName || '',
          serviceName: servAtual.serviceName, serviceParentName: servAtual.serviceParentName || '',
          tipoServico: servAtual.tipoServico, opcaoCatalogoId: op.id || '', opcaoNome: op.nome || '',
          valor: op.valor || 0, unidade: op.unidade || '',
          diasPreparo: op.diasPreparo || 0, diasMontagem: op.diasMontagem || 0,
        }] : selsAtuais;
        set(`_catSels_${p.id}`, novo);
        set(`_catIdx_${p.id}`, idxAtual + 1);
      };
      return (
        <View>
          <Pergunta texto={`Opções para ${servAtual.serviceName}${listaCatalogo.length > 1 ? ` (${idxAtual+1}/${listaCatalogo.length})` : ''}:`} />
          {servAtual.opcoes.map(op => (
            <OpcaoBtn key={op.id} label={`${op.nome}${op.caracteristica ? ` — ${op.caracteristica}` : ''}`} onPress={() => avancarOpcao(op)} />
          ))}
          <OpcaoBtn label={`Não preciso de ${servAtual.serviceName}`} onPress={() => avancarOpcao(null)} />
        </View>
      );
    }
    if (p.tipo === 'catalogo_especifico') {
      if (faseEspecifico === 'pergunta') {
        return (
          <View>
            <Pergunta texto={p.texto} subtitulo={p.subtitulo} />
            <OpcaoBtn label="Sim" onPress={() => {
              setDados(prev => ({ ...prev, respostasGenericas: { ...prev.respostasGenericas, [p.id]: true } }));
              setFaseEspecifico('opcoes');
            }} />
            <OpcaoBtn label="Não" onPress={() => {
              setDados(prev => ({ ...prev, respostasGenericas: { ...prev.respostasGenericas, [p.id]: false } }));
              responder(p.id, 'nao');
            }} />
          </View>
        );
      }
      if (opcoesEspecifico === null && !loadingEspecifico) carregarServicoEspecifico(p.servicoId);
      return (
        <View>
          <Pergunta texto={p.servicoNome ? `Escolha: ${p.servicoNome}` : p.texto} />
          {loadingEspecifico || opcoesEspecifico === null ? (
            <ActivityIndicator color="#00E5C4" />
          ) : opcoesEspecifico.length === 0 ? (
            <Text style={styles.perguntaSub}>Nenhuma opção disponível pra essa região no momento.</Text>
          ) : opcoesEspecifico.map(op => (
            <OpcaoBtn key={`${op.supplierId}_${op.id}`} label={op.nome} onPress={() => {
              setDados(prev => ({ ...prev, especificosSelecionados: [...prev.especificosSelecionados, op] }));
              setOpcoesEspecifico(null); setFaseEspecifico('pergunta');
              responder(p.id, null);
            }} />
          ))}
          <OpcaoBtn label="Definir depois" onPress={() => { setOpcoesEspecifico(null); setFaseEspecifico('pergunta'); responder(p.id, null); }} />
        </View>
      );
    }
    if (p.tipo === 'campanha_marketing') {
      if (campanhaAtiva === undefined && !loadingCampanha) carregarCampanhaAtiva();
      if (loadingCampanha || campanhaAtiva === undefined) {
        return <ActivityIndicator color="#00E5C4" />;
      }
      if (campanhaAtiva === null) {
        return <Text style={styles.perguntaSub}>Carregando...</Text>; // useEffect avança sozinho
      }
      const fotosCampanha = (campanhaAtiva.arquivos || []).filter(a => a.tipo === 'foto');
      return (
        <View>
          <Pergunta texto={p.texto || 'Você gostaria de utilizar a identidade visual da campanha atual da marca?'} subtitulo={p.subtitulo} />
          <Text style={[styles.miniLabel, { color: '#00E5C4' }]}>{campanhaAtiva.nome}</Text>
          {fotosCampanha.length > 0 && (
            <View style={styles.galeriaWrap}>
              {fotosCampanha.map((f, i) => <Image key={i} source={{ uri: f.url }} style={styles.thumbImg} />)}
            </View>
          )}
          <OpcaoBtn label="Sim, usar essa identidade" onPress={() => {
            setCampanhaAtiva(undefined);
            responder(p.id, 'sim', { identidadeVisual: true, usarCampanhaMarketing: true, identidadeCampanhaId: campanhaAtiva.id, identidadeCampanhaNome: campanhaAtiva.nome });
          }} />
          <OpcaoBtn label="Não, quero outra coisa" onPress={() => {
            setCampanhaAtiva(undefined);
            responder(p.id, 'nao', { usarCampanhaMarketing: false });
          }} />
        </View>
      );
    }
    return <Text style={styles.perguntaSub}>Tipo de pergunta não suportado: {p.tipo}</Text>;
  };

  const responderComBooleano = (p, valor) => {
    const campo = p.destino === 'stand.temStand' ? 'temStand' : p.destino === 'produtor.temProdutor' ? 'temProdutor' : (CAMPO_DESTINO[p.destino] || 'generico');
    responder(p.id, valor, { [campo]: valor === 'sim' });
  };

  // ── Tela ───────────────────────────────────────────────────────────────
  if (carregando) {
    return <View style={styles.tela}><ActivityIndicator size="large" color="#00E5C4" /></View>;
  }
  if (erroCarga || !raizPergunta) {
    return (
      <View style={styles.tela}>
        <Text style={styles.perguntaSub}>Não foi possível carregar o chat. Fale com o administrador.</Text>
        <BtnAvancar onPress={() => navigation.goBack()} texto="Voltar" />
      </View>
    );
  }

  let conteudo;
  if (stepAtualId === 'sent') {
    conteudo = (
      <View style={{ alignItems: 'center', paddingTop: 40 }}>
        <Text style={{ fontSize: 50, marginBottom: 16 }}>🎉</Text>
        <Text style={styles.tituloSucesso}>Proposta enviada!</Text>
        <Text style={[styles.perguntaSub, { textAlign: 'center', marginBottom: 24 }]}>Nossa equipe recebeu seu briefing. Em breve um coordenador entrará em contato.</Text>
        <BtnAvancar onPress={() => navigation.reset({ index: 0, routes: [{ name: 'ClientHome' }] })} texto="Fechar" />
      </View>
    );
  } else if (stepAtualId === 'raiz') {
    conteudo = (
      <View>
        <Pergunta texto={`Olá, ${userName}! 😊\n\n${raizPergunta.texto}`} />
        {raizPergunta.opcoes.map(op => {
          const tipo = tiposEvento.find(t => t.id === op.valor);
          if (!tipo) return null;
          return <OpcaoBtn key={op.valor} label={op.label} onPress={() => avancarDaRaiz(op.valor)} />;
        })}
      </View>
    );
  } else if (passoEspecial === 'equipe_detalhes') {
    const serv = dados.equipeSelecionada[equipeIdx];
    conteudo = !serv ? null : (
      <View>
        <Pergunta texto={`Detalhes para ${serv.serviceName}${dados.equipeSelecionada.length > 1 ? ` (${equipeIdx+1}/${dados.equipeSelecionada.length})` : ''}`} />
        <Text style={styles.miniLabel}>Quantos?</Text>
        <TextInput placeholderTextColor="rgba(232,244,255,0.35)" style={styles.input} keyboardType="numeric" value={equipeForm.quantidade} onChangeText={v => setEquipeForm(f => ({ ...f, quantidade: v }))} placeholder="2" />
        <Text style={styles.miniLabel}>Horas/dia</Text>
        <TextInput placeholderTextColor="rgba(232,244,255,0.35)" style={styles.input} keyboardType="numeric" value={equipeForm.horasPorDia} onChangeText={v => setEquipeForm(f => ({ ...f, horasPorDia: v }))} placeholder="8" />
        <Text style={styles.miniLabel}>Dias</Text>
        <TextInput placeholderTextColor="rgba(232,244,255,0.35)" style={styles.input} keyboardType="numeric" value={equipeForm.dias} onChangeText={v => setEquipeForm(f => ({ ...f, dias: v }))} placeholder="3" />
        <TextInput placeholderTextColor="rgba(232,244,255,0.35)" style={styles.input} value={equipeForm.observacoes} onChangeText={v => setEquipeForm(f => ({ ...f, observacoes: v }))} placeholder="Preferência específica (opcional)" />
        <BtnAvancar onPress={finalizarEquipeItem} disabled={!equipeForm.quantidade && !equipeForm.horasPorDia} />
      </View>
    );
  } else if (stepAtualId === 'revisao') {
    const LABEL_PAG = { '50_50': '50% + 50%', '30_60_90': '30/60/90 dias', 'a_vista': 'À vista' };
    const todas = [...dados.estruturaSelecionada, ...dados.equipeSelecionada, ...dados.gastronomeSelecionada, ...dados.servicosSelecionados, ...dados.especificosSelecionados];
    conteudo = (
      <View>
        <Pergunta texto="Tudo certo! Confira o resumo:" />
        <View style={styles.resumoBox}>
          {dados.tipoEstande ? <Text style={styles.resumoLinha}>Stand: {dados.tipoEstande === 'modular' ? `Modular — ${modeloSelecionado?.nome || ''}` : 'Personalizado'}</Text> : null}
          <Text style={styles.resumoLinha}>Empresa: {dados.nomeEmpresa}</Text>
          <Text style={styles.resumoLinha}>Evento: {dados.tipoEvento}{dados.nomeEvento ? ` — ${dados.nomeEvento}` : ''}</Text>
          <Text style={styles.resumoLinha}>Data: {dados.dataInicio} → {dados.dataFim}</Text>
          <Text style={styles.resumoLinha}>Horário: {dados.horarioInicio} às {dados.horarioFim}</Text>
          <Text style={styles.resumoLinha}>Local: {dados.cidade}{dados.estado ? ` — ${dados.estado}` : ''}{dados.local ? ` — ${dados.local}` : ''}</Text>
          <Text style={styles.resumoLinha}>Pessoas/dia: {dados.visitantesPorDia}</Text>
          {todas.length > 0 && <Text style={styles.resumoLinha}>Serviços: {todas.map(s => `${s.serviceName}${s.opcaoNome ? ` (${s.opcaoNome})` : ''}`).join(', ')}</Text>}
          <Text style={styles.resumoLinha}>Pagamento: {LABEL_PAG[dados.formaPagamento] || dados.formaPagamento}</Text>
        </View>
        <BtnAvancar onPress={handleConfirm} loading={submitting} texto="Confirmar e Enviar →" />
      </View>
    );
  } else {
    const p = perguntasMap[stepAtualId];
    if (!p) conteudo = <Text style={styles.perguntaSub}>Carregando próxima pergunta...</Text>;
    else if (p.destino === 'stand.temStand' || p.destino === 'produtor.temProdutor') {
      conteudo = (
        <View>
          <Pergunta texto={p.texto} subtitulo={p.subtitulo} />
          {p.opcoes.map(op => <OpcaoBtn key={op.valor} label={op.label} onPress={() => responderComBooleano(p, op.valor)} />)}
        </View>
      );
    } else {
      conteudo = renderPerguntaGenerica(p);
    }
  }

  return (
    <View style={styles.tela}>
      <View style={styles.header}>
        <TouchableOpacity onPress={voltar} style={styles.backBtn}>
          <Text style={styles.backTexto}>← {historicoNav.length > 0 ? 'Voltar' : 'Sair'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitulo}>Realize Hub</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollConteudo}>
        <View style={styles.conteudoCentralizado}>
          {conteudo}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#0A1626' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 40, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,180,255,0.08)',
  },
  backBtn: { padding: 4, width: 90 },
  backTexto: { color: '#7BAFD4', fontSize: 13 },
  headerTitulo: { color: '#7BAFD4', fontSize: 13 },
  scroll: { flex: 1 },
  scrollVertical: { maxHeight: 190, marginBottom: 14 },
  scrollConteudo: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingBottom: 60 },
  conteudoCentralizado: { width: '100%', maxWidth: 440, alignSelf: 'center' },

  perguntaTexto: { fontSize: 19, fontWeight: '700', color: '#E8F4FF', lineHeight: 26, textAlign: 'center' },
  perguntaSub: { fontSize: 12, color: '#7BAFD4', marginTop: 6, textAlign: 'center' },
  miniLabel: { fontSize: 11, fontWeight: '700', color: '#7BAFD4', textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },

  opcaoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginBottom: 8,
    borderWidth: 1.5, borderColor: 'rgba(0,180,255,0.2)', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  opcaoBtnSel: { borderColor: '#00E5C4', backgroundColor: 'rgba(0,229,196,0.08)' },
  opcaoTexto: { fontSize: 13, fontWeight: '500', color: '#7BAFD4', flexShrink: 1 },
  opcaoTextoSel: { color: '#00E5C4' },
  radioCirc: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(0,180,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  radioCircSel: { borderColor: '#00E5C4', backgroundColor: '#00E5C4' },
  radioDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#0A1626' },
  checkQuad: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: 'rgba(0,180,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  checkQuadSel: { borderColor: '#00E5C4', backgroundColor: '#00E5C4' },
  checkMark: { color: '#0A1626', fontSize: 11, fontWeight: '700' },

  btnAvancar: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#00E5C4', alignItems: 'center', marginTop: 6, alignSelf: 'center', minWidth: 200 },
  btnAvancarDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnAvancarTexto: { fontSize: 14, fontWeight: '700', color: '#0A1626' },

  btnSecundario: { flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,180,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  btnSecundarioTexto: { color: '#7BAFD4', fontSize: 13 },

  input: {
    borderWidth: 1.5, borderColor: 'rgba(0,180,255,0.25)', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, color: '#E8F4FF', marginBottom: 8, textAlign: 'center',
  },
  inputArea: {
    borderWidth: 1.5, borderColor: 'rgba(0,180,255,0.25)', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, padding: 12, fontSize: 14, color: '#E8F4FF', marginBottom: 8, minHeight: 90, textAlignVertical: 'top', textAlign: 'left',
  },

  galeriaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10, justifyContent: 'center' },
  thumbImg: { width: 64, height: 64, borderRadius: 8 },

  calendarioBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'rgba(0,180,255,0.2)', borderRadius: 14, padding: 14, marginBottom: 10 },
  calendarioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calendarioNavBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  calendarioNavTexto: { color: '#7BAFD4', fontSize: 20 },
  calendarioMesAno: { color: '#E8F4FF', fontSize: 14, fontWeight: '600' },
  calendarioSemana: { flexDirection: 'row', marginBottom: 4 },
  calendarioDiaSemana: { flexBasis: '14.28%', textAlign: 'center', fontSize: 10, color: 'rgba(123,175,212,0.55)' },
  calendarioGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarioCel: { flexBasis: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calendarioCelSel: { backgroundColor: '#00E5C4' },
  calendarioCelTexto: { fontSize: 13, color: '#E8F4FF' },
  calendarioCelTextoSel: { color: '#0A1626', fontWeight: '700' },
  uploadBtn: { padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(0,180,255,0.3)', borderStyle: 'dashed', alignItems: 'center', marginBottom: 12 },
  uploadBtnText: { color: '#7BAFD4', fontSize: 13 },

  modeloCard: { borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(0,180,255,0.15)', marginBottom: 12, overflow: 'hidden' },
  modeloCardSel: { borderColor: '#00E5C4' },
  modeloImgWrap: { width: '100%', height: 140, backgroundColor: 'rgba(0,128,255,0.08)', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  modeloImg: { width: '100%', height: 140 },
  semFotoTexto: { color: 'rgba(123,175,212,0.4)', fontSize: 11 },
  modeloSelBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#00E5C4', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  modeloSelBadgeTexto: { color: '#0A1626', fontSize: 11, fontWeight: '700' },
  modeloNome: { color: '#E8F4FF', fontSize: 14, fontWeight: '600' },
  modeloDescricao: { color: '#7BAFD4', fontSize: 11, marginTop: 3 },
  carrosselSeta: { position: 'absolute', top: '50%', marginTop: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(10,22,38,0.6)', alignItems: 'center', justifyContent: 'center' },
  carrosselSetaTexto: { color: 'white', fontSize: 18, lineHeight: 20 },
  carrosselDots: { position: 'absolute', bottom: 6, flexDirection: 'row', alignSelf: 'center', gap: 5 },
  carrosselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  carrosselDotAtivo: { backgroundColor: '#00E5C4' },

  resumoBox: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(0,180,255,0.12)', borderRadius: 14, padding: 16, marginBottom: 8 },
  resumoLinha: { fontSize: 13, color: '#E8F4FF', marginBottom: 6 },
  tituloSucesso: { fontSize: 22, fontWeight: '700', color: '#E8F4FF', marginBottom: 12 },
});
