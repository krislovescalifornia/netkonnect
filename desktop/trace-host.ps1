param([Parameter(Mandatory=$true)][string]$DataDirectory, [Parameter(Mandatory=$true)][ValidatePattern('^S-1-(5-21|12-1)-\d+-\d+-\d+-\d+$')][string]$UserId)
$ErrorActionPreference = 'Stop'
if ($DataDirectory -notmatch '^[a-zA-Z]:\\' -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($DataDirectory))).DriveType -ne [IO.DriveType]::Fixed) { throw 'Capture requires a fixed local data disk.' }
$expected = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\netKonnect.exe'))
while ($true) {
  try {
    $request = Get-Content -LiteralPath (Join-Path $DataDirectory 'trace-request.json') -Raw | ConvertFrom-Json
    $parent = Get-Process -Id ([int]$request.parentId) -ErrorAction Stop
    $owner = Invoke-CimMethod -InputObject (Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$request.parentId)) -MethodName GetOwnerSid
    if ($parent.Path -eq $expected -and $owner.Sid -eq $UserId) {
      # New process per ETW session: trace static state cannot leak into retries.
      & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'trace-session.ps1') -DataDirectory $DataDirectory -UserId $UserId
    }
  } catch { # The companion may not have started yet, or the user has quit it.
  }
  Start-Sleep -Seconds 5
}
