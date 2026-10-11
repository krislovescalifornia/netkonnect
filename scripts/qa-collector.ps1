# Read-only snapshot profiling; emits timings/counts, never connection contents.
param([int]$Samples = 1,[switch]$Baseline)
$ErrorActionPreference = 'Stop'
$auditSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\collector.ps1') -Raw
if($Baseline) { $auditSource=(& git -C (Join-Path $PSScriptRoot '..') show HEAD:collector.ps1 | Out-String) }
$auditWatch = [Diagnostics.Stopwatch]::StartNew()
$auditProcess = [Diagnostics.Process]::GetCurrentProcess()
$auditCpu = $auditProcess.TotalProcessorTime.TotalSeconds
$auditLast = 0
$auditMarks = [Collections.Generic.List[object]]::new()
function Measure-CollectorStage($name) {
  $auditProcess.Refresh()
  $cpu = $auditProcess.TotalProcessorTime.TotalSeconds
  $elapsed = $auditWatch.Elapsed.TotalSeconds
  $auditMarks.Add(@{stage=$name;elapsedSeconds=$elapsed-$script:auditLast;cpuSeconds=$cpu-$script:auditCpu})
  $script:auditLast=$elapsed; $script:auditCpu=$cpu
}
foreach ($mark in @(
  @('$connections = @()', 'processes-and-services'),
  @('$adapters = @()', 'connections'),
  @('$dns = @()', 'adapters'),
  @('$hosts = @()', 'dns'),
  @('$networkStatistics=@{}', 'local-context')
)) {
  $auditSource=$auditSource.Replace($mark[0],("Measure-CollectorStage '"+$mark[1]+"'`n"+$mark[0]))
}
$auditBlock = [scriptblock]::Create($auditSource)
for ($sample=0; $sample -lt $Samples; $sample++) {
  $auditMarks.Clear();$auditLast=0;$auditWatch.Restart()
  $auditProcess.Refresh();$auditCpu=$auditProcess.TotalProcessorTime.TotalSeconds
  $auditResult = & $auditBlock | ConvertFrom-Json
  Measure-CollectorStage 'statistics-and-json'
  @{sample=$sample;stages=@($auditMarks.ToArray());connections=$auditResult.connections.Count;processes=@($auditResult.processDetails.PSObject.Properties).Count;totalElapsedSeconds=$auditWatch.Elapsed.TotalSeconds} | ConvertTo-Json -Depth 4 -Compress
}
