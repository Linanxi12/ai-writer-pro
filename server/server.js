require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(helmet());
app.use(cors({
  origin: ['chrome-extension://*', 'https://aiwriter.pro', 'http://localhost:*'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Webhook must be BEFORE express.json() — needs raw body for signature verification
app.post('/v1/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  const crypto = require('crypto');

  if (!secret) {
    return res.status(200).json({ received: true }); // Silently accept when not configured
  }

  const signature = req.headers['x-signature'];
  if (!signature) {
    return res.status(200).json({ received: true });
  }

  try {
    const rawBody = req.body.toString();
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(rawBody).digest('hex');
    if (signature !== digest) {
      console.log('⚠️ Webhook signature mismatch');
      return res.status(200).json({ received: true }); // Don't expose error to caller
    }

    const event = JSON.parse(rawBody);
    const eventName = event.meta?.event_name;
    console.log(`📦 LS Webhook: ${eventName}`);

    if (eventName === 'subscription_created' || eventName === 'order_created') {
      const userEmail = event.data?.attributes?.user_email || 'unknown';
      const planName = event.data?.attributes?.variant_name || 'pro';
      console.log(`✅ New subscriber: ${userEmail} → ${planName}`);
      // TODO: auto-generate API key, send to user email
    }
  } catch (e) {
    console.log('⚠️ Webhook parse error:', e.message);
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '50kb' }));

// --- Rate Limiting ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  message: { error: 'Rate limit exceeded. Please upgrade to Pro.' }
});

const freePlanLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 20, // Free: 20 requests/day
  keyGenerator: (req) => req.headers.authorization || req.ip,
  message: { error: 'Free plan limit reached (20/day). Upgrade to Pro for unlimited access.' }
});

app.use('/v1/', apiLimiter);

// --- AI Providers Config ---
// All providers are OpenAI-compatible except Anthropic
const AI_PROVIDERS = {
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    key: process.env.DEEPSEEK_API_KEY,
    openaiCompat: true
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    key: process.env.OPENAI_API_KEY,
    openaiCompat: true
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-haiku-4-5-20251001',
    key: process.env.ANTHROPIC_API_KEY,
    openaiCompat: false
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.0-flash',
    key: process.env.GEMINI_API_KEY,
    openaiCompat: true
  }
};

// Auto-detect provider: first available key wins
function detectProvider() {
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'deepseek'; // default fallback
}

const DEFAULT_PROVIDER = detectProvider();

// --- Action Prompts ---
const ACTION_PROMPTS = {
  rewrite: 'Rewrite the following text to be more clear, professional, and engaging. Keep the same meaning and tone. Only return the rewritten text:\n\n',
  summarize: 'Summarize the following text concisely into key bullet points. Only return the summary:\n\n',
  expand: 'Expand the following text with more detail, examples, and depth while maintaining the original tone. Only return the expanded version:\n\n',
  grammar: 'Fix all grammar, spelling, and punctuation errors in the following text. Only return the corrected version:\n\n',
  shorter: 'Make the following text more concise and shorter while preserving the key message. Only return the shortened version:\n\n',
  translate_cn: 'Translate the following text to Simplified Chinese. Only return the translation:\n\n',
  translate_en: 'Translate the following text to English. Only return the translation:\n\n',
  casual: 'Rewrite the following text in a more casual, friendly, conversational tone. Only return the rewritten text:\n\n',
  professional: 'Rewrite the following text in a highly professional, business-appropriate tone. Only return the rewritten text:\n\n',
  reply: 'Write a thoughtful, appropriate reply to the following message. Only return the reply:\n\n'
};

// --- API Key Verification ---
function verifyApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }

  const apiKey = authHeader.slice(7);

  // Check if it's a valid user API key (from our system)
  // In production, validate against database
  // For now, accept any key that matches env or is a valid format
  if (apiKey === process.env.MASTER_API_KEY || apiKey.length >= 32) {
    req.apiKey = apiKey;
    next();
  } else {
    res.status(401).json({ error: 'Invalid API key' });
  }
}

// --- AI Call ---
async function callAI(text, actionKey, provider = DEFAULT_PROVIDER) {
  const prompt = (ACTION_PROMPTS[actionKey] || ACTION_PROMPTS.rewrite) + text;
  const config = AI_PROVIDERS[provider];

  if (!config || !config.key) {
    throw new Error(`AI provider ${provider} not configured`);
  }

  if (provider === 'anthropic') {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text.trim();
  }

  // OpenAI-compatible
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.key}`
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// --- Routes ---

// Health check
app.get('/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: DEFAULT_PROVIDER,
    timestamp: new Date().toISOString()
  });
});

// Main write endpoint
app.post('/v1/write', verifyApiKey, freePlanLimiter, async (req, res) => {
  const { text, action, prompt } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!action && !prompt) {
    return res.status(400).json({ error: 'Action or prompt is required' });
  }

  const actionKey = action || 'custom';
  if (!ACTION_PROMPTS[actionKey] && !prompt) {
    return res.status(400).json({
      error: `Invalid action. Valid actions: ${Object.keys(ACTION_PROMPTS).join(', ')}`
    });
  }

  try {
    const result = await callAI(text.trim(), actionKey);
    res.json({
      result,
      action: actionKey,
      provider: DEFAULT_PROVIDER,
      usage: { remaining: 'See rate limit headers' }
    });
  } catch (err) {
    console.error('AI call failed:', err.message);
    res.status(502).json({ error: 'AI service temporarily unavailable. Please try again.' });
  }
});

// Pricing info
app.get('/v1/plans', (req, res) => {
  res.json({
    plans: [
      {
        name: 'Free',
        price: 0,
        requests_per_day: 20,
        features: ['All 10 writing actions', 'Any website', 'Basic support']
      },
      {
        name: 'Pro',
        price: 9,
        currency: 'USD',
        interval: 'month',
        requests_per_day: 500,
        features: ['Unlimited requests', 'Priority AI processing', 'Custom prompts', 'Email support']
      },
      {
        name: 'Business',
        price: 29,
        currency: 'USD',
        interval: 'month',
        requests_per_day: 5000,
        features: ['Everything in Pro', 'Team access', 'API access', 'Priority support']
      }
    ]
  });
});

// === Lemon Squeezy Payment Integration ===
// 1. Register at https://app.lemonsqueezy.com
// 2. Create products: Pro ($9/mo) and Business ($29/mo)
// 3. Copy Variant IDs → put in .env LEMON_SQUEEZY_PRO_VARIANT / LEMON_SQUEEZY_BUSINESS_VARIANT

function getLemonSqueezyCheckout(variantId, userEmail) {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  if (!apiKey || !storeId || !variantId) return null;

  const checkoutData = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: userEmail ? { email: userEmail } : {},
        product_options: {
          enabled_variants: [variantId],
          redirect_url: 'https://aiwriter.pro/success'
        },
        checkout_options: { embed: false }
      },
      relationships: {
        store: { data: { type: 'stores', id: storeId } },
        variant: { data: { type: 'variants', id: variantId } }
      }
    }
  };

  return {
    url: 'https://api.lemonsqueezy.com/v1/checkouts',
    data: checkoutData,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${apiKey}`
    }
  };
}

app.post('/v1/create-checkout', async (req, res) => {
  const { plan, email } = req.body;
  const planVariantMap = {
    pro: process.env.LEMON_SQUEEZY_PRO_VARIANT,
    business: process.env.LEMON_SQUEEZY_BUSINESS_VARIANT
  };

  const variantId = planVariantMap[plan];
  if (variantId === undefined) {
    return res.status(400).json({ error: 'Invalid plan. Choose "pro" or "business".' });
  }
  if (!variantId) {
    return res.status(500).json({
      error: `Payment for "${plan}" not configured yet. Set LEMON_SQUEEZY_${plan.toUpperCase()}_VARIANT in .env`
    });
  }

  const checkout = getLemonSqueezyCheckout(variantId, email);
  if (!checkout) {
    return res.status(500).json({
      error: 'Payment not configured yet. Set LEMON_SQUEEZY_API_KEY + LEMON_SQUEEZY_STORE_ID in .env'
    });
  }

  try {
    const response = await fetch(checkout.url, {
      method: 'POST',
      headers: checkout.headers,
      body: JSON.stringify(checkout.data)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Lemon Squeezy error:', JSON.stringify(err).slice(0, 300));
      throw new Error(err.errors?.[0]?.detail || `LS API error: ${response.status}`);
    }

    const result = await response.json();
    const checkoutUrl = result.data?.attributes?.url;
    if (!checkoutUrl) throw new Error('No checkout URL in response');

    res.json({ url: checkoutUrl });
  } catch (err) {
    console.error('Checkout creation failed:', err.message);
    res.status(502).json({ error: 'Payment service temporarily unavailable.' });
  }
});

// Direct purchase links (for landing page buttons — no API call needed)
app.get('/v1/payment-links', (req, res) => {
  res.json({
    pro: process.env.LEMON_SQUEEZY_PRO_LINK || null,
    business: process.env.LEMON_SQUEEZY_BUSINESS_LINK || null,
    note: 'Get these links from Lemon Squeezy Dashboard → Products → Share → Direct Link'
  });
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`AI Writer API running on port ${PORT}`);
  console.log(`Provider: ${DEFAULT_PROVIDER}`);
  console.log(`Endpoints:`);
  console.log(`  POST /v1/write     - AI writing`);
  console.log(`  GET  /v1/health    - Health check`);
  console.log(`  GET  /v1/plans     - Pricing plans`);
});
