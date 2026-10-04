$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$files = @(Get-ChildItem -LiteralPath $root -Filter '*.ps1' -File)
foreach ($folder in @('desktop','test','scripts')) { $files += @(Get-ChildItem -LiteralPath (Join-Path $root $folder) -Filter '*.ps1' -File) }
foreach ($file in $files) {
  $tokens = $null; $errors = $null
  [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count) { throw ($file.Name + ': ' + (($errors | ForEach-Object { $_.Message }) -join '; ')) }
}
Write-Output ('PowerShell syntax checks passed (' + $files.Count + ' scripts).')
