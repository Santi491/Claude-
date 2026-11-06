# Ordenes del Gerente para la PC de la casa que no necesitan IA (por ahora: apagar). Santi, 17/10.
# Lo corre la tarea de Windows "CargoOrdenes" cada 5 minutos como SYSTEM (sin ventanas). Lee orden-pc.json del repo
# en GitHub (lo escribe el bot de la Raspberry con "apagar pc") y lo cumple una sola vez (guarda el id en ProgramData).
$url = "https://api.github.com/repos/Santi491/Claude-/contents/orden-pc.json?ref=claude/agente-independiente-s3uc8z"
$dir = Join-Path $env:ProgramData "cargo"; New-Item -ItemType Directory -Force -Path $dir | Out-Null
$hecha = Join-Path $dir "ultima-orden.txt"
try { $o = Invoke-RestMethod -Uri $url -Headers @{ Accept = "application/vnd.github.raw"; "User-Agent" = "cargo-pc" } -TimeoutSec 20 } catch { exit 0 }
if (-not $o.id -or ((Test-Path $hecha) -and ((Get-Content $hecha) -eq $o.id))) { exit 0 }
Set-Content $hecha $o.id
# solo ordenes de los ultimos 30 minutos (si la PC estaba apagada, no se apaga al prenderla horas despues)
try { if (((Get-Date) - [datetime]::ParseExact($o.pedido, "yyyy-MM-dd HH:mm", $null)).TotalMinutes -gt 30) { exit 0 } } catch { exit 0 }
if ($o.orden -eq "apagar") {
  shutdown /s /t 120 /c "Cargo Brothers: el Gerente apaga la PC en 2 minutos (pedido de Santi por Telegram). Para cancelar: shutdown /a"
}
