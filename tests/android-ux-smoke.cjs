const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
function wav(){const rate=44100,count=rate*12,b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=0;i<count;i++){const t=i/rate;b.writeInt16LE(t>=4&&t<8?0:Math.round(Math.sin(i*2*Math.PI*80/rate)*16000),44+i*2);}return b;}
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://lrclib.net/**',r=>r.fulfill({json:{id:5,trackName:'Pulse Study',artistName:'Artist',duration:12,syncedLyrics:'[00:00.00]Every beat comes alive\n[00:05.00]Into the quiet\n[00:09.00]Back to the light'}}));
 await page.goto('http://127.0.0.1:5173/?android');
 const file={name:'Artist - Pulse Study.wav',mimeType:'audio/wav',buffer:wav()};
 await page.getByLabel('Audio file',{exact:true}).setInputFiles([file,{...file,name:'Artist - Quiet Hours.wav'}]);
 await page.getByRole('button',{name:'Pause',exact:true}).waitFor();await page.waitForTimeout(850);
 assert(await page.locator('.mobile-energy-bars i').evaluateAll(nodes=>Math.max(...nodes.map(n=>parseFloat(n.style.height)))>5),'measured bass must light the edges');
 await page.getByRole('slider',{name:'Playback position'}).fill('5');await page.waitForTimeout(1400);
 assert(await page.locator('.mobile-energy-bars i').evaluateAll(nodes=>Math.max(...nodes.map(n=>parseFloat(n.style.height)))<3.5),'silence must dim the edges instead of using a fake fixed beat');
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:'Toggle ambient lighting'}).click();await page.getByRole('button',{name:'Toggle ambient lighting'}).click();
 await page.getByRole('button',{name:'Open queue'}).click();assert.equal(await page.locator('.mobile-queue-row').count(),2,'multi-file import must not duplicate the first song');
 await page.getByRole('button',{name:'Close your queue'}).click();await page.getByRole('button',{name:'Next track'}).click();await page.getByText('Quiet Hours',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('slider',{name:'Playback position'}).fill('0');await page.getByRole('button',{name:'Previous track'}).click();await page.getByText('Pulse Study',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:'Focus mode'}).click();assert.equal(await page.getByRole('region',{name:'Music player'}).count(),0);await page.getByRole('button',{name:'Show player'}).click();
 await page.getByRole('button',{name:'Advance lyrics 50 milliseconds'}).click();await page.getByText('Sync +50ms').waitFor();
 await page.getByRole('button',{name:'Sources and settings'}).click();await page.getByLabel('Light pattern').selectOption('wave');await page.getByLabel('Edge width',{exact:true}).fill('14');
 await page.getByRole('button',{name:'Calibrate this song'}).click();await page.getByRole('dialog',{name:'Lyric calibration'}).waitFor();await page.getByRole('button',{name:'Close lyric calibration'}).click();
 await page.getByRole('button',{name:'Sources and settings'}).click();await page.getByLabel('LRC lyrics file',{exact:true}).setInputFiles({name:'words.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]Offline words\n[00:05.00]Remember this song\n[00:09.00]Into the light')});await page.getByText('Imported LRC',{exact:true}).waitFor();
 await page.screenshot({path:process.env.LYRIC_QA_SCREENSHOT||'/tmp/lyric-mobile-v110.png'});
 await page.reload();await page.unroute('https://lrclib.net/**');await page.route('https://lrclib.net/**',r=>r.abort());
 await page.getByLabel('Audio file',{exact:true}).setInputFiles(file);await page.getByText('Imported LRC',{exact:true}).waitFor();await page.getByText('Sync +50ms').waitFor();
 await page.getByRole('button',{name:'Sources and settings'}).click();assert.equal(await page.getByLabel('Light pattern').inputValue(),'wave');assert.equal(await page.getByLabel('Edge width',{exact:true}).inputValue(),'14');
 await page.getByRole('button',{name:'Close settings'}).click();
 for(const viewport of [{width:320,height:640},{width:844,height:390},{width:768,height:1024}]){await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);
 console.log('PASS: measured bass vs silence, lighting toggles, multi-file queue, previous/next, focus, calibration, saved lighting, offline LRC cache, and responsive layouts.');await browser.close();
})();
