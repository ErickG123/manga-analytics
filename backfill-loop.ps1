param(
    [switch]$ForceReparse
)

$maxLotes = 300
$esperaSegundos = 30

for ($lote = 1; $lote -le $maxLotes; $lote++) {
    Write-Host "`nLote $lote de $maxLotes"

    $sourceStatusOutput = & py -m collector.src.cli source-status 2>&1
    $sourceStatusExitCode = $LASTEXITCODE
    if ($sourceStatusExitCode -ne 0) {
        $sourceStatusOutput | ForEach-Object { Write-Host $_ }
        Write-Host "Não foi possível verificar a origem. Encerrando."
        break
    }

    try {
        $sourceState = ($sourceStatusOutput -join "`n") | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        $sourceStatusOutput | ForEach-Object { Write-Host $_ }
        Write-Host "A resposta de source-status não é um JSON válido. Encerrando por segurança."
        break
    }

    if ($sourceState.status -eq "blocked") {
        Write-Host "A origem BBM está bloqueada. Revise o bloqueio antes de retomar."
        break
    }

    if ($sourceState.status -eq "suspended") {
        $suspensionIsActive = $true
        if ($sourceState.suspended_until) {
            try {
                $suspensionExpiry = [DateTimeOffset]::Parse(
                    [string]$sourceState.suspended_until
                ).ToUniversalTime()
                $suspensionIsActive = $suspensionExpiry -gt [DateTimeOffset]::UtcNow
            }
            catch {
                Write-Host "Não foi possível interpretar o fim da suspensão. Encerrando por segurança."
                break
            }
        }

        if ($suspensionIsActive) {
            Write-Host "A origem BBM está suspensa até $($sourceState.suspended_until). Encerrando."
            break
        }

        Write-Host "A suspensão expirou; o Collector poderá limpar o estado e continuar."
    }

    $metricsPath = Join-Path ([IO.Path]::GetTempPath()) (
        "manga-atlas-backfill-{0}.json" -f [guid]::NewGuid()
    )

    try {
        $collectorArgs = @("backfill", "--batch-size", "100")
        if ($ForceReparse) {
            if ($lote -eq 1) {
                Write-Host "Reiniciando o checkpoint na primeira página e reprocessando o catálogo. Os dados existentes serão preservados."
                $collectorArgs += "--reset-checkpoint"
            }
            else {
                $collectorArgs += "--resume"
            }
            $collectorArgs += "--force-reparse"
        }
        else {
            $collectorArgs += "--resume"
        }
        $collectorArgs += @("--metrics-json", $metricsPath)

        $backfillOutput = & py -m collector.src.cli @collectorArgs 2>&1
        $backfillExitCode = $LASTEXITCODE
        $backfillOutput | ForEach-Object { Write-Host $_ }

        if ($backfillExitCode -ne 0) {
            Write-Host "Backfill encerrado com código $backfillExitCode."
            Write-Host "Interrompendo para evitar retries indevidos."
            break
        }

        $outputText = $backfillOutput -join "`n"
        if ($outputText -match "Catálogo já marcado como concluído") {
            Write-Host "O catálogo já estava concluído. Encerrando o loop."
            break
        }

        if (-not (Test-Path -LiteralPath $metricsPath)) {
            Write-Host "O Collector terminou sem gerar métricas; não foi possível confirmar o checkpoint. Encerrando."
            break
        }

        try {
            $metrics = Get-Content -LiteralPath $metricsPath -Raw | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            Write-Host "Não foi possível ler as métricas do backfill. Encerrando por segurança."
            break
        }

        if ($metrics.http_metrics.catalog_end_reached -eq $true) {
            Write-Host "O Collector chegou ao fim do catálogo. Backfill concluído."
            break
        }
    }
    finally {
        Remove-Item -LiteralPath $metricsPath -Force -ErrorAction SilentlyContinue
    }

    if ($lote -lt $maxLotes) {
        Write-Host "Aguardando $esperaSegundos segundos..."
        Start-Sleep -Seconds $esperaSegundos
    }
}

Write-Host "Loop finalizado."
