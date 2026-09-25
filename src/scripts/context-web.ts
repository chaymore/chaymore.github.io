const STORAGE_KEY = 'caleb-context-gathered';

type Point = { x: number; y: number };

function loadGathered(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveGathered(gathered: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...gathered]));
}

function centerOf(rect: DOMRect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function edgeToward(from: Point, rect: DOMRect, inset = 0): Point {
  const c = centerOf(rect);
  const dx = from.x - c.x;
  const dy = from.y - c.y;
  const hw = Math.max(rect.width / 2 - inset, 1);
  const hh = Math.max(rect.height / 2 - inset, 1);
  const scale = Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  if (!Number.isFinite(scale) || scale === 0) return c;
  return { x: c.x + dx / scale, y: c.y + dy / scale };
}

function curve(start: Point, end: Point): string {
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = 16;
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function setup() {
  const stage = document.querySelector<HTMLElement>('[data-web]');
  const svg = document.querySelector<SVGSVGElement>('[data-web-lines]');
  const core = document.querySelector<HTMLElement>('#core');
  const dialog = document.querySelector<HTMLDialogElement>('#source-dialog');
  const status = document.querySelector<HTMLElement>('#context-status');
  if (!stage || !core || !dialog) return;

  const nodes = [...stage.querySelectorAll<HTMLButtonElement>('[data-source]')];
  const gathered = loadGathered();
  let frame = 0;

  const announce = (message: string) => {
    if (status) status.textContent = message;
  };

  const paintGathered = () => {
    for (const node of nodes) {
      const id = node.dataset.source ?? '';
      const on = gathered.has(id);
      node.classList.toggle('is-gathered', on);
      const label = node.dataset.label ?? id;
      const role = node.dataset.role ?? '';
      node.setAttribute(
        'aria-label',
        `${label}, ${role}${on ? ', gathered' : ''}. Open instructions.`,
      );
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-gather]')) {
      const on = gathered.has(button.dataset.gather ?? '');
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'Undo gathered' : 'Mark as gathered';
    }
    const count = document.querySelector<HTMLElement>('[data-gathered-count]');
    if (count) count.textContent = `${gathered.size} of ${nodes.length} gathered`;
  };

  const draw = () => {
    if (!svg || getComputedStyle(svg).display === 'none') {
      svg?.replaceChildren();
      return;
    }
    const origin = stage.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
    svg.replaceChildren();
    const coreRect = core.getBoundingClientRect();
    const coreLocal = new DOMRect(
      coreRect.left - origin.left,
      coreRect.top - origin.top,
      coreRect.width,
      coreRect.height,
    );

    for (const node of nodes) {
      const shape = node.querySelector<HTMLElement>('.node-shape');
      if (!shape) continue;
      const shapeRect = shape.getBoundingClientRect();
      const shapeLocal = new DOMRect(
        shapeRect.left - origin.left,
        shapeRect.top - origin.top,
        shapeRect.width,
        shapeRect.height,
      );
      const shapeCenter = centerOf(shapeLocal);
      const end = edgeToward(shapeCenter, coreLocal, 2);
      const start = edgeToward(end, shapeLocal, 1);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', curve(start, end));
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', start.x.toFixed(1));
      dot.setAttribute('cy', start.y.toFixed(1));
      dot.setAttribute('r', '3.25');
      if (node.classList.contains('is-active')) {
        path.classList.add('is-active');
        dot.classList.add('is-active');
      }
      if (node.classList.contains('is-gathered')) {
        path.classList.add('is-gathered');
        dot.classList.add('is-gathered');
      }
      svg.append(path, dot);
    }
  };

  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  };

  const openSource = (id: string) => {
    for (const panel of dialog.querySelectorAll<HTMLElement>('[data-panel]')) {
      panel.hidden = panel.dataset.panel !== id;
    }
    dialog.setAttribute('aria-labelledby', `panel-${id}-title`);
    if (!dialog.open) dialog.showModal();
  };

  for (const node of nodes) {
    const activate = (on: boolean) => {
      node.classList.toggle('is-active', on);
      schedule();
    };
    node.addEventListener('click', () => openSource(node.dataset.source ?? ''));
    node.addEventListener('mouseenter', () => activate(true));
    node.addEventListener('mouseleave', () => activate(false));
    node.addEventListener('focus', () => activate(true));
    node.addEventListener('blur', () => activate(false));
  }

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const gather = target.closest<HTMLButtonElement>('[data-gather]');
    if (gather) {
      const id = gather.dataset.gather ?? '';
      if (gathered.has(id)) gathered.delete(id);
      else gathered.add(id);
      saveGathered(gathered);
      paintGathered();
      schedule();
      announce(gathered.has(id) ? `${id} marked as gathered.` : `${id} unmarked.`);
      return;
    }

    const copyButton = target.closest<HTMLButtonElement>('[data-copy]');
    if (!copyButton) return;
    const selector = copyButton.dataset.copy ?? '';
    const source = document.querySelector(selector);
    const text = source?.textContent?.trim() ?? '';
    if (!text) return;
    const previous = copyButton.textContent ?? 'Copy';
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = 'Copied';
      announce('Copied.');
    } catch {
      copyButton.textContent = 'Select it';
      announce('Copy failed. Select the text and copy it manually.');
    }
    window.setTimeout(() => {
      copyButton.textContent = previous;
    }, 1600);
  });

  paintGathered();
  schedule();
  new ResizeObserver(schedule).observe(stage);
  window.addEventListener('load', schedule);
}

setup();
