import SwiftUI

// ---------- El foquito: ronda en curso (rojo) o sin ronda (gris), como en la oficina ----------
struct LuzVivo: View {
    @EnvironmentObject var store: Store
    /// en la oficina 3D (Santi, 19/11): solo el puntito; gris sin ronda, rojo latiendo con ronda en curso
    var soloPunto = false
    @State private var latido = false
    var body: some View {
        let v = store.vivo
        let on = v?.enCurso ?? false
        if soloPunto {
            ZStack {
                if on { Circle().fill(Tema.rojo.opacity(0.35)).frame(width: 18, height: 18).scaleEffect(latido ? 1.5 : 0.8).opacity(latido ? 0 : 1) }
                Circle().fill(on ? Tema.rojo : Tema.gris.opacity(0.55)).frame(width: 11, height: 11)
            }
            .frame(width: 40, height: 40)
            .background(.ultraThinMaterial, in: Circle())
            .onAppear { withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { latido = true } }
            .accessibilityLabel(on ? "Ronda en curso" : "Sin ronda en curso")
        } else {
        HStack(spacing: 8) {
            ZStack {
                if on { Circle().fill(Tema.rojo.opacity(0.35)).frame(width: 18, height: 18).scaleEffect(latido ? 1.4 : 0.8).opacity(latido ? 0 : 1) }
                Circle().fill(on ? Tema.rojo : Tema.gris.opacity(0.5)).frame(width: 9, height: 9)
            }.frame(width: 18, height: 18)
            Text(on ? "Ronda en curso · \(nombre(v?.ronda?.quien)) desde las \(v?.ronda?.desde ?? "")" : "Sin ronda en curso")
                .font(.caption.weight(.semibold)).foregroundStyle(on ? Tema.texto : Tema.gris)
            if !on, let h = v?.ronda?.hasta, (v?.ronda?.fecha ?? "") == F.bo("yyyy-MM-dd") { Text("· la última terminó a las \(h)").font(.caption).foregroundStyle(Tema.gris) }
            Spacer(minLength: 0)
            if on { Image(systemName: "chevron.right").font(.caption).foregroundStyle(Tema.gris) }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(on ? Tema.rojo.opacity(0.12) : Tema.tarjeta, in: Capsule())
        .overlay(Capsule().stroke(on ? Tema.rojo.opacity(0.4) : Tema.linea))
        .onAppear { withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { latido = true } }
        }
    }
    func nombre(_ q: String?) -> String { ["pc": "PC de la casa", "mac": "Mac"][q ?? ""] ?? (q ?? "PC") }
}

/// Qué hace cada agente durante la ronda (vivo.json)
struct EquipoEnVivo: View {
    @EnvironmentObject var store: Store
    var body: some View {
        let v = store.vivo
        Tarjeta(titulo: v?.enCurso == true ? "Equipo en vivo" : "Equipo en vivo · sin ronda", icono: "dot.radiowaves.left.and.right") {
            if v?.enCurso == true {
                let ags = (v?.agentes ?? [:]).sorted { ($0.value.hora, $0.key) > ($1.value.hora, $1.key) }
                if ags.isEmpty { Text("La ronda acaba de empezar.").font(.footnote).foregroundStyle(Tema.gris) }
                ForEach(ags, id: \.key) { k, a in
                    HStack(alignment: .top, spacing: 10) {
                        Avatar(agente: k == "cat" ? "mkt" : k == "oficina" ? "nube" : k, tam: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(Equipo.nombre(k == "cat" ? "mkt" : k) + (k == "cat" ? " (catálogos)" : "")).font(.subheadline.weight(.semibold))
                                Spacer()
                                Chip(texto: a.estado, color: a.estado == "trabajando" ? Tema.rojo : a.estado == "esperando" ? Tema.ambar : Tema.verde)
                            }
                            if !a.texto.isEmpty { Text(a.texto).font(.caption).foregroundStyle(Tema.gris) }
                            Text(a.hora).font(.caption2).foregroundStyle(Tema.gris.opacity(0.7))
                        }
                    }
                }
            } else {
                Text("Cuando arranque una ronda (10:30 o 16:00 en la PC) acá ves qué está haciendo cada agente, al momento. La pantalla se revisa sola cada 30 segundos mientras hay ronda.")
                    .font(.footnote).foregroundStyle(Tema.gris)
            }
            if let u = v?.actualizado { Text("Actualizado \(F.dia(u)) \(u.suffix(5))").font(.caption2).foregroundStyle(Tema.gris.opacity(0.7)) }
        }
    }
}

// ---------- La libreta del Gerente (memoria-gerente.csv): todo lo anotado y "Anotar" ----------
struct LibretaView: View {
    @EnvironmentObject var store: Store
    @State private var verCerradas = false
    @State private var anotar = false
    var notas: [NotaLibreta] {
        (store.datos?.libreta ?? []).filter { verCerradas ? $0.estado != "abierta" : $0.estado == "abierta" }
            .sorted { (Int($0.id) ?? 0) > (Int($1.id) ?? 0) }
    }
    var body: some View {
        Tarjeta(titulo: "Su libreta", icono: "book.closed") {
            HStack {
                Picker("", selection: $verCerradas) {
                    Text("Abiertas (\((store.datos?.libreta ?? []).filter { $0.estado == "abierta" }.count))").tag(false)
                    Text("Cerradas").tag(true)
                }.pickerStyle(.segmented)
                Button { anotar = true } label: { Label("Anotar", systemImage: "plus") }.buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(Tema.sobreAcento)
            }
            ForEach(notas) { n in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Chip(texto: n.tipo, color: n.tipo == "compromiso" ? Tema.ambar : n.tipo == "pedido" ? Tema.bronce : Tema.gris)
                        if n.fuente == "santi" { Chip(texto: "tuya", color: Tema.verde) }
                        Spacer()
                        Text("#\(n.id) · \(F.dia(n.fecha))").font(.caption2).foregroundStyle(Tema.gris)
                    }
                    Text(n.resumen).font(.footnote)
                    if !n.vence.isEmpty { Text("vence \(F.dia(n.vence))").font(.caption2).foregroundStyle(n.vence < F.bo("yyyy-MM-dd") && n.estado == "abierta" ? Tema.rojo : Tema.gris) }
                    if !n.cerrado.isEmpty { Text("\(n.estado) · \(n.cerrado)").font(.caption2).foregroundStyle(Tema.gris) }
                }
                .padding(.vertical, 4)
                Divider().overlay(Tema.linea)
            }
            if notas.isEmpty { Text(verCerradas ? "Nada cerrado todavía." : "Nada abierto.").font(.footnote).foregroundStyle(Tema.gris) }
        }
        .sheet(isPresented: $anotar) { NavigationStack { AnotarForm() }.environmentObject(store).preferredColorScheme(Tema.esquema).tint(Tema.bronce) }
    }
}

struct AnotarForm: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    @State private var texto = ""
    @State private var tipo = "pedido"
    @State private var conVence = false
    @State private var vence = Date().addingTimeInterval(86400)
    var body: some View {
        Form {
            Section {
                TextField("Ej.: avísame cuando el 9600X baje de USD 150", text: $texto, axis: .vertical).lineLimit(3...6)
            } header: { Text("Qué quieres que recuerde el Gerente") } footer: { Text("Sin nombres de personas, teléfonos ni direcciones: el repo es público.") }
            Section {
                Picker("Tipo", selection: $tipo) {
                    Text("Un pedido tuyo").tag("pedido"); Text("Cómo te gusta trabajar").tag("preferencia"); Text("Un dato").tag("dato")
                }
                Toggle("Tiene fecha", isOn: $conVence)
                if conVence { DatePicker("Vence", selection: $vence, displayedComponents: .date) }
            }
        }
        .navigationTitle("Anotar en la libreta").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button("Cerrar") { cerrar() } }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Anotar") { Task { if await store.anotarLibreta(texto, tipo: tipo, vence: conVence ? vence : nil) { cerrar() } } }
                    .disabled(texto.trimmingCharacters(in: .whitespaces).count < 5)
            }
        }
    }
}

// ---------- Tabla completa de productos (como la de la oficina) ----------
struct TablaProductos: View {
    @EnvironmentObject var store: Store
    @State private var unidades = 2
    @State private var usado = false
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Picker("", selection: $usado) { Text("Nuevo").tag(false); Text("Usado").tag(true) }.pickerStyle(.segmented)
                Picker("", selection: $unidades) { Text("2 u").tag(2); Text("4 u").tag(4) }.pickerStyle(.segmented).frame(width: 110)
            }
            Text("Margen contra el más barato de Cochabamba (Marketplace o tienda), courier más barato y dólar \(F.num(store.datos?.dolar.usado)). Tienda vs Mkt = cuánto más cobra la tienda.")
                .font(.caption2).foregroundStyle(Tema.gris)
            ScrollView(.horizontal, showsIndicators: true) {
                Grid(alignment: .trailing, horizontalSpacing: 14, verticalSpacing: 8) {
                    GridRow {
                        Text("Producto").gridColumnAlignment(.leading)
                        Text("eBay"); Text("Mkt Bs"); Text("Tienda Bs"); Text("Tienda vs Mkt"); Text("Puesto Bs"); Text("Mejor local"); Text("Margen")
                    }.font(.caption2.weight(.bold)).foregroundStyle(Tema.bronce)
                    Divider().overlay(Tema.linea)
                    ForEach(filas, id: \.0.producto) { f, c in
                        GridRow {
                            Text(f.producto.replacingOccurrences(of: "Corsair Vengeance RGB ", with: "")).font(.caption).frame(width: 150, alignment: .leading).lineLimit(2)
                            Text(F.usd(usado ? f.usado_usd : f.nuevo_usd))
                            Text(F.bs(f.mkt_bs)); Text(F.bs(f.tienda_bs))
                            Text(recargo(f)).foregroundStyle(Tema.gris)
                            Text(c.map { F.bs($0.costoBs) } ?? "—")
                            Text(F.bs(mejor(f)))
                            Text(margen(f, c).map { F.pct($0 * 100) } ?? "—").fontWeight(.semibold)
                                .foregroundStyle((margen(f, c) ?? -1) >= 0.15 ? Tema.verde : (margen(f, c) ?? -1) >= 0.05 ? Tema.ambar : Tema.rojo)
                        }.font(.caption.monospacedDigit())
                    }
                }.padding(12)
            }
            .background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
        }
    }
    var filas: [(FilaTabla, Calculo?)] {
        guard let d = store.datos, let k = d.constantes, let tc = d.dolar.usado else { return [] }
        return (d.tabla ?? []).map { f in
            let u = usado ? f.usado_usd : f.nuevo_usd
            return (f, u.map { Calculo.hacer(usd: $0, envio: 0, peso: f.peso_g, cant: unidades, tc: tc, mediana: nil, k: k) })
        }.sorted { (margen($0.0, $0.1) ?? -9) > (margen($1.0, $1.1) ?? -9) }
    }
    func mejor(_ f: FilaTabla) -> Double? { [f.mkt_bs, f.tienda_bs].compactMap { $0 }.min() }
    func margen(_ f: FilaTabla, _ c: Calculo?) -> Double? { guard let c, let l = mejor(f), l > 0 else { return nil }; return (l - c.costoBs) / l }
    func recargo(_ f: FilaTabla) -> String { guard let m = f.mkt_bs, let t = f.tienda_bs, m > 0 else { return "—" }; return (t >= m ? "+" : "") + F.pct((t - m) / m * 100) }
}

// ---------- Estado de cuenta: cada precio que cambió ----------
struct MovimientosView: View {
    @EnvironmentObject var store: Store
    @State private var tipo = ""
    @State private var soloCambios = true
    var lista: [Movimiento] {
        (store.datos?.movimientos ?? []).filter { (tipo.isEmpty || $0.tipo == tipo) && (!soloCambios || $0.antes == nil || $0.antes != $0.valor) }.reversed()
    }
    var body: some View {
        VStack(spacing: 10) {
            Picker("", selection: $tipo) { Text("Todo").tag(""); Text("eBay").tag("ebay"); Text("Cochabamba").tag("local"); Text("Dólar").tag("dolar") }.pickerStyle(.segmented)
            Toggle("Solo los que cambiaron", isOn: $soloCambios).font(.caption)
            let porDia = Dictionary(grouping: lista, by: \.fecha).sorted { $0.key > $1.key }
            ForEach(porDia, id: \.key) { dia, l in
                VStack(alignment: .leading, spacing: 6) {
                    Text(F.dia(dia)).font(.caption.weight(.bold)).foregroundStyle(Tema.bronce)
                    ForEach(Array(l.enumerated()), id: \.offset) { _, m in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(m.producto.isEmpty ? m.concepto : "\(m.producto) · \(m.concepto)").font(.caption.weight(.semibold)).lineLimit(1)
                                if !m.detalle.isEmpty { Text(m.detalle).font(.caption2).foregroundStyle(Tema.gris).lineLimit(1) }
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 1) {
                                Text(valor(m.valor, m.moneda)).font(.caption.monospacedDigit())
                                if let a = m.antes, let v = m.valor, a != v {
                                    Text((v > a ? "+" : "") + F.num(v - a, m.moneda == "Bs" ? 0 : 2)).font(.caption2.monospacedDigit()).foregroundStyle(v > a ? Tema.rojo : Tema.verde)
                                }
                            }
                        }
                    }
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }
    func valor(_ v: Double?, _ m: String) -> String { m == "Bs" ? F.bs(v) : m == "USD" ? F.usd(v) : F.num(v) }
}

// ---------- Simulador de caja: varios productos, courier A, B o la combinación más barata ----------
struct CajaView: View {
    @EnvironmentObject var store: Store
    struct Linea: Identifiable { var id = UUID(); var producto = ""; var cant = 1; var usd = "" }
    @State private var lineas = [Linea()]
    @State private var tc = ""

    var body: some View {
        Section("Lo que va en la caja") {
            ForEach($lineas) { $l in
                VStack(alignment: .leading, spacing: 6) {
                    Picker("Producto", selection: $l.producto) {
                        Text("Elegir…").tag("")
                        ForEach(store.datos?.vigilar ?? []) { Text($0.producto).tag($0.producto) }
                    }
                    HStack {
                        Stepper("\(l.cant) u", value: $l.cant, in: 1...20).fixedSize()
                        Spacer()
                        TextField("USD c/u", text: $l.usd).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 90)
                    }
                }
            }
            .onDelete { lineas.remove(atOffsets: $0) }
            Button { lineas.append(Linea()) } label: { Label("Agregar producto", systemImage: "plus") }
            LabeledContent("Dólar (Bs)") { TextField("Bs", text: $tc).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
        }
        .onAppear { if tc.isEmpty, let u = store.datos?.dolar.usado { tc = F.num(u) } }
        if let r = resultado {
            Section("Courier") {
                fila("Todo por el courier A (USD 10/u + 7 % tax)", F.usd(r.a))
                fila("Todo por el courier B (\(String(format: "%g", r.kgTodo)) kg)", F.usd(r.b))
                HStack {
                    Text("Lo más barato").fontWeight(.semibold); Spacer()
                    Text(F.usd(r.mejor)).fontWeight(.semibold).foregroundStyle(Tema.verde)
                }
                Text(r.explicacion).font(.footnote).foregroundStyle(Tema.gris)
            }
            Section("Cada producto puesto en Cochabamba") {
                ForEach(r.porProducto, id: \.0) { p, costo, margen in
                    HStack {
                        Text(p).font(.subheadline).lineLimit(1)
                        Spacer()
                        Text(F.bs(costo) + " c/u").font(.subheadline.monospacedDigit())
                        if let m = margen { Text(F.pct(m * 100)).font(.caption.monospacedDigit()).foregroundStyle(m >= 0.15 ? Tema.verde : m >= 0.05 ? Tema.ambar : Tema.rojo).frame(width: 60, alignment: .trailing) }
                    }
                }
                fila("Total puesto acá", F.bs(r.total))
            }
        }
    }

    struct Resultado { var a: Double; var b: Double; var mejor: Double; var kgTodo: Double; var explicacion: String; var porProducto: [(String, Double, Double?)]; var total: Double }

    var resultado: Resultado? {
        guard let d = store.datos, let k = d.constantes, let tc = Accion.num(tc) else { return nil }
        let ls = lineas.compactMap { l -> (String, Int, Double, Double, Double?)? in
            guard !l.producto.isEmpty, let u = Accion.num(l.usd) else { return nil }
            let v = d.vigilar?.first { $0.producto == l.producto }
            return (l.producto, l.cant, u, v?.peso_g ?? 350, v?.mediana_bs)
        }
        guard !ls.isEmpty else { return nil }
        func costoB(_ idx: [Int]) -> (Double, Double) {
            guard !idx.isEmpty else { return (0, 0) }
            let g = idx.reduce(0.0) { $0 + ls[$1].3 * Double(ls[$1].1) } + k.caja_g
            let kg = max(k.b_min_kg, (g / 1000 / k.b_paso_kg - 1e-9).rounded(.up) * k.b_paso_kg)
            return (kg * k.b_usd_kg, kg)
        }
        func costoA(_ i: Int) -> Double { Double(ls[i].1) * (k.a_usd + ls[i].2 * k.a_tax) }
        let todos = Array(ls.indices)
        let a = todos.reduce(0) { $0 + costoA($1) }
        let (b, kgTodo) = costoB(todos)
        // la combinación más barata: cada producto entero por A o por B (con pocos productos se prueban todas)
        var mejor = (Double.infinity, [Int]())
        for m in 0..<(1 << ls.count) {
            let enB = todos.filter { m & (1 << $0) != 0 }
            let t = costoB(enB).0 + todos.filter { m & (1 << $0) == 0 }.reduce(0) { $0 + costoA($1) }
            if t < mejor.0 { mejor = (t, enB) }
        }
        let enB = Set(mejor.1)
        let (bMejor, kgMejor) = costoB(mejor.1)
        let pesoB = mejor.1.reduce(0.0) { $0 + ls[$1].3 * Double(ls[$1].1) }
        var por: [(String, Double, Double?)] = []
        var total = 0.0
        for i in todos {
            let (p, c, u, peso, med) = ls[i]
            let courier = enB.contains(i) ? bMejor * (peso / max(pesoB, 1)) : (k.a_usd + u * k.a_tax)
            let bs = (u + courier) * tc
            total += bs * Double(c)
            let venta = Calculo.venta(mediana: med)
            por.append((p, bs, venta.map { ($0 - bs) / $0 }))
        }
        let expl: String
        if enB.count == ls.count { expl = "Conviene mandar todo junto por el courier B (\(String(format: "%g", kgMejor)) kg): el peso de la caja se reparte." }
        else if enB.isEmpty { expl = "Conviene todo por el courier A: a USD 10 por producto sale más barato que pagar el kilo." }
        else { expl = "Conviene separar: \(mejor.1.map { ls[$0].0 }.joined(separator: ", ")) por el B (\(String(format: "%g", kgMejor)) kg) y el resto por el A." }
        return Resultado(a: a, b: b, mejor: mejor.0, kgTodo: kgTodo, explicacion: expl, porProducto: por, total: total)
    }

    func fila(_ a: String, _ b: String) -> some View { HStack { Text(a).font(.subheadline); Spacer(); Text(b).font(.subheadline.monospacedDigit()).foregroundStyle(Tema.gris) } }
}

// ---------- Sincronización: cómo está la app con la oficina y el equipo ----------
struct SincView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        Form {
            let d = store.datos, s = d?.sincronizacion
            Section {
                fila("Datos de la app", d.map { "\(F.dia($0.generado)) \($0.generado.suffix(5))" } ?? "—")
                fila("Los armó", s?.armado_por ?? "—")
                fila("Conexión", store.enLinea ? "en línea" : "sin conexión (última copia)")
                Button("Actualizar ahora") { Task { await store.refrescar() } }
            } header: { Text("La app") } footer: {
                Text("Cada vez que algo cambia en GitHub (una ronda, la app, la oficina o una sesión con Claude), GitHub rearma los datos de la app en un minuto. Con la clave guardada la app los lee al instante; sin clave, pueden tardar hasta 5 minutos más.")
            }
            Section("El equipo y la oficina") {
                fila("Última ronda", s.map { "\(F.dia($0.ultima_ronda)) \($0.ultima_ronda.suffix(5))" } ?? "—")
                fila("Oficina publicada", s.map { "\(F.dia($0.oficina_publicada)) \($0.oficina_publicada.suffix(5))" } ?? "—")
                fila("Ronda en curso", store.vivo?.enCurso == true ? "sí, desde las \(store.vivo?.ronda?.desde ?? "")" : "no")
                Text("La oficina se publica al final de cada ronda (10:30 y 16:00). Lo que guardas desde la app aparece en la oficina después de la próxima ronda.")
                    .font(.footnote).foregroundStyle(Tema.gris)
            }
            Section("Lo que guardaste desde este iPhone") {
                if store.acciones.isEmpty { Text("Nada todavía.").foregroundStyle(Tema.gris) }
                ForEach(Array(store.acciones.enumerated()), id: \.offset) { _, a in
                    let cuando = a["cuando"] ?? ""
                    let visto = (d?.generado ?? "") >= cuando
                    HStack(alignment: .top) {
                        Image(systemName: visto ? "checkmark.circle.fill" : "clock").foregroundStyle(visto ? Tema.verde : Tema.ambar)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(a["texto"] ?? "").font(.subheadline)
                            Text("\(F.dia(cuando)) \(cuando.suffix(5)) · \(visto ? "ya está en los datos" : "guardado; esperando que se rearmen los datos")").font(.caption2).foregroundStyle(Tema.gris)
                        }
                    }
                }
            }
        }
        .navigationTitle("Sincronización").navigationBarTitleDisplayMode(.inline)
    }
    func fila(_ a: String, _ b: String) -> some View { HStack { Text(a); Spacer(); Text(b).foregroundStyle(Tema.gris) } }
}
