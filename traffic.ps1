param([int]$ParentId = 0, [int]$Seconds = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'lib\TrafficTrace.cs')
  [NetKonnect.TrafficTrace]::Run($ParentId, $Seconds)
} catch {
  @{ type='status'; available=$false; message=$_.Exception.GetBaseException().Message } | ConvertTo-Json -Compress
  exit 1
}
