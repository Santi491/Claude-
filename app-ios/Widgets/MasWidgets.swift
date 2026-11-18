import WidgetKit
import SwiftUI
import Charts

// Widgets de la pantalla de inicio (Santi, 18/11): cazador, dólar, decisiones y el Gerente. Al tocarlos abren la app.

private struct Cabecera: View {
    var icono: String; var titulo: String
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icono).font(.caption2.weight(.bold))
            Text(titulo.uppercased()).font(.system(size: 10, weight: .bold)).tracking(1.1)
        }.foregroundStyle(Tema.bronce)
    }
}

private struct SinDatos: View {
    var body: some View { Text("Abre la app para cargar los datos").font(.caption).foregroundStyle(Tema.gris) }
}

// ---------- Cazador de ofertas ----------
struct CazadorWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Cazador", provider: Proveedor()) { e in
            CazadorVista(e: e).containerBackground(Tema.fondo, for: .widget)
        }
        .configurationDisplayName("Cazador de ofertas")
        .description("Lo que hoy está en eBay bajo nuestro tope.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct CazadorVista: View {
    var e: Entrada
    @Environment(\.widgetFamily) var fam
    var body: some View {
        if let d = e.datos {
            let bajo = d.cazador.topes.filter(\.bajo_tope).sorted { ($0.tope_usd ?? 0) - ($0.hoy_usd ?? 0) > ($1.tope_usd ?? 0) - ($1.hoy_usd ?? 0) }
            VStack(alignment: .leading, spacing: 6) {
                Cabecera(icono: "scope", titulo: "Cazador")
                if fam == .systemSmall {
                    Text("\(bajo.count)").font(.system(size: 40, weight: .semibold, design: .rounded)).foregroundStyle(Tema.texto)
                    Text("bajo el tope hoy").font(.caption).foregroundStyle(Tema.gris)
                    Spacer(minLength: 0)
                    if let b = bajo.first { Text("\(corto(b.producto)) · \(F.usd(b.hoy_usd))").font(.caption2.weight(.semibold)).foregroundStyle(Tema.verde).lineLimit(1) }
                } else {
                    Text(bajo.isEmpty ? "Hoy nada bajo el tope" : "\(bajo.count) productos bajo el tope").font(.subheadline.weight(.semibold)).foregroundStyle(Tema.texto)
                    ForEach(bajo.prefix(fam == .systemLarge ? 9 : 3)) { t in
                        HStack {
                            Text(corto(t.producto)).font(.caption).foregroundStyle(Tema.texto).lineLimit(1)
                            Spacer()
                            Text(F.usd(t.hoy_usd)).font(.caption.monospacedDigit().weight(.semibold)).foregroundStyle(Tema.verde)
                            Text("/ \(F.usd(t.tope_usd))").font(.caption2.monospacedDigit()).foregroundStyle(Tema.gris)
                        }
                    }
                    Spacer(minLength: 0)
                    Text("Tope = deja \(Int(d.cazador.meta ?? 15)) % frente a Cochabamba · \(F.dia(d.generado))").font(.caption2).foregroundStyle(Tema.gris)
                }
            }
        } else { SinDatos() }
    }
    func corto(_ p: String) -> String { p.replacingOccurrences(of: "Intel Core ", with: "").replacingOccurrences(of: "Corsair Vengeance RGB ", with: "") }
}

// ---------- Dólar ----------
struct DolarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Dolar", provider: Proveedor()) { e in
            DolarVista(e: e).containerBackground(Tema.fondo, for: .widget)
        }
        .configurationDisplayName("Dólar USDT")
        .description("El dólar de los cálculos y cómo vino en el mes.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct DolarVista: View {
    var e: Entrada
    @Environment(\.widgetFamily) var fam
    var body: some View {
        if let d = e.datos {
            let s = Array(d.dolar.serie.suffix(30))
            let v = s.compactMap(\.valor)
            let cambio = (v.first != nil && v.last != nil) ? (v.last! - v.first!) / v.first! * 100 : 0
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Cabecera(icono: "dollarsign.circle", titulo: "USDT")
                    Text(F.num(d.dolar.usado)).font(.system(size: 34, weight: .semibold, design: .rounded)).foregroundStyle(Tema.texto)
                    Text((cambio >= 0 ? "+" : "") + F.pct(cambio) + " en el mes").font(.caption2.weight(.semibold)).foregroundStyle(cambio > 0 ? Tema.rojo : Tema.verde)
                    Spacer(minLength: 0)
                    Text("oficial \(F.num(d.dolar.oficial))").font(.caption2).foregroundStyle(Tema.gris)
                }
                if fam == .systemMedium || fam == .systemSmall {
                    Chart(s) { p in
                        if let x = p.valor { LineMark(x: .value("d", p.fecha), y: .value("v", x)).foregroundStyle(Tema.bronce).interpolationMethod(.catmullRom) }
                    }
                    .chartXAxis(.hidden).chartYAxis(.hidden)
                    .chartYScale(domain: (v.min() ?? 0) - 0.02 ... (v.max() ?? 1) + 0.02)
                    .frame(maxWidth: fam == .systemSmall ? 0 : .infinity)
                    .opacity(fam == .systemSmall ? 0 : 1)
                }
            }
        } else { SinDatos() }
    }
}

// ---------- Decisiones y lo que recomienda el Gerente ----------
struct GerenteWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Gerente", provider: Proveedor()) { e in
            GerenteVista(e: e).containerBackground(Tema.fondo, for: .widget)
        }
        .configurationDisplayName("El Gerente")
        .description("Lo que te recomienda y lo que espera tu decisión.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct GerenteVista: View {
    var e: Entrada
    @Environment(\.widgetFamily) var fam
    var body: some View {
        if let d = e.datos {
            let n = d.decidir.count
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    if let img = UIImage(named: "foto-gerente") {
                        Image(uiImage: img).resizable().scaledToFill().frame(width: 30, height: 30).clipShape(Circle())
                            .overlay(Circle().stroke(Tema.bronce.opacity(0.6), lineWidth: 1))
                    }
                    Cabecera(icono: "lightbulb", titulo: "El Gerente")
                }
                if fam == .systemSmall {
                    Text("\(n)").font(.system(size: 38, weight: .semibold, design: .rounded)).foregroundStyle(n > 0 ? Tema.ambar : Tema.texto)
                    Text(n == 1 ? "cosa por decidir" : "cosas por decidir").font(.caption).foregroundStyle(Tema.gris)
                } else {
                    ForEach(Array((d.recomendaciones ?? []).prefix(fam == .systemLarge ? 3 : 2).enumerated()), id: \.offset) { i, r in
                        HStack(alignment: .top, spacing: 6) {
                            Text("\(i + 1)").font(.caption2.weight(.bold)).frame(width: 16, height: 16).background(Tema.bronce.opacity(0.25), in: Circle()).foregroundStyle(Tema.bronce)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(r.texto).font(.caption.weight(.semibold)).foregroundStyle(Tema.texto).lineLimit(2)
                                if fam == .systemLarge { Text(r.por_que).font(.caption2).foregroundStyle(Tema.gris).lineLimit(2) }
                            }
                        }
                    }
                    Spacer(minLength: 0)
                    Text(n == 0 ? "Nada espera tu decisión" : "\(n) por decidir en la app").font(.caption2.weight(.semibold)).foregroundStyle(n > 0 ? Tema.ambar : Tema.gris)
                }
            }
        } else { SinDatos() }
    }
}
