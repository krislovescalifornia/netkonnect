param([Parameter(Mandatory=$true)][string]$DataDirectory, [Parameter(Mandatory=$true)][ValidatePattern('^S-1-(5-21|12-1)-\d+-\d+-\d+-\d+$')][string]$UserId)
$ErrorActionPreference = 'Stop'
if ($DataDirectory -notmatch '^[a-zA-Z]:\\' -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($DataDirectory))).DriveType -ne [IO.DriveType]::Fixed) { throw 'Capture requires a fixed local data disk.' }
$request = Get-Content -LiteralPath (Join-Path $DataDirectory 'trace-request.json') -Raw | ConvertFrom-Json
if ($request.pipe -notmatch '^\\\\\.\\pipe\\netkonnect-[a-f0-9]+$' -or $request.token -notmatch '^[a-f0-9]{64}$') { exit 1 }
$parent = Get-Process -Id ([int]$request.parentId) -ErrorAction Stop
$expected = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\netKonnect.exe'))
if ($parent.Path -ne $expected) { throw 'Capture requires the installed netKonnect companion.' }
$owner = Invoke-CimMethod -InputObject (Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$request.parentId)) -MethodName GetOwnerSid
if ($owner.Sid -ne $UserId) { throw 'Capture requires the configured customer account.' }
# NamedPipeClientStream uses the local computer only. Requests contain no code,
# command-line fragments, destinations, or script paths.
$name = $request.pipe.Substring(9)
# Overlapped I/O lets the control thread wait for "stop" while the capture
# thread keeps writing intervals. A synchronous duplex handle can serialize
# those operations and leave every traffic write waiting behind the read.
$pipe = [IO.Pipes.NamedPipeClientStream]::new('.', $name, [IO.Pipes.PipeDirection]::InOut, [IO.Pipes.PipeOptions]::Asynchronous)
try {
  $pipe.Connect(10000)
  $writer = [IO.StreamWriter]::new($pipe, [Text.UTF8Encoding]::new($false), 4096, $true)
  $writer.AutoFlush = $true
  $reader = [IO.StreamReader]::new($pipe, [Text.UTF8Encoding]::new($false), $false, 4096, $true)
  $writer.WriteLine([string]$request.token)
  $rules = @(Get-NetFirewallRule -DisplayName 'netKonnect Offline' -ErrorAction Stop | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Outbound' -and $_.Action -eq 'Block' } | ForEach-Object { $_ | Get-NetFirewallApplicationFilter } | Where-Object { $_.Program -eq $expected })
  $writer.WriteLine((@{type='protection';firewall=($rules.Count -gt 0)} | ConvertTo-Json -Compress))
  [Console]::SetOut($writer)
  [Console]::SetIn($reader)
  Add-Type -Path (Join-Path $PSScriptRoot '..\lib\TrafficTrace.cs')
  [NetKonnect.TrafficTrace]::Run([int]$request.parentId, 0, $true)
} catch {
  if ($writer) { try { $writer.WriteLine((@{type='status';available=$false;message=$_.Exception.GetBaseException().Message} | ConvertTo-Json -Compress)) } catch {} }
} finally { $pipe.Dispose() }
