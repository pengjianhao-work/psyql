# Resume push when clone + commit already done (network failed on push)
# Usage: .\scripts\push-resume.ps1

param(
    [string]$CloneDir = "$env:TEMP\psyql-sync-20260727034240",
    [string]$Branch = "sync/react-rollback",
    [string]$BaseBranch = "develop",
    [string]$RepoUrl = "https://github.com/pengjianhao-work/psyql.git"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path (Join-Path $CloneDir ".git"))) {
    Write-Error "Clone not found: $CloneDir. Run push-to-github.ps1 first."
}

Push-Location $CloneDir
try {
    $branch = git branch --show-current
    Write-Host "Pushing $branch from $CloneDir ..."
    git push -u origin $Branch
    if ($LASTEXITCODE -ne 0) { Write-Error "git push failed. Check VPN/network and GitHub login." }

    $PrUrl = "$RepoUrl/compare/$BaseBranch...$Branch?expand=1"
    Write-Host "Done. Open PR: $PrUrl" -ForegroundColor Green
} finally {
    Pop-Location
}
