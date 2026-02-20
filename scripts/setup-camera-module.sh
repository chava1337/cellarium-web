#!/bin/bash

# 🚀 Script de Prebuild para Módulo de Cámara Profesional
# Configura el proyecto para usar react-native-vision-camera

echo "🎥 Configurando módulo de cámara profesional..."

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: No se encontró package.json. Ejecuta este script desde la raíz del proyecto."
    exit 1
fi

# Verificar dependencias instaladas
echo "📦 Verificando dependencias..."
if ! npm list react-native-vision-camera > /dev/null 2>&1; then
    echo "❌ Error: react-native-vision-camera no está instalado"
    echo "Ejecuta: npm install react-native-vision-camera react-native-reanimated --legacy-peer-deps"
    exit 1
fi

if ! npm list react-native-reanimated > /dev/null 2>&1; then
    echo "❌ Error: react-native-reanimated no está instalado"
    echo "Ejecuta: npm install react-native-vision-camera react-native-reanimated --legacy-peer-deps"
    exit 1
fi

echo "✅ Dependencias verificadas"

# Verificar configuración de Babel
echo "🔧 Verificando configuración de Babel..."
if [ ! -f "babel.config.js" ]; then
    echo "❌ Error: babel.config.js no encontrado"
    exit 1
fi

if ! grep -q "react-native-reanimated/plugin" babel.config.js; then
    echo "❌ Error: Plugin de Reanimated no configurado en babel.config.js"
    echo "Asegúrate de que babel.config.js contenga:"
    echo "module.exports = {"
    echo "  presets: [\"babel-preset-expo\"],"
    echo "  plugins: [\"react-native-reanimated/plugin\"],"
    echo "};"
    exit 1
fi

echo "✅ Configuración de Babel verificada"

# Ejecutar prebuild
echo "🏗️ Ejecutando prebuild..."
npx expo prebuild --clean

if [ $? -eq 0 ]; then
    echo "✅ Prebuild completado exitosamente"
    echo ""
    echo "🎯 Próximos pasos:"
    echo "1. Ejecutar: npx expo run:android (para Android)"
    echo "2. Ejecutar: npx expo run:ios (para iOS)"
    echo "3. Probar el módulo de cámara en dispositivo real"
    echo ""
    echo "📱 Para probar la cámara:"
    echo "- Navega a CaptureWineLabelScreen"
    echo "- Asegúrate de tener permisos de cámara"
    echo "- Prueba la detección automática de rectángulos"
    echo ""
    echo "🔧 Si encuentras problemas:"
    echo "- Verifica permisos de cámara en Info.plist (iOS)"
    echo "- Verifica permisos de cámara en AndroidManifest.xml (Android)"
    echo "- Revisa la documentación en docs/MODULO_CAMARA_PROFESIONAL.md"
else
    echo "❌ Error en prebuild"
    echo "Revisa los logs anteriores para más detalles"
    exit 1
fi













































