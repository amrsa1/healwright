# healwright — Live Demo

> **Self-healing locators powered by AI.**  
> This directory is a standalone demo that imports the published [`healwright`](https://www.npmjs.com/package/healwright) package and runs Playwright tests with **intentionally broken selectors** to showcase the healing in action.

---

## What This Demo Does

| Test | Scenario | What Heals |
|------|----------|-------------|
| **Broken locator** | Uses `#wrong-todo-input` — a selector that doesn't exist | AI analyses the page, finds the real input, and fills it |
| **AI-only mode** | Passes an **empty selector** with only a description | AI locates the element purely from the natural-language description |

Both tests run against the public [TodoMVC demo](https://demo.playwright.dev/todomvc/) — no local server needed.

---

## Quick Start

### 1. Install

```bash
npm install
npx playwright install chromium
```

### 2. Configure

```bash
cp example.env .env
```

Open `.env` and add your AI provider credentials:

```env
AI_API_KEY=your-api-key-here
AI_PROVIDER=gemini          # gemini | openai | anthropic
AI_MODEL=gemini-2.5-flash   # or gpt-4o-mini, claude-sonnet-4-20250514, etc.
SELF_HEAL=1
```

### 3. Run

```bash
npm test              # headless
npm run test:headed   # see the browser
```

---

## Expected Output

When a broken locator is used, `healwright` will:

1. Detect the locator failure  
2. Collect candidate elements from the page  
3. Ask the AI provider to pick the best match  
4. Retry the action with the healed selector  
5. Cache the result in `.self-heal/` for instant replay next run  

You'll see healing logs like:

```
┌────────────────────────────────────────
🔍 Healing: fill
📦 Original : #wrong-todo-input
🧠 AI chose : #todo-input
✅ Healed successfully
```

---

## Project Structure

```
├── example.env            # Template — copy to .env
├── package.json           # Only healwright + @playwright/test
├── playwright.config.ts   # Minimal config
├── tests/
│   └── smoke.test.ts      # Two demo tests
└── README.md              # You are here
```

---

## Learn More

- 📦 [healwright on npm](https://www.npmjs.com/package/healwright)
- 📖 [healwright GitHub](https://github.com/amrsa1/healwright)
- 🎥 [YouTube Demo](https://www.youtube.com/watch?v=YOUR_VIDEO_ID)
