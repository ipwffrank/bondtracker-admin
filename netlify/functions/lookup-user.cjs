const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
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
