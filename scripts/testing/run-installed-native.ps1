param([Parameter(Mandatory=$true)][string]$Exe,[Parameter(Mandatory=$true)][string]$Run,[Parameter(Mandatory=$true)][string]$Source,[switch]$CaptureOnly,[switch]$MouseOnly,[switch]$PostStartup)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'installed-file-protocol.ps1')
$controller=Join-Path $PSScriptRoot 'installed-product.cjs'
if(Test-Path -LiteralPath $Run){throw 'Choose a fresh output; never overwrite observations'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class InstalledNative {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
 public static RECT Bounds(long hwnd){RECT r; GetWindowRect(new IntPtr(hwnd),out r);return r;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; public POINT(int x,int y){this.x=x;this.y=y;} }
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
 public static long Hit(int x,int y){return WindowFromPoint(new POINT(x,y)).ToInt64();}
 public static bool OwnPoint(int x,int y,long expected){IntPtr h=WindowFromPoint(new POINT(x,y));while(h!=IntPtr.Zero){if(h.ToInt64()==expected)return true;h=GetParent(h);}return false;}
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 public static void AltQ(){keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x51,0,0,UIntPtr.Zero);keybd_event(0x51,0,2,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);}
}
'@
[InstalledNative]::SetThreadDpiAwarenessContext([IntPtr](-4))|Out-Null
$saved=New-Object Windows.Forms.DataObject
$original=[Windows.Forms.Clipboard]::GetDataObject()
if($original){foreach($format in $original.GetFormats($false)){try{$saved.SetData($format,$original.GetData($format,$false))}catch{throw 'Outer clipboard snapshot failed; native probe cancelled before launch'}}}
$script:commandId=0;$script:process=$null;$script:sourceProcess=$null
$report=@{pass=$false;trials=@();native=@{};outerClipboardRestored=$false}
function Wait-Condition([scriptblock]$Condition,[int]$Timeout=10000){
 $clock=[Diagnostics.Stopwatch]::StartNew()
 while($clock.ElapsedMilliseconds -lt $Timeout){if(Test-Path -LiteralPath (Join-Path $Run 'safety-abort.json')){throw 'Unexpected selection: safety guard aborted before transport/history'};if(&$Condition){return};Start-Sleep -Milliseconds 30}
 throw 'Native condition timed out'
}
function Command($Value){
 $script:commandId++;$Value.id=$script:commandId
 Write-OwnedText (Join-Path $Run 'native-command.json') ($Value|ConvertTo-Json -Depth 8 -Compress)
 Wait-Condition {if(Test-Path -LiteralPath (Join-Path $Run 'native-response.json')){try{([IO.File]::ReadAllText((Join-Path $Run 'native-response.json'))|ConvertFrom-Json).id -eq $script:commandId}catch{$false}}}
 $answer=[IO.File]::ReadAllText((Join-Path $Run 'native-response.json'))|ConvertFrom-Json
 if($answer.error){throw $answer.error};return $answer.value
}
function Eval([string]$Expression){Command @{action='eval';expression=$Expression}}
function Mouse-Drag([int]$X,[int]$Y,[int]$Dx,[int]$Dy,[long]$OwnedHwnd){
 if(![InstalledNative]::OwnPoint($X,$Y,$OwnedHwnd)){throw 'Mouse target is not owned fixture/product HWND; no click issued'}
 [InstalledNative]::SetCursorPos($X,$Y)|Out-Null;Start-Sleep -Milliseconds 100
 if(![InstalledNative]::OwnPoint($X,$Y,$OwnedHwnd)){throw 'Mouse ownership changed before button down; no click issued'}
 [InstalledNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 100
 for($step=1;$step -le 8;$step++){[InstalledNative]::SetCursorPos(($X+[int]($Dx*$step/8)),($Y+[int]($Dy*$step/8)))|Out-Null;Start-Sleep -Milliseconds 35}
 [InstalledNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 250
}
try{
 # Start controller first but keep the actual executable paused until native source exists.
 $psi=New-Object Diagnostics.ProcessStartInfo
 $mode=if($MouseOnly){'mouse'}elseif($PostStartup){'native-post-startup'}else{'native'}
 $psi.FileName=(Get-Command node).Source;$psi.Arguments='"'+$controller+'" "'+$Exe+'" "'+$Run+'" '+$mode+' "'+$Source+'"'
 $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 $script:process=[Diagnostics.Process]::Start($psi)
 $out=$script:process.StandardOutput.ReadToEndAsync();$err=$script:process.StandardError.ReadToEndAsync()
 Wait-Condition {Test-Path -LiteralPath $Run}
 if(!$MouseOnly){
 if($PostStartup){Wait-Condition {Test-Path -LiteralPath (Join-Path $Run 'controller-ready.json')}}
 $script:sourceProcess=Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-Sta','-File',(Join-Path $PSScriptRoot 'installed-native-source.ps1'),'-Run',$Run) -PassThru
 Wait-Condition {Test-Path -LiteralPath (Join-Path $Run 'source-window.json')}
 $sourceInfo=[IO.File]::ReadAllText((Join-Path $Run 'source-window.json'))|ConvertFrom-Json
  # Windows may deny background SetForegroundWindow. Click only the known fixture,
  # then select text and prove foreground before allowing the product to start.
  $physical=[InstalledNative]::Bounds($sourceInfo.handle)
  [InstalledNative]::SetWindowPos([IntPtr]$sourceInfo.handle,[IntPtr](-1),0,0,0,0,0x53)|Out-Null
  if(![InstalledNative]::OwnPoint(($physical.left+150),($physical.top+110),$sourceInfo.handle)){throw 'Source mouse target is not the owned fixture HWND; no click issued'}
  [InstalledNative]::SetCursorPos(($physical.left+150),($physical.top+110))|Out-Null
  [InstalledNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[InstalledNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 300
  Write-OwnedText (Join-Path $Run 'source-command.json') '{"id":"initial","text":"INSTALLED_NATIVE","empty":false}'
  Wait-Condition {if(Test-Path -LiteralPath (Join-Path $Run 'source-ready.json')){([IO.File]::ReadAllText((Join-Path $Run 'source-ready.json'))|ConvertFrom-Json).id -eq 'initial'}}
  Start-Sleep -Milliseconds 200
  $prepared=Get-Content -LiteralPath (Join-Path $Run 'source-samples.jsonl') -Tail 1|ConvertFrom-Json
  if(!$prepared.expectedSelection -or $prepared.selectionLength -ne 16){throw 'Initial native selection not established; product not launched'}
  [InstalledNative]::SetWindowPos([IntPtr]$sourceInfo.handle,[IntPtr](-2),0,0,0,0,0x13)|Out-Null
  if([InstalledNative]::GetForegroundWindow().ToInt64() -ne $sourceInfo.handle){throw 'Initial real fixture click failed to establish foreground; product not launched'}
  $foregroundStart=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  [IO.File]::WriteAllText((Join-Path $Run 'native-source-foreground.json'),(@{t=$foregroundStart;handle=$sourceInfo.handle}|ConvertTo-Json -Compress))
 Wait-Condition {Test-Path -LiteralPath (Join-Path $Run 'controller-ready.json')}
 $ready=Get-Item -LiteralPath (Join-Path $Run 'controller-ready.json')
 $samples=Get-Content -LiteralPath (Join-Path $Run 'source-samples.jsonl')|ForEach-Object{$_|ConvertFrom-Json}
  $initial=@($samples|Where-Object{$_.t -ge $foregroundStart -and $_.t -le ([DateTimeOffset]$ready.LastWriteTimeUtc).ToUnixTimeMilliseconds()})
  $prewarmStable=$initial.Count -gt 0 -and @($initial|Where-Object{$_.foreground -ne $_.expected -or !$_.expectedSelection}).Count -eq 0
  $report.native.prewarmForegroundStable=$prewarmStable
  $report.native.scope=if($CaptureOnly){'Post-startup native capture and mouse features only; initial inspector launch focus is separately recorded and is not an acceptance pass'}else{'Native capture plus inspector startup focus'}
  if($PostStartup){$report.native.Remove('prewarmForegroundStable');$report.native.scope='Post-startup native capture; source created after product ready. Initial startup/selection failures remain separate'}
  if(!$prewarmStable -and !$CaptureOnly -and !$PostStartup){throw 'Hidden startup/prewarm changed native source foreground or selection'}
 $report.native.prewarmForegroundSamples=$initial.Count
 foreach($trial in @(@{id='selected';text='INSTALLED_NATIVE';clipboard='BEFORE_NATIVE';empty=$false;failure=$false},@{id='same';text='SAME_AS_CLIPBOARD';clipboard='SAME_AS_CLIPBOARD';empty=$false;failure=$false},@{id='empty';text='NO_SELECTED_TEXT';clipboard='OLD_CLIPBOARD_MUST_NOT_TRANSLATE';empty=$true;failure=$false},@{id='failure';text='COPY_COMMAND_FAIL';clipboard='FAILURE_RESTORE';empty=$false;failure=$true})){
  Eval 'globalThis.__installedValidation.electron.BrowserWindow.getAllWindows().forEach(w=>w.hide()); true'|Out-Null
  Command @{action='clipboard';text=$trial.clipboard}|Out-Null
  Command @{action='fail';value=$trial.failure}|Out-Null
  Command @{action='expected';text=$trial.text}|Out-Null
  [InstalledNative]::SetWindowPos([IntPtr]$sourceInfo.handle,[IntPtr](-1),0,0,0,0,0x53)|Out-Null
  $physical=[InstalledNative]::Bounds($sourceInfo.handle);$sx=$physical.left+150;$sy=$physical.top+110
  if(![InstalledNative]::OwnPoint($sx,$sy,$sourceInfo.handle)){throw 'Capture source mouse target not owned; no click issued'}
  [InstalledNative]::SetCursorPos($sx,$sy)|Out-Null;[InstalledNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[InstalledNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 200
  Write-OwnedText (Join-Path $Run 'source-command.json') ($trial|ConvertTo-Json -Compress)
  Wait-Condition {if(Test-Path -LiteralPath (Join-Path $Run 'source-ready.json')){([IO.File]::ReadAllText((Join-Path $Run 'source-ready.json'))|ConvertFrom-Json).id -eq $trial.id}}
  [InstalledNative]::SetForegroundWindow([IntPtr]$sourceInfo.handle)|Out-Null;Start-Sleep -Milliseconds 300
  [InstalledNative]::SetWindowPos([IntPtr]$sourceInfo.handle,[IntPtr](-2),0,0,0,0,0x13)|Out-Null
  if([InstalledNative]::GetForegroundWindow().ToInt64() -ne $sourceInfo.handle){throw 'Source was not actually foreground before Alt+Q'}
  $selected=Get-Content -LiteralPath (Join-Path $Run 'source-samples.jsonl') -Tail 1|ConvertFrom-Json
  $expectedText=if($trial.empty){''}else{$trial.text}
  if(!$selected.expectedSelection -or $selected.foreground -ne $sourceInfo.handle -or $selected.keyboardFocus -ne $selected.expectedFocus){throw 'Native selection/foreground/keyboard focus precondition failed before Alt+Q'}
  $began=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();[InstalledNative]::AltQ()
  $script:capture=$null
  Wait-Condition {$rows=Get-Content -LiteralPath (Join-Path $Run 'events.jsonl')|ForEach-Object{try{$_|ConvertFrom-Json}catch{}};$found=@($rows|Where-Object{$_.event -eq 'selection-result' -and $_.t -ge $began});if($found.Count){$script:capture=$found[-1];$true}else{$false}} 10000
  if(!$script:capture.restored){throw ('Four-format clipboard restore failed: '+$trial.id)}
  $correct=if($trial.empty -or $trial.failure){$script:capture.result.text -eq ''}else{$script:capture.result.text -eq $trial.text}
  if($trial.failure -and $script:capture.result.reason -ne 'copy-command-failed'){$correct=$false}
  $observed=Eval 'globalThis.__installedValidation.ui("({src:document.querySelector(\".src-text\")?.textContent,dst:document.querySelector(\".dst-text\")?.textContent,empty:!!document.querySelector(\".empty-state\")})")'
  if($correct -and !$trial.empty -and !$trial.failure){
   Wait-Condition {(Eval 'globalThis.__installedValidation.ui("document.querySelector(\".dst-text\")?.textContent")') -eq ($trial.text+' fast')}
  }elseif($trial.empty -or $trial.failure){Wait-Condition {Eval 'globalThis.__installedValidation.ui("!!document.querySelector(\".empty-state\")")'}}
  $report.trials+=@{id=$trial.id;pass=$correct;result=$script:capture.result;clipboard=$script:capture.clipboard;restored=$true;foregroundBefore=$sourceInfo.handle;keyboardFocus=$selected.keyboardFocus;expectedFocus=$selected.expectedFocus;guiFlags=$selected.guiFlags;altDown=$selected.altDown;ctrlDown=$selected.ctrlDown;shiftDown=$selected.shiftDown;trigger=$began;captureEnd=$script:capture.t}
 }
 }else{
  Wait-Condition {Test-Path -LiteralPath (Join-Path $Run 'controller-ready.json')}
  $report.native.scope='Independent actual native mouse drag and resize; capture cases not attempted'
 }
 Command @{action='fail';value=$false}|Out-Null
 if(!$PostStartup){
 Eval 'globalThis.__installedValidation.window("popup").webContents.send("translate:trigger",{text:"NATIVE_DRAG",ts:Date.now()}); globalThis.__installedValidation.window("popup").show(); globalThis.__installedValidation.window("popup").focus(); true'|Out-Null
 Wait-Condition {(Eval 'globalThis.__installedValidation.ui("document.querySelector(\".dst-text\")?.textContent")') -eq 'NATIVE_DRAG fast'}
 Eval 'globalThis.__installedValidation.ui("document.querySelector(\".popup-actions button\").click()")'|Out-Null
 Wait-Condition {Eval 'globalThis.__installedValidation.ui("window.api.popupReady().then(state=>state.pinned)")'}
 Eval 'globalThis.__installedValidation.window("popup").show();globalThis.__installedValidation.window("popup").focus();true'|Out-Null
 Wait-Condition {Eval 'globalThis.__installedValidation.window("popup").isVisible() && globalThis.__installedValidation.window("popup").isFocused() && globalThis.__installedValidation.window("popup").isAlwaysOnTop()'}
 $before=Eval 'globalThis.__installedValidation.window("popup").getBounds()'
  $popupHwnd=Eval 'globalThis.__installedValidation.window("popup").getNativeWindowHandle().readBigUInt64LE().toString()'
  $popupPhysical=[InstalledNative]::Bounds([long]$popupHwnd)
  $head=Eval 'globalThis.__installedValidation.ui("(()=>{const r=document.querySelector(\".popup-head\").getBoundingClientRect();return {top:r.top,height:r.height}})()")'
  $scale=($popupPhysical.right-$popupPhysical.left)/$before.width
  $headerX=[int](($popupPhysical.left+$popupPhysical.right)/2)
  $headerY=$popupPhysical.top+[int](($head.top+$head.height/2)*$scale)
  $report.native.mouseAttempt=@{hwnd=$popupHwnd;physicalBounds=$popupPhysical;electronBounds=$before;scale=$scale;header=@{x=$headerX;y=$headerY};foreground=[InstalledNative]::GetForegroundWindow().ToInt64();targetHit=[InstalledNative]::Hit($headerX,$headerY);scope='Pinned visible focused popup; header point derived from DOM and native physical scale'}
  Eval 'globalThis.__installedValidation.window("popup").capturePage().then(img=>globalThis.__installedValidation.fs.writeFileSync(globalThis.__installedValidation.path.join(globalThis.__installedValidation.run,"native-before-mouse.png"),img.toPNG()))'|Out-Null
  Mouse-Drag $headerX $headerY 105 80 ([long]$popupHwnd)
 $after=Eval 'globalThis.__installedValidation.window("popup").getBounds()'
 if($after.x -eq $before.x -and $after.y -eq $before.y){throw 'Actual mouse header drag did not move native window'}
 $report.native.drag=@{before=$before;after=$after;input='actual user32 mouse events'}
  $popupPhysical=[InstalledNative]::Bounds([long]$popupHwnd)
  Mouse-Drag ($popupPhysical.right-2) ($popupPhysical.bottom-2) 95 75 ([long]$popupHwnd)
 $resized=Eval 'globalThis.__installedValidation.window("popup").getBounds()'
 if($resized.width -eq $after.width -and $resized.height -eq $after.height){throw 'Actual mouse edge resize did not resize native window'}
 $report.native.resize=@{before=$after;after=$resized;input='actual user32 mouse events'}
 Eval 'globalThis.__installedValidation.window("popup").capturePage().then(img=>globalThis.__installedValidation.fs.writeFileSync(globalThis.__installedValidation.path.join(globalThis.__installedValidation.run,"native-visible.png"),img.toPNG()))'|Out-Null
 }
 $report.pass=@($report.trials|Where-Object{!$_.pass}).Count -eq 0
}catch{$report.error=$_.Exception.ToString()}
finally{
 if(Test-Path -LiteralPath $Run){[IO.File]::WriteAllText((Join-Path $Run 'native-done.json'),($report|ConvertTo-Json -Depth 10))}
 if($script:process){if(!$script:process.WaitForExit(7000)){Stop-Process -Id $script:process.Id};[IO.File]::WriteAllText((Join-Path $Run 'controller-stdout.txt'),$out.Result);[IO.File]::WriteAllText((Join-Path $Run 'controller-stderr.txt'),$err.Result)}
 if($script:sourceProcess){Write-OwnedText (Join-Path $Run 'source-command.json') '{"action":"stop"}';if(!$script:sourceProcess.WaitForExit(5000)){Stop-Process -Id $script:sourceProcess.Id}}
 try{[Windows.Forms.Clipboard]::SetDataObject($saved,$true);$report.outerClipboardRestored=$true}catch{$report.outerClipboardError=$_.Exception.Message;$report.pass=$false}
 if(Test-Path -LiteralPath $Run){[IO.File]::WriteAllText((Join-Path $Run 'native-driver.json'),($report|ConvertTo-Json -Depth 10))}
}
Write-Output ($report|ConvertTo-Json -Depth 10)
if(!$report.pass){exit 1}
