$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -Path (Join-Path $root 'lib\WindowsIcons.cs') -ReferencedAssemblies System.Drawing,System.Web.Extensions
$directory=Join-Path $root ('test-results\windows-icons-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($directory)|Out-Null
$resourceLess=Join-Path $directory 'worker.exe'
[IO.File]::WriteAllBytes($resourceLess,[byte[]]@())
$explorer=Join-Path $env:SystemRoot 'explorer.exe'
$link=Join-Path $directory 'Worker.lnk'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($link);$shortcut.TargetPath=$resourceLess;$shortcut.IconLocation=$explorer+',0';$shortcut.Save()
[Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)|Out-Null
[Runtime.InteropServices.Marshal]::ReleaseComObject($shell)|Out-Null
$requests=@(@{id='file';path=$explorer;pid=0;name='explorer'},@{id='shortcut';path=$resourceLess;pid=0;name='worker'},@{id='remote';path='\\server\share\worker.exe';pid=0;name='worker'})|ConvertTo-Json -Compress
$results=[WindowsIcons]::Read($requests,[string[]]@($directory))|ConvertFrom-Json
if($results[0].status -ne 'ready' -or $results[0].source -ne 'windows-file'){throw 'File icon extraction failed.'}
if($results[1].status -ne 'ready' -or $results[1].source -ne 'windows-shortcut'){throw 'Exact-target shortcut fallback failed.'}
if($results[2].status -ne 'no-icon' -or $results[2].png){throw 'Remote icon path was accepted.'}
foreach($result in $results | Where-Object {$_.png}) {
  $bytes=[Convert]::FromBase64String($result.png);$stream=[IO.MemoryStream]::new($bytes);$bitmap=[Drawing.Bitmap]::new($stream)
  try {
    if($bitmap.Width -ne 64 -or $bitmap.Height -ne 64){throw 'Expected 64px Windows icon.'}
    $transparent=$false;$painted=$false
    for($y=0;$y -lt $bitmap.Height;$y++){for($x=0;$x -lt $bitmap.Width;$x++){$alpha=$bitmap.GetPixel($x,$y).A;if($alpha -eq 0){$transparent=$true};if($alpha -gt 128){$painted=$true}}}
    if(!$transparent -or !$painted){throw 'Windows icon alpha or visible pixels were lost.'}
    [IO.File]::WriteAllBytes((Join-Path $directory ($result.id+'.png')),$bytes)
  }finally{$bitmap.Dispose();$stream.Dispose()}
}
$wrongRequests=ConvertTo-Json -InputObject @(@{id='wrong';path=(Join-Path $directory 'other.exe');pid=0;name='other'}) -Compress
$wrongTarget=[WindowsIcons]::Read($wrongRequests,[string[]]@($directory))|ConvertFrom-Json
if($wrongTarget.png){throw 'Shortcut icon was matched to the wrong executable.'}
Write-Output 'WINDOWS_ICONS_VERIFIED file, exact-target shortcut, 64px alpha, unavailable and remote path rejection'
