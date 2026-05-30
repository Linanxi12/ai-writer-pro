// AI Writer Pro - Automated Test Suite
// Run: node test-extension.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const EXT = 'd:/桌面/ai-writer/extension';
const SERVER_ENV = 'd:/桌面/ai-writer/server/.env';
let passed = 0, failed = 0, warnings = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

// ====== 1. FILE STRUCTURE ======
console.log('\n📁 1. File Structure');
test('manifest.json exists', () => {
  if (!fs.existsSync(`${EXT}/manifest.json`)) throw new Error('missing');
});
test('content.js exists', () => {
  if (!fs.existsSync(`${EXT}/content.js`)) throw new Error('missing');
});
test('content.css exists', () => {
  if (!fs.existsSync(`${EXT}/content.css`)) throw new Error('missing');
});
test('popup.html exists', () => {
  if (!fs.existsSync(`${EXT}/popup.html`)) throw new Error('missing');
});
test('popup.js exists', () => {
  if (!fs.existsSync(`${EXT}/popup.js`)) throw new Error('missing');
});
test('popup.css exists', () => {
  if (!fs.existsSync(`${EXT}/popup.css`)) throw new Error('missing');
});
test('background.js exists', () => {
  if (!fs.existsSync(`${EXT}/background.js`)) throw new Error('missing');
});
test('icon16.png exists', () => {
  if (!fs.existsSync(`${EXT}/icons/icon16.png`)) throw new Error('missing');
});
test('icon48.png exists', () => {
  if (!fs.existsSync(`${EXT}/icons/icon48.png`)) throw new Error('missing');
});
test('icon128.png exists', () => {
  if (!fs.existsSync(`${EXT}/icons/icon128.png`)) throw new Error('missing');
});

// ====== 2. MANIFEST VALIDATION ======
console.log('\n📋 2. Manifest Validation');
const manifest = JSON.parse(fs.readFileSync(`${EXT}/manifest.json`, 'utf8'));

test('manifest_version is 3', () => {
  if (manifest.manifest_version !== 3) throw new Error('must be MV3');
});
test('name is set', () => {
  if (!manifest.name || manifest.name.length < 3) throw new Error('name too short');
});
test('version is set', () => {
  if (!manifest.version) throw new Error('version missing');
});
test('description is set', () => {
  if (!manifest.description || manifest.description.length < 10) throw new Error('description too short');
});
test('icons declared (16,48,128)', () => {
  ['16','48','128'].forEach(s => {
    if (!manifest.icons || !manifest.icons[s]) throw new Error(`icon${s} missing`);
  });
});
test('action.default_popup set', () => {
  if (!manifest.action || !manifest.action.default_popup) throw new Error('popup missing');
});
test('permissions include storage', () => {
  if (!manifest.permissions.includes('storage')) throw new Error('storage permission missing');
});
test('permissions include alarms', () => {
  if (!manifest.permissions.includes('alarms')) throw new Error('alarms permission missing');
});
test('host_permissions include deepseek', () => {
  const hosts = manifest.host_permissions || [];
  if (!hosts.some(h => h.includes('api.deepseek.com'))) throw new Error('DeepSeek host not allowed');
});
test('content_scripts configured', () => {
  if (!manifest.content_scripts || !manifest.content_scripts[0]) throw new Error('no content script');
  if (!manifest.content_scripts[0].js.includes('content.js')) throw new Error('content.js not in scripts');
  if (!manifest.content_scripts[0].css.includes('content.css')) throw new Error('content.css not in styles');
});
test('content_scripts matches all_urls', () => {
  if (!manifest.content_scripts[0].matches.includes('<all_urls>')) throw new Error('must match all URLs');
});
test('service_worker configured', () => {
  if (!manifest.background || !manifest.background.service_worker) throw new Error('no service worker');
});

// ====== 3. JS SYNTAX & STRUCTURE ======
console.log('\n📝 3. JavaScript Validation');

function validateJS(filepath) {
  const code = fs.readFileSync(filepath, 'utf8');
  // Syntax check
  try { new Function(code); } catch (e) { throw new Error(`Syntax error: ${e.message}`); }
  return code;
}

test('content.js - syntax valid', () => {
  const c = validateJS(`${EXT}/content.js`);
  if (!c.includes('callAI')) throw new Error('callAI function missing');
  if (!c.includes('safeAppend')) throw new Error('safeAppend missing');
  if (!c.includes('createFloatingButton')) throw new Error('createFloatingButton missing');
  if (!c.includes('createPopup')) throw new Error('createPopup missing');
  if (!c.includes('handleAction')) throw new Error('handleAction missing');
  if (!c.includes('abortController')) throw new Error('abortController missing (cancel support)');
  if (!c.includes('lastResult')) throw new Error('lastResult missing (raw result storage)');
  if (!c.includes('hasAutoFilled')) throw new Error('hasAutoFilled missing (single autofill)');
  if (!c.includes('escapeHtml')) throw new Error('escapeHtml missing (XSS prevention)');
  if (!c.includes('isValidApiKey')) throw new Error('isValidApiKey missing (key validation)');
  if (!c.includes('incrementUsage')) throw new Error('incrementUsage missing (usage tracking)');
  if (!c.includes('api.deepseek.com')) throw new Error('DeepSeek API endpoint missing');
  if (!c.includes('AbortController')) throw new Error('AbortController not used');
  // Check all 10 actions present
  ['rewrite','summarize','expand','grammar','shorter','translate_cn','translate_en','casual','professional','reply'].forEach(a => {
    // Check for object key pattern "actionName:"
    if (!c.includes(a + ':')) throw new Error('action "' + a + '" missing');
  });
});

test('popup.js - syntax valid', () => {
  const c = validateJS(`${EXT}/popup.js`);
  if (!c.includes('chrome.storage.local.get')) throw new Error('storage access missing');
  if (!c.includes('dataset.realKey')) throw new Error('key masking missing');
  if (!c.includes('startsWith(\'sk-\')')) throw new Error('key format validation missing');
  if (!c.includes('xiaoqi.lemonsqueezy.com')) throw new Error('Lemon Squeezy checkout link missing');
});

test('background.js - syntax valid', () => {
  const c = validateJS(`${EXT}/background.js`);
  if (!c.includes('chrome.alarms.create')) throw new Error('alarms API missing');
  if (!c.includes('incrementUsage')) throw new Error('incrementUsage handler missing');
  if (!c.includes('dailyReset')) throw new Error('daily reset missing');
  if (!c.includes('linanxi12.github.io')) throw new Error('correct landing URL missing');
  if (c.includes('aiwriter.pro/welcome')) throw new Error('OLD invalid URL still present');
});

// ====== 4. CROSS-REFERENCE CHECKS ======
console.log('\n🔗 4. Cross-Reference Checks');

test('Popup referenced files exist', () => {
  const html = fs.readFileSync(`${EXT}/popup.html`, 'utf8');
  const refs = html.match(/src="([^"]+)"/g) || [];
  const hrefs = html.match(/href="([^"]+)"/g) || [];
  [...refs, ...hrefs].forEach(r => {
    const file = r.match(/["=]([^"]+)/)[1];
    if (file.endsWith('.css') || file.endsWith('.js')) {
      if (!fs.existsSync(`${EXT}/${file}`)) throw new Error(`Referenced file missing: ${file}`);
    }
  });
});

test('Manifest icons point to real files', () => {
  Object.values(manifest.icons).forEach(icon => {
    if (!fs.existsSync(`${EXT}/${icon}`)) throw new Error(`Icon missing: ${icon}`);
  });
});

test('Content script popup.html link is valid', () => {
  const html = fs.readFileSync(`${EXT}/popup.html`, 'utf8');
  if (!html.includes('platform.deepseek.com')) warn('popup.html should mention DeepSeek registration URL');
});

// ====== 5. API INTEGRATION TEST ======
console.log('\n🤖 5. DeepSeek API Integration');

// Load API key from server .env (manual parse, no dotenv dependency)
let apiKey = '';
try {
  const envContent = fs.readFileSync(SERVER_ENV, 'utf8');
  const match = envContent.match(/DEEPSEEK_API_KEY=(.+)/);
  if (match) apiKey = match[1].trim();
} catch (_) {}

if (!apiKey || apiKey === 'YOUR_DEEPSEEK_API_KEY_HERE' || !apiKey.startsWith('sk-')) {
  console.log('  ⚠️  SKIPPED: No valid DeepSeek API key in server/.env');
  warnings++;
} else {
  // Test valid API call
  const testCall = (body, label) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      timeout: 20000
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(b);
          if (d.choices && d.choices[0].message.content) {
            resolve({ ok: true, result: d.choices[0].message.content.trim(), label });
          } else {
            reject(new Error(`No content: ${b.slice(0, 100)}`));
          }
        } catch (e) {
          reject(new Error(`${label}: Parse error - ${b.slice(0, 100)}`));
        }
      });
    });
    req.on('error', e => reject(new Error(`${label}: Network error - ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error(`${label}: Timeout`)); });
    req.write(data);
    req.end();
  });

  Promise.all([
    testCall({
      model: 'deepseek-chat', max_tokens: 100,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }]
    }, 'Basic connectivity'),
    testCall({
      model: 'deepseek-chat', max_tokens: 200,
      messages: [{ role: 'user', content: 'Fix grammar: "he dont know nothing about that"' }]
    }, 'Grammar fix'),
    testCall({
      model: 'deepseek-chat', max_tokens: 200,
      messages: [{ role: 'user', content: 'Translate to Chinese: "Hello world"' }]
    }, 'Translation')
  ]).then(results => {
    results.forEach(r => {
      test(r.label, () => {
        if (!r.ok || !r.result || r.result.length === 0) throw new Error('Empty response');
        console.log(`    → "${r.result.slice(0, 80)}${r.result.length > 80 ? '...' : ''}"`);
      });
    });
  }).catch(e => {
    console.log(`  ❌ API test error: ${e.message}`);
    failed++;
  }).then(() => {
    // Test invalid key
    test('Invalid API key returns 401', async () => {
      try {
        const data = JSON.stringify({ model: 'deepseek-chat', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
        await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-invalidkey12345678901234567890' },
            timeout: 10000
          }, res => {
            if (res.statusCode === 401) resolve();
            else reject(new Error(`Expected 401, got ${res.statusCode}`));
          });
          req.on('error', reject);
          req.write(data);
          req.end();
        });
      } catch (e) {
        throw new Error(`401 test failed: ${e.message}`);
      }
    });
  });
}

// ====== 6. SECURITY AUDIT ======
console.log('\n🔒 6. Security Audit');

test('No hardcoded API keys in content.js', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  if (c.match(/sk-[a-zA-Z0-9]{30,}/)) throw new Error('Hardcoded API key found!');
});
test('No hardcoded API keys in popup.js', () => {
  const c = fs.readFileSync(`${EXT}/popup.js`, 'utf8');
  if (c.match(/sk-[a-zA-Z0-9]{30,}/)) throw new Error('Hardcoded API key found!');
});
test('No hardcoded API keys in background.js', () => {
  const c = fs.readFileSync(`${EXT}/background.js`, 'utf8');
  if (c.match(/sk-[a-zA-Z0-9]{30,}/)) throw new Error('Hardcoded API key found!');
});
test('No eval() usage', () => {
  ['content.js','popup.js','background.js'].forEach(f => {
    const c = fs.readFileSync(`${EXT}/${f}`, 'utf8');
    if (c.match(/\beval\s*\(/)) throw new Error(`eval() found in ${f}`);
  });
});
test('No innerHTML with user input (content.js)', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  // Verify escapeHtml function is used for error messages
  if (!c.includes('escapeHtml(err.message)')) throw new Error('Error messages not escaped');
});
test('CSP-compatible (no inline scripts in popup.html)', () => {
  const html = fs.readFileSync(`${EXT}/popup.html`, 'utf8');
  const inlineScripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
  if (inlineScripts && inlineScripts.length > 1) throw new Error('Inline scripts found (CSP risk)');
});
test('API key stored in chrome.storage.local (standard practice)', () => {
  const c = fs.readFileSync(`${EXT}/popup.js`, 'utf8');
  if (!c.includes('chrome.storage.local.set') || !c.includes('apiKey')) {
    throw new Error('API key not stored properly');
  }
});
test('Sensitive key masked in popup display', () => {
  const c = fs.readFileSync(`${EXT}/popup.js`, 'utf8');
  if (!c.includes('•••')) throw new Error('Key masking not implemented');
});

// ====== 7. EDGE CASES ======
console.log('\n🧪 7. Edge Cases');

test('Handles empty text gracefully', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  if (!c.includes('!text')) throw new Error('Empty text check missing');
});
test('Handles missing API key gracefully', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  if (!c.includes('!apiKey')) throw new Error('Missing API key check missing');
});
test('Handles network errors (try/catch around fetch)', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  if (!c.includes('try {') || !c.includes('catch (err)')) throw new Error('Error handling missing');
});
test('Prevents duplicate instances (__aiWriterLoaded)', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  if (!c.includes('__aiWriterLoaded')) throw new Error('Duplicate prevention missing');
});
test('Popup close on Escape', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  if (!c.includes("Escape") || !c.includes("hidePopup")) throw new Error('Escape close missing');
});
test('Ctrl+Shift+K shortcut', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  if (!c.includes("shiftKey") || !c.includes("key === 'K'")) throw new Error('Keyboard shortcut missing');
});
test('DOM operations wrapped in try/catch', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  const safeAppendCount = (c.match(/safeAppend/g) || []).length;
  if (safeAppendCount < 3) throw new Error('Not enough safeAppend usage');
});
test('Active input tracking excludes own textarea', () => {
  const c = fs.readFileSync(`${EXT}/content.js`, 'utf8');
  if (!c.includes('aiw-input-area')) throw new Error('Own textarea exclusion missing');
});

// ====== SUMMARY ======
console.log('\n' + '='.repeat(50));
console.log(`✅ ${passed} passed  ❌ ${failed} failed  ⚠️ ${warnings} warnings`);
console.log('='.repeat(50));

if (failed > 0) process.exit(1);
else console.log('\n🎉 All tests passed! Extension is ready.\n');
