$ErrorActionPreference = 'Stop'
# Execute the production configuration script with all OS mutations mocked.
# The fixture models an installed Program Files layout and a different customer
# SID than the administrator who approves setup. Nothing is enrolled on this PC.
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('nk-setup-' + [Guid]::NewGuid().ToString('N'))
$fixturePrograms = Join-Path $fixtureRoot 'Programs'
$fixtureInstall = Join-Path $fixturePrograms 'netKonnect'
$fixtureDesktop = Join-Path $fixtureInstall 'resources\app\desktop'
$fixtureCustomer = Join-Path $fixtureRoot 'Customer'
$fixtureData = Join-Path $fixtureCustomer 'AppData\Local\netKonnect\data'
$fixtureSid = 'S-1-5-21-123-456-789-1001'
$savedPrograms = $env:ProgramFiles
$global:registeredTask = $null
$global:registryValue = $null
$global:securityDescriptor = $null
$global:started = $null
$global:firewallCreated = $false
function Assert($condition, $message) { if (-not $condition) { throw $message } }
try {
  New-Item -ItemType Directory -Path $fixtureDesktop -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\desktop\manage-capture.ps1') -Destination $fixtureDesktop
  [IO.File]::WriteAllText((Join-Path $fixtureInstall 'netKonnect.exe'), '')
  $env:ProgramFiles = $fixturePrograms
  function Get-ChildItem($Path) {
    Assert ($Path -eq 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList') 'Unexpected registry read'
    [pscustomobject]@{ PSChildName=$fixtureSid; PSPath='fixture-customer' }
  }
  function Get-ItemProperty($LiteralPath) { [pscustomobject]@{ ProfileImagePath=$fixtureCustomer } }
  function Get-ScheduledTask($TaskName) { if ($TaskName -eq $global:registeredTask.TaskName) { $global:registeredTask } }
  function Stop-ScheduledTask($TaskName) { }
  function Unregister-ScheduledTask($TaskName, [switch]$Confirm) { }
  function New-ScheduledTaskAction($Execute, $Argument) { [pscustomobject]@{Execute=$Execute;Arguments=$Argument} }
  function New-ScheduledTaskTrigger([switch]$AtLogOn, [switch]$AtStartup, $User) {
    [pscustomobject]@{UserId=$User;Enabled=$true;CimClass=[pscustomobject]@{CimClassName=$(if($AtLogOn){'MSFT_TaskLogonTrigger'}else{'MSFT_TaskBootTrigger'})}}
  }
  function New-ScheduledTaskPrincipal($UserId, $LogonType, $RunLevel) { [pscustomobject]@{UserId=$UserId;LogonType=$LogonType;RunLevel=$RunLevel} }
  function New-ScheduledTaskSettingsSet($ExecutionTimeLimit, [switch]$AllowStartIfOnBatteries, [switch]$DontStopIfGoingOnBatteries, $MultipleInstances, $RestartCount, $RestartInterval) {
    [pscustomobject]@{Enabled=$true;ExecutionTimeLimit=$ExecutionTimeLimit;MultipleInstances=$MultipleInstances;RestartCount=$RestartCount}
  }
  function Register-ScheduledTask($TaskName, $Action, $Trigger, $Principal, $Settings, [switch]$Force) {
    $global:registeredTask = [pscustomobject]@{TaskName=$TaskName;Actions=@($Action);Triggers=@($Trigger);Principal=$Principal;Settings=$Settings}
  }
  function New-Object($ComObject) {
    Assert ($ComObject -eq 'Schedule.Service') 'Unexpected COM request'
    $task = [pscustomobject]@{}
    $task | Add-Member ScriptMethod SetSecurityDescriptor { param($descriptor,$flags) $global:securityDescriptor=$descriptor }
    $folder = [pscustomobject]@{Task=$task}
    $folder | Add-Member ScriptMethod GetTask { param($name) $this.Task }
    $scheduler = [pscustomobject]@{Folder=$folder}
    $scheduler | Add-Member ScriptMethod Connect { }
    $scheduler | Add-Member ScriptMethod GetFolder { param($name) $this.Folder }
    return $scheduler
  }
  function Get-NetFirewallRule($DisplayName) { if ($global:firewallCreated) { [pscustomobject]@{Enabled='True';Direction='Outbound';Action='Block'} } }
  function Get-NetFirewallApplicationFilter { process { [pscustomobject]@{Program=(Join-Path $fixtureInstall 'netKonnect.exe')} } }
  function New-NetFirewallRule($DisplayName,$Direction,$Action,$Program,$Enabled,$Profile) { $global:firewallCreated=$true }
  function New-Item($Path,[switch]$Force) { Assert ($Path.StartsWith('Registry::HKEY_USERS\' + $fixtureSid)) 'Setup writes to the approving admin account' }
  function New-ItemProperty($LiteralPath,$Name,$Value,$PropertyType,[switch]$Force) { $global:registryValue=$Value }
  function Start-ScheduledTask($TaskName) { $global:started=$TaskName }
  function Get-CimInstance($ClassName,$Filter) { [pscustomobject]@{SessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId} }
  function Invoke-CimMethod($InputObject,$MethodName) { [pscustomobject]@{Sid=$fixtureSid} }

  $setupFile = Join-Path $fixtureDesktop 'manage-capture.ps1'
  & $setupFile -Action Enable -DataDirectory $fixtureData -UserId $fixtureSid
  Assert ($global:registeredTask.Principal.UserId -eq 'SYSTEM') 'Helper needs the persistent system identity'
  Assert ($global:firewallCreated) 'Missing firewall protection was not repaired'
  Assert ($global:registeredTask.Triggers.Count -eq 2) 'Missing reboot/sign-in trigger'
  Assert ($global:registeredTask.Actions[0].Arguments.Contains('-UserId ' + $fixtureSid)) 'Missing customer identity'
  Assert ($global:started -eq ('netKonnect Detailed Capture ' + $fixtureSid)) 'Helper did not start immediately'
  Assert ($global:registryValue -eq ('"' + (Join-Path $fixtureInstall 'netKonnect.exe') + '" collector')) 'Incorrect companion startup'
  Assert ($global:securityDescriptor.Contains('(A;;GRGX;;;' + $fixtureSid + ')')) 'Customer cannot inspect or start their helper'
  $status = (& $setupFile -Action Status -DataDirectory $fixtureData -UserId $fixtureSid) | ConvertFrom-Json
  Assert ($status.installed -and $status.firewall) 'Correct installation did not pass status'
  $global:registeredTask.Actions[0].Arguments = 'wrong installation'
  $status = (& $setupFile -Action Status -DataDirectory $fixtureData -UserId $fixtureSid) | ConvertFrom-Json
  Assert (-not $status.installed) 'A task with the right name and wrong action passed status'
  # Task Scheduler canonicalizes SID triggers to account names on real Windows.
  $fixtureSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & $setupFile -Action Enable -DataDirectory $fixtureData -UserId $fixtureSid
  $global:registeredTask.Triggers[0].UserId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $status = (& $setupFile -Action Status -DataDirectory $fixtureData -UserId $fixtureSid) | ConvertFrom-Json
  Assert $status.installed 'Windows account-name trigger was incorrectly rejected'
  $global:registeredTask.Triggers[0].UserId = 'NT AUTHORITY\SYSTEM'
  $status = (& $setupFile -Action Status -DataDirectory $fixtureData -UserId $fixtureSid) | ConvertFrom-Json
  Assert (-not $status.installed) 'A different trigger owner was accepted'
  function Get-NetFirewallRule($DisplayName) { throw [UnauthorizedAccessException]::new('Access is denied.') }
  $status = (& $setupFile -Action Status -DataDirectory $fixtureData -UserId $fixtureSid) | ConvertFrom-Json
  Assert ($null -eq $status.firewall) 'Denied firewall access was reported as a missing rule'
  function Get-NetFirewallRule($DisplayName) { if ($global:firewallCreated) { [pscustomobject]@{Enabled='True';Direction='Outbound';Action='Block'} } }
  & $setupFile -Action Enable -ForInstaller
  Assert ($global:registeredTask.TaskName.EndsWith($fixtureSid)) 'Installer configured the approving admin instead of the desktop owner'
  Write-Output 'Setup task checks passed.'
} finally {
  $env:ProgramFiles = $savedPrograms
  # The fixture root is an absolute child of TEMP, created above with a random ID.
  $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
  $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if ($resolvedFixture.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
    Microsoft.PowerShell.Management\Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
  }
}
