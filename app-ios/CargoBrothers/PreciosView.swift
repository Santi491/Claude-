import SwiftUI
import Charts

/// Historial de precio: hoy contra ayer, 7, 15 o 30 días (Santi 18/11). eBay (nuevo y usado) contra lo más barato de Cochabamba.
struct GraficoPrecio: View {
    var h: [Hist]
    var tc: Double
    @State private var verBs = true
    @State private var dias = 30
    @State private var detalle = false

    static let fmt: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "America/La_Paz"); return f }()
    func fecha(_ s: String) -> Date { GraficoPrecio.fmt.date(from: s) ?? .distantPast }
    var tramo: [Hist] {
        let desde = Date().addingTimeInterval(-Double(dias) * 86400)
        return h.filter { fecha($0.fecha) >= desde }
    }
    func local(_ x: Hist) -> Double? { [x.mkt, x.tienda].compactMap { $0 }.min() }
    func bs(_ v: Double?) -> Double? { v.map { verBs ? $0 * tc : $0 } }

    var body: some View {
        Tarjeta(titulo: "Historial de precio", icono: "chart.xyaxis.line") {
            Picker("", selection: $dias) { Text("1 día").tag(1); Text("7 días").tag(7); Text("15 días").tag(15); Text("30 días").tag(30) }.pickerStyle(.segmented)
            if dias == 1 { hoyContraAyer } else {
                Picker("", selection: $verBs) { Text("Todo en Bs").tag(true); Text("eBay en USD").tag(false) }.pickerStyle(.segmented)
                if tramo.count < 2 { Text("Pocos datos en este rango.").font(.footnote).foregroundStyle(Tema.gris) }
                else {
                    Chart {
                        ForEach(tramo) { x in
                            let d = fecha(x.fecha)
                            if let v = bs(x.nuevo) { LineMark(x: .value("día", d), y: .value("p", v), series: .value("", "eBay nuevo")).foregroundStyle(Tema.bronce)
                                PointMark(x: .value("día", d), y: .value("p", v)).foregroundStyle(Tema.bronce).symbolSize(14) }
                            if let v = bs(x.usado) { LineMark(x: .value("día", d), y: .value("p", v), series: .value("", "eBay usado")).foregroundStyle(Tema.bronce.opacity(0.45)).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3])) }
                            if verBs, let v = local(x) { LineMark(x: .value("día", d), y: .value("p", v), series: .value("", "Cochabamba")).foregroundStyle(Tema.verde) }
                        }
                    }
                    .chartYScale(domain: .automatic(includesZero: false))
                    .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.day().month(.defaultDigits)) } }
                    .frame(height: 200)
                    HStack(spacing: 12) {
                        Label("eBay nuevo", systemImage: "circle.fill").foregroundStyle(Tema.bronce)
                        Label("usado", systemImage: "circle.fill").foregroundStyle(Tema.bronce.opacity(0.45))
                        if verBs { Label("Cochabamba", systemImage: "circle.fill").foregroundStyle(Tema.verde) }
                    }.font(.caption2)
                    resumen
                }
                DisclosureGroup(isExpanded: $detalle) {
                    VStack(spacing: 6) {
                        HStack { Text("Día").frame(width: 50, alignment: .leading); Spacer(); Text("eBay nuevo").frame(width: 82, alignment: .trailing); Text("usado").frame(width: 70, alignment: .trailing); Text("Cbba").frame(width: 66, alignment: .trailing) }
                            .font(.caption2.weight(.bold)).foregroundStyle(Tema.bronce)
                        ForEach(Array(tramo.reversed().enumerated()), id: \.offset) { i, x in
                            let ant = i + 1 < tramo.count ? tramo.reversed()[i + 1] : nil
                            HStack {
                                Text(F.dia(x.fecha)).frame(width: 50, alignment: .leading)
                                Spacer()
                                celda(x.nuevo, ant?.nuevo, usd: true).frame(width: 82, alignment: .trailing)
                                celda(x.usado, ant?.usado, usd: true).frame(width: 70, alignment: .trailing)
                                celda(local(x), ant.flatMap(local), usd: false).frame(width: 66, alignment: .trailing)
                            }.font(.caption.monospacedDigit())
                        }
                    }.padding(.top, 6)
                } label: { Text("Ver día por día").font(.subheadline.weight(.semibold)) }
            }
        }
    }

    /// el número del día y una flecha si cambió respecto del día anterior (rojo = subió, verde = bajó)
    @ViewBuilder func celda(_ v: Double?, _ a: Double?, usd: Bool) -> some View {
        HStack(spacing: 2) {
            if let v, let a, abs(v - a) > 0.009 { Image(systemName: v > a ? "arrow.up" : "arrow.down").font(.system(size: 8, weight: .bold)).foregroundStyle(v > a ? Tema.rojo : Tema.verde) }
            Text(v.map { usd ? F.num($0, 0) : F.num($0, 0) } ?? "—")
        }
    }

    var resumen: some View {
        let n = tramo.compactMap(\.nuevo)
        return HStack {
            if let a = n.first, let b = n.last {
                dato(F.usd(n.min()), "más barato")
                dato(F.usd(n.max()), "más caro")
                dato((b >= a ? "+" : "") + F.pct((b - a) / a * 100), "cambio eBay nuevo", b > a ? Tema.rojo : Tema.verde)
            }
        }
    }

    var hoyContraAyer: some View {
        let u = h.last, a = h.count > 1 ? h[h.count - 2] : nil
        return VStack(alignment: .leading, spacing: 8) {
            if let u {
                Text("\(F.dia(u.fecha)) contra \(a.map { F.dia($0.fecha) } ?? "—")").font(.caption).foregroundStyle(Tema.gris)
                fila("eBay nuevo", F.usd(u.nuevo), u.nuevo, a?.nuevo, true)
                fila("eBay usado", F.usd(u.usado), u.usado, a?.usado, true)
                fila("Cochabamba (lo más barato)", F.bs(local(u)), local(u), a.flatMap(local), false)
            } else { Text("Sin datos.").foregroundStyle(Tema.gris) }
        }
    }

    func fila(_ t: String, _ v: String, _ x: Double?, _ y: Double?, _ usd: Bool) -> some View {
        HStack {
            Text(t).font(.subheadline)
            Spacer()
            Text(v).font(.subheadline.monospacedDigit().weight(.semibold))
            if let x, let y, y != 0 {
                let c = (x - y) / y * 100
                Text(abs(c) < 0.05 ? "igual" : (c > 0 ? "+" : "") + F.pct(c)).font(.caption.monospacedDigit())
                    .foregroundStyle(abs(c) < 0.05 ? Tema.gris : c > 0 ? Tema.rojo : Tema.verde).frame(width: 64, alignment: .trailing)
            } else { Text("—").font(.caption).foregroundStyle(Tema.gris).frame(width: 64, alignment: .trailing) }
        }
    }

    func dato(_ v: String, _ t: String, _ c: Color = Tema.texto) -> some View {
        VStack(alignment: .leading, spacing: 1) { Text(v).font(.subheadline.weight(.semibold).monospacedDigit()).foregroundStyle(c); Text(t).font(.caption2).foregroundStyle(Tema.gris) }
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PreciosView: View {
    @EnvironmentObject var store: Store
    @State private var filtro = "traer"
    var body: some View {
        Pantalla(titulo: "Precios") {
            if let d = store.datos {
                Picker("Filtro", selection: $filtro) {
                    Text("Traer").tag("traer"); Text("Esperar").tag("esperar"); Text("Todos").tag("todos"); Text("Cazador").tag("cazador")
                }
                .pickerStyle(.segmented)
                if filtro == "cazador" {
                    ForEach(d.cazador.topes.filter { $0.tope_usd != nil }) { t in filaTope(t) }
                    Text("Sin tope: \(d.cazador.topes.filter { $0.tope_usd == nil }.map(\.producto).joined(separator: ", ")) (falta precio de Cochabamba).")
                        .font(.caption).foregroundStyle(Tema.gris)
                } else {
                    let lista = d.productos.filter { filtro == "todos" || $0.recomendacion == filtro }
                    if lista.isEmpty { Text("Nada en esta lista hoy.").foregroundStyle(Tema.gris) }
                    ForEach(lista) { p in NavigationLink(value: p) { fila(p) }.buttonStyle(.plain) }
                }
            }
        }
    }

    func fila(_ p: Producto) -> some View {
        Tarjeta {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(p.producto).font(.headline).lineLimit(2)
                    Text(p.condicion).font(.caption).foregroundStyle(Tema.gris)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(F.pct(p.margen)).font(.title3.monospacedDigit().weight(.semibold)).foregroundStyle(Tema.color(recomendacion: p.recomendacion))
                    Text("peor \(F.pct(p.peor))").font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
                }
            }
            HStack {
                Text("eBay \(F.usd(p.ebay_usd))"); Spacer(); Text("puesto \(F.bs(p.costo_bs))"); Spacer(); Text("acá \(F.bs(p.local_bs))")
            }
            .font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
        }
    }

    func filaTope(_ t: Tope) -> some View {
        Tarjeta {
            HStack {
                Text(t.producto).font(.subheadline.weight(.semibold)).lineLimit(1)
                Spacer()
                Chip(texto: t.bajo_tope ? "bajo el tope" : "arriba", color: t.bajo_tope ? Tema.verde : Tema.gris)
            }
            HStack {
                Text("hoy \(F.usd(t.hoy_usd))"); Spacer(); Text("tope \(F.usd(t.tope_usd))"); Spacer(); Text("Cbba \(F.bs(t.mediana_bs))")
            }
            .font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
            if t.bajo_tope, let u = URL(string: t.link) { Link("Ver en eBay", destination: u).font(.caption.weight(.semibold)) }
        }
    }
}

struct ProductoDetalle: View {
    var p: Producto
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Tarjeta {
                    Text(p.producto).font(.title2.weight(.semibold))
                    HStack { Chip(texto: p.recomendacion, color: Tema.color(recomendacion: p.recomendacion)); Chip(texto: p.condicion, color: Tema.gris) }
                    Text(p.por_que).font(.subheadline).foregroundStyle(Tema.gris)
                }
                Tarjeta(titulo: "Números", icono: "function") {
                    fila("eBay (con envío en EE.UU.)", F.usd(p.ebay_usd))
                    fila("Puesto en Cochabamba", F.bs(p.costo_bs))
                    fila("Mejor precio local", F.bs(p.local_bs))
                    fila("Precio sugerido de venta", F.bs(p.sugerido_bs))
                    Divider().overlay(Tema.linea)
                    fila("Margen", F.pct(p.margen), Tema.color(recomendacion: p.recomendacion))
                    fila("Peor caso", F.pct(p.peor))
                }
                if let h = store.datos?.historial?[p.producto], h.count > 1 { GraficoPrecio(h: h, tc: store.datos?.dolar.usado ?? 12) }
                if let u = URL(string: p.link), !p.link.isEmpty {
                    Link(destination: u) { Label("Ver el anuncio en eBay", systemImage: "arrow.up.right.square").frame(maxWidth: .infinity).padding(.vertical, 6) }
                        .buttonStyle(.bordered)
                }
                Text("Peor caso: dólar +3 %, courier +20 % y precio local −10 %. El margen es sobre el precio de venta.")
                    .font(.caption).foregroundStyle(Tema.gris)
            }
            .padding(16)
        }
        .background(Tema.fondo)
        .navigationBarTitleDisplayMode(.inline)
    }

    func fila(_ a: String, _ b: String, _ c: Color = Tema.texto) -> some View {
        HStack { Text(a).foregroundStyle(Tema.gris); Spacer(); Text(b).monospacedDigit().foregroundStyle(c) }.font(.subheadline)
    }
}
