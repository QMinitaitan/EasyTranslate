param([string]$Repo = '', [string]$ElectronPath = '', [string]$OutputRoot = '', [ValidateSet('app', 'close')][string]$Mode = 'app', [ValidateSet('general', 'api', 'shortcut', 'capture', 'startup')][string]$Setting = 'general', [ValidateSet('none', 'disk', 'timeout')][string]$Fault = 'none')
throw 'Historical native validation is disabled; see docs/validation/NATIVE-VALIDATION.md'
$ErrorActionPreference = 'Stop'
if (!$Repo) { $Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
if (!$ElectronPath) { $ElectronPath = Join-Path $Repo 'node_modules\electron\dist\electron.exe' }
if (!$OutputRoot) { $OutputRoot = Join-Path $Repo ('.runtime\quit-' + $Setting + '-' + $Mode + '-' + $Fault + '-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')) }
$t9Output = [IO.Path]::GetFullPath($OutputRoot)
if ((Test-Path -LiteralPath $t9Output) -and (Get-ChildItem -LiteralPath $t9Output -Force | Select-Object -First 1)) { throw 'Choose an empty output directory.' }
New-Item -ItemType Directory -Path $t9Output -Force | Out-Null
$t9Config = @{ launchToTray = $true; closeAction = 'quit'; uiLanguage = 'zh-CN'; shortcuts = @{ translate = 'Alt+Q'; show = '' }; providers = @{ deepseek = @{ enabled = $false; apiKey = 'synthetic-fixture'; model = 'original-model' } } }
[IO.File]::WriteAllText((Join-Path $t9Output '.translate-app.config.json'), ($t9Config | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$t9Environment = @{ HOME = $t9Output; USERPROFILE = $t9Output; EASY_QUIT_ROOT = [IO.Path]::GetFullPath($Repo); EASY_QUIT_OUTPUT = $t9Output; EASY_QUIT_MODE = $Mode; EASY_QUIT_SETTING = $Setting; EASY_QUIT_FAULT = $Fault }
foreach ($t9Stage in @('edit', 'verify')) {
  $t9Environment.EASY_QUIT_STAGE = $t9Stage
  $t9Process = Start-Process -FilePath $ElectronPath -ArgumentList ('"{0}"' -f (Join-Path $PSScriptRoot 'quit-durability.cjs')) -Environment $t9Environment -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $t9Output ($t9Stage + '-stdout.txt')) -RedirectStandardError (Join-Path $t9Output ($t9Stage + '-stderr.txt'))
  if ($t9Process.ExitCode -ne 0) {
    Get-Content -LiteralPath (Join-Path $t9Output ($t9Stage + '-stderr.txt')) -Encoding UTF8
    throw "Quit $t9Stage failed ($($t9Process.ExitCode)). Evidence: $t9Output"
  }
}
Write-Output "Quit evidence: $t9Output"
Get-Content -LiteralPath (Join-Path $t9Output 'result.json') -Encoding UTF8
