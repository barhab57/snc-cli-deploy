$ErrorActionPreference = 'Stop'

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeDirectory = if ($nodeCommand) {
	Split-Path $nodeCommand.Source
} else {
	$candidates = @(
		(Join-Path $env:LOCALAPPDATA 'Programs\node-v22.23.3-win-x64'),
		(Join-Path $env:ProgramFiles 'nodejs')
	)
	$candidates | Where-Object { Test-Path (Join-Path $_ 'node.exe') } | Select-Object -First 1
}

if (-not $nodeDirectory) {
	throw 'Node.js was not found. Install Node.js 22 or add node.exe to PATH.'
}

$env:PATH = "$nodeDirectory;$env:PATH"
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $npm) {
	$npmPath = Join-Path $nodeDirectory 'npm.cmd'
	if (-not (Test-Path $npmPath)) {
		throw 'npm.cmd was not found beside Node.js.'
	}
	$npmPath = $npmPath
} else {
	$npmPath = $npm.Source
}

& $npmPath run deploy
exit $LASTEXITCODE