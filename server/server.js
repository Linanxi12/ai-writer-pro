require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Simple JSON database (no native deps, works everywhere) ---
const DB_PATH = path.join(__dirname, 'licenses.json');
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (_) { return { licenses: [] }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}
function findLicense(email, plan) {
  const db = readDB();
  return db.licenses.find(l => l.email === email && l.plan === plan);
}
function upsertLicense(email, licenseKey, plan, orderId) {
  const db = readDB();
  const existing = db.licenses.find(l => l.email === email && l.plan === plan);
  if (existing) {
    existing.license_key = licenseKey;
    existing.lemon_squeezy_order_id = orderId;
    existing.created_at = new Date().toISOString();
  } else {
    db.licenses.push({
      email, license_key: licenseKey, plan,
      lemon_squeezy_order_id: orderId,
      created_at: new Date().toISOString()
    });
  }
  writeDB(db);
}
function verifyLicenseKey(key) {
  const db = readDB();
  return db.licenses.find(l => l.license_key === key) || null;
}

// --- Middleware ---
app.use(helmet());
app.use(cors({
  origin: ['chrome-extension://*', 'https://aiwriter.pro', 'https://linanxi12.github.io', 'http://localhost:*'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Webhook: MUST be before express.json() — Lemon Squeezy needs raw body for HMAC
app.post('/v1/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) { return res.status(200).json({ received: true }); }

  const signature = req.headers['x-signature'];
  if (!signature) { return res.status(200).json({ received: true }); }

  try {
    const rawBody = req.body.toString();
    const hmac = crypto.createHmac('sha256', secret);
    if (hmac.update(rawBody).digest('hex') !== signature) {
      console.log('⚠️ Webhook signature mismatch');
      return res.status(200).json({ received: true });
    }

    const event = JSON.parse(rawBody);
    const eventName = event.meta?.event_name;
    console.log('📦 LS Webhook:', eventName);

    if (eventName === 'order_created' || eventName === 'subscription_created') {
      const attrs = event.data?.attributes || {};
      const userEmail = attrs.user_email || attrs.email;
      const variantName = attrs.variant_name || attrs.product_name || 'pro';
      const orderId = attrs.identifier || event.data?.id || 'unknown';
      const plan = variantName.toLowerCase().includes('business') ? 'business' : 'pro';

      if (!userEmail) {
        console.log('⚠️ No email in webhook, skipping');
        return res.json({ received: true });
      }

      // Generate license key
      const licenseKey = 'AIW-' + plan.toUpperCase() + '-' + crypto.randomBytes(12).toString('hex').toUpperCase();

      // Save to DB
      upsertLicense(userEmail, licenseKey, plan, orderId);
      console.log('✅ License generated:', userEmail, '→', plan, '→', licenseKey.slice(0, 12) + '...');

      // Send email
      await sendWelcomeEmail(userEmail, licenseKey, plan);

      console.log('📧 Welcome email sent to:', userEmail);
    }

    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.status(200).json({ received: true });
  }
});

app.use(express.json({ limit: '50kb' }));

// --- AI Providers ---
const AI_PROVIDERS = {
  deepseek: { url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', key: process.env.DEEPSEEK_API_KEY, openaiCompat: true },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', key: process.env.OPENAI_API_KEY, openaiCompat: true },
  anthropic: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-4-5-20251001', key: process.env.ANTHROPIC_API_KEY, openaiCompat: false },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', key: process.env.GEMINI_API_KEY, openaiCompat: true }
};

function detectProvider() {
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'deepseek';
}
const DEFAULT_PROVIDER = detectProvider();

// --- Action Prompts ---
const ACTION_PROMPTS = {
  rewrite: 'Rewrite the following text to be more clear, professional, and engaging. Keep the same meaning. Only return the rewritten text:\n\n',
  summarize: 'Summarize the following text concisely into key bullet points. Only return the summary:\n\n',
  expand: 'Expand the following text with more detail, examples, and depth. Only return the expanded version:\n\n',
  grammar: 'Fix all grammar, spelling, and punctuation errors. Only return the corrected version:\n\n',
  shorter: 'Make this text more concise while keeping the key message. Only return the shortened version:\n\n',
  translate_cn: 'Translate to Simplified Chinese. Only return the translation:\n\n',
  translate_en: 'Translate to English. Only return the translation:\n\n',
  casual: 'Rewrite in a casual, friendly, conversational tone. Only return the rewritten text:\n\n',
  professional: 'Rewrite in a highly professional, business tone. Only return the rewritten text:\n\n',
  reply: 'Write a thoughtful, appropriate reply to this message. Only return the reply:\n\n'
};

// --- Email: Resend ---
async function sendWelcomeEmail(toEmail, licenseKey, plan) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log('⚠️ RESEND_API_KEY not set, skipping email to', toEmail);
    return;
  }

  const planLimits = { pro: '500', business: '5000' };
  const dailyLimit = planLimits[plan] || '500';

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;">
  <h1 style="color:#6366f1;">✨ Welcome to AI Writer Pro!</h1>
  <p>Thanks for subscribing to the <strong>${plan.toUpperCase()}</strong> plan!</p>
  <div style="background:#f5f3ff;padding:16px;border-radius:10px;margin:20px 0;">
    <p style="margin:0 0 8px;"><strong>🔑 Your License Key:</strong></p>
    <code style="font-size:18px;background:#fff;padding:8px 14px;border-radius:6px;word-break:break-all;">${licenseKey}</code>
    <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Daily limit: ${dailyLimit} AI requests</p>
  </div>
  <h3>📥 How to Install:</h3>
  <ol>
    <li><a href="https://github.com/Linanxi12/ai-writer-pro/raw/main/extension.zip" style="color:#6366f1;">Download the extension (ZIP)</a></li>
    <li>Unzip the file</li>
    <li>Open Chrome → <code>chrome://extensions/</code></li>
    <li>Enable <strong>Developer mode</strong> (top right)</li>
    <li>Click <strong>Load unpacked</strong> → select the unzipped folder</li>
    <li>Click the extension icon → enter your License Key above</li>
    <li>Also enter your free DeepSeek API key from <a href="https://platform.deepseek.com" style="color:#6366f1;">platform.deepseek.com</a></li>
  </ol>
  <hr style="border-color:#e2e8f0;margin:24px 0;">
  <p style="color:#94a3b8;font-size:12px;">AI Writer Pro · <a href="https://linanxi12.github.io/ai-writer-pro/" style="color:#6366f1;">Website</a> · Reply to this email for support</p>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + resendKey
      },
      body: JSON.stringify({
        from: 'AI Writer Pro <noreply@aiwriter.pro>',
        to: toEmail,
        subject: '✨ Your AI Writer Pro License Key',
        html: html
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Resend API error:', JSON.stringify(err).slice(0, 200));
    }
  } catch (e) {
    console.error('Email send failed:', e.message);
  }
}

// --- Routes ---

// Health
app.get('/v1/health', (req, res) => {
  res.json({ status: 'ok', provider: DEFAULT_PROVIDER, timestamp: new Date().toISOString() });
});

// AI write (direct proxy for extension users who prefer server-side calls)
app.post('/v1/write', (req, res) => {
  const { text, action, apiKey: userKey } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });
  if (!ACTION_PROMPTS[action]) return res.status(400).json({ error: 'Invalid action' });

  const apiKey = userKey || AI_PROVIDERS[DEFAULT_PROVIDER]?.key;
  if (!apiKey) return res.status(500).json({ error: 'No AI provider configured' });

  const config = AI_PROVIDERS[DEFAULT_PROVIDER];
  const prompt = ACTION_PROMPTS[action] + text.trim();

  fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })
  }).then(async r => {
    if (!r.ok) throw new Error('AI error: ' + r.status);
    const d = await r.json();
    const result = d.choices?.[0]?.message?.content || d.content?.[0]?.text;
    res.json({ result: result?.trim(), provider: DEFAULT_PROVIDER });
  }).catch(e => {
    res.status(502).json({ error: 'AI unavailable' });
  });
});

// Plans
app.get('/v1/plans', (req, res) => {
  res.json({
    plans: [
      { name: 'Free', price: 0, requests_per_day: 20, features: ['All 10 actions', 'Any website', 'Basic support'] },
      { name: 'Pro', price: 9, currency: 'USD', interval: 'month', requests_per_day: 500, features: ['500 requests/day', 'Priority processing', 'Custom prompts', 'Email support'] },
      { name: 'Business', price: 29, currency: 'USD', interval: 'month', requests_per_day: 5000, features: ['5000 requests/day', 'Team access', 'API access', 'Priority support'] }
    ]
  });
});

// Lemon Squeezy checkout
app.post('/v1/create-checkout', async (req, res) => {
  const { plan } = req.body;
  const planVariantMap = {
    pro: process.env.LEMON_SQUEEZY_PRO_VARIANT,
    business: process.env.LEMON_SQUEEZY_BUSINESS_VARIANT
  };

  const variantId = planVariantMap[plan];
  if (variantId === undefined) return res.status(400).json({ error: 'Invalid plan' });
  if (!variantId) return res.status(500).json({ error: 'Payment not configured yet' });

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  if (!apiKey || !storeId) return res.status(500).json({ error: 'Payment not configured' });

  try {
    const r = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            product_options: { enabled_variants: [variantId], redirect_url: 'https://linanxi12.github.io/ai-writer-pro/success' }
          },
          relationships: {
            store: { data: { type: 'stores', id: storeId } },
            variant: { data: { type: 'variants', id: variantId } }
          }
        }
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.errors?.[0]?.detail || 'LS error');
    res.json({ url: d.data?.attributes?.url });
  } catch (e) {
    res.status(502).json({ error: 'Payment unavailable' });
  }
});

// Payment links
app.get('/v1/payment-links', (req, res) => {
  res.json({
    pro: process.env.LEMON_SQUEEZY_PRO_LINK || null,
    business: process.env.LEMON_SQUEEZY_BUSINESS_LINK || null
  });
});

// License verification (called by extension)
app.get('/v1/verify-license/:key', (req, res) => {
  const key = req.params.key;
  if (!key) return res.status(400).json({ valid: false });

  const license = verifyLicenseKey(key);
  if (!license) return res.json({ valid: false });

  const limits = { free: 20, pro: 500, business: 5000 };
  res.json({
    valid: true,
    plan: license.plan,
    email: license.email,
    daily_limit: limits[license.plan] || 20,
    created_at: license.created_at
  });
});

// Download extension zip (generate on the fly from extension/ dir)
app.get('/v1/download', (req, res) => {
  const archiver = require('archiver');
  const extDir = path.join(__dirname, '..', 'extension');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="ai-writer-pro.zip"');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(extDir, false);
  archive.finalize();
});

// --- Start ---
app.listen(PORT, () => {
  console.log('AI Writer API running on port', PORT);
  console.log('Provider:', DEFAULT_PROVIDER);
  console.log('Endpoints:');
  console.log('  POST /v1/write          - AI writing');
  console.log('  GET  /v1/health         - Health check');
  console.log('  GET  /v1/plans          - Pricing');
  console.log('  POST /v1/webhook        - Lemon Squeezy webhook');
  console.log('  GET  /v1/verify-license - License check');
  console.log('  GET  /v1/download       - Extension download');
});
