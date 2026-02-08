# ============================================
# OpenCode Server + Chatbot UI — Start Script (Windows)
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenCode Server + Chatbot UI" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check if OpenCode auth exists
$authPath = "$env:USERPROFILE\.config\opencode"
if (Test-Path $authPath) {
    Write-Host "[OK] Found OpenCode auth config at $authPath" -ForegroundColor Green
} else {
    Write-Host "[WARN] No OpenCode auth config found at $authPath" -ForegroundColor Yellow
    Write-Host "       Run 'opencode auth login' first to authenticate with Copilot" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y") { exit 0 }
}

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Cyan
Write-Host "  - OpenCode Server: http://localhost:4096" -ForegroundColor White
Write-Host "  - Chatbot UI:      http://localhost:3000" -ForegroundColor White
Write-Host ""

# Build and start with Windows override
docker-compose -f docker-compose.yml -f docker-compose.windows.yml up --build
