$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$profile=Join-Path $repo ('.runtime\settings-popup-native-'+[Guid]::NewGuid().ToString('N'))
$entry=Join-Path $repo 'scripts\testing\settings-popup-native.cjs'
$exe=Join-Path $repo 'node_modules\electron\dist\electron.exe'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EasyFixtureMessage {
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll", SetLastError=true)]
 public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
 public static bool CaptionDoubleClick(long handle, int x, int y) {
   long packed=((long)(y & 65535)<<16) | (long)(x & 65535);
   IntPtr result;
   // Prevent Windows from scaling our physical LPARAM coordinates a second time.
   IntPtr oldContext=SetThreadDpiAwarenessContext(new IntPtr(-4));
   try { return SendMessageTimeout(new IntPtr(handle), 0x00A3, new IntPtr(2), new IntPtr(packed), 2, 3000, out result)!=IntPtr.Zero; }
   finally { if(oldContext!=IntPtr.Zero)SetThreadDpiAwarenessContext(oldContext); }
 }
}
'@
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=$exe
$start.Arguments='"'+$entry+'" --profile "'+$profile+'"'
$start.WorkingDirectory=$repo
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
foreach($name in @($start.EnvironmentVariables.Keys)) {
 if($name -match '(?i)key|token|secret|password|credential|authorization|^(NODE_OPTIONS|NODE_PATH|VITE_DEV_SERVER_URL|ELECTRON_.+|LD_PRELOAD|DYLD_.+|PYTHONPATH)$') {$start.EnvironmentVariables.Remove($name)}
}
New-Item -ItemType Directory -Path $profile | Out-Null
foreach($name in @('HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP')) {$start.EnvironmentVariables[$name]=$profile}
$child=[Diagnostics.Process]::Start($start)
$stdout=$child.StandardOutput.ReadToEndAsync()
$stderr=$child.StandardError.ReadToEndAsync()
$clock=[Diagnostics.Stopwatch]::StartNew()
$sentFooter=$false
$sentHeader=$false
try {
 while(!$child.HasExited -and $clock.Elapsed.TotalSeconds -lt 45) {
  $statePath=Join-Path $profile 'state.json'
  if(Test-Path -LiteralPath $statePath) {
   $state=[IO.File]::ReadAllText($statePath) | ConvertFrom-Json
   if($state.stage -eq 'ready' -and !$sentFooter) {
    if(![EasyFixtureMessage]::CaptionDoubleClick([long]$state.hwnd,[int]$state.coordinates.footer.x,[int]$state.coordinates.footer.y)){throw 'Fixture footer message failed'}
    [IO.File]::WriteAllText((Join-Path $profile 'command.json'),'{"stage":"footer-sent"}')
    $sentFooter=$true
   } elseif($state.stage -eq 'footer-verified' -and !$sentHeader) {
    if(![EasyFixtureMessage]::CaptionDoubleClick([long]$state.hwnd,[int]$state.coordinates.header.x,[int]$state.coordinates.header.y)){throw 'Fixture header message failed'}
    [IO.File]::WriteAllText((Join-Path $profile 'command.json'),'{"stage":"header-sent"}')
    $sentHeader=$true
   }
  }
  Start-Sleep -Milliseconds 40
 }
 if(!$child.HasExited){throw 'Fixture controller deadline'}
 $child.WaitForExit()
 $output=$stdout.Result
 $errors=$stderr.Result
 if(Test-Path -LiteralPath $profile) {
   [IO.File]::WriteAllText((Join-Path $profile 'stdout.log'),$output)
   [IO.File]::WriteAllText((Join-Path $profile 'stderr.log'),$errors)
 }
 $result=Get-Content -Raw -LiteralPath (Join-Path $profile 'state.json') | ConvertFrom-Json
 $result | ConvertTo-Json -Depth 5
 Write-Output ('Fixture profile: '+$profile)
 if($child.ExitCode -ne 0 -or $result.pass -ne $true){throw 'Native validation did not pass'}
} finally {
 if(!$child.HasExited){$child.Kill();$child.WaitForExit()}
 $child.Dispose()
}
