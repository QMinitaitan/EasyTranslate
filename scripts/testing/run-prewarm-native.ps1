param([ValidateSet('focus','queue')][string]$Mode='focus',[string]$Repo='', [string]$OutputRoot='')
$ErrorActionPreference='Stop'
if (!$Repo) {$Repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)}
if (!$OutputRoot) {$OutputRoot=Join-Path $Repo '.runtime'}
$run=Join-Path $OutputRoot ('prewarm-native-'+$Mode+'-'+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
New-Item -ItemType Directory -Path $run -Force | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PrewarmNative {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 public static void Shortcut(){keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x51,0,0,UIntPtr.Zero);keybd_event(0x51,0,2,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);}
}
'@
$saved=New-Object System.Windows.Forms.DataObject
$original=[System.Windows.Forms.Clipboard]::GetDataObject()
if($original){foreach($format in $original.GetFormats($false)){try{$saved.SetData($format,$original.GetData($format,$false))}catch{}}}
$providers=@{}
foreach($id in @('deepseek','openai','bing','google','deepl','youdao','tencent','caiyun','baidu')){$providers[$id]=@{enabled=$false;apiKey=''}}
$providers.openai=@{enabled=$true;apiKey='SYNTHETIC';model='controlled';endpoint='https://prewarm.invalid'}
[IO.File]::WriteAllText((Join-Path $run '.translate-app.config.json'),(@{providers=$providers;raceMode=$false;launchToTray=$true}|ConvertTo-Json -Depth 5))
$form=New-Object System.Windows.Forms.Form
$form.Text='EasyTranslate isolated prewarm source'
$form.Width=600;$form.Height=200;$form.StartPosition='CenterScreen'
$box=New-Object System.Windows.Forms.TextBox
$box.Multiline=$true;$box.Dock='Fill';$box.Text='PREWARM_A';$form.Controls.Add($box)
$script:phase='start';$script:records=@();$script:process=$null;$script:success=$false;$script:readyAt=$null
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=25
$form.add_Shown({
 $form.Activate();$box.Focus()|Out-Null;$box.SelectAll();[PrewarmNative]::SetForegroundWindow($form.Handle)|Out-Null
 $script:expected=$form.Handle.ToInt64()
 $psi=New-Object Diagnostics.ProcessStartInfo
 $psi.FileName=Join-Path $Repo 'node_modules\electron\dist\electron.exe'
 $psi.Arguments='"'+(Join-Path $PSScriptRoot 'prewarm-native.cjs')+'" --hidden'
 $psi.WorkingDirectory=$Repo;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 $psi.EnvironmentVariables['HOME']=$run;$psi.EnvironmentVariables['USERPROFILE']=$run
 $psi.EnvironmentVariables['EASY_PREWARM_ROOT']=$Repo;$psi.EnvironmentVariables['EASY_PREWARM_OUTPUT']=$run;$psi.EnvironmentVariables['EASY_PREWARM_MODE']=$Mode
 $psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
 $script:start=[DateTime]::UtcNow
 $script:process=[Diagnostics.Process]::Start($psi)
 $script:stdout=$script:process.StandardOutput.ReadToEndAsync();$script:stderr=$script:process.StandardError.ReadToEndAsync()
 $timer.Start()
})
$timer.add_Tick({
 try {
  if($script:process.HasExited){throw ('native app exited unexpectedly: '+$script:process.ExitCode)}
  if(([DateTime]::UtcNow-$script:start).TotalSeconds -gt 22){throw 'native fixture deadline'}
  $events=@()
  $eventsFile=Join-Path $run 'events.jsonl'
  if(Test-Path -LiteralPath $eventsFile){$events=@(Get-Content -LiteralPath $eventsFile -Encoding UTF8|ForEach-Object{try{$_|ConvertFrom-Json}catch{}})}
  $foreground=[PrewarmNative]::GetForegroundWindow().ToInt64()
  if($script:phase -eq 'start'){
   $script:records+=@{t=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();foreground=$foreground;expected=$script:expected;selection=$box.SelectedText}
   $ready=@(if($Mode -eq 'focus'){$events|Where-Object{$_.event -eq 'popup-app-ready'}}else{$events|Where-Object{$_.event -eq 'popup-config-wait'}})
   if($ready.Count -gt 0 -and !$script:readyAt){$script:readyAt=[DateTime]::UtcNow}
   if($script:readyAt -and ([DateTime]::UtcNow-$script:readyAt).TotalMilliseconds -ge 500){
    if(@($script:records|Where-Object{$_.foreground -ne $_.expected -or $_.selection -ne 'PREWARM_A'}).Count -gt 0){throw 'prewarm changed foreground or selected text'}
    if([System.Windows.Forms.Clipboard]::GetText() -ne 'PREWARM_CLIPBOARD'){throw 'prewarm changed clipboard'}
    if(@($events|Where-Object{$_.event -in @('window-show','window-focus')}).Count -gt 0){throw 'hidden startup/prewarm showed or focused a window'}
    $script:phase='capture-a';[PrewarmNative]::Shortcut()
   }
  } elseif($script:phase -eq 'capture-a' -and $Mode -eq 'queue' -and @($events|Where-Object{$_.event -eq 'selection'}).Count -ge 1){
   if(@($events|Where-Object{$_.event -eq 'popup-app-ready'}).Count -gt 0){throw 'queue fixture did not capture before application ready'}
   if($foreground -ne $script:expected){throw 'popup stole focus before the queued second capture'}
   $box.Text='PREWARM_B';$box.SelectAll();$script:preparedAt=[DateTime]::UtcNow;$script:phase='prepared-b'
  } elseif($script:phase -eq 'prepared-b' -and ([DateTime]::UtcNow-$script:preparedAt).TotalMilliseconds -ge 200){
   if($foreground -ne $script:expected -or $box.SelectedText -ne 'PREWARM_B'){throw 'queued second capture lost its original selection'}
   $script:phase='capture-b';[PrewarmNative]::Shortcut()
  }
  if(Test-Path -LiteralPath (Join-Path $run 'result.json')){
   $captures=@($events|Where-Object{$_.event -eq 'selection'})
   if(@($captures|Where-Object{!$_.restored}).Count -gt 0){throw 'clipboard was not restored after capture'}
   $result=Get-Content -LiteralPath (Join-Path $run 'result.json') -Raw|ConvertFrom-Json
   $summary=@{pass=$true;mode=$Mode;prewarmForegroundStable=$true;prewarmSelectionStable=$true;prewarmClipboardStable=$true;foregroundSamples=$script:records.Count;captureCount=$captures.Count;allClipboardRestored=$true;application=$result}
   [IO.File]::WriteAllText((Join-Path $run 'native-result.json'),($summary|ConvertTo-Json -Depth 8))
   $script:success=$true;$form.Close()
  }
 } catch {
  [IO.File]::WriteAllText((Join-Path $run 'native-error.txt'),$_.Exception.ToString());$form.Close()
 }
})
try{[System.Windows.Forms.Application]::Run($form)}finally{
 $timer.Stop();$timer.Dispose()
 [IO.File]::WriteAllText((Join-Path $run 'foreground.json'),($script:records|ConvertTo-Json -Depth 4))
 [IO.File]::WriteAllText((Join-Path $run 'stop'),'stop')
 if($script:process){
  $natural=$script:process.WaitForExit(5000)
  if(!$natural){$script:process.Kill();$script:process.WaitForExit()}
  [IO.File]::WriteAllText((Join-Path $run 'stdout.txt'),$script:stdout.Result);[IO.File]::WriteAllText((Join-Path $run 'stderr.txt'),$script:stderr.Result)
  [IO.File]::WriteAllText((Join-Path $run 'shutdown.json'),(@{naturalExit=$natural;exitCode=$script:process.ExitCode}|ConvertTo-Json))
  if(!$natural -or $script:process.ExitCode -ne 0){$script:success=$false}
 }
 try{[System.Windows.Forms.Clipboard]::SetDataObject($saved,$true)}catch{}
}
Write-Output ('Native prewarm '+$Mode+': '+$script:success+'; '+$run)
if(!$script:success){exit 1}
