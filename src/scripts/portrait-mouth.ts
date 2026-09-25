/**
 * Where the mouth sits on the scan, in head space.
 * cx/cy/halfWidth/slope describe the scan's own lip line (corner to corner).
 * center is the x the mouth is moved to (the face midline, under the nose).
 * upper/lower are the modeled lip heights.
 */
export type MouthFit = { cx: number; cy: number; halfWidth: number; slope: number; center: number; upper: number; lower: number };

// Measured from the scan's darkest lip line: corners near x = -0.16 and 0.22.
export const MOUTH_FIT: MouthFit = { cx: 0.03, cy: 0.016, halfWidth: 0.19, slope: -0.095, center: 0.04, upper: 0.03, lower: 0.036 };

const KEYS: (keyof MouthFit)[] = ['cx', 'cy', 'halfWidth', 'slope', 'center', 'upper', 'lower'];
const LIMITS: Record<keyof MouthFit, [number, number]> = {
  cx: [-0.2, 0.25], cy: [-0.1, 0.12], halfWidth: [0.08, 0.3], slope: [-0.4, 0.4],
  center: [-0.15, 0.2], upper: [0.005, 0.06], lower: [0.005, 0.07],
};

/** Reads `?mouth=cx,cy,halfWidth,slope,center,upper,lower`. Missing or bad values keep the default. */
export function parseMouthFit(param: string | null | undefined, base: MouthFit = MOUTH_FIT): MouthFit {
  const fit = { ...base };
  if (!param) return fit;
  param.split(',').forEach((raw, i) => {
    const key = KEYS[i];
    const value = Number(raw);
    if (!key || raw.trim() === '' || !Number.isFinite(value)) return;
    const [lo, hi] = LIMITS[key];
    fit[key] = Math.max(lo, Math.min(hi, value));
  });
  return fit;
}

export function formatMouthFit(fit: MouthFit): string {
  return KEYS.map(key => fit[key].toFixed(3)).join(',');
}

/** Lip line from two dragged corners. Keeps the chosen center offset and lip heights. */
export function fitFromCorners(left: { x: number; y: number }, right: { x: number; y: number }, base: MouthFit): MouthFit {
  const [a, b] = left.x <= right.x ? [left, right] : [right, left];
  const span = Math.max(1e-6, b.x - a.x);
  return parseMouthFit(formatMouthFit({
    ...base,
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    halfWidth: span / 2,
    slope: (b.y - a.y) / span,
  }));
}

export function mouthCorners(fit: MouthFit) {
  return {
    left: { x: fit.cx - fit.halfWidth, y: fit.cy - fit.slope * fit.halfWidth },
    right: { x: fit.cx + fit.halfWidth, y: fit.cy + fit.slope * fit.halfWidth },
  };
}

type TunerHost = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  initial: MouthFit;
  apply(fit: MouthFit, raw: boolean): void;
  setOpen(open: number): void;
  /** Head-space point to CSS pixels relative to the canvas, and back. */
  toScreen(x: number, y: number): { x: number; y: number };
  fromScreen(x: number, y: number): { x: number; y: number };
  signal: AbortSignal;
};

/** On-page mouth calibration, opened with `?mouth` in the URL. */
export function mountMouthTuner(host: TunerHost) {
  let fit = { ...host.initial };
  let raw = true;
  const panel = document.createElement('div');
  panel.className = 'mouth-tuner';
  panel.innerHTML = `
    <strong>Mouth calibration</strong>
    <p>With <em>Raw scan</em> on, drag the two dots onto the corners of your mouth in the scan. Then turn it off to check the lips.</p>
    <label><input type="checkbox" data-raw checked> Raw scan</label>
    <label>Open <input type="range" data-open min="0" max="1" step="0.01" value="0"></label>
    <label>Move left/right <input type="range" data-center min="-0.15" max="0.2" step="0.002"></label>
    <label>Upper lip <input type="range" data-upper min="0.005" max="0.06" step="0.001"></label>
    <label>Lower lip <input type="range" data-lower min="0.005" max="0.07" step="0.001"></label>
    <code data-readout></code>
    <button type="button" data-copy>Copy link</button>`;
  const style = document.createElement('style');
  style.textContent = `
    .mouth-tuner{position:absolute;top:12px;left:12px;z-index:5;width:250px;padding:10px 12px;background:rgba(255,255,255,.96);border:1px solid #bbb;font:11px/1.45 ui-monospace,monospace;color:#222;display:grid;gap:6px}
    .mouth-tuner p{margin:0;color:#666}.mouth-tuner label{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .mouth-tuner input[type=range]{width:120px}.mouth-tuner code{word-break:break-all;background:#f3f3f3;padding:4px}
    .mouth-tuner button{min-height:32px;border:1px solid #111;background:#111;color:#fff;cursor:pointer}
    .mouth-handle{position:absolute;z-index:4;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid #e11;background:rgba(255,255,255,.4);cursor:grab;touch-action:none}`;
  const handles = [0, 1].map(() => {
    const dot = document.createElement('div');
    dot.className = 'mouth-handle';
    host.root.append(dot);
    return dot;
  });
  host.root.append(style, panel);
  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const sliders = { center: $<HTMLInputElement>('[data-center]'), upper: $<HTMLInputElement>('[data-upper]'), lower: $<HTMLInputElement>('[data-lower]') };
  const readout = $<HTMLElement>('[data-readout]');
  const link = () => `${location.origin}${location.pathname}?mouth=${formatMouthFit(fit)}`;
  const place = () => {
    const { left, right } = mouthCorners(fit);
    const box = host.canvas.getBoundingClientRect(), rootBox = host.root.getBoundingClientRect();
    [left, right].forEach((corner, i) => {
      const at = host.toScreen(corner.x, corner.y);
      handles[i].style.left = `${at.x + box.left - rootBox.left}px`;
      handles[i].style.top = `${at.y + box.top - rootBox.top}px`;
      handles[i].hidden = !raw;
    });
  };
  const update = () => {
    host.apply(fit, raw);
    readout.textContent = `?mouth=${formatMouthFit(fit)}`;
    history.replaceState(null, '', link());
    place();
  };
  sliders.center.value = String(fit.center); sliders.upper.value = String(fit.upper); sliders.lower.value = String(fit.lower);
  for (const key of ['center', 'upper', 'lower'] as const) {
    sliders[key].addEventListener('input', () => { fit = { ...fit, [key]: Number(sliders[key].value) }; update(); }, { signal: host.signal });
  }
  $<HTMLInputElement>('[data-raw]').addEventListener('change', e => { raw = (e.target as HTMLInputElement).checked; update(); }, { signal: host.signal });
  $<HTMLInputElement>('[data-open]').addEventListener('input', e => host.setOpen(Number((e.target as HTMLInputElement).value)), { signal: host.signal });
  $<HTMLButtonElement>('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link()); $<HTMLButtonElement>('[data-copy]').textContent = 'Copied'; }
    catch { $<HTMLButtonElement>('[data-copy]').textContent = 'Copy the text above'; }
  }, { signal: host.signal });
  handles.forEach((dot, i) => {
    dot.addEventListener('pointerdown', e => { dot.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); }, { signal: host.signal });
    dot.addEventListener('pointermove', e => {
      if (!dot.hasPointerCapture(e.pointerId)) return;
      const box = host.canvas.getBoundingClientRect();
      const point = host.fromScreen(e.clientX - box.left, e.clientY - box.top);
      const corners = mouthCorners(fit);
      fit = fitFromCorners(i === 0 ? point : corners.left, i === 1 ? point : corners.right, fit);
      update();
    }, { signal: host.signal });
  });
  addEventListener('resize', place, { signal: host.signal });
  update();
  return { place };
}
