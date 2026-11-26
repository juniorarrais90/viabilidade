# Apaga da pasta do iCloud o que foi apagado pelo painel do Organizador de Fotos.
# O painel grava os nomes em "Banco de Imagens\apagar-do-icloud.txt" (Google Drive espelhado).
# Apagar da pasta do iCloud tira do iCloud e do iPhone; fica 30 dias em "Apagados" no app Fotos.
# Uso: powershell -File sincronizar-apagados.ps1 [-Simular]
param([switch]$Simular)

$lista    = 'C:\Users\Junior\Meu Drive\Banco de Imagens\apagar-do-icloud.txt'
$icloud   = 'D:\Junior\Pictures\iCloud Photos\Photos'
$pasta    = Split-Path -Parent $MyInvocation.MyCommand.Path
$registro = Join-Path $pasta 'apagados-icloud.log'
$limite   = 300   # trava: mais que isso de uma vez, para e espera conferência

if (-not (Test-Path -LiteralPath $lista) -or -not (Test-Path -LiteralPath $icloud)) { exit 0 }

$nomes = Get-Content -LiteralPath $lista -Encoding UTF8 |
  ForEach-Object { $_.Trim() } |
  Where-Object { $_ -and $_ -notmatch '[\\/:*?"<>|]' }

$alvos = @($nomes | Where-Object { Test-Path -LiteralPath (Join-Path $icloud $_) -PathType Leaf })
if ($alvos.Count -eq 0) { exit 0 }

if ($alvos.Count -gt $limite -and -not $Simular) {
  "[{0}] TRAVADO: {1} arquivos na fila, acima do limite de {2}. Nada foi apagado." -f (Get-Date), $alvos.Count, $limite |
    Add-Content $registro -Encoding UTF8
  exit 1
}

$ok = 0; $falhas = 0
foreach ($n in $alvos) {
  if ($Simular) { "SIMULADO $n"; continue }
  try {
    Remove-Item -LiteralPath (Join-Path $icloud $n) -Confirm:$false -ErrorAction Stop
    $ok++
    "[{0}] APAGADO {1} (pelo painel)" -f (Get-Date), $n | Add-Content $registro -Encoding UTF8
  } catch {
    $falhas++
    "[{0}] FALHA {1}: {2}" -f (Get-Date), $n, $_.Exception.Message | Add-Content $registro -Encoding UTF8
  }
}
if ($Simular) { "Seriam apagados: $($alvos.Count)" } else { "Apagados: $ok, falhas: $falhas" }
