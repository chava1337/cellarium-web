#Requires -Version 5.1

<#
.SYNOPSIS
    Limpia un archivo TypeScript corrupto eliminando bytes de bullet point insertados.

.DESCRIPTION
    Este script elimina todas las ocurrencias del patron de bytes UTF-8 del bullet point
    (U+2022 = E2 80 A2) que estan corrompiendo el archivo. Crea un backup automatico antes
    de realizar cualquier cambio.

.PARAMETER FilePath
    Ruta al archivo a limpiar. Por defecto: src/screens/GlobalWineCatalogScreen.tsx

.PARAMETER WhatIf
    Modo dry-run: muestra que se haria sin modificar el archivo.

.EXAMPLE
    .\Fix-CorruptedFile.ps1
    Limpia el archivo por defecto

.EXAMPLE
    .\Fix-CorruptedFile.ps1 -FilePath src/screens/OtroArchivo.tsx
    Limpia un archivo especifico

.EXAMPLE
    .\Fix-CorruptedFile.ps1 -WhatIf
    Muestra que se haria sin modificar el archivo
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$FilePath = "src/screens/GlobalWineCatalogScreen.tsx",
    
    [Parameter(Mandatory=$false)]
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$MIN_FILE_SIZE = 200

$BULLET_PATTERN = [byte[]](0xE2, 0x80, 0xA2)
$BOM_PATTERN = [byte[]](0xEF, 0xBB, 0xBF)

function Find-BytePattern {
    param(
        [byte[]]$Data,
        [byte[]]$Pattern
    )
    
    $matches = @()
    $patternLength = $Pattern.Length
    
    for ($i = 0; $i -le ($Data.Length - $patternLength); $i++) {
        $match = $true
        for ($j = 0; $j -lt $patternLength; $j++) {
            if ($Data[$i + $j] -ne $Pattern[$j]) {
                $match = $false
                break
            }
        }
        if ($match) {
            $matches += $i
        }
    }
    
    return $matches
}

function Remove-BytePattern {
    param(
        [byte[]]$Data,
        [byte[]]$Pattern
    )
    
    $result = [System.Collections.Generic.List[byte]]::new()
    $patternLength = $Pattern.Length
    $i = 0
    $removedCount = 0
    
    while ($i -lt $Data.Length) {
        $isMatch = $true
        if ($i + $patternLength - 1 -lt $Data.Length) {
            for ($j = 0; $j -lt $patternLength; $j++) {
                if ($Data[$i + $j] -ne $Pattern[$j]) {
                    $isMatch = $false
                    break
                }
            }
        } else {
            $isMatch = $false
        }
        
        if ($isMatch) {
            $i += $patternLength
            $removedCount++
        } else {
            $result.Add($Data[$i])
            $i++
        }
    }
    
    return @{
        Data = $result.ToArray()
        RemovedCount = $removedCount
    }
}

try {
    if (-not [System.IO.Path]::IsPathRooted($FilePath)) {
        $FilePath = Join-Path $PSScriptRoot $FilePath
    }
    
    $FilePath = [System.IO.Path]::GetFullPath($FilePath)
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Limpieza de archivo corrupto" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Archivo: $FilePath" -ForegroundColor Yellow
    
    if (-not (Test-Path $FilePath)) {
        throw "ERROR: El archivo no existe: $FilePath"
    }
    
    Write-Host "Leyendo archivo como bytes..." -ForegroundColor Gray
    $originalBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $originalSize = $originalBytes.Length
    
    Write-Host "Tamano original: $originalSize bytes" -ForegroundColor Gray
    
    if ($originalSize -eq 0) {
        throw "ERROR: El archivo esta vacio"
    }
    
    Write-Host "Buscando patrones de bullet point..." -ForegroundColor Gray
    $bulletMatches = Find-BytePattern -Data $originalBytes -Pattern $BULLET_PATTERN
    $bulletCount = $bulletMatches.Count
    
    Write-Host "Encontradas $bulletCount ocurrencias del patron bullet" -ForegroundColor $(if ($bulletCount -gt 0) { "Yellow" } else { "Green" })
    
    Write-Host "Eliminando patrones bullet..." -ForegroundColor Gray
    $cleanedResult = Remove-BytePattern -Data $originalBytes -Pattern $BULLET_PATTERN
    $cleanedBytes = $cleanedResult.Data
    $removedBullets = $cleanedResult.RemovedCount
    
    $hasBOM = $false
    if ($cleanedBytes.Length -ge 3) {
        $hasBOM = ($cleanedBytes[0] -eq $BOM_PATTERN[0]) -and 
                  ($cleanedBytes[1] -eq $BOM_PATTERN[1]) -and 
                  ($cleanedBytes[2] -eq $BOM_PATTERN[2])
    }
    
    if ($hasBOM) {
        Write-Host "Eliminando BOM UTF-8..." -ForegroundColor Gray
        $cleanedBytes = $cleanedBytes[3..($cleanedBytes.Length - 1)]
    }
    
    $finalSize = $cleanedBytes.Length
    $sizeReduction = $originalSize - $finalSize
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "RESUMEN" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Tamano original:     $originalSize bytes" -ForegroundColor White
    Write-Host "Tamano final:        $finalSize bytes" -ForegroundColor White
    Write-Host "Reduccion:           $sizeReduction bytes" -ForegroundColor $(if ($sizeReduction -gt 0) { "Green" } else { "Gray" })
    Write-Host "Bullets eliminados:  $removedBullets" -ForegroundColor $(if ($removedBullets -gt 0) { "Green" } else { "Gray" })
    Write-Host "BOM eliminado:       $(if ($hasBOM) { 'Si' } else { 'No' })" -ForegroundColor Gray
    Write-Host ""
    
    if ($finalSize -lt $MIN_FILE_SIZE) {
        throw "ERROR: El archivo resultante es demasiado pequeno ($finalSize bytes < $MIN_FILE_SIZE bytes). Abortando."
    }
    
    if ($WhatIf) {
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "MODO DRY-RUN: No se realizaran cambios" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Se eliminarian $removedBullets secuencias de bullet point" -ForegroundColor Yellow
        Write-Host "El archivo se reduciria de $originalSize a $finalSize bytes" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Para aplicar los cambios, ejecuta sin -WhatIf" -ForegroundColor Yellow
        exit 0
    }
    
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$FilePath.bak-$timestamp"
    
    Write-Host "Creando backup..." -ForegroundColor Gray
    Copy-Item -Path $FilePath -Destination $backupPath -Force
    Write-Host "Backup creado: $backupPath" -ForegroundColor Green
    
    Write-Host "Escribiendo archivo limpio..." -ForegroundColor Gray
    [System.IO.File]::WriteAllBytes($FilePath, $cleanedBytes)
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "ARCHIVO LIMPIADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Archivo procesado: $FilePath" -ForegroundColor White
    Write-Host "Backup guardado:   $backupPath" -ForegroundColor White
    Write-Host ""
    Write-Host "Para restaurar desde backup:" -ForegroundColor Cyan
    Write-Host "  Copy-Item" -ForegroundColor Gray -NoNewline
    Write-Host " '$backupPath'" -ForegroundColor Gray -NoNewline
    Write-Host " '$FilePath'" -ForegroundColor Gray -NoNewline
    Write-Host " -Force" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    
    if ($backupPath -and (Test-Path $backupPath)) {
        Write-Host "Un backup fue creado antes del error:" -ForegroundColor Yellow
        Write-Host "  $backupPath" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Para restaurar:" -ForegroundColor Cyan
        Write-Host "  Copy-Item" -ForegroundColor Gray -NoNewline
        Write-Host " '$backupPath'" -ForegroundColor Gray -NoNewline
        Write-Host " '$FilePath'" -ForegroundColor Gray -NoNewline
        Write-Host " -Force" -ForegroundColor Gray
    }
    
    exit 1
}
