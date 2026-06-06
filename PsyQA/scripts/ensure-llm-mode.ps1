# Ensure .env uses Ollama LLM by default (clear fast/skip flags)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $Root ".env"
$envExample = Join-Path $Root ".env.example"

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
OLLAMA_EMBED_MODEL=nomic-embed-text
FRONTEND_URL=http://localhost:3000
"@ | Set-Content -Path $envFile -Encoding UTF8
    }
}

$content = Get-Content -LiteralPath $envFile -Raw -ErrorAction SilentlyContinue
if (-not $content) { $content = "" }

$content = $content -replace '(?m)^\s*PSYQA_FAST_ANSWER\s*=.*\r?\n?', ''
$content = $content -replace '(?m)^\s*PSYQA_SKIP_OLLAMA\s*=.*\r?\n?', ''

if ($content -notmatch '(?m)^\s*OLLAMA_API_URL\s*=') {
    $content = $content.TrimEnd() + "`nOLLAMA_API_URL=http://localhost:11434`n"
}
if ($content -notmatch '(?m)^\s*OLLAMA_MODEL\s*=') {
    $content = $content.TrimEnd() + "`nOLLAMA_MODEL=qwen:7b`n"
}
if ($content -notmatch '(?m)^\s*OLLAMA_EMBED_MODEL\s*=') {
    $content = $content.TrimEnd() + "`nOLLAMA_EMBED_MODEL=nomic-embed-text`n"
}
if ($content -notmatch '(?m)^\s*PSYQA_CHROMA_ENABLED\s*=') {
    $content = $content.TrimEnd() + "`nPSYQA_CHROMA_ENABLED=1`n"
} else {
    $content = $content -replace '(?m)^\s*PSYQA_CHROMA_ENABLED\s*=.*$', 'PSYQA_CHROMA_ENABLED=1'
}

Set-Content -LiteralPath $envFile -Value ($content.TrimEnd() + "`n") -Encoding UTF8
