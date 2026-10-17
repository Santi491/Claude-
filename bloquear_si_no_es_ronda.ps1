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
# Pedido del Gerente (Telegram o vigilante de la Raspberry): pedido-pc.json de las ultimas 3 horas -> se abre igual
git -C $PSScriptRoot pull -q 2>$null
$archPedido = Join-Path $PSScriptRoot "pedido-pc.json"
$hayPedido = $false
if (Test-Path $archPedido) {
  try { $ped = Get-Content $archPedido -Raw | ConvertFrom-Json; $hayPedido = ((Get-Date) - [datetime]::ParseExact($ped.pedido, "yyyy-MM-dd HH:mm", $null)).TotalHours -lt 3 } catch { }
}
if ($esPrueba -or $hayPedido -or ($esDiaDeRonda -and $ahora -ge $desde -and $ahora -le $hasta)) {
  # marca para apagar_pc.ps1: la PC se abrio para trabajar sola (si nadie la usa, se apaga al terminar)
  Set-Content (Join-Path $PSScriptRoot ".encendida-para-trabajo") $ahora.ToString("yyyy-MM-dd")
  # el acceso directo de Claude del menu Inicio (sirve para cualquier forma de instalacion)
  $menus = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")
  $acceso = Get-ChildItem $menus -Recurse -Filter "Claude*.lnk" -ErrorAction SilentlyContinue | Select-Object -First 1
  # Get-StartApps sirve para cualquier instalacion (tambien la de la tienda o el instalador nuevo, que no dejan .lnk)
  $app = Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "Claude" -or $_.Name -like "Claude *" } | Select-Object -First 1
  if ($app) { Start-Process "shell:AppsFolder\$($app.AppID)" }
  elseif ($acceso) { Start-Process $acceso.FullName }
  elseif (Test-Path "$env:LOCALAPPDATA\AnthropicClaude\claude.exe") { Start-Process "$env:LOCALAPPDATA\AnthropicClaude\claude.exe" }
  # Chrome directo en el perfil que tiene la extension Claude in Chrome (si no, se queda en "Que perfil de Chrome quieres usar?"
  # y la extension no se conecta). El perfil se busca solo: el que tenga la carpeta de la extension.
  $datos = "$env:LOCALAPPDATA\Google\Chrome\User Data"
  $perfil = Get-ChildItem $datos -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName "Extensions\fcoeoabgfenejglbffodgkkbkcdhcgfn") } | Select-Object -First 1
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($perfil -and $chrome) { Start-Sleep -Seconds 5; Start-Process $chrome -ArgumentList "--profile-directory=`"$($perfil.Name)`"" }
  "$($ahora.ToString('yyyy-MM-dd HH:mm')) abre Chrome (perfil: $($perfil.Name))" | Add-Content (Join-Path $env:TEMP "cargo-inicio.log")
  "$($ahora.ToString('yyyy-MM-dd HH:mm')) abre Claude (prueba: $esPrueba, pedido: $hayPedido, app: $($app.AppID), acceso: $($acceso.FullName))" | Add-Content (Join-Path $env:TEMP "cargo-inicio.log")
} else {
  "$($ahora.ToString('yyyy-MM-dd HH:mm')) bloquea (fuera del horario de la ronda)" | Add-Content (Join-Path $env:TEMP "cargo-inicio.log")
  rundll32.exe user32.dll,LockWorkStation
}
