const admin = require('firebase-admin');
const { verifyHostAdmin, initFirebaseAdmin } = require('./utils/auth.cjs');

initFirebaseAdmin();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Host admin only — leaks Firebase Auth identity (email, displayName)
  // by design; callers must be authenticated host admins.
  try {
    await verifyHostAdmin(event);
  } catch (err) {
    return { statusCode: err.statusCode || 401, body: JSON.stringify({ error: err.message }) };
  }

  try {
    const { email } = JSON.parse(event.body);

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Email is required' }) };
    }

    const user = await admin.auth().getUserByEmail(email.trim());

    return {
      statusCode: 200,
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
      }),
    };
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      return { statusCode: 404, body: JSON.stringify({ error: 'No Firebase Auth user found with this email' }) };
    }
    console.error('Lookup user error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
