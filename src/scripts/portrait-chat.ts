interface ChatMessage { role: 'user' | 'assistant'; content: string }

export function initPortraitChat(root: HTMLElement) {
  const apiBase = root.dataset.apiBase?.replace(/\/$/, '');
  const toggle = root.querySelector<HTMLButtonElement>('[data-chat-toggle]')!;
  const panel = root.querySelector<HTMLElement>('[data-chat-panel]')!;
  const close = root.querySelector<HTMLButtonElement>('[data-chat-close]')!;
  const form = root.querySelector<HTMLFormElement>('[data-chat-form]')!;
  const input = root.querySelector<HTMLInputElement>('[data-chat-input]')!;
  const submit = root.querySelector<HTMLButtonElement>('[data-chat-submit]')!;
  const log = root.querySelector<HTMLElement>('[data-chat-log]')!;
  const replay = root.querySelector<HTMLButtonElement>('[data-chat-replay]')!;
  const note = root.querySelector<HTMLElement>('[data-chat-note]')!;
  const history: ChatMessage[] = [];
  let lastAnswer = '';
  let controller: AbortController | undefined;
  let audio: HTMLAudioElement | undefined;
  let disconnectAudio: (() => void) | undefined;

  if (!apiBase) {
    toggle.disabled = true;
    toggle.title = 'Q&A is being configured';
    return;
  }

  const show = () => { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); input.focus(); };
  const hide = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () => panel.hidden ? show() : hide());
  close.addEventListener('click', hide);
  replay.addEventListener('click', () => lastAnswer && playAnswer(lastAnswer));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || submit.disabled) return;
    input.value = '';
    controller?.abort();
    controller = new AbortController();
    appendMessage('user', question);
    const answer = appendMessage('assistant', '');
    submit.disabled = true;
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
      input.focus();
    }
  });

  function appendMessage(role: ChatMessage['role'], text: string) {
    const message = document.createElement('p');
    message.className = `chat-message chat-${role}`;
    message.textContent = text;
    log.append(message);
    log.scrollTop = log.scrollHeight;
    return message;
  }

  async function playAnswer(text: string) {
    audio?.pause();
    disconnectAudio?.();
    const response = await fetch(`${apiBase}/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const url = URL.createObjectURL(await response.blob());
    audio = new Audio(url);
    audio.addEventListener('ended', () => { disconnectAudio?.(); disconnectAudio = undefined; URL.revokeObjectURL(url); }, { once: true });
    audio.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
    if (window.calebPortrait) disconnectAudio = await window.calebPortrait.connectAudio(audio);
    await audio.play();
  }
}

async function errorMessage(response: Response) {
  try { return (await response.json()).error || 'The portrait is unavailable right now.'; }
  catch { return 'The portrait is unavailable right now.'; }
}
