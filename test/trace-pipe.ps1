param([string]$DataDirectory, [string]$UserId)
$ErrorActionPreference = 'Stop'
# Run the production session's duplex transport with OS identity/firewall and
# ETW mocked. The control read must remain blocked while intervals are written.
Add-Type -TypeDefinition @'
using System;
using System.Threading;
namespace NetKonnect {
  public static class TrafficTrace {
    public static void Run(int parent, int seconds, bool recover) {
      var reader = new Thread(() => Console.ReadLine());
      reader.IsBackground = true;
      reader.Start();
      Thread.Sleep(200);
      Console.WriteLine("{\"type\":\"status\",\"available\":true}");
      for (int i = 0; i < 3; i++) {
        Thread.Sleep(100);
        Console.WriteLine("{\"type\":\"traffic\",\"elapsed\":2,\"flows\":[]}");
      }
      if (!reader.Join(5000)) throw new Exception("Control stop was not received.");
    }
  }
}
'@
$fixtureExe = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\netKonnect.exe'))
function Get-Process($Id) { [pscustomobject]@{Path=$fixtureExe} }
function Get-CimInstance($ClassName,$Filter) { [pscustomobject]@{} }
function Invoke-CimMethod($InputObject,$MethodName) { [pscustomobject]@{Sid=$UserId} }
function Get-NetFirewallRule($DisplayName) { [pscustomobject]@{Enabled='True';Direction='Outbound';Action='Block'} }
function Get-NetFirewallApplicationFilter { process { [pscustomobject]@{Program=$fixtureExe} } }
function Add-Type($Path) { }
& (Join-Path $PSScriptRoot 'trace-session.ps1') -DataDirectory $DataDirectory -UserId $UserId
