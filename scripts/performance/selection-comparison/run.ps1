param([int]$Rounds=20,[int]$IdleSeconds=30,[string]$Label='paired',[string]$Repo='',[string]$ElectronPath='',[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$bench=Split-Path -Parent $MyInvocation.MyCommand.Path
if(!$Repo) {$Repo=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $bench))}
if(!$ElectronPath) {$ElectronPath=Join-Path $Repo 'node_modules\electron\dist\electron.exe'}
if(!$OutputRoot) {$OutputRoot=Join-Path $Repo '.runtime\performance\selection-comparison'}
$run=Join-Path $OutputRoot ('runs-' + $Label)
if(Test-Path -LiteralPath $run) {throw 'Choose a fresh label; never overwrite raw observations'}
New-Item -ItemType Directory -Path $run | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $Repo 'scripts\performance\process-sampler.cs') -Raw -Encoding UTF8)
$saved=New-Object System.Windows.Forms.DataObject
$original=[System.Windows.Forms.Clipboard]::GetDataObject()
if($original) {foreach($format in $original.GetFormats($false)) {try {$saved.SetData($format,$original.GetData($format,$false))} catch {}}}
function Event([string]$Name,$Extra=@{}) {
  $row=@{t=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();event=$Name}+$Extra
  [IO.File]::AppendAllText((Join-Path $run 'driver.jsonl'),($row|ConvertTo-Json -Compress)+"`n")
}
function WaitEvent([string]$Name,[string]$Id='',[int]$Timeout=10000) {
  $clock=[Diagnostics.Stopwatch]::StartNew()
  while($clock.ElapsedMilliseconds -lt $Timeout) {
    $log=Join-Path $run 'events.jsonl'
    if(Test-Path -LiteralPath $log) {
      $rows=Get-Content -LiteralPath $log -Encoding UTF8 | ForEach-Object {try {$_|ConvertFrom-Json} catch {}}
      $found=@($rows|Where-Object {$_.event -eq $Name -and (!$Id -or $_.trial -eq $Id)})
      if($found.Count) {return $found[-1]}
    }
    Start-Sleep -Milliseconds 30
  }
  return $null
}
try {
  $providers=@{}
  foreach($id in @('deepseek','openai','bing','google','deepl','youdao','tencent','caiyun','baidu')) {$providers[$id]=@{enabled=$false;apiKey=''}}
  $providers.openai=@{enabled=$true;apiKey='BENCH_FAKE_KEY';endpoint='https://benchmark.invalid';model='controlled'}
  [IO.File]::WriteAllText((Join-Path $run '.translate-app.config.json'),(@{providers=$providers;raceMode=$false;launchToTray=$true;shortcuts=@{translate='Alt+Q';show='Alt+E'}}|ConvertTo-Json -Depth 5))
  $source=Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-Sta','-File',(Join-Path $bench 'source-form.ps1'),'-Run',$run) -PassThru
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(!(Test-Path -LiteralPath (Join-Path $run 'source-window.json')) -and [DateTime]::UtcNow -lt $deadline) {Start-Sleep -Milliseconds 50}
  $sourceInfo=Get-Content -LiteralPath (Join-Path $run 'source-window.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName=$ElectronPath
  $psi.Arguments='"'+(Join-Path $bench 'launcher.cjs')+'" --hidden'
  $psi.WorkingDirectory=$Repo
  $psi.UseShellExecute=$false
  $psi.CreateNoWindow=$true
  $psi.RedirectStandardOutput=$true
  $psi.RedirectStandardError=$true
  $psi.EnvironmentVariables['HOME']=$run
  $psi.EnvironmentVariables['USERPROFILE']=$run
  $psi.EnvironmentVariables['EASY_BENCH_REPO']=$Repo
  $psi.EnvironmentVariables['EASY_BENCH_RUN']=$run
  $psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
  $commit=git -C $Repo rev-parse HEAD
  Event 'launch-start' @{logicalProcessors=[Environment]::ProcessorCount;repo=$Repo;rounds=$Rounds;commit=$commit;sampler='causal-creation-v2';samplerSha256=(Get-FileHash -LiteralPath (Join-Path $Repo 'scripts\performance\process-sampler.cs') -Algorithm SHA256).Hash}
  $process=[Diagnostics.Process]::Start($psi)
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  [BenchNative]::Start($process.Id,(Join-Path $run 'resources.csv'))
  if(!(WaitEvent 'document-ready')) {throw 'App did not initialize'}
  Event 'idle-before-start';Start-Sleep -Seconds $IdleSeconds;Event 'idle-before-end'
  $trials=@()
  $chinese='"\u771f\u5b9e\u53d6\u8bcd\u6d4b\u8bd5"'|ConvertFrom-Json
  for($round=1;$round -le $Rounds;$round++) {
    $order=if($round%2) {@('original','forms')} else {@('forms','original')}
    foreach($variant in $order) {
      $text=if($round%2) {'Selection experiment round '+$round+'.'} else {$chinese+' '+$round}
      $trials+=@{id=$variant+'-selected-'+$round;variant=$variant;text=$text;same=($round%3 -eq 0);empty=$false;failure=$false}
    }
  }
  for($repeat=1;$repeat -le 2;$repeat++) {
    foreach($variant in @('original','forms')) {
      $trials+=@{id=$variant+'-empty-'+$repeat;variant=$variant;text='No selection fixture';same=$false;empty=$true;failure=$false}
      $trials+=@{id=$variant+'-failure-'+$repeat;variant=$variant;text='Failure fixture';same=$false;empty=$false;failure=$true}
    }
  }
  foreach($trial in $trials) {
    $readyPath=Join-Path $run 'source-ready.json'
    if(Test-Path -LiteralPath $readyPath) {Remove-Item -LiteralPath $readyPath}
    [IO.File]::WriteAllText((Join-Path $run 'source-command.json'),($trial|ConvertTo-Json -Compress))
    $deadline=[DateTime]::UtcNow.AddSeconds(5)
    while(!(Test-Path -LiteralPath $readyPath) -and [DateTime]::UtcNow -lt $deadline) {Start-Sleep -Milliseconds 25}
    [BenchNative]::SetForegroundWindow([IntPtr]$sourceInfo.handle)|Out-Null
    Start-Sleep -Milliseconds 200
    [IO.File]::WriteAllText((Join-Path $run 'trial.json'),($trial|ConvertTo-Json -Compress))
    Event 'invoke-start' @{trial=$trial.id;variant=$trial.variant;empty=$trial.empty;failure=$trial.failure;same=$trial.same;foreground=[BenchNative]::GetForegroundWindow().ToInt64();sourceWindow=$sourceInfo.handle}
    [BenchNative]::AltQ()
    $captured=WaitEvent 'selection-end' $trial.id 5000
    $result=$null
    if(!$trial.empty -and !$trial.failure -and $captured.textMatches) {$result=WaitEvent 'dom-result' $trial.id 5000}
    Event 'invoke-end' @{trial=$trial.id;captured=[bool]$captured;dom=[bool]$result}
    Start-Sleep -Milliseconds 500
  }
  Event 'idle-after-start';Start-Sleep -Seconds $IdleSeconds;Event 'idle-after-end'
  $historyPath=Join-Path $run '.translate-app.history.json'
  if(Test-Path -LiteralPath $historyPath) {
    $items=Get-Content -LiteralPath $historyPath -Raw -Encoding UTF8|ConvertFrom-Json
    Event 'history' @{count=@($items).Count;allSynthetic=(@($items|Where-Object {$_.dst -notlike 'BENCH_TRANSLATED:*'}).Count -eq 0)}
  }
  [IO.File]::WriteAllText((Join-Path $run 'stop'),'stop')
  if(!$process.WaitForExit(5000)) {$process.Kill()}
  [BenchNative]::Stop()
  [IO.File]::WriteAllText((Join-Path $run 'stdout.txt'),$stdout.Result)
  [IO.File]::WriteAllText((Join-Path $run 'stderr.txt'),$stderr.Result)
  [IO.File]::WriteAllText((Join-Path $run 'source-command.json'),'{"action":"stop"}')
  if(!$source.WaitForExit(5000)) {Stop-Process -Id $source.Id}
  Event 'run-end' @{exitCode=$process.ExitCode}
} finally {
  [BenchNative]::Stop()
  if($process -and !$process.HasExited) {$process.Kill()}
  if($source -and !$source.HasExited) {Stop-Process -Id $source.Id}
  try {[System.Windows.Forms.Clipboard]::SetDataObject($saved,$true);Event 'outer-clipboard-restored' @{ok=$true}} catch {Event 'outer-clipboard-restored' @{ok=$false}}
}
