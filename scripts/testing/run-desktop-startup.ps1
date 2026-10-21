param([ValidateSet('tray','normal','force-show','force-hidden','all')][string]$Mode='all', [string]$Repo='', [string]$OutputRoot='')
$ErrorActionPreference='Stop'
if(!$Repo){$Repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)}
if(!$OutputRoot){$OutputRoot=Join-Path $Repo '.runtime'}
$modes=if($Mode -eq 'all'){@('tray','normal','force-show','force-hidden')}else{@($Mode)}
$failed=$false
foreach($case in $modes){
 $run=Join-Path $OutputRoot ('desktop-startup-'+$case+'-'+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
 New-Item -ItemType Directory -Path $run -Force|Out-Null
 $flag=if($case -eq 'force-show'){' --show'}elseif($case -eq 'force-hidden'){' --hidden'}else{''}
 $psi=New-Object Diagnostics.ProcessStartInfo
 $psi.FileName=Join-Path $Repo 'node_modules\electron\dist\electron.exe'
 $psi.Arguments='"'+(Join-Path $PSScriptRoot 'desktop-startup.cjs')+'"'+$flag
 $psi.WorkingDirectory=$Repo;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 $psi.EnvironmentVariables['EASY_STARTUP_ROOT']=$Repo;$psi.EnvironmentVariables['EASY_STARTUP_OUTPUT']=$run;$psi.EnvironmentVariables['EASY_STARTUP_MODE']=$case
 $psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
 $process=[Diagnostics.Process]::Start($psi)
 $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 $natural=$process.WaitForExit(10000)
 if(!$natural){$process.Kill();$process.WaitForExit()}
 [IO.File]::WriteAllText((Join-Path $run 'stdout.txt'),$stdout.Result);[IO.File]::WriteAllText((Join-Path $run 'stderr.txt'),$stderr.Result)
 [IO.File]::WriteAllText((Join-Path $run 'shutdown.json'),(@{naturalExit=$natural;exitCode=$process.ExitCode}|ConvertTo-Json))
 $resultPath=Join-Path $run 'result.json'
 $pass=$false
 if(Test-Path -LiteralPath $resultPath){$result=Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8|ConvertFrom-Json;$pass=($result.pass -and $natural -and $process.ExitCode -eq 0)}
 if(!$pass){$failed=$true}
 Write-Output ('Startup '+$case+': '+$pass+'; '+$run)
}
if($failed){exit 1}
