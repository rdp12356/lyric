const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
function wav(){const count=44100*12;const b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(88200,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)b.writeInt16LE(Math.sin(i*2*Math.PI*220/44100)*4000,44+i*2);return b}
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}),headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://lrclib.net/**',r=>r.fulfill({json:{id:1,trackName:'Test Song',artistName:'Test Artist',duration:12,syncedLyrics:'[00:00.00]Every word comes alive\n[00:05.00]Let the music carry you\n[00:10.00]Into the light'}}));
 await page.goto('http://127.0.0.1:5173/?android');
 await page.getByLabel('Audio file',{exact:true}).setInputFiles({name:'Test Artist - Test Song.wav',mimeType:'audio/wav',buffer:wav()});
 await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
 await page.waitForTimeout(1200);
 assert((await page.getByRole('slider').getAttribute('max'))==='12');
 assert(Number(await page.getByRole('slider').inputValue())>0);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 const paused=Number(await page.getByRole('slider').inputValue());
 await page.waitForTimeout(600);
 assert(Math.abs(Number(await page.getByRole('slider').inputValue())-paused)<0.15);
 await page.getByRole('slider').fill('6');
 await page.getByRole('button',{name:'Toggle lyric style'}).click();
 await page.getByRole('button',{name:'Advance lyrics 50 milliseconds'}).click();
 await page.getByText('Sync +50ms').waitFor();
 await page.getByRole('button',{name:'Sources and settings'}).click();
 await page.getByLabel('LRC lyrics file',{exact:true}).setInputFiles({name:'test.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]Hello from offline lyrics\n[00:05.00]Sing along with me\n[00:10.00]Here we go')});
 await page.getByText('Imported LRC',{exact:true}).waitFor();
 await page.waitForTimeout(400);
 for(const viewport of [{width:320,height:640},{width:844,height:390},{width:768,height:1024}]){
   await page.setViewportSize(viewport);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const box=await page.getByRole('button',{name:'Play',exact:true}).boundingBox();assert(box && box.y>=0 && box.y+box.height<=viewport.height);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: local WAV playback, clock advance, pause, seek, lyric style, sync offset, offline LRC import, 320px/390px/landscape/tablet layouts; no JS errors.');
 await browser.close();
})();
