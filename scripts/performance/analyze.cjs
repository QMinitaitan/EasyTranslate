const fs = require('node:fs')
const path = require('node:path')
const folder = process.argv[2]
const environmentPath = path.join(folder, 'environment.json')
const environment = fs.existsSync(environmentPath)
  ? JSON.parse(fs.readFileSync(environmentPath, 'utf8').replace(/^\uFEFF/, ''))
  : {}
const logicalProcessors = Number(process.argv[3] || environment.logicalProcessors)
if (!Number.isInteger(logicalProcessors) || logicalProcessors < 1) {
  throw new Error('Pass the recorded logical CPU count as argument 3 for archives without environment.json')
}
const read = file => fs.readFileSync(file,'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line.replace(/^\uFEFF/,'')))
const stats = values => {
  values = values.filter(v => Number.isFinite(v)).sort((a,b) => a-b)
  const q = p => values[Math.max(0,Math.ceil(values.length*p)-1)]
  return { n: values.length, min: values[0], p50:q(.5), p95:q(.95), max:values.at(-1) }
}
const output = {folder, logicalProcessors, startup:[], first:[], warm:[], empty:[], idle:[], restoration:[], history:[], resource:[]}
for(const directory of fs.readdirSync(folder).filter(n => n.startsWith('cold-'))) {
 const run = path.join(folder,directory)
 if(!fs.existsSync(path.join(run,'stdout.txt'))) continue
 const events = read(path.join(run,'events.jsonl'))
 const driver = read(path.join(run,'driver.jsonl'))
 const sampleLines = fs.readFileSync(path.join(run,'resources.csv'),'utf8').trim().split(/\r?\n/)
 const keys = sampleLines.shift().split(',')
 const samples = sampleLines.map(line => Object.fromEntries(line.split(',').map((v,i) => [keys[i],keys[i]==='pids'?v:Number(v)])))
 const start = driver.find(e=>e.event==='launch-start')
 const appReady = events.find(e=>e.event==='app-ready')
 const mainReady = events.find(e=>e.event==='document-ready'&&e.kind==='main')
 output.startup.push({run:directory, appReadyMs:appReady?.t-start.t, mainReadyMs:mainReady?.t-start.t})
 for(const invoke of driver.filter(e=>e.event==='invoke-start')) {
  const trialEvents=events.filter(e=>e.trial===invoke.trial)
  const first=name=>trialEvents.find(e=>e.event===name)
  const shortcut=first('shortcut'), capture=first('selection-end'), helper=first('helper-end')
  const show=trialEvents.find(e=>e.event==='window-show'&&e.kind==='popup')
  const document=trialEvents.find(e=>e.event==='document-ready'&&e.kind==='popup')
  const result=first('translate-end'),dom=first('dom-result')
  const delta=e=>e&&shortcut?e.t-shortcut.t:null
  const values={trial:invoke.trial, foregroundOK:invoke.foreground===invoke.sourceWindow, shortcutObserved:!!shortcut,
    selectionMs:delta(capture),helperMs:helper?.elapsed,showMs:delta(show),popupDocumentMs:delta(document),
    backendResultMs:delta(result),domResultMs:delta(dom), domVisible:dom?.visible,
    successful:!!(result?.ok && dom), selectionSource:capture?.source, reason:capture?.reason,
    captureToShowMs:show&&capture?show.t-capture.t:null,
    afterCaptureToDomMs:dom&&capture?dom.t-capture.t:null}
  const collection=invoke.empty?output.empty:invoke.trial.endsWith('-invoke-1')?output.first:output.warm
  collection.push(values)
  if(capture)output.restoration.push({trial:invoke.trial,text:capture.clipboardRestored,html:capture.htmlRestored,rtf:capture.rtfRestored})
 }
 for(const phase of ['before','after']) {
  const a=driver.find(e=>e.event===`idle-${phase}-start`),b=driver.find(e=>e.event===`idle-${phase}-end`)
  if(!a||!b)continue
  const phaseSamples=samples.filter(s=>s.t>=a.t+2000&&s.t<=b.t)
  const left=phaseSamples[0],right=phaseSamples.at(-1)
  if(!left||!right)continue
  const health=events.filter(e=>e.event==='health'&&e.t>=a.t+2000&&e.t<=b.t)
  output.idle.push({run:directory,phase,durationMs:right.t-left.t,n:phaseSamples.length,
   normalizedCpuPercent:100*(right.cumulativeCpuSeconds-left.cumulativeCpuSeconds)/((right.t-left.t)/1000)/logicalProcessors,
   privateMiB:stats(phaseSamples.map(s=>s.privateBytes/1048576)),workingSetMiB:stats(phaseSamples.map(s=>s.workingSetBytes/1048576)),
   processCount:stats(phaseSamples.map(s=>s.count)),windows:stats(health.map(s=>s.windows)),visibleWindows:stats(health.map(s=>s.visible))})
 }
 const helperPids=new Set(events.filter(e=>e.event==='helper-start').map(e=>e.pid))
 output.resource.push({run:directory,peakPrivateMiB:Math.max(...samples.map(s=>s.privateBytes))/1048576,
  peakWorkingSetMiB:Math.max(...samples.map(s=>s.workingSetBytes))/1048576,
  maxProcesses:Math.max(...samples.map(s=>s.count)),helperPidsSampled:[...helperPids].filter(pid=>samples.some(s=>s.pids.split(';').includes(String(pid)))).length,
  helpers:helperPids.size,samplingMs:stats(samples.map(s=>s.samplingMs)),
  windowsCreated:events.filter(e=>e.event==='window-created').length,
  liveWindowsMax:Math.max(...events.filter(e=>e.event==='health').map(e=>e.windows))})
 output.history.push(driver.find(e=>e.event==='history'))
}
output.firstSuccessful=output.first.filter(v=>v.successful)
output.warmSuccessful=output.warm.filter(v=>v.successful)
output.summary={}
for(const group of ['startup','first','warm','firstSuccessful','warmSuccessful','empty']) {
 output.summary[group]={}
 const fields=group==='startup'?['appReadyMs','mainReadyMs']:['selectionMs','helperMs','showMs','popupDocumentMs','backendResultMs','domResultMs','captureToShowMs','afterCaptureToDomMs']
 for(const field of fields)output.summary[group][field]=stats(output[group].map(v=>v[field]).filter(v=>v!==null&&v!==undefined))
 if(group!=='startup')output.summary[group].successful=output[group].filter(v=>v.successful).length
}
fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify(output,null,2))
console.log(JSON.stringify({summary:output.summary,idle:output.idle,resource:output.resource,history:output.history,clipboardAllRestored:output.restoration.every(v=>v.text&&v.html&&v.rtf)},null,2))
