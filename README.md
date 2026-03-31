# 🌐 BabelBridge
> Speak your language. They hear theirs.

Real-time multilingual chat — everyone types in their language,
everyone reads in theirs. Inspired by @yoyonofukuoka (28.5M views).

## Run Locally

1. Clone this repo
2. Create .env file: copy .env.example and add your Langbly API key
3. npm install
4. npm start
5. Open http://localhost:3000
6. Test with two browser tabs — different languages!

## Deploy to Render (FREE)

1. Push to GitHub:
   git init && git add . && git commit -m "launch" && gh repo create babelbridge --public --push --source=.
2. Go to render.com → New → Web Service
3. Connect your GitHub repo
4. Build Command: `npm install` | Start Command: `npm start`
5. Add Environment Variable: LANGBLY_API_KEY = your key
6. Click Deploy → live in ~3 minutes

## Add Custom Domain (Later)

1. Buy domain at cloudflare.com/products/registrar (~$9/yr)
2. In Render: Settings → Custom Domains → Add Domain
3. In Cloudflare DNS: Add CNAME record pointing to your Render URL
4. SSL certificate auto-generates — done

## Translation API

Using Langbly (langbly.com):
- Free tier: 500,000 characters/month
- 100+ languages supported
- No credit card required
- Google Translate v2 compatible format

## Tech Stack

- Backend: Node.js + Express + Socket.io
- Frontend: Vanilla HTML/CSS/JS (no frameworks)
- Translation: Langbly API
- Real-time: WebSockets via Socket.io
- Hosting: Render.com (free)
