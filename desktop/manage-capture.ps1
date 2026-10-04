param(
  [Parameter(Mandatory=$true)][ValidateSet('Enable','Disable','Status','DisableAll')][string]$Action,
  [string]$DataDirectory,
  [ValidatePattern('^S-1-(5-21|12-1)-\d+-\d+-\d+-\d+$')][string]$UserId,
  [switch]$ForInstaller
)
$ErrorActionPreference = 'Stop'
$installedRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$programRoot = [IO.Path]::GetFullPath($env:ProgramFiles) + '\'
if (-not $installedRoot.StartsWith($programRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'An elevated startup task requires an administrator-protected Program Files installation.'
}
if ($Action -eq 'DisableAll') {
  Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq 'netKonnect Detailed Capture' -or $_.TaskName -match '^netKonnect Detailed Capture S-1-(5-21|12-1)-\d+-\d+-\d+-\d+$' } | ForEach-Object {
    Stop-ScheduledTask -InputObject $_ -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -InputObject $_ -Confirm:$false
    if ($_.TaskName -match '(S-1-(5-21|12-1)-\d+-\d+-\d+-\d+)$') {
      $userRun = 'Registry::HKEY_USERS\' + $Matches[1] + '\Software\Microsoft\Windows\CurrentVersion\Run'
      if (Test-Path -LiteralPath $userRun) { Remove-ItemProperty -LiteralPath $userRun -Name 'netKonnect Companion' -ErrorAction SilentlyContinue }
    }
  }
  exit 0
}
# A per-machine installer starts elevated. Resolve the desktop owner from Windows
# rather than setting up the different account that approved its UAC prompt.
if ($ForInstaller) {
  $sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
  $desktopOwners = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" | Where-Object { $_.SessionId -eq $sessionId } | ForEach-Object { (Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid).Sid } | Select-Object -Unique)
  if ($desktopOwners.Count -ne 1) { throw 'Open netKonnect and use Easy Button to finish setup for your signed-in account.' }
  $UserId = $desktopOwners[0]
  $profilePath = [Environment]::ExpandEnvironmentVariables((Get-ItemProperty -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\' + $UserId)).ProfileImagePath)
  $DataDirectory = Join-Path $profilePath 'AppData\Local\netKonnect\data'
}
if (-not $DataDirectory) { throw 'A local journal directory is required.' }
if ($DataDirectory.Contains('"') -or $DataDirectory.Contains("`r") -or $DataDirectory.Contains("`n")) { throw 'Invalid data directory.' }
if ($DataDirectory -notmatch '^[a-zA-Z]:\\' -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($DataDirectory))).DriveType -ne [IO.DriveType]::Fixed) { throw 'Capture requires a fixed local data disk.' }
# Resolve the customer's profile from its data path, even when installation was
# approved using another administrator's credentials. Never use that admin's HKCU.
$profiles = @(Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList' | Where-Object { $_.PSChildName -match '^S-1-(5-21|12-1)-\d+-\d+-\d+-\d+$' })
$profile = $profiles | Where-Object {
  $path = [Environment]::ExpandEnvironmentVariables((Get-ItemProperty -LiteralPath $_.PSPath).ProfileImagePath)
  $expected = [IO.Path]::GetFullPath((Join-Path $path 'AppData\Local\netKonnect\data'))
  $expected -eq [IO.Path]::GetFullPath($DataDirectory) -and (-not $UserId -or $_.PSChildName -eq $UserId)
} | Select-Object -First 1
if (-not $profile) { throw 'Setup needs the signed-in customer profile and its local netKonnect journal directory.' }
$UserId = $profile.PSChildName
$taskName = 'netKonnect Detailed Capture ' + $UserId
$exe = Join-Path $installedRoot 'netKonnect.exe'
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'trace-host.ps1') + '" -DataDirectory "' + $DataDirectory + '" -UserId ' + $UserId
if ($Action -eq 'Status') {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  # Standard Windows users cannot read the firewall store. In that case the UI
  # uses the rule evidence sent by the validated SYSTEM capture session.
  $firewall = $null
  try {
    $rule = @(Get-NetFirewallRule -DisplayName 'netKonnect Offline' -ErrorAction Stop | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Outbound' -and $_.Action -eq 'Block' } | ForEach-Object { $_ | Get-NetFirewallApplicationFilter } | Where-Object { $_.Program -eq $exe })
    $firewall = $rule.Count -gt 0
  } catch { }
  $matchingTriggers = @($task.Triggers | Where-Object {
    if (-not $_.Enabled -or $_.CimClass.CimClassName -ne 'MSFT_TaskLogonTrigger') { return $false }
    try {
      $triggerSid = if ($_.UserId -match '^S-1-') { $_.UserId } else { ([Security.Principal.NTAccount]::new($_.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value }
      $triggerSid -eq $UserId
    } catch { $false }
  })
  $installed = $null -ne $task -and $task.Settings.Enabled -and $task.Principal.UserId -in @('SYSTEM','S-1-5-18') -and $task.Principal.LogonType -eq 'ServiceAccount' -and $task.Actions.Count -eq 1 -and $task.Actions[0].Execute -eq $powerShell -and $task.Actions[0].Arguments -eq $arguments -and $matchingTriggers.Count -gt 0
  @{ installed=[bool]$installed; firewall=$firewall } | ConvertTo-Json -Compress
  exit 0
}
if ($Action -eq 'Disable') {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Stop-ScheduledTask -TaskName 'netKonnect Detailed Capture' -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName 'netKonnect Detailed Capture' -Confirm:$false -ErrorAction SilentlyContinue
  exit 0
}
if (-not (Test-Path -LiteralPath $exe)) { throw 'Install netKonnect before setting up background collection.' }
# SYSTEM runs only protected, fixed scripts. The requested process must belong to
# this customer. No stored passwords, interactive admin session or repeat UAC.
$taskAction = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = @(New-ScheduledTaskTrigger -AtLogOn -User $UserId; New-ScheduledTaskTrigger -AtStartup)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Stop-ScheduledTask -TaskName 'netKonnect Detailed Capture' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'netKonnect Detailed Capture' -Confirm:$false -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
# Permit the customer to inspect the task without permitting edits to its
# privileged action. Task Scheduler otherwise may hide SYSTEM tasks from them.
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$registered = $scheduler.GetFolder('\').GetTask($taskName)
$registered.SetSecurityDescriptor('D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;' + $UserId + ')', 0)
$rule = @(Get-NetFirewallRule -DisplayName 'netKonnect Offline' -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Outbound' -and $_.Action -eq 'Block' } | ForEach-Object { $_ | Get-NetFirewallApplicationFilter } | Where-Object { $_.Program -eq $exe })
if ($rule.Count -eq 0) { New-NetFirewallRule -DisplayName 'netKonnect Offline' -Direction Outbound -Action Block -Program $exe -Enabled True -Profile Any | Out-Null }
# Installer and Easy Button share the same configuration. This registry hive is
# already loaded for the customer who launched either operation.
$runKey = 'Registry::HKEY_USERS\' + $UserId + '\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $runKey -Force | Out-Null
New-ItemProperty -LiteralPath $runKey -Name 'netKonnect Companion' -Value ('"' + $exe + '" collector') -PropertyType String -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
