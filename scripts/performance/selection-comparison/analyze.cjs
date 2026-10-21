const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const run = process.argv[2]
const provenancePath = path.join(run, 'provenance.json')
const provenance = fs.existsSync(provenancePath) ? JSON.parse(fs.readFileSync(provenancePath, 'utf8')) : {}
const jsonl = name => fs.readFileSync(path.join(run, name), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line.replace(/^\uFEFF/, '')))
const events = jsonl('events.jsonl'), driver = jsonl('driver.jsonl')
const csv = fs.readFileSync(path.join(run,'resources.csv'),'utf8').trim().split(/\r?\n/)
const columns = csv.shift().split(',')
const resources = csv.map(row => Object.fromEntries(row.split(',').map((value,index) => [columns[index],['pids','processes'].includes(columns[index])?value:Number(value)])))
const statistics = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b)
  const p = quantile => sorted[Math.max(0,Math.ceil(sorted.length*quantile)-1)]
  return {n:sorted.length,min:sorted[0],p50:p(.5),p95:p(.95),max:sorted.at(-1)}
}
const output = {run, appCommit:driver.find(event=>event.event==='launch-start')?.commit || provenance.appCommit || null,
  selectionSha256:events.find(event=>event.event==='selection-implementation')?.sha256 || null,
  rawSha256:Object.fromEntries(['events.jsonl','driver.jsonl','resources.csv'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(run,name))).digest('hex')])),
  resourceAttribution:{status:columns.includes('processes')?'causal-creation-v2':'unverified-pid-only',
    samplerSha256:driver.find(event=>event.event==='launch-start')?.samplerSha256 || null,
    note:columns.includes('processes')?'Creation-time ancestry, retained validated identities, PID+birth CPU keys; sampled peaks may miss processes shorter than a sampling interval.':'Historical PID-only totals cannot prove ancestry after PID reuse. Preserve them as raw observations; do not use them to claim a resource improvement.',
    ...provenance.resourceAttribution},
  records:[], variants:{}, idle:[], resources:{}}
if (columns.includes('processes')) {
  const rootPid = events.find(event=>event.event==='launcher')?.pid
  let rootBirth, known = new Map(), cumulativeCpu = 0
  const priorCpu = new Map()
  const audit = {samples:resources.length,entries:0,unattributableEntries:0,birthViolations:0,countMismatches:0,memoryMismatches:0,cpuCounterMismatches:0}
  for (const sample of resources) {
    const entries = sample.processes ? sample.processes.split(';').map(value=> {
      const [pid,parent,birth,cpu,privateBytes,workingSetBytes] = value.split(':')
      return {pid:Number(pid),parent:Number(parent),birth:BigInt(birth),cpu:Number(cpu),privateBytes:Number(privateBytes),workingSetBytes:Number(workingSetBytes)}
    }) : []
    const byPid = new Map(entries.map(entry=>[entry.pid,entry]))
    rootBirth ??= byPid.get(rootPid)?.birth
    const valid = new Set(entries.filter(entry=>known.get(entry.pid)===entry.birth).map(entry=>entry.pid))
    if (rootBirth !== undefined && byPid.get(rootPid)?.birth===rootBirth) valid.add(rootPid)
    let changed = true
    while (changed) {
      changed = false
      for (const entry of entries) {
        const parent = byPid.get(entry.parent)
        if (parent && valid.has(parent.pid) && entry.birth>=parent.birth && entry.birth>=rootBirth && !valid.has(entry.pid)) {valid.add(entry.pid);changed=true}
      }
    }
    for (const entry of entries) {
      const parent = byPid.get(entry.parent)
      if ((rootBirth!==undefined && entry.birth<rootBirth) || (parent && entry.birth<parent.birth && known.get(entry.pid)!==entry.birth)) audit.birthViolations++
      if (!valid.has(entry.pid)) audit.unattributableEntries++
      const identity = entry.pid+':'+entry.birth
      cumulativeCpu += Math.max(0,entry.cpu-(priorCpu.get(identity)||0))
      priorCpu.set(identity,entry.cpu)
    }
    known = new Map(entries.filter(entry=>valid.has(entry.pid)).map(entry=>[entry.pid,entry.birth]))
    audit.entries += entries.length
    if(entries.length!==sample.count) audit.countMismatches++
    if(entries.reduce((sum,entry)=>sum+entry.privateBytes,0)!==sample.privateBytes || entries.reduce((sum,entry)=>sum+entry.workingSetBytes,0)!==sample.workingSetBytes) audit.memoryMismatches++
    if(Math.abs(cumulativeCpu-sample.cumulativeCpuSeconds)>1e-8) audit.cpuCounterMismatches++
  }
  output.resourceAttribution.audit = audit
}
for (const invoke of driver.filter(event => event.event === 'invoke-start')) {
  const rows = events.filter(event => event.trial === invoke.trial)
  const start = rows.find(event => event.event === 'selection-start')
  const end = rows.find(event => event.event === 'selection-end')
  const helper = rows.find(event => event.event === 'helper-end')
  const helperStart = rows.find(event => event.event === 'helper-start')
  const dom = rows.find(event => event.event === 'dom-result')
  const interval = resources.filter(sample => sample.t >= start?.t && sample.t <= end?.t)
  const intervalDuration = interval.length > 1 ? interval.at(-1).t - interval[0].t : 0
  const intervalCpu = interval.length > 1 ? interval.at(-1).cumulativeCpuSeconds - interval[0].cumulativeCpuSeconds : null
  const foreground = interval.filter(sample => sample.foreground !== invoke.sourceWindow)
  const expected = invoke.empty || invoke.failure ? !!end?.textEmpty : !!end?.textMatches
  output.records.push({ id:invoke.trial,variant:invoke.variant,empty:invoke.empty,failure:invoke.failure,same:invoke.same,
    foregroundAtInvoke:invoke.foreground===invoke.sourceWindow,foregroundSamples:interval.length,foregroundMismatches:foreground.length,
    captured:!!end,expected,reason:end?.reason,warning:end?.warning,restored:end?.restored,fixtureReady:start?.fixtureReady,
    captureMs:end?.captureMs,helperMs:helper?.elapsed,releaseMs:end?.releaseMs,pollingMs:end?.pollingMs,restoreMs:end?.restoreMs,
    domMs:dom&&start?dom.t-start.t:null,dom:!!dom,visible:dom?.visible,helperPid:helperStart?.pid,
    peakPrivateMiB:interval.length?Math.max(...interval.map(sample=>sample.privateBytes))/1048576:null,
    peakWorkingSetMiB:interval.length?Math.max(...interval.map(sample=>sample.workingSetBytes))/1048576:null,
    maxProcesses:interval.length?Math.max(...interval.map(sample=>sample.count)):null,
    sampledCpuSeconds:intervalCpu, sampledCpuPercent:intervalDuration ? 100*intervalCpu/(intervalDuration/1000)/driver.find(event=>event.event==='launch-start').logicalProcessors : null,
    helperSampled:!!helperStart&&interval.some(sample=>sample.pids.split(';').includes(String(helperStart.pid))) })
}
for (const variant of ['original','forms']) {
  const all = output.records.filter(record=>record.variant===variant)
  const selected = all.filter(record=>!record.empty&&!record.failure)
  const fields = ['captureMs','helperMs','releaseMs','pollingMs','restoreMs','domMs','peakPrivateMiB','peakWorkingSetMiB','maxProcesses','sampledCpuSeconds','sampledCpuPercent']
  output.variants[variant] = {attempts:all.length,selected:selected.length,successfulSelected:selected.filter(record=>record.expected).length,
    sameTextSelected:selected.filter(record=>record.same).length,sameTextSuccess:selected.filter(record=>record.same&&record.expected).length,
    allExpected:all.every(record=>record.expected),allRestored:all.every(record=>Object.values(record.restored||{}).length===4&&Object.values(record.restored).every(Boolean)),
    allFixtureReady:all.every(record=>Object.values(record.fixtureReady||{}).length===4&&Object.values(record.fixtureReady).every(Boolean)),
    helperPidsSampled:all.filter(record=>record.helperSampled).length,
    foregroundAtInvoke:all.filter(record=>record.foregroundAtInvoke).length,foregroundMismatches:all.reduce((sum,record)=>sum+record.foregroundMismatches,0),
    stats:Object.fromEntries(fields.map(field=>[field,statistics(selected.map(record=>record[field]).filter(value=>value!==null))])),
    empty:all.filter(record=>record.empty),failures:all.filter(record=>record.failure) }
}
output.paired = {}
for (const field of ['helperMs','captureMs']) {
  const original = output.records.filter(record=>record.variant==='original'&&!record.empty&&!record.failure)
  const differences = original.map(record=> {
    const forms = output.records.find(other=>other.id===record.id.replace(/^original-/, 'forms-'))
    return forms ? record[field]-forms[field] : NaN
  }).filter(Number.isFinite)
  output.paired[field] = {originalMinusFormsMs:statistics(differences),formsFaster:differences.filter(delta=>delta>0).length}
}
const processors = driver.find(event=>event.event==='launch-start').logicalProcessors
for(const phase of ['before','after']) {
  const start=driver.find(event=>event.event===`idle-${phase}-start`),end=driver.find(event=>event.event===`idle-${phase}-end`)
  const samples=resources.filter(sample=>sample.t>=start?.t+2000&&sample.t<=end?.t)
  if(samples.length<2)continue
  const first=samples[0],last=samples.at(-1)
  output.idle.push({phase,n:samples.length,durationMs:last.t-first.t,normalizedCpuPercent:100*(last.cumulativeCpuSeconds-first.cumulativeCpuSeconds)/((last.t-first.t)/1000)/processors,
    privateMiB:statistics(samples.map(sample=>sample.privateBytes/1048576)),workingSetMiB:statistics(samples.map(sample=>sample.workingSetBytes/1048576)),processes:statistics(samples.map(sample=>sample.count))})
}
output.resources={samples:resources.length,samplingMs:statistics(resources.map(sample=>sample.samplingMs)),maxProcesses:Math.max(...resources.map(sample=>sample.count)),
  peakPrivateMiB:Math.max(...resources.map(sample=>sample.privateBytes))/1048576,peakWorkingSetMiB:Math.max(...resources.map(sample=>sample.workingSetBytes))/1048576,
  windowsCreated:events.filter(event=>event.event==='window-created').length,windowMax:Math.max(...events.filter(event=>event.event==='health').map(event=>event.windows)),
  exit:driver.find(event=>event.event==='run-end'),outerClipboard:driver.find(event=>event.event==='outer-clipboard-restored'),history:driver.find(event=>event.event==='history')}
fs.writeFileSync(path.join(run,'summary.json'),JSON.stringify(output,null,2))
console.log(JSON.stringify({variants:output.variants,idle:output.idle,resources:output.resources},null,2))
