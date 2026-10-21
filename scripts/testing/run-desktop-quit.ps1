param([string]$Repo='', [string]$OutputRoot='')
$ErrorActionPreference='Stop'
if(!$Repo){$Repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)}
if(!$OutputRoot){$OutputRoot=Join-Path $Repo '.runtime'}
$run=Join-Path $OutputRoot ('desktop-quit-'+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
New-Item -ItemType Directory -Path $run -Force | Out-Null
$psi=New-Object Diagnostics.ProcessStartInfo
$psi.FileName=Join-Path $Repo 'node_modules\electron\dist\electron.exe'
$psi.Arguments='"'+(Join-Path $PSScriptRoot 'desktop-quit.cjs')+'" --hidden'
$psi.WorkingDirectory=$Repo;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
$psi.EnvironmentVariables['EASY_QUIT_ROOT']=$Repo;$psi.EnvironmentVariables['EASY_QUIT_OUTPUT']=$run
$psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$process=[Diagnostics.Process]::Start($psi)
$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
$natural=$process.WaitForExit(5000)
if(!$natural){$process.Kill();$process.WaitForExit()}
[IO.File]::WriteAllText((Join-Path $run 'stdout.txt'),$stdout.Result)
[IO.File]::WriteAllText((Join-Path $run 'stderr.txt'),$stderr.Result)
$result=@{pass=($natural -and $process.ExitCode -eq 0);naturalExit=$natural;exitCode=$process.ExitCode;root=$Repo}
[IO.File]::WriteAllText((Join-Path $run 'result.json'),($result|ConvertTo-Json))
Write-Output (($result|ConvertTo-Json -Compress)+'; '+$run)
if(!$result.pass){exit 1}
