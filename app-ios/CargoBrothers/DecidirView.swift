import SwiftUI

struct DecidirView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        Pantalla(titulo: "Decidir") {
            if let d = store.datos {
                Text("Lo que apruebes o rechaces va al Gerente por Telegram: se abre el chat con el mensaje listo y solo tocas Enviar. La Raspberry lo anota en unos minutos.")
                    .font(.footnote).foregroundStyle(Tema.gris).frame(maxWidth: .infinity, alignment: .leading)
                if d.decidir.isEmpty {
                    ContentUnavailableView("Nada pendiente", systemImage: "checkmark.seal", description: Text("El equipo no espera ninguna decisión tuya."))
                }
                ForEach(d.decidir) { item in tarjeta(item) }
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
