# Portrait Q&A deployment

The code is complete, but three services must be connected once: Cloudflare, OpenAI, and a read-only Google service account. No secret belongs in the repository or the browser.

## 1. Create D1 and deploy the Worker

From `portrait-worker/`:

```sh
npm ci
npx wrangler login
npx wrangler d1 create portrait-context
```

Copy the returned database ID into `portrait-worker/wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`, then initialize and deploy:

```sh
npm run db:init:remote
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SYNC_TOKEN
npx wrangler secret put RATE_LIMIT_SALT
npm run deploy
```

Use separate long random values for `SYNC_TOKEN` and `RATE_LIMIT_SALT`. Save the deployed `https://…workers.dev` URL.

The default text model is `gpt-5.6-luna`; the default speech model is `gpt-4o-mini-tts`. Both can be changed in `wrangler.jsonc`. The UI identifies the sound as AI-generated.

## 2. Enable the homepage

In the GitHub repository, create an Actions variable:

| Variable | Value |
| --- | --- |
| `PUBLIC_PORTRAIT_API_URL` | Deployed Worker URL |

Re-run **Deploy to GitHub Pages**, or push a commit. The site build embeds only this public endpoint—not an API key.

## 3. Give the sync read-only Drive access

In Google Cloud:

1. Enable the Google Drive API.
2. Create a service account and JSON key.
3. Share the Knowledge Wiki root folder with the service account email as **Viewer**.

Add these GitHub Actions secrets:

| Secret | Value |
| --- | --- |
| `DRIVE_WIKI_FOLDER_ID` | `1J2DxQraTRXJRwTnpJp3r315Vqx81Up48` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Complete service-account JSON |
| `PORTRAIT_SYNC_URL` | Deployed Worker URL |
| `PORTRAIT_SYNC_TOKEN` | Same value stored as the Worker `SYNC_TOKEN` |

Run **Sync portrait context** manually once. It also runs nightly at 08:17 UTC. Check `GET /health`; a positive `chunks` count confirms that searchable context exists.

## 4. Approve wiki content

Pages are private unless explicitly approved. Add this frontmatter to a page that is safe to expose through a public chatbot:

```yaml
---
portrait_access: public
portrait_priority: 70
---
```

`portrait_priority` is optional. Summary/profile material can use a higher number so it wins fallback retrieval. The sync divides approved pages by Markdown headings and removes Obsidian link syntax. A sync with zero approved pages fails without deleting the live database.

A curated `Public Portrait Context/portrait-profile` source already exists in the Drive wiki. Expand that page first. Avoid marking relationship pages, source-message exports, contact information, financial pages, calendars, or raw ingestion notes public.

## API behavior

- `POST /ask` accepts a question and up to four recent messages, retrieves up to eight D1 chunks, and streams plain text.
- `POST /speak` converts the completed answer into MP3.
- `POST /admin/sync` replaces the D1 snapshot and requires the sync bearer token.
- `GET /health` reports the indexed chunk count but no private content.
- Requests are CORS-restricted to the configured site and locally hashed/rate-limited without retaining raw IP addresses.

## Local Worker development

Create `portrait-worker/.dev.vars` (gitignored):

```dotenv
OPENAI_API_KEY=...
SYNC_TOKEN=...
RATE_LIMIT_SALT=...
```

Replace the D1 ID in `wrangler.jsonc`, then:

```sh
npm run db:init:local
npm run dev
```

For local Astro, use `PUBLIC_PORTRAIT_API_URL=http://localhost:8787 npm run dev`.
