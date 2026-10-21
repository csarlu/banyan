# Script de instalación e integración en PowerShell para Banyan (bny)
$ErrorActionPreference = "Stop"

Write-Host "🌳 Compilando Banyan CLI v2.0.0..." -ForegroundColor Green
npm install
npm run build
npm link

$WrapperFunction = @"

# --- BANYAN (Agentic Worktree & Junction Orchestrator) ---
function bny {
    `$env:FORCE_COLOR = "3"
    `$target = banyan-bin @args
    if (`$LASTEXITCODE -eq 0 -and `$target -and (Test-Path `$target)) {
        Set-Location `$target
    }
}
# --- END BANYAN ---
"@

if (!(Test-Path -Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

$ProfileContent = Get-Content -Path $PROFILE -Raw -ErrorAction SilentlyContinue
if ($null -eq $ProfileContent -or $ProfileContent -notmatch "function bny") {
    Add-Content -Path $PROFILE -Value $WrapperFunction
    Write-Host "✔ Función 'bny' añadida a tu perfil de PowerShell ($PROFILE)." -ForegroundColor Cyan
} else {
    Write-Host "ℹ️ La función 'bny' ya existe en tu $PROFILE." -ForegroundColor Yellow
}

Write-Host "¡Listo! Ejecuta '. `$PROFILE' y luego escribe 'bny --splash' o 'bny -s' para arrancar." -ForegroundColor Green
