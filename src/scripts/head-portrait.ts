import * as THREE from 'three';
import { PortraitSpeech, type MouthShape, type VisemeCue } from './portrait-speech';
import { pointVertex, pointFragment, surfaceVertex, surfaceFragment } from './portrait-shaders';
import { portraitTurn } from './portrait-turn.ts';

export interface PortraitAPI {
  setMouth(shape: Partial<MouthShape>): void;
  resetMouth(): void;
  connectAudio(input: HTMLMediaElement | AudioNode | MediaStream): Promise<() => void>;
  setVisemes(cues: VisemeCue[], clock: () => number): void;
  disconnectAudio(): void;
}
declare global { interface Window { calebPortrait?: PortraitAPI } }

export async function initHeadPortrait(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const status = root.querySelector<HTMLElement>('[data-load-status]')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const disposable: { dispose(): void }[] = [];
  const speech = new PortraitSpeech();
  let playing = !reducedMotion.matches, dragging = false, attention = false;
  let previousX = 0, previousY = 0, frame = 0;
  let renderer: THREE.WebGLRenderer | undefined;
  let observer: ResizeObserver | undefined;
  let attentionObserver: MutationObserver | undefined;
  const dispose = () => {
    events.abort(); cancelAnimationFrame(frame); observer?.disconnect(); attentionObserver?.disconnect();
    speech.dispose(); disposable.forEach(item => item.dispose());
    renderer?.dispose(); delete window.calebPortrait;
  };
  const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, name: K, handler: (event: HTMLElementEventMap[K]) => void) => target.addEventListener(name, handler, {signal:events.signal});
  addEventListener('pagehide', e => { if(!e.persisted) dispose(); else speech.disconnect(); }, {signal:events.signal});
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias:true});
    renderer.setClearColor(0xffffff);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    const responses = await Promise.all(['/head/bust.json','/head/bust-points.bin','/head/bust-surface.bin'].map(url => fetch(`${url}?revision=continuous-mouth-3`,{signal:events.signal})));
    if(responses.some(response => !response.ok)) throw new Error('Portrait asset unavailable');
    const [meta, pointBuffer, surfaceBuffer] = await Promise.all([responses[0].json(), responses[1].arrayBuffer(), responses[2].arrayBuffer()]);
    if(meta.version !== 2 || pointBuffer.byteLength !== meta.count*14 || surfaceBuffer.byteLength%18 !== 0) throw new Error('Invalid portrait data');
    const packed = new Int16Array(pointBuffer);
    const decoded = new Float32Array(packed.length);
    for(let i=0;i<packed.length;i++) decoded[i]=packed[i]/(i%7<3 ? 8192 : 32767);
    const interleaved = new THREE.InterleavedBuffer(decoded,7);
    const geometry = new THREE.BufferGeometry(); disposable.push(geometry);
    geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(interleaved,3,0));
    geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(interleaved,3,3));
    geometry.setAttribute('shade',new THREE.InterleavedBufferAttribute(interleaved,1,6));
    geometry.setAttribute('seed',new THREE.BufferAttribute(Float32Array.from({length:meta.count},(_,i)=>(i*0.61803398875)%1),1));
    const surfaceGeometry = new THREE.BufferGeometry(); disposable.push(surfaceGeometry);
    surfaceGeometry.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(new Int16Array(surfaceBuffer),v=>v/8192),3));
    const atlas = document.createElement('canvas'); atlas.width=512; atlas.height=64;
    const ctx=atlas.getContext('2d')!; ctx.fillStyle='#fff';ctx.font='48px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ['.',':','-','+','=','*','#','@'].forEach((glyph,i)=>ctx.fillText(glyph,i*64+32,33));
    const glyphs=new THREE.CanvasTexture(atlas); disposable.push(glyphs);
    const uniforms={mouth:{value:new THREE.Vector3()},mouthCenter:{value:new THREE.Vector3(...meta.mouth)},pixelRatio:{value:renderer.getPixelRatio()},pointScale:{value:1},ascii:{value:0},glyphs:{value:glyphs}};
    const material=new THREE.ShaderMaterial({uniforms,vertexShader:pointVertex,fragmentShader:pointFragment}); disposable.push(material);
    const depthMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:surfaceVertex,fragmentShader:surfaceFragment,colorWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2}); disposable.push(depthMaterial);
    const bust=new THREE.Group();
    const surface=new THREE.Mesh(surfaceGeometry,depthMaterial);surface.renderOrder=-1;
    bust.add(surface,new THREE.Points(geometry,material));
    // A recessed, dotted mouth interior is revealed when the real lower lip separates.
    const cavityPositions:number[]=[];
    for(let i=0;i<1800;i++) {
      const r=Math.sqrt((i+.5)/1800), theta=i*2.39996323;
      cavityPositions.push(Math.cos(theta)*r,Math.sin(theta)*r,r);
    }
    const cavityGeometry=new THREE.BufferGeometry();disposable.push(cavityGeometry);
    cavityGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cavityPositions,3));
    const cavityMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:`
      uniform vec3 mouth;uniform vec3 mouthCenter;uniform float pixelRatio;uniform float pointScale;
      void main(){
        float width=.19*(1.-mouth.y*.18+mouth.z*.12);
        vec3 p=vec3(mouthCenter.x+position.x*width,mouthCenter.y-.0275*mouth.x+position.y*(.006+.0355*mouth.x),mouthCenter.z-.032-.038*(1.-position.z));
        p.y-=.10*(p.x-mouthCenter.x);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        gl_PointSize=1.3*pixelRatio*pointScale;
      }`,fragmentShader:`uniform vec3 mouth;void main(){if(mouth.x<.03||length(gl_PointCoord-.5)>.48)discard;gl_FragColor=vec4(0.,0.,0.,1.);}`});disposable.push(cavityMaterial);
    bust.add(new THREE.Points(cavityGeometry,cavityMaterial));
    const scene=new THREE.Scene();scene.add(bust);
    const camera=new THREE.OrthographicCamera(-3,3,2.1,-2.1,.1,20);camera.position.z=6;
    const render=()=>renderer!.render(scene,camera);
    const resize=()=>{
      const w=root.clientWidth,h=root.clientHeight;if(!w||!h)return;
      renderer!.setSize(w,h,false);
      const aspect=w/h,vertical=Math.max(3.95,3.8/aspect);
      camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;
      camera.updateProjectionMatrix();
      uniforms.pointScale.value=Math.max(.6,Math.min(1.3,h/vertical/180));
      render();
    };
    observer=new ResizeObserver(resize);observer.observe(root);
    status.hidden=true;
    reducedMotion.addEventListener('change',()=>{playing=!reducedMotion.matches;},{signal:events.signal});
    const holdFront=()=>{dragging=false;bust.rotation.set(0,0,0);render();};
    const syncAttention=()=>{
      attention=root.dataset.attention==='front';
      if(attention)holdFront();
    };
    syncAttention();
    attentionObserver=new MutationObserver(syncAttention);
    attentionObserver.observe(root,{attributes:true,attributeFilter:['data-attention']});
    on(canvas,'pointerdown',e=>{if(attention)return;dragging=true;previousX=e.clientX;previousY=e.clientY;canvas.setPointerCapture(e.pointerId);});
    on(canvas,'pointermove',e=>{if(!dragging)return;bust.rotation.y+=(e.clientX-previousX)*.008;bust.rotation.x=THREE.MathUtils.clamp(bust.rotation.x+(e.clientY-previousY)*.005,-.3,.3);previousX=e.clientX;previousY=e.clientY;render();});
    on(canvas,'pointerup',()=>{dragging=false;});on(canvas,'pointercancel',()=>{dragging=false;});on(canvas,'lostpointercapture',()=>{dragging=false;});
    on(canvas,'keydown',e=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))e.preventDefault();
      if(attention)return;
      if(e.key==='ArrowLeft')bust.rotation.y-=.12;if(e.key==='ArrowRight')bust.rotation.y+=.12;
      if(e.key==='ArrowUp')bust.rotation.x=Math.max(-.3,bust.rotation.x-.08);if(e.key==='ArrowDown')bust.rotation.x=Math.min(.3,bust.rotation.x+.08);
      if(e.key==='Home')bust.rotation.set(0,0,0);
      render();
    });
    const api:PortraitAPI={
      setMouth:s=>{speech.setMouth(s);},
      resetMouth:()=>{speech.reset();},
      connectAudio:input=>speech.connectAudio(input),
      setVisemes:(c,clock)=>{speech.setVisemes(c,clock);},
      disconnectAudio:()=>{speech.disconnect();},
    };
    window.calebPortrait=api;window.dispatchEvent(new CustomEvent('portrait:ready',{detail:api}));
    let previous=performance.now();const started=previous;let lastSpeech=-Infinity;
    const animate=(time:number)=>{
      const dt=Math.min((time-previous)/1000,.05);previous=time;
      if(!document.hidden){
        const oldOpen=uniforms.mouth.value.x,oldRound=uniforms.mouth.value.y,oldWide=uniforms.mouth.value.z;
        const shape=speech.update(dt);uniforms.mouth.value.set(shape.open,shape.round,shape.wide);
        canvas.dataset.mouthOpen=shape.open.toFixed(3);
        if(shape.open>.025)lastSpeech=time;
        const turn=portraitTurn({attention,playing,dragging,speaking:time-lastSpeech<500,warmedUp:time-started>2500});
        let posed=false;
        if(turn==='front'&&(bust.rotation.x||bust.rotation.y||bust.rotation.z)){bust.rotation.set(0,0,0);posed=true;}
        if(turn==='face'){
          const angle=Math.atan2(Math.sin(bust.rotation.y),Math.cos(bust.rotation.y));
          bust.rotation.y-=angle*(1.-Math.exp(-dt*6));
          bust.rotation.x*=Math.exp(-dt*6);
        }
        if(turn==='idle')bust.rotation.y+=dt*.08;
        if(turn==='idle'||turn==='face'||posed||Math.abs(oldOpen-shape.open)+Math.abs(oldRound-shape.round)+Math.abs(oldWide-shape.wide)>.00001)render();
      }
      frame=requestAnimationFrame(animate);
    };
    resize();frame=requestAnimationFrame(animate);
  }catch(error){
    if(events.signal.aborted)return;
    dispose();status.hidden=false;status.textContent='The portrait couldn’t load. Please refresh to try again.';
    root.querySelector<HTMLElement>('.portrait-controls')!.hidden=true;console.error(error);
  }
}
