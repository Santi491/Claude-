import SwiftUI

struct DecidirView: View {
    @EnvironmentObject var store: Store
    @State private var vista = 0
    var body: some View {
        Pantalla(titulo: "Decidir") {
            if let d = store.datos {
                let vencidas = d.decidir.filter(\.vencida), pendientes = d.decidir.filter { !$0.vencida }
                Picker("", selection: $vista) {
                    Text("Por decidir (\(pendientes.count))").tag(0); Text("Vencidas (\(vencidas.count))").tag(1); Text("Decididas").tag(2)
                }.pickerStyle(.segmented)
                switch vista {
                case 0:
                    Text("Lo que apruebes o rechaces queda guardado al instante y el equipo lo hace en su próxima ronda.")
                        .font(.footnote).foregroundStyle(Tema.gris).frame(maxWidth: .infinity, alignment: .leading)
                    if pendientes.isEmpty {
                        ContentUnavailableView("Nada pendiente", systemImage: "checkmark.seal", description: Text("El equipo no espera ninguna decisión tuya."))
                    }
                    ForEach(pendientes) { item in tarjeta(item) }
                case 1:
                    Text("Tareas cuya fecha ya pasó sin decisión: apruébalas si todavía sirven o recházalas para limpiar.")
                        .font(.footnote).foregroundStyle(Tema.gris).frame(maxWidth: .infinity, alignment: .leading)
                    if vencidas.isEmpty { ContentUnavailableView("Nada vencido", systemImage: "calendar.badge.checkmark") }
                    ForEach(vencidas) { item in tarjeta(item) }
                default:
                    Text("Lo decidido en los últimos 30 días: en la app, la oficina, por Telegram o en el Doc.")
                        .font(.footnote).foregroundStyle(Tema.gris).frame(maxWidth: .infinity, alignment: .leading)
                    ForEach(d.decididas ?? []) { x in
                        Tarjeta {
                            HStack {
                                Chip(texto: etiqueta(x.tipo), color: Tema.bronce)
                                Chip(texto: x.estado, color: ["aprobado", "aprobada", "hecho", "hecha", "resuelta"].contains(x.estado) ? Tema.verde : Tema.rojo)
                                Spacer()
                                Text(F.dia(x.fecha)).font(.caption).foregroundStyle(Tema.gris)
                            }
                            Text(x.titulo).font(.subheadline).lineLimit(3)
                            Text("\(nombre(x.agente))\(x.decision.isEmpty ? "" : " · \(x.decision)")").font(.caption).foregroundStyle(Tema.gris).lineLimit(2)
                        }
                    }
                }
            }
        }
    }

    func tarjeta(_ x: Decision) -> some View {
        let enviada = store.enviadas[x.id]
        return Tarjeta {
            HStack {
                Chip(texto: etiqueta(x.tipo), color: Tema.bronce)
                Text(nombre(x.agente)).font(.caption).foregroundStyle(Tema.gris)
                Spacer()
                Text(F.dia(x.fecha)).font(.caption).foregroundStyle(Tema.gris)
            }
            Text(x.titulo).font(.subheadline.weight(.semibold))
            if !x.detalle.isEmpty { Text(x.detalle).font(.footnote).foregroundStyle(Tema.gris).lineLimit(4) }
            if let enviada {
                Label("Mandaste \"\(enviada)\". Esperando que la Raspberry lo anote.", systemImage: "paperplane")
                    .font(.footnote).foregroundStyle(Tema.verde)
            } else if x.tipo == "necesidad" {
                Button { Task { await store.decidir(x, accion: "resuelta") } } label: {
                    Text("Ya está resuelto").frame(maxWidth: .infinity)
                }.buttonStyle(.bordered).tint(Tema.verde)
            } else {
                HStack {
                    Button { Task { await store.decidir(x, accion: "aprobar") } } label: { Text("Aprobar").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).tint(Tema.verde)
                    Button { Task { await store.decidir(x, accion: "rechazar") } } label: { Text("Rechazar").frame(maxWidth: .infinity) }
                        .buttonStyle(.bordered).tint(Tema.rojo)
                }
            }
        }
    }

    func etiqueta(_ t: String) -> String { ["plan": "Tarea", "idea": "Idea", "necesidad": "Necesidad"][t] ?? t }
    func nombre(_ a: String) -> String {
        ["gerente": "Gerente", "wa": "WhatsApp", "mkt": "Marketplace", "ebay": "Rastreador eBay", "ana": "Analista",
         "pedidos": "Pedidos", "fin": "Finanzas", "dem": "Demanda", "local": "PC / Oficina", "nube": "Nube"][a] ?? a
    }
}
