// 手动补发 License Key
// 用法: node manual-send.js <邮箱> <套餐>
// 例: node manual-send.js customer@gmail.com pro

require('dotenv').config();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const [,, email, plan] = process.argv;

if (!email || !plan) {
  console.log('用法: node manual-send.js <邮箱> <pro|business>');
  console.log('例: node manual-send.js customer@gmail.com pro');
  process.exit(1);
}

if (!['pro','business'].includes(plan)) {
  console.log('套餐只能是 pro 或 business');
  process.exit(1);
}

// 生成 License Key
const licenseKey = 'AIW-' + plan.toUpperCase() + '-' + crypto.randomBytes(12).toString('hex').toUpperCase();

// 存入数据库
const DB_PATH = path.join(__dirname, 'licenses.json');
let db = { licenses: [] };
try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch (_) {}

const existing = db.licenses.find(l => l.email === email && l.plan === plan);
if (existing) {
  existing.license_key = licenseKey;
  existing.created_at = new Date().toISOString();
  console.log('已存在该用户的' + plan + '套餐，已更新 Key');
} else {
  db.licenses.push({ email, license_key: licenseKey, plan, created_at: new Date().toISOString() });
  console.log('新用户，已创建 Key');
}
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

// 发邮件
const planLimits = { pro: '500', business: '5000' };
const dailyLimit = planLimits[plan];

async function send() {
  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com', port: 465, secure: true,
    auth: { user: process.env.QQ_EMAIL, pass: process.env.QQ_SMTP_CODE }
  });

  await transporter.sendMail({
    from: process.env.QQ_EMAIL,
    to: email,
    subject: '✨ Your AI Writer Pro License Key - ' + plan.toUpperCase(),
    html: `
      <h1 style="color:#6366f1;">✨ Welcome to AI Writer Pro!</h1>
      <p>Thanks for subscribing to <strong>${plan.toUpperCase()}</strong>!</p>
      <div style="background:#f5f3ff;padding:16px;border-radius:10px;">
        <strong>🔑 License Key:</strong>
        <code style="font-size:16px;">${licenseKey}</code>
        <p style="font-size:12px;color:#64748b;">Daily limit: ${dailyLimit} requests</p>
      </div>
      <h3>📥 Install:</h3>
      <ol>
        <li>Download: <a href="https://github.com/Linanxi12/ai-writer-pro/releases/latest/download/extension.zip">extension.zip</a></li>
        <li>Unzip → Chrome → chrome://extensions/ → Developer mode → Load unpacked</li>
        <li>Enter License Key + DeepSeek key in extension popup</li>
      </ol>
      <p>Get DeepSeek key: <a href="https://platform.deepseek.com">platform.deepseek.com</a></p>
    `
  });

  console.log('✅ 邮件已发送到 ' + email);
  console.log('🔑 License Key: ' + licenseKey);
  process.exit(0);
}

send().catch(e => { console.error('❌ 失败:', e.message); process.exit(1); });
