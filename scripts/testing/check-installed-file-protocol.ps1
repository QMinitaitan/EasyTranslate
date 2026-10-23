param([Parameter(Mandatory=$true)][string]$Run)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'installed-file-protocol.ps1')
if(Test-Path -LiteralPath $Run){throw 'Choose fresh protocol evidence output'}
New-Item -ItemType Directory -Path $Run|Out-Null
$file=Join-Path $Run 'command.json'
Write-OwnedText $file '{"sequence":0}'
for($seq=1;$seq -le 100;$seq++){
 $handle=New-Object IO.FileStream($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
 $reader=New-Object IO.StreamReader($handle)
 try{
  Write-OwnedText $file ('{"sequence":'+$seq+'}')
  $old=$reader.ReadToEnd()|ConvertFrom-Json
  $fresh=Read-OwnedText $file|ConvertFrom-Json
  if($old.sequence -ne ($seq-1) -or $fresh.sequence -ne $seq){throw 'Protocol sequence mismatch'}
 }finally{$reader.Dispose();$handle.Dispose()}
}
Write-OwnedText $file '{"action":"stop"}'
if((Read-OwnedText $file|ConvertFrom-Json).action -ne 'stop'){throw 'Stop command not visible'}
[IO.File]::WriteAllText((Join-Path $Run 'summary.json'),'{"pass":true,"heldReaderReplacementCases":100,"stopCommand":true}')
Write-Output 'Held-reader atomic replacements100/100 and STOP PASS'
