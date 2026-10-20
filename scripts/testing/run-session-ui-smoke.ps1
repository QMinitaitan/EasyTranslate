param([string]$Repo = '', [string]$ElectronPath = '', [string]$OutputRoot = '')
$ErrorActionPreference = 'Stop'
$t2Project = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (!$Repo) { $Repo = $t2Project }
if (!$ElectronPath) { $ElectronPath = Join-Path $Repo 'node_modules\electron\dist\electron.exe' }
if (!$OutputRoot) { $OutputRoot = Join-Path $Repo ('.runtime\session-ui-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')) }
$t2Output = [IO.Path]::GetFullPath($OutputRoot)
if ((Test-Path -LiteralPath $t2Output) -and (Get-ChildItem -LiteralPath $t2Output -Force | Select-Object -First 1)) {
  throw 'Choose an empty output directory to preserve previous smoke evidence.'
}
New-Item -ItemType Directory -Force -Path $t2Output | Out-Null
$t2Config = @{
  providers = @{
    deepseek = @{ enabled = $true; apiKey = 'synthetic-test-only'; endpoint = 'https://controlled.invalid'; model = 'controlled' }
    bing = @{ enabled = $false }
    openai = @{ enabled = $false }
  }
  raceMode = $false
  launchToTray = $true
  closeAction = 'tray'
  shortcuts = @{ translate = 'Alt+Q'; show = '' }
}
[IO.File]::WriteAllText((Join-Path $t2Output '.translate-app.config.json'), ($t2Config | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$t2Environment = @{
  HOME = $t2Output
  USERPROFILE = $t2Output
  EASY_SESSION_TEST_ROOT = [IO.Path]::GetFullPath($Repo)
  EASY_SESSION_TEST_OUTPUT = $t2Output
}
$t2Harness = Join-Path $PSScriptRoot 'session-ui-smoke.cjs'
$t2Process = Start-Process -FilePath $ElectronPath -ArgumentList ('"{0}"' -f $t2Harness) -Environment $t2Environment -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $t2Output 'stdout.txt') -RedirectStandardError (Join-Path $t2Output 'stderr.txt')
Write-Output "Smoke evidence: $t2Output"
Get-Content -LiteralPath (Join-Path $t2Output 'result.json')
if ($t2Process.ExitCode -ne 0) { throw "T2 UI smoke failed with exit $($t2Process.ExitCode)" }
