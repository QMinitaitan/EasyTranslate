param([Parameter(Mandatory=$true)][string]$Exe,[Parameter(Mandatory=$true)][string]$Run,[Parameter(Mandatory=$true)][string]$Source,[ValidateSet('functional','startup')][string]$Mode='functional')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$saved=New-Object Windows.Forms.DataObject
$original=[Windows.Forms.Clipboard]::GetDataObject()
$formats=0
if($original){foreach($format in $original.GetFormats($false)){try{$saved.SetData($format,$original.GetData($format,$false));$formats++}catch{throw 'Could not preserve outer clipboard format; probe cancelled before app launch'}}}
$guard=@{savedInMemory=$true;formatCount=$formats;restored=$false}
try{
 & node (Join-Path $PSScriptRoot 'installed-product.cjs') $Exe $Run $Mode $Source
 $code=$LASTEXITCODE
}finally{
 try{[Windows.Forms.Clipboard]::SetDataObject($saved,$true);$guard.restored=$true}catch{$guard.error=$_.Exception.Message}
 if(Test-Path -LiteralPath $Run){[IO.File]::WriteAllText((Join-Path $Run 'outer-clipboard-guard.json'),($guard|ConvertTo-Json))}
}
if(!$guard.restored){throw 'Outer clipboard restoration failed'}
exit $code
