/**
 * Host-admin auth verification for Netlify functions in the admin portal.
 *
 * The admin portal's UI is gated to host admins, but the Netlify functions
 * sit on URLs anyone can hit directly. This helper verifies that the
 * caller's Firebase ID token belongs to a user listed in /hostAdmins —
 * the same membership check the UI performs.
 *
 * Usage:
 *   const { verifyHostAdmin } = require('./utils/auth.cjs');
 *   exports.handler = async (event) => {
 *     try { await verifyHostAdmin(event); }
 *     catch (e) { return { statusCode: e.statusCode || 401, body: JSON.stringify({ error: e.message }) }; }
 *     ...
 *   };
 */

const admin = require('firebase-admin');

function initFirebaseAdmin() {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT env var missing');
    }
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  }
  return admin;
}

async function verifyIdToken(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing authentication token');
    err.statusCode = 401;
    throw err;
  }
  const idToken = authHeader.split('Bearer ')[1];
  initFirebaseAdmin();
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email || '', token: decoded };
  } catch (_) {
    const err = new Error('Invalid or expired authentication token');
    err.statusCode = 401;
    throw err;
  }
}

async function isHostAdmin(uid) {
  initFirebaseAdmin();
  const snap = await admin.firestore().collection('hostAdmins').doc(uid).get();
  return snap.exists;
}

async function verifyHostAdmin(event) {
  const caller = await verifyIdToken(event);
  if (!(await isHostAdmin(caller.uid))) {
    const err = new Error('Host admin access required');
    err.statusCode = 403;
    throw err;
  }
  return caller;
}

module.exports = { initFirebaseAdmin, verifyIdToken, isHostAdmin, verifyHostAdmin };
