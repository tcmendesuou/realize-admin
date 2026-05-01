const admin = require('firebase-admin');
const https = require('https');

// Inicializa Firebase Admin uma vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:    process.env.FIREBASE_PROJECT_ID,
      clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:   (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: 'Responda APENAS com JSON válido e compacto. Sem texto, sem markdown, sem backticks.',
      messages: [{ role: 'user', content: prompt }],
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { budgetId } = req.body;
  if (!budgetId) return res.status(400).json({ error: 'budgetId obrigatório' });

  try {
    // 1. Busca o budget
    const budgetSnap = await db.collection('budgets').doc(budgetId).get();
    if (!budgetSnap.exists) return res.status(404).json({ error: 'Budget não encontrado' });

    const budgetData = budgetSnap.data();
    const briefingJson = budgetData.briefingData || {};

    // 2. Atribui coordenador (menor carga)
    let assignedTo = null, assignedToName = null;
    try {
      const usersSnap = await db.collection('users').where('systemRole', '==', 'coordenador').get();
      const coordenadores = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);
      if (coordenadores.length > 0) {
        const budgetsSnap = await db.collection('budgets').where('status', '==', 'analyzing').get();
        const contagem = {};
        budgetsSnap.docs.forEach(d => {
          const at = d.data().assignedTo;
          if (at) contagem[at] = (contagem[at] || 0) + 1;
        });
        const escolhido = coordenadores.reduce((menor, c) =>
          (contagem[c.id] || 0) < (contagem[menor.id] || 0) ? c : menor
        );
        assignedTo = escolhido.id;
        assignedToName = escolhido.name;
      }
    } catch (e) { console.error('Erro coordenador:', e); }

    // 3. Atualiza budget com coordenador
    await db.collection('budgets').doc(budgetId).update({
      assignedTo,
      assignedToName,
      assignedAt: assignedTo ? admin.firestore.FieldValue.serverTimestamp() : null,
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    // 4. Cria supplierJobs
    const servicosNecessarios = briefingJson.servicosNecessarios || [];
    const suppServSnap = await db.collection('supplierServices').get();
    const todosServicos = suppServSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const keywords = servicosNecessarios.flatMap(sn =>
      sn.toLowerCase().split(/[\s/,+()-]+/).filter(w => w.length > 2)
    );
    const sinonimos = {
      led:      ['led', 'neon', 'painel', 'telao', 'tela'],
      banner:   ['banner', 'backdrop', 'fundo', 'impresso'],
      som:      ['som', 'audio', 'pa', 'caixa', 'microfone'],
      recepcao: ['recepcao', 'recepcionista', 'hostess'],
      seguranca:['seguranca', 'vigilancia'],
      limpeza:  ['limpeza', 'higiene', 'auxiliar'],
    };
    const kwExpandidas = [...keywords];
    keywords.forEach(kw => {
      Object.values(sinonimos).forEach(terms => {
        if (terms.some(t => kw.includes(t) || t.includes(kw))) kwExpandidas.push(...terms);
      });
    });
    const kwSet = [...new Set(kwExpandidas)];

    const suppServs = todosServicos.filter(s => {
      if (s.ativo === false) return false;
      const normalize = str => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const fullLC = normalize(s.serviceName) + ' ' + normalize(s.serviceParentName);
      if (servicosNecessarios.includes(s.serviceName)) return true;
      if (servicosNecessarios.includes(s.serviceParentName)) return true;
      return kwSet.some(kw => fullLC.includes(kw));
    });

    const jobsCriados = [];
    const batch = db.batch();
    for (const sv of suppServs) {
      const jobRef = db.collection('supplierJobs').doc();
      batch.set(jobRef, {
        supplierId:        sv.supplierId,
        budgetId,
        eventName:         briefingJson.evento?.nome || briefingJson.evento?.tipo || 'Novo Evento',
        clientName:        budgetData.clientName || '',
        eventDate:         briefingJson.evento?.dataInicio || '',
        serviceNames:      [sv.serviceName],
        serviceName:       sv.serviceName,
        serviceParentName: sv.serviceParentName || '',
        tipoServico:       sv.tipoServico || '',
        preco:             sv.preco || 0,
        unidade:           sv.unidade || '',
        diasPreparo:       sv.diasPreparo || 0,
        diasMontagem:      sv.diasMontagem || 0,
        stage:             'proposta',
        status:            'pending',
        createdAt:         admin.firestore.FieldValue.serverTimestamp(),
      });
      jobsCriados.push(sv.serviceName);
    }
    await batch.commit();

    // 5. Gera cronograma via IA
    let cronogramaEtapas = 0;
    try {
      const dataEvento = briefingJson.evento?.dataInicio || '';
      const servicosResumidos = todosServicos
        .filter(s => s.diasPreparo > 0 || s.diasMontagem > 0)
        .map(s => `${s.serviceName}:preparo=${s.diasPreparo||0}d,montagem=${s.diasMontagem||0}d`)
        .join(';');

      const cronPrompt = `Monte cronograma de produção para evento corporativo. Responda APENAS JSON compacto sem espaços desnecessários.

Evento:${briefingJson.evento?.nome||briefingJson.evento?.tipo},data:${dataEvento},dias:${briefingJson.evento?.diasDuracao||1},cidade:${briefingJson.evento?.cidade||''}
Serviços:${servicosNecessarios.join(',')}
Tempos:${servicosResumidos||'padrão'}

Regras:máximo 10 etapas,ordem lógica,campos curtos,sem texto longo em descricao(max 60 chars)

JSON:{"etapas":[{"id":"e1","n":"nome curto","d":"desc curta","r":"coordenador","di":"YYYY-MM-DD","de":"YYYY-MM-DD","da":30,"s":"pendente","t":"administrativo"}]}
Campos: id,n(nome),d(desc),r(responsavel),di(dataInicio),de(dataEntrega),da(diasAntes),s(status),t(tipo)`;

      const cronData = await callClaude(cronPrompt);
      const cronText = (cronData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const clean = cronText.replace(/```json|```/g, '').trim();
      const cronJson = JSON.parse(clean);

      if (cronJson?.etapas?.length > 0) {
        const etapas = cronJson.etapas.map(e => ({
          id:          e.id || e.n,
          nome:        e.n  || e.nome,
          descricao:   e.d  || e.descricao || '',
          responsavel: e.r  || e.responsavel || 'coordenador',
          dataInicio:  e.di || e.dataInicio || '',
          dataEntrega: e.de || e.dataEntrega || '',
          diasAntes:   e.da ?? e.diasAntes ?? 0,
          dependencias:e.dep || e.dependencias || [],
          status:      e.s  || e.status || 'pendente',
          tipo:        e.t  || e.tipo || 'administrativo',
        }));
        await db.collection('budgets').doc(budgetId).update({
          cronograma: { etapas },
          updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
        });
        cronogramaEtapas = etapas.length;
      }
    } catch (e) { console.error('Erro cronograma:', e); }

    res.status(200).json({
      success: true,
      budgetId,
      assignedTo,
      assignedToName,
      jobsCriados: jobsCriados.length,
      cronograma: cronogramaEtapas,
    });

  } catch (e) {
    console.error('Erro processar-budget:', e);
    res.status(500).json({ error: 'Erro interno', details: e.message });
  }
};
