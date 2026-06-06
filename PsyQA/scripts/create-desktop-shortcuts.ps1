# Create PsyQA shortcuts on Windows Desktop
# Run: npm run desktop-shortcuts

param(
    [switch]$AllUsers,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $PSScriptRoot "shortcuts-config.json"

if (-not (Test-Path -LiteralPath $configPath)) {
    Write-Host "Missing shortcuts-config.json" -ForegroundColor Red
    exit 1
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-DesktopPath {
    if ($AllUsers) {
        return [Environment]::GetFolderPath("CommonDesktopDirectory")
    }
    return [Environment]::GetFolderPath("Desktop")
}

function Remove-StaleShortcuts {
    param([string]$Desktop, [string[]]$KeepNames, [string]$Prefix)

    Get-ChildItem -LiteralPath $Desktop -Filter "$Prefix*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
        if ($KeepNames -notcontains $_.Name) {
            Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
            if (-not $Quiet) {
                Write-Host "  removed stale: $($_.Name)" -ForegroundColor DarkGray
            }
        }
    }
}

function New-DesktopShortcut {
    param(
        [string]$FileName,
        [string]$TargetPath,
        [string]$Description = "",
        [string]$IconLocation = "",
        [string]$Arguments = ""
    )

    $desktop = Get-DesktopPath
    $lnkPath = Join-Path $desktop $FileName
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($lnkPath)
    $sc.TargetPath = $TargetPath
    $sc.WorkingDirectory = $ProjectRoot
    $sc.Description = $Description
    $sc.WindowStyle = 1
    if ($Arguments) { $sc.Arguments = $Arguments }
    if ($IconLocation) { $sc.IconLocation = $IconLocation }
    $sc.Save()
    if (-not $Quiet) {
        Write-Host "  OK: $FileName" -ForegroundColor Green
    }
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "  PsyQA - Desktop Shortcuts" -ForegroundColor Magenta
    Write-Host "  $ProjectRoot" -ForegroundColor DarkGray
    Write-Host ""
}

$desktopPath = Get-DesktopPath
$keepNames = @($config.shortcuts | ForEach-Object { [string]$_.name })
$prefix = if ($config.cleanupPrefix) { [string]$config.cleanupPrefix } else { "心理港湾" }
Remove-StaleShortcuts -Desktop $desktopPath -KeepNames $keepNames -Prefix $prefix

$created = 0
$skipped = 0

foreach ($entry in $config.shortcuts) {
    $targetRel = [string]$entry.target
    $target = if ($targetRel -match '^\.\\') {
        Join-Path $ProjectRoot ($targetRel -replace '^\.\\', '')
    } elseif ($targetRel -match '^\.\.') {
        Join-Path $ProjectRoot $targetRel
    } else {
        Join-Path $ProjectRoot $targetRel
    }
    $target = [System.IO.Path]::GetFullPath($target)

    if (-not (Test-Path -LiteralPath $target)) {
        $alt = Join-Path $ProjectRoot (Join-Path "scripts" (Split-Path -Leaf $targetRel))
        if (Test-Path -LiteralPath $alt) {
            $target = [System.IO.Path]::GetFullPath($alt)
        }
    }

    if (-not (Test-Path -LiteralPath $target)) {
        if ($entry.optional) {
            if (-not $Quiet) {
                Write-Host "  SKIP (optional): $targetRel" -ForegroundColor Yellow
            }
            $skipped++
            continue
        }
        Write-Host "  MISSING: $targetRel" -ForegroundColor Red
        exit 1
    }

    $icon = ""
    if ($entry.icon) {
        $icon = [Environment]::ExpandEnvironmentVariables([string]$entry.icon)
    }

    New-DesktopShortcut `
        -FileName $entry.name `
        -TargetPath $target `
        -Description ([string]$entry.description) `
        -IconLocation $icon

    $created++
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "  Done. $created shortcuts -> $desktopPath" -ForegroundColor Cyan
    if ($skipped -gt 0) {
        Write-Host "  Skipped $skipped optional shortcut(s)" -ForegroundColor DarkGray
    }
    Write-Host "  Tip: use [快捷模式] for demo, [心理港湾] for full LLM" -ForegroundColor Green
    Write-Host ""
}
