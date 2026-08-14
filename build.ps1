# Packages src/ as target/read-aloud-byok.xpi
#
# Entries are added one at a time rather than with ZipFile::CreateFromDirectory, which on
# Windows writes subdirectory entries with a backslash. A backslash is not a valid ZIP path
# separator, and Zotero rejects such a package with a generic "may be incompatible" message.

param(
	[string] $Source = (Join-Path $PSScriptRoot 'src'),
	[string] $TargetDir = (Join-Path $PSScriptRoot 'target'),
	# Which update manifest the packaged plugin polls. Zotero reads update_url from the
	# installed manifest and nothing at runtime can redirect it, so the channel is baked in
	# at build time — switching channels means installing the other build once.
	[ValidateSet('stable', 'dev')]
	[string] $Channel = 'stable'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$manifestPath = Join-Path $Source 'manifest.json'

# PowerShell's utf8 encoding writes a byte order mark, and a BOM ahead of the opening brace
# makes strict JSON parsers reject the manifest. ConvertFrom-Json tolerates it, so it would
# otherwise only surface once Zotero refused the install.
$bytes = [System.IO.File]::ReadAllBytes($manifestPath)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
	throw 'manifest.json starts with a UTF-8 BOM; write it without one'
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version

# The source manifest always names the stable channel; a dev build has its update_url
# rewritten on the way into the archive, so src/manifest.json is never left pointing
# somewhere unexpected.
$manifestEntry = $manifestPath
$tempManifest = $null
if ($Channel -eq 'dev') {
	$raw = Get-Content $manifestPath -Raw
	$devUrl = 'https://raw.githubusercontent.com/GeneralPawz/zotero-tts-byok/main/update-dev.json'
	$pattern = '"update_url":' + [char]92 + 's*"[^"]*"'
	$patched = $raw -replace $pattern, ('"update_url": "' + $devUrl + '"')
	if ($patched -eq $raw) { throw 'could not rewrite update_url for the dev channel' }
	$tempManifest = Join-Path ([System.IO.Path]::GetTempPath()) 'byok-manifest.json'
	[System.IO.File]::WriteAllText($tempManifest, $patched, (New-Object System.Text.UTF8Encoding $false))
	$manifestEntry = $tempManifest
}

New-Item -ItemType Directory -Force $TargetDir | Out-Null
$outFile = Join-Path $TargetDir 'read-aloud-byok.xpi'
if (Test-Path $outFile) { Remove-Item $outFile -Force }

$root = (Resolve-Path $Source).Path.TrimEnd('\')
$files = Get-ChildItem $Source -File -Recurse |
	Where-Object { $_.Extension -notin '.xpi', '.jsonl' -and -not $_.Name.StartsWith('.') }

$zip = [System.IO.Compression.ZipFile]::Open($outFile, 'Create')
try {
	# Ship the licence alongside the code
	$license = Join-Path $PSScriptRoot 'LICENSE'
	if (Test-Path $license) {
		[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
			$zip, $license, 'LICENSE', [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
	}
	foreach ($file in $files) {
		$name = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
		$source = $file.FullName
		if ($name -eq 'manifest.json') { $source = $manifestEntry }
		[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
			$zip, $source, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
	}
}
finally {
	$zip.Dispose()
}

# manifest.json must sit at the archive root, and no entry may contain a backslash
$check = [System.IO.Compression.ZipFile]::OpenRead($outFile)
$names = $check.Entries | ForEach-Object { $_.FullName }
$count = $check.Entries.Count
$check.Dispose()

$bad = @($names | Where-Object { $_ -match '\\' })
if ($bad.Count) { throw "ZIP contains backslash separators: $($bad -join ', ')" }
if ($names -notcontains 'manifest.json') { throw 'manifest.json is missing from the archive root' }

$size = [math]::Round((Get-Item $outFile).Length / 1KB, 1)
if ($tempManifest -and (Test-Path $tempManifest)) { Remove-Item $tempManifest -Force }
Write-Output "built $outFile  (v$version, $Channel channel, $count entries, $size KB)"
