$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$issues = [System.Collections.Generic.List[string]]::new()
$processes = @{}
Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $processes[[int]$_.Id] = $_.ProcessName }
$connections = @()
function Read-NativeConnections {
  $rows = @(& "$env:SystemRoot\System32\netstat.exe" -ano)
  if ($LASTEXITCODE -ne 0) { throw 'The native connection table is unavailable.' }
  foreach ($line in $rows) {
    $parts = $line.Trim() -split '\s+'
    if ($parts[0] -notin @('TCP','UDP')) { continue }
    if ($parts[0] -eq 'TCP' -and $parts.Count -lt 5) { continue }
    if ($parts[0] -eq 'UDP' -and $parts.Count -lt 4) { continue }
    $local = $parts[1] -match '^(.+):(\d+)$'
    if (!$local) { continue }
    $localIp = $Matches[1].Trim('[',']')
    $localPort = [int]$Matches[2]
    $remoteIp = '*'; $remotePort = 0
    if ($parts[2] -match '^(.+):(\d+)$') { $remoteIp = $Matches[1].Trim('[',']'); $remotePort = [int]$Matches[2] }
    $ownerId = [int]$parts[$parts.Count-1]
    $processName = $processes[$ownerId]
    if ($ownerId -eq 0) { $processName = 'Unattributed' }
    if (!$processName) { $processName = "Process $ownerId" }
    $connectionState = 'Bound'
    if ($parts[0] -eq 'TCP') {
      $states = @{ ESTABLISHED='Established'; LISTENING='Listen'; TIME_WAIT='TimeWait'; CLOSE_WAIT='CloseWait'; SYN_SENT='SynSent'; SYN_RECEIVED='SynReceived'; FIN_WAIT_1='FinWait1'; FIN_WAIT_2='FinWait2'; CLOSING='Closing'; LAST_ACK='LastAck'; CLOSED='Closed'; DELETE_TCB='DeleteTcb' }
      $connectionState = $states[$parts[3]]
      if (!$connectionState) { $connectionState = $parts[3] }
    }
    @{ protocol=$parts[0]; pid=$ownerId; app=$processName; localAddress=$localIp; localPort=$localPort; remoteAddress=$remoteIp; remotePort=$remotePort; state=$connectionState }
  }
}
$nativeFallback = $false
try {
  $connections += @(Get-NetTCPConnection -ErrorAction Stop | ForEach-Object {
    $ownerId = [int]$_.OwningProcess
    $processName = $processes[$ownerId]
    if ($ownerId -eq 0) { $processName = 'Unattributed' }
    if (!$processName) { $processName = "Process $ownerId" }
    @{ protocol='TCP'; pid=$ownerId; app=$processName; localAddress=$_.LocalAddress; localPort=[int]$_.LocalPort; remoteAddress=$_.RemoteAddress; remotePort=[int]$_.RemotePort; state=[string]$_.State }
  })
} catch {
  try { $connections = @(Read-NativeConnections); $nativeFallback = $true } catch { $issues.Add('Connection tables could not be read: ' + $_.Exception.Message) }
}
if (!$nativeFallback) { try {
  $connections += @(Get-NetUDPEndpoint -ErrorAction Stop | ForEach-Object {
    $ownerId = [int]$_.OwningProcess
    $processName = $processes[$ownerId]
    if (!$processName) { $processName = "Process $ownerId" }
    @{ protocol='UDP'; pid=$ownerId; app=$processName; localAddress=$_.LocalAddress; localPort=[int]$_.LocalPort; remoteAddress='*'; remotePort=0; state='Bound' }
  })
} catch { $issues.Add('UDP endpoints could not be read: ' + $_.Exception.Message) } }
$adapters = @()
try {
  $configs = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue)
  $adapters = @(Get-NetAdapter -ErrorAction Stop | ForEach-Object {
    $adapter = $_
    $stats = $adapter | Get-NetAdapterStatistics -ErrorAction SilentlyContinue
    $config = $configs | Where-Object { $_.InterfaceIndex -eq $adapter.ifIndex } | Select-Object -First 1
    @{ id=[string]$adapter.InterfaceGuid; name=$adapter.Name; description=$adapter.InterfaceDescription; status=[string]$adapter.Status; speed=$adapter.LinkSpeed; mac=$adapter.MacAddress; receivedBytes=[double]$stats.ReceivedBytes; sentBytes=[double]$stats.SentBytes; receivedErrors=[double]$stats.ReceivedPacketErrors; sentErrors=[double]$stats.OutboundPacketErrors; ipv4=@($config.IPv4Address.IPAddress | Where-Object { $_ }); ipv6=@($config.IPv6Address.IPAddress | Where-Object { $_ }); gateway=@($config.IPv4DefaultGateway.NextHop | Where-Object { $_ }); dns=@($config.DNSServer.ServerAddresses | Where-Object { $_ }) }
  })
} catch {
  try {
    $adapters = @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.NetworkInterfaceType -ne 'Loopback' -and $_.Name -notmatch '-(WFP|QoS)' } | ForEach-Object {
      $adapter = $_; $stats = $adapter.GetIPStatistics(); $config = $adapter.GetIPProperties()
      $speed = 'Not available'
      if ($adapter.Speed -ge 1000000000) { $speed = ([Math]::Round($adapter.Speed / 1000000000, 1)).ToString() + ' Gbps' }
      elseif ($adapter.Speed -ge 1000000) { $speed = ([Math]::Round($adapter.Speed / 1000000, 1)).ToString() + ' Mbps' }
      elseif ($adapter.Speed -ge 0) { $speed = $adapter.Speed.ToString() + ' bps' }
      $mac = $adapter.GetPhysicalAddress().ToString() -replace '(.{2})(?=.)','$1-'
      $adapterStatus = [string]$adapter.OperationalStatus
      if ($adapterStatus -eq 'Down') { $adapterStatus = 'Disconnected' }
      @{ id=$adapter.Id; name=$adapter.Name; description=$adapter.Description; status=$adapterStatus; speed=$speed; mac=$mac; receivedBytes=[double]$stats.BytesReceived; sentBytes=[double]$stats.BytesSent; receivedErrors=[double]$stats.IncomingPacketsWithErrors; sentErrors=[double]$stats.OutgoingPacketsWithErrors; ipv4=@($config.UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.Address.ToString() }); ipv6=@($config.UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetworkV6' } | ForEach-Object { $_.Address.ToString() }); gateway=@($config.GatewayAddresses | ForEach-Object { $_.Address.ToString() }); dns=@($config.DnsAddresses | ForEach-Object { $_.ToString() }) }
    })
  } catch { $issues.Add('Adapter information could not be read: ' + $_.Exception.Message) }
}
$dns = @()
try { $dns = @(Get-DnsClientCache -ErrorAction Stop | Where-Object { $_.Type -eq 1 -or $_.Type -eq 28 } | ForEach-Object { @{ name=$_.Entry; address=$_.Data } }) } catch {
  try {
    $cacheLines = @(& "$env:SystemRoot\System32\ipconfig.exe" /displaydns)
    if ($LASTEXITCODE -ne 0) { throw 'Native DNS cache could not be read.' }
    $recordName = $null; $recognized = $false
    $dns = @(foreach ($line in $cacheLines) {
      if ($line -match '^\s*Record Name[^:]*:\s*(.+)$') { $recordName = $Matches[1].Trim(); $recognized = $true }
      elseif ($recordName -and $line -match '^\s*(?:A(?: \(Host\))?|AAAA) Record[^:]*:\s*(.+)$') {
        $address = $Matches[1].Trim(); $parsedAddress = $null
        if ([System.Net.IPAddress]::TryParse($address, [ref]$parsedAddress)) { @{ name=$recordName; address=$address } }
      }
    })
    if (!$recognized) { $issues.Add('DNS hostname clues are unavailable or the cache is empty; destinations display IP addresses.') }
  } catch { $issues.Add('DNS cache is unavailable; destinations will display IP addresses.') }
}
$processNames = @{}
foreach ($entry in $processes.GetEnumerator()) { $processNames[[string]$entry.Key] = $entry.Value }
@{ timestamp=[DateTime]::UtcNow.ToString('o'); computer=$env:COMPUTERNAME; processes=$processNames; connections=$connections; adapters=$adapters; dns=$dns; issues=@($issues.ToArray()) } | ConvertTo-Json -Depth 7 -Compress
