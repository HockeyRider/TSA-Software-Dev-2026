# News Voice Assistant

Voice-powered news summarizer. Say "Open the New York Times" and it'll fetch, summarize, and read the latest news aloud.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Add your OpenRouter API key:
```bash
cp .env.local.example .env.local
# then edit .env.local and add your key
```

3. Run locally:
```bash
npm run dev
```

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → import your repo
3. Add environment variable in Vercel dashboard:
   - `OPENROUTER_API_KEY` = your key from openrouter.ai
4. Deploy!

## Usage

- Say **"Open the New York Times"** → fetches + summarizes + reads latest NYT headlines
- Say **"exit"** → stops the assistant
- Requires Chrome or Edge (Web Speech API)
