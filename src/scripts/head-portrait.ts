import * as THREE from 'three';

export async function initHeadPortrait(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  const motionButton = root.querySelector<HTMLButtonElement>('[data-motion]')!;
  const styleButton = root.querySelector<HTMLButtonElement>('[data-style]')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !reducedMotion.matches;
  let ascii = false;
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let frame = 0;
  let disposed = false;
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setClearColor(0xffffff);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 20);
    camera.position.z = 6;
    const response = await fetch('/head/portrait.bin');
    if (!response.ok) throw new Error('Portrait unavailable');
    const buffer = await response.arrayBuffer();
    if (disposed) return;
    if (buffer.byteLength === 0 || buffer.byteLength % 28 !== 0) throw new Error('Invalid portrait');
    const data = new THREE.InterleavedBuffer(new Float32Array(buffer), 7);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
    geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(data, 3, 3));
    geometry.setAttribute('shade', new THREE.InterleavedBufferAttribute(data, 1, 6));

    const atlas = document.createElement('canvas');
    atlas.width = 512; atlas.height = 64;
    const ctx = atlas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.font = '48px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ['.', ':', '-', '+', '=', '*', '#', '@'].forEach((glyph, i) => ctx.fillText(glyph, i * 64 + 32, 33));
    const texture = new THREE.CanvasTexture(atlas);
    const material = new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: renderer.getPixelRatio() }, ascii: { value: 0 }, glyphs: { value: texture } },
      vertexShader: `
        attribute float shade;
        uniform float pixelRatio;
        uniform float ascii;
        varying float ink;
        void main() {
          ink = pow(clamp(1. - shade, 0., 1.), .7);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          gl_PointSize = mix(2.1, 6.5, ascii) * pixelRatio;
        }
      `,
      fragmentShader: `
        uniform float ascii;
        uniform sampler2D glyphs;
        varying float ink;
        void main() {
          float coverage;
          if (ascii > .5) {
            float glyph = min(7., floor(ink * 8.));
            coverage = texture2D(glyphs, vec2((glyph + gl_PointCoord.x) / 8., 1. - gl_PointCoord.y)).a;
          } else {
            coverage = 1. - smoothstep(.43, .5, length(gl_PointCoord - .5));
          }
          if (coverage < .25) discard;
          float value = 1. - ink * coverage;
          gl_FragColor = vec4(vec3(value), 1.);
        }
      `,
    });
    const points = new THREE.Group();
    const cloud = new THREE.Points(geometry, material);
    const surfaceResponse = await fetch('/head/surface.bin');
    if (!surfaceResponse.ok) throw new Error('Portrait surface unavailable');
    const surfaceGeometry = new THREE.BufferGeometry();
    surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(await surfaceResponse.arrayBuffer()), 3));
    const surfaceMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide });
    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    surface.renderOrder = -1;
    points.add(surface, cloud);
    scene.add(points);
    status.hidden = true;

    const render = () => renderer!.render(scene, camera);
    const resize = () => {
      const w = root.clientWidth, h = root.clientHeight;
      renderer!.setSize(w, h, false);
      const aspect = w / h;
      const vertical = aspect < .75 ? 3.8 / aspect * .75 : 3.8;
      camera.left = -vertical * aspect / 2; camera.right = vertical * aspect / 2;
      camera.top = vertical / 2; camera.bottom = -vertical / 2;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize); observer.observe(root);
    const updateMotion = () => {
      motionButton.textContent = playing ? 'Pause' : 'Play';
      motionButton.setAttribute('aria-label', playing ? 'Pause rotation' : 'Play rotation');
    };
    updateMotion();
    motionButton.onclick = () => { playing = !playing; updateMotion(); };
    const onReducedMotion = () => { playing = !reducedMotion.matches; updateMotion(); };
    reducedMotion.addEventListener('change', onReducedMotion);
    styleButton.onclick = () => {
      ascii = !ascii; material.uniforms.ascii.value = Number(ascii);
      // Use a smaller subset of the randomly sampled scan for legible characters.
      geometry.setDrawRange(0, ascii ? Math.floor(data.count / 4) : data.count);
      styleButton.textContent = ascii ? 'ASCII' : 'Dots';
      styleButton.setAttribute('aria-label', ascii ? 'Switch to dots' : 'Switch to ASCII characters');
      render();
    };
    canvas.onpointerdown = (e) => { dragging = true; previousX = e.clientX; previousY = e.clientY; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = (e) => {
      if (!dragging) return;
      points.rotation.y += (e.clientX - previousX) * .008;
      points.rotation.x = THREE.MathUtils.clamp(points.rotation.x + (e.clientY - previousY) * .005, -.45, .45);
      previousX = e.clientX; previousY = e.clientY; render();
    };
    canvas.onpointerup = canvas.onpointercancel = () => { dragging = false; };
    canvas.onkeydown = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowLeft') points.rotation.y -= .12;
      if (e.key === 'ArrowRight') points.rotation.y += .12;
      if (e.key === 'ArrowUp') points.rotation.x = Math.max(-.45, points.rotation.x - .08);
      if (e.key === 'ArrowDown') points.rotation.x = Math.min(.45, points.rotation.x + .08);
      if (e.key === ' ') { playing = !playing; updateMotion(); }
      render();
    };
    let previousTime = performance.now();
    const startTime = previousTime;
    const animate = (time: number) => {
      const dt = Math.min((time - previousTime) / 1000, .05); previousTime = time;
      if (!document.hidden && playing && !dragging && time - startTime > 2500) { points.rotation.y += dt * .1; render(); }
      frame = requestAnimationFrame(animate);
    };
    resize(); frame = requestAnimationFrame(animate);
    addEventListener('pagehide', (event) => {
      if (event.persisted) return;
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      reducedMotion.removeEventListener('change', onReducedMotion);
      geometry.dispose(); material.dispose(); surfaceGeometry.dispose(); surfaceMaterial.dispose(); texture.dispose(); renderer?.dispose();
    }, { once: true });
  } catch (error) {
    renderer?.dispose();
    status.hidden = false;
    status.textContent = 'The portrait couldn’t load. Please refresh to try again.';
    root.querySelector<HTMLElement>('.portrait-controls')!.hidden = true;
    root.querySelector<HTMLElement>('.portrait-hint')!.hidden = true;
    console.error(error);
  }
}
