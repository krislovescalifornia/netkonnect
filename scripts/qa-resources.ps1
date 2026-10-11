# Read-only installed-app CPU/GPU counters. Does not log command lines or traffic.
param([int]$Seconds=20,[string]$Output='test-results/performance/installed-resources.json',[int]$RootPid=0)
$ErrorActionPreference='Stop'
$processTable=@(Get-CimInstance Win32_Process)
$roles=@{}
foreach($item in $processTable) {
  $role=$item.Name
  if($item.Name -eq 'netKonnect.exe' -or $item.Name -eq 'electron.exe') {
    if($item.CommandLine -match '--type=([^ ]+)') {$role=$Matches[1]}
    elseif($item.CommandLine -match 'collector') {$role='companion'}
    else {$role='dashboard'}
  } elseif($item.Name -eq 'powershell.exe' -and $item.CommandLine -match 'collector.ps1.*-Persistent') {$role='snapshot-worker'}
  $roles[[int]$item.ProcessId]=$role
}
$auditIds=[Collections.Generic.HashSet[int]]::new()
if($RootPid) {[void]$auditIds.Add($RootPid)}
else {foreach($item in $processTable | Where-Object Name -eq 'netKonnect.exe') {[void]$auditIds.Add([int]$item.ProcessId)}}
do {
  $added=$false
  foreach($item in $processTable) {if($auditIds.Contains([int]$item.ParentProcessId)){$added=$auditIds.Add([int]$item.ProcessId) -or $added}}
} while($added)
function Read-AuditCounters {
  @{
    cpu=@(Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object {$auditIds.Contains([int]$_.IDProcess)})
    gpu=@(Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUEngine | Where-Object {$_.Name -match '^pid_(\d+)_' -and $auditIds.Contains([int]$Matches[1])})
  }
}
$before=Read-AuditCounters
Start-Sleep -Seconds $Seconds
$after=Read-AuditCounters
$cpu=@(foreach($counter in $after.cpu) {
  $prior=$before.cpu | Where-Object IDProcess -eq $counter.IDProcess | Select-Object -First 1
  if($prior) {
    $elapsed=([double]$counter.Timestamp_Sys100NS-[double]$prior.Timestamp_Sys100NS)/1e7
    $cpuSeconds=([double]$counter.PercentProcessorTime-[double]$prior.PercentProcessorTime)/1e7
    @{pid=[int]$counter.IDProcess;name=$counter.Name;role=$roles[[int]$counter.IDProcess];elapsed=$elapsed;cpuSeconds=$cpuSeconds;cores=$cpuSeconds/$elapsed;privateMiB=[double]$counter.WorkingSetPrivate/1MB}
  }
})
$gpu=@(foreach($counter in $after.gpu) {
  $prior=$before.gpu | Where-Object Name -eq $counter.Name | Select-Object -First 1
  if($prior) {
    $elapsed=[double]$counter.Timestamp_Sys100NS-[double]$prior.Timestamp_Sys100NS
    @{engine=$counter.Name;busyPercent=100*([double]$counter.RunningTime-[double]$prior.RunningTime)/$elapsed}
  }
})
$report=@{measuredAt=(Get-Date).ToUniversalTime().ToString('o');logicalProcessors=[Environment]::ProcessorCount;cpu=$cpu;gpu=$gpu;note='Only processes present at both endpoints are measured. Short-lived snapshot children and inaccessible privileged helpers are excluded. GPU engine percentages are separate engines, not additive device utilization.'}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Output -Encoding UTF8
$report | ConvertTo-Json -Depth 5 -Compress
