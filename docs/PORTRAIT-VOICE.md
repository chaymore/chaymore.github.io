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

Amplitude controls jaw opening; a rough frequency balance adjusts lip shape. This fallback responds to sound and silence but does not recognize phonemes.

## Timed mouth shapes

For closer speech synchronization, map provider visemes to these shapes: `rest`, `A`, `E`, `I`, `O`, `U`, `MBP`, `FV`, and `L`. Supply times in seconds on the actual playback clock:

```js
portrait.setVisemes([
  { start: 0, end: 0.12, shape: 'MBP' },
  { start: 0.12, end: 0.35, shape: 'A' },
], () => audioElement.currentTime);
```

Timed shapes override amplitude animation. Gaps and the end of the cue sequence return to rest. Pause/stop handlers should call `resetMouth()` to close the mouth; on resume, reinstall the cues and clock. This rig approximates shape families and does not model teeth or tongue articulation.

For direct control, call `setMouth({ open, round, wide })` with values between 0 and 1. `resetMouth()` returns to rest; `disconnectAudio()` also removes analysis. External control stops the built-in demonstration. Mouth transitions are smoothed, and the portrait faces forward while speaking.

The “Test speech” control plays a local generic system voice, clearly labeled as a sample. It is not Caleb’s voice.

## Verification

Run `node --test tests/portrait-speech.test.mjs` with Node 22.18+ (native TypeScript support), `npx tsc --noEmit`, and `npm run build`. Browser checks should include starting/stopping/replaying audio, silence, mobile controls, and both point and ASCII rendering.
