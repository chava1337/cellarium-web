# 🚀 Script de Prebuild para Módulo de Cámara Profesional (Windows)
# Configura el proyecto para usar react-native-vision-camera

Write-Host "🎥 Configurando módulo de cámara profesional..." -ForegroundColor Cyan

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: No se encontró package.json. Ejecuta este script desde la raíz del proyecto." -ForegroundColor Red
    exit 1
}

# Verificar dependencias instaladas
Write-Host "📦 Verificando dependencias..." -ForegroundColor Yellow
try {
    $visionCamera = npm list react-native-vision-camera 2>$null
    if (-not $visionCamera) {
        throw "react-native-vision-camera no está instalado"
    }
    
    $reanimated = npm list react-native-reanimated 2>$null
    if (-not $reanimated) {
        throw "react-native-reanimated no está instalado"
    }
    
    Write-Host "✅ Dependencias verificadas" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    Write-Host "Ejecuta: npm install react-native-vision-camera react-native-reanimated --legacy-peer-deps" -ForegroundColor Yellow
    exit 1
}

# Verificar configuración de Babel
Write-Host "🔧 Verificando configuración de Babel..." -ForegroundColor Yellow
if (-not (Test-Path "babel.config.js")) {
    Write-Host "❌ Error: babel.config.js no encontrado" -ForegroundColor Red
    exit 1
}

$babelContent = Get-Content "babel.config.js" -Raw
if (-not ($babelContent -match "react-native-reanimated/plugin")) {
    Write-Host "❌ Error: Plugin de Reanimated no configurado en babel.config.js" -ForegroundColor Red
    Write-Host "Asegúrate de que babel.config.js contenga:" -ForegroundColor Yellow
    Write-Host "module.exports = {" -ForegroundColor Gray
    Write-Host "  presets: [""babel-preset-expo""]," -ForegroundColor Gray
    Write-Host "  plugins: [""react-native-reanimated/plugin""]," -ForegroundColor Gray
    Write-Host "};" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Configuración de Babel verificada" -ForegroundColor Green

# Ejecutar prebuild
Write-Host "🏗️ Ejecutando prebuild..." -ForegroundColor Yellow
try {
    npx expo prebuild --clean
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Prebuild completado exitosamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎯 Próximos pasos:" -ForegroundColor Cyan
        Write-Host "1. Ejecutar: npx expo run:android (para Android)" -ForegroundColor White
        Write-Host "2. Ejecutar: npx expo run:ios (para iOS)" -ForegroundColor White
        Write-Host "3. Probar el módulo de cámara en dispositivo real" -ForegroundColor White
        Write-Host ""
        Write-Host "📱 Para probar la cámara:" -ForegroundColor Cyan
        Write-Host "- Navega a CaptureWineLabelScreen" -ForegroundColor White
        Write-Host "- Asegúrate de tener permisos de cámara" -ForegroundColor White
        Write-Host "- Prueba la detección automática de rectángulos" -ForegroundColor White
        Write-Host ""
        Write-Host "🔧 Si encuentras problemas:" -ForegroundColor Cyan
        Write-Host "- Verifica permisos de cámara en Info.plist (iOS)" -ForegroundColor White
        Write-Host "- Verifica permisos de cámara en AndroidManifest.xml (Android)" -ForegroundColor White
        Write-Host "- Revisa la documentación en docs/MODULO_CAMARA_PROFESIONAL.md" -ForegroundColor White
    } else {
        throw "Error en prebuild"
    }
} catch {
    Write-Host "❌ Error en prebuild" -ForegroundColor Red
    Write-Host "Revisa los logs anteriores para más detalles" -ForegroundColor Yellow
    exit 1
}













































