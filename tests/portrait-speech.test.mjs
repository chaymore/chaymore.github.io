import test from 'node:test';
import assert from 'node:assert/strict';
import { PortraitSpeech, cleanShape, levelToMouth, cueAt, validateCues, REST } from '../src/scripts/portrait-speech.ts';

test('silence and noise do not open the mouth; strong input remains bounded',()=>{
  for(const rms of [0,.005,.012,NaN,Infinity,-1])assert.equal(levelToMouth(rms),0);
  assert.ok(levelToMouth(.08)>.2);
  assert.equal(levelToMouth(100),1);
  assert.deepEqual(cleanShape({open:3,round:NaN,wide:-1}),{open:1,round:0,wide:0});
});
test('timed visemes follow the playback clock, including gaps, seeks and end',()=>{
  const cues=validateCues([{start:1,end:1.4,shape:'O'},{start:0,end:.5,shape:'MBP'},{start:2,end:1,shape:'A'},{start:2,end:3,shape:'unknown'}]);
  assert.equal(cues.length,2);
  assert.deepEqual(cueAt(cues,.2),REST);
  assert.deepEqual(cueAt(cues,.7),REST);
  assert.ok(cueAt(cues,1.1).round>.5);
  assert.deepEqual(cueAt(cues,1.4),REST);
  assert.deepEqual(cueAt(cues,10),REST);
});
test('jaw eases open and resets fully instead of sticking after playback',()=>{
  const driver=new PortraitSpeech();driver.setMouth({open:1,wide:.5});
  let state=driver.update(1/60);assert.ok(state.open>0&&state.open<1);
  for(let i=0;i<60;i++)state=driver.update(1/60);
  assert.ok(state.open>.99);
  driver.reset();for(let i=0;i<120;i++)state=driver.update(1/60);
  assert.deepEqual(state,REST);
});
test('viseme timing can override audio-independent controls and return to silence',()=>{
  let clock=0;const driver=new PortraitSpeech();
  driver.setVisemes([{start:.2,end:.6,shape:'U'}],()=>clock);
  assert.deepEqual(driver.update(.05),REST);
  clock=.3;for(let i=0;i<20;i++)driver.update(.02);
  assert.ok(driver.current.round>.99);
  clock=.8;for(let i=0;i<100;i++)driver.update(.02);
  assert.deepEqual(driver.current,REST);
});
test('switching audio sources disconnects only this analyser, preserving caller playback',async()=>{
  globalThis.HTMLMediaElement=class {};
  globalThis.MediaStream=class {};
  let tone=.1;
  const analyser=()=>({fftSize:0,smoothingTimeConstant:0,getFloatTimeDomainData(a){a.fill(tone);},getByteFrequencyData(a){a.fill(40);},disconnect(){}});
  const context={state:'running',createAnalyser:analyser};
  const source=()=>({context,connections:[],disconnections:[],connect(n){this.connections.push(n);},disconnect(n){assert.ok(n);this.disconnections.push(n);}});
  const first=source(),second=source(),driver=new PortraitSpeech();
  const disconnectOld=await driver.connectAudio(first);
  for(let i=0;i<20;i++)driver.update(.02);
  assert.ok(driver.current.open>.5);
  const disconnectNew=await driver.connectAudio(second);
  assert.equal(first.disconnections.length,1);
  disconnectOld();assert.equal(second.disconnections.length,0);
  tone=0;for(let i=0;i<100;i++)driver.update(.02);
  assert.deepEqual(driver.current,REST);
  disconnectNew();assert.equal(second.disconnections.length,1);
});
