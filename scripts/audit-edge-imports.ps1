# audit-edge-imports.ps1
# Audits supabase/functions for prohibited imports (std/node, npm:stripe, process, Buffer, etc.)
# Exit code 1 if any prohibited pattern is found. Use in CI to enforce Edge Runtime compatibility.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$functionsDir = Join-Path $root "supabase\functions"

if (-not (Test-Path $functionsDir)) {
    Write-Host "ERROR: supabase\functions not found at $functionsDir"
    exit 1
}

$tsFiles = Get-ChildItem -Path $functionsDir -Filter "*.ts" -Recurse -File
$report = @()
$forbidden = $false

# Prohibited patterns (regex-friendly). Match whole line content for reporting.
$prohibitedPatterns = @(
    @{ Name = "deno.land/std@0.177.1/node"; Pattern = "deno\.land/std@0\.177\.1/node" }
    @{ Name = "/std@0.177.1/node"; Pattern = "/std@0\.177\.1/node" }
    @{ Name = "deno.land/std/node"; Pattern = "deno\.land/std/node" }
    @{ Name = "std/node"; Pattern = "std/node" }
    @{ Name = "node:"; Pattern = "node:" }
    @{ Name = "npm:stripe"; Pattern = "npm:stripe" }
    @{ Name = "from `"npm:"; Pattern = "from\s+[\`"]npm:" }
    @{ Name = "process."; Pattern = "process\." }
    @{ Name = "Buffer"; Pattern = "\bBuffer\b" }
)

# Also forbid serve from std (we use Deno.serve)
$prohibitedPatterns += @{ Name = "serve from std/http"; Pattern = "from\s+['\`"].*deno\.land/std.*http/server" }

Write-Host "=== Edge Import Audit: $functionsDir ===" -ForegroundColor Cyan
Write-Host ""

# 1) List all remote imports (https://... or npm:...)
Write-Host "--- Remote imports found ---" -ForegroundColor Yellow
foreach ($file in $tsFiles) {
    $content = Get-Content $file.FullName -Raw
    $lines = Get-Content $file.FullName
    $relPath = $file.FullName.Replace($root + "\", "").Replace("\", "/")
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match 'from\s+["''](https://[^"'']+)["'']' -or $line -match 'from\s+["''](npm:[^"'']+)["'']') {
            $importUrl = $Matches[1]
            Write-Host "$relPath`:$($i+1) $line"
        }
    }
}
Write-Host ""

# 2) Check for prohibited patterns (skip comment-only lines for import-like patterns to allow "// NO std/node" in comments)
Write-Host "--- Prohibited pattern check ---" -ForegroundColor Yellow
$importLikePatterns = @("deno.land/std@0.177.1/node", "/std@0.177.1/node", "deno.land/std/node", "std/node", "node:", "npm:stripe", "from `"npm:", "serve from std/http")
foreach ($file in $tsFiles) {
    $lines = Get-Content $file.FullName
    $relPath = $file.FullName.Replace($root + "\", "").Replace("\", "/")
    foreach ($entry in $prohibitedPatterns) {
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $trimmed = $lines[$i].Trim()
            $skip = $false
            if ($entry.Name -in $importLikePatterns -and ($trimmed.StartsWith("//") -or $trimmed.StartsWith("*") -or $trimmed.StartsWith("/**"))) { $skip = $true }
            if (-not $skip -and $lines[$i] -match $entry.Pattern) {
                $forbidden = $true
                $report += [PSCustomObject]@{
                    File = $relPath
                    Line = $i + 1
                    Pattern = $entry.Name
                    Content = $trimmed
                }
            }
        }
    }
}

if ($report.Count -gt 0) {
    Write-Host "FAIL: Prohibited imports/usage found:" -ForegroundColor Red
    foreach ($r in $report) {
        Write-Host "  $($r.File):$($r.Line) [$($r.Pattern)]"
        Write-Host "    $($r.Content)"
    }
    Write-Host ""
    Write-Host "Edge Runtime does not support: std/node, process, Buffer, npm:stripe, or serve from deno.land/std." -ForegroundColor Red
    Write-Host "Use Deno.serve, Web APIs only, and @supabase/supabase-js with ?target=deno." -ForegroundColor Red
    exit 1
}

Write-Host "OK: No prohibited patterns found." -ForegroundColor Green
Write-Host ""
Write-Host "Allowed: esm.sh/@supabase/supabase-js@2.39.3?target=deno, relative _shared imports, Web APIs." -ForegroundColor Green
exit 0
