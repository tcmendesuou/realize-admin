import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Catálogo de áreas e categorias ──────────────────────────────────────────
const CATALOGO = [
  {
    area: 'Estrutura',
    color: '#0080FF',
    categorias: [
      { id: 'arquitetura',    label: 'Arquitetura / Projeto 3D',     desc: 'Desenvolvimento de projetos arquitetonicos e 3D para eventos' },
      { id: 'montadora',      label: 'Montadora / Estande',           desc: 'Montagem e desmontagem de estandes e estruturas' },
      { id: 'mobiliario',     label: 'Mobiliario / Locacao',          desc: 'Mesas, cadeiras, lounges, balcoes e mobiliario em geral' },
      { id: 'comunicacao',    label: 'Comunicacao Visual',            desc: 'Flyers, lonas, banners, sinalizacao, impressos' },
      { id: 'iluminacao',     label: 'Iluminacao Cenica',             desc: 'Iluminacao tecnica, decorativa e arquitetural' },
      { id: 'sonorizacao',    label: 'Sonorizacao / PA',              desc: 'Equipamentos de som, PA, microfones, mixagem' },
      { id: 'tecnologia',     label: 'Tecnologia / AV',               desc: 'Teloes, projetores, paineis de LED, TV, streaming' },
      { id: 'cenografia',     label: 'Cenografia / Decoracao',        desc: 'Decoracao tematica, cenarios e ambientacao' },
      { id: 'floricultura',   label: 'Floricultura / Arranjos',       desc: 'Arranjos florais, plantas, paisagismo de evento' },
      { id: 'tendas',         label: 'Tendas / Coberturas',           desc: 'Tendas, coberturas, palcos e estruturas metalicas' },
      { id: 'geradores',      label: 'Geradores / Energia',           desc: 'Geradores, nobreaks e infraestrutura eletrica' },
      { id: 'climatizacao',   label: 'Climatizacao',                  desc: 'Ar condicionado, ventiladores industriais, climatizadores' },
    ]
  },
  {
    area: 'Operacao',
    color: '#00E5C4',
    categorias: [
      { id: 'limpeza',        label: 'Limpeza / Conservacao',        desc: 'Limpeza durante e apos o evento' },
      { id: 'seguranca',      label: 'Seguranca Patrimonial',        desc: 'Agentes de seguranca, controle de acesso' },
      { id: 'recepcao',       label: 'Recepcao / Hostess',           desc: 'Recepcionistas, hostess, promotoras' },
      { id: 'carregadores',   label: 'Carregadores / Apoio',         desc: 'Equipe de apoio operacional, carga e descarga' },
      { id: 'producao',       label: 'Producao / Coordenacao',       desc: 'Producao executiva, coordenacao de evento' },
      { id: 'buffet',         label: 'A&B / Buffet',                 desc: 'Servico de buffet, coffee break, jantar' },
      { id: 'bebidas',        label: 'Bebidas / Bar',                desc: 'Open bar, chopeiras, sommelier, bartender' },
      { id: 'brindes',        label: 'Brindes / Personalizados',     desc: 'Brindes, kits, itens personalizados' },
      { id: 'seguro',         label: 'Seguro de Evento',             desc: 'Apolices e coberturas para eventos' },
      { id: 'transporte',     label: 'Transporte / Logistica',       desc: 'Transfer, vans, onibus, frete' },
      { id: 'saude',          label: 'Saude / Primeiros Socorros',   desc: 'Enfermeiros, paramédicos, ambulancia' },
    ]
  },
  {
    area: 'Entretenimento',
    color: '#FFA726',
    categorias: [
      { id: 'fotografia',     label: 'Fotografia',                   desc: 'Cobertura fotografica do evento' },
      { id: 'filmagem',       label: 'Filmagem / Video',             desc: 'Cobertura audiovisual e edicao' },
      { id: 'dj',             label: 'DJ / Trilha Sonora',           desc: 'Discotecagem e selecao musical' },
      { id: 'banda',          label: 'Banda / Musica ao Vivo',       desc: 'Apresentacoes musicais ao vivo' },
      { id: 'mc',             label: 'MC / Apresentador',            desc: 'Mestre de cerimonias e apresentacao' },
      { id: 'show',           label: 'Show / Atracao',               desc: 'Artistas, shows e atracoes especiais' },
      { id: 'traducao',       label: 'Traducao / Interprete',        desc: 'Traducao simultanea e interpretacao' },
      { id: 'photobooth',     label: 'Photobooth / Totem',           desc: 'Cabine de fotos, totem digital, impressao' },
    ]
  },
  {
    area: 'Gastronomia',
    color: '#66BB6A',
    categorias: [
      { id: 'catering',       label: 'Catering / Cardapio',          desc: 'Cardapio completo para eventos' },
      { id: 'confeitaria',    label: 'Confeitaria / Bolo',           desc: 'Bolos, doces, mesa de sobremesas' },
      { id: 'food_truck',     label: 'Food Truck',                   desc: 'Food trucks e opcoes de comida de rua' },
      { id: 'degustacao',     label: 'Degustacao / Sommelier',       desc: 'Harmonizacao, degustacao de vinhos e afins' },
    ]
  },
];

const UNIDADES = ['por dia', 'por hora', 'por m²', 'por pessoa', 'por unidade', 'por evento', 'fixo'];

const REGIOES = ['Nacional', 'São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Paraná', 'Santa Catarina', 'Rio Grande do Sul', 'Bahia', 'Goiás', 'Distrito Federal', 'Outros'];

// ── Formulário de serviço ────────────────────────────────────────────────────
function ServicoForm({ categoriaId, categoriaNome, areaLabel, supplierId, onSave, onCancel, editData = null }) {
  const [form, setForm] = useState(editData || {
    nome: '', descricao: '', preco: '', unidade: 'por evento',
    tempoExecucao: '', quantidade: '', regiao: 'São Paulo',
    observacoes: '', ativo: true,
  });
  const [saving, setSaving] = useState(false);
  const setF = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const inp = { padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  const handleSave = async () => {
    if (!form.nome.trim()) { alert('Nome do servico obrigatorio'); return; }
    setSaving(true);
    try {
      const data = { ...form, categoriaId, categoriaNome, areaLabel, supplierId, updatedAt: new Date() };
      if (editData?.id) {
        await updateDoc(doc(db, 'supplierServices', editData.id), data);
      } else {
        await addDoc(collection(db, 'supplierServices'), { ...data, createdAt: new Date() });
      }
      onSave();
    } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: '#f8faff', borderRadius: 10, border: '1px solid #e0e8ff', padding: 20, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#667eea', marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {editData ? 'Editar' : 'Novo'} servico — {categoriaNome}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={lbl}>Nome do servico *</label>
          <input value={form.nome} onChange={e => setF('nome', e.target.value)} style={inp} placeholder="Ex: Estande 9m² em octanorm" />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={lbl}>Descricao</label>
          <textarea value={form.descricao} onChange={e => setF('descricao', e.target.value)}
            style={{ ...inp, height: 60, resize: 'vertical' }} placeholder="Detalhes do servico, materiais, inclui o que..." />
        </div>
        <div>
          <label style={lbl}>Preco base (R$)</label>
          <input type="number" min="0" value={form.preco} onChange={e => setF('preco', e.target.value)} style={inp} placeholder="0,00" />
        </div>
        <div>
          <label style={lbl}>Unidade de cobranca</label>
          <select value={form.unidade} onChange={e => setF('unidade', e.target.value)} style={{ ...inp, background: 'white' }}>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Tempo de execucao</label>
          <input value={form.tempoExecucao} onChange={e => setF('tempoExecucao', e.target.value)} style={inp} placeholder="Ex: 2 dias de montagem" />
        </div>
        <div>
          <label style={lbl}>Quantidade disponivel</label>
          <input value={form.quantidade} onChange={e => setF('quantidade', e.target.value)} style={inp} placeholder="Ex: 3 unidades" />
        </div>
        <div>
          <label style={lbl}>Regiao de atendimento</label>
          <select value={form.regiao} onChange={e => setF('regiao', e.target.value)} style={{ ...inp, background: 'white' }}>
            {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
          <input type="checkbox" id="svc-ativo" checked={form.ativo} onChange={e => setF('ativo', e.target.checked)} style={{ width: 15, height: 15, accentColor: '#667eea' }} />
          <label htmlFor="svc-ativo" style={{ fontSize: 13, color: '#64748b', cursor: 'pointer' }}>Servico ativo</label>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={lbl}>Observacoes</label>
          <input value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} style={inp} placeholder="Informacoes adicionais, restricoes, diferenciais..." />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          {saving ? 'Salvando...' : 'Salvar servico'}
        </button>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function FornecedorServicos({ userData, onServicosAdicionados }) {
  const supplierId = userData?.supplierId || userData?.id;
  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [areaAtiva, setAreaAtiva] = useState('Estrutura');
  const [formAberto, setFormAberto] = useState(null); // { categoriaId, categoriaNome, areaLabel }
  const [editando, setEditando] = useState(null);
  const [expandida, setExpandida] = useState(null);

  useEffect(() => { loadServicos(); }, [supplierId]);

  const loadServicos = async () => {
    if (!supplierId) return;
    try {
      const snap = await getDocs(query(collection(db, 'supplierServices'), where('supplierId', '==', supplierId)));
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setServicos(lista);
      if (lista.length > 0 && onServicosAdicionados) onServicosAdicionados();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    await deleteDoc(doc(db, 'supplierServices', id));
    loadServicos();
  };

  const toggleAtivo = async (s) => {
    await updateDoc(doc(db, 'supplierServices', s.id), { ativo: !s.ativo });
    loadServicos();
  };

  const areaConfig = CATALOGO.find(a => a.area === areaAtiva);
  const totalServicos = servicos.length;
  const servicosPorCategoria = (catId) => servicos.filter(s => s.categoriaId === catId);

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#E8F4FF', margin: 0 }}>Meus Servicos</h2>
          <p style={{ fontSize: 13, color: '#7BAFD4', marginTop: 2 }}>
            {totalServicos === 0 ? 'Nenhum servico cadastrado ainda' : `${totalServicos} servico${totalServicos > 1 ? 's' : ''} cadastrado${totalServicos > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Tabs de área */}
      <div style={{ display: 'flex', gap: 6 }}>
        {CATALOGO.map(a => {
          const count = servicos.filter(s => s.areaLabel === a.area).length;
          const ativa = areaAtiva === a.area;
          return (
            <button key={a.area} onClick={() => setAreaAtiva(a.area)}
              style={{ padding: '8px 16px', borderRadius: 20, border: `1px solid ${ativa ? a.color : 'rgba(0,180,255,0.15)'}`, background: ativa ? `${a.color}22` : 'rgba(255,255,255,0.03)', color: ativa ? a.color : '#7BAFD4', fontSize: 13, fontWeight: ativa ? 600 : 400, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}>
              {a.area}
              {count > 0 && <span style={{ background: ativa ? a.color : 'rgba(123,175,212,0.2)', color: ativa ? 'white' : '#7BAFD4', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Lista de categorias */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {areaConfig?.categorias.map(cat => {
          const catServicos = servicosPorCategoria(cat.id);
          const aberta = expandida === cat.id;
          const temForm = formAberto?.categoriaId === cat.id;

          return (
            <div key={cat.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: `1px solid ${aberta ? `${areaConfig.color}44` : 'rgba(0,180,255,0.08)'}`, overflow: 'hidden', transition: 'border-color 0.15s' }}>

              {/* Header da categoria */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', cursor: 'pointer', gap: 12 }}
                onClick={() => setExpandida(aberta ? null : cat.id)}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: catServicos.length > 0 ? areaConfig.color : 'rgba(123,175,212,0.2)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#E8F4FF' }}>{cat.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)', marginTop: 2 }}>{cat.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {catServicos.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: `${areaConfig.color}22`, color: areaConfig.color }}>
                      {catServicos.length} servico{catServicos.length > 1 ? 's' : ''}
                    </span>
                  )}
                  <button onClick={e => { e.stopPropagation(); setFormAberto({ categoriaId: cat.id, categoriaNome: cat.label, areaLabel: areaAtiva }); setExpandida(cat.id); setEditando(null); }}
                    style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${areaConfig.color}44`, background: 'none', color: areaConfig.color, fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>
                    + Adicionar
                  </button>
                  <span style={{ color: 'rgba(123,175,212,0.4)', fontSize: 16 }}>{aberta ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Conteúdo expandido */}
              {aberta && (
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid rgba(0,180,255,0.06)' }}>

                  {/* Form de novo serviço */}
                  {temForm && !editando && (
                    <div style={{ marginTop: 12 }}>
                      <ServicoForm
                        categoriaId={cat.id} categoriaNome={cat.label} areaLabel={areaAtiva}
                        supplierId={supplierId}
                        onSave={() => { setFormAberto(null); loadServicos(); }}
                        onCancel={() => setFormAberto(null)}
                      />
                    </div>
                  )}

                  {/* Lista de serviços desta categoria */}
                  {catServicos.length === 0 && !temForm && (
                    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'rgba(123,175,212,0.4)' }}>
                      Nenhum servico nesta categoria ainda
                    </div>
                  )}

                  {catServicos.map(s => (
                    <div key={s.id}>
                      {editando?.id === s.id ? (
                        <div style={{ marginTop: 10 }}>
                          <ServicoForm
                            categoriaId={cat.id} categoriaNome={cat.label} areaLabel={areaAtiva}
                            supplierId={supplierId} editData={editando}
                            onSave={() => { setEditando(null); loadServicos(); }}
                            onCancel={() => setEditando(null)}
                          />
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: `1px solid ${s.ativo ? 'rgba(0,180,255,0.1)' : 'rgba(0,180,255,0.04)'}`, opacity: s.ativo ? 1 : 0.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#E8F4FF' }}>{s.nome}</span>
                                {!s.ativo && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Inativo</span>}
                              </div>
                              {s.descricao && <div style={{ fontSize: 12, color: 'rgba(123,175,212,0.7)', marginBottom: 6 }}>{s.descricao}</div>}
                              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                {s.preco && <span style={{ fontSize: 11, color: '#00E5C4' }}>R$ {parseFloat(s.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {s.unidade}</span>}
                                {s.tempoExecucao && <span style={{ fontSize: 11, color: '#7BAFD4' }}>{s.tempoExecucao}</span>}
                                {s.quantidade && <span style={{ fontSize: 11, color: '#7BAFD4' }}>{s.quantidade}</span>}
                                {s.regiao && <span style={{ fontSize: 11, color: 'rgba(123,175,212,0.5)' }}>{s.regiao}</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button onClick={() => setEditando(s)}
                                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,180,255,0.2)', background: 'none', color: '#7BAFD4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Editar</button>
                              <button onClick={() => toggleAtivo(s)}
                                style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${s.ativo ? 'rgba(255,167,38,0.3)' : 'rgba(0,229,196,0.3)'}`, background: 'none', color: s.ativo ? '#FFA726' : '#00E5C4', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                                {s.ativo ? 'Pausar' : 'Ativar'}
                              </button>
                              <button onClick={() => handleDelete(s.id, s.nome)}
                                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Excluir</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
