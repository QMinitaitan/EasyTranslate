param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$InstallDir,[Parameter(Mandatory=$true)][string]$Run,[Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Production,[Parameter(Mandatory=$true)][string]$DailyBaseline,[switch]$Resume)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath('E:\EasyTranslate-implementation-notes-20261020\windows-final-validation')
$owned=[IO.Path]::GetFullPath($InstallDir)
if(!$owned.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase) -or !(Split-Path -Leaf $owned).StartsWith('EasyTranslateValidationPR12-')){throw 'Install directory is not an explicitly owned validation child'}
if(!$Resume -and ((Test-Path -LiteralPath $InstallDir) -or (Test-Path -LiteralPath $Run))){throw 'Use fresh install and evidence directories'}
if(!$Resume){New-Item -ItemType Directory -Path $Run|Out-Null}
$script:uninstaller=$null
$report=@{pass=$false;installDir=$owned;installer=$Installer;scope='Distinct validation installer metadata with byte-identical application payload; no production registration replacement'}
function Snapshot {
 $registry=@{}
 foreach($hive in @('HKCU:','HKLM:')){
  $base=$hive+'\Software\Microsoft\Windows\CurrentVersion\Uninstall'
  if(Test-Path -LiteralPath $base){foreach($key in Get-ChildItem -LiteralPath $base){
   $item=Get-ItemProperty -LiteralPath $key.PSPath
   if($item.DisplayName -in @('EasyTranslate','EasyTranslate PR12 Validation')){
    $values=[ordered]@{};foreach($name in $key.GetValueNames()){$values[$name]=$key.GetValue($name)}
    $registry[$key.Name]=$values
    $installKey=$hive+'\Software\'+$key.PSChildName
    if(Test-Path -LiteralPath $installKey){$ik=Get-Item -LiteralPath $installKey;$iv=[ordered]@{};foreach($name in $ik.GetValueNames()){$iv[$name]=$ik.GetValue($name)};$registry[$ik.Name]=$iv}
   }
  }}
 }
 $shortcuts=@{}
 foreach($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'),[Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms'))){
  foreach($name in @('EasyTranslate.lnk','EasyTranslate PR12 Validation.lnk','EasyTranslate\EasyTranslate.lnk','EasyTranslate PR12 Validation\EasyTranslate PR12 Validation.lnk')){
   $file=Join-Path $folder $name
   $shortcuts[$file]=if(Test-Path -LiteralPath $file){(Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash}else{$null}
  }
 }
 $daily=@{}
 foreach($file in @('D:\EasyTranslate\EasyTranslate.exe','D:\EasyTranslate\resources\app.asar')){$daily[$file]=(Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash}
 return @{registry=$registry;shortcuts=$shortcuts;daily=$daily}
}
function Canonical($Object){if($Object -is [System.Collections.IDictionary]){$ordered=[ordered]@{};foreach($key in @($Object.Keys|Sort-Object)){$ordered[$key]=Canonical $Object[$key]};return $ordered};return $Object}
function JsonEqual($A,$B){((Canonical $A)|ConvertTo-Json -Depth 15 -Compress) -eq ((Canonical $B)|ConvertTo-Json -Depth 15 -Compress)}
function ToHash($Object){if($Object -is [pscustomobject]){$h=@{};foreach($p in $Object.PSObject.Properties){$h[$p.Name]=ToHash $p.Value};return $h}else{return $Object}}
try{
 $before=if($Resume){ToHash (Get-Content -LiteralPath (Join-Path $Run 'before.json') -Raw|ConvertFrom-Json)}else{Snapshot}
 if(!$Resume){[IO.File]::WriteAllText((Join-Path $Run 'before.json'),($before|ConvertTo-Json -Depth 15))}
 $baseline=Get-Content -LiteralPath $DailyBaseline -Raw|ConvertFrom-Json
 foreach($file in $baseline.files){if($before.daily[$file.path] -ne $file.sha256){throw 'Daily binary differs from original program-only baseline'}}
 $start=New-Object Diagnostics.ProcessStartInfo
 $start.FileName=$Installer;$start.Arguments='/S /currentuser /D='+$owned;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
 $temp=Join-Path $Run 'temp';New-Item -ItemType Directory -Path $temp -Force|Out-Null
 $start.EnvironmentVariables['TEMP']=$temp;$start.EnvironmentVariables['TMP']=$temp
 if(!$Resume){
  $p=[Diagnostics.Process]::Start($start)
  if(!$p.WaitForExit(90000)){throw 'Validation installer timed out'}
  $report.installExit=$p.ExitCode;if($p.ExitCode -ne 0){throw 'Validation installer returned failure'}
 }else{$report.resumedOwnedInstall=$true}
 $installedExe=Join-Path $owned 'EasyTranslateValidationPR12.exe'
 foreach($pair in @(@{installed=$installedExe;original=(Join-Path $Production 'EasyTranslate.exe')},@{installed=(Join-Path $owned 'resources\app.asar');original=(Join-Path $Production 'resources\app.asar')})){
  if((Get-FileHash -Algorithm SHA256 -LiteralPath $pair.installed).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $pair.original).Hash){throw 'Installed application payload identity mismatch'}
 }
 $afterInstall=Snapshot
 if(!$Resume){[IO.File]::WriteAllText((Join-Path $Run 'after-install.json'),($afterInstall|ConvertTo-Json -Depth 15))}
 if(!(JsonEqual $before.daily $afterInstall.daily) -or !(JsonEqual $before.shortcuts $afterInstall.shortcuts)){throw 'Daily payload or shortcut identities changed'}
 foreach($key in $before.registry.Keys){if(!(JsonEqual $before.registry[$key] $afterInstall.registry[$key])){throw 'Existing EasyTranslate registration changed'}}
 $testKeys=@($afterInstall.registry.Keys|Where-Object{$afterInstall.registry[$_].DisplayName -eq 'EasyTranslate PR12 Validation'})
 if($testKeys.Count -ne 1){throw 'Expected one distinct current-user validation uninstall registration'}
 $registration=$afterInstall.registry[$testKeys[0]]
 $report.validationRegistration=@{key=$testKeys[0];values=$registration}
 if($testKeys[0] -notlike 'HKEY_CURRENT_USER\*'){throw 'Validation was not installed current-user'}
 if($registration.UninstallString -notmatch '^"([^"]+)" /currentuser$'){throw 'Unexpected validation uninstaller registration'}
 $script:uninstaller=[IO.Path]::GetFullPath($Matches[1])
 if($script:uninstaller -ne (Join-Path $owned 'Uninstall EasyTranslateValidationPR12.exe')){throw 'Registered uninstaller is not the exact owned validation executable'}
 if(!(Test-Path -LiteralPath $script:uninstaller)){throw 'Own registered uninstaller missing'}
 & powershell.exe -NoProfile -Sta -File (Join-Path $PSScriptRoot 'run-installed-product.ps1') -Exe $installedExe -Run (Join-Path $Run 'installed-startup') -Source $Source -Mode startup
 if($LASTEXITCODE -ne 0){throw 'Installed packaged executable startup/quit failed'}
 $report.installedStartup=Get-Content -LiteralPath (Join-Path $Run 'installed-startup\summary.json') -Raw|ConvertFrom-Json
 $report.payloadSha256=@{exe=(Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash;asar=(Get-FileHash -LiteralPath (Join-Path $owned 'resources\app.asar') -Algorithm SHA256).Hash}
 $un=New-Object Diagnostics.ProcessStartInfo
 $un.FileName=$script:uninstaller;$un.Arguments='/S /currentuser _?='+$owned;$un.UseShellExecute=$false;$un.CreateNoWindow=$true
 $un.EnvironmentVariables['TEMP']=$temp;$un.EnvironmentVariables['TMP']=$temp
 $u=[Diagnostics.Process]::Start($un);if(!$u.WaitForExit(60000)){throw 'Own validation uninstaller timed out'}
 $report.uninstallExit=$u.ExitCode;if($u.ExitCode -ne 0){throw 'Own uninstaller returned failure'}
 $after=Snapshot;[IO.File]::WriteAllText((Join-Path $Run 'after-uninstall.json'),($after|ConvertTo-Json -Depth 15))
 if(!(JsonEqual $before $after)){throw 'Final scoped program/registry/shortcut snapshot differs from before'}
 if(Test-Path -LiteralPath $installedExe){throw 'Validation application remains after own uninstall'}
 # NSIS _?= avoids copying/rerunning its uninstaller and leaves that executable behind.
 # Remove only the verified owned validation directory after confirming payload/registration gone.
 $remaining=@(if(Test-Path -LiteralPath $owned){Get-ChildItem -LiteralPath $owned -Recurse -File|ForEach-Object{$_.FullName.Substring($owned.Length+1)}})
 $report.remainingAfterOwnUninstall=$remaining
 if(@($remaining|Where-Object{$_ -ne 'Uninstall EasyTranslateValidationPR12.exe'}).Count){throw 'Unexpected files remain; retain for diagnosis'}
 if(Test-Path -LiteralPath $owned){Remove-Item -LiteralPath $owned -Recurse -Force}
 $report.dailyPayloadUnchanged=$true;$report.registryAndShortcutsRestored=$true;$report.ownedInstallRemoved=!(Test-Path -LiteralPath $owned);$report.pass=$true
}catch{$report.error=$_.Exception.ToString()}
finally{$summaryName=if($Resume){'summary-resume.json'}else{'summary.json'};[IO.File]::WriteAllText((Join-Path $Run $summaryName),($report|ConvertTo-Json -Depth 18))}
Write-Output (@{pass=$report.pass;run=$Run;error=$report.error}|ConvertTo-Json)
if(!$report.pass){exit 1}
