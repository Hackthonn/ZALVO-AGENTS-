# ZALVO one-step installer for Windows.
# Run:  double-click install.bat   (or)   powershell -ExecutionPolicy Bypass -File install.ps1
# Options: -NoShortcut  (skip Desktop shortcut)
#          -AddToPath   (add `zalvo` to your user PATH without asking)
#          -NoPath      (never touch PATH, don't ask)
param([switch]$NoShortcut, [switch]$AddToPath, [switch]$NoPath)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Say($msg, $color = "Yellow") { Write-Host "[ZALVO] $msg" -ForegroundColor $color }

Say "Installing ZALVO in: $Root"

# 1) uv (Python package manager). It also downloads Python 3.14 by itself, so no Python install needed.
$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
    Say "uv not found - installing uv (https://astral.sh/uv) ..."
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    $env:Path = "$env:USERPROFILE\.local\bin;$env:USERPROFILE\.cargo\bin;$env:Path"
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if (-not $uv) { Say "uv install failed. Install it from https://docs.astral.sh/uv/ and run again." "Red"; exit 1 }
}
Say "uv: $($uv.Source)" "Green"

# 2) Python env + dependencies (exact versions from uv.lock) into .venv
Say "Setting up Python environment (first time takes a few minutes) ..."
& uv sync --frozen --python 3.14
if ($LASTEXITCODE -ne 0) { Say "Dependency install failed (see error above)." "Red"; exit 1 }

$exe = Join-Path $Root ".venv\Scripts\zalvo.exe"
if (-not (Test-Path $exe)) { Say "zalvo.exe was not created - install failed." "Red"; exit 1 }

# 3) Desktop shortcut named ZALVO
if (-not $NoShortcut) {
    try {
        $desktop = [Environment]::GetFolderPath("Desktop")
        $shell = New-Object -ComObject WScript.Shell
        $lnk = $shell.CreateShortcut((Join-Path $desktop "ZALVO.lnk"))
        $lnk.TargetPath = Join-Path $Root "ZALVO.bat"
        $lnk.WorkingDirectory = $env:USERPROFILE
        $icon = Join-Path $Root "apps\desktop\assets\icon.ico"
        if (Test-Path $icon) { $lnk.IconLocation = $icon }
        $lnk.Description = "ZALVO AI Agent"
        $lnk.Save()
        Say "Desktop shortcut 'ZALVO' created." "Green"
    } catch { Say "Could not create Desktop shortcut: $_" }
}

# 4) Optional: make `zalvo` work from any terminal
$bin = Join-Path $Root "bin"
if (-not $AddToPath -and -not $NoPath) {
    $ans = Read-Host "[ZALVO] Add 'zalvo' command to your PATH so it works in any terminal? (Y/n)"
    $AddToPath = ($ans -eq "" -or $ans -match "^[Yy]")
}
if ($AddToPath) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (($userPath -split ";") -notcontains $bin) {
        [Environment]::SetEnvironmentVariable("Path", (($userPath.TrimEnd(";") + ";" + $bin).TrimStart(";")), "User")
        Say "Added $bin to your user PATH (open a NEW terminal to use 'zalvo')." "Green"
    } else { Say "'zalvo' is already on your PATH." "Green" }
}

& $exe --version
Say "Done! Start ZALVO: double-click the ZALVO shortcut / ZALVO.bat, or type 'zalvo' in a new terminal." "Green"
Say "First run: 'zalvo setup' (or 'zalvo model') to pick your AI provider and add your API key." "Green"
