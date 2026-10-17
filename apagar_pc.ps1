# Apaga la PC de la casa al terminar la ronda de la tarde, SOLO si la prendio la Raspberry y nadie la uso.
#   powershell -ExecutionPolicy Bypass -File apagar_pc.ps1           (lo corre la ronda de la PC al final, paso 8c)
#   powershell -ExecutionPolicy Bypass -File apagar_pc.ps1 -Probar   (solo dice que haria)
# Condiciones para apagar (las dos):
#   1. la PC arranco entre las 15:40 y las 16:10 de hoy (la prendio la Raspberry para la ronda);
#   2. nadie toco el teclado ni el mouse desde que arranco.
# Si se apaga, avisa 2 minutos antes; Santi lo cancela con:  shutdown /a
param([switch]$Probar)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Inactivo {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  public static uint UltimaEntrada() { var i = new LASTINPUTINFO(); i.cbSize = (uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return i.dwTime; }
}
"@

$arranque = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$hoy = (Get-Date).Date
$prendidaParaLaRonda = ($arranque -ge $hoy.AddHours(15).AddMinutes(40)) -and ($arranque -le $hoy.AddHours(16).AddMinutes(10))
# GetLastInputInfo cuenta en milisegundos desde el arranque: si la ultima entrada es de los primeros 2 minutos
# (el inicio de sesion automatico), nadie uso la PC
$ultimaEntradaMs = [Inactivo]::UltimaEntrada()
$nadieLaUso = $ultimaEntradaMs -lt 120000

$msg = "arranque $($arranque.ToString('HH:mm')), prendida para la ronda: $prendidaParaLaRonda, nadie la uso: $nadieLaUso"
if ($prendidaParaLaRonda -and $nadieLaUso) {
  if ($Probar) { Write-Output "Apagaria la PC ($msg)"; exit 0 }
  shutdown /s /t 120 /c "Cargo Brothers: la ronda termino y la PC se apaga en 2 minutos. Para cancelar: shutdown /a"
  Write-Output "PC se apaga en 2 minutos ($msg)"
} else {
  Write-Output "La PC queda prendida ($msg)"
}
