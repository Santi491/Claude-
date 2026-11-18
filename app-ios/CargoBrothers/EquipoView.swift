import SwiftUI

struct EquipoView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        Pantalla(titulo: "Equipo") {
            if let d = store.datos {
                let hechos = d.objetivos.filter { $0.progreso >= 1 }.count
                Tarjeta(titulo: "Objetivos de la etapa \(d.etapa.numero ?? 1)", icono: "target") {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(hechos) de \(d.objetivos.count)").font(.system(size: 30, weight: .semibold, design: .rounded))
                        Text("cumplidos").foregroundStyle(Tema.gris)
                    }
                    ProgressView(value: Double(hechos), total: Double(max(d.objetivos.count, 1))).tint(Tema.bronce)
                }
                ForEach(d.equipo) { a in tarjeta(a, d.objetivos.filter { $0.agente == a.agente }) }
            }
        }
    }

    func tarjeta(_ a: Agente, _ obs: [Objetivo]) -> some View {
        Tarjeta {
            HStack(alignment: .center, spacing: 12) {
                Text(String(a.nombre.prefix(1))).font(.headline).frame(width: 38, height: 38)
                    .background(Tema.bronce.opacity(0.18), in: Circle()).foregroundStyle(Tema.bronce)
                VStack(alignment: .leading, spacing: 2) {
                    Text(a.nombre).font(.headline)
                    Text("\(a.acciones) acciones en 7 días").font(.caption).foregroundStyle(Tema.gris)
                }
                Spacer()
                MiniSerie(valores: a.serie).frame(width: 70, height: 26)
            }
            if !a.ultima.isEmpty {
                Text(a.ultima).font(.footnote).foregroundStyle(Tema.gris).lineLimit(3)
                Text(F.dia(a.cuando) + " " + a.cuando.suffix(5)).font(.caption2).foregroundStyle(Tema.gris.opacity(0.7))
            }
            ForEach(obs) { o in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(o.objetivo).font(.caption).lineLimit(2)
                        Spacer()
                        Text(o.estado == "hecho" ? "hecho" : (o.avance.map { "\(Int($0))/\(o.meta)" } ?? o.meta)).font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
                    }
                    ProgressView(value: o.progreso).tint(o.progreso >= 1 ? Tema.verde : (o.vencido ? Tema.rojo : Tema.ambar))
                }
            }
        }
    }
}
