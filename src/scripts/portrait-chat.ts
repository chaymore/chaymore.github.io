import { createSpeechSession, speechFeedback, speechRecognitionConstructor, talkReleaseAction, type SpeechSession } from './portrait-speech-input.ts';

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export function initPortraitChat(root: HTMLElement) {
  const apiBase = root.dataset.apiBase?.replace(/\/$/, '');
  const toggle = root.querySelector<HTMLButtonElement>('[data-chat-toggle]')!;
  const panel = root.querySelector<HTMLElement>('[data-chat-panel]')!;
  const close = root.querySelector<HTMLButtonElement>('[data-chat-close]')!;
  const form = root.querySelector<HTMLFormElement>('[data-chat-form]')!;
  const input = root.querySelector<HTMLInputElement>('[data-chat-input]')!;
  const submit = root.querySelector<HTMLButtonElement>('[data-chat-submit]')!;
  const mic = root.querySelector<HTMLButtonElement>('[data-chat-mic]')!;
  const log = root.querySelector<HTMLElement>('[data-chat-log]')!;
  const replay = root.querySelector<HTMLButtonElement>('[data-chat-replay]')!;
  const note = root.querySelector<HTMLElement>('[data-chat-note]')!;
  const history: ChatMessage[] = [];
  let lastAnswer = '';
  let controller: AbortController | undefined;
  let audio: HTMLAudioElement | undefined;
  let disconnectAudio: (() => void) | undefined;
  let playback = 0;
  let capturing = false;
  let gesture: { id: number; at: number; startedWhileListening: boolean } | null = null;

  if (!apiBase) {
    toggle.disabled = true;
    toggle.title = 'Q&A is being configured';
    mic.disabled = true;
    return;
  }

  const Recognition = speechRecognitionConstructor(window);
  const session: SpeechSession | null = Recognition
    ? createSpeechSession(Recognition, {
        onInterim: text => { if (capturing && text) note.textContent = text; },
        onFinal: text => { void sendQuestion(text, 'speech'); },
        onError: message => { capturing = false; note.textContent = message; },
        onListening: on => setListening(on),
      }, { lang: navigator.language || 'en-US' })
    : null;

  const show = () => { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); input.focus(); };
  const hide = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); session?.abort(); };
  toggle.addEventListener('click', () => panel.hidden ? show() : hide());
  close.addEventListener('click', hide);
  replay.addEventListener('click', () => lastAnswer && playAnswer(lastAnswer));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || submit.disabled) return;
    session?.abort();
    input.value = '';
    void sendQuestion(question, 'text');
  });

  mic.addEventListener('pointerdown', event => {
    if (event.button !== 0 || mic.disabled) return;
    event.preventDefault();
    if (!session) { note.textContent = speechFeedback('unsupported')!; return; }
    try { mic.setPointerCapture(event.pointerId); } catch { /* pointer capture is optional */ }
    const startedWhileListening = session.listening;
    gesture = { id: event.pointerId, at: performance.now(), startedWhileListening };
    if (!startedWhileListening) beginListening();
  });
  mic.addEventListener('pointerup', event => endGesture(event.pointerId, 'up'));
  mic.addEventListener('pointercancel', event => endGesture(event.pointerId, 'cancel'));
  mic.addEventListener('contextmenu', event => event.preventDefault());
  mic.addEventListener('click', event => {
    if (event.detail !== 0 || mic.disabled) return;
    if (!session) { note.textContent = speechFeedback('unsupported')!; return; }
    if (session.listening) session.stop();
    else beginListening();
  });

  function setListening(on: boolean) {
    mic.setAttribute('aria-pressed', String(on));
    mic.textContent = on ? 'stop' : 'mic';
    mic.setAttribute('aria-label', on ? 'Stop listening' : 'Speak a question');
    if (on) {
      capturing = true;
      note.textContent = 'Listening…';
    } else if (capturing) {
      capturing = false;
      if (!submit.disabled) note.textContent = '';
    }
  }

  function beginListening() {
    if (!session || session.listening || submit.disabled) return;
    stopAudiblePortrait();
    session.start();
  }

  function endGesture(pointerId: number, kind: 'up' | 'cancel') {
    if (!gesture || gesture.id !== pointerId || !session) return;
    const current = gesture;
    gesture = null;
    if (kind === 'cancel') {
      if (current.startedWhileListening) session.stop();
      else session.abort();
      return;
    }
    if (talkReleaseAction(current.startedWhileListening, performance.now() - current.at) === 'stop') session.stop();
  }

  function appendMessage(role: ChatMessage['role'], text: string) {
    const message = document.createElement('p');
    message.className = `chat-message chat-${role}`;
    message.textContent = text;
    log.append(message);
    log.scrollTop = log.scrollHeight;
    return message;
  }

  async function sendQuestion(question: string, source: 'text' | 'speech') {
    if (!question || submit.disabled) return;
    controller?.abort();
    controller = new AbortController();
    stopAudiblePortrait();
    appendMessage('user', question);
    const answer = appendMessage('assistant', '');
    submit.disabled = true;
    mic.disabled = true;
    replay.hidden = true;
    note.textContent = 'Thinking…';
    try {
      const response = await fetch(`${apiBase}/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, history: history.slice(-4) }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(await errorMessage(response));
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        answer.textContent = text;
        log.scrollTop = log.scrollHeight;
      }
      text = text.trim();
      if (!text) throw new Error('I could not form an answer just now.');
      history.push({ role: 'user', content: question }, { role: 'assistant', content: text });
      lastAnswer = text;
      replay.hidden = false;
      note.textContent = 'AI-generated voice';
      playAnswer(text).catch(() => { note.textContent = 'Tap “speak” to hear the answer'; });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      answer.textContent = error instanceof Error ? error.message : 'Something went wrong.';
      note.textContent = '';
    } finally {
      submit.disabled = false;
      mic.disabled = false;
      if (source === 'text' && !panel.hidden) input.focus();
    }
  }

  /** Stops reply audio and any sample preview. User speech is never attached to the mouth. */
  function stopAudiblePortrait() {
    playback += 1;
    audio?.pause();
    disconnectAudio?.();
    disconnectAudio = undefined;
    window.calebPortrait?.disconnectAudio();
  }

  async function playAnswer(text: string) {
    const id = ++playback;
    audio?.pause();
    disconnectAudio?.();
    disconnectAudio = undefined;
    const response = await fetch(`${apiBase}/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (id !== playback) return;
    if (!response.ok) throw new Error(await errorMessage(response));
    const url = URL.createObjectURL(await response.blob());
    if (id !== playback) { URL.revokeObjectURL(url); return; }
    audio = new Audio(url);
    audio.addEventListener('ended', () => { disconnectAudio?.(); disconnectAudio = undefined; URL.revokeObjectURL(url); }, { once: true });
    audio.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
    // Mouth sync uses only this reply element. Speech recognition never reaches the analyser.
    if (window.calebPortrait) disconnectAudio = await window.calebPortrait.connectAudio(audio);
    if (id !== playback) { disconnectAudio?.(); disconnectAudio = undefined; URL.revokeObjectURL(url); return; }
    await audio.play();
  }
}

async function errorMessage(response: Response) {
  try { return (await response.json()).error || 'The portrait is unavailable right now.'; }
  catch { return 'The portrait is unavailable right now.'; }
}
