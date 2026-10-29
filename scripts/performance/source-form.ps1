param([string]$Run)
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = 'EasyTranslate isolated benchmark source'
$form.Width = 600
$form.Height = 200
$form.StartPosition = 'CenterScreen'
$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.Dock = 'Fill'
$box.Text = 'Hello baseline world.'
$form.Controls.Add($box)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 50
$timer.add_Tick({
  $commandPath = Join-Path $Run 'source-command.json'
  if (Test-Path -LiteralPath $commandPath) {
    try {
      $command = Get-Content -LiteralPath $commandPath -Raw | ConvertFrom-Json
      Remove-Item -LiteralPath $commandPath
      if ($command.action -eq 'stop') { $form.Close(); return }
      $box.Text = $command.text
      $form.Activate()
      $box.Focus() | Out-Null
      if ($command.empty) { $box.SelectionStart = $box.TextLength; $box.SelectionLength = 0 }
      else { $box.SelectAll() }
      [IO.File]::WriteAllText((Join-Path $Run 'source-ready.json'), ($command | ConvertTo-Json -Compress))
    } catch {}
  }
})
$form.add_Shown({
  [IO.File]::WriteAllText((Join-Path $Run 'source-window.json'), (@{handle=$form.Handle.ToInt64();pid=$PID} | ConvertTo-Json -Compress))
  $timer.Start()
})
[System.Windows.Forms.Application]::Run($form)
$timer.Dispose()
