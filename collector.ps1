$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$issues = [System.Collections.Generic.List[string]]::new()
$collectionSources = @{}
function Source-Status($name, $available, $count, $source, $message = '') {
  $collectionSources[$name] = @{ available=[bool]$available; count=[int]$count; source=$source; message=$message; updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
}
$processes = @{}
$processDetails = @{}
Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
  $processes[[int]$_.Id] = $_.ProcessName
  $detail=@{pid=[int]$_.Id;name=$_.ProcessName;startedAt=$null;path=$null;product=$null;company=$null;fileVersion=$null}
  try {$detail.startedAt=$_.StartTime.ToUniversalTime().ToString('o')}catch{}
  try {$detail.path=$_.Path}catch{}
  try {
    if ($detail.path -match '^[a-zA-Z]:\\' -and ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($detail.path))).DriveType -eq [IO.DriveType]::Fixed) {
      $versionInfo=[Diagnostics.FileVersionInfo]::GetVersionInfo($detail.path);$detail.product=$versionInfo.ProductName;$detail.company=$versionInfo.CompanyName;$detail.fileVersion=$versionInfo.FileVersion
    }
  }catch{}
  $processDetails[[string]$_.Id]=$detail
}
try {
  Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,SessionId,ExecutablePath,CreationDate -ErrorAction Stop | ForEach-Object {
    $detail=$processDetails[[string]$_.ProcessId]
    if ($detail) {
      $detail.parentPid=[int]$_.ParentProcessId; $detail.sessionId=[int]$_.SessionId
      if (!$detail.path) { $detail.path=$_.ExecutablePath }
      if (!$detail.startedAt -and $_.CreationDate) { $detail.startedAt=$_.CreationDate.ToUniversalTime().ToString('o') }
    }
  }
} catch { $issues.Add('Some process identity fields are unavailable.') }
try {
  $services=@(Get-CimInstance Win32_Service -Property Name,DisplayName,ProcessId,State -ErrorAction Stop | Where-Object {$_.ProcessId -gt 0 -and $_.State -eq 'Running'})
  foreach ($service in $services) {
    $detail=$processDetails[[string]$service.ProcessId]
    if ($detail) { $detail.services=@($detail.services | Where-Object {$_}) + @(@{name=$service.Name;displayName=$service.DisplayName}) }
  }
  Source-Status 'windows-services' $true $services.Count 'Win32_Service' 'Hosted services are candidates; a shared PID does not identify the service responsible for a transfer.'
} catch { Source-Status 'windows-services' $false 0 'Win32_Service' 'Service ownership is unavailable.' }
Source-Status 'process-snapshot' ($processes.Count -gt 0) $processes.Count 'Get-Process / Win32_Process' 'Protected processes can withhold executable metadata.'
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
$tcpAvailable = $false; $udpAvailable = $false
try {
  $connections += @(Get-NetTCPConnection -ErrorAction Stop | ForEach-Object {
    $ownerId = [int]$_.OwningProcess
    $processName = $processes[$ownerId]
    if ($ownerId -eq 0) { $processName = 'Unattributed' }
    if (!$processName) { $processName = "Process $ownerId" }
    @{ protocol='TCP'; pid=$ownerId; app=$processName; localAddress=$_.LocalAddress; localPort=[int]$_.LocalPort; remoteAddress=$_.RemoteAddress; remotePort=[int]$_.RemotePort; state=[string]$_.State }
  })
  $tcpAvailable = $true
} catch {
  try { $connections = @(Read-NativeConnections); $nativeFallback = $true; $tcpAvailable = $true; $udpAvailable = $true } catch { $issues.Add('Connection tables could not be read: ' + $_.Exception.Message) }
}
if (!$nativeFallback) { try {
  $connections += @(Get-NetUDPEndpoint -ErrorAction Stop | ForEach-Object {
    $ownerId = [int]$_.OwningProcess
    $processName = $processes[$ownerId]
    if ($ownerId -eq 0) { $processName = 'Unattributed' }
    if (!$processName) { $processName = "Process $ownerId" }
    @{ protocol='UDP'; pid=$ownerId; app=$processName; localAddress=$_.LocalAddress; localPort=[int]$_.LocalPort; remoteAddress='*'; remotePort=0; state='Bound' }
  })
  $udpAvailable = $true
} catch {
  try { $connections += @(Read-NativeConnections | Where-Object { $_.protocol -eq 'UDP' }); $udpAvailable = $true }
  catch { $issues.Add('UDP endpoints could not be read: ' + $_.Exception.Message) }
} }
Source-Status 'tcp-table' $tcpAvailable @($connections | Where-Object {$_.protocol -eq 'TCP'}).Count 'Get-NetTCPConnection / netstat -ano' 'Snapshots can miss sockets between observations.'
Source-Status 'udp-table' $udpAvailable @($connections | Where-Object {$_.protocol -eq 'UDP'}).Count 'Get-NetUDPEndpoint / netstat -ano' 'UDP tables expose bindings, not remote peers.'
$adapters = @()
try {
  $configs = @(Get-NetIPConfiguration -All -ErrorAction SilentlyContinue)
  $interfaces = @(Get-NetIPInterface -ErrorAction SilentlyContinue)
  $adapters = @(Get-NetAdapter -IncludeHidden -ErrorAction Stop | ForEach-Object {
    $adapter = $_
    $stats = $adapter | Get-NetAdapterStatistics -ErrorAction SilentlyContinue
    $config = $configs | Where-Object { $_.InterfaceIndex -eq $adapter.ifIndex } | Select-Object -First 1
    @{
      id=[string]$adapter.InterfaceGuid; interfaceIndex=[int]$adapter.ifIndex; name=$adapter.Name; description=$adapter.InterfaceDescription; status=[string]$adapter.Status; speed=$adapter.LinkSpeed; mac=$adapter.MacAddress
      hardware=[bool]$adapter.HardwareInterface; virtual=[bool]$adapter.Virtual; hidden=[bool]$adapter.Hidden
      receivedBytes=$(if($stats){[double]$stats.ReceivedBytes}else{$null}); sentBytes=$(if($stats){[double]$stats.SentBytes}else{$null})
      receivedErrors=$(if($stats){[double]$stats.ReceivedPacketErrors}else{$null}); sentErrors=$(if($stats){[double]$stats.OutboundPacketErrors}else{$null})
      receivedDiscards=$(if($stats){[double]$stats.ReceivedDiscardedPackets}else{$null}); sentDiscards=$(if($stats){[double]$stats.OutboundDiscardedPackets}else{$null})
      receivedPackets=$(if($stats){[double]$stats.ReceivedUnicastPackets+[double]$stats.ReceivedMulticastPackets+[double]$stats.ReceivedBroadcastPackets}else{$null}); sentPackets=$(if($stats){[double]$stats.SentUnicastPackets+[double]$stats.SentMulticastPackets+[double]$stats.SentBroadcastPackets}else{$null})
      ipv4=@($config.IPv4Address.IPAddress | Where-Object { $_ }); ipv6=@(@($config.IPv6Address.IPAddress)+@($config.IPv6LinkLocalAddress.IPAddress) | Where-Object { $_ } | Select-Object -Unique)
      gateway=@(@($config.IPv4DefaultGateway.NextHop)+@($config.IPv6DefaultGateway.NextHop) | Where-Object { $_ }); dns=@($config.DNSServer.ServerAddresses | Where-Object { $_ })
      ipInterfaces=@($interfaces | Where-Object {$_.InterfaceIndex -eq $adapter.ifIndex} | ForEach-Object {@{family=[string]$_.AddressFamily;mtu=[int]$_.NlMtu;metric=[int]$_.InterfaceMetric;dhcp=[string]$_.Dhcp;forwarding=[string]$_.Forwarding;connectionState=[string]$_.ConnectionState}})
    }
  })
} catch {
  try {
    $adapters = @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | ForEach-Object {
      $adapter = $_; $stats = $adapter.GetIPStatistics(); $config = $adapter.GetIPProperties()
      $speed = 'Not available'
      if ($adapter.Speed -ge 1000000000) { $speed = ([Math]::Round($adapter.Speed / 1000000000, 1)).ToString() + ' Gbps' }
      elseif ($adapter.Speed -ge 1000000) { $speed = ([Math]::Round($adapter.Speed / 1000000, 1)).ToString() + ' Mbps' }
      elseif ($adapter.Speed -ge 0) { $speed = $adapter.Speed.ToString() + ' bps' }
      $mac = $adapter.GetPhysicalAddress().ToString() -replace '(.{2})(?=.)','$1-'
      $adapterStatus = [string]$adapter.OperationalStatus
      if ($adapterStatus -eq 'Down') { $adapterStatus = 'Disconnected' }
      $interfaceIndex=0; try {$interfaceIndex=[int]$config.GetIPv4Properties().Index} catch {}
      @{ id=$adapter.Id; interfaceIndex=$interfaceIndex; name=$adapter.Name; description=$adapter.Description; status=$adapterStatus; speed=$speed; mac=$mac; loopback=($adapter.NetworkInterfaceType -eq 'Loopback'); dnsSuffix=$config.DnsSuffix; receivedBytes=[double]$stats.BytesReceived; sentBytes=[double]$stats.BytesSent; receivedErrors=[double]$stats.IncomingPacketsWithErrors; sentErrors=[double]$stats.OutgoingPacketsWithErrors; receivedDiscards=[double]$stats.IncomingPacketsDiscarded; sentDiscards=[double]$stats.OutgoingPacketsDiscarded; receivedPackets=[double]$stats.UnicastPacketsReceived+[double]$stats.NonUnicastPacketsReceived; sentPackets=[double]$stats.UnicastPacketsSent+[double]$stats.NonUnicastPacketsSent; ipv4=@($config.UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.Address.ToString() }); ipv6=@($config.UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetworkV6' } | ForEach-Object { $_.Address.ToString() }); gateway=@($config.GatewayAddresses | ForEach-Object { $_.Address.ToString() }); dns=@($config.DnsAddresses | ForEach-Object { $_.ToString() }) }
    })
  } catch { $issues.Add('Adapter information could not be read: ' + $_.Exception.Message) }
}
Source-Status 'network-adapters' ($adapters.Count -gt 0) $adapters.Count 'Windows adapter tables / .NET' 'Includes hidden and virtual adapters. Their counters can overlap.'
$dns = @()
try { $dns = @(Get-DnsClientCache -ErrorAction Stop | Where-Object { $_.Status -eq 0 -and $_.Type -in @(1,5,12,28) } | ForEach-Object {
  $record = @{ name=$_.Entry; recordName=$_.Name; type=[int]$_.Type; ttl=[double]$_.TimeToLive }
  if ($_.Type -in @(5,12)) { $record.target=$_.Data } else { $record.address=$_.Data }
  $record
}); Source-Status 'dns-cache' $true $dns.Count 'Get-DnsClientCache' 'Existing A, AAAA, CNAME and PTR records only.' } catch {
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
    Source-Status 'dns-cache' $recognized $dns.Count 'ipconfig /displaydns' 'Fallback A/AAAA parser requires English output; names and TTL may be incomplete.'
    if (!$recognized) { $issues.Add('DNS hostname clues are unavailable or the cache is empty; destinations display IP addresses.') }
  } catch { Source-Status 'dns-cache' $false 0 'Windows DNS cache' 'DNS cache is unavailable.'; $issues.Add('DNS cache is unavailable; destinations will display IP addresses.') }
}
$hosts = @()
try {
  $hosts=@([IO.File]::ReadAllLines((Join-Path $env:SystemRoot 'System32\drivers\etc\hosts')))
  Source-Status 'hosts-file' $true $hosts.Count 'Local Windows hosts file' 'Static local aliases; no resolver calls.'
} catch { Source-Status 'hosts-file' $false 0 'Local Windows hosts file' 'Hosts file is absent or unreadable.' }
$netbiosCache=@()
try {
  $netbiosCache=@(& "$env:SystemRoot\System32\nbtstat.exe" /c)
  if ($LASTEXITCODE -ne 0) { throw 'NetBIOS cache unavailable.' }
  Source-Status 'netbios-cache' $true 0 'nbtstat /c' 'Existing unique host-name cache entries only. Text parser requires English type names; NetBT may be disabled.'
} catch { Source-Status 'netbios-cache' $false 0 'nbtstat /c' 'NetBIOS cache is unavailable.' }
$processNames = @{}
foreach ($entry in $processes.GetEnumerator()) { $processNames[[string]$entry.Key] = $entry.Value }
$routes=@();$neighbors=@()
$systemProxy=@{known=$false;configured=$false}
try {
  $settings=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction Stop
  $connection=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings\Connections' -ErrorAction SilentlyContinue
  $flags=0;if($connection.DefaultConnectionSettings.Length -gt 8){$flags=[int]$connection.DefaultConnectionSettings[8]}
  # Keep configuration URLs, credentials and proxy addresses out of the journal.
  $systemProxy=@{known=$true;configured=([bool]$settings.ProxyEnable -or [bool]$settings.AutoConfigURL -or (($flags -band 14) -ne 0))}
}catch{}
try {$routes=@(Get-NetRoute -ErrorAction Stop|ForEach-Object {@{destinationPrefix=$_.DestinationPrefix;nextHop=$_.NextHop;interfaceIndex=[int]$_.InterfaceIndex;routeMetric=[int]$_.RouteMetric;interfaceMetric=[int]$_.InterfaceMetric}});Source-Status 'routing-table' $true $routes.Count 'Get-NetRoute'}catch{Source-Status 'routing-table' $false 0 'Get-NetRoute' 'Routing table is unavailable.';$issues.Add('Routing-table clues are unavailable.')}
try {$neighbors=@(Get-NetNeighbor -ErrorAction Stop|ForEach-Object {@{address=$_.IPAddress;interfaceIndex=[int]$_.InterfaceIndex;mac=$_.LinkLayerAddress;state=[string]$_.State}});Source-Status 'neighbor-cache' $true $neighbors.Count 'Get-NetNeighbor' 'Includes incomplete and unreachable neighbors.'}catch{Source-Status 'neighbor-cache' $false 0 'Get-NetNeighbor' 'Neighbor cache is unavailable.'}
$networkStatistics=@{}
try {
  $global=[System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties()
  foreach ($family in @('IPv4','IPv6')) {
    try {
      $tcp=$global.('GetTcp'+$family+'Statistics')(); $udp=$global.('GetUdp'+$family+'Statistics')(); $icmp=$global.('GetIcmp'+$family.Replace('IP','')+'Statistics')()
      $networkStatistics[$family]=@{tcp=@{connectionsAccepted=$tcp.ConnectionsAccepted;connectionsInitiated=$tcp.ConnectionsInitiated;failedConnectionAttempts=$tcp.FailedConnectionAttempts;resetConnections=$tcp.ResetConnections;segmentsReceived=$tcp.SegmentsReceived;segmentsSent=$tcp.SegmentsSent;segmentsResent=$tcp.SegmentsResent;errorsReceived=$tcp.ErrorsReceived};udp=@{datagramsReceived=$udp.DatagramsReceived;datagramsSent=$udp.DatagramsSent;incomingDiscarded=$udp.IncomingDatagramsDiscarded;incomingErrors=$udp.IncomingDatagramsWithErrors};icmp=@{messagesReceived=$icmp.MessagesReceived;messagesSent=$icmp.MessagesSent;errorsReceived=$icmp.ErrorsReceived;errorsSent=$icmp.ErrorsSent}}
      Source-Status ('protocol-statistics-'+$family) $true 3 '.NET IPGlobalProperties' 'Cumulative OS TCP/UDP/ICMP counters; no per-process ICMP attribution.'
    } catch { Source-Status ('protocol-statistics-'+$family) $false 0 '.NET IPGlobalProperties' 'Protocol counters unavailable on this stack.' }
  }
} catch {}
@{ timestamp=[DateTime]::UtcNow.ToString('o'); computer=$env:COMPUTERNAME; processes=$processNames; processDetails=$processDetails; connections=$connections; adapters=$adapters; routes=$routes; neighbors=$neighbors; dns=$dns; hosts=$hosts; netbiosCache=$netbiosCache; networkStatistics=$networkStatistics; collectionSources=$collectionSources; systemProxy=$systemProxy; issues=@($issues.ToArray()) } | ConvertTo-Json -Depth 9 -Compress
