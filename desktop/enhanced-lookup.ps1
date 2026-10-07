param([Parameter(Mandatory=$true)][string]$Address)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$parsed=$null
if(![Net.IPAddress]::TryParse($Address,[ref]$parsed)){throw 'An IP address is required.'}
$Address=$parsed.ToString()
$result=@{address=$Address;lookedUpAt=[DateTime]::UtcNow.ToString('o');hostnames=@();network=$null;errors=@()}
try {$result.hostnames=@(Resolve-DnsName -Name $Address -Type PTR -DnsOnly -NoHostsFile -QuickTimeout -ErrorAction Stop|Where-Object {$_.NameHost}|ForEach-Object {$_.NameHost})}catch{$result.errors+= 'Reverse DNS: '+$_.Exception.Message}
# Follow only registry referrals on explicitly approved HTTPS registry hosts.
$allowed=@('rdap.arin.net','rdap.db.ripe.net','rdap.apnic.net','rdap.lacnic.net','rdap.afrinic.net')
$uri=[Uri]('https://rdap.arin.net/registry/ip/'+$Address)
try {
  for($attempt=0;$attempt -lt 4;$attempt++) {
    if($uri.Scheme -ne 'https' -or $uri.Host -notin $allowed -or $uri.Port -ne 443 -or $uri.UserInfo){throw 'Registry referral is not allowed.'}
    $request=[Net.HttpWebRequest]::Create($uri);$request.AllowAutoRedirect=$false;$request.Timeout=6000;$request.ReadWriteTimeout=6000;$request.UserAgent='netKonnect Enhanced Lookup';$request.Accept='application/rdap+json, application/json'
    $response=$request.GetResponse()
    try {
      if([int]$response.StatusCode -in @(301,302,303,307,308)) {$uri=[Uri]::new($uri,$response.Headers['Location']);continue}
      if($response.ContentLength -gt 1048576){throw 'Registry response exceeded the size limit.'}
      $stream=$response.GetResponseStream();$memory=[IO.MemoryStream]::new();$buffer=New-Object byte[] 8192
      while(($read=$stream.Read($buffer,0,$buffer.Length)) -gt 0){$memory.Write($buffer,0,$read);if($memory.Length -gt 1048576){throw 'Registry response exceeded the size limit.'}}
      $record=[Text.Encoding]::UTF8.GetString($memory.ToArray())|ConvertFrom-Json
      $owner=@($record.entities|Where-Object {$_.roles -contains 'registrant'}|ForEach-Object {$_.vcardArray[1]|Where-Object {$_[0] -eq 'fn'}|ForEach-Object {$_[3]}})|Select-Object -First 1
      $result.network=@{name=$record.name;owner=$owner;handle=$record.handle;startAddress=$record.startAddress;endAddress=$record.endAddress;country=$record.country;source=$uri.AbsoluteUri}
      break
    }finally{if($memory){$memory.Dispose();$memory=$null};$response.Dispose()}
  }
  if(!$result.network){throw 'Registry referrals exceeded the supported limit.'}
}catch{$result.errors+='Registry: '+$_.Exception.Message}
$result|ConvertTo-Json -Depth 8 -Compress
