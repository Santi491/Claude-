import SwiftUI
import Charts

enum Hoja: String, Identifiable {
    case compra, venta, etapa, calculadora, tarea, ajustes, prepararVenta, buscar
    var id: String { rawValue }
}

struct HoyView: View {
    @EnvironmentObject var store: Store
    @State private var hoja: Hoja?
    @State private var hojaEtapa = false

    var body: some View {
        Pantalla(titulo: "Cargo Brothers") {
            if let d = store.datos {
                NavigationLink { ScrollView { EquipoEnVivo().padding(16) }.background(Tema.fondo).navigationTitle("En vivo") } label: { LuzVivo() }.buttonStyle(.plain)
                encabezado(d)
                if let r = d.recomendaciones, !r.isEmpty { tarjetaGerente(r, cuando: d.recomendaciones_cuando ?? "") }
                if let p = principal(d) { NavigationLink(value: p) { tarjetaPedido(p) }.buttonStyle(.plain) }
                if let p = principal(d), p.etapa >= 5, !p.entregado || (d.finanzas.unidades_en_stock ?? 0) > 0 {
                    Button { hoja = .prepararVenta } label: {
                        Label("Preparar la venta del \(p.producto)", systemImage: "tag").frame(maxWidth: .infinity).padding(.vertical, 6)
                    }.buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(Tema.sobreAcento)
                }
                HStack(spacing: 12) {
                    NavigationLink { DolarView() } label: { tarjetaDolar(d) }.buttonStyle(.plain)
                    NavigationLink { FinanzasView() } label: { tarjetaPlata(d) }.buttonStyle(.plain)
                }
                tarjetaOfertas(d)
                tarjetaDecidir(d)
                tarjetaSalud(d)
                if !d.alertas.isEmpty {
                    Tarjeta(titulo: "Últimas alertas", icono: "bell") {
                        ForEach(d.alertas, id: \.self) { Text($0).font(.subheadline) }
                    }
                }
                Text("Datos de \(F.dia(d.generado)) a las \(d.generado.suffix(5))").font(.caption).foregroundStyle(Tema.gris)
            }
        } barra: {
            Button { hoja = .buscar } label: { Image(systemName: "magnifyingglass") }
            NavigationLink { ArchivoView() } label: { Image(systemName: "archivebox") }
            Button { hoja = .ajustes } label: { Image(systemName: "gearshape") }
            Menu {
                Button { hoja = .compra } label: { Label("Registrar compra", systemImage: "cart.badge.plus") }
                Button { hoja = .venta } label: { Label("Registrar venta", systemImage: "banknote") }
                Button { hoja = .etapa } label: { Label("Avisar cómo va un pedido", systemImage: "shippingbox") }
                Divider()
                Button { hoja = .calculadora } label: { Label("Calculadora: ¿cuánto me sale?", systemImage: "function") }
                Button { hoja = .tarea } label: { Label("Encargar una tarea", systemImage: "checklist") }
                Button { hoja = .prepararVenta } label: { Label("Preparar una venta", systemImage: "tag") }
            } label: { Image(systemName: "plus.circle.fill").font(.title3) }
        }
        .sheet(item: $hoja) { h in
            NavigationStack {
                switch h {
                case .compra: CompraForm()
                case .venta: VentaForm()
                case .etapa: EtapaForm()
                case .calculadora: CalculadoraView()
                case .tarea: TareaForm()
                case .ajustes: AjustesView()
                case .prepararVenta: PrepararVentaView()
                case .buscar: BuscadorView()
                }
            }
            .environmentObject(store)
            .preferredColorScheme(Tema.esquema)
            .tint(Tema.bronce)
        }
    }

    func principal(_ d: Datos) -> Pedido? { let r = d.pedidos.filter { !$0.esPrueba }; return r.filter { !$0.entregado }.max { $0.cantidad < $1.cantidad } ?? r.last }

    func encabezado(_ d: Datos) -> some View {
        // la que eligió Santi recién (si todavía no llegaron los datos nuevos) o la de los datos
        let local = store.etapaLocal
        let n = local.flatMap { Int($0) } ?? (local == "auto" ? d.etapa.auto : nil) ?? d.etapa.numero ?? 1
        let fijada = local.map { $0 != "auto" } ?? (d.etapa.fijada != nil)
        return Button { hojaEtapa = true } label: {
            HStack(spacing: 14) {
                Image("Logo").resizable().renderingMode(.template).scaledToFit().foregroundStyle(Tema.texto).frame(width: 52, height: 52)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("ETAPA \(n)").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Tema.bronce)
                        Text(fijada ? "· FIJADA POR VOS" : "· AUTOMÁTICA").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(Tema.gris)
                    }
                    Text(Etapa.nombres[n] ?? d.etapa.nombre).font(.title3.weight(.semibold)).foregroundStyle(Tema.texto)
                }
                Spacer()
                Image(systemName: "chevron.up.chevron.down").font(.footnote.weight(.semibold)).foregroundStyle(Tema.gris)
            }
            .padding(.top, 4).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $hojaEtapa) { ElegirEtapa(datos: d.etapa).environmentObject(store).presentationDetents([.medium, .large]) }
    }

    func tarjetaGerente(_ r: [Recomendacion], cuando: String) -> some View {
        Tarjeta {
            HStack(spacing: 12) {
                Avatar(agente: "gerente", tam: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text("El Gerente te recomienda").font(.headline)
                    Text(cuando.isEmpty ? "" : "\(F.dia(cuando)) \(cuando.suffix(5))").font(.caption).foregroundStyle(Tema.gris)
                }
            }
            ForEach(Array(r.enumerated()), id: \.offset) { i, x in
                HStack(alignment: .top, spacing: 10) {
                    Text("\(i + 1)").font(.caption.weight(.bold)).frame(width: 22, height: 22)
                        .background(Tema.bronce.opacity(0.2), in: Circle()).foregroundStyle(Tema.bronce)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(x.texto).font(.subheadline.weight(.semibold))
                        if !x.por_que.isEmpty { Text(x.por_que).font(.footnote).foregroundStyle(Tema.gris) }
                    }
                    Spacer(minLength: 0)
                    if let h = hojaPara(x.accion) {
                        Button { hoja = h } label: { Image(systemName: "arrow.right.circle.fill").font(.title3) }
                    }
                }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Tema.bronce.opacity(0.45)))
    }

    func hojaPara(_ a: String) -> Hoja? {
        ["pedido": .etapa, "venta": .prepararVenta, "compra": .compra, "calculadora": .calculadora, "tarea": .tarea][a]
    }

    func tarjetaPedido(_ p: Pedido) -> some View {
        Tarjeta(titulo: "Nuestro pedido", icono: "shippingbox.fill") {
            HStack(alignment: .firstTextBaseline) {
                Text("\(store.totalUnidades(p)) × \(p.producto)").font(.title3.weight(.semibold))
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Tema.gris)
            }
            Text(p.estado.prefix(1).uppercased() + p.estado.dropFirst()).font(.headline).foregroundStyle(Tema.bronce)
            Pasos(etapa: p.etapa, total: p.etapas.count, alto: 7)
            if let e = p.eventos.last {
                Text("\(F.dia(e.fecha)) · \(e.lugar): \(e.evento)").font(.footnote).foregroundStyle(Tema.gris).lineLimit(2)
            }
        }
    }

    func tarjetaDolar(_ d: Datos) -> some View {
        Tarjeta(titulo: "Dólar USDT", icono: "dollarsign.circle") {
            Text(F.num(d.dolar.usado)).font(.system(size: 30, weight: .semibold, design: .rounded))
            let serie = d.dolar.serie.suffix(14)
            Chart(Array(serie)) { p in
                LineMark(x: .value("día", p.fecha), y: .value("Bs", p.valor ?? 0)).foregroundStyle(Tema.bronce).interpolationMethod(.catmullRom)
            }
            .chartXAxis(.hidden).chartYAxis(.hidden)
            .chartYScale(domain: (serie.compactMap(\.valor).min() ?? 0) - 0.02 ... (serie.compactMap(\.valor).max() ?? 1) + 0.02)
            .frame(height: 34)
            Text("oficial \(F.num(d.dolar.oficial))").font(.caption).foregroundStyle(Tema.gris)
        }
        .frame(maxHeight: .infinity)
    }

    func tarjetaPlata(_ d: Datos) -> some View {
        Tarjeta(titulo: "Plata", icono: "banknote") {
            Text(F.bs(d.finanzas.invertido_bs)).font(.system(size: 24, weight: .semibold, design: .rounded)).minimumScaleFactor(0.6).lineLimit(1)
            Text("invertido").font(.caption).foregroundStyle(Tema.gris)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(d.finanzas.unidades_en_camino ?? 0) en camino · \(d.finanzas.unidades_en_stock ?? 0) en stock")
                Text("\(d.finanzas.unidades_vendidas ?? 0) vendidas")
            }.font(.caption).foregroundStyle(Tema.gris)
        }
        .frame(maxHeight: .infinity)
    }

    func tarjetaOfertas(_ d: Datos) -> some View {
        let bajo = d.cazador.topes.filter(\.bajo_tope)
        return Tarjeta(titulo: "Cazador de ofertas", icono: "scope") {
            Text(bajo.isEmpty ? "Hoy nada bajo el tope" : "\(bajo.count) productos bajo el tope en eBay")
                .font(.headline)
            ForEach(bajo.prefix(4)) { t in
                HStack {
                    Text(t.producto).font(.subheadline).lineLimit(1)
                    Spacer()
                    Text(F.usd(t.hoy_usd)).font(.subheadline.monospacedDigit().weight(.semibold)).foregroundStyle(Tema.verde)
                    Text("/ \(F.usd(t.tope_usd))").font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
                }
            }
            Text("Tope = lo más que conviene pagar para dejar \(Int(d.cazador.meta ?? 15)) % frente a Cochabamba.")
                .font(.caption).foregroundStyle(Tema.gris)
        }
    }

    func tarjetaDecidir(_ d: Datos) -> some View {
        let n = d.decidir.filter { store.enviadas[$0.id] == nil }.count
        return Tarjeta(titulo: "Espera tu decisión", icono: "checkmark.seal") {
            HStack {
                Text(n == 0 ? "Nada pendiente" : "\(n) cosas por decidir").font(.headline)
                Spacer()
                if n > 0 { Chip(texto: "Pestaña Decidir", color: Tema.bronce) }
            }
        }
    }

    func tarjetaSalud(_ d: Datos) -> some View {
        Tarjeta(titulo: "El equipo hoy", icono: "waveform.path.ecg") {
            ForEach(d.salud) { s in
                HStack(spacing: 10) {
                    Circle().fill(Salud14.color(s.estado)).frame(width: 9, height: 9)
                    Text(s.nombre).font(.subheadline)
                    Spacer()
                    Text(s.estado).font(.caption).foregroundStyle(Tema.gris)
                }
            }
        }
    }
}

// ---------- Dólar: hoy y el historial por rangos (1, 7, 15 y 30 días) ----------
struct DolarView: View {
    @EnvironmentObject var store: Store
    @State private var dias = 30
    @State private var detalle = false

    func fecha(_ s: String) -> Date { GraficoPrecio.fmt.date(from: s) ?? .distantPast }

    var body: some View {
        ScrollView {
            if let d = store.datos {
                let tramo = d.dolar.serie.filter { fecha($0.fecha) >= Date().addingTimeInterval(-Double(dias) * 86400) }
                VStack(spacing: 14) {
                    Tarjeta(titulo: "Hoy · \(F.dia(d.dolar.fecha))", icono: "dollarsign.circle") {
                        HStack {
                            dato("USDT (el de los cálculos)", d.dolar.usado, Tema.bronce)
                            dato("Paralelo", d.dolar.paralelo, Tema.texto)
                            dato("Oficial", d.dolar.oficial, Tema.gris)
                        }
                    }
                    Tarjeta(titulo: "Historial", icono: "chart.xyaxis.line") {
                        Picker("", selection: $dias) { Text("1 día").tag(1); Text("7 días").tag(7); Text("15 días").tag(15); Text("30 días").tag(30) }
                            .pickerStyle(.segmented)
                        if dias == 1 { hoyContraAyer(d.dolar.serie) }
                        else if tramo.count < 2 { Text("Pocos datos en este rango.").font(.footnote).foregroundStyle(Tema.gris) }
                        else {
                            Chart {
                                ForEach(tramo) { p in
                                    let f = fecha(p.fecha)
                                    if let v = p.valor { LineMark(x: .value("día", f), y: .value("Bs", v), series: .value("", "USDT")).foregroundStyle(Tema.bronce)
                                        PointMark(x: .value("día", f), y: .value("Bs", v)).foregroundStyle(Tema.bronce).symbolSize(12) }
                                    if let v = p.paralelo { LineMark(x: .value("día", f), y: .value("Bs", v), series: .value("", "Paralelo")).foregroundStyle(Tema.texto.opacity(0.6)) }
                                    if let v = p.oficial { LineMark(x: .value("día", f), y: .value("Bs", v), series: .value("", "Oficial")).foregroundStyle(Tema.gris).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3])) }
                                }
                            }
                            .chartYScale(domain: .automatic(includesZero: false))
                            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.day().month(.defaultDigits)) } }
                            .frame(height: 220)
                            HStack(spacing: 14) {
                                Label("USDT", systemImage: "circle.fill").foregroundStyle(Tema.bronce)
                                Label("Paralelo", systemImage: "circle.fill").foregroundStyle(Tema.texto.opacity(0.6))
                                Label("Oficial", systemImage: "circle.fill").foregroundStyle(Tema.gris)
                            }.font(.caption)
                            let u = tramo.compactMap(\.valor)
                            if let a = u.first, let b = u.last {
                                HStack {
                                    dato("más bajo", u.min(), Tema.verde)
                                    dato("más alto", u.max(), Tema.rojo)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text((b >= a ? "+" : "") + F.pct((b - a) / a * 100)).font(.title3.weight(.semibold).monospacedDigit()).foregroundStyle(b > a ? Tema.rojo : Tema.verde)
                                        Text("cambio del USDT").font(.caption2).foregroundStyle(Tema.gris)
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                }
                                Text(b > a ? "El dólar subió en el período: lo que compramos en eBay nos sale más caro." : "El dólar bajó o se mantuvo en el período: buen momento para comprar en eBay.")
                                    .font(.caption).foregroundStyle(Tema.gris)
                            }
                        }
                        if dias > 1 {
                            DisclosureGroup(isExpanded: $detalle) {
                                VStack(spacing: 6) {
                                    HStack { Text("Día").frame(width: 50, alignment: .leading); Spacer(); Text("USDT").frame(width: 70, alignment: .trailing); Text("Paralelo").frame(width: 70, alignment: .trailing); Text("Oficial").frame(width: 60, alignment: .trailing) }
                                        .font(.caption2.weight(.bold)).foregroundStyle(Tema.bronce)
                                    let r = Array(tramo.reversed())
                                    ForEach(Array(r.enumerated()), id: \.offset) { i, p in
                                        let ant = i + 1 < r.count ? r[i + 1] : nil
                                        HStack {
                                            Text(F.dia(p.fecha)).frame(width: 50, alignment: .leading)
                                            Spacer()
                                            celda(p.valor, ant?.valor).frame(width: 70, alignment: .trailing)
                                            celda(p.paralelo, ant?.paralelo).frame(width: 70, alignment: .trailing)
                                            celda(p.oficial, ant?.oficial).frame(width: 60, alignment: .trailing)
                                        }.font(.caption.monospacedDigit())
                                    }
                                }.padding(.top, 6)
                            } label: { Text("Ver día por día").font(.subheadline.weight(.semibold)) }
                        }
                    }
                    Text("Todo lo que está en dólares se calcula con el USDT para comprar (Binance P2P). El oficial y el paralelo son solo para comparar.")
                        .font(.caption).foregroundStyle(Tema.gris)
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle("Dólar")
    }

    func hoyContraAyer(_ s: [Punto]) -> some View {
        let u = s.last, a = s.count > 1 ? s[s.count - 2] : nil
        return VStack(alignment: .leading, spacing: 8) {
            Text("\(F.dia(u?.fecha ?? "")) contra \(F.dia(a?.fecha ?? ""))").font(.caption).foregroundStyle(Tema.gris)
            fila("USDT (cálculos)", u?.valor, a?.valor)
            fila("Paralelo", u?.paralelo, a?.paralelo)
            fila("Oficial", u?.oficial, a?.oficial)
        }
    }

    func fila(_ t: String, _ x: Double?, _ y: Double?) -> some View {
        HStack {
            Text(t).font(.subheadline)
            Spacer()
            Text(F.num(x)).font(.subheadline.monospacedDigit().weight(.semibold))
            if let x, let y, y != 0 {
                let c = (x - y) / y * 100
                Text(abs(c) < 0.05 ? "igual" : (c > 0 ? "+" : "") + F.pct(c)).font(.caption.monospacedDigit())
                    .foregroundStyle(abs(c) < 0.05 ? Tema.gris : c > 0 ? Tema.rojo : Tema.verde).frame(width: 64, alignment: .trailing)
            } else { Text("—").font(.caption).foregroundStyle(Tema.gris).frame(width: 64, alignment: .trailing) }
        }
    }

    @ViewBuilder func celda(_ v: Double?, _ a: Double?) -> some View {
        HStack(spacing: 2) {
            if let v, let a, abs(v - a) > 0.004 { Image(systemName: v > a ? "arrow.up" : "arrow.down").font(.system(size: 8, weight: .bold)).foregroundStyle(v > a ? Tema.rojo : Tema.verde) }
            Text(F.num(v))
        }
    }

    func dato(_ t: String, _ v: Double?, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(F.num(v)).font(.title3.weight(.semibold).monospacedDigit()).foregroundStyle(c)
            Text(t).font(.caption2).foregroundStyle(Tema.gris)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

// ---------- Finanzas ----------
struct FinanzasView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            if let d = store.datos {
                VStack(spacing: 14) {
                    Tarjeta(titulo: "La plata del negocio", icono: "banknote") {
                        fila("Invertido", F.bs(d.finanzas.invertido_bs))
                        fila("Vendido", F.bs(d.finanzas.ventas_bs))
                        fila("Ganancia real", d.finanzas.ganancia_bs.map { F.bs($0) } ?? "sin ventas todavía")
                        Divider().overlay(Tema.linea)
                        fila("Unidades compradas", "\(d.finanzas.unidades_compradas ?? 0)")
                        fila("En camino", "\(d.finanzas.unidades_en_camino ?? 0)")
                        fila("En stock", "\(d.finanzas.unidades_en_stock ?? 0)")
                        fila("Vendidas", "\(d.finanzas.unidades_vendidas ?? 0)")
                    }
                    ForEach(d.finanzas_productos ?? []) { p in
                        Tarjeta(titulo: p.producto, icono: "cpu") {
                            fila("Costo por unidad (todo incluido)", F.bs(p.costo_unitario_bs))
                            fila("Comprado / en camino / en stock", "\(Int(p.comprado ?? 0)) / \(Int(p.en_camino ?? 0)) / \(Int(p.en_stock ?? 0))")
                            fila("Vendido", "\(Int(p.vendido ?? 0))")
                            if let g = p.ganancia_bs { fila("Ganancia", F.bs(g)) }
                        }
                    }
                    Text("Finanzas lo recalcula en cada ronda con pedidos.csv y ventas.csv. Las compras y ventas que registres en la app entran en la próxima ronda.")
                        .font(.caption).foregroundStyle(Tema.gris)
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle("Finanzas")
    }
    func fila(_ a: String, _ b: String) -> some View {
        HStack { Text(a).foregroundStyle(Tema.gris); Spacer(); Text(b).monospacedDigit() }.font(.subheadline)
    }
}


/// Elegir la etapa del negocio (Santi, 19/11): automática (la decide el estado de los pedidos) o fijada a mano.
/// Se confirma con Face ID y le llega al Gerente, que ajusta el foco del equipo.
struct ElegirEtapa: View {
    let datos: Etapa
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var cerrar
    @State private var eleccion = ""
    var actual: String { store.etapaLocal ?? datos.fijada.map(String.init) ?? "auto" }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    opcion("auto", "Automática", "Hoy da la etapa \(datos.auto ?? datos.numero ?? 1): \(Etapa.nombres[datos.auto ?? datos.numero ?? 1] ?? ""). Cambia sola cuando sale o llega un pedido y cuando se vende la última unidad.")
                }
                Section("O fijala vos") {
                    ForEach(1...3, id: \.self) { n in opcion(String(n), "Etapa \(n) · \(Etapa.nombres[n]!)", Etapa.detalle[n]!) }
                }
                Section {
                    Button {
                        Task {
                            guard eleccion != actual else { cerrar(); return }
                            if await store.confirmarIdentidad(motivo: "Cambiar la etapa del negocio") {
                                if await store.fijarEtapa(eleccion) { cerrar() }
                            }
                        }
                    } label: { Text("Confirmar").font(.headline).frame(maxWidth: .infinity) }
                    .disabled(eleccion == actual)
                } footer: { Text("Al cambiarla, el Gerente ajusta los objetivos y el foco de cada agente. Una etapa fijada a mano queda hasta que vuelvas a «Automática».") }
            }
            .navigationTitle("Etapa del negocio").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Cerrar") { cerrar() } } }
            .onAppear { eleccion = actual }
        }
    }

    func opcion(_ v: String, _ titulo: String, _ texto: String) -> some View {
        Button { eleccion = v } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: eleccion == v ? "checkmark.circle.fill" : "circle").font(.title3)
                    .foregroundStyle(eleccion == v ? Tema.bronce : Tema.gris)
                VStack(alignment: .leading, spacing: 3) {
                    Text(titulo).font(.subheadline.weight(.semibold)).foregroundStyle(Tema.texto)
                    Text(texto).font(.footnote).foregroundStyle(Tema.gris)
                }
            }
        }
    }
}
