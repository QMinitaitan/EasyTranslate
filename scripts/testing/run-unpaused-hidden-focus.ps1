param([Parameter(Mandatory=$true)][string]$Exe,[Parameter(Mandatory=$true)][string]$Run)
$ErrorActionPreference='Stop'
throw 'Historical unpaused native runner disabled: no pre-import transport interception. Existing raw evidence is retained; use guarded validation.'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class HiddenFocusNative {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; public POINT(int x,int y){this.x=x;this.y=y;} }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 public static RECT Bounds(long hwnd){RECT r;GetWindowRect(new IntPtr(hwnd),out r);return r;}
 public static bool OwnPoint(int x,int y,long expected){IntPtr h=WindowFromPoint(new POINT(x,y));while(h!=IntPtr.Zero){if(h.ToInt64()==expected)return true;h=GetParent(h);}return false;}
}
'@
[HiddenFocusNative]::SetThreadDpiAwarenessContext([IntPtr](-4))|Out-Null
function Wait-Condition([scriptblock]$Condition){$timer=[Diagnostics.Stopwatch]::StartNew();while($timer.ElapsedMilliseconds -lt 15000){if(&$Condition){return};Start-Sleep -Milliseconds 25};throw 'Unpaused hidden control deadline'}
$report=@{pass=$false;scope='Actual production EXE unpaused hidden startup; renderer CDP only, no Node inspector, no translation or clipboard operations'}
$controller=$null;$fixture=$null
try{
 if(Test-Path -LiteralPath $Run){throw 'Fresh output required'}
 $psi=New-Object Diagnostics.ProcessStartInfo
 $psi.FileName=(Get-Command node).Source;$psi.Arguments='"'+(Join-Path $PSScriptRoot 'installed-unpaused.cjs')+'" "'+$Exe+'" "'+$Run+'" hidden';$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 $controller=[Diagnostics.Process]::Start($psi);$out=$controller.StandardOutput.ReadToEndAsync();$err=$controller.StandardError.ReadToEndAsync()
 Wait-Condition {Test-Path -LiteralPath $Run}
 $fixture=Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-Sta','-File',(Join-Path $PSScriptRoot 'installed-native-source.ps1'),'-Run',$Run) -PassThru
 Wait-Condition {Test-Path -LiteralPath (Join-Path $Run 'source-window.json')}
 $info=Get-Content -LiteralPath (Join-Path $Run 'source-window.json') -Raw|ConvertFrom-Json
 [HiddenFocusNative]::SetWindowPos([IntPtr]$info.handle,[IntPtr](-1),0,0,0,0,0x53)|Out-Null
 $rect=[HiddenFocusNative]::Bounds($info.handle);$x=$rect.left+150;$y=$rect.top+110
 if(![HiddenFocusNative]::OwnPoint($x,$y,$info.handle)){throw 'Fixture hit test failed; no mouse input issued'}
 [HiddenFocusNative]::SetCursorPos($x,$y)|Out-Null;[HiddenFocusNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[HiddenFocusNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 300
 [IO.File]::WriteAllText((Join-Path $Run 'source-command.json'),'{"id":"initial","text":"INSTALLED_NATIVE","empty":false}')
 Wait-Condition {if(Test-Path -LiteralPath (Join-Path $Run 'source-ready.json')){(Get-Content -LiteralPath (Join-Path $Run 'source-ready.json') -Raw|ConvertFrom-Json).id -eq 'initial'}}
 Start-Sleep -Milliseconds 250
 [HiddenFocusNative]::SetWindowPos([IntPtr]$info.handle,[IntPtr](-2),0,0,0,0,0x13)|Out-Null
 $sample=Get-Content -LiteralPath (Join-Path $Run 'source-samples.jsonl') -Tail 1|ConvertFrom-Json
 if($sample.foreground -ne $info.handle -or $sample.selection -ne 'INSTALLED_NATIVE'){throw 'Actual foreground/selection precondition failed; product not started'}
 $start=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 [IO.File]::WriteAllText((Join-Path $Run 'native-source-foreground.json'),(@{t=$start;handle=$info.handle}|ConvertTo-Json -Compress))
 if(!$controller.WaitForExit(25000)){throw 'Unpaused controller did not terminate'}
 $application=Get-Content -LiteralPath (Join-Path $Run 'summary.json') -Raw -Encoding UTF8|ConvertFrom-Json
 $report.application=$application
 $samples=@(Get-Content -LiteralPath (Join-Path $Run 'source-samples.jsonl')|ForEach-Object{$_|ConvertFrom-Json}|Where-Object{$_.t -ge $start -and $_.t -le $application.hiddenObservationEnd})
 $bad=@($samples|Where-Object{$_.foreground -ne $_.expected -or $_.selection -ne 'INSTALLED_NATIVE'})
 $report.samples=$samples.Count;$report.focusAndSelectionStable=$samples.Count -gt 0 -and $bad.Count -eq 0;$report.failedSamples=$bad
 if(!$application.pass -or !$report.focusAndSelectionStable){throw 'Ordinary unpaused hidden startup focus/selection control failed'}
 $report.pass=$true
}catch{$report.error=$_.Exception.ToString()}
finally{
 if($fixture){[IO.File]::WriteAllText((Join-Path $Run 'source-command.json'),'{"action":"stop"}');if(!$fixture.WaitForExit(5000)){Stop-Process -Id $fixture.Id}}
 if($controller){if(!$controller.HasExited){Stop-Process -Id $controller.Id};[IO.File]::WriteAllText((Join-Path $Run 'controller-stdout.txt'),$out.Result);[IO.File]::WriteAllText((Join-Path $Run 'controller-stderr.txt'),$err.Result)}
 if(Test-Path -LiteralPath $Run){[IO.File]::WriteAllText((Join-Path $Run 'focus-result.json'),($report|ConvertTo-Json -Depth 10))}
}
Write-Output (@{pass=$report.pass;run=$Run;error=$report.error;samples=$report.samples;stable=$report.focusAndSelectionStable}|ConvertTo-Json)
if(!$report.pass){exit 1}
