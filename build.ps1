# Packages the plugin as read-aloud-byok.xpi.
#
# Files are staged flat first, on purpose. Zipping the source directory directly pulls in
# test/ with a Windows path separator, and a backslash in a ZIP entry name is not valid —
# Zotero refuses the install with a generic "may be incompatible" message.

param(
	[string] $OutFile = (Join-Path $PSScriptRoot 'read-aloud-byok.xpi')
)

$ErrorActionPreference = 'Stop'

$manifest = Get-Content (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("byok-stage-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $stage | Out-Null
try {
	Get-ChildItem $PSScriptRoot -File |
		Where-Object { $_.Extension -notin '.xpi', '.jsonl' -and $_.Name -ne 'build.ps1' } |
		Copy-Item -Destination $stage

	if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
	Add-Type -AssemblyName System.IO.Compression.FileSystem
	[System.IO.Compression.ZipFile]::CreateFromDirectory(
		$stage, $OutFile, [System.IO.Compression.CompressionLevel]::Optimal, $false)

	$zip = [System.IO.Compression.ZipFile]::OpenRead($OutFile)
	$bad = @($zip.Entries | Where-Object { $_.FullName -match '\\' })
	$count = $zip.Entries.Count
	$zip.Dispose()
	if ($bad.Count) { throw "ZIP contains $($bad.Count) entries with backslash separators" }

	$size = [math]::Round((Get-Item $OutFile).Length / 1KB, 1)
	Write-Output "built $OutFile  (v$version, $count entries, $size KB)"
}
finally {
	Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
}
