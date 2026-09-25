# Connecting a voice provider

The portrait exposes `window.calebPortrait` after loading and emits `portrait:ready`. Wait for the event if the property is not present. No voice service is connected yet.

## Audio-driven motion

From a user gesture, connect the voice provider’s output audio element:

```js
const portrait = window.calebPortrait;
const disconnect = await portrait.connectAudio(audioElement);
await audioElement.play();
// When the session finishes:
// disconnect();
```

Remote audio needs appropriate CORS headers; set `audioElement.crossOrigin = 'anonymous'` before setting its URL. Keep provider credentials on a server.

`connectAudio` accepts an HTMLMediaElement, AudioNode, or MediaStream. An HTML element retains audible playback through the portrait’s audio context. If an element already has a MediaElementAudioSourceNode, pass that existing node instead. For AudioNode and MediaStream input, the caller owns audible output routing; the portrait adds an analysis branch only. It never requests microphone access. Reconnecting replaces analysis of the previous source. The returned disconnect function is safe to call after another source has replaced it.

Ask Caleb speech input is separate from this bridge. The mic control uses the browser Web Speech API and sends only the resulting text to `POST /ask`. Do not pass the microphone, a `MediaStream` from `getUserMedia`, or the recognition session into `connectAudio`. Mouth motion stays on the reply audio from `POST /speak`.

Connected audio is classified each frame into the portrait shapes below. The scorer follows [wawa-lipsync](https://github.com/wass08/wawa-lipsync) frequency bands (Oculus visemes such as `aa`, `E`, `O`, `PP`, and `FF`) and maps them onto this rig: `PP` → `MBP`, `FF`/`TH` → `FV`, `DD`/`nn` → `L`, `SS` → `I`, `kk`/`CH` → `E`, `RR` → `U`, and the vowels `aa`/`E`/`I`/`O`/`U` onto `A`/`E`/`I`/`O`/`U`. Silence returns to rest. The published library opens its own audio context and media-element source, so the portrait runs that scorer on the analyser it already owns. Waveform energy only gates silence; it does not choose the shape.

## Timed mouth shapes

For closer speech synchronization, map provider visemes to these shapes: `rest`, `A`, `E`, `I`, `O`, `U`, `MBP`, `FV`, and `L`. Supply times in seconds on the actual playback clock:

```js
portrait.setVisemes([
  { start: 0, end: 0.12, shape: 'MBP' },
  { start: 0.12, end: 0.35, shape: 'A' },
], () => audioElement.currentTime);
```

Timed shapes override the analyser. Gaps and the end of the cue sequence return to rest. Pause/stop handlers should call `resetMouth()` to close the mouth; on resume, reinstall the cues and clock. This rig approximates shape families and does not model teeth or tongue articulation.

For direct control, call `setMouth({ open, round, wide })` with values between 0 and 1. `resetMouth()` returns to rest; `disconnectAudio()` also removes analysis. Mouth transitions are smoothed, and the portrait eases forward while a reply is playing.

The bust also moves on its own while it is on screen (`src/scripts/portrait-face.ts`):

- **Eyes** hold fixations joined by fast saccades, with tiny drift. They look at the visitor's cursor when it moved in the last 2.5 seconds, otherwise at the camera, and wander when the viewer is out of view. While a reply plays they hold eye contact, with an occasional glance away at the start of a thought. The upper lid follows the gaze up and down.
- **Blinks** close fast and open slower, a few seconds apart, a little more often while speaking and sometimes paired with a large eye movement.
- **Head** drifts slowly at rest and breathes. During a reply, syllable onsets in the reply loudness (`PortraitSpeech.level`) kick small nods, and each phrase picks a new slight tilt. The head rotates around the neck, layered on top of the drag or face-the-camera turn.
- **Brows** lift at phrase starts and on stressed syllables.

`prefers-reduced-motion: reduce` disables all of it. None of this uses the microphone.

Opening Ask Caleb snaps the bust to face the camera and holds that pose until the panel closes. Replies drive the mouth from `POST /speak`. The homepage has no separate sample-voice control.

## Verification

Run `node --test tests/portrait-speech.test.mjs tests/portrait-visemes.test.mjs tests/portrait-face.test.mjs` with Node 22.18+ (native TypeScript support), `npx tsc --noEmit`, and `npm run build`. Browser checks should include starting/stopping/replaying audio, silence, a visible change of mouth shape across vowels, a blink, mobile controls, and both point and ASCII rendering.
