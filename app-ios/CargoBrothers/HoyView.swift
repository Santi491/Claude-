import SwiftUI
import Charts

enum Hoja: String, Identifiable {
    case compra, venta, etapa, calculadora, tarea, ajustes, prepararVenta
    var id: String { rawValue }
}

struct HoyView: View {
    @EnvironmentObject var store: Store
    @State private var hoja: Hoja?

    var body: some View {
        Pantalla(titulo: "Cargo Brothers") {
            if let d = store.datos {
                encabezado(d)
                if let r = d.recomendaciones, !r.isEmpty { tarjetaGerente(r, cuando: d.recomendaciones_cuando ?? "") }
                if let p = principal(d) { NavigationLink(value: p) { tarjetaPedido(p) }.buttonStyle(.plain) }
                if let p = principal(d), p.etapa >= 5, !p.entregado || (d.finanzas.unidades_en_stock ?? 0) > 0 {
                    Button { hoja = .prepararVenta } label: {
                        Label("Preparar la venta del \(p.producto)", systemImage: "tag").frame(maxWidth: .infinity).padding(.vertical, 6)
                    }.buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(.black)
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
                }
            }
            .environmentObject(store)
            .preferredColorScheme(.dark)
            .tint(Tema.bronce)
        }
    }

    func principal(_ d: Datos) -> Pedido? { d.pedidos.filter { !$0.entregado }.max { $0.cantidad < $1.cantidad } ?? d.pedidos.last }

    func encabezado(_ d: Datos) -> some View {
        HStack(spacing: 14) {
            Image("Logo").resizable().scaledToFit().frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text("ETAPA \(d.etapa.numero ?? 1)").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Tema.bronce)
                Text(d.etapa.nombre.prefix(1).uppercased() + d.etapa.nombre.dropFirst()).font(.title3.weight(.semibold))
            }
            Spacer()
        }
        .padding(.top, 4)
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

// ---------- Dólar ----------
struct DolarView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            if let d = store.datos {
                VStack(spacing: 14) {
                    Tarjeta(titulo: "Hoy", icono: "dollarsign.circle") {
                        HStack {
                            dato("USDT (el de los cálculos)", d.dolar.usado, Tema.bronce)
                            dato("Paralelo", d.dolar.paralelo, Tema.texto)
                            dato("Oficial", d.dolar.oficial, Tema.gris)
                        }
                    }
                    Tarjeta(titulo: "Últimos días", icono: "chart.xyaxis.line") {
                        let s = d.dolar.serie
                        Chart {
                            ForEach(s) { p in
                                if let v = p.valor { LineMark(x: .value("día", F.dia(p.fecha)), y: .value("Bs", v), series: .value("", "USDT")).foregroundStyle(Tema.bronce) }
                                if let v = p.paralelo { LineMark(x: .value("día", F.dia(p.fecha)), y: .value("Bs", v), series: .value("", "Paralelo")).foregroundStyle(Tema.texto.opacity(0.6)) }
                                if let v = p.oficial { LineMark(x: .value("día", F.dia(p.fecha)), y: .value("Bs", v), series: .value("", "Oficial")).foregroundStyle(Tema.gris).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3])) }
                            }
                        }
                        .chartYScale(domain: .automatic(includesZero: false))
                        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) }
                        .frame(height: 220)
                        HStack(spacing: 14) {
                            Label("USDT", systemImage: "circle.fill").foregroundStyle(Tema.bronce)
                            Label("Paralelo", systemImage: "circle.fill").foregroundStyle(Tema.texto.opacity(0.6))
                            Label("Oficial", systemImage: "circle.fill").foregroundStyle(Tema.gris)
                        }.font(.caption)
                    }
                    Text("Todo lo que está en dólares se calcula con el USDT para comprar (Binance P2P). El oficial y el paralelo son solo para comparar.")
                        .font(.caption).foregroundStyle(Tema.gris)
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle("Dólar")
    }
    func dato(_ t: String, _ v: Double?, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(F.num(v)).font(.title2.weight(.semibold).monospacedDigit()).foregroundStyle(c)
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
