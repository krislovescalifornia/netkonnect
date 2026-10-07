param([Parameter(Mandatory=$true)][ValidateSet('Enable','Disable','Status')][string]$Action,[Parameter(Mandatory=$true)][string]$DataDirectory,[ValidateSet('firefox','chrome','edge')][string]$Browser='firefox')
$ErrorActionPreference='Stop'
$directory=[IO.Path]::GetFullPath($DataDirectory)
if ($directory -notmatch '^[a-zA-Z]:\\' -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($directory))).DriveType -ne [IO.DriveType]::Fixed) {throw 'Browser integration requires a fixed local directory.'}
$bridge=Join-Path $directory 'browser-bridge'
$hostName='org.netkonnect.'+$Browser
$vendor=@{firefox='Mozilla';chrome='Google\Chrome';edge='Microsoft\Edge'}[$Browser]
$key='HKCU:\Software\'+$vendor+'\NativeMessagingHosts\'+$hostName
$identity=if($Browser -eq 'firefox'){'service-insight@netkonnect.local'}else{$ids=Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\browser\identities.json') -Raw|ConvertFrom-Json;'chrome-extension://'+$ids.$Browser.id+'/'}
$permission=if($Browser -eq 'firefox'){'allowed_extensions'}else{'allowed_origins'}
if ($Action -eq 'Disable') {if(Test-Path -LiteralPath $key){Remove-Item -LiteralPath $key}; @{enabled=$false}|ConvertTo-Json -Compress;exit 0}
if ($Action -eq 'Status') {
  $manifest=if(Test-Path -LiteralPath $key){(Get-Item -LiteralPath $key).GetValue('')}else{$null}
  $valid=$false
  try {$data=Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json;$valid=$manifest -eq (Join-Path $bridge ($hostName+'.json')) -and (Test-Path -LiteralPath $data.path) -and $data.$permission.Count -eq 1 -and $data.$permission[0] -eq $identity}catch{}
  @{enabled=[bool]$valid}|ConvertTo-Json -Compress;exit 0
}
[void][IO.Directory]::CreateDirectory($bridge)
$source=Join-Path $PSScriptRoot '..\lib\BrowserHost.cs'
$sha=[Security.Cryptography.SHA256]::Create()
try {$hash=([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($source)))).Replace('-','').Substring(0,16)}finally{$sha.Dispose()}
$executable=Join-Path $bridge ('netKonnectBrowserHost-'+$hash+'.exe')
if (!(Test-Path -LiteralPath $executable)) {
  $compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  $reference=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll'
  & $compiler /nologo /target:exe /platform:x64 /optimize+ ('/reference:'+$reference) ('/out:'+$executable) $source | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Windows could not prepare the browser native messaging host.'}
}
$manifest=Join-Path $bridge ($hostName+'.json')
$config=@{name=$hostName;description='Local netKonnect hostname evidence';path=$executable;type='stdio'}
$config[$permission]=@($identity)
$content=$config|ConvertTo-Json -Compress
[IO.File]::WriteAllText($manifest,$content,[Text.UTF8Encoding]::new($false))
[void](New-Item -Path $key -Force)
Set-Item -LiteralPath $key -Value $manifest
@{enabled=$true;manifest=$manifest}|ConvertTo-Json -Compress
