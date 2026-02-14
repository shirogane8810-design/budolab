$ProgressPreference = 'SilentlyContinue'
$zipPath = Join-Path $env:TEMP 'gh.zip'
$installPath = Join-Path $env:LOCALAPPDATA 'gh-cli'

Write-Output "Downloading GitHub CLI..."
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cli/cli/releases/download/v2.67.0/gh_2.67.0_windows_amd64.zip' -OutFile $zipPath

Write-Output "Extracting..."
if (Test-Path $installPath) { Remove-Item $installPath -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $installPath -Force

$ghBin = Join-Path $installPath 'gh_2.67.0_windows_amd64\bin'
$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ($userPath -notlike "*$ghBin*") {
    [Environment]::SetEnvironmentVariable('PATH', "$userPath;$ghBin", 'User')
    Write-Output "Added to PATH: $ghBin"
}

$ghExe = Join-Path $ghBin 'gh.exe'
Write-Output "Installed: $ghExe"
& $ghExe --version
