import SwiftUI

/// Lo que Santi abre caminando por la oficina 3D (19/11): su escritorio (resumen del día), el tablero de la entrada,
/// el mapa de envíos, el archivo de documentos y la computadora completa del Gerente.
enum Lugar3D: String, Identifiable {
    case resumen, tablero, mapa, archivo, gerente
    var id: String { rawValue }
}

struct HojaLugar3D: View {
    let lugar: Lugar3D
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var cerrar
    var body: some View {
        NavigationStack {
            Group {
                switch lugar {
                case .resumen: ResumenDia()
                case .tablero: TableroEquipo()
                case .mapa: ScrollView { MapaRuta(pedidos: (store.datos?.pedidos ?? []).filter { !$0.esPrueba }, alto: 460).padding(16) }
                case .archivo: ArchivoView()
                case .gerente: PCGerente()
                }
            }
            .background(Tema.fondo)
            .navigationTitle(titulo).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { cerrar() } label: { Image(systemName: "xmark.circle.fill").font(.title3) } } }
        }
    }
    var titulo: String {
        switch lugar { case .resumen: return "Tu escritorio"; case .tablero: return "Tablero del equipo"; case .mapa: return "Mapa de envíos"
        case .archivo: return "Archivo"; case .gerente: return "Computadora del Gerente" }
    }
}

// ---------- tu escritorio: el resumen del día ----------
struct ResumenDia: View {
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let d = store.datos {
                    HStack(spacing: 12) {
                        dato("Dólar USDT", d.dolar.usado.map { String(format: "Bs %.2f", $0) } ?? "–")
                        dato("Por decidir", "\(d.decidir.filter { store.enviadas[$0.id] == nil }.count)")
                        dato("Etapa", "\(d.etapa.numero ?? 1)")
                    }
                    if let p = d.pedidos.filter({ !$0.esPrueba && !$0.entregado }).max(by: { $0.cantidad < $1.cantidad }) {
                        Tarjeta(titulo: "Nuestro pedido", icono: "shippingbox") {
                            Text("\(p.cantidad) × \(p.producto)").font(.headline)
                            Text(p.estado.prefix(1).uppercased() + p.estado.dropFirst()).foregroundStyle(Tema.bronce)
                            Pasos(etapa: p.etapa, total: p.etapas.count, alto: 6)
                        }
                    }
                    Tarjeta(titulo: "La plata", icono: "banknote") {
                        fila("Invertido", d.finanzas.invertido_bs.map(F.bs) ?? "–")
                        fila("Vendidas", "\(d.finanzas.unidades_vendidas ?? 0) de \(d.finanzas.unidades_compradas ?? 0)")
                        fila("Ganancia", d.finanzas.ganancia_bs.map(F.bs) ?? "–")
                    }
                    if let r = d.recomendaciones, !r.isEmpty {
                        Tarjeta(titulo: "El Gerente te recomienda", icono: "sparkles") {
                            ForEach(Array(r.enumerated()), id: \.offset) { k, x in
                                HStack(alignment: .top, spacing: 10) {
                                    Text("\(k + 1)").font(.caption.weight(.bold)).frame(width: 22, height: 22).background(Tema.bronce.opacity(0.18), in: Circle()).foregroundStyle(Tema.bronce)
                                    VStack(alignment: .leading, spacing: 2) { Text(x.texto).font(.subheadline.weight(.semibold)); Text(x.por_que).font(.caption).foregroundStyle(Tema.gris) }
                                }
                            }
                        }
                    }
                } else { Esqueleto() }
            }
            .padding(16)
        }
    }
    func dato(_ t: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(v).font(.title3.weight(.semibold).monospacedDigit()); Text(t).font(.caption).foregroundStyle(Tema.gris) }
            .frame(maxWidth: .infinity, alignment: .leading).padding(14).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 16))
    }
    func fila(_ a: String, _ b: String) -> some View { HStack { Text(a).foregroundStyle(Tema.gris); Spacer(); Text(b).monospacedDigit() }.font(.subheadline) }
}

// ---------- el tablero de la entrada: objetivos de la semana y lo que espera decisión ----------
struct TableroEquipo: View {
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let d = store.datos {
                    Tarjeta(titulo: "Objetivos de la semana", icono: "target") {
                        if d.objetivos.isEmpty { Text("Sin objetivos en esta etapa.").foregroundStyle(Tema.gris) }
                        ForEach(d.objetivos) { BarraObjetivo(o: $0) }
                    }
                    Tarjeta(titulo: "Esperan tu decisión", icono: "checkmark.seal") {
                        let p = d.decidir.filter { store.enviadas[$0.id] == nil }
                        if p.isEmpty { Text("Nada pendiente.").foregroundStyle(Tema.gris) }
                        ForEach(p.prefix(8)) { x in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(x.titulo).font(.subheadline.weight(.semibold))
                                Text("\(Equipo.nombre(x.agente))\(x.plazo.isEmpty ? "" : " · vence \(F.dia(x.plazo))")").font(.caption).foregroundStyle(Tema.gris)
                            }
                        }
                    }
                } else { Esqueleto() }
            }
            .padding(16)
        }
    }
}

// ---------- la computadora del Gerente: escritorio con sus ventanas ----------
struct PCGerente: View {
    @EnvironmentObject var store: Store
    @State private var app = "equipo"
    let apps: [(String, String, String)] = [("equipo", "Equipo", "person.3.fill"), ("decidir", "Por decidir", "checkmark.seal.fill"),
                                            ("objetivos", "Objetivos", "target"), ("libreta", "Libreta", "book.closed.fill"), ("chat", "Chat", "bubble.left.and.bubble.right.fill")]
    var body: some View {
        VStack(spacing: 0) {
            // barra de arriba, como un escritorio
            HStack(spacing: 8) {
                Image("Logo").resizable().renderingMode(.template).scaledToFit().frame(width: 18, height: 18).foregroundStyle(Tema.bronce)
                Text("Gerente · Cargo Brothers").font(.caption.weight(.semibold))
                Spacer()
                Text(F.bo("EEE d MMM · HH:mm")).font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
            }
            .padding(.horizontal, 14).padding(.vertical, 8).background(Color.black.opacity(0.35))
            // dock de aplicaciones
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(apps, id: \.0) { a in
                        Button { withAnimation(.snappy) { app = a.0 } } label: {
                            Label(a.1, systemImage: a.2).font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 8)
                                .background(app == a.0 ? Tema.bronce : Tema.tarjeta, in: Capsule())
                                .foregroundStyle(app == a.0 ? Tema.sobreAcento : Tema.texto)
                        }
                    }
                }.padding(.horizontal, 14).padding(.vertical, 10)
            }
            AppGerente(app: app)
        }
    }
}

/// el contenido de cada app del Gerente (lo usan la computadora simple y el escritorio)
struct AppGerente: View {
    let app: String
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
                VStack(spacing: 12) {
                    if let d = store.datos {
                        switch app {
                        case "equipo":
                            ForEach(d.equipo) { a in
                                let e = EstadoAgente.de(a.agente, store)
                                HStack(spacing: 12) {
                                    Avatar(agente: a.agente, tam: 40)
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack { Text(a.nombre).font(.subheadline.weight(.semibold)); Circle().fill(e.color).frame(width: 7, height: 7); Text(e.nombreEstado).font(.caption).foregroundStyle(Tema.gris) }
                                        Text(a.ultima).font(.caption).foregroundStyle(Tema.gris).lineLimit(2)
                                    }
                                    Spacer()
                                    Text("\(a.acciones)").font(.headline.monospacedDigit()).foregroundStyle(Tema.bronce)
                                }
                                .padding(12).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
                            }
                        case "decidir":
                            let p = d.decidir.filter { store.enviadas[$0.id] == nil }
                            if p.isEmpty { Vacio(titulo: "Nada pendiente", texto: "El equipo no espera ninguna decisión tuya.", icono: "checkmark.seal") }
                            ForEach(p) { x in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(x.titulo).font(.subheadline.weight(.semibold))
                                    if !x.detalle.isEmpty { Text(x.detalle).font(.caption).foregroundStyle(Tema.gris).lineLimit(3) }
                                    Text("\(Equipo.nombre(x.agente)) · \(x.tipo)\(x.plazo.isEmpty ? "" : " · vence \(F.dia(x.plazo))")").font(.caption2).foregroundStyle(Tema.bronce)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
                            }
                        case "objetivos":
                            Tarjeta(titulo: "Etapa \(d.etapa.numero ?? 1) · \(Etapa.nombres[d.etapa.numero ?? 1] ?? "")", icono: "target") { ForEach(d.objetivos) { BarraObjetivo(o: $0) } }
                        case "libreta":
                            let l = (d.libreta ?? []).filter { $0.estado == "abierta" }
                            if l.isEmpty { Vacio(titulo: "Libreta al día", texto: "No hay notas abiertas.", icono: "book.closed") }
                            ForEach(l) { n in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(n.resumen).font(.subheadline)
                                    Text("\(n.tipo) · \(F.dia(n.fecha))\(n.vence.isEmpty ? "" : " · vence \(F.dia(n.vence))")").font(.caption).foregroundStyle(Tema.gris)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
                            }
                        default:
                            let c = (d.chat ?? []).filter { $0.de == "gerente" || $0.para == "gerente" }.suffix(25)
                            if c.isEmpty { Vacio(titulo: "Sin mensajes", texto: "Lo que el Gerente habla con el equipo y con vos aparece acá.", icono: "bubble.left.and.bubble.right") }
                            ForEach(Array(c.reversed())) { m in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("\(Equipo.nombre(m.de)) → \(Equipo.nombre(m.para)) · \(F.dia(m.fecha)) \(m.hora)").font(.caption2.weight(.semibold)).foregroundStyle(Tema.bronce)
                                    Text(m.texto).font(.subheadline)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
                            }
                        }
                    } else { Esqueleto() }
                }
                .padding(14)
            }
    }
}
