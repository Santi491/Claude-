import WidgetKit
import SwiftUI
import ActivityKit

@main
struct CargoWidgets: WidgetBundle {
    var body: some Widget {
        ResumenWidget()
        PedidoLiveActivity()
    }
}

// ---------- Widget de la pantalla de inicio ----------
struct Entrada: TimelineEntry {
    var date: Date
    var datos: Datos?
}

struct Proveedor: TimelineProvider {
    func placeholder(in context: Context) -> Entrada { Entrada(date: .now, datos: nil) }
    func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
        Task { completion(Entrada(date: .now, datos: await Fuente.cargar().0)) }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
        Task {
            let d = await Fuente.cargar().0
            completion(Timeline(entries: [Entrada(date: .now, datos: d)], policy: .after(.now.addingTimeInterval(30 * 60))))
        }
    }
}

struct ResumenWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Resumen", provider: Proveedor()) { e in
            ResumenVista(e: e).containerBackground(Tema.fondo, for: .widget)
        }
        .configurationDisplayName("Cargo Brothers")
        .description("El pedido, el dólar y las ofertas del cazador.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

struct ResumenVista: View {
    var e: Entrada
    @Environment(\.widgetFamily) var familia
    var body: some View {
        switch familia {
        case .accessoryRectangular, .accessoryInline, .accessoryCircular: Bloqueada(e: e, familia: familia)
        default: principal
        }
    }

    @ViewBuilder var principal: some View {
        if let d = e.datos {
            let p = d.pedidos.filter { !$0.entregado && !$0.esPrueba }.max { $0.cantidad < $1.cantidad }
            let bajo = d.cazador.topes.filter(\.bajo_tope).count
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("PEDIDO").font(.system(size: 10, weight: .bold)).tracking(1.2).foregroundStyle(Tema.bronce)
                    if let p {
                        Text(p.producto).font(.subheadline.weight(.semibold)).foregroundStyle(Tema.texto).lineLimit(1)
                        Text(p.estado).font(.caption).foregroundStyle(Tema.gris).lineLimit(2)
                        Pasos(etapa: p.etapa, total: p.etapas.count, alto: 4)
                    } else {
                        Text("Sin pedidos en camino").font(.caption).foregroundStyle(Tema.gris)
                    }
                    Spacer(minLength: 0)
                    HStack {
                        Text("USDT").font(.caption2).foregroundStyle(Tema.gris)
                        Text(F.num(d.dolar.usado)).font(.caption.weight(.semibold).monospacedDigit()).foregroundStyle(Tema.texto)
                    }
                }
                if familia == .systemMedium {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("CAZADOR").font(.system(size: 10, weight: .bold)).tracking(1.2).foregroundStyle(Tema.bronce)
                        Text("\(bajo) bajo el tope").font(.subheadline.weight(.semibold)).foregroundStyle(Tema.texto)
                        ForEach(d.cazador.topes.filter(\.bajo_tope).prefix(3)) { t in
                            Text("\(t.producto.replacingOccurrences(of: "Intel Core ", with: "")) · \(F.usd(t.hoy_usd))")
                                .font(.caption2).foregroundStyle(Tema.gris).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        let n = d.decidir.count
                        Text(n == 0 ? "Nada por decidir" : "\(n) por decidir").font(.caption2.weight(.semibold))
                            .foregroundStyle(n == 0 ? Tema.gris : Tema.ambar)
                    }
                }
            }
        } else {
            Text("Cargo Brothers\nsin datos").font(.caption).foregroundStyle(Tema.gris)
        }
    }
}

// ---------- Widgets chicos de la pantalla bloqueada (al lado de la hora) ----------
struct Bloqueada: View {
    var e: Entrada
    var familia: WidgetFamily
    var body: some View {
        let d = e.datos
        let p = d?.pedidos.filter { !$0.entregado && !$0.esPrueba }.max { $0.cantidad < $1.cantidad }
        switch familia {
        case .accessoryInline:
            Text("USDT \(F.num(d?.dolar.usado)) · \(p.map { $0.estado } ?? "sin pedidos")")
        case .accessoryCircular:
            Gauge(value: Double((p?.etapa ?? 0) + 1), in: 0...Double(p?.etapas.count ?? 7)) {
                Image(systemName: "shippingbox.fill")
            } currentValueLabel: { Text("\((p?.etapa ?? 0) + 1)") }
            .gaugeStyle(.accessoryCircularCapacity)
        default:
            VStack(alignment: .leading, spacing: 2) {
                Text(p.map { "\($0.producto)" } ?? "Cargo Brothers").font(.headline).widgetAccentable()
                Text(p?.estado ?? "sin pedidos en camino").font(.caption)
                Text("USDT \(F.num(d?.dolar.usado)) · \(d?.cazador.topes.filter(\.bajo_tope).count ?? 0) ofertas").font(.caption2)
            }
        }
    }
}

// ---------- Pedido en la pantalla bloqueada y en la isla ----------
struct PedidoLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PedidoAttributes.self) { ctx in
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "shippingbox.fill").foregroundStyle(Tema.bronce)
                    Text("\(ctx.attributes.cantidad) × \(ctx.attributes.producto)").font(.headline).foregroundStyle(Tema.texto)
                    Spacer()
                    Text("Cargo Brothers").font(.caption2).foregroundStyle(Tema.gris)
                }
                Text(ctx.state.estado.prefix(1).uppercased() + ctx.state.estado.dropFirst())
                    .font(.title3.weight(.semibold)).foregroundStyle(Tema.bronce)
                Pasos(etapa: ctx.state.etapa, total: ctx.state.total, alto: 6)
                HStack {
                    Text("Miami").font(.caption2); Spacer(); Text("Santa Cruz").font(.caption2); Spacer(); Text("Cochabamba").font(.caption2)
                }.foregroundStyle(Tema.gris)
            }
            .padding(16)
            .activityBackgroundTint(Tema.fondo)
            .activitySystemActionForegroundColor(Tema.bronce)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(ctx.attributes.cantidad) × \(ctx.attributes.producto)", systemImage: "shippingbox.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(Tema.bronce)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(ctx.state.estado).font(.subheadline.weight(.semibold))
                        Pasos(etapa: ctx.state.etapa, total: ctx.state.total, alto: 5)
                    }
                }
            } compactLeading: {
                Image(systemName: "shippingbox.fill").foregroundStyle(Tema.bronce)
            } compactTrailing: {
                Text("\(ctx.state.etapa + 1)/\(ctx.state.total)").font(.caption2.monospacedDigit()).foregroundStyle(Tema.bronce)
            } minimal: {
                Image(systemName: "shippingbox.fill").foregroundStyle(Tema.bronce)
            }
        }
    }
}
