param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
# Exercise the production script and real compiler with a disposable registry store.
$global:BridgeTestRegistry=@{}
function Test-Path {param([string]$LiteralPath) if($LiteralPath.StartsWith('HKCU:')){return $global:BridgeTestRegistry.ContainsKey($LiteralPath)} Microsoft.PowerShell.Management\Test-Path -LiteralPath $LiteralPath}
function New-Item {param([string]$Path,[switch]$Force) if(!$Path.StartsWith('HKCU:')){throw 'Unexpected registry test path'} $global:BridgeTestRegistry[$Path]=$null}
function Set-Item {param([string]$LiteralPath,[string]$Value) $global:BridgeTestRegistry[$LiteralPath]=$Value}
function Get-Item {param([string]$LiteralPath) $item=[pscustomobject]@{Value=$global:BridgeTestRegistry[$LiteralPath]};$item|Add-Member ScriptMethod GetValue {param($Name) $this.Value};return $item}
function Remove-Item {param([string]$LiteralPath) [void]$global:BridgeTestRegistry.Remove($LiteralPath)}
$scriptFile=Join-Path $PSScriptRoot '..\desktop\browser-bridge.ps1'
$ids=Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\browser\identities.json') -Raw|ConvertFrom-Json
foreach($browser in @('firefox','chrome','edge')){
  $result=& $scriptFile -Action Enable -Browser $browser -DataDirectory $Directory|ConvertFrom-Json
  if(!$result.enabled){throw 'Bridge was not enabled'}
  $manifest=Get-Content -LiteralPath $result.manifest -Raw|ConvertFrom-Json
  if($manifest.name -ne ('org.netkonnect.'+$browser)){throw 'Incorrect native host name'}
  if($browser -eq 'firefox'){if($manifest.allowed_extensions[0] -ne 'service-insight@netkonnect.local'){throw 'Incorrect Firefox allowlist'}}
  elseif($manifest.allowed_origins.Count -ne 1 -or $manifest.allowed_origins[0] -ne ('chrome-extension://'+$ids.$browser.id+'/')){throw 'Incorrect Chromium origin allowlist'}
  $status=& $scriptFile -Action Status -Browser $browser -DataDirectory $Directory|ConvertFrom-Json
  if(!$status.enabled){throw 'Registered bridge did not validate'}
}
if($global:BridgeTestRegistry.Count -ne 3){throw 'Expected separate registry registrations'}
if(!($global:BridgeTestRegistry.Keys -match 'Google\\Chrome') -or !($global:BridgeTestRegistry.Keys -match 'Microsoft\\Edge')){throw 'Incorrect vendor registry keys'}
& $scriptFile -Action Disable -Browser chrome -DataDirectory $Directory|Out-Null
if($global:BridgeTestRegistry.Count -ne 2){throw 'Disable changed other browser registrations'}
if(!((& $scriptFile -Action Status -Browser edge -DataDirectory $Directory|ConvertFrom-Json).enabled)){throw 'Edge registration lost after Chrome was disabled'}
'BROWSER_BRIDGE_VERIFIED'
