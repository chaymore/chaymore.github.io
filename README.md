# Caleb Haymore

Astro/TypeScript personal site deployed to GitHub Pages. The home page is an interactive Three.js stippled portrait with an optional, retrieval-grounded Q&A voice.

## Local site

```sh
npm ci
npm run dev
```

Set `PUBLIC_PORTRAIT_API_URL` to the deployed Worker URL to enable **Ask Caleb**. When it is absent, the control stays disabled and the rest of the portrait works normally.

## Portrait Q&A architecture

- The private Knowledge Wiki remains in Google Drive; the service account only sees the curated `Public Portrait Context` folder.
- Only files whose frontmatter contains `portrait_access: public` are synchronized.
- `.private` and `.obsidian` folders are never traversed.
- A scheduled GitHub Action reads approved files and replaces the searchable Cloudflare D1 snapshot.
- Visitors query the D1 snapshot through a Cloudflare Worker. Google Drive is never queried at request time.
- The Worker streams a grounded answer through OpenRouter, then exposes a separate speech endpoint. The browser connects returned audio to the existing portrait mouth animation.
- Where the browser supports the Web Speech API, Ask Caleb can also take a spoken question. Only the transcript is sent to the Worker. The microphone is never connected to the mouth analyser.

See [`docs/portrait-qa.md`](docs/portrait-qa.md) for deployment, privacy, and maintenance instructions.

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Start Astro locally |
| `npm run build` | Build the static GitHub Pages site |
| `node --test tests/*.test.mjs` | Run portrait behavior tests |
| `cd portrait-worker && npm run typecheck` | Type-check the Worker |
| `cd portrait-worker && npm run dev` | Run the Worker with local D1 |

## Key files

- `src/components/HeadPortrait.astro` — portrait and Q&A interface
- `src/scripts/head-portrait.ts` — Three.js portrait runtime
- `src/scripts/portrait-chat.ts` — streamed chat, browser speech input, and generated speech client
- `src/scripts/portrait-speech-input.ts` — Web Speech API session; no microphone stream and no mouth analysis
- `portrait-worker/src/index.ts` — API, retrieval, rate limiting, generation, and speech
- `scripts/sync-portrait-context.mjs` — private Drive-to-D1 ingestion
- `.github/workflows/sync-portrait-context.yml` — nightly/manual synchronization
