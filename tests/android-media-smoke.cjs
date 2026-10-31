const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}),headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 window.androidBridge={};window.mediaFixture={permissionGranted:false,active:false};window.commands=[];
 window.Capacitor={PluginHeaders:[{name:'AndroidMedia',methods:['getCapabilities','getPlayback','openSettings','control'].map(name=>({name,rtype:'promise'}))}],nativePromise:async(plugin,method,options)=>{window.commands.push({plugin,method,options});if(method==='getCapabilities')return {musicPlayerSync:true};if(method==='getPlayback')return window.mediaFixture;if(method==='openSettings'){window.mediaFixture.permissionGranted=true;return;}if(method==='control'){if(options.action==='play-pause')window.mediaFixture.playing=!window.mediaFixture.playing;if(options.action==='seek')window.mediaFixture.position=options.position;return;}}};
});
await page.route('https://lrclib.net/**',r=>r.fulfill({json:{id:1,trackName:'Native Song',artistName:'Native Artist',duration:180,syncedLyrics:'[00:00.00]Native media session\n[00:10.00]Brings the music alive'}}));
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('button',{name:'Sources and settings'}).click();
await page.getByRole('button',{name:'Enable notification access'}).click();
await page.getByText('Play a song in your selected music app, then return here.').waitFor();
await page.evaluate(()=>{window.mediaFixture={permissionGranted:true,active:true,title:'Native Song',artist:'Native Artist',album:'Album',duration:180,position:15,playing:true,canSeek:true,packageName:'com.spotify.music'}});
await page.getByText('Native Song',{exact:true}).waitFor();await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Play',exact:true}).waitFor();
await page.getByRole('slider',{name:'Playback position'}).fill('35');
assert(await page.evaluate(()=>window.commands.some(c=>c.method==='control' && c.options.action==='seek' && c.options.position===35 && c.options.packageName==='com.spotify.music')));
await page.evaluate(()=>{window.mediaFixture.active=false});await page.getByRole('heading',{name:'Your music. Every word.'}).waitFor();assert.deepEqual(errors,[]);
console.log('PASS: optional Android player connection, preferred Spotify selection, native pause/seek, and session disappearance.');
const local=await browser.newPage({viewport:{width:390,height:844}});
await local.addInitScript(()=>{
 window.androidBridge={};window.nativeCalls=[];window.spotifyFixture={permissionGranted:true,active:true,title:'Spotify Song',artist:'Artist',album:'Album',duration:180,position:15,playing:true,canSeek:true,packageName:'com.spotify.music'};window.mic=false;
 const methods={AndroidMedia:['getCapabilities'],Spotify:['getStatus','connect','connectBrowser','getPlayback','control','disconnect','openApp'],AudioInput:['start','stop','getEnergy','setKeepAwake']};
 window.Capacitor={PluginHeaders:Object.entries(methods).map(([name,list])=>({name,methods:list.map(name=>({name,rtype:'promise'}))})),nativePromise:async(plugin,method,options)=>{
  window.nativeCalls.push({plugin,method,options});
  if(plugin==='AndroidMedia')return {musicPlayerSync:false};
  if(plugin==='Spotify'){
   if(method==='getStatus')return {connected:false,clientId:'',packageName:'io.github.rdp12356.lyric',fingerprint:'AA:BB:CC'};
   if(method==='connect'||method==='connectBrowser'){if(options.clientId==='f'.repeat(32))throw new Error('Spotify test connection rejected');if(options.clientId==='a'.repeat(32))return new Promise(()=>{});return {connected:true,clientId:options.clientId};}
   if(method==='getPlayback')return window.spotifyFixture;
   if(method==='control'){if(options.action==='play-pause')window.spotifyFixture.playing=!window.spotifyFixture.playing;if(options.action==='seek')window.spotifyFixture.position=options.position;}
  }
  if(plugin==='AudioInput'){if(method==='start')window.mic=true;if(method==='stop')window.mic=false;if(method==='getEnergy')return {active:window.mic,bass:.8,mid:.3,treble:.2,overall:.6};}
 }};
});
await local.route('https://lrclib.net/**',r=>r.fulfill({json:{id:2,trackName:'Spotify Song',artistName:'Artist',duration:180,syncedLyrics:'[00:00.00]Spotify words\n[00:10.00]Into the light'}}));
await local.goto('http://127.0.0.1:5173/');
await local.getByRole('button',{name:'Sources and settings'}).click();
assert.equal(await local.getByRole('button',{name:'Enable notification access'}).count(),0);
await local.getByLabel('Public Client ID').fill('f'.repeat(32));await local.getByRole('button',{name:'Sign in with Spotify',exact:true}).click();await local.getByRole('dialog').getByText('Spotify test connection rejected',{exact:true}).waitFor();
await local.getByLabel('Public Client ID').fill('a'.repeat(32));await local.getByRole('button',{name:'Sign in with Spotify',exact:true}).click();await local.getByRole('button',{name:'Cancel login'}).click();await local.getByRole('button',{name:'Sign in with Spotify',exact:true}).waitFor();
await local.getByLabel('Public Client ID').fill('0123456789abcdef0123456789abcdef');await local.getByRole('button',{name:'Sign in with Spotify',exact:true}).click();
await local.getByText('Spotify Song',{exact:true}).waitFor();
assert(await local.evaluate(()=>window.nativeCalls.some(c=>c.plugin==='Spotify'&&c.method==='connectBrowser')&&!window.nativeCalls.some(c=>c.plugin==='Spotify'&&c.method==='connect')),'Connect must delegate to browser authorization, not direct SDK login');
await local.getByRole('button',{name:'Pause',exact:true}).click();await local.getByRole('button',{name:'Play',exact:true}).waitFor();
await local.getByRole('slider',{name:'Playback position'}).fill('45');
assert(await local.evaluate(()=>window.nativeCalls.some(c=>c.plugin==='Spotify'&&c.method==='control'&&c.options.action==='seek'&&c.options.position===45)));
await local.getByRole('button',{name:'Microphone reactive lighting'}).click();await local.getByLabel('Microphone · live audio').waitFor();
await local.getByRole('button',{name:'Microphone reactive lighting'}).click();
assert(await local.evaluate(()=>window.nativeCalls.some(c=>c.plugin==='AudioInput'&&c.method==='stop')));
assert(await local.evaluate(()=>window.nativeCalls.filter(c=>c.plugin==='AndroidMedia').every(c=>c.method==='getCapabilities')));
console.log('PASS: official Spotify bridge UI, Client ID setup, Spotify pause/seek, microphone start/stop, and no notification access in Local.');
await browser.close();})();
