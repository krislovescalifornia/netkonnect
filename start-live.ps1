param([ValidateRange(1,65535)][int]$Port = 4317)
$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$ports = [Collections.Generic.HashSet[int]]::new()
foreach ($line in (& "$env:SystemRoot\System32\netstat.exe" -ano)) {
  if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+\d+\s*$') { [void]$ports.Add([int]$Matches[1]) }
}
while ($ports.Contains($Port) -and $Port -lt 65535) { $Port++ }
if ($ports.Contains($Port)) { throw 'No free local port is available.' }
$serverPath = Join-Path $PSScriptRoot 'server.mjs'
# Launch Node directly: the selected port survives Windows elevation, unlike
# environment variables inherited through an elevated shell.
$launch = Start-Process -FilePath $nodePath -Verb RunAs -WindowStyle Hidden -WorkingDirectory $PSScriptRoot -PassThru -ArgumentList @(('"' + $serverPath + '"'), '--port', [string]$Port)
$launch.Id | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'launcher.pid')
Write-Output "Detailed capture: http://127.0.0.1:$Port (PID $($launch.Id))"
