$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -Path (Join-Path $PSScriptRoot '..\lib\NameTrace.cs') -ReferencedAssemblies System.dll,System.Core.dll,System.Xml.dll
$xml='<Event><EventData><Data Name="ProcessId">0x2a</Data><Data Name="Direction">%%14593</Data><Data Name="SourceAddress">192.168.1.2</Data><Data Name="SourcePort">50000</Data><Data Name="DestAddress">8.8.8.8</Data><Data Name="DestPort">443</Data><Data Name="Protocol">17</Data></EventData></Event>'
$at=[DateTime]::UtcNow
$outbound=([NetKonnect.NameTrace]::ParseFirewall($xml,5157,$at)|ConvertFrom-Json).records[0]
if($outbound.pid -ne 42 -or $outbound.protocol -ne 'UDP' -or $outbound.outcome -ne 'blocked' -or $outbound.localAddress -ne '192.168.1.2' -or $outbound.remotePort -ne 443 -or ([DateTime]$outbound.seenAt).ToUniversalTime() -ne $at){throw ('Firewall outbound schema or timestamp mismatch: '+($outbound|ConvertTo-Json -Compress))}
$inbound=([NetKonnect.NameTrace]::ParseFirewall($xml.Replace('%%14593','%%14592').Replace('>17<','>6<'),5156,$at)|ConvertFrom-Json).records[0]
if($inbound.localAddress -ne '8.8.8.8' -or $inbound.remoteAddress -ne '192.168.1.2' -or $inbound.protocol -ne 'TCP' -or $inbound.outcome -ne 'permitted' -or $inbound.localPort -ne 443){throw 'Firewall inbound schema mismatch.'}
if([NetKonnect.NameTrace]::ParseFirewall($xml.Replace('%%14593','unknown'),5157,$at) -or [NetKonnect.NameTrace]::ParseFirewall($xml,1,$at)){throw 'Unsupported audit schema was accepted.'}
[NetKonnect.NameTrace]::Start($false)
try {Start-Sleep -Milliseconds 100} finally {[NetKonnect.NameTrace]::Stop()}
