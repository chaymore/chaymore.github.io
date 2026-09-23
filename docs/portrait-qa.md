# Portrait Q&A deployment

The code is complete, but three services must be connected once: Cloudflare, OpenRouter, and a read-only Google service account. No secret belongs in the repository or the browser. If an API key was pasted into chat, revoke it and create a new one before deployment.

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
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put SYNC_TOKEN
npx wrangler secret put RATE_LIMIT_SALT
npm run deploy
```

Use separate long random values for `SYNC_TOKEN` and `RATE_LIMIT_SALT`. Save the deployed `https://…workers.dev` URL.

The default text model is `openai/gpt-4o-mini`; the default speech model is `microsoft/mai-voice-2-flash` with its supported `en-US-Harper:MAI-Voice-2` voice. Both can be changed in `wrangler.jsonc`. This is a synthetic voice, not a clone of Caleb's voice. The UI identifies the sound as AI-generated.

## 2. Enable the homepage

In the GitHub repository, create an Actions variable:

| Variable | Value |
| --- | --- |
| `PUBLIC_PORTRAIT_API_URL` | Deployed Worker URL |

Re-run **Deploy to GitHub Pages**, or push a commit. The site build embeds only this public endpoint—not an API key.

## 3. Give the sync read-only Drive access

In Google Cloud:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/library/drive.googleapis.com), select or create a project and enable the **Google Drive API**.
2. In **IAM & Admin → Service Accounts**, create a service account such as `portrait-context-reader`. You do not need to grant it project roles or enable domain-wide delegation.
3. Open the new service account, choose **Keys → Add key → Create new key → JSON**, and save the downloaded file securely. It cannot be downloaded again.
4. Share only the wiki's curated **Public Portrait Context** folder with the service account email as **Viewer** (deselect **Notify people**). Do **not** share the entire private Knowledge Wiki.

Add these GitHub Actions secrets:

| Secret | Value |
| --- | --- |
| `DRIVE_WIKI_FOLDER_ID` | `1jRZfC47H6li57fnxvu63_D2OLL_SruBx` (Public Portrait Context folder only) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Complete downloaded service-account JSON; store as a GitHub Actions secret, never paste it in chat |
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
- Spoken questions are transcribed in the browser with the Web Speech API. The transcript is shown as the visitor message and then sent to the existing `/ask` and `/speak` routes. No speech-to-text secret or Worker route is required. Mouth animation is driven only by the reply MP3.
- `POST /admin/sync` replaces the D1 snapshot and requires the sync bearer token.
- `GET /health` reports the indexed chunk count but no private content.
- Requests are CORS-restricted to the configured site and locally hashed/rate-limited without retaining raw IP addresses.

## Local Worker development

Create `portrait-worker/.dev.vars` (gitignored):

```dotenv
OPENROUTER_API_KEY=...
SYNC_TOKEN=...
RATE_LIMIT_SALT=...
```

Replace the D1 ID in `wrangler.jsonc`, then:

```sh
npm run db:init:local
npm run dev
```

For local Astro, use `PUBLIC_PORTRAIT_API_URL=http://localhost:8787 npm run dev`.

## Speech input

The **mic** control sits in the existing Ask Caleb composer. Tap it to talk, or hold it and release to send. Browsers with `SpeechRecognition` or `webkitSpeechRecognition` (Chrome and Safari, including their mobile versions, on localhost or HTTPS) transcribe speech on the device’s speech service. Firefox and other browsers without that API keep typed questions working and show “Speech input isn’t available in this browser.” Denying the microphone shows “Microphone permission denied.” Silence shows “Didn’t catch that.”

Nothing in this path calls `getUserMedia` for the portrait. `window.calebPortrait.connectAudio` still receives only the reply audio element, which now drives mouth shapes from visemes instead of volume alone.

To try it against a live Worker, set `PUBLIC_PORTRAIT_API_URL` to the deployed Worker URL and open the site from an allowed origin (`https://calebhaymore.com`, `https://chaymore.github.io`, or local `http://localhost` / `http://127.0.0.1`). Allow the microphone, ask a short question, and confirm the transcript and the streamed answer both appear as text before the face speaks. Typed questions should behave as before when the mic is left unused.
