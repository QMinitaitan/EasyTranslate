param([int]$ColdCount=7, [int]$WarmCount=30, [int]$IdleSeconds=30, [string]$Label='baseline', [string]$Repo='', [string]$Main='', [string]$ElectronPath='', [string]$OutputRoot='')
$ErrorActionPreference = 'Stop'
$bench = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Split-Path -Parent (Split-Path -Parent $bench)
if (!$Repo) { $Repo = $project }
if (!$OutputRoot) { $OutputRoot = Join-Path $project '.runtime\performance' }
$all = Join-Path $OutputRoot ('runs-' + $Label)
if ((Test-Path -LiteralPath $all) -and (Get-ChildItem -LiteralPath $all -Force | Select-Object -First 1)) {
  throw 'Choose a fresh benchmark Label: existing raw observations must not be mixed or overwritten.'
}
New-Item -ItemType Directory -Path $all -Force | Out-Null
@{logicalProcessors=[Environment]::ProcessorCount;os=[Environment]::OSVersion.VersionString;repo=$Repo;main=$Main;electronPath=$ElectronPath;sampler='causal-creation-v2';samplerSha256=(Get-FileHash -LiteralPath (Join-Path $bench 'process-sampler.cs') -Algorithm SHA256).Hash;harnessSafety='owned-foreground-exact-synthetic-v1'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $all 'environment.json') -Encoding UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $bench 'process-sampler.cs') -Raw -Encoding UTF8)
# Keep supported original clipboard payloads only in this runner's memory.
$saved = New-Object System.Windows.Forms.DataObject
$original = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($original) { foreach($format in $original.GetFormats($false)) {try {$saved.SetData($format,$original.GetData($format,$false))} catch {}} }
function Event([string]$Path,[string]$Name,$Extra=@{}) {
  $data = @{t=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();event=$Name} + $Extra
  [IO.File]::AppendAllText($Path, ($data | ConvertTo-Json -Compress) + "`n")
}
function WaitEvent([string]$Path,[string]$Name,[int]$Timeout=10000,[string]$Trial='') {
  $clock=[Diagnostics.Stopwatch]::StartNew()
  while($clock.ElapsedMilliseconds -lt $Timeout) {
    if(Test-Path -LiteralPath $Path) {
      $observed = @(Get-Content -LiteralPath $Path | ForEach-Object {try {$_ | ConvertFrom-Json} catch {}})
      $failure = $observed | Where-Object { $_.event -eq 'harness-failure' } | Select-Object -First 1
      if($failure) {throw ('Benchmark harness failed a synthetic fixture guard at ' + $failure.stage + '; raw observations retained at ' + $Path)}
      $found = $observed | Where-Object { $_.event -eq $Name -and (!$Trial -or $_.trial -eq $Trial) }
      if($found) {return $found[-1]}
    }
    Start-Sleep -Milliseconds 50
  }
  return $null
}
try {
 for($cold=1;$cold -le $ColdCount;$cold++) {
  $process=$null
  $source=$null
  $outTask=$null
  $errTask=$null
  $run=Join-Path $all ('cold-' + $cold)
  New-Item -ItemType Directory -Path $run -Force | Out-Null
  $events=Join-Path $run 'driver.jsonl'
  $appEvents=Join-Path $run 'events.jsonl'
  $providers=@{}
  foreach($id in @('deepseek','openai','bing','google','deepl','youdao','tencent','caiyun','baidu')) {$providers[$id]=@{enabled=$false;apiKey=''}}
  $providers.openai=@{enabled=$true;apiKey='BENCH_FAKE_KEY';endpoint='https://benchmark.invalid';model='controlled';prompt='Translate {{src}} into {{target}}'}
  [IO.File]::WriteAllText((Join-Path $run '.translate-app.config.json'), (@{providers=$providers;raceMode=$false;launchToTray=$true;shortcuts=@{translate='Alt+Q';show='Alt+E'}} | ConvertTo-Json -Depth 5))
  $source=Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-Sta','-File',(Join-Path $bench 'source-form.ps1'),'-Run',$run) -PassThru
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(!(Test-Path -LiteralPath (Join-Path $run 'source-window.json')) -and [DateTime]::UtcNow -lt $deadline) {Start-Sleep -Milliseconds 100}
  $sourceInfo=Get-Content -LiteralPath (Join-Path $run 'source-window.json') -Raw | ConvertFrom-Json
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName=if($ElectronPath) {$ElectronPath} else {Join-Path $Repo 'node_modules\electron\dist\electron.exe'}
  $psi.Arguments='"' + (Join-Path $bench 'launcher.cjs') + '" --hidden --remote-debugging-port=9333'
  $psi.WorkingDirectory=if($Repo.EndsWith('.asar')) {Split-Path -Parent $Repo} else {$Repo}
  $psi.UseShellExecute=$false
  $psi.CreateNoWindow=$true
  $psi.RedirectStandardOutput=$true
  $psi.RedirectStandardError=$true
  $psi.EnvironmentVariables['HOME']=$run
  $psi.EnvironmentVariables['USERPROFILE']=$run
  $psi.EnvironmentVariables['EASY_BENCH_REPO']=$Repo
  $psi.EnvironmentVariables['EASY_BENCH_RUN']=$run
  $psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
  if($Main) {$psi.EnvironmentVariables['EASY_BENCH_MAIN']=$Main}
  Event $events 'launch-start'
  $process=[Diagnostics.Process]::Start($psi)
  $outTask=$process.StandardOutput.ReadToEndAsync()
  $errTask=$process.StandardError.ReadToEndAsync()
  [BenchNative]::Start($process.Id,(Join-Path $run 'resources.csv'))
  $ready=WaitEvent $appEvents 'document-ready' 15000
  Event $events 'launch-ready' @{ok=[bool]$ready;pid=$process.Id}
  if(!$ready) {throw 'App did not reach main document-ready'}
  if($cold -eq 1) {Event $events 'idle-before-start';Start-Sleep -Seconds $IdleSeconds;Event $events 'idle-before-end'}
  $total=1
  if($cold -eq 1) {$total += $WarmCount + 1}
  for($i=1;$i -le $total;$i++) {
    $id='cold-' + $cold + '-invoke-' + $i
    $empty=($cold -eq 1 -and $i -eq $total)
    $text='Hello baseline world ' + $i + '.'
    $readyPath=Join-Path $run 'source-ready.json'
    if(Test-Path -LiteralPath $readyPath) {Remove-Item -LiteralPath $readyPath}
    @{id=$id;text=$text;empty=$empty} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $run 'source-command.json') -Encoding UTF8
    $deadline=[DateTime]::UtcNow.AddSeconds(5)
    while(!(Test-Path -LiteralPath $readyPath) -and [DateTime]::UtcNow -lt $deadline) {Start-Sleep -Milliseconds 25}
    [BenchNative]::SetForegroundWindow([IntPtr]$sourceInfo.handle) | Out-Null
    Start-Sleep -Milliseconds 200
    [IO.File]::WriteAllText((Join-Path $run 'trial.json'), (@{id=$id} | ConvertTo-Json -Compress))
    $foreground=[BenchNative]::GetForegroundWindow().ToInt64()
    if($foreground -ne $sourceInfo.handle) {
      Event $events 'precondition-failed' @{trial=$id;stage='foreground';foreground=$foreground;sourceWindow=$sourceInfo.handle}
      throw ('Benchmark source is not foreground; no Alt+Q issued. Raw observations retained at ' + $run)
    }
    Event $events 'invoke-start' @{trial=$id;empty=$empty;foreground=$foreground;sourceWindow=$sourceInfo.handle}
    [BenchNative]::AltQ()
    if($empty) {$result=WaitEvent $appEvents 'selection-end' 5000 $id}
    else {$result=WaitEvent $appEvents 'dom-result' 5000 $id}
    Event $events 'invoke-end' @{trial=$id;empty=$empty;result=[bool]$result}
    Start-Sleep -Milliseconds 500
  }
  if($cold -eq 1) {Event $events 'idle-after-start';Start-Sleep -Seconds $IdleSeconds;Event $events 'idle-after-end'}
  # Capture history metadata only: synthetic fixtures, no user data.
  $historyPath=Join-Path $run '.translate-app.history.json'
  if(Test-Path -LiteralPath $historyPath) {
    $items=Get-Content -LiteralPath $historyPath -Raw | ConvertFrom-Json
    Event $events 'history' @{count=@($items).Count;allSynthetic=(@($items | Where-Object {$_.src -notlike 'Hello baseline world*' -or $_.dst -notlike 'BENCH_TRANSLATED:*'}).Count -eq 0)}
  }
  [IO.File]::WriteAllText((Join-Path $run 'stop'),'stop')
  if(!$process.WaitForExit(5000)) {$process.Kill()}
  [BenchNative]::Stop()
  [IO.File]::WriteAllText((Join-Path $run 'stdout.txt'),$outTask.Result)
  [IO.File]::WriteAllText((Join-Path $run 'stderr.txt'),$errTask.Result)
  @{action='stop'} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $run 'source-command.json') -Encoding UTF8
  if(!$source.WaitForExit(5000)) {Stop-Process -Id $source.Id}
  Event $events 'run-end' @{exitCode=$process.ExitCode}
  Write-Output ('Completed ' + $run)
 }
} finally {
 [BenchNative]::Stop()
 if($process -and !$process.HasExited) {$process.Kill();$process.WaitForExit(5000) | Out-Null}
 # Preserve available diagnostic streams even when a fixture guard aborts the cohort.
 try {if($outTask -and $outTask.IsCompleted) {[IO.File]::WriteAllText((Join-Path $run 'stdout.txt'),$outTask.Result)}} catch {}
 try {if($errTask -and $errTask.IsCompleted) {[IO.File]::WriteAllText((Join-Path $run 'stderr.txt'),$errTask.Result)}} catch {}
 if($source -and !$source.HasExited) {Stop-Process -Id $source.Id}
 try {[System.Windows.Forms.Clipboard]::SetDataObject($saved,$true)} catch {}
}
