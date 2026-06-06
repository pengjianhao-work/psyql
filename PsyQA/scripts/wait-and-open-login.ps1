# Wait for backend + frontend proxy, then open login page in default browser
param(
    [int]$MaxWaitSec = 120
)

$backend = "http://localhost:3001/health"
$frontendHealth = "http://localhost:3000/health"
$login = "http://localhost:3000/login"
$deadline = (Get-Date).AddSeconds($MaxWaitSec)

function Test-UrlOk {
    param([string]$Url)
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

while ((Get-Date) -lt $deadline) {
    $backendOk = Test-UrlOk -Url $backend
    $frontendOk = Test-UrlOk -Url $frontendHealth
    if ($backendOk -and $frontendOk) {
        Start-Sleep -Seconds 1
        Start-Process $login
        exit 0
    }
    Start-Sleep -Seconds 2
}

Start-Process $login
