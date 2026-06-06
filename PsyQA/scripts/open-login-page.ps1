# Open login page; warn if backend is not ready
$ErrorActionPreference = 'SilentlyContinue'
$login = 'http://localhost:3000/login'
$health = 'http://localhost:3001/health'

try {
    $r = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
        Start-Process $login
        exit 0
    }
} catch {
    # backend not running
}

$frontend = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($frontend) {
    Start-Process $login
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show(
    "心理港湾尚未启动。`n`n请先双击桌面「心理港湾 - 快捷模式」或「心理港湾」启动系统，再打开登录页。",
    '心理港湾',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
) | Out-Null
