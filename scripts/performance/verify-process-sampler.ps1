$ErrorActionPreference='Stop'
Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'process-sampler.cs') -Raw -Encoding UTF8)
$parents=New-Object 'System.Collections.Generic.Dictionary[int,int]'
$births=New-Object 'System.Collections.Generic.Dictionary[int,long]'
$known=New-Object 'System.Collections.Generic.Dictionary[int,long]'
function AssertIds($Actual,[int[]]$Expected,[string]$Message) {
  $ids=@($Actual | Sort-Object)
  if(($ids -join ',') -ne (($Expected | Sort-Object) -join ',')) {throw ($Message+': '+($ids -join ','))}
}
# PID 20 has been reused; its old child 30 predates the new parent.
$parents[10]=1;$births[10]=100
$parents[20]=10;$births[20]=200
$parents[30]=20;$births[30]=150
$parents[40]=20;$births[40]=250
$parents[50]=40;$births[50]=300
AssertIds ([BenchNative]::SelectTree(10,100,$parents,$births,$known)) @(10,20,40,50) 'stale parent PID admitted'
# A previously validated live child remains attributable after its parent exits.
$parents.Clear();$births.Clear()
$parents[40]=20;$births[40]=250
$parents[60]=40;$births[60]=200
AssertIds ([BenchNative]::SelectTree(10,100,$parents,$births,$known)) @(40) 'orphan identity lost or older child admitted'
# That same numeric PID now belongs to a different process, without valid ancestry.
$births[40]=500
AssertIds ([BenchNative]::SelectTree(10,100,$parents,$births,$known)) @() 'reused child PID admitted'
$parents.Clear();$births.Clear()
$parents[10]=1;$births[10]=1000
AssertIds ([BenchNative]::SelectTree(10,100,$parents,$births,$known)) @() 'reused root PID admitted'
Write-Output 'Process identity fixtures passed (stale parent, live orphan, child reuse, root reuse).'
