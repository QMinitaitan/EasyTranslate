param([Parameter(Mandatory=$true)][string]$Run)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'installed-file-protocol.ps1')
if(Test-Path -LiteralPath $Run){throw 'Preserve all previous diagnosis outputs'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CopyControlNative {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; public POINT(int a,int b){x=a;y=b;} }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int ht,uint flags);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 [DllImport("user32.dll")] public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);
 public static bool OwnPoint(int x,int y,long expected){IntPtr h=WindowFromPoint(new POINT(x,y));while(h!=IntPtr.Zero){if(h.ToInt64()==expected)return true;h=GetParent(h);}return false;}
 public static RECT Bounds(long h){RECT r;GetWindowRect(new IntPtr(h),out r);return r;}
 public static void AltQ(){keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x51,0,0,UIntPtr.Zero);keybd_event(0x51,0,2,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);}
}
'@
[CopyControlNative]::SetThreadDpiAwarenessContext([IntPtr](-4))|Out-Null
$saved=New-Object Windows.Forms.DataObject
$original=[Windows.Forms.Clipboard]::GetDataObject()
if($original){foreach($format in $original.GetFormats($false)){try{$saved.SetData($format,$original.GetData($format,$false))}catch{throw 'Outer clipboard snapshot failed before native launch'}}}
New-Item -ItemType Directory -Path $Run|Out-Null
$report=@{pass=$false;cases=@();outerClipboardRestored=$false;scope='Two fixed exact production helper controls; no Electron or product modules'}
$sourceProcess=$null
function Wait([scriptblock]$Check){$start=[Diagnostics.Stopwatch]::StartNew();while($start.ElapsedMilliseconds -lt 10000){if(&$Check){return};Start-Sleep -Milliseconds 30};throw 'Controlled fixture deadline'}
function Sample { Get-Content -LiteralPath (Join-Path $Run 'source-samples.jsonl') -Tail 1|ConvertFrom-Json }
try{
 $sourceProcess=Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-Sta','-File',(Join-Path $PSScriptRoot 'installed-native-source.ps1'),'-Run',$Run,'-RegisterAltQ') -PassThru
 Wait {Test-Path -LiteralPath (Join-Path $Run 'source-window.json')}
 $source=Get-Content -LiteralPath (Join-Path $Run 'source-window.json') -Raw|ConvertFrom-Json
 if(!$source.registeredAltQ){throw 'Standalone AltQ consumer not registered'}
 foreach($id in @('direct','after-altq')){
  [CopyControlNative]::SetWindowPos([IntPtr]$source.handle,[IntPtr](-1),0,0,0,0,0x53)|Out-Null
  $rect=[CopyControlNative]::Bounds($source.handle);$x=$rect.left+150;$y=$rect.top+110
  [CopyControlNative]::SetCursorPos($x,$y)|Out-Null
  if(![CopyControlNative]::OwnPoint($x,$y,$source.handle)){throw 'Not own fixture at mouse point; no click issued'}
  [CopyControlNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[CopyControlNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  Write-OwnedText (Join-Path $Run 'source-command.json') (@{id=$id;text='COPY_CONTROL_SYNTHETIC';empty=$false}|ConvertTo-Json -Compress)
  Wait {if(Test-Path -LiteralPath (Join-Path $Run 'source-ready.json')){(Get-Content -LiteralPath (Join-Path $Run 'source-ready.json') -Raw|ConvertFrom-Json).id -eq $id}}
  Start-Sleep -Milliseconds 150
  $before=Sample
  if([CopyControlNative]::GetForegroundWindow().ToInt64() -ne $source.handle -or !$before.expectedSelection){throw 'Own source foreground/selection missing before keyboard input'}
  [Windows.Forms.Clipboard]::SetText('BEFORE_'+$id)
  if($id -eq 'after-altq'){[CopyControlNative]::AltQ();Start-Sleep -Milliseconds 120}
  $launchSample=Sample
  if([CopyControlNative]::GetForegroundWindow().ToInt64() -ne $source.handle){throw 'Own source lost foreground before helper'}
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName='powershell.exe';$psi.Arguments='-NoProfile -NonInteractive -Sta -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(''^c'')"'
  $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  $keep=@{};foreach($name in @('SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','OS')){if($psi.EnvironmentVariables.ContainsKey($name)){$keep[$name]=$psi.EnvironmentVariables[$name]}}
  $psi.EnvironmentVariables.Clear();foreach($name in $keep.Keys){$psi.EnvironmentVariables[$name]=$keep[$name]}
  foreach($pair in @(@('HOME','home'),@('USERPROFILE','home'),@('APPDATA','appData'),@('LOCALAPPDATA','localAppData'),@('TEMP','temp'),@('TMP','temp'))){$dir=Join-Path $Run $pair[1];New-Item -ItemType Directory -Path $dir -Force|Out-Null;$psi.EnvironmentVariables[$pair[0]]=$dir}
  $clock=[Diagnostics.Stopwatch]::StartNew();$helper=[Diagnostics.Process]::Start($psi);$out=$helper.StandardOutput.ReadToEndAsync();$err=$helper.StandardError.ReadToEndAsync()
  if(!$helper.WaitForExit(2500)){Stop-Process -Id $helper.Id;throw 'Exact copy helper timed out'}
  Start-Sleep -Milliseconds 200
  $copied=[Windows.Forms.Clipboard]::GetText() -eq 'COPY_CONTROL_SYNTHETIC'
  $after=Sample
  $report.cases+=@{id=$id;copiedExpectedSynthetic=$copied;helperExit=$helper.ExitCode;elapsedMs=$clock.ElapsedMilliseconds;stdoutLength=$out.Result.Length;stderrLength=$err.Result.Length;launch=@{keyboardFocus=$launchSample.keyboardFocus;expectedFocus=$source.textbox;focusOwnTextBox=($launchSample.keyboardFocus -eq $source.textbox);guiFlags=$launchSample.guiFlags;altDown=$launchSample.altDown;ctrlDown=$launchSample.ctrlDown;shiftDown=$launchSample.shiftDown};after=@{focusOwnTextBox=($after.keyboardFocus -eq $source.textbox);guiFlags=$after.guiFlags;foregroundOwned=($after.foreground -eq $source.handle)}}
 }
 $report.pass=@($report.cases|Where-Object{!$_.copiedExpectedSynthetic -or $_.helperExit -ne 0}).Count -eq 0
}catch{$report.error=$_.Exception.Message}
finally{
 if($sourceProcess){Write-OwnedText (Join-Path $Run 'source-command.json') '{"action":"stop"}';if(!$sourceProcess.WaitForExit(5000)){Stop-Process -Id $sourceProcess.Id}}
 try{[Windows.Forms.Clipboard]::SetDataObject($saved,$true);$report.outerClipboardRestored=$true}catch{$report.outerClipboardError=$_.Exception.Message;$report.pass=$false}
 [IO.File]::WriteAllText((Join-Path $Run 'summary.json'),($report|ConvertTo-Json -Depth 8))
}
Write-Output ($report|ConvertTo-Json -Depth 8)
if(!$report.pass){exit 1}
