# 释放 PsyQA 开发端口（3000 前端 / 3001 后端），避免 EADDRINUSE 导致「后端未启动」
param(
    [int[]]$Ports = @(3000, 3001)
)

$ErrorActionPreference = 'SilentlyContinue'

function Stop-PortListener {
    param([int]$Port)

    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { return }

    $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        if ($proc.ProcessName -notin @('node', 'nodejs')) { continue }
        Write-Host "[free-ports] 停止 $($proc.ProcessName) (PID $procId) 占用端口 $Port"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

function Stop-PortListenerNetstat {
    param([int]$Port)

    $lines = netstat -ano -p tcp 2>$null | Select-String ":$Port\s" | Select-String 'LISTENING'
    foreach ($line in $lines) {
        $procId = [int]($line -replace '\s+', ' ' -split ' ')[-1]
        if ($procId -le 0) { continue }
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        if ($proc.ProcessName -notin @('node', 'nodejs')) { continue }
        Write-Host "[free-ports/netstat] 停止 $($proc.ProcessName) (PID $procId) 占用端口 $Port"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

foreach ($port in $Ports) {
    Stop-PortListener -Port $port
    Stop-PortListenerNetstat -Port $port
}

Start-Sleep -Milliseconds 600
