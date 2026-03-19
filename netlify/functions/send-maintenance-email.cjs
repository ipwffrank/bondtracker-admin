const { Resend } = require('resend');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const dbAdmin = admin.firestore();

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { title, description, startTime, endTime, affectedServices } = JSON.parse(event.body);

    if (!title || !startTime || !endTime) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email service not configured', success: false }) };
    }

    // Fetch all users from root-level users collection
    const usersSnap = await dbAdmin.collection('users').get();
    const emails = [];
    usersSnap.forEach(doc => {
      const email = doc.data().email;
      if (email) emails.push(email);
    });

    if (emails.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, emailCount: 0, message: 'No users to notify' }) };
    }

    // Format dates for display
    const start = new Date(startTime);
    const end = new Date(endTime);
    const fmtOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' };
    const startStr = start.toLocaleString('en-SG', fmtOpts) + ' SGT';
    const endStr = end.toLocaleString('en-SG', fmtOpts) + ' SGT';

    // Calculate duration
    const durationMs = end - start;
    const durationHrs = Math.round(durationMs / (1000 * 60 * 60) * 10) / 10;
    const durationStr = durationHrs >= 1 ? `${durationHrs} hour${durationHrs !== 1 ? 's' : ''}` : `${Math.round(durationMs / (1000 * 60))} minutes`;

    const resend = new Resend(process.env.RESEND_API_KEY);

    // Send in batches of 50 (Resend batch limit)
    const BATCH_SIZE = 50;
    let sentCount = 0;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);

      // Send individually (BCC not supported well in Resend batch)
      for (const email of batch) {
        try {
          await resend.emails.send({
            from: 'Axle <info@axle-finance.com>',
            to: email,
            subject: `Scheduled Maintenance: ${title}`,
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; }
                    .header { background: linear-gradient(135deg, #0f172a, #1e293b); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .header h1 { margin: 0 0 8px; font-size: 22px; }
                    .header p { margin: 0; opacity: 0.7; font-size: 14px; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                    .notice-box { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
                    .notice-box .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 4px; }
                    .notice-box .value { font-size: 15px; color: #111827; font-weight: 600; }
                    .time-row { display: flex; gap: 20px; margin-bottom: 12px; }
                    .time-row > div { flex: 1; }
                    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 700; }
                    .badge-amber { background: #fef3c7; color: #92400e; }
                    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #9ca3af; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>Scheduled Maintenance Notice</h1>
                      <p>Axle Platform</p>
                    </div>
                    <div class="content">
                      <p>Hello,</p>
                      <p>We are writing to inform you of upcoming scheduled maintenance on the Axle platform.</p>

                      <div class="notice-box">
                        <div style="margin-bottom: 16px;">
                          <div class="label">Maintenance</div>
                          <div class="value">${title}</div>
                        </div>
                        ${description ? `<div style="margin-bottom: 16px;"><div class="label">Details</div><div style="font-size: 14px; color: #374151;">${description}</div></div>` : ''}
                        <div class="time-row">
                          <div>
                            <div class="label">Start</div>
                            <div style="font-size: 14px; color: #111827; font-weight: 500;">${startStr}</div>
                          </div>
                          <div>
                            <div class="label">End</div>
                            <div style="font-size: 14px; color: #111827; font-weight: 500;">${endStr}</div>
                          </div>
                        </div>
                        <div class="time-row">
                          <div>
                            <div class="label">Duration</div>
                            <div style="font-size: 14px; color: #111827;">${durationStr}</div>
                          </div>
                          <div>
                            <div class="label">Affected Services</div>
                            <div style="font-size: 14px; color: #111827;">${affectedServices || 'All Services'}</div>
                          </div>
                        </div>
                      </div>

                      <p style="font-size: 14px; color: #374151;">During this window, the platform may be temporarily unavailable or experience reduced functionality. We recommend saving any in-progress work before the maintenance begins.</p>

                      <p style="font-size: 14px; color: #374151;">We apologize for any inconvenience and appreciate your understanding.</p>

                      <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Bridge Logic LP. All rights reserved.</p>
                        <p style="color: #d1d5db;">This is an automated notification from the Axle platform.</p>
                      </div>
                    </div>
                  </div>
                </body>
              </html>
            `,
          });
          sentCount++;
        } catch (emailErr) {
          console.error(`Failed to send to ${email}:`, emailErr.message);
        }
      }
    }

    console.log(`Maintenance emails sent: ${sentCount}/${emails.length}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, emailCount: sentCount, totalUsers: emails.length }),
    };
  } catch (error) {
    console.error('Maintenance email error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, success: false }) };
  }
};
