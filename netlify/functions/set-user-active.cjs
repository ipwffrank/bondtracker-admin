const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function verifyHostAdmin(event) {
  const authHeader = event.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing authentication token');
    err.statusCode = 401;
    throw err;
  }
  const idToken = authHeader.split('Bearer ')[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  const db = admin.firestore();
  const hostDoc = await db.collection('hostAdmins').doc(decoded.uid).get();
  if (!hostDoc.exists) {
    const err = new Error('Host admin access required');
    err.statusCode = 403;
    throw err;
  }
  return decoded;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let caller;
  try {
    caller = await verifyHostAdmin(event);
  } catch (err) {
    return { statusCode: err.statusCode || 401, body: JSON.stringify({ error: err.message }) };
  }

  try {
    const { userId, active } = JSON.parse(event.body || '{}');
    if (!userId || typeof active !== 'boolean') {
      return { statusCode: 400, body: JSON.stringify({ error: 'userId (string) and active (boolean) are required' }) };
    }

    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const deactivated = !active;

    // Flip Firebase Auth — a disabled user cannot sign in. Revoking refresh
    // tokens ejects any active session within an hour (ID tokens live ~1h).
    try {
      await admin.auth().updateUser(userId, { disabled: deactivated });
      if (deactivated) {
        await admin.auth().revokeRefreshTokens(userId);
      }
    } catch (authErr) {
      if (authErr.code !== 'auth/user-not-found') {
        console.error('Auth update failed:', authErr);
        return { statusCode: 500, body: JSON.stringify({ error: `Auth update failed: ${authErr.message}` }) };
      }
      // user-not-found: ghost Firestore record with no Auth account — still
      // update Firestore below so the admin UI reflects it.
    }

    // Mirror state on the root user doc + org sub-collection. Keeps the list
    // filterable without hitting Auth on every render.
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const orgId = userData.organizationId;

    const fields = {
      deactivated,
      deactivatedAt: deactivated ? now : null,
      deactivatedBy: deactivated ? (caller.email || caller.uid) : null,
    };

    await userRef.set(fields, { merge: true });

    if (orgId) {
      await db.collection('organizations').doc(orgId).collection('users').doc(userId).set(fields, { merge: true });
    }

    // Audit log on the target's org (immutable per Firestore rules).
    try {
      if (orgId) {
        await db.collection('organizations').doc(orgId).collection('auditLogs').add({
          action: deactivated ? 'user_deactivated' : 'user_reactivated',
          details: `Host admin ${caller.email || caller.uid} ${deactivated ? 'deactivated' : 'reactivated'} ${userData.email || userId}`,
          userId: caller.uid,
          userEmail: caller.email || '',
          targetUserId: userId,
          targetUserEmail: userData.email || '',
          timestamp: now,
        });
      }
    } catch (_) { /* non-fatal */ }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        userId,
        active,
        message: deactivated ? 'User deactivated. They can no longer sign in.' : 'User reactivated.',
      }),
    };
  } catch (err) {
    console.error('set-user-active error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
