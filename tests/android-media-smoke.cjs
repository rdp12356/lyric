const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}),headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 window.androidBridge={};window.mediaFixture={permissionGranted:false,active:false};window.commands=[];
 window.Capacitor={PluginHeaders:[{name:'AndroidMedia',methods:['getPlayback','openSettings','control'].map(name=>({name,rtype:'promise'}))}],nativePromise:async(plugin,method,options)=>{window.commands.push({method,options});if(method==='getPlayback')return window.mediaFixture;if(method==='openSettings'){window.mediaFixture.permissionGranted=true;return;}if(method==='control'){if(options.action==='play-pause')window.mediaFixture.playing=!window.mediaFixture.playing;if(options.action==='seek')window.mediaFixture.position=options.position;return;}}};
});
await page.route('https://lrclib.net/**',r=>r.fulfill({json:{id:1,trackName:'Native Song',artistName:'Native Artist',duration:180,syncedLyrics:'[00:00.00]Native media session\n[00:10.00]Brings the music alive'}}));
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('button',{name:'Connect music player'}).click();
await page.getByRole('button',{name:'Enable notification access'}).click();
await page.getByText('Play a song in Spotify or another music app, then come back here.').waitFor();
await page.evaluate(()=>{window.mediaFixture={permissionGranted:true,active:true,title:'Native Song',artist:'Native Artist',album:'Album',duration:180,position:15,playing:true,packageName:'com.spotify.music'}});
await page.getByText('Native Song',{exact:true}).waitFor();await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Play',exact:true}).waitFor();
await page.getByRole('slider').fill('35');
assert(await page.evaluate(()=>window.commands.some(c=>c.method==='control' && c.options.action==='seek' && c.options.position===35)));
await page.evaluate(()=>{window.mediaFixture.active=false});
await page.getByRole('heading',{name:'Your music. Every word.'}).waitFor();
assert.deepEqual(errors,[]);console.log('PASS: Android permission prompt, settings, session discovery, native pause/seek commands, and session disappearance (mocked native transport).');
await browser.close();})();
