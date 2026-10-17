# Al iniciar sesion en la PC de la casa: si no es la hora en que la Raspberry la prende para la ronda
# (lunes a sabado, 15:40 a 16:10), bloquea la pantalla al instante y Windows pide el PIN o la contrasena.
# Asi el inicio de sesion automatico solo sirve para la ronda (Santi, 17/10).
# Lo corre una tarea de Windows "al iniciar sesion" (ver raspberry/LEEME.md).
$ahora = Get-Date
$esDiaDeRonda = $ahora.DayOfWeek -ne [DayOfWeek]::Sunday
$desde = $ahora.Date.AddHours(15).AddMinutes(40)
$hasta = $ahora.Date.AddHours(16).AddMinutes(10)
if (-not ($esDiaDeRonda -and $ahora -ge $desde -and $ahora -le $hasta)) {
  rundll32.exe user32.dll,LockWorkStation
}
