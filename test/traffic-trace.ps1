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
