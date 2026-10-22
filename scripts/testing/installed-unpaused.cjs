const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { spawn, execFile } = require('node:child_process')
// Historical evidence runner, retained for audit. This path has no pre-import
// transport interception, so it must not launch under the current zero-API rules.
throw new Error('Unpaused native runner disabled: pre-import transport isolation has not been established. Use the guarded installed-product runner.')
const [exe, run, mode = 'show'] = process.argv.slice(2)
assert.ok(exe && run && !fs.existsSync(run), 'EXE and fresh output required')
fs.mkdirSync(run,{recursive:true})
for (const name of ['home','appData','localAppData','temp','userData']) fs.mkdirSync(path.join(run,name))
fs.writeFileSync(path.join(run,'home','.translate-app.config.json'),JSON.stringify({launchToTray:true,providers:{},closeAction:'quit'}))
const result={pass:false,run,mode,command:{file:exe,args:[mode==='hidden'?'--hidden':'--show','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+path.join(run,'userData')]}}
let child,socket,stdout='',stderr='',id=0
const pending=new Map(), delay=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(fn,label){const start=Date.now();while(Date.now()-start<15000){const value=await fn();if(value)return value;await delay(40)}throw new Error(label)}
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}))})}
;(async()=>{
 try{
  const env={...process.env,HOME:path.join(run,'home'),USERPROFILE:path.join(run,'home'),APPDATA:path.join(run,'appData'),LOCALAPPDATA:path.join(run,'localAppData'),TEMP:path.join(run,'temp'),TMP:path.join(run,'temp')}
  for(const key of ['NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL'])delete env[key]
  if(mode==='hidden')await wait(()=>fs.existsSync(path.join(run,'native-source-foreground.json')),'source before unpaused spawn')
  result.started=Date.now();child=spawn(exe,result.command.args,{env,cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','pipe','pipe']});result.pid=child.pid
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal,t:Date.now()})))
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b)
  const browserUrl=await wait(()=>stderr.match(/ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+/)?.[0],'unpaused own CDP')
  const port=new URL(browserUrl).port
  const target=await wait(async()=>{const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return targets.find(t=>t.type==='page'&&t.url.includes('app.asar')&&!t.url.includes('/popup'))},'production main target')
  result.target={url:target.url,type:target.type};socket=new WebSocket(target.webSocketDebuggerUrl)
  socket.addEventListener('message',e=>{const data=JSON.parse(e.data);if(pending.has(data.id)){const op=pending.get(data.id);pending.delete(data.id);data.error?op.reject(new Error(JSON.stringify(data.error))):op.resolve(data.result)}})
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  const ui=async expression=>{const answer=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(answer.exceptionDetails)throw new Error(JSON.stringify(answer.exceptionDetails));return answer.result.value}
  await wait(()=>ui("!!window.api && !!document.querySelector('.page-title')"),'visible Vue app')
  result.vueReadyAt=Date.now();result.config=await ui('window.api.loadConfig()')
  await ui("window.api.saveConfig({closeAction:'quit',launchToTray:false})")
  result.visible=await ui("({visibility:document.visibilityState,title:document.querySelector('.page-title').textContent,apiPlatform:window.api.platform})")
  assert.equal(result.visible.visibility,mode==='hidden'?'hidden':'visible');assert.equal(result.visible.apiPlatform,'win32')
  if(mode!=='hidden'){
    const png=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    fs.writeFileSync(path.join(run,'unpaused-visible.png'),Buffer.from(png.data,'base64'))
  }else{
    await wait(async()=>{const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return targets.find(t=>t.type==='page'&&t.url.includes('/popup'))},'unpaused hidden popup target')
    result.hiddenObservationStart=Date.now();await delay(5000);result.hiddenObservationEnd=Date.now()
  }
  socket.close()
  const script=`Add-Type -TypeDefinition 'using System; using System.Collections.Generic; using System.Runtime.InteropServices; public static class CloseOwnedProduct { public delegate bool EnumProc(IntPtr h,IntPtr l); [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f,IntPtr l); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l); public static int Close(uint expected) {int visible=0;EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==expected){if(IsWindowVisible(h))visible++;PostMessage(h,0x10,IntPtr.Zero,IntPtr.Zero);}return true;},IntPtr.Zero);return visible;} }'; [CloseOwnedProduct]::Close(${child.pid})`
  result.nativeVisibleWindowCount=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true},(error,out)=>error?reject(error):resolve(Number(out.trim()))))
  if(mode==='hidden')assert.equal(result.nativeVisibleWindowCount,0)
  result.exit=await Promise.race([exited,delay(10000).then(()=>{throw new Error('Natural quit deadline')})])
  assert.equal(result.exit.code,0)
  result.durable=JSON.parse(fs.readFileSync(path.join(run,'home','.translate-app.config.json'),'utf8'))
  assert.equal(result.durable.launchToTray,false);result.pass=true
 }catch(error){result.error=error.stack;process.exitCode=1}
 finally{socket?.close();if(child&&child.exitCode===null){result.forcedCleanup=true;await new Promise(resolve=>execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},resolve))}fs.writeFileSync(path.join(run,'stdout.txt'),stdout);fs.writeFileSync(path.join(run,'stderr.txt'),stderr);fs.writeFileSync(path.join(run,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({pass:result.pass,run,error:result.error,exit:result.exit}))}
})()
