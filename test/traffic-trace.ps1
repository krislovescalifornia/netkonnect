$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot '..\lib\TrafficTrace.cs')
$traceType = [NetKonnect.TrafficTrace]
$privateStatic = [Reflection.BindingFlags]'NonPublic,Static'
$localField = $traceType.GetField('local', $privateStatic)
$locals = [Collections.Generic.HashSet[string]]::new()
[void]$locals.Add('192.168.1.2')
[void]$locals.Add('2001:db8::2')
$localField.SetValue($null, $locals)
$callback = $traceType.GetMethod('OnEvent', $privateStatic)
$flowsField = $traceType.GetField('flows', $privateStatic)
foreach ($protocol in @('TCP','UDP')) {
  foreach ($ipv6 in @($false,$true)) {
    foreach ($incoming in @($false,$true)) {
      $payload = New-Object byte[] 64
      [BitConverter]::GetBytes([int]45).CopyTo($payload,0)
      [BitConverter]::GetBytes([int]1200).CopyTo($payload,4)
      $localIp = '192.168.1.2'; $remoteIp = '142.250.1.1'
      if ($ipv6) { $localIp='2001:db8::2'; $remoteIp='2001:db8::5' }
      $dest = $remoteIp; $source = $localIp; $dp=443; $sp=50123
      if ($incoming) { $dest=$localIp; $source=$remoteIp; $dp=50123; $sp=443 }
      [Net.IPAddress]::Parse($dest).GetAddressBytes().CopyTo($payload,8)
      $srcOffset=12; $portOffset=16
      if ($ipv6) { $srcOffset=24; $portOffset=40 }
      [Net.IPAddress]::Parse($source).GetAddressBytes().CopyTo($payload,$srcOffset)
      $payload[$portOffset]=[byte][Math]::Floor($dp/256); $payload[$portOffset+1]=[byte]($dp%256)
      $payload[$portOffset+2]=[byte][Math]::Floor($sp/256); $payload[$portOffset+3]=[byte]($sp%256)
      $record = New-Object byte[] 112
      $guid='9a280ac0-c8e0-11d1-84e2-00c04fb998a2'
      if ($protocol -eq 'UDP') { $guid='bf3a50c5-a9c9-4988-a005-2df0b7c80f80' }
      ([Guid]$guid).ToByteArray().CopyTo($record,24)
      $record[42]=2; $record[45]=10
      if ($incoming) { $record[45]=11 }
      if ($ipv6) { $record[45]+=16 }
      $record[86]=64
      $dataPtr=[Runtime.InteropServices.Marshal]::AllocHGlobal(64)
      $eventPtr=[Runtime.InteropServices.Marshal]::AllocHGlobal(112)
      try {
        [Runtime.InteropServices.Marshal]::Copy($payload,0,$dataPtr,64)
        [BitConverter]::GetBytes($dataPtr.ToInt64()).CopyTo($record,96)
        [Runtime.InteropServices.Marshal]::Copy($record,0,$eventPtr,112)
        [void]$callback.Invoke($null,@($eventPtr))
        $key="$protocol|45|$localIp|50123|$remoteIp|443"
        $flow=$flowsField.GetValue($null)[$key]
        if (!$flow) { throw "Missing parsed flow: $key" }
        $flags=[Reflection.BindingFlags]'Public,Instance'
        $counter='Sent'; if ($incoming) { $counter='Received' }
        if ($flow.GetType().GetField($counter,$flags).GetValue($flow) -ne 1200) { throw "Wrong $counter bytes for $key" }
      } finally {
        [Runtime.InteropServices.Marshal]::FreeHGlobal($dataPtr)
        [Runtime.InteropServices.Marshal]::FreeHGlobal($eventPtr)
      }
    }
  }
}
Write-Output 'ETW decoder: TCP/UDP, IPv4/IPv6, upload/download passed (8 cases).'

function Invoke-NetworkEvent([string]$Protocol='TCP',[int]$Opcode=10,[string]$Source='192.168.1.2',[string]$Destination='8.8.8.8',[int]$SourcePort=50123,[int]$DestinationPort=443,[int]$Version=2,[int]$Length=64) {
  $ipv6=$Source.Contains(':');$srcOffset=12;$portOffset=16
  if($ipv6){$srcOffset=24;$portOffset=40}
  $payload=New-Object byte[] 64
  [BitConverter]::GetBytes([int]45).CopyTo($payload,0)
  [BitConverter]::GetBytes([int]1200).CopyTo($payload,4)
  [Net.IPAddress]::Parse($Destination).GetAddressBytes().CopyTo($payload,8)
  [Net.IPAddress]::Parse($Source).GetAddressBytes().CopyTo($payload,$srcOffset)
  $payload[$portOffset]=[byte][Math]::Floor($DestinationPort/256);$payload[$portOffset+1]=[byte]($DestinationPort%256)
  $payload[$portOffset+2]=[byte][Math]::Floor($SourcePort/256);$payload[$portOffset+3]=[byte]($SourcePort%256)
  $record=New-Object byte[] 112
  $guid='9a280ac0-c8e0-11d1-84e2-00c04fb998a2';if($Protocol -eq 'UDP'){$guid='bf3a50c5-a9c9-4988-a005-2df0b7c80f80'}
  ([Guid]$guid).ToByteArray().CopyTo($record,24)
  $record[42]=[byte]$Version;$record[45]=[byte]$Opcode;$record[86]=[byte]$Length
  $dataPtr=[Runtime.InteropServices.Marshal]::AllocHGlobal(64);$eventPtr=[Runtime.InteropServices.Marshal]::AllocHGlobal(112)
  try {
    [Runtime.InteropServices.Marshal]::Copy($payload,0,$dataPtr,64)
    [BitConverter]::GetBytes($dataPtr.ToInt64()).CopyTo($record,96)
    [Runtime.InteropServices.Marshal]::Copy($record,0,$eventPtr,112)
    [void]$callback.Invoke($null,@($eventPtr))
  } finally {[Runtime.InteropServices.Marshal]::FreeHGlobal($dataPtr);[Runtime.InteropServices.Marshal]::FreeHGlobal($eventPtr)}
}
$flowFlags=[Reflection.BindingFlags]'Public,Instance'
function Flow-Value($flow,$name){$flow.GetType().GetField($name,$flowFlags).GetValue($flow)}
$parsed=$flowsField.GetValue($null);$parsed.Clear()
$cases=@(
  @{protocol='UDP';opcode=11;source='192.168.1.10';destination='224.0.0.251';sp=5353;dp=5353;local='224.0.0.251';remote='192.168.1.10'},
  @{protocol='UDP';opcode=11;source='192.168.1.10';destination='255.255.255.255';sp=67;dp=68;local='255.255.255.255';remote='192.168.1.10'},
  @{protocol='UDP';opcode=27;source='fe80::10';destination='ff02::fb';sp=5353;dp=5353;local='ff02::fb';remote='fe80::10'},
  @{protocol='TCP';opcode=10;source='10.0.0.5';destination='8.8.8.8';sp=50123;dp=443;local='10.0.0.5';remote='8.8.8.8'},
  @{protocol='TCP';opcode=11;source='8.8.8.8';destination='10.0.0.5';sp=443;dp=50123;local='10.0.0.5';remote='8.8.8.8'},
  @{protocol='TCP';opcode=11;source='127.0.0.1';destination='127.0.0.1';sp=443;dp=50123;local='127.0.0.1';remote='127.0.0.1'}
)
foreach($case in $cases) {
  $parsed.Clear()
  Invoke-NetworkEvent -Protocol $case.protocol -Opcode $case.opcode -Source $case.source -Destination $case.destination -SourcePort $case.sp -DestinationPort $case.dp
  $row=@($parsed.Values)[0]
  if(!$row -or (Flow-Value $row 'LocalAddress') -ne $case.local -or (Flow-Value $row 'RemoteAddress') -ne $case.remote){throw 'Group, loopback, or changing-adapter event was lost or reversed.'}
  if($case.opcode -in @(11,27) -and (Flow-Value $row 'LocalPort') -ne $case.dp){throw 'Inbound local port orientation failed.'}
}
foreach($ipv6 in @($false,$true)) {
  foreach($kind in @(12,13,14,15,16)) {
    $parsed.Clear();$opcode=$kind;$source='192.168.1.2';$dest='8.8.8.8'
    if($ipv6){$opcode+=16;$source='2001:db8::2';$dest='2001:db8::5'}
    Invoke-NetworkEvent -Opcode $opcode -Source $source -Destination $dest
    $row=@($parsed.Values)[0]
    if(!$row -or (Flow-Value $row 'Received') -ne 0 -or (Flow-Value $row 'Sent') -ne 0){throw 'Lifecycle or retransmission fabricated usage bytes.'}
    $counter=@{12='ConnectEvents';13='DisconnectEvents';14='RetransmitEvents';15='AcceptEvents';16='ReconnectEvents'}[$kind]
    if((Flow-Value $row $counter) -ne 1){throw "Missing $counter"}
    if($kind -eq 14 -and (Flow-Value $row 'RetransmittedBytes') -ne 1200){throw 'Retransmission diagnostic missing.'}
  }
}
$parsed.Clear()
Invoke-NetworkEvent -Version 3
Invoke-NetworkEvent -Length 4
Invoke-NetworkEvent -Protocol UDP -Opcode 12
if($parsed.Count -ne 0 -or $traceType.GetField('unsupportedEvents',$privateStatic).GetValue($null) -lt 1 -or $traceType.GetField('malformedEvents',$privateStatic).GetValue($null) -lt 1){throw 'Invalid schemas were accepted or silently ignored.'}
$ownerType=$traceType.GetNestedType('Owner',[Reflection.BindingFlags]'NonPublic')
$ownerMap=$traceType.GetField('owners',$privateStatic).GetValue($null)
foreach($started in @('2026-10-07T00:00:00.0000000Z','2026-10-07T00:00:01.0000000Z')) {
  $owner=[Activator]::CreateInstance($ownerType,$true)
  $ownerType.GetField('Name',$flowFlags).SetValue($owner,'short-lived')
  $ownerType.GetField('StartedAt',$flowFlags).SetValue($owner,$started)
  $ownerMap[45]=$owner
  Invoke-NetworkEvent
}
$ownerMap.Remove(45) | Out-Null
if($parsed.Count -ne 2 -or @($parsed.Values | Where-Object {(Flow-Value $_ 'Owner').StartedAt -eq '2026-10-07T00:00:00.0000000Z'}).Count -ne 1){throw 'PID reuse merged kernel owner lifetimes.'}
$sample=@($parsed.Values)[0];$parsed.Clear()
for($i=0;$i -lt 20000;$i++){$parsed.Add("capacity-$i",$sample)}
Invoke-NetworkEvent
if($parsed.Count -ne 20000 -or $traceType.GetField('droppedFlowEvents',$privateStatic).GetValue($null) -lt 1){throw 'Capacity loss was silent.'}
$parsed.Clear()
$traceType.GetMethod('RefreshLocalAddresses',$privateStatic).Invoke($null,@()) | Out-Null
$refreshed=$localField.GetValue($null)
if(!$refreshed.Contains('::1') -or @($refreshed | Where-Object {$_ -match '%'}).Count){throw 'Refreshed ETW addresses retain scope IDs or omit loopback.'}
Write-Output 'ETW edge cases: multicast/broadcast, loopback, address changes, TCP lifecycle, retransmissions, PID reuse, schema and capacity diagnostics passed.'
