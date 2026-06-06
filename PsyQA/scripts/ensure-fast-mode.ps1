# Quick / demo mode: rule + knowledge base, no Ollama / Chroma dependency
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $Root ".env"
$envExample = Join-Path $Root ".env.example"

function Set-EnvLine {
    param([string]$Content, [string]$Key, [string]$Value)
    if ($Content -match "(?m)^\s*$([regex]::Escape($Key))\s*=") {
        return ($Content -replace "(?m)^\s*$([regex]::Escape($Key))\s*=.*$", "$Key=$Value")
    }
    return ($Content.TrimEnd() + "`n$Key=$Value`n")
}

if (-not (Test-Path -LiteralPath $envFile)) {
    if (Test-Path -LiteralPath $envExample) {
        Copy-Item -LiteralPath $envExample -Destination $envFile
    } else {
        @"
PORT=3001
NODE_ENV=development
AUTH_SECRET=psyqa-dev-secret-change-me-local-only
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=qwen:7b
FRONTEND_URL=http://localhost:3000
PSYQA_FAST_ANSWER=1
PSYQA_SKIP_OLLAMA=1
PSYQA_CHROMA_ENABLED=0
"@ | Set-Content -Path $envFile -Encoding UTF8
        exit 0
    }
}

$content = Get-Content -LiteralPath $envFile -Raw -ErrorAction SilentlyContinue
if (-not $content) { $content = "" }

$content = $content -replace '(?m)^\s*PSYQA_FAST_ANSWER\s*=.*\r?\n?', ''
$content = $content -replace '(?m)^\s*PSYQA_SKIP_OLLAMA\s*=.*\r?\n?', ''
$content = $content.TrimEnd()
$content = Set-EnvLine $content 'PSYQA_FAST_ANSWER' '1'
$content = Set-EnvLine $content 'PSYQA_SKIP_OLLAMA' '1'
$content = Set-EnvLine $content 'PSYQA_CHROMA_ENABLED' '0'

Set-Content -LiteralPath $envFile -Value ($content.TrimEnd() + "`n") -Encoding UTF8
