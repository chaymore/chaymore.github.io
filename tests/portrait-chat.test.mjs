import test from 'node:test';
import assert from 'node:assert/strict';
import { initPortraitChat } from '../src/scripts/portrait-chat.ts';

class FakeRecognition {
  static latest;
  constructor() {
    this.lang = '';
    this.continuous = true;
    this.interimResults = false;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    FakeRecognition.latest = this;
  }
  start() {}
  stop() { queueMicrotask(() => this.onend?.()); }
  abort() {
    this.onerror?.({ error: 'aborted' });
    queueMicrotask(() => this.onend?.());
  }
  emit(chunks) {
    const results = chunks.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal, length: 1 }));
    this.onresult?.({ results });
  }
  fail(error) {
    this.onerror?.({ error });
    queueMicrotask(() => this.onend?.());
  }
}

class FakeAudio {
  constructor(url) { this.url = url; this.listeners = {}; FakeAudio.instances.push(this); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  pause() { this.paused = true; }
  play() { this.played = true; return Promise.resolve(); }
}
FakeAudio.instances = [];

function el(selector) {
  return {
    selector,
    children: [],
    attributes: {},
    dataset: {},
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    className: '',
    title: '',
    listeners: new Map(),
    scrollTop: 0,
    focused: false,
    addEventListener(type, fn) {
      const list = this.listeners.get(type) ?? [];
      list.push(fn);
      this.listeners.set(type, list);
    },
    dispatch(type, event) {
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    append(child) { this.children.push(child); },
    querySelector(selector) {
      const walk = node => {
        if (node.selector === selector) return node;
        for (const child of node.children ?? []) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(this);
    },
    setPointerCapture() {},
    focus() { this.focused = true; },
  };
}

function mount(apiBase = 'http://portrait.test') {
  const root = el('root');
  root.dataset.apiBase = apiBase;
  const nodes = {
    toggle: el('[data-chat-toggle]'),
    panel: el('[data-chat-panel]'),
    close: el('[data-chat-close]'),
    form: el('[data-chat-form]'),
    input: el('[data-chat-input]'),
    mic: el('[data-chat-mic]'),
    submit: el('[data-chat-submit]'),
    log: el('[data-chat-log]'),
    replay: el('[data-chat-replay]'),
    note: el('[data-chat-note]'),
  };
  nodes.panel.hidden = true;
  nodes.replay.hidden = true;
  root.children.push(...Object.values(nodes));
  return { root, ...nodes };
}

function messages(log) {
  return log.children.map(node => [node.className, node.textContent]);
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function install({ secure = true, recognition = true, ask = 'I am building portraits.', failAsk = false } = {}) {
  const calls = [];
  const connected = [];
  let portraitStops = 0;
  FakeAudio.instances = [];
  FakeRecognition.latest = undefined;
  globalThis.document = { createElement: () => el('message') };
  globalThis.Audio = FakeAudio;
  globalThis.URL.createObjectURL = () => 'blob:reply';
  globalThis.URL.revokeObjectURL = () => {};
  if (!navigator.mediaDevices) navigator.mediaDevices = {};
  navigator.mediaDevices.getUserMedia = () => { throw new Error('microphone stream opened'); };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), signal: init.signal });
    if (String(url).endsWith('/ask')) {
      if (failAsk) return { ok: false, json: async () => ({ error: 'Please wait a moment before asking again.' }) };
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(ask));
            controller.close();
          },
        }),
      };
    }
    return { ok: true, blob: async () => new Blob(['mp3']) };
  };
  globalThis.window = {
    isSecureContext: secure,
    SpeechRecognition: recognition ? FakeRecognition : undefined,
    calebPortrait: {
      connectAudio(input) {
        connected.push(input);
        return Promise.resolve(() => { portraitStops += 1; });
      },
      disconnectAudio() { portraitStops += 1; },
    },
  };
  return {
    calls,
    connected,
    stops: () => portraitStops,
  };
}

test('spoken questions reuse ask, visible text, and reply audio lip sync', async () => {
  const browser = install();
  const ui = mount();
  let now = 1_000;
  const originalNow = performance.now;
  performance.now = () => now;
  try {
    initPortraitChat(ui.root);
    ui.input.value = 'unsent draft';
    ui.mic.dispatch('pointerdown', { button: 0, pointerId: 7, preventDefault() {} });
    assert.equal(ui.mic.textContent, 'stop');
    assert.equal(ui.mic.getAttribute('aria-pressed'), 'true');
    assert.equal(ui.note.textContent, 'Listening…');
    now = 1_050;
    ui.mic.dispatch('pointerup', { button: 0, pointerId: 7, preventDefault() {} });
    assert.equal(ui.mic.getAttribute('aria-pressed'), 'true');
    FakeRecognition.latest.emit([['what are you working on', true]]);
    FakeRecognition.latest.onend();
    await flush();
    await flush();
    assert.deepEqual(messages(ui.log), [
      ['chat-message chat-user', 'what are you working on'],
      ['chat-message chat-assistant', 'I am building portraits.'],
    ]);
    assert.equal(ui.input.value, 'unsent draft');
    assert.equal(ui.note.textContent, 'AI-generated voice');
    assert.equal(ui.replay.hidden, false);
    assert.deepEqual(browser.calls.map(call => [call.url, call.body]), [
      ['http://portrait.test/ask', { question: 'what are you working on', history: [] }],
      ['http://portrait.test/speak', { text: 'I am building portraits.' }],
    ]);
    assert.equal(browser.connected.length, 1);
    assert.ok(browser.connected[0] instanceof FakeAudio);
    assert.equal(browser.connected[0].played, true);
    assert.equal(ui.mic.textContent, 'mic');
    assert.equal(navigator.mediaDevices.getUserMedia.called, undefined);
  } finally {
    performance.now = originalNow;
  }
});

test('holding the mic commits the phrase and a second question keeps history', async () => {
  const browser = install({ ask: 'Portraits.' });
  const ui = mount();
  let now = 0;
  const originalNow = performance.now;
  performance.now = () => now;
  try {
    initPortraitChat(ui.root);
    ui.mic.dispatch('pointerdown', { button: 0, pointerId: 1, preventDefault() {} });
    FakeRecognition.latest.emit([['  who are you  ', false]]);
    assert.equal(ui.note.textContent, 'who are you');
    now = 400;
    ui.mic.dispatch('pointerup', { button: 0, pointerId: 1, preventDefault() {} });
    await flush();
    await flush();
    ui.toggle.dispatch('click', { detail: 1, preventDefault() {} });
    ui.input.value = 'And what comes next?';
    ui.form.dispatch('submit', { preventDefault() {} });
    await flush();
    assert.equal(ui.input.value, '');
    assert.equal(ui.input.focused, true);
    const asks = browser.calls.filter(call => call.url.endsWith('/ask'));
    assert.equal(asks[1].body.question, 'And what comes next?');
    assert.deepEqual(asks[1].body.history, [
      { role: 'user', content: 'who are you' },
      { role: 'assistant', content: 'Portraits.' },
    ]);
  } finally {
    performance.now = originalNow;
  }
});

test('permission denial, silence, unsupported browsers, and an unavailable answer stay in the panel', async () => {
  const denied = install();
  const deniedUi = mount();
  initPortraitChat(deniedUi.root);
  deniedUi.mic.dispatch('pointerdown', { button: 0, pointerId: 1, preventDefault() {} });
  FakeRecognition.latest.fail('not-allowed');
  await flush();
  assert.equal(deniedUi.note.textContent, 'Microphone permission denied.');
  assert.equal(denied.calls.length, 0);
  assert.deepEqual(messages(deniedUi.log), []);

  const silent = install();
  const silentUi = mount();
  initPortraitChat(silentUi.root);
  silentUi.mic.dispatch('click', { detail: 0, preventDefault() {} });
  FakeRecognition.latest.onend();
  assert.equal(silentUi.note.textContent, 'Didn’t catch that.');
  assert.equal(silent.calls.length, 0);
  assert.equal(silentUi.mic.textContent, 'mic');

  const unsupported = install({ recognition: false });
  const unsupportedUi = mount();
  initPortraitChat(unsupportedUi.root);
  unsupportedUi.mic.dispatch('pointerdown', { button: 0, pointerId: 3, preventDefault() {} });
  assert.equal(unsupportedUi.note.textContent, 'Speech input isn’t available in this browser.');
  assert.equal(unsupported.calls.length, 0);

  const insecure = install({ secure: false });
  const insecureUi = mount();
  initPortraitChat(insecureUi.root);
  insecureUi.mic.dispatch('click', { detail: 0, preventDefault() {} });
  assert.equal(insecureUi.note.textContent, 'Speech input isn’t available in this browser.');

  const failing = install({ failAsk: true });
  const failingUi = mount();
  initPortraitChat(failingUi.root);
  failingUi.input.value = 'Hello';
  failingUi.form.dispatch('submit', { preventDefault() {} });
  await flush();
  assert.deepEqual(messages(failingUi.log), [
    ['chat-message chat-user', 'Hello'],
    ['chat-message chat-assistant', 'Please wait a moment before asking again.'],
  ]);
  assert.equal(failingUi.note.textContent, '');
  assert.equal(failing.connected.length, 0);
});

test('closing the panel or typing over an open mic does not submit the partial phrase', async () => {
  const browser = install();
  const ui = mount();
  initPortraitChat(ui.root);
  ui.toggle.dispatch('click', { detail: 1, preventDefault() {} });
  assert.equal(ui.panel.hidden, false);
  ui.mic.dispatch('pointerdown', { button: 0, pointerId: 4, preventDefault() {} });
  FakeRecognition.latest.emit([['partial phrase', false]]);
  ui.close.dispatch('click', { detail: 1, preventDefault() {} });
  await flush();
  assert.equal(ui.panel.hidden, true);
  assert.equal(browser.calls.length, 0);

  ui.mic.dispatch('pointerdown', { button: 0, pointerId: 5, preventDefault() {} });
  FakeRecognition.latest.emit([['spoken but discarded', false]]);
  ui.input.value = 'typed instead';
  ui.form.dispatch('submit', { preventDefault() {} });
  await flush();
  const asks = browser.calls.filter(call => call.url.endsWith('/ask'));
  assert.equal(asks.length, 1);
  assert.equal(asks[0].body.question, 'typed instead');
});

test('chat stays disabled until an API base is configured', () => {
  install();
  const ui = mount('');
  initPortraitChat(ui.root);
  assert.equal(ui.toggle.disabled, true);
  assert.equal(ui.mic.disabled, true);
  assert.equal(ui.toggle.title, 'Q&A is being configured');
});
