# Copia (nunca move) um lote de fotos do iCloud para a Entrada do Organizador de Fotos.
# Uso: powershell -File copiar-lote.ps1 -Quantidade 1000 [-Tipo foto|video|todos]
param(
  [int]$Quantidade = 1000,
  [ValidateSet('foto','video','todos')][string]$Tipo = 'foto'
)
$origem   = 'D:\Junior\Pictures\iCloud Photos\Photos'
$destino  = 'C:\Users\Junior\Meu Drive\Banco de Imagens\Entrada'
$pasta    = Split-Path -Parent $MyInvocation.MyCommand.Path
$feitos   = Join-Path $pasta 'copiados.txt'   # nomes ja copiados, para nao repetir em lotes futuros
$registro = Join-Path $pasta 'copia.log'

$extFoto  = '.heic','.jpg','.jpeg','.png','.webp','.gif'
$extVideo = '.mov','.mp4','.m4v'
$ext = switch ($Tipo) { 'foto' { $extFoto } 'video' { $extVideo } default { $extFoto + $extVideo } }

$jaCopiados = @{}
if (Test-Path $feitos) { Get-Content $feitos -Encoding UTF8 | ForEach-Object { $jaCopiados[$_] = $true } }

$lote = Get-ChildItem $origem -File |
  Where-Object { $ext -contains $_.Extension.ToLower() -and -not $jaCopiados[$_.Name] } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First $Quantidade

$inicio = Get-Date
"[$inicio] INICIO lote de $($lote.Count) arquivos ($Tipo)" | Add-Content $registro -Encoding UTF8
$ok = 0; $falhas = 0; $bytes = 0
foreach ($f in $lote) {
  try {
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $destino $f.Name) -ErrorAction Stop
    $f.Name | Add-Content $feitos -Encoding UTF8
    $ok++; $bytes += $f.Length
  } catch {
    $falhas++
    "FALHA $($f.Name): $($_.Exception.Message)" | Add-Content $registro -Encoding UTF8
  }
  if (($ok + $falhas) % 50 -eq 0) {
    "[{0}] {1}/{2} copiados, {3} falhas, {4:N2} GB" -f (Get-Date), $ok, $lote.Count, $falhas, ($bytes/1GB) | Add-Content $registro -Encoding UTF8
  }
}
$fim = Get-Date
"[{0}] FIM: {1} copiados, {2} falhas, {3:N2} GB em {4:N1} min" -f $fim, $ok, $falhas, ($bytes/1GB), ($fim-$inicio).TotalMinutes | Add-Content $registro -Encoding UTF8
"FIM: $ok copiados, $falhas falhas, $([math]::Round($bytes/1GB,2)) GB em $([math]::Round(($fim-$inicio).TotalMinutes,1)) min"
