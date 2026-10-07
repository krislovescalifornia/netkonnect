param([int]$ParentId = 0, [int]$Seconds = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  try {
    Add-Type -Path (Join-Path $PSScriptRoot 'lib\NameTrace.cs') -ReferencedAssemblies System.dll,System.Core.dll,System.Xml.dll
    [NetKonnect.NameTrace]::Start($false)
  } catch {
    foreach($source in @('windows-dns-etw','wfp-audit')) {@{type='evidence-status';source=$source;available=$false;message='Name and audit collector could not start: '+$_.Exception.GetBaseException().Message}|ConvertTo-Json -Compress}
  }
  Add-Type -Path (Join-Path $PSScriptRoot 'lib\TrafficTrace.cs')
  [NetKonnect.TrafficTrace]::Run($ParentId, $Seconds)
} catch {
  @{ type='status'; available=$false; message=$_.Exception.GetBaseException().Message } | ConvertTo-Json -Compress
  exit 1
} finally { if ('NetKonnect.NameTrace' -as [type]) { [NetKonnect.NameTrace]::Stop() } }
