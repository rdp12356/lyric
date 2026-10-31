const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
function load(file) { const path=require('node:path').resolve(file);const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const mod=new Module(path,module);mod.paths=module.paths;mod._compile(code,path);return mod.exports; }
const {SyncClock}=load('src/services/syncClock.ts');const {BeatEnvelope,SILENCE,spectrumEnergy}=load('src/services/beatEnvelope.ts');
let now=0;const clock=new SyncClock(()=>now);clock.reset(10,true);
for(let i=1;i<=40;i++){now=i*350;clock.update(10+now/1000+(i%2?-.03:.03),true);assert(Math.abs(clock.now()-(10+now/1000))<.1,'clock must not lose elapsed time on every poll');}
clock.update(2,true);assert(Math.abs(clock.now()-2)<.1,'explicit backwards seeks must reset');
clock.reset(4,false);now+=5000;assert.equal(clock.now(),4,'paused clocks do not advance');
clock.reset(3,true,2);now+=1000;assert.equal(clock.now(),5,'playback rate is respected');
const envelope=new BeatEnvelope();for(let i=0;i<90;i++)assert.equal(envelope.update(SILENCE,i*33).beat,0,'silence must never synthesize beats');
const hit=envelope.update({bass:.8,mid:.3,treble:.1,overall:.5},3000);assert.equal(hit.beat,1);
let repeated=0;for(let i=1;i<50;i++){if(envelope.update({bass:.8,mid:.3,treble:.1,overall:.5},3000+i*33).beat===1)repeated++;}assert.equal(repeated,0,'a sustained tone must not become a fixed-tempo fake beat');
for(let i=50;i<140;i++)envelope.update(SILENCE,3000+i*33);const quiet=envelope.update(SILENCE,8000);assert(quiet.bass<.001 && quiet.beat<.001,'envelopes settle to silence');
const bins=new Uint8Array(1024);bins[Math.round(100*2048/48000)]=255;const bass=spectrumEnergy(bins,48000,2048);assert(bass.bass>.3 && bass.mid===0 && bass.treble===0,'bass frequencies must use actual sample-rate bins');
console.log('PASS: jitter correction, no cumulative clock drift, seeks, pause, speed, real onset detection, silence, and calibrated FFT frequency bands.');
