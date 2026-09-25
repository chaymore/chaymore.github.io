import * as THREE from 'three';
import { PortraitSpeech, type MouthShape, type VisemeCue } from './portrait-speech';
import { pointVertex, pointFragment, surfaceVertex, surfaceFragment, eyeVertex, eyeFragment, cavityVertex, cavityFragment, cavityBackVertex, cavityBackFragment } from './portrait-shaders';
import { portraitTurn } from './portrait-turn.ts';
import { createFaceMotion } from './portrait-face.ts';
import { parseMouthFit, mountMouthTuner, type MouthFit } from './portrait-mouth.ts';

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
  const face = createFaceMotion();
  let playing = !reducedMotion.matches, dragging = false, attention = false;
  let previousX = 0, previousY = 0, frame = 0;
  let pointerX = 0, pointerY = 0, pointerSeen = -Infinity;
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
    renderer = new THREE.WebGLRenderer({canvas, antialias:true, preserveDrawingBuffer:import.meta.env.DEV});
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
    const uniforms={mouth:{value:new THREE.Vector3()},mouthCenter:{value:new THREE.Vector3(...meta.mouth)},mouthScan:{value:new THREE.Vector4()},mouthTune:{value:new THREE.Vector4()},pixelRatio:{value:renderer.getPixelRatio()},pointScale:{value:1},ascii:{value:0},glyphs:{value:glyphs},blink:{value:0},brow:{value:0},gaze:{value:new THREE.Vector2()}};
    const tuning=new URLSearchParams(location.search).has('mouth');
    const applyMouth=(fit:MouthFit,raw=false)=>{
      uniforms.mouthScan.value.set(fit.cx,fit.cy,fit.halfWidth,fit.slope);
      uniforms.mouthTune.value.set(fit.upper,fit.lower,raw?1:0,0);
      uniforms.mouthCenter.value.set(raw?fit.cx:fit.center,fit.cy,meta.mouth[2]);
    };
    const mouthFit=parseMouthFit(new URLSearchParams(location.search).get('mouth'));
    applyMouth(mouthFit);
    const material=new THREE.ShaderMaterial({uniforms,vertexShader:pointVertex,fragmentShader:pointFragment}); disposable.push(material);
    const depthMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:surfaceVertex,fragmentShader:surfaceFragment,colorWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2}); disposable.push(depthMaterial);
    // bust carries the drag/idle turn; pose adds speech nods and tilts around the neck.
    const neck=new THREE.Vector3(.05,-.75,-.1);
    const bust=new THREE.Group(),pose=new THREE.Group(),head=new THREE.Group();
    pose.position.copy(neck);head.position.copy(neck).negate();
    bust.add(pose);pose.add(head);
    const surface=new THREE.Mesh(surfaceGeometry,depthMaterial);surface.renderOrder=-1;
    head.add(surface,new THREE.Points(geometry,material));
    // Modeled irises: sunflower-sampled unit disks, one per eye.
    const irisDots=130,eyeDisk:number[]=[],eyeSide:number[]=[],eyeSeed:number[]=[];
    for(let side=0;side<2;side++)for(let i=0;i<irisDots;i++){
      const r=Math.sqrt((i+.5)/irisDots),theta=i*2.39996323;
      eyeDisk.push(Math.cos(theta)*r,Math.sin(theta)*r);eyeSide.push(side);eyeSeed.push((i*.7548776662)%1);
    }
    const eyeGeometry=new THREE.BufferGeometry();disposable.push(eyeGeometry);
    eyeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(eyeSide.length*3),3));
    eyeGeometry.setAttribute('disk',new THREE.Float32BufferAttribute(eyeDisk,2));
    eyeGeometry.setAttribute('side',new THREE.Float32BufferAttribute(eyeSide,1));
    eyeGeometry.setAttribute('seed',new THREE.Float32BufferAttribute(eyeSeed,1));
    const eyeMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:eyeVertex,fragmentShader:eyeFragment});disposable.push(eyeMaterial);
    const eyes=new THREE.Points(eyeGeometry,eyeMaterial);eyes.frustumCulled=false;
    head.add(eyes);
    // A recessed, dotted mouth interior is revealed when the real lower lip separates.
    const cavityPositions:number[]=[];
    for(let i=0;i<1800;i++) {
      const r=Math.sqrt((i+.5)/1800), theta=i*2.39996323;
      cavityPositions.push(Math.cos(theta)*r,Math.sin(theta)*r,r);
    }
    const cavityGeometry=new THREE.BufferGeometry();disposable.push(cavityGeometry);
    cavityGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cavityPositions,3));
    const cavityMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:cavityVertex,fragmentShader:cavityFragment});disposable.push(cavityMaterial);
    head.add(new THREE.Points(cavityGeometry,cavityMaterial));
    const backGeometry=new THREE.CircleGeometry(1,48);disposable.push(backGeometry);
    const backMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:cavityBackVertex,fragmentShader:cavityBackFragment,side:THREE.DoubleSide});disposable.push(backMaterial);
    const back=new THREE.Mesh(backGeometry,backMaterial);back.frustumCulled=false;back.renderOrder=-1;head.add(back);
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
    addEventListener('pointermove',e=>{pointerX=e.clientX;pointerY=e.clientY;pointerSeen=performance.now();},{signal:events.signal,passive:true});
    // Eye target: the visitor's cursor when it moved recently, otherwise the camera.
    const eyeMid=new THREE.Vector3(.069,.486,.6),eyeWorld=new THREE.Vector3(),target=new THREE.Vector3(),headTurn=new THREE.Quaternion();
    const lookTarget=(now:number,speaking:boolean)=>{
      head.updateWorldMatrix(true,false);
      eyeWorld.copy(eyeMid);head.localToWorld(eyeWorld);
      const rect=canvas.getBoundingClientRect();
      if(!speaking&&!dragging&&now-pointerSeen<2500&&rect.width&&rect.height){
        const nx=(pointerX-rect.left)/rect.width,ny=(pointerY-rect.top)/rect.height;
        target.set(camera.left+(camera.right-camera.left)*nx,camera.top-(camera.top-camera.bottom)*ny,3.2).sub(eyeWorld);
      }else target.set(0,0,1);
      head.getWorldQuaternion(headTurn);
      target.normalize().applyQuaternion(headTurn.invert());
      if(target.z<.45)return null;
      return {x:Math.atan2(target.x,target.z),y:Math.asin(THREE.MathUtils.clamp(target.y,-1,1))};
    };
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
    if(import.meta.env.DEV)(window as any).__portraitDebug={uniforms,pose,bust};
    if(tuning){
      root.dataset.attention='front';
      // With the bust and pose at rest, head space is world space.
      const toScreen=(x:number,y:number)=>({x:(x-camera.left)/(camera.right-camera.left)*canvas.clientWidth,y:(camera.top-y)/(camera.top-camera.bottom)*canvas.clientHeight});
      const fromScreen=(x:number,y:number)=>({x:camera.left+x/canvas.clientWidth*(camera.right-camera.left),y:camera.top-y/canvas.clientHeight*(camera.top-camera.bottom)});
      const tuner=mountMouthTuner({root,canvas,initial:mouthFit,signal:events.signal,toScreen,fromScreen,
        apply:(fit,raw)=>{applyMouth(fit,raw);render();},
        setOpen:open=>{speech.setMouth({open,round:0,wide:.15});}});
      observer?.disconnect();observer=new ResizeObserver(()=>{resize();tuner.place();});observer.observe(root);
    }
    window.calebPortrait=api;window.dispatchEvent(new CustomEvent('portrait:ready',{detail:api}));
    let previous=performance.now();const started=previous;let lastSpeech=-Infinity;
    const animate=(time:number)=>{
      const dt=Math.min((time-previous)/1000,.05);previous=time;
      if(!document.hidden){
        const oldOpen=uniforms.mouth.value.x,oldRound=uniforms.mouth.value.y,oldWide=uniforms.mouth.value.z;
        const shape=speech.update(dt);uniforms.mouth.value.set(shape.open,shape.round,shape.wide);
        canvas.dataset.mouthOpen=shape.open.toFixed(3);
        canvas.dataset.viseme=speech.viseme;
        if(shape.open>.025||speech.viseme!=='rest')lastSpeech=time;
        const speaking=time-lastSpeech<500;
        const facePose=face.update(dt,{speaking,reducedMotion:reducedMotion.matches||tuning,level:speech.level,look:tuning?null:lookTarget(time,speaking)});
        const faceShift=Math.abs(uniforms.blink.value-facePose.blink)+Math.abs(uniforms.brow.value-facePose.brow)
          +Math.abs(uniforms.gaze.value.x-facePose.gazeX)+Math.abs(uniforms.gaze.value.y-facePose.gazeY)
          +Math.abs(pose.rotation.x-facePose.headPitch)+Math.abs(pose.rotation.y-facePose.headYaw)+Math.abs(pose.rotation.z-facePose.headRoll)
          +Math.abs(pose.position.y-neck.y-facePose.breath);
        uniforms.blink.value=facePose.blink;uniforms.brow.value=facePose.brow;
        uniforms.gaze.value.set(facePose.gazeX,facePose.gazeY);
        pose.rotation.set(facePose.headPitch,facePose.headYaw,facePose.headRoll);
        pose.position.y=neck.y+facePose.breath;
        canvas.dataset.blink=facePose.blink.toFixed(2);
        const turn=portraitTurn({attention,playing,dragging,speaking,warmedUp:time-started>2500});
        let posed=false;
        if(turn==='front'&&(bust.rotation.x||bust.rotation.y||bust.rotation.z)){bust.rotation.set(0,0,0);posed=true;}
        if(turn==='face'){
          const angle=Math.atan2(Math.sin(bust.rotation.y),Math.cos(bust.rotation.y));
          bust.rotation.y-=angle*(1.-Math.exp(-dt*6));
          bust.rotation.x*=Math.exp(-dt*6);
        }
        if(turn==='idle')bust.rotation.y+=dt*.08;
        if(turn==='idle'||turn==='face'||posed||faceShift>.00001||Math.abs(oldOpen-shape.open)+Math.abs(oldRound-shape.round)+Math.abs(oldWide-shape.wide)>.00001)render();
      }
      frame=requestAnimationFrame(animate);
    };
    if(import.meta.env.DEV)Object.assign((window as any).__portraitDebug,{animate,render,lookTarget,head});
    resize();frame=requestAnimationFrame(animate);
  }catch(error){
    if(events.signal.aborted)return;
    dispose();status.hidden=false;status.textContent='The portrait couldn’t load. Please refresh to try again.';
    root.querySelector<HTMLElement>('.portrait-controls')!.hidden=true;console.error(error);
  }
}
