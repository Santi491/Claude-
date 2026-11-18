import SwiftUI
import Charts

struct HoyView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        Pantalla(titulo: "Cargo Brothers") {
            if let d = store.datos {
                encabezado(d)
                if let p = principal(d) { NavigationLink(value: p) { tarjetaPedido(p) }.buttonStyle(.plain) }
                HStack(spacing: 12) { tarjetaDolar(d); tarjetaPlata(d) }
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
                    Circle().fill(color(s.estado)).frame(width: 9, height: 9)
                    Text(s.nombre).font(.subheadline)
                    Spacer()
                    Text(s.estado).font(.caption).foregroundStyle(Tema.gris)
                }
            }
        }
    }

    func color(_ e: String) -> Color {
        switch e { case "ok", "cubierta": return Tema.verde; case "pendiente", "en curso", "no toca": return Tema.gris; default: return Tema.rojo }
    }
}
