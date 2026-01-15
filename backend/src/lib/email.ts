import Mailgun from 'mailgun.js';
import formData from 'form-data';

const mailgun = new Mailgun(formData);

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || '';
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'eliteaccess.group';
const FROM_EMAIL = process.env.FROM_EMAIL || 'EliteAccess <support@eliteaccess.group>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://eliteaccess.group';

const mg = MAILGUN_API_KEY ? mailgun.client({ username: 'api', key: MAILGUN_API_KEY }) : null;

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EliteAccess</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #1a237e 0%, #1565c0 100%); padding: 30px; text-align: center; }
    .header img { width: 60px; height: 60px; border-radius: 12px; }
    .header h1 { color: #ffffff; margin: 15px 0 0 0; font-size: 24px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .content h2 { color: #1a237e; margin: 0 0 20px 0; font-size: 22px; }
    .content p { color: #4a5568; line-height: 1.6; margin: 0 0 15px 0; font-size: 15px; }
    .button { display: inline-block; background: linear-gradient(135deg, #1a237e 0%, #1565c0 100%); color: #ffffff !important; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .button:hover { opacity: 0.9; }
    .info-box { background-color: #f0f4ff; border-left: 4px solid #1565c0; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .info-box h3 { color: #1a237e; margin: 0 0 10px 0; font-size: 16px; }
    .info-box p { margin: 0; color: #4a5568; }
    .code-box { background-color: #1a237e; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
    .code-box .code { font-size: 28px; font-weight: 700; letter-spacing: 3px; font-family: monospace; }
    .code-box .label { font-size: 12px; color: #a5b4fc; margin-bottom: 8px; }
    .footer { background-color: #1a237e; padding: 30px; text-align: center; }
    .footer p { color: #a5b4fc; font-size: 13px; margin: 0 0 10px 0; }
    .footer a { color: #ffc107; text-decoration: none; }
    .divider { height: 1px; background-color: #e2e8f0; margin: 25px 0; }
    .highlight { color: #1565c0; font-weight: 600; }
    .success-badge { display: inline-block; background-color: #10b981; color: #ffffff; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .warning-badge { display: inline-block; background-color: #f59e0b; color: #ffffff; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    table th { background-color: #f0f4ff; color: #1a237e; padding: 12px; text-align: left; font-size: 13px; }
    table td { padding: 12px; border-bottom: 1px solid #e2e8f0; color: #4a5568; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${FRONTEND_URL}/logo.png" alt="EliteAccess" />
      <h1>EliteAccess</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Need help? Contact us at <a href="mailto:support@eliteaccess.group">support@eliteaccess.group</a></p>
      <p>&copy; ${new Date().getFullYear()} EliteAccess. All rights reserved.</p>
      <p><a href="${FRONTEND_URL}">Visit our website</a></p>
    </div>
  </div>
</body>
</html>
`;

export const emailTemplates = {
  welcome: (name: string) => ({
    subject: 'Welcome to EliteAccess - Your Premium Access Awaits!',
    html: baseTemplate(`
      <h2>Welcome to EliteAccess, ${name}!</h2>
      <p>We're thrilled to have you join our community of <span class="highlight">2,500+ members</span> who are saving money on premium tools every day.</p>
      
      <div class="info-box">
        <h3>What's Next?</h3>
        <p>Browse our catalog of 50+ premium tools and start saving up to 90% on your subscriptions.</p>
      </div>
      
      <p>Here's what you can do now:</p>
      <ul style="color: #4a5568; line-height: 2;">
        <li>Browse our <a href="${FRONTEND_URL}/products" style="color: #1565c0;">product catalog</a></li>
        <li>Download our secure apps for <a href="${FRONTEND_URL}/#downloads" style="color: #1565c0;">Windows, Mac, or Linux</a></li>
        <li>Check out your <a href="${FRONTEND_URL}/dashboard" style="color: #1565c0;">dashboard</a></li>
      </ul>
      
      <div style="text-align: center;">
        <a href="${FRONTEND_URL}/products" class="button">Browse Products</a>
      </div>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;">If you have any questions, our support team is here to help 24/7. Just reply to this email or contact us at support@eliteaccess.group.</p>
    `)
  }),

  purchaseConfirmation: (name: string, productName: string, accessCode: string, price: string, expiresAt: string) => ({
    subject: `Your ${productName} Access is Ready!`,
    html: baseTemplate(`
      <h2>Purchase Confirmed!</h2>
      <p>Hi ${name},</p>
      <p>Great news! Your purchase of <span class="highlight">${productName}</span> has been confirmed. You now have premium access!</p>
      
      <div class="code-box">
        <div class="label">YOUR ACCESS CODE</div>
        <div class="code">${accessCode}</div>
      </div>
      
      <div class="info-box">
        <h3>How to Use Your Access Code</h3>
        <p>1. Download our app for your platform (Windows, Mac, or Linux)<br>
        2. Open the app and enter your access code<br>
        3. Click "Launch" to access ${productName}</p>
      </div>
      
      <table>
        <tr>
          <th>Product</th>
          <td>${productName}</td>
        </tr>
        <tr>
          <th>Amount Paid</th>
          <td>$${price}</td>
        </tr>
        <tr>
          <th>Access Expires</th>
          <td>${expiresAt}</td>
        </tr>
        <tr>
          <th>Status</th>
          <td><span class="success-badge">Active</span></td>
        </tr>
      </table>
      
      <div style="text-align: center;">
        <a href="${FRONTEND_URL}/dashboard" class="button">Go to Dashboard</a>
      </div>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;"><strong>Important:</strong> Keep your access code safe and don't share it with others. Each code is unique to your account.</p>
    `)
  }),

  paymentSuccessful: (name: string, amount: string, productName: string, transactionId: string) => ({
    subject: 'Payment Successful - EliteAccess',
    html: baseTemplate(`
      <h2>Payment Successful!</h2>
      <p>Hi ${name},</p>
      <p>We've received your payment. Thank you for your purchase!</p>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Amount:</strong> $${amount}<br>
        <strong>Product:</strong> ${productName}<br>
        <strong>Transaction ID:</strong> ${transactionId}<br>
        <strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      
      <p>Your access has been activated and you can start using ${productName} immediately.</p>
      
      <div style="text-align: center;">
        <a href="${FRONTEND_URL}/dashboard" class="button">Access Your Products</a>
      </div>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;">This is an automated receipt for your records. If you have any questions about this payment, please contact our support team.</p>
    `)
  }),

  accessCodeDelivery: (name: string, productName: string, accessCode: string) => ({
    subject: `Your ${productName} Access Code`,
    html: baseTemplate(`
      <h2>Your Access Code is Ready!</h2>
      <p>Hi ${name},</p>
      <p>Here's your access code for <span class="highlight">${productName}</span>:</p>
      
      <div class="code-box">
        <div class="label">ACCESS CODE</div>
        <div class="code">${accessCode}</div>
      </div>
      
      <div class="info-box">
        <h3>Quick Start Guide</h3>
        <p>1. Download our secure app from <a href="${FRONTEND_URL}" style="color: #1565c0;">eliteaccess.group</a><br>
        2. Open the app and paste your access code<br>
        3. Click "Launch" to start using ${productName}</p>
      </div>
      
      <div style="text-align: center;">
        <a href="${FRONTEND_URL}/dashboard" class="button">View in Dashboard</a>
      </div>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;"><strong>Security Tip:</strong> Never share your access code with anyone. If you suspect unauthorized use, regenerate your code from the dashboard.</p>
    `)
  }),

  passwordReset: (name: string, resetLink: string) => ({
    subject: 'Reset Your Password - EliteAccess',
    html: baseTemplate(`
      <h2>Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      
      <div style="text-align: center;">
        <a href="${resetLink}" class="button">Reset Password</a>
      </div>
      
      <div class="info-box">
        <h3>Didn't request this?</h3>
        <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
      </div>
      
      <p style="font-size: 13px; color: #718096;">This link will expire in 1 hour for security reasons. If you need a new link, please request another password reset.</p>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;">If you're having trouble clicking the button, copy and paste this URL into your browser:<br>
      <a href="${resetLink}" style="color: #1565c0; word-break: break-all;">${resetLink}</a></p>
    `)
  }),

  subscriptionRenewalReminder: (name: string, productName: string, expiresAt: string, daysLeft: number) => ({
    subject: `Your ${productName} Access Expires in ${daysLeft} Days`,
    html: baseTemplate(`
      <h2>Renewal Reminder</h2>
      <p>Hi ${name},</p>
      <p>Your access to <span class="highlight">${productName}</span> will expire soon.</p>
      
      <div class="info-box">
        <h3>Subscription Details</h3>
        <p><strong>Product:</strong> ${productName}<br>
        <strong>Expires:</strong> ${expiresAt}<br>
        <strong>Days Remaining:</strong> <span class="warning-badge">${daysLeft} days</span></p>
      </div>
      
      <p>Don't lose access to your premium tools! Renew now to continue enjoying ${productName}.</p>
      
      <div style="text-align: center;">
        <a href="${FRONTEND_URL}/dashboard" class="button">Renew Now</a>
      </div>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;">If you have auto-renewal enabled, your subscription will be renewed automatically. You can manage your subscription settings in your dashboard.</p>
    `)
  }),

  subscriptionExpired: (name: string, productName: string) => ({
    subject: `Your ${productName} Access Has Expired`,
    html: baseTemplate(`
      <h2>Subscription Expired</h2>
      <p>Hi ${name},</p>
      <p>Your access to <span class="highlight">${productName}</span> has expired.</p>
      
      <div class="info-box">
        <h3>What This Means</h3>
        <p>You will no longer be able to access ${productName} through our platform until you renew your subscription.</p>
      </div>
      
      <p>Don't worry - you can renew anytime and get instant access again!</p>
      
      <div style="text-align: center;">
        <a href="${FRONTEND_URL}/products" class="button">Renew Subscription</a>
      </div>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;">We'd love to have you back! If you have any questions or need assistance, our support team is here to help.</p>
    `)
  }),

  accountVerification: (name: string, verificationLink: string) => ({
    subject: 'Verify Your Email - EliteAccess',
    html: baseTemplate(`
      <h2>Verify Your Email Address</h2>
      <p>Hi ${name},</p>
      <p>Thanks for signing up! Please verify your email address to complete your registration.</p>
      
      <div style="text-align: center;">
        <a href="${verificationLink}" class="button">Verify Email</a>
      </div>
      
      <p style="font-size: 13px; color: #718096;">This link will expire in 24 hours. If you didn't create an account with EliteAccess, you can safely ignore this email.</p>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;">If you're having trouble clicking the button, copy and paste this URL into your browser:<br>
      <a href="${verificationLink}" style="color: #1565c0; word-break: break-all;">${verificationLink}</a></p>
    `)
  }),

  newLoginAlert: (name: string, device: string, location: string, time: string) => ({
    subject: 'New Login to Your EliteAccess Account',
    html: baseTemplate(`
      <h2>New Login Detected</h2>
      <p>Hi ${name},</p>
      <p>We detected a new login to your EliteAccess account.</p>
      
      <div class="info-box">
        <h3>Login Details</h3>
        <p><strong>Device:</strong> ${device}<br>
        <strong>Location:</strong> ${location}<br>
        <strong>Time:</strong> ${time}</p>
      </div>
      
      <p>If this was you, no action is needed. If you don't recognize this login, please secure your account immediately.</p>
      
      <div style="text-align: center;">
        <a href="${FRONTEND_URL}/dashboard" class="button">Review Account Activity</a>
      </div>
      
      <div class="divider"></div>
      
      <p style="font-size: 13px; color: #718096;">For your security, we recommend using a strong, unique password and enabling two-factor authentication if available.</p>
    `)
  })
};

export const sendEmail = async (to: string, template: { subject: string; html: string }) => {
  if (!mg) {
    console.log('Mailgun not configured. Email would be sent to:', to);
    console.log('Subject:', template.subject);
    return { success: false, message: 'Mailgun not configured' };
  }

  try {
    const result = await mg.messages.create(MAILGUN_DOMAIN, {
      from: FROM_EMAIL,
      to: [to],
      subject: template.subject,
      html: template.html
    });
    console.log('Email sent successfully:', result.id);
    return { success: true, messageId: result.id };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error };
  }
};

export default { sendEmail, emailTemplates };
