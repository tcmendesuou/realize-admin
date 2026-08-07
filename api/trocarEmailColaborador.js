// api/trocarEmailColaborador.js
//
// Endpoint de servidor pra trocar o e-mail de LOGIN de verdade de um
// colaborador (Firebase Authentication) — isso só é possível com o Admin
// SDK, que roda aqui no servidor (nunca no navegador). Editar o campo
// "email" direto no Firestore (como o admin do cliente fazia até agora)
// só muda o cadastro, não o login — por isso o colaborador ficava sem
// conseguir entrar depois de editar.
//
// Usa as mesmas credenciais de servidor já configuradas na Vercel:
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { idToken, userId, novoEmail } = req.body || {};
  if (!idToken || !userId || !novoEmail) {
    return res.status(400).json({ error: 'Faltam dados (idToken, userId ou novoEmail).' });
  }

  try {
    const db = admin.firestore();

    // Confirma quem está pedindo (o token vem do próprio navegador de quem
    // está logado no admin) e se essa pessoa tem permissão de mexer nesse
    // colaborador específico.
    const decoded = await admin.auth().verifyIdToken(idToken);
    const solicitanteSnap = await db.collection('users').where('uid', '==', decoded.uid).limit(1).get();
    if (solicitanteSnap.empty) {
      return res.status(403).json({ error: 'Não foi possível confirmar quem está fazendo a alteração.' });
    }
    const solicitante = solicitanteSnap.docs[0].data();

    const alvoRef = db.collection('users').doc(userId);
    const alvoSnap = await alvoRef.get();
    if (!alvoSnap.exists) {
      return res.status(404).json({ error: 'Colaborador não encontrado.' });
    }
    const alvo = alvoSnap.data();

    // Só pode mexer: admin da Realize, ou admin do MESMO tenant do colaborador.
    const podeMexer =
      solicitante.systemRole === 'admin' ||
      (solicitante.tipoConta === 'cliente' && solicitante.tenantId && solicitante.tenantId === alvo.tenantId);

    if (!podeMexer) {
      return res.status(403).json({ error: 'Você não tem permissão para alterar esse colaborador.' });
    }

    if (!alvo.uid) {
      return res.status(400).json({ error: 'Esse colaborador não tem login vinculado (uid ausente).' });
    }

    // Troca o e-mail de login de verdade no Firebase Authentication.
    await admin.auth().updateUser(alvo.uid, { email: novoEmail });

    // Sincroniza o cadastro no Firestore com o novo e-mail.
    await alvoRef.update({ email: novoEmail, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Erro ao trocar email do colaborador:', e);
    if (e.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Esse e-mail já está em uso por outra conta.' });
    }
    return res.status(500).json({ error: e.message || 'Erro ao trocar o e-mail.' });
  }
}
