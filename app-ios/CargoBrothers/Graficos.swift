import SwiftUI
import Charts

// Gráficos de la app (Santi, 20/11): ventas y ganancia, stock, anuncios, competencia, oportunidades, precios de Cochabamba,
// embudo de tiendas, tiempos del envío y en qué se va la plata. Cada tarjeta se toca y abre el detalle completo.
// Uno por producto y uno por anuncio cuando hay más de uno.

enum G {
    static let fm: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "America/La_Paz"); f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()
    static func d(_ s: String) -> Date? { fm.date(from: String(s.prefix(10))) }
    static func s(_ d: Date) -> String { fm.string(from: d) }
    static var hoy: String { F.bo("yyyy-MM-dd") }
    static func dias(_ a: String, _ b: String) -> Int {
        guard let x = d(a), let y = d(b) else { return 0 }
        return Int((y.timeIntervalSince(x) / 86400).rounded())
    }
    static func sumar(_ s: String, _ n: Int) -> String { guard let x = d(s) else { return s }; return self.s(x.addingTimeInterval(Double(n) * 86400)) }
    static func n(_ s: String) -> Double? { Double(s.replacingOccurrences(of: ",", with: ".").filter { "0123456789.".contains($0) }) }
    static func corto(_ p: String) -> String {
        var x = p
        for (a, b) in [("Ryzen 9 ", "R9 "), ("Ryzen 7 ", "R7 "), ("Ryzen 5 ", "R5 "), ("Intel Core ", ""), ("Corsair Vengeance RGB ", ""), ("SSD NVMe ", "SSD "), ("Kingston ", ""), ("Samsung ", "")] {
            x = x.replacingOccurrences(of: a, with: b)
        }
        return x.count > 16 ? String(x.prefix(15)) + "…" : x
    }
    static func mediana(_ v: [Double]) -> Double? {
        guard !v.isEmpty else { return nil }
        let s = v.sorted(); let m = s.count / 2
        return s.count % 2 == 0 ? (s[m - 1] + s[m]) / 2 : s[m]
    }
    static func miles(_ v: Double) -> String { abs(v) >= 1000 ? String(format: "%.1fk", v / 1000).replacingOccurrences(of: ".0k", with: "k") : String(Int(v)) }
}

/// Pie de cada tarjeta: qué muestra y que se puede abrir
struct PieGrafico: View {
    var texto: String
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(texto).font(.caption).foregroundStyle(Tema.gris).multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            HStack(spacing: 3) { Text("Ver detalle"); Image(systemName: "chevron.right") }.font(.caption.weight(.semibold)).foregroundStyle(Tema.bronce)
        }
    }
}

struct Leyenda: View {
    var items: [(String, Color)]
    var body: some View {
        HStack(spacing: 12) {
            ForEach(items, id: \.0) { t, c in HStack(spacing: 4) { Circle().fill(c).frame(width: 8, height: 8); Text(t) } }
        }.font(.caption2).foregroundStyle(Tema.gris)
    }
}

func cifra(_ v: String, _ t: String, _ c: Color = Tema.texto) -> some View {
    VStack(alignment: .leading, spacing: 1) {
        Text(v).font(.title3.weight(.semibold).monospacedDigit()).foregroundStyle(c).minimumScaleFactor(0.6).lineLimit(1)
        Text(t).font(.caption2).foregroundStyle(Tema.gris)
    }.frame(maxWidth: .infinity, alignment: .leading)
}

// ---------- cuentas sobre los datos ----------
extension Datos {
    var reales: [Pedido] { pedidos.filter { !$0.esPrueba } }
    /// productos que compramos de verdad (uno por gráfico)
    var comprados: [String] { Array(Set(reales.map(\.producto))).sorted() }
    func unidades(_ p: String) -> Int { reales.filter { $0.producto == p }.reduce(0) { $0 + $1.cantidad } }
    func costoUnit(_ p: String) -> Double? {
        let l = reales.filter { $0.producto == p && $0.costo_unit_bs != nil }
        let u = l.reduce(0) { $0 + $1.cantidad }
        if u > 0 { return l.reduce(0.0) { $0 + ($1.costo_unit_bs ?? 0) * Double($1.cantidad) } / Double(u) }
        return finanzas_productos?.first { $0.producto == p }?.costo_unitario_bs
    }
    func invertido(_ p: String) -> Double { (costoUnit(p) ?? 0) * Double(unidades(p)) }
    func ventasDe(_ p: String) -> [VentaReg] { (ventas ?? []).filter { $0.producto == p }.sorted { $0.fecha < $1.fecha } }
    func cuantas(_ p: String, _ estado: String) -> Int { Int(ventasDe(p).filter { $0.estado == estado }.reduce(0) { $0 + $1.cantidad }) }
    func enCbba(_ p: String) -> Int { reales.filter { $0.producto == p && $0.etapa >= 5 }.reduce(0) { $0 + $1.cantidad } }
    /// día en que llegaron a Cochabamba (de los movimientos; si no, el día que se marcó)
    func llegada(_ p: String) -> String? {
        let l = reales.filter { $0.producto == p && $0.etapa >= 5 }
        guard !l.isEmpty else { return nil }
        let ev = l.flatMap(\.eventos).filter { $0.lugar.localizedCaseInsensitiveContains("Cochabamba") }
        return ev.map(\.fecha).min() ?? l.map { String($0.actualizado.prefix(10)) }.min()
    }
    func ganancia(_ v: VentaReg, _ costo: Double?) -> Double? {
        guard let pr = v.precio_bs, let c = costo else { return nil }
        return (pr - c) * v.cantidad - (v.comision_bs ?? 0)
    }
    /// nuestro precio: el del anuncio vigente; si no hay, el sugerido del Analista
    func precioNuestro(_ p: String) -> (Double, String)? {
        if let u = (publicaciones ?? []).filter({ $0.producto == p && !$0.precio_bs.isEmpty }).max(by: { $0.fecha + $0.hora < $1.fecha + $1.hora }), let v = G.n(u.precio_bs) { return (v, "nuestro anuncio") }
        if let s = productos.first(where: { $0.producto == p && $0.condicion == "nuevo" })?.sugerido_bs { return (s, "sugerido") }
        return nil
    }
    /// un pedido por paquete (3 + 1 unidades del mismo envío son un solo viaje)
    var paquetes: [Pedido] {
        var vistos = Set<String>()
        return reales.filter { vistos.insert($0.producto + $0.fecha_compra + $0.estado).inserted }
    }
    func analisisNuevo(_ p: String) -> Producto? { productos.first { $0.producto == p && $0.condicion == "nuevo" } }
}

// =====================================================================
// 1 · Ventas y ganancia (uno por producto)
// =====================================================================
struct PuntoVenta: Identifiable { var fecha: Date; var cobrado: Double; var acumulado: Double; var id: Date { fecha } }

func serieVentas(_ d: Datos, _ p: String) -> [PuntoVenta] {
    let vs = d.ventasDe(p).filter { $0.estado == "vendida" }
    let inicio = [d.llegada(p), vs.first?.fecha].compactMap { $0 }.min() ?? G.sumar(G.hoy, -6)
    let total = max(G.dias(inicio, G.hoy), 6)
    var acum = -d.invertido(p)
    var out: [PuntoVenta] = []
    for i in 0...total {
        let dia = G.sumar(inicio, i)
        let delDia = vs.filter { $0.fecha == dia }
        let cob = delDia.reduce(0.0) { $0 + ($1.cobrado_bs ?? ($1.precio_bs ?? 0) * $1.cantidad) - ($1.comision_bs ?? 0) }
        acum += cob
        if let f = G.d(dia) { out.append(PuntoVenta(fecha: f, cobrado: cob, acumulado: acum)) }
    }
    return out
}

struct GraficoVentas: View {
    var d: Datos; var producto: String; var alto: CGFloat = 170
    @Binding var sel: Date?
    init(d: Datos, producto: String, alto: CGFloat = 170, sel: Binding<Date?> = .constant(nil)) { self.d = d; self.producto = producto; self.alto = alto; self._sel = sel }
    var body: some View {
        let s = serieVentas(d, producto)
        let elegido = sel.flatMap { x in s.min { abs($0.fecha.timeIntervalSince(x)) < abs($1.fecha.timeIntervalSince(x)) } }
        Chart {
            ForEach(s) { x in
                BarMark(x: .value("día", x.fecha, unit: .day), y: .value("cobrado", x.cobrado)).foregroundStyle(Tema.bronce.opacity(0.4)).cornerRadius(3)
                LineMark(x: .value("día", x.fecha, unit: .day), y: .value("acumulado", x.acumulado)).foregroundStyle(x.acumulado >= 0 ? Tema.verde : Tema.verde).lineStyle(.init(lineWidth: 3)).interpolationMethod(.monotone)
            }
            RuleMark(y: .value("cero", 0)).foregroundStyle(Tema.gris.opacity(0.6)).lineStyle(.init(lineWidth: 1, dash: [4, 4]))
                .annotation(position: .top, alignment: .leading) { Text("recuperado lo invertido").font(.caption2).foregroundStyle(Tema.gris) }
            if let r = s.first(where: { $0.acumulado >= 0 }) {
                PointMark(x: .value("día", r.fecha, unit: .day), y: .value("acumulado", r.acumulado)).symbol { Image(systemName: "flag.checkered").font(.caption).foregroundStyle(Tema.verde) }
            }
            if let e = elegido {
                RuleMark(x: .value("día", e.fecha, unit: .day)).foregroundStyle(Tema.gris.opacity(0.5))
                    .annotation(position: .top, overflowResolution: .init(x: .fit, y: .disabled)) {
                        VStack(spacing: 1) {
                            Text(F.dia(G.s(e.fecha))).font(.caption2.weight(.semibold))
                            Text("cobrado \(F.bs(e.cobrado))").font(.caption2)
                            Text("acumulado \(F.bs(e.acumulado))").font(.caption2).foregroundStyle(e.acumulado >= 0 ? Tema.verde : Tema.rojo)
                        }.padding(6).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Tema.linea))
                    }
            }
        }
        .chartXSelection(value: $sel)
        .chartYScale(domain: (min(s.map(\.acumulado).min() ?? 0, 0) * 1.1)...(max(s.map(\.acumulado).max() ?? 0, s.map(\.cobrado).max() ?? 0, 1000) * 1.2))
        .chartYAxis { AxisMarks { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(G.miles(n)) } } } }
        .chartXAxis { AxisMarks(values: .stride(by: .day, count: max(s.count / 4, 1))) { v in AxisGridLine(); AxisValueLabel { if let f = v.as(Date.self) { Text(F.dia(G.s(f))) } } } }
        .frame(height: alto)
    }
}

struct TarjetaVentas: View {
    var d: Datos; var producto: String
    var body: some View {
        let costo = d.costoUnit(producto)
        let vs = d.ventasDe(producto).filter { $0.estado == "vendida" }
        let gan = vs.compactMap { d.ganancia($0, costo) }.reduce(0, +)
        let vendidas = d.cuantas(producto, "vendida")
        Tarjeta(titulo: "Ventas y ganancia · \(producto)", icono: "chart.bar.xaxis") {
            HStack(alignment: .firstTextBaseline) {
                Text(vs.isEmpty ? "Bs 0" : (gan >= 0 ? "+" : "") + F.bs(gan)).font(.system(size: 26, weight: .semibold, design: .rounded)).foregroundStyle(gan >= 0 ? Tema.verde : Tema.rojo)
                Text("ganancia real").font(.caption).foregroundStyle(Tema.gris)
                Spacer()
                Text("\(vendidas) de \(d.unidades(producto)) vendidas").font(.caption.weight(.semibold)).foregroundStyle(Tema.bronce)
            }
            GraficoVentas(d: d, producto: producto).allowsHitTesting(false)   // en la tarjeta el toque abre el detalle
            PieGrafico(texto: vs.isEmpty ? "Todavía sin ventas: la línea arranca en lo invertido (\(F.bs(-d.invertido(producto)))) y sube con cada venta." : "Barras: lo cobrado por día · línea: ganancia acumulada")
        }
    }
}

struct VentasDetalle: View {
    var producto: String
    @EnvironmentObject var store: Store
    @State private var sel: Date?
    var body: some View {
        ScrollView {
            if let d = store.datos {
                let costo = d.costoUnit(producto)
                let vs = d.ventasDe(producto)
                let vendidas = vs.filter { $0.estado == "vendida" }
                let cobrado = vendidas.reduce(0.0) { $0 + ($1.cobrado_bs ?? ($1.precio_bs ?? 0) * $1.cantidad) }
                let comis = vendidas.reduce(0.0) { $0 + ($1.comision_bs ?? 0) }
                let gan = vendidas.compactMap { d.ganancia($0, costo) }.reduce(0, +)
                let u = vendidas.reduce(0.0) { $0 + $1.cantidad }
                VStack(alignment: .leading, spacing: 14) {
                    Tarjeta(titulo: "Resumen", icono: "banknote") {
                        HStack { cifra(F.bs(d.invertido(producto)), "invertido"); cifra(F.bs(cobrado), "cobrado"); cifra((gan >= 0 ? "+" : "") + F.bs(gan), "ganancia", gan >= 0 ? Tema.verde : Tema.rojo) }
                        HStack { cifra("\(Int(u)) / \(d.unidades(producto))", "vendidas"); cifra(F.bs(u > 0 ? cobrado / u : nil), "precio promedio"); cifra(F.bs(comis), "comisiones") }
                        let inv = d.invertido(producto)
                        if inv > 0 {
                            ProgressView(value: min(max(cobrado - comis, 0), inv), total: inv).tint(Tema.verde)
                            Text("Recuperado \(F.pct(min((cobrado - comis) / inv * 100, 999))) de lo invertido").font(.caption).foregroundStyle(Tema.gris)
                        }
                    }
                    Tarjeta(titulo: "Día por día", icono: "chart.bar.xaxis") {
                        GraficoVentas(d: d, producto: producto, alto: 260, sel: $sel)
                        Text("Deslizá el dedo sobre el gráfico para ver cada día.").font(.caption).foregroundStyle(Tema.gris)
                    }
                    Tarjeta(titulo: "Cada venta", icono: "list.bullet") {
                        if vs.isEmpty { Text("Todavía no hay ventas. Se anotan con el + de Hoy → Registrar venta, o por Telegram.").font(.subheadline).foregroundStyle(Tema.gris) }
                        ForEach(vs.reversed()) { v in
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(Int(v.cantidad)) × \(F.bs(v.precio_bs))").font(.subheadline.weight(.semibold).monospacedDigit())
                                    Text("\(F.dia(v.fecha)) · \(v.canal.isEmpty ? "—" : v.canal)").font(.caption).foregroundStyle(Tema.gris)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Chip(texto: v.estado, color: v.estado == "vendida" ? Tema.verde : v.estado == "reservada" ? Tema.ambar : Tema.gris)
                                    if v.estado == "vendida", let g = d.ganancia(v, costo) { Text((g >= 0 ? "+" : "") + F.bs(g)).font(.caption.monospacedDigit()).foregroundStyle(g >= 0 ? Tema.verde : Tema.rojo) }
                                }
                            }
                            Divider().overlay(Tema.linea)
                        }
                    }
                    TarjetaCosto(d: d, producto: producto)
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle(producto).navigationBarTitleDisplayMode(.inline)
    }
}

// =====================================================================
// 2 · Stock (uno por producto)
// =====================================================================
struct PartesStock: Identifiable { var n: String; var v: Int; var c: Color; var id: String { n } }

func partesStock(_ d: Datos, _ p: String) -> [PartesStock] {
    let total = d.unidades(p), vend = d.cuantas(p, "vendida"), res = d.cuantas(p, "reservada")
    let llegaron = d.enCbba(p)
    let disp = max(llegaron - vend - res, 0)
    let camino = max(total - llegaron, 0)
    return [PartesStock(n: "Vendidas", v: vend, c: Tema.verde), PartesStock(n: "Reservadas", v: res, c: Tema.ambar),
            PartesStock(n: "Disponibles", v: disp, c: Tema.bronce), PartesStock(n: "En camino", v: camino, c: Tema.gris.opacity(0.5))]
}

struct TarjetaStock: View {
    var d: Datos; var producto: String
    var body: some View {
        let partes = partesStock(d, producto)
        let quedan = partes.filter { $0.n == "Disponibles" || $0.n == "En camino" }.reduce(0) { $0 + $1.v }
        Tarjeta(titulo: "Stock · \(producto)", icono: "cube.box") {
            HStack(spacing: 18) {
                ZStack {
                    Chart(partes.filter { $0.v > 0 }) { p in
                        SectorMark(angle: .value("n", p.v), innerRadius: .ratio(0.68), angularInset: 2).foregroundStyle(p.c).cornerRadius(4)
                    }.frame(width: 120, height: 120)
                    VStack(spacing: 0) { Text("\(quedan)").font(.system(size: 28, weight: .bold, design: .rounded)); Text("quedan").font(.caption2).foregroundStyle(Tema.gris) }
                }
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(partes) { p in HStack { Circle().fill(p.c).frame(width: 9, height: 9); Text(p.n).font(.subheadline); Spacer(); Text("\(p.v)").font(.subheadline.weight(.semibold)) } }
                    Divider()
                    MetaSiete(d: d, producto: producto)
                }
            }
            PieGrafico(texto: "Las 4 etapas de cada unidad")
        }
    }
}

/// la cuenta de la meta: vender todo en 7 días desde que llega
struct MetaSiete: View {
    var d: Datos; var producto: String
    var body: some View {
        if let l = d.llegada(producto) {
            let dia = min(G.dias(l, G.hoy) + 1, 99)
            let quedan = d.unidades(producto) - d.cuantas(producto, "vendida")
            HStack { Image(systemName: quedan == 0 ? "checkmark.seal.fill" : "timer").foregroundStyle(quedan == 0 ? Tema.verde : dia > 7 ? Tema.rojo : Tema.ambar)
                Text(quedan == 0 ? "¡Todo vendido!" : dia > 7 ? "Día \(dia) · meta 7" : "Día \(dia) de 7").font(.subheadline.weight(.semibold)) }
            ProgressView(value: Double(min(dia, 7)), total: 7).tint(dia > 7 ? Tema.rojo : Tema.ambar)
            Text(quedan == 0 ? "Meta cumplida" : dia > 7 ? "Pasó la meta de 7 días" : "Meta: vender todo antes del \(F.dia(G.sumar(l, 6)))").font(.caption).foregroundStyle(Tema.gris)
        } else {
            HStack { Image(systemName: "airplane").foregroundStyle(Tema.gris); Text("Todavía no llegan").font(.subheadline.weight(.semibold)) }
            Text("La cuenta de 7 días para venderlas empieza al llegar").font(.caption).foregroundStyle(Tema.gris)
        }
    }
}

struct StockDetalle: View {
    var producto: String
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            if let d = store.datos {
                VStack(alignment: .leading, spacing: 14) {
                    TarjetaStock(d: d, producto: producto)
                    Tarjeta(titulo: "Por pedido", icono: "shippingbox") {
                        ForEach(d.reales.filter { $0.producto == producto }) { p in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(p.cantidad) unidad\(p.cantidad == 1 ? "" : "es")").font(.subheadline.weight(.semibold))
                                    Text("Comprado el \(F.dia(p.fecha_compra)) · \(p.estado)").font(.caption).foregroundStyle(Tema.gris)
                                }
                                Spacer()
                                Text(F.bs(p.costo_unit_bs)).font(.subheadline.monospacedDigit())
                                Text("c/u").font(.caption2).foregroundStyle(Tema.gris)
                            }
                        }
                    }
                    Tarjeta(titulo: "Reservas y ventas", icono: "person.crop.circle.badge.checkmark") {
                        let vs = d.ventasDe(producto)
                        if vs.isEmpty { Text("Todavía nadie reservó ni compró.").font(.subheadline).foregroundStyle(Tema.gris) }
                        ForEach(vs.reversed()) { v in
                            HStack { Text("\(F.dia(v.fecha)) · \(Int(v.cantidad)) × \(F.bs(v.precio_bs))").font(.subheadline.monospacedDigit()); Spacer(); Chip(texto: v.estado, color: v.estado == "vendida" ? Tema.verde : Tema.ambar) }
                        }
                    }
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle("Stock").navigationBarTitleDisplayMode(.inline)
    }
}

// =====================================================================
// 3 · Nuestros anuncios en Marketplace (uno por anuncio y un resumen si hay varios)
// =====================================================================
struct Anuncio: Identifiable, Hashable {
    var n: Int; var producto: String; var filas: [Publicacion]
    var id: String { producto + "#\(n)" }
    var ultima: Publicacion { filas.last! }
    var primera: Publicacion { filas.first! }
    var titulo: String { filas.last(where: { !$0.titulo.isEmpty })?.titulo ?? producto }
    var precio: Double? { filas.last(where: { !$0.precio_bs.isEmpty }).flatMap { G.n($0.precio_bs) } }
    var clics: Int { filas.compactMap { G.n($0.clics) }.max().map(Int.init) ?? 0 }
    var mensajes: Int { filas.compactMap { G.n($0.mensajes) }.max().map(Int.init) ?? 0 }
    var activo: Bool { !["vendida", "eliminada", "pausada"].contains(ultima.accion) }
    var diasEnLinea: Int { max(G.dias(primera.fecha, activo ? G.hoy : ultima.fecha), 0) }
}

func anuncios(_ d: Datos) -> [Anuncio] {
    let filas = (d.publicaciones ?? []).sorted { $0.fecha + $0.hora < $1.fecha + $1.hora }
    var out: [Anuncio] = []
    for f in filas {
        if f.accion == "publicada" || !out.contains(where: { $0.producto == f.producto }) {
            out.append(Anuncio(n: out.filter { $0.producto == f.producto }.count + 1, producto: f.producto, filas: [f]))
        } else if let i = (f.titulo.isEmpty ? nil : out.lastIndex(where: { $0.producto == f.producto && $0.filas.contains { $0.titulo == f.titulo } }))
                    ?? out.lastIndex(where: { $0.producto == f.producto && ($0.ultima.pedido_id ?? "") == (f.pedido_id ?? "") }) ?? out.lastIndex(where: { $0.producto == f.producto }) {
            out[i].filas.append(f)
        }
    }
    return out
}

struct PuntoAnuncio: Identifiable { var fecha: Date; var clics: Double; var nuevos: Double; var id: Date { fecha } }
func serieAnuncio(_ a: Anuncio) -> [PuntoAnuncio] {
    var porDia: [String: (Double, Double)] = [:]
    for f in a.filas { porDia[f.fecha] = (max(porDia[f.fecha]?.0 ?? 0, G.n(f.clics) ?? 0), max(porDia[f.fecha]?.1 ?? 0, G.n(f.mensajes) ?? 0)) }
    var antes = 0.0
    return porDia.keys.sorted().compactMap { k in
        guard let f = G.d(k), let v = porDia[k] else { return nil }
        defer { antes = v.1 }
        return PuntoAnuncio(fecha: f, clics: v.0, nuevos: max(v.1 - antes, 0))
    }
}

struct GraficoAnuncio: View {
    var a: Anuncio; var alto: CGFloat = 140
    var body: some View {
        let s = serieAnuncio(a)
        let maxC = max(s.map(\.clics).max() ?? 1, 1), maxM = max(s.map(\.nuevos).max() ?? 1, 1)
        Chart {
            ForEach(s) { x in
                AreaMark(x: .value("día", x.fecha, unit: .day), y: .value("clics", x.clics))
                    .foregroundStyle(.linearGradient(colors: [Tema.bronce.opacity(0.45), Tema.bronce.opacity(0.02)], startPoint: .top, endPoint: .bottom)).interpolationMethod(.catmullRom)
                LineMark(x: .value("día", x.fecha, unit: .day), y: .value("clics", x.clics)).foregroundStyle(Tema.bronce).interpolationMethod(.catmullRom)
                BarMark(x: .value("día", x.fecha, unit: .day), y: .value("mensajes", x.nuevos / maxM * maxC * 0.6), width: 10).foregroundStyle(Tema.verde).cornerRadius(3)
            }
        }
        .chartYAxis(.hidden)
        .chartXAxis { AxisMarks(values: .stride(by: .day, count: max(s.count / 4, 1))) { v in AxisGridLine(); AxisValueLabel { if let f = v.as(Date.self) { Text(F.dia(G.s(f))) } } } }
        .frame(height: alto)
    }
}

struct TarjetaAnuncio: View {
    var a: Anuncio; var varios: Bool
    var body: some View {
        Tarjeta(titulo: varios ? "Anuncio \(a.n) · \(a.producto)" : "Anuncio · \(a.producto)", icono: "megaphone") {
            HStack {
                Chip(texto: a.ultima.accion, color: a.ultima.accion == "vendida" ? Tema.verde : a.activo ? Tema.bronce : Tema.gris)
                Spacer()
                if let p = a.precio { Text(F.bs(p)).font(.title3.weight(.semibold).monospacedDigit()) }
            }
            HStack {
                cifra("\(a.clics)", "clics"); cifra("\(a.mensajes)", "mensajes")
                cifra(a.clics > 0 ? F.pct(Double(a.mensajes) / Double(a.clics) * 100) : "—", "preguntan", Tema.verde); cifra("\(a.diasEnLinea)", "días")
            }
            if serieAnuncio(a).count > 1 { GraficoAnuncio(a: a) }
            Leyenda(items: [("clics acumulados", Tema.bronce), ("mensajes nuevos", Tema.verde)])
            PieGrafico(texto: a.titulo)
        }
    }
}

struct ResumenAnuncios: View {
    var lista: [Anuncio]
    var body: some View {
        Tarjeta(titulo: "Todos los anuncios", icono: "rectangle.stack") {
            Chart {
                ForEach(lista) { a in
                    BarMark(x: .value("n", a.clics), y: .value("anuncio", "\(a.n) · \(G.corto(a.producto))")).foregroundStyle(by: .value("tipo", "clics")).position(by: .value("tipo", "clics"))
                    BarMark(x: .value("n", a.mensajes), y: .value("anuncio", "\(a.n) · \(G.corto(a.producto))")).foregroundStyle(by: .value("tipo", "mensajes")).position(by: .value("tipo", "mensajes"))
                }
            }
            .chartForegroundStyleScale(["clics": Tema.bronce, "mensajes": Tema.verde])
            .chartLegend(position: .bottom)
            .frame(height: CGFloat(max(lista.count, 2)) * 52 + 30)
            Text("\(lista.filter(\.activo).count) en línea · \(lista.reduce(0) { $0 + $1.clics }) clics y \(lista.reduce(0) { $0 + $1.mensajes }) mensajes en total").font(.caption).foregroundStyle(Tema.gris)
        }
    }
}

struct AnuncioDetalle: View {
    var a: Anuncio
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Tarjeta(titulo: "El anuncio", icono: "megaphone") {
                    Text(a.titulo).font(.headline)
                    HStack { cifra(F.bs(a.precio), "precio"); cifra("\(a.diasEnLinea)", "días en línea"); cifra("\(a.filas.filter { $0.accion == "renovada" }.count)", "renovaciones") }
                    HStack { cifra("\(a.clics)", "clics"); cifra("\(a.mensajes)", "mensajes"); cifra(a.clics > 0 ? F.pct(Double(a.mensajes) / Double(a.clics) * 100) : "—", "preguntan", Tema.verde) }
                }
                Tarjeta(titulo: "Día por día", icono: "chart.xyaxis.line") {
                    if serieAnuncio(a).count > 1 { GraficoAnuncio(a: a, alto: 220) } else { Text("El gráfico aparece cuando Marketplace anote los clics de un segundo día.").font(.subheadline).foregroundStyle(Tema.gris) }
                    Leyenda(items: [("clics acumulados", Tema.bronce), ("mensajes nuevos", Tema.verde)])
                }
                let precios = a.filas.compactMap { f in G.n(f.precio_bs).flatMap { v in G.d(f.fecha).map { ($0, v) } } }
                if Set(precios.map(\.1)).count > 1 {
                    Tarjeta(titulo: "Cambios de precio", icono: "tag") {
                        Chart(precios, id: \.0) { x in
                            LineMark(x: .value("día", x.0, unit: .day), y: .value("Bs", x.1)).interpolationMethod(.stepEnd).foregroundStyle(Tema.bronce)
                            PointMark(x: .value("día", x.0, unit: .day), y: .value("Bs", x.1)).foregroundStyle(Tema.bronce)
                        }.frame(height: 150)
                    }
                }
                if let d = store.datos { TarjetaCompetencia(d: d, producto: a.producto) }
                Tarjeta(titulo: "Historial", icono: "clock") {
                    ForEach(a.filas.reversed()) { x in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(F.dia(x.fecha)) \(x.hora) · \(x.accion)\(x.precio_bs.isEmpty ? "" : " a Bs \(x.precio_bs)")").font(.subheadline)
                            if !x.notas.isEmpty { Text(x.notas).font(.caption).foregroundStyle(Tema.gris) }
                        }
                        Divider().overlay(Tema.linea)
                    }
                }
            }.padding(16)
        }
        .background(Tema.fondo).navigationTitle("Anuncio \(a.n)").navigationBarTitleDisplayMode(.inline)
    }
}

// =====================================================================
// 4 · Nuestro precio contra la competencia (uno por producto)
// =====================================================================
struct Rival: Identifiable { var fecha: Date; var bs: Double; var tipo: String; var quien: String; var url: String; var id: String { quien + G.s(fecha) + String(bs) } }
func rivales(_ d: Datos, _ p: String, dias: Int = 30) -> [Rival] {
    let desde = G.sumar(G.hoy, -dias)
    let todos = rivalesSinFiltro(d, p, desde)
    // fuera los precios raros (combos, PCs armadas, errores): menos de la mitad o más del doble de la mediana
    guard let m = G.mediana(todos.map(\.bs)) else { return [] }
    return todos.filter { $0.bs >= m * 0.5 && $0.bs <= m * 1.8 }
}
func rivalesSinFiltro(_ d: Datos, _ p: String, _ desde: String) -> [Rival] {
    (d.locales?[p] ?? []).compactMap { l in
        guard let b = l.bs, l.fecha >= desde, !l.estado.contains("otra ciudad"), let f = G.d(l.fecha) else { return nil }
        if l.src != "mkt" && !l.cuenta { return nil }
        return Rival(fecha: f, bs: b, tipo: l.src == "mkt" ? "Marketplace" : "Tiendas", quien: l.src == "mkt" ? "Marketplace" : l.vendedor.replacingOccurrences(of: " (WhatsApp)", with: ""), url: l.url)
    }
}

struct GraficoCompetencia: View {
    var d: Datos; var producto: String; var alto: CGFloat = 170
    var body: some View {
        let r = rivales(d, producto)
        let nuestro = d.precioNuestro(producto)
        let costo = d.costoUnit(producto) ?? d.analisisNuevo(producto)?.costo_bs
        let valores = r.map(\.bs) + [nuestro?.0, costo].compactMap { $0 }
        let lo = (valores.min() ?? 0) * 0.94, hi = (valores.max() ?? 1) * 1.04
        Chart {
            ForEach(r) { x in
                PointMark(x: .value("día", x.fecha, unit: .day), y: .value("Bs", x.bs)).foregroundStyle(by: .value("quién", x.tipo)).symbolSize(55)
            }
            if let c = costo {
                RuleMark(y: .value("costo", c)).foregroundStyle(Tema.rojo.opacity(0.7)).lineStyle(.init(lineWidth: 1, dash: [3, 3]))
                    .annotation(position: .bottom, alignment: .leading) { Text("nuestro costo \(F.bs(c))").font(.caption2).foregroundStyle(Tema.rojo) }
            }
            if let n = nuestro {
                RuleMark(y: .value("nuestro", n.0)).foregroundStyle(Tema.bronce).lineStyle(.init(lineWidth: 3))
                    .annotation(position: .top, alignment: .trailing) { Text("\(n.1 == "sugerido" ? "sugerido" : "nosotros") \(F.bs(n.0))").font(.caption.weight(.semibold)).foregroundStyle(Tema.bronce) }
            }
        }
        .chartForegroundStyleScale(["Marketplace": Tema.gris.opacity(0.75), "Tiendas": Tema.ambar.opacity(0.8)])
        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { v in AxisGridLine(); AxisValueLabel { if let f = v.as(Date.self) { Text(F.dia(G.s(f))) } } } }
        .chartYScale(domain: lo...max(hi, lo + 1))
        .chartYAxis { AxisMarks { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(G.miles(n)) } } } }
        .chartLegend(position: .bottom)
        .frame(height: alto)
    }
}

struct TarjetaCompetencia: View {
    var d: Datos; var producto: String
    var body: some View {
        let r = rivales(d, producto)
        let n = d.precioNuestro(producto)
        Tarjeta(titulo: "Precio vs. competencia · \(producto)", icono: "scalemass") {
            if r.isEmpty {
                Text("Sin precios de la competencia en los últimos 30 días.").font(.subheadline).foregroundStyle(Tema.gris)
            } else {
                if let n {
                    let baratos = r.filter { $0.bs < n.0 }.count, caros = r.filter { $0.bs > n.0 }.count
                    Text(baratos == 0 ? "Somos los más baratos de \(r.count)" : caros == 0 ? "Somos los más caros de \(r.count)" : "\(baratos) más baratos y \(caros) más caros que \(n.1 == "sugerido" ? "el sugerido" : "nosotros")").font(.subheadline)
                }
                GraficoCompetencia(d: d, producto: producto)
            }
            PieGrafico(texto: "Cada punto es otro vendedor del mismo producto (30 días)")
        }
    }
}

struct CompetenciaDetalle: View {
    var producto: String
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            if let d = store.datos {
                let r = rivales(d, producto, dias: 45).sorted { $0.bs < $1.bs }
                VStack(alignment: .leading, spacing: 14) {
                    Tarjeta(titulo: "Últimos 30 días", icono: "scalemass") { GraficoCompetencia(d: d, producto: producto, alto: 260) }
                    Tarjeta(titulo: "Del más barato al más caro (45 días)", icono: "list.number") {
                        let n = d.precioNuestro(producto)?.0
                        ForEach(r) { x in
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(x.quien).font(.subheadline).lineLimit(1)
                                    Text("\(F.dia(G.s(x.fecha))) · \(x.tipo)").font(.caption2).foregroundStyle(Tema.gris)
                                }
                                Spacer()
                                if let u = URL(string: x.url), !x.url.isEmpty { Link(F.bs(x.bs), destination: u).font(.subheadline.monospacedDigit()) }
                                else { Text(F.bs(x.bs)).font(.subheadline.monospacedDigit()) }
                                if let n { Image(systemName: x.bs < n ? "arrow.down" : x.bs > n ? "arrow.up" : "equal").font(.caption).foregroundStyle(x.bs < n ? Tema.rojo : Tema.verde) }
                            }
                            Divider().overlay(Tema.linea)
                        }
                        Text("Flecha roja: más barato que nosotros · verde: más caro.").font(.caption).foregroundStyle(Tema.gris)
                    }
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle("Competencia").navigationBarTitleDisplayMode(.inline)
    }
}

// =====================================================================
// 5 · Mapa de oportunidades (todos los productos)
// =====================================================================
struct Oport: Identifiable { var p: Producto; var rapidez: Double; var tiendas: Double; var id: String { p.id } }
func oportunidades(_ d: Datos) -> [Oport] {
    let dem = Dictionary((d.demanda ?? []).map { ($0.producto, $0) }, uniquingKeysWith: { a, _ in a })
    return d.productos.filter { $0.condicion == "nuevo" && $0.margen != nil }.compactMap { p in
        guard let r = dem[p.producto]?.puntaje else { return nil }
        return Oport(p: p, rapidez: r, tiendas: p.precios_locales ?? 1)
    }
}

struct GraficoOportunidades: View {
    var lista: [Oport]; var alto: CGFloat = 240; var nombres: Set<String>? = nil
    var body: some View {
        let maxX = max(lista.map(\.rapidez).max() ?? 10, 1) * 1.25
        let ys = lista.compactMap(\.p.margen)
        let lo = max(min((ys.min() ?? 0) - 5, 0), -20), hi = max((ys.max() ?? 30) + 6, 20)
        Chart {
            RectangleMark(xStart: .value("x", maxX / 2), xEnd: .value("x", maxX), yStart: .value("y", 15), yEnd: .value("y", hi)).foregroundStyle(Tema.verde.opacity(0.09))
            RuleMark(y: .value("m", 15)).foregroundStyle(Tema.gris.opacity(0.4)).lineStyle(.init(dash: [3, 3]))
            ForEach(lista) { x in
                PointMark(x: .value("se vende", x.rapidez), y: .value("margen", max(x.p.margen ?? 0, lo + 1)))
                    .symbolSize(min(max(x.tiendas, 1), 14) * 45)
                    .foregroundStyle(Tema.color(recomendacion: x.p.recomendacion).opacity(0.7))
                    .annotation(position: .trailing, spacing: 2) { if nombres?.contains(x.id) ?? true { Text(G.corto(x.p.producto)).font(.system(size: 9, weight: .semibold)).foregroundStyle(Tema.texto.opacity(0.85)) } }
            }
        }
        .chartXScale(domain: 0...maxX).chartYScale(domain: lo...hi)
        .chartXAxis { AxisMarks { AxisGridLine() } }
        .chartXAxisLabel("se vende más rápido →").chartYAxisLabel("margen %")
        .frame(height: alto)
    }
}

struct TarjetaOportunidades: View {
    var d: Datos
    var body: some View {
        let todas = oportunidades(d)
        // en la tarjeta solo las 7 mejores (margen por rapidez); todas en el detalle
        let l = Array(todas.filter { ($0.p.margen ?? 0) >= 0 }.sorted { ($0.p.margen ?? 0) * $0.rapidez > ($1.p.margen ?? 0) * $1.rapidez }.prefix(7))
        Tarjeta(titulo: "Mapa de oportunidades", icono: "sparkle.magnifyingglass") {
            if l.isEmpty { Text("Falta la demanda de Marketplace para dibujarlo.").font(.subheadline).foregroundStyle(Tema.gris) }
            else {
                let buenas = l.filter { ($0.p.margen ?? 0) >= 15 && $0.rapidez >= (l.map(\.rapidez).max() ?? 0) * 1.15 / 2 }
                Text(buenas.isEmpty ? "Hoy ninguno cae en la zona verde" : "En la zona verde: \(buenas.map { G.corto($0.p.producto) }.joined(separator: ", "))").font(.subheadline)
                GraficoOportunidades(lista: l)
            }
            PieGrafico(texto: "Las 7 mejores de \(todas.count) · burbuja grande = más tiendas lo venden")
        }
    }
}

struct OportunidadesDetalle: View {
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            if let d = store.datos {
                let l = oportunidades(d)
                VStack(alignment: .leading, spacing: 14) {
                    Tarjeta(titulo: "Margen contra rapidez de venta", icono: "sparkle.magnifyingglass") {
                        GraficoOportunidades(lista: l, alto: 380, nombres: Set(l.sorted { ($0.p.margen ?? 0) * $0.rapidez > ($1.p.margen ?? 0) * $1.rapidez }.prefix(10).map(\.id)))
                        Text("Con nombre, las 10 mejores; todas en la lista de abajo.").font(.caption).foregroundStyle(Tema.gris)
                        Leyenda(items: [("traer", Tema.color(recomendacion: "traer")), ("esperar", Tema.color(recomendacion: "esperar")), ("no traer", Tema.color(recomendacion: "no traer"))])
                    }
                    Tarjeta(titulo: "Ordenados por margen", icono: "list.number") {
                        ForEach(l.sorted { ($0.p.margen ?? 0) > ($1.p.margen ?? 0) }) { x in
                            NavigationLink(value: x.p) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(x.p.producto).font(.subheadline.weight(.semibold)).foregroundStyle(Tema.texto)
                                        Text("se vende \(F.num(x.rapidez, 1)) · \(Int(x.tiendas)) precios en Cbba · \(x.p.recomendacion)").font(.caption2).foregroundStyle(Tema.gris)
                                    }
                                    Spacer()
                                    Text(F.pct(x.p.margen)).font(.subheadline.monospacedDigit().weight(.semibold)).foregroundStyle(Tema.color(recomendacion: x.p.recomendacion))
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(Tema.gris)
                                }
                            }.buttonStyle(.plain)
                            Divider().overlay(Tema.linea)
                        }
                        let sin = d.productos.filter { $0.condicion == "nuevo" && !l.map(\.p.id).contains($0.id) }
                        if !sin.isEmpty { Text("Sin datos de demanda todavía: \(sin.map(\.producto).joined(separator: ", ")).").font(.caption).foregroundStyle(Tema.gris) }
                    }
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle("Oportunidades").navigationBarTitleDisplayMode(.inline)
    }
}

// =====================================================================
// 6 · Abanico de precios en Cochabamba
// =====================================================================
struct Rango: Identifiable { var producto: String; var min: Double; var max: Double; var med: Double; var costo: Double?; var n: Int; var id: String { producto } }
func rangos(_ d: Datos) -> [Rango] {
    (d.locales ?? [:]).compactMap { p, l in
        let v = l.filter { $0.cuenta }.compactMap(\.bs)
        guard v.count >= 2, let m = G.mediana(v) else { return nil }
        return Rango(producto: p, min: v.min()!, max: v.max()!, med: m, costo: d.analisisNuevo(p)?.costo_bs, n: v.count)
    }.sorted { $0.n > $1.n }
}

struct GraficoAbanico: View {
    var lista: [Rango]
    var body: some View {
        // una fila por producto con su nombre arriba; todas con la misma escala
        let tope = (lista.map { max($0.max, $0.costo ?? 0) }.max() ?? 1) * 1.04
        VStack(alignment: .leading, spacing: 6) {
            ForEach(lista) { x in
                VStack(alignment: .leading, spacing: 1) {
                    HStack {
                        Text(x.producto).font(.caption.weight(.semibold)).lineLimit(1)
                        Spacer()
                        Text("\(G.miles(x.min))–\(G.miles(x.max))").font(.caption2.monospacedDigit()).foregroundStyle(Tema.gris)
                    }
                    Chart {
                        BarMark(xStart: .value("min", x.min), xEnd: .value("max", x.max), y: .value("p", "p"), height: 10).foregroundStyle(Tema.bronce.opacity(0.3)).cornerRadius(5)
                        PointMark(x: .value("med", x.med), y: .value("p", "p")).foregroundStyle(Tema.bronce).symbolSize(50)
                        if let c = x.costo { PointMark(x: .value("eeuu", c), y: .value("p", "p")).symbol(.diamond).foregroundStyle(Tema.verde).symbolSize(50) }
                    }
                    .chartXScale(domain: 0...tope).chartXAxis(.hidden).chartYAxis(.hidden).frame(height: 14)
                }
            }
            Chart { RuleMark(x: .value("x", 0)).foregroundStyle(.clear) }
                .chartXScale(domain: 0...tope).chartYAxis(.hidden)
                .chartXAxis { AxisMarks { v in AxisValueLabel { if let n = v.as(Double.self) { Text(G.miles(n)) } } } }
                .frame(height: 16)
        }
    }
}

struct TarjetaAbanico: View {
    var d: Datos
    var body: some View {
        let l = Array(rangos(d).prefix(6))
        Tarjeta(titulo: "Precios en Cochabamba", icono: "chart.bar.doc.horizontal") {
            if l.isEmpty { Text("Faltan precios locales.").font(.subheadline).foregroundStyle(Tema.gris) }
            else { GraficoAbanico(lista: l) }
            Leyenda(items: [("rango", Tema.bronce.opacity(0.4)), ("mediana", Tema.bronce), ("puesto desde EE.UU.", Tema.verde)])
            PieGrafico(texto: "Los \(l.count) con más precios · todos en el detalle")
        }
    }
}

struct AbanicoDetalle: View {
    @EnvironmentObject var store: Store
    @State private var abierto: String?
    var body: some View {
        ScrollView {
            if let d = store.datos {
                let l = rangos(d)
                VStack(alignment: .leading, spacing: 14) {
                    Tarjeta(titulo: "Todos los productos", icono: "chart.bar.doc.horizontal") {
                        GraficoAbanico(lista: l)
                        Leyenda(items: [("rango", Tema.bronce.opacity(0.4)), ("mediana", Tema.bronce), ("puesto desde EE.UU.", Tema.verde)])
                    }
                    ForEach(l) { r in
                        Tarjeta {
                            Button { withAnimation { abierto = abierto == r.producto ? nil : r.producto } } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(r.producto).font(.subheadline.weight(.semibold)).foregroundStyle(Tema.texto)
                                        Text("\(F.bs(r.min)) a \(F.bs(r.max)) · mediana \(F.bs(r.med)) · \(r.n) precios").font(.caption2).foregroundStyle(Tema.gris)
                                    }
                                    Spacer()
                                    Image(systemName: abierto == r.producto ? "chevron.up" : "chevron.down").foregroundStyle(Tema.gris)
                                }
                            }.buttonStyle(.plain)
                            if abierto == r.producto {
                                ForEach((d.locales?[r.producto] ?? []).filter { $0.cuenta && $0.bs != nil }.sorted { ($0.bs ?? 0) < ($1.bs ?? 0) }) { x in
                                    HStack {
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(x.src == "mkt" ? "Marketplace" : x.vendedor).font(.caption).lineLimit(1)
                                            Text(F.dia(x.fecha)).font(.caption2).foregroundStyle(Tema.gris)
                                        }
                                        Spacer()
                                        Text(F.bs(x.bs)).font(.caption.monospacedDigit())
                                    }
                                }
                            }
                        }
                    }
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle("Precios en Cochabamba").navigationBarTitleDisplayMode(.inline)
    }
}

// =====================================================================
// 7 · Embudo de tiendas (cada paso abre la lista)
// =====================================================================
struct PasoEmbudo: Identifiable { var i: Int; var n: String; var tiendas: [TiendaInfo]; var id: Int { i } }
func embudo(_ d: Datos) -> [PasoEmbudo] {
    let t = d.tiendas ?? []
    let cats = (d.catalogos ?? []).map { $0.tienda.lowercased() }
    let escrib = t.filter { $0.enviados > 0 }
    let resp = escrib.filter { $0.recibidos > 0 }
    let precio = resp.filter { $0.con_precio > 0 || !$0.precios.isEmpty }
    let lista = precio.filter { x in let n = x.tienda.lowercased(); return cats.contains { $0.hasPrefix(n) || n.hasPrefix($0) } || x.precios.count >= 5 }
    return [PasoEmbudo(i: 0, n: "Les escribimos", tiendas: escrib), PasoEmbudo(i: 1, n: "Respondieron", tiendas: resp),
            PasoEmbudo(i: 2, n: "Dieron precio", tiendas: precio), PasoEmbudo(i: 3, n: "Lista o catálogo", tiendas: lista)]
}

struct TarjetaEmbudo: View {
    var d: Datos
    var body: some View {
        let pasos = embudo(d)
        let tope = Double(max(pasos.first?.tiendas.count ?? 1, 1))
        Tarjeta(titulo: "Embudo de tiendas", icono: "line.3.horizontal.decrease") {
            Text("De \(d.tiendas?.count ?? 0) tiendas en la lista").font(.caption).foregroundStyle(Tema.gris)
            VStack(spacing: 4) {
                ForEach(pasos) { p in
                    NavigationLink { EmbudoDetalle(paso: p.i) } label: {
                        GeometryReader { g in
                            HStack {
                                Spacer(minLength: 0)
                                ZStack {
                                    RoundedRectangle(cornerRadius: 8).fill(Tema.bronce.opacity(1 - Double(p.i) * 0.17))
                                    HStack { Text(p.n).font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8); Spacer(); Text("\(p.tiendas.count)").font(.subheadline.weight(.bold)); Image(systemName: "chevron.right").font(.caption2) }
                                        .padding(.horizontal, 10).foregroundStyle(Tema.sobreAcento)
                                }.frame(width: max(g.size.width * CGFloat(Double(p.tiendas.count) / tope), 190))
                                Spacer(minLength: 0)
                            }
                        }.frame(height: 34)
                    }.buttonStyle(.plain)
                    if p.i < pasos.count - 1, p.tiendas.count > 0 {
                        Text("\(Int(Double(pasos[p.i + 1].tiendas.count) / Double(p.tiendas.count) * 100)) % pasa").font(.caption2).foregroundStyle(Tema.gris)
                    }
                }
            }
            let t = d.tiendas ?? []
            HStack(spacing: 14) {
                NavigationLink { EmbudoDetalle(paso: 10) } label: { Label("\(t.filter { $0.fria == true }.count) frías", systemImage: "snowflake") }
                NavigationLink { EmbudoDetalle(paso: 11) } label: { Label("\(t.filter { $0.lista == true }.count) con lista pedida", systemImage: "list.bullet.rectangle") }
                NavigationLink { EmbudoDetalle(paso: 12) } label: { Label("\(t.filter { $0.enviados == 0 }.count) sin escribir", systemImage: "bubble.left.and.exclamationmark.bubble.right") }
            }.font(.caption2).foregroundStyle(Tema.gris).buttonStyle(.plain)
            NavigationLink { EmbudoDetalle(paso: 0) } label: { PieGrafico(texto: "Tocá un paso para ver las tiendas") }.buttonStyle(.plain)
        }
    }
}

struct EmbudoDetalle: View {
    @State var paso: Int
    @EnvironmentObject var store: Store
    @State private var soloQuedaron = false
    @State private var buscar = ""
    var body: some View {
        ScrollView {
            if let d = store.datos {
                let pasos = embudo(d)
                let t = d.tiendas ?? []
                let titulo: String = paso < 10 ? pasos[paso].n : paso == 10 ? "Frías" : paso == 11 ? "Con lista pedida" : "Sin escribir todavía"
                let l = lista(pasos, t)
                let vis = l.filter { buscar.isEmpty || $0.tienda.localizedCaseInsensitiveContains(buscar) }.sorted { $0.ultimo_mensaje > $1.ultimo_mensaje }
                VStack(alignment: .leading, spacing: 12) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(pasos) { p in boton(p.n, p.i, p.tiendas.count) }
                            boton("Frías", 10, t.filter { $0.fria == true }.count)
                            boton("Lista pedida", 11, t.filter { $0.lista == true }.count)
                            boton("Sin escribir", 12, t.filter { $0.enviados == 0 }.count)
                        }
                    }
                    if paso < 3 {
                        Toggle(isOn: $soloQuedaron) { Text("Solo las que se quedaron en \"\(titulo)\"").font(.subheadline) }.tint(Tema.bronce)
                    }
                    HStack { Image(systemName: "magnifyingglass").foregroundStyle(Tema.gris); TextField("Buscar tienda", text: $buscar).textInputAutocapitalization(.never) }
                        .padding(10).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 12))
                    Text("\(vis.count) tiendas").font(.caption).foregroundStyle(Tema.gris)
                    ForEach(vis) { x in
                        NavigationLink { TiendaDetalle(nombre: x.tienda) } label: { fila(x) }.buttonStyle(.plain)
                    }
                }.padding(16)
                .navigationTitle(titulo)
            }
        }
        .background(Tema.fondo).navigationBarTitleDisplayMode(.inline)
    }
    func lista(_ pasos: [PasoEmbudo], _ t: [TiendaInfo]) -> [TiendaInfo] {
        var l: [TiendaInfo] = paso < 10 ? pasos[paso].tiendas : paso == 10 ? t.filter { $0.fria == true } : paso == 11 ? t.filter { $0.lista == true } : t.filter { $0.enviados == 0 }
        if soloQuedaron, paso < 3 { let sig = Set(pasos[paso + 1].tiendas.map(\.id)); l = l.filter { !sig.contains($0.id) } }
        return l
    }
    func boton(_ t: String, _ i: Int, _ n: Int) -> some View {
        Button { withAnimation { paso = i; soloQuedaron = false } } label: {
            Text("\(t) · \(n)").font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6)
                .background(paso == i ? Tema.bronce : Tema.tarjeta, in: Capsule()).foregroundStyle(paso == i ? Tema.sobreAcento : Tema.texto)
                .overlay(Capsule().stroke(Tema.linea))
        }
    }
    func fila(_ x: TiendaInfo) -> some View {
        Tarjeta {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(x.tienda).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text(x.estado + (x.grupo.isEmpty ? "" : " · grupo \(x.grupo.prefix(1))")).font(.caption).foregroundStyle(Tema.gris).lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Tema.gris)
            }
            HStack(spacing: 12) {
                Label("\(x.enviados)", systemImage: "arrow.up.right").help("enviados")
                Label("\(x.recibidos)", systemImage: "arrow.down.left")
                Label("\(x.precios.count) precios", systemImage: "tag")
                if x.fria == true { Label("fría", systemImage: "snowflake") }
                if x.lista == true { Label("lista", systemImage: "list.bullet") }
                Spacer()
                if !x.ultimo_mensaje.isEmpty { Text(F.dia(x.ultimo_mensaje)) }
            }.font(.caption2).foregroundStyle(Tema.gris)
        }
    }
}

// =====================================================================
// 8 · Cuánto tarda el envío (uno por paquete)
// =====================================================================
struct Tramo: Identifiable { var i: Int; var n: String; var desde: String; var hasta: String; var dias: Int; var enCurso: Bool; var id: Int { i } }
func nombreTramo(_ e: Evento) -> String {
    let t = (e.lugar + " " + e.evento).lowercased()
    if t.contains("santa cruz") && !t.contains("hacia santa cruz") { return "Santa Cruz → Cochabamba" }
    if t.contains("sale hacia bolivia") || t.contains("hacia santa cruz") || t.contains("salió") { return "Miami → Santa Cruz" }
    if t.contains("entregado") || t.contains("bodega") || t.contains("recibido") { return "En bodega del courier" }
    if t.contains("en camino") || t.contains("enviado") || t.contains("ups") || t.contains("usps") || t.contains("fedex") { return "eBay → courier" }
    if t.contains("cochabamba") { return "En Cochabamba" }
    return String(e.evento.prefix(26))
}
func tramos(_ p: Pedido) -> [Tramo] {
    let ev = p.eventos.sorted { $0.fecha + $0.hora < $1.fecha + $1.hora }
    var out: [Tramo] = []
    if let f = ev.first, G.dias(p.fecha_compra, f.fecha) > 0 { out.append(Tramo(i: 0, n: "Compra → despacho", desde: p.fecha_compra, hasta: f.fecha, dias: G.dias(p.fecha_compra, f.fecha), enCurso: false)) }
    for (k, e) in ev.enumerated() {
        let fin = k + 1 < ev.count ? ev[k + 1].fecha : (p.entregado || p.etapa >= 5 ? e.fecha : G.hoy)
        let dd = G.dias(e.fecha, fin)
        if dd > 0 || k == ev.count - 1 && !(p.etapa >= 5) {
            let n = nombreTramo(e)
            if let j = out.lastIndex(where: { $0.n == n }), j == out.count - 1 { out[j].dias += dd; out[j].hasta = fin }
            else { out.append(Tramo(i: out.count, n: n, desde: e.fecha, hasta: fin, dias: dd, enCurso: k == ev.count - 1 && p.etapa < 5)) }
        }
    }
    return out
}

let coloresTramo: [Color] = [Tema.gris, Tema.bronce, Tema.ambar, Tema.bronce.opacity(0.65), Tema.verde, Tema.rojo]

struct TarjetaEnvio: View {
    var d: Datos; var pedido: Pedido
    var body: some View {
        let t = tramos(pedido)
        let total = t.reduce(0) { $0 + $1.dias }
        let llegó = pedido.etapa >= 5
        Tarjeta(titulo: "Cuánto \(llegó ? "tardó" : "va tardando") · \(d.reales.filter { $0.producto == pedido.producto && $0.fecha_compra == pedido.fecha_compra }.reduce(0) { $0 + $1.cantidad }) × \(pedido.producto)", icono: "clock.arrow.circlepath") {
            HStack(alignment: .firstTextBaseline) {
                Text("\(total) días").font(.system(size: 26, weight: .semibold, design: .rounded))
                Text(llegó ? "de la compra a Cochabamba" : "desde la compra, y sigue").font(.caption).foregroundStyle(Tema.gris)
            }
            if total > 0 {
                Chart(t) { x in
                    BarMark(x: .value("días", x.dias), y: .value("p", "envío")).foregroundStyle(coloresTramo[x.i % coloresTramo.count].opacity(x.enCurso ? 0.55 : 1))
                        .annotation(position: .overlay) { if x.dias >= max(total / 12, 1) { Text("\(x.dias)d").font(.caption2.weight(.bold)).foregroundStyle(.white) } }
                }
                .chartYAxis(.hidden).chartXAxis(.hidden).frame(height: 34).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            VStack(alignment: .leading, spacing: 4) {
                ForEach(t) { x in
                    HStack {
                        RoundedRectangle(cornerRadius: 2).fill(coloresTramo[x.i % coloresTramo.count]).frame(width: 12, height: 8)
                        Text(x.n).font(.caption)
                        if x.enCurso { Chip(texto: "ahora", color: Tema.ambar) }
                        Spacer()
                        Text("\(x.dias) día\(x.dias == 1 ? "" : "s")").font(.caption.weight(.semibold).monospacedDigit())
                    }
                }
            }
            if let lento = t.max(by: { $0.dias < $1.dias }), t.count > 1 {
                PieGrafico(texto: "Lo más lento: \(lento.n) (\(lento.dias) días)")
            }
        }
    }
}

struct EnvioDetalle: View {
    var pedido: Pedido
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            if let d = store.datos {
                VStack(alignment: .leading, spacing: 14) {
                    TarjetaEnvio(d: d, pedido: pedido)
                    Tarjeta(titulo: "Cada movimiento", icono: "list.bullet.indent") {
                        let ev = pedido.eventos.sorted { $0.fecha + $0.hora < $1.fecha + $1.hora }
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(Tema.gris).frame(width: 10).padding(.top, 4)
                            VStack(alignment: .leading, spacing: 2) { Text("Compra en \(pedido.tienda ?? "eBay")").font(.subheadline.weight(.semibold)); Text(F.dia(pedido.fecha_compra)).font(.caption).foregroundStyle(Tema.gris) }
                        }
                        ForEach(Array(ev.enumerated()), id: \.offset) { k, e in
                            HStack(alignment: .top, spacing: 10) {
                                Circle().fill(k == ev.count - 1 ? Tema.bronce : Tema.gris).frame(width: 10).padding(.top, 4)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(e.lugar).font(.subheadline.weight(.semibold))
                                    Text(e.evento).font(.caption)
                                    Text("\(F.dia(e.fecha)) \(e.hora) · \(G.dias(k == 0 ? pedido.fecha_compra : ev[k - 1].fecha, e.fecha)) días después").font(.caption2).foregroundStyle(Tema.gris)
                                }
                            }
                        }
                    }
                    let otros = d.paquetes.filter { $0.id != pedido.id && $0.etapa >= 5 }
                    if !otros.isEmpty {
                        Tarjeta(titulo: "Otros envíos", icono: "chart.bar") {
                            Chart(otros + [pedido]) { p in
                                BarMark(x: .value("días", tramos(p).reduce(0) { $0 + $1.dias }), y: .value("pedido", "\(G.corto(p.producto)) \(F.dia(p.fecha_compra))")).foregroundStyle(p.id == pedido.id ? Tema.bronce : Tema.gris)
                            }.frame(height: CGFloat(otros.count + 1) * 34 + 20)
                        }
                    }
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationTitle("El envío").navigationBarTitleDisplayMode(.inline)
    }
}

// =====================================================================
// 9 · En qué se va la plata de una unidad (uno por producto)
// =====================================================================
struct Pieza: Identifiable { var n: String; var v: Double; var c: Color; var id: String { n } }
func piezas(_ d: Datos, _ p: String) -> (Double, String, [Pieza])? {
    guard let costo = d.costoUnit(p) ?? d.analisisNuevo(p)?.costo_bs else { return nil }
    let vend = d.ventasDe(p).filter { $0.estado == "vendida" && $0.precio_bs != nil }
    let u = vend.reduce(0.0) { $0 + $1.cantidad }
    let (precio, de): (Double, String) = u > 0 ? (vend.reduce(0.0) { $0 + ($1.precio_bs ?? 0) * $1.cantidad } / u, "promedio vendido")
        : (d.precioNuestro(p).map { ($0.0, $0.1) } ?? (costo, "—"))
    let com = u > 0 ? vend.reduce(0.0) { $0 + ($1.comision_bs ?? 0) } / u : 0
    let real = d.costoUnit(p) != nil
    var l = [Pieza(n: real ? "Compra puesta en Cbba (eBay + courier, real)" : "Costo puesto (estimado)", v: costo, c: Tema.bronce)]
    if com > 0 { l.append(Pieza(n: "Comisión", v: com, c: Tema.ambar)) }
    l.append(Pieza(n: precio - costo - com >= 0 ? "Ganancia" : "Pérdida", v: abs(precio - costo - com), c: precio - costo - com >= 0 ? Tema.verde : Tema.rojo))
    return (precio, de, l)
}

struct TarjetaCosto: View {
    var d: Datos; var producto: String
    var body: some View {
        if let (precio, de, l) = piezas(d, producto) {
            Tarjeta(titulo: "De \(F.bs(precio)) por unidad · \(producto)", icono: "chart.pie") {
                Text("Precio: \(de)").font(.caption).foregroundStyle(Tema.gris)
                Chart(l) { x in BarMark(x: .value("Bs", x.v), y: .value("u", "una")).foregroundStyle(x.c) }
                    .chartYAxis(.hidden).chartXAxis(.hidden).frame(height: 28).clipShape(RoundedRectangle(cornerRadius: 8))
                ForEach(l) { x in
                    HStack {
                        Circle().fill(x.c).frame(width: 9, height: 9); Text(x.n).font(.subheadline).lineLimit(2)
                        Spacer()
                        Text(F.bs(x.v)).font(.subheadline.weight(.semibold).monospacedDigit())
                        Text(F.pct(x.v / max(precio, 1) * 100)).font(.caption).foregroundStyle(Tema.gris).frame(width: 46, alignment: .trailing)
                    }
                }
                if let a = d.analisisNuevo(producto), let e = a.ebay_usd, let tc = a.tc {
                    Divider().overlay(Tema.linea)
                    Text("Si lo trajeras hoy (estimado del Analista)").font(.caption.weight(.semibold))
                    let ebay = e * tc, cour = (a.courier_usd ?? 0) * tc, otros = max((a.costo_bs ?? 0) - ebay - cour, 0)
                    let hoy = [Pieza(n: "eBay", v: ebay, c: Tema.bronce), Pieza(n: "Courier", v: cour, c: Tema.ambar), Pieza(n: "Tax y otros", v: otros, c: Tema.gris)]
                    Chart(hoy.filter { $0.v > 0 }) { x in BarMark(x: .value("Bs", x.v), y: .value("u", "hoy")).foregroundStyle(x.c) }
                        .chartYAxis(.hidden).chartXAxis(.hidden).frame(height: 18).clipShape(RoundedRectangle(cornerRadius: 6))
                    Text("eBay \(F.bs(ebay)) · courier \(F.bs(cour))\(otros > 0 ? " · otros \(F.bs(otros))" : "") = \(F.bs(a.costo_bs)) · dólar \(F.num(tc))").font(.caption2).foregroundStyle(Tema.gris)
                }
            }
        }
    }
}
