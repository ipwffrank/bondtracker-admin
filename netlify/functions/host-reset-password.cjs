const admin = require('firebase-admin');
const { Resend } = require('resend');
const { verifyHostAdmin, initFirebaseAdmin } = require('./utils/auth.cjs');

initFirebaseAdmin();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Host admin only — generates a password-reset link and emails it.
  // Without this guard, anyone who finds the URL could trigger reset
  // emails to harass users or hijack accounts via timing.
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

    // Verify user exists in Firebase Auth
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (err) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No user found with this email' }) };
    }

    // Generate password reset link. The continue URL must be on a
    // domain in the Firebase project's authorized list. Override per
    // environment via PASSWORD_RESET_RETURN_URL (e.g. axle-staging
    // points to its own URL); falls back to prod for the prod deploy.
    const returnUrl = process.env.PASSWORD_RESET_RETURN_URL || 'https://www.axle-finance.com/login';
    const resetLink = await admin.auth().generatePasswordResetLink(email, {
      url: returnUrl,
    });

    // Send reset email via Resend
    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error: resendError } = await resend.emails.send({
      from: 'Axle <info@axle-finance.com>',
      to: email,
      subject: 'Reset Your Axle Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #0f172a, #1e293b); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; background: #C8A258; color: #0F2137; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
              .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Password Reset</h1>
              </div>
              <div class="content">
                <p>Hi ${user.displayName || 'there'},</p>
                <p>We received a request to reset your password for your Axle account. Click the button below to set a new password:</p>
                <p style="text-align: center;">
                  <a href="${resetLink}" class="button">Reset Password</a>
                </p>
                <p style="font-size: 13px; color: #6b7280;">If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.</p>
                <div class="footer">
                  <p>Axle — Built for bond sales desks</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (resendError) {
      console.error('Resend error:', resendError);
      return { statusCode: 500, body: JSON.stringify({ error: `Email send failed: ${resendError.message}` }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: `Password reset email sent to ${email}` }),
    };

  } catch (error) {
    console.error('Host reset password error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
