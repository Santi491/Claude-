import SwiftUI

private struct BotonCerrar: ToolbarContent {
    @Environment(\.dismiss) var cerrar
    var body: some ToolbarContent { ToolbarItem(placement: .topBarLeading) { Button("Cerrar") { cerrar() } } }
}

private struct SinClave: View {
    @EnvironmentObject var store: Store
    var body: some View {
        if !store.hayClave {
            Label("Falta la clave de GitHub: pégala en Ajustes (engranaje de Hoy) para poder guardar.", systemImage: "key")
                .font(.footnote).foregroundStyle(Tema.ambar)
        }
    }
}

func productosConocidos(_ d: Datos?) -> [String] {
    var l = (d?.vigilar ?? []).map(\.producto)
    for p in d?.pedidos ?? [] where !l.contains(p.producto) { l.append(p.producto) }
    return l
}

// ---------- Registrar compra ----------
struct CompraForm: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    @State private var c = Compra()
    @State private var otro = ""
    @State private var confirmar = false

    var producto: String { c.producto == "__otro" ? otro.trimmingCharacters(in: .whitespaces) : c.producto }

    var body: some View {
        Form {
            SinClave()
            Section("Qué compraste") {
                Picker("Producto", selection: $c.producto) {
                    Text("Elegir…").tag("")
                    ForEach(productosConocidos(store.datos), id: \.self) { Text($0).tag($0) }
                    Text("Otro (escribirlo)").tag("__otro")
                }
                if c.producto == "__otro" { TextField("Nombre del producto", text: $otro) }
                Stepper("Cantidad: \(c.cantidad)", value: $c.cantidad, in: 1...50)
                DatePicker("Fecha de compra", selection: $c.fecha, displayedComponents: .date)
            }
            Section {
                LabeledContent("Precio c/u (USD)") { TextField("0", text: $c.precioUSD).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                LabeledContent("Envío en EE.UU. c/u") { TextField("no sé", text: $c.envioUSD).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                LabeledContent("Dólar con que pagaste") { TextField("Bs", text: $c.tc).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
            } header: { Text("Cuánto pagaste") } footer: { Text("Si no pones el envío queda vacío (no 0): Finanzas sabe que falta el dato.") }
            Section("Cómo viene") {
                Picker("Courier", selection: $c.courier) { Text("Courier B (por kg)").tag("Courier B"); Text("Courier A (la señora)").tag("Courier A") }
                LabeledContent("Tienda") { TextField("eBay", text: $c.tienda).multilineTextAlignment(.trailing) }
                Toggle("Es un pedido de prueba (familia)", isOn: $c.prueba)
                TextField("Nota (opcional)", text: $c.nota)
            }
            if let calc = calculo {
                Section("Puesto en Cochabamba (estimado)") {
                    fila("Costo por unidad", F.bs(calc.costoBs))
                    fila("Courier", "\(F.usd(calc.courierUSD)) · \(calc.via)")
                    if let v = calc.ventaBs { fila("Venta sugerida", F.bs(v)); fila("Margen", F.pct(calc.margen.map { $0 * 100 })) }
                }
            }
        }
        .navigationTitle("Registrar compra").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            BotonCerrar()
            ToolbarItem(placement: .topBarTrailing) { Button("Guardar") { confirmar = true }.disabled(producto.isEmpty || Accion.num(c.precioUSD) == nil) }
        }
        .onAppear { if c.tc.isEmpty, let u = store.datos?.dolar.usado { c.tc = F.num(u) } }
        .alert("¿Guardar esta compra?", isPresented: $confirmar) {
            Button("Guardar") { Task { var x = c; x.producto = producto; if await store.registrarCompra(x) { cerrar() } } }
            Button("Cancelar", role: .cancel) { }
        } message: {
            Text("\(c.cantidad) × \(producto) a USD \(c.precioUSD) c/u, \(c.courier), \(F.bo("dd/MM", c.fecha))\(c.prueba ? " (prueba)" : "").")
        }
    }

    var calculo: Calculo? {
        guard let d = store.datos, let k = d.constantes, let u = Accion.num(c.precioUSD), let tc = Accion.num(c.tc) ?? d.dolar.usado else { return nil }
        let v = d.vigilar?.first { $0.producto == producto }
        return Calculo.hacer(usd: u, envio: Accion.num(c.envioUSD) ?? 0, peso: v?.peso_g ?? 350, cant: c.cantidad, tc: tc, mediana: v?.mediana_bs, k: k)
    }

    func fila(_ a: String, _ b: String) -> some View { HStack { Text(a); Spacer(); Text(b).foregroundStyle(Tema.gris).monospacedDigit() } }
}

// ---------- Registrar venta ----------
struct VentaForm: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    @State private var v = Venta()
    @State private var confirmar = false

    var body: some View {
        Form {
            SinClave()
            Section("Qué vendiste") {
                Picker("Producto", selection: $v.producto) {
                    Text("Elegir…").tag("")
                    ForEach(productosConocidos(store.datos), id: \.self) { Text($0).tag($0) }
                }
                Stepper("Cantidad: \(v.cantidad)", value: $v.cantidad, in: 1...50)
                LabeledContent("Precio c/u (Bs)") { TextField("0", text: $v.precioBs).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
            }
            Section("Cómo") {
                Picker("Canal", selection: $v.canal) {
                    ForEach(["Marketplace", "Tienda", "Conocido", "WhatsApp", "Otro"], id: \.self) { Text($0).tag($0) }
                }
                Toggle("Solo reservada (todavía no se entregó)", isOn: $v.reservada)
                if !v.reservada { Toggle("Ya cobré", isOn: $v.cobrado) }
                TextField("Nota (sin nombres ni teléfonos)", text: $v.nota)
            }
            if let g = ganancia {
                Section("Resultado") {
                    HStack { Text("Ganancia estimada"); Spacer(); Text("\(F.bs(g.0)) por unidad · \(F.bs(g.0 * Double(v.cantidad))) en total").foregroundStyle(g.0 >= 0 ? Tema.verde : Tema.rojo) }
                    HStack { Text("Margen"); Spacer(); Text(F.pct(g.1 * 100)) }
                }
            }
        }
        .navigationTitle("Registrar venta").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            BotonCerrar()
            ToolbarItem(placement: .topBarTrailing) { Button("Guardar") { confirmar = true }.disabled(v.producto.isEmpty || Accion.num(v.precioBs) == nil) }
        }
        .alert("¿Guardar esta venta?", isPresented: $confirmar) {
            Button("Guardar") { Task { if await store.registrarVenta(v) { cerrar() } } }
            Button("Cancelar", role: .cancel) { }
        } message: { Text("\(v.cantidad) × \(v.producto) a Bs \(v.precioBs) c/u por \(v.canal)\(v.reservada ? " (reservada)" : "").") }
    }

    var ganancia: (Double, Double)? {
        guard let p = Accion.num(v.precioBs), p > 0,
              let c = store.datos?.finanzas_productos?.first(where: { $0.producto == v.producto })?.costo_unitario_bs else { return nil }
        return (p - c, (p - c) / p)
    }
}

// ---------- Avisar cómo va un pedido ----------
struct EtapaForm: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    var pedidoInicial: Pedido? = nil
    @State private var pedidoID = ""
    @State private var paquete = true

    var activos: [Pedido] { (store.datos?.pedidos ?? []).filter { !$0.entregado } }
    var pedido: Pedido? { activos.first { $0.id == pedidoID } }

    var body: some View {
        Form {
            SinClave()
            Section("Pedido") {
                Picker("Pedido", selection: $pedidoID) {
                    ForEach(activos) { p in Text("\(p.cantidad) × \(p.producto) · \(p.estado)").tag(p.id) }
                }
                if let p = pedido, store.totalUnidades(p) > p.cantidad {
                    Toggle("Todo el paquete (\(store.totalUnidades(p)) unidades)", isOn: $paquete)
                }
            }
            if let p = pedido {
                Section("¿Qué pasó?") {
                    ForEach(opciones(p), id: \.0) { (etapa, texto, icono) in
                        Button {
                            Task {
                                guard await store.confirmarIdentidad(motivo: texto) else { return }
                                if await store.cambiarEtapa(p, a: etapa, todoElPaquete: paquete) { cerrar() }
                            }
                        } label: { Label(texto, systemImage: icono) }
                    }
                }
            } else if activos.isEmpty {
                Text("No hay pedidos en camino.").foregroundStyle(Tema.gris)
            }
        }
        .navigationTitle("¿Cómo va el pedido?").navigationBarTitleDisplayMode(.inline)
        .toolbar { BotonCerrar() }
        .onAppear { pedidoID = pedidoInicial?.id ?? activos.max { $0.cantidad < $1.cantidad }?.id ?? "" }
    }

    func opciones(_ p: Pedido) -> [(String, String, String)] {
        var o: [(String, String, String)] = []
        if p.etapa < 4 { o.append(("en camino a Cochabamba", "Llegó a Santa Cruz", "mappin.and.ellipse")) }
        if p.etapa < 5 { o.append(("en Cochabamba", "Llegó a Cochabamba (lo voy a recoger)", "house")) }
        o.append(("entregado", "Ya lo recogí", "checkmark.circle"))
        return o
    }
}

// ---------- Encargar una tarea ----------
struct TareaForm: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    var agenteInicial = "wa"
    @State private var agente = ""
    @State private var tarea = ""
    @State private var prioridad = "alta"
    @State private var fecha = Date()
    @State private var obligatoria = true

    var body: some View {
        Form {
            SinClave()
            Section("Para quién") {
                Picker("Agente", selection: $agente) {
                    ForEach(Equipo.orden.filter { $0 != "nube" } + ["local"], id: \.self) { Text(Equipo.nombre($0)).tag($0) }
                }
            }
            Section {
                TextField("Ej.: pregúntale a OverCity por el 9600X", text: $tarea, axis: .vertical).lineLimit(3...6)
            } header: { Text("Qué tiene que hacer") } footer: {
                Text("Queda aprobada en el plan y el agente la hace en su próxima ronda. Lo de la lista \"nunca\" (comprar, pagar, ofertar) no lo hace aunque se lo pidas.")
            }
            Section("Cuándo") {
                Picker("Prioridad", selection: $prioridad) { Text("Alta").tag("alta"); Text("Media").tag("media"); Text("Baja").tag("baja") }.pickerStyle(.segmented)
                DatePicker("Para", selection: $fecha, in: Date()..., displayedComponents: .date)
                Toggle("Meta obligatoria (no termina su turno sin hacerla)", isOn: $obligatoria)
            }
        }
        .navigationTitle("Encargar una tarea").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            BotonCerrar()
            ToolbarItem(placement: .topBarTrailing) {
                Button("Encargar") { Task { if await store.encargar(agente: agente, tarea: tarea, prioridad: prioridad, para: fecha, obligatoria: obligatoria) { cerrar() } } }
                    .disabled(tarea.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onAppear { if agente.isEmpty { agente = agenteInicial } }
    }
}

// ---------- Ajustes ----------
struct AjustesView: View {
    @EnvironmentObject var store: Store
    @State private var clave = ""
    @State private var estado: String?
    @State private var probando = false
    @AppStorage("bloqueo") private var bloqueo = true

    var body: some View {
        Form {
            Section {
                if store.hayClave {
                    Label("Clave guardada en el llavero del iPhone", systemImage: "checkmark.seal.fill").foregroundStyle(Tema.verde)
                    Button("Probar la clave") { Task { probando = true; estado = await GitHub.probar() ?? "Funciona: la app puede leer y guardar."; probando = false } }
                    Button("Borrar la clave", role: .destructive) { Llavero.borrar(); store.objectWillChange.send(); estado = "Clave borrada." }
                } else {
                    SecureField("Pega la clave (github_pat_…)", text: $clave).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Guardar la clave") {
                        Llavero.guardar(clave.trimmingCharacters(in: .whitespacesAndNewlines)); clave = ""
                        store.objectWillChange.send()
                        Task { probando = true; estado = await GitHub.probar() ?? "Funciona: la app puede leer y guardar."; probando = false }
                    }.disabled(clave.count < 20)
                }
                if probando { ProgressView() }
                if let estado { Text(estado).font(.footnote) }
            } header: { Text("Clave de GitHub") } footer: {
                Text("Créala en GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens: solo el repo Claude-, permiso Contents en Read and write, vence en 1 año. Si pierdes el celular, bórrala en GitHub y deja de servir al instante.")
            }
            Section("Seguridad") {
                Toggle("Pedir Face ID al abrir la app", isOn: $bloqueo)
            }
            Section("Avisos") {
                Button("Activar avisos") { Novedades.pedirPermiso() }
                Text("La app revisa en segundo plano cada tanto y te avisa de ofertas del cazador, cambios del pedido, decisiones nuevas y mensajes del equipo. Puede llegar con algunos minutos de atraso.")
                    .font(.footnote).foregroundStyle(Tema.gris)
            }
            Section("Datos") {
                if let d = store.datos { Text("Última actualización: \(F.dia(d.generado)) \(d.generado.suffix(5))") }
                Text("Se leen de GitHub (app/datos-app.json), que arma cada ronda. Lo que guardas desde la app va directo a los archivos del equipo.")
                    .font(.footnote).foregroundStyle(Tema.gris)
            }
        }
        .navigationTitle("Ajustes").navigationBarTitleDisplayMode(.inline)
        .toolbar { BotonCerrar() }
    }
}

// ---------- Calculadora ----------
struct CalculadoraView: View {
    @EnvironmentObject var store: Store
    @State private var producto = ""
    @State private var usd = ""
    @State private var envio = ""
    @State private var cant = 2
    @State private var tc = ""
    @State private var mediana = ""
    @State private var peso = "350"

    var vig: Vigilado? { store.datos?.vigilar?.first { $0.producto == producto } }

    var body: some View {
        Form {
            Section("Producto") {
                Picker("Producto", selection: $producto) {
                    Text("Otro").tag("")
                    ForEach(store.datos?.vigilar ?? []) { Text($0.producto).tag($0.producto) }
                }
                if producto.isEmpty {
                    LabeledContent("Se vende acá a (Bs)") { TextField("mediana", text: $mediana).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    LabeledContent("Peso con caja (g)") { TextField("350", text: $peso).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                } else if let v = vig {
                    HStack { Text("En Cochabamba (mediana 30 días)"); Spacer(); Text(F.bs(v.mediana_bs)).foregroundStyle(Tema.gris) }
                    if let t = v.tope_usd { HStack { Text("Tope del cazador"); Spacer(); Text(F.usd(t)).foregroundStyle(Tema.gris) } }
                }
            }
            Section("eBay") {
                LabeledContent("Precio (USD)") { TextField("0", text: $usd).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                LabeledContent("Envío en EE.UU.") { TextField("0", text: $envio).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                Stepper("Unidades en el pedido: \(cant)", value: $cant, in: 1...20)
                LabeledContent("Dólar (Bs)") { TextField("Bs", text: $tc).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
            }
            if let c = calculo {
                Section("Resultado") {
                    fila("Puesto en Cochabamba", F.bs(c.costoBs) + " c/u")
                    fila("Courier", "\(F.usd(c.courierUSD)) c/u · \(c.via)")
                    if let v = c.ventaBs {
                        fila("Venta sugerida (5 % debajo)", F.bs(v))
                        fila("Ganancia", "\(F.bs(c.gananciaUnidad)) c/u · \(F.bs((c.gananciaUnidad ?? 0) * Double(cant))) el lote")
                        HStack {
                            Text("Margen"); Spacer()
                            Text(F.pct((c.margen ?? 0) * 100)).font(.title3.weight(.semibold))
                                .foregroundStyle((c.margen ?? 0) >= 0.15 ? Tema.verde : (c.margen ?? 0) >= 0.05 ? Tema.ambar : Tema.rojo)
                        }
                        fila("Peor caso (dólar +3 %, courier +20 %, local −10 %)", F.pct((c.peor ?? 0) * 100))
                        Text(veredicto(c)).font(.footnote.weight(.semibold))
                    } else {
                        Text("Sin precio de Cochabamba no se puede saber si conviene.").font(.footnote).foregroundStyle(Tema.gris)
                    }
                }
            }
        }
        .navigationTitle("¿Cuánto me sale?").navigationBarTitleDisplayMode(.inline)
        .toolbar { BotonCerrar() }
        .onAppear { if tc.isEmpty, let u = store.datos?.dolar.usado { tc = F.num(u) } }
    }

    var calculo: Calculo? {
        guard let d = store.datos, let k = d.constantes, let u = Accion.num(usd), let t = Accion.num(tc) else { return nil }
        let med = producto.isEmpty ? Accion.num(mediana) : vig?.mediana_bs
        return Calculo.hacer(usd: u, envio: Accion.num(envio) ?? 0, peso: producto.isEmpty ? (Accion.num(peso) ?? 350) : (vig?.peso_g ?? 350),
                             cant: cant, tc: t, mediana: med, k: k)
    }

    func veredicto(_ c: Calculo) -> String {
        let m = c.margen ?? 0, p = c.peor ?? 0
        if m >= 0.15 && p >= 0.05 { return "Conviene: deja buen margen y aguanta el peor caso." }
        if m >= 0.15 { return "Conviene, pero justo: en el peor caso casi no queda nada." }
        if m >= 0.05 { return "Justo: hay poco margen." }
        return "No conviene a este precio."
    }

    func fila(_ a: String, _ b: String) -> some View { HStack { Text(a); Spacer(); Text(b).foregroundStyle(Tema.gris).monospacedDigit() } }
}
