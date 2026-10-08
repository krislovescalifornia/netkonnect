$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$source=Join-Path $PSScriptRoot '..\lib\WindowsIcons.cs'
Add-Type -Path $source -ReferencedAssemblies System.Drawing,System.Web.Extensions
$request=[Console]::In.ReadToEnd()
if ($request.Length -gt 131072) {throw 'Icon request is too large.'}
[WindowsIcons]::Read($request)
