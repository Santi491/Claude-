# Al iniciar sesion en la PC de la casa (Santi, 17/10):
#  - en la hora en que la Raspberry la prende para la ronda (lunes a sabado, 15:40 a 16:10): abre la app de Claude
#    para que corra la ronda de las 16:00 y deja la sesion abierta;
#  - a cualquier otra hora: bloquea la pantalla al instante (Windows pide el PIN o la contrasena) y NO abre Claude.
# Lo corre la tarea de Windows "CargoBloqueo" al iniciar sesion (ver raspberry/LEEME.md). Claude NO debe estar en las
# aplicaciones de inicio de Windows: lo abre este script.
$ahora = Get-Date
$esDiaDeRonda = $ahora.DayOfWeek -ne [DayOfWeek]::Sunday
$desde = $ahora.Date.AddHours(15).AddMinutes(40)
$hasta = $ahora.Date.AddHours(16).AddMinutes(10)
# Modo prueba (una sola vez): si existe .prueba-ronda con la fecha de hoy, se porta como en la hora de la ronda y lo borra
$prueba = Join-Path $PSScriptRoot ".prueba-ronda"
$esPrueba = (Test-Path $prueba) -and ((Get-Content $prueba -ErrorAction SilentlyContinue | Select-Object -First 1) -eq $ahora.ToString("yyyy-MM-dd"))
if (Test-Path $prueba) { Remove-Item $prueba -Force -ErrorAction SilentlyContinue }
if ($esPrueba -or ($esDiaDeRonda -and $ahora -ge $desde -and $ahora -le $hasta)) {
  # el acceso directo de Claude del menu Inicio (sirve para cualquier forma de instalacion)
  $menus = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")
  $acceso = Get-ChildItem $menus -Recurse -Filter "Claude*.lnk" -ErrorAction SilentlyContinue | Select-Object -First 1
  # Get-StartApps sirve para cualquier instalacion (tambien la de la tienda o el instalador nuevo, que no dejan .lnk)
  $app = Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "Claude" -or $_.Name -like "Claude *" } | Select-Object -First 1
  if ($app) { Start-Process "shell:AppsFolder\$($app.AppID)" }
  elseif ($acceso) { Start-Process $acceso.FullName }
  elseif (Test-Path "$env:LOCALAPPDATA\AnthropicClaude\claude.exe") { Start-Process "$env:LOCALAPPDATA\AnthropicClaude\claude.exe" }
  "$($ahora.ToString('yyyy-MM-dd HH:mm')) abre Claude (prueba: $esPrueba, app: $($app.AppID), acceso: $($acceso.FullName))" | Add-Content (Join-Path $env:TEMP "cargo-inicio.log")
} else {
  "$($ahora.ToString('yyyy-MM-dd HH:mm')) bloquea (fuera del horario de la ronda)" | Add-Content (Join-Path $env:TEMP "cargo-inicio.log")
  rundll32.exe user32.dll,LockWorkStation
}
