# ✨ AI Writer Pro

Smart AI writing assistant Chrome extension. Works on every website.

## What It Does

- **Rewrite** - Improve clarity, tone, and engagement
- **Summarize** - Condense text into key bullet points
- **Grammar Fix** - Auto-correct spelling and grammar errors
- **Translate** - English ↔ Chinese (more languages coming)
- **Smart Reply** - Generate thoughtful replies to messages
- **Tone Control** - Casual, professional, friendly, formal

## Project Structure

```
ai-writer/
├── extension/          # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js      # Floating AI assistant on every page
│   ├── content.css     # Popup & button styles
│   ├── popup.html      # Extension popup (settings & usage)
│   ├── popup.js
│   ├── popup.css
│   ├── background.js   # Service worker
│   └── icons/          # Extension icons
├── server/             # Backend API (Node.js + Express)
│   ├── server.js       # AI proxy & rate limiting
│   ├── package.json
│   └── .env.example
└── landing/            # Product landing page
    ├── index.html
    ├── style.css
    └── script.js
```

## Quick Start

### 1. Backend API

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your API keys (Anthropic or OpenAI)
npm run dev
```

### 2. Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension/` folder
4. Click the extension icon → enter your API key

### 3. Landing Page

```bash
cd landing
# Serve with any static file server
npx serve .
```

## Deployment

### Backend (Railway / Render / Fly.io)
```bash
cd server
# Deploy with your preferred platform
# Set environment variables in platform dashboard
```

### Landing Page (Cloudflare Pages / Vercel / Netlify)
```bash
cd landing
# Drag-and-drop deploy, or connect git repo
```

### Chrome Web Store
1. Generate PNG icons from SVGs
2. Zip the `extension/` folder
3. Upload to Chrome Developer Dashboard
4. Pay $5 one-time registration fee

## Tech Stack

- **Extension**: Vanilla JS + Chrome APIs (Manifest V3)
- **Backend**: Node.js + Express + AI SDK
- **AI**: Anthropic Claude / OpenAI GPT
- **Landing**: Static HTML/CSS/JS
- **Payments**: Stripe

## Pricing Tiers

| Plan | Price | Requests/Day |
|------|-------|-------------|
| Free | $0 | 20 |
| Pro | $9/mo | 500 |
| Business | $29/mo | 5,000 |

## License

MIT
