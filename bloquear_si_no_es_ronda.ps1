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
if ($esDiaDeRonda -and $ahora -ge $desde -and $ahora -le $hasta) {
  # el acceso directo de Claude del menu Inicio (sirve para cualquier forma de instalacion)
  $menus = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")
  $acceso = Get-ChildItem $menus -Recurse -Filter "Claude*.lnk" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($acceso) { Start-Process $acceso.FullName }
  elseif (Test-Path "$env:LOCALAPPDATA\AnthropicClaude\claude.exe") { Start-Process "$env:LOCALAPPDATA\AnthropicClaude\claude.exe" }
} else {
  rundll32.exe user32.dll,LockWorkStation
}
