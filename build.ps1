# Packages src/ as target/read-aloud-byok.xpi
#
# Entries are added one at a time rather than with ZipFile::CreateFromDirectory, which on
# Windows writes subdirectory entries with a backslash. A backslash is not a valid ZIP path
# separator, and Zotero rejects such a package with a generic "may be incompatible" message.

param(
	[string] $Source = (Join-Path $PSScriptRoot 'src'),
	[string] $TargetDir = (Join-Path $PSScriptRoot 'target')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$manifest = Get-Content (Join-Path $Source 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

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
		[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
			$zip, $file.FullName, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
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
Write-Output "built $outFile  (v$version, $count entries, $size KB)"
