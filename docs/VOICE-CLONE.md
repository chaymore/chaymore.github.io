# Cloning Caleb's voice

`POST /speak` still returns MP3 (`audio/mpeg`). The browser plays that file and passes the same audio element to `connectAudio`. `/ask`, CORS, and the shared rate limit are unchanged. The only new response header is `x-portrait-voice` (`clone` or `synthetic`), exposed so the page can label the sound.

No Fish API key is added. Speech keeps using the existing `OPENROUTER_API_KEY`.

## Default: Harper, until a reference exists

Caleb has not supplied a reference recording. With no reference configured, `/speak` keeps calling OpenRouter with `microsoft/mai-voice-2-flash` and `en-US-Harper:MAI-Voice-2`. The chat note stays **AI-generated voice**. That fallback is deliberate: the portrait keeps speaking, and Harper is not described as a clone.

`GET /health` adds a `voice` field: `synthetic`, `clone`, or `misconfigured`. It does not return the reference audio or the voice id.

Once a reference is configured, a Fish failure does not fall back to Harper. The visitor sees “The cloned voice is unavailable right now.”

## Fish through OpenRouter

Verified against OpenRouter's speech API and Fish's OpenRouter-compatible contract (September 2026):

- `POST https://openrouter.ai/api/v1/audio/speech` returns raw audio. This Worker always sends `response_format: "mp3"`.
- Stateless cloning uses `input_references`: one `input_audio` part (base64 or a `data:audio/...;base64,` URI) and an optional `text` part with the transcript. `input_references` allows at most those two parts. Decoded reference audio must be 15 MiB or smaller.
- `fish-audio/s2.1-pro-free:free` and `fish-audio/s2.1-pro` both report `supports_voice_cloning: true` on OpenRouter's endpoints API. The free model is the default (`FISH_TTS_MODEL`). Set it to `fish-audio/s2.1-pro` for the paid model. The free model has no production latency or availability guarantee.
- A saved Fish voice is selected with the OpenRouter `voice` field. Fish documents that value as a voice-library id — the same id its native API calls `reference_id`. The Worker also sends `provider.options.fish-audio.reference_id` with that id. OpenRouter forwards options for the matched provider and drops unrecognized keys, so `voice` remains the field Fish's compatible API maps to the library id.

`FISH_REFERENCE_ID` wins when both an id and a clip are set, so each reply does not re-upload the recording.

## Supply a 20–45 second clip

Record Caleb in a quiet room: one speaker, no music, a normal conversational pace. Fish's own guidance is that about 10–30 seconds of clean speech clones best; keep the take inside 20–45 seconds. WAV or MP3, mono, is the expected format. FLAC is also accepted. Write down the exact words — the optional transcript improves the clone.

Deployed Worker secrets and variables are limited to 5 KB, so the clip cannot be a secret. Put it in R2.

From `portrait-worker/`:

```sh
npx wrangler r2 bucket create portrait-voice
npx wrangler r2 object put portrait-voice/caleb-reference.wav --file=./caleb-reference.wav
```

Uncomment the `r2_buckets` example in `wrangler.jsonc` (`VOICE_REFERENCE` → `portrait-voice`), then deploy. The object key defaults to `caleb-reference.wav`. Override it with the `FISH_REFERENCE_KEY` variable only if the object name differs. The binding does nothing harmful before the object exists: a missing object keeps the Harper fallback.

The transcript is small enough to be a secret:

```sh
npx wrangler secret put FISH_REFERENCE_TRANSCRIPT
```

Paste the exact words spoken in the clip. Leave this unset if you do not have a transcript; OpenRouter treats the text part as optional.

The Worker reads the object, caches it in the isolate, and refreshes that cache when the R2 etag changes. Replacing the object is enough — no code change. Each `/speak` request then sends the clip as `input_references` and omits `voice`, matching OpenRouter's Fish cloning example.

For a local experiment only, `.dev.vars` may set `FISH_REFERENCE_AUDIO` to raw base64 or a `data:audio/wav;base64,...` URI. Do not deploy that value. A real 20–45 second clip exceeds the 5 KB secret limit.

## Or save a Fish voice id

If Caleb later creates a voice in the Fish Audio dashboard, copy its voice-library id (native `reference_id`) and store only that:

```sh
npx wrangler secret put FISH_REFERENCE_ID
```

That id is not an API key. Creating it happens in Fish's own console; this repository does not call Fish directly and does not add `FISH_API_KEY`.

## Placeholders

`portrait-worker/.dev.vars` (gitignored):

```dotenv
OPENROUTER_API_KEY=
SYNC_TOKEN=
RATE_LIMIT_SALT=
# FISH_TTS_MODEL=fish-audio/s2.1-pro
# FISH_REFERENCE_ID=
# FISH_REFERENCE_TRANSCRIPT=
# FISH_REFERENCE_KEY=caleb-reference.wav
# FISH_REFERENCE_AUDIO=
```

`FISH_TTS_MODEL` in `wrangler.jsonc` is already `fish-audio/s2.1-pro-free:free`. It is used only after a reference is configured.

## What the page shows

| `x-portrait-voice` | Chat note |
| --- | --- |
| `synthetic` (no reference) | AI-generated voice |
| `clone` | AI voice clone |

The note is not a claim about audio quality. It follows the Worker header so a missing reference is not labeled as Caleb's voice.
