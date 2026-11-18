import SwiftUI
import ActivityKit

struct PedidosView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        Pantalla(titulo: "Pedidos") {
            if let d = store.datos {
                let activos = d.pedidos.filter { !$0.entregado }
                if d.pedidos.isEmpty { Text("Sin pedidos todavía.").foregroundStyle(Tema.gris) }
                ForEach(activos + d.pedidos.filter(\.entregado)) { p in
                    NavigationLink(value: p) {
                        Tarjeta {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(p.cantidad) × \(p.producto)").font(.headline)
                                    Text("Comprado el \(F.dia(p.fecha_compra))").font(.caption).foregroundStyle(Tema.gris)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(Tema.gris)
                            }
                            Text(p.estado.prefix(1).uppercased() + p.estado.dropFirst()).font(.subheadline.weight(.semibold)).foregroundStyle(Tema.bronce)
                            Pasos(etapa: p.etapa, total: p.etapas.count)
                        }
                    }.buttonStyle(.plain)
                }
            }
        }
    }
}

struct PedidoDetalle: View {
    var pedido: Pedido
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Tarjeta {
                    Text("\(pedido.cantidad) × \(pedido.producto)").font(.title2.weight(.semibold))
                    if store.totalUnidades(pedido) > pedido.cantidad {
                        Text("Va en el mismo paquete que \(store.totalUnidades(pedido) - pedido.cantidad == 1 ? "otra unidad" : "otras \(store.totalUnidades(pedido) - pedido.cantidad)"): \(store.totalUnidades(pedido)) en total.")
                            .font(.footnote).foregroundStyle(Tema.bronce)
                    }
                    Text("Comprado el \(F.dia(pedido.fecha_compra)) · actualizado \(F.dia(pedido.actualizado)) \(pedido.actualizado.suffix(5))")
                        .font(.caption).foregroundStyle(Tema.gris)
                }
                Tarjeta(titulo: "Etapas", icono: "map") {
                    ForEach(Array(pedido.etapas.enumerated()), id: \.offset) { i, e in
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().fill(i <= pedido.etapa ? Tema.bronce : Color.white.opacity(0.1)).frame(width: 22, height: 22)
                                if i < pedido.etapa { Image(systemName: "checkmark").font(.caption2.weight(.bold)).foregroundStyle(.black) }
                                if i == pedido.etapa { Circle().fill(.black).frame(width: 8, height: 8) }
                            }
                            Text(e.prefix(1).uppercased() + e.dropFirst())
                                .font(i == pedido.etapa ? .headline : .subheadline)
                                .foregroundStyle(i <= pedido.etapa ? Tema.texto : Tema.gris)
                            Spacer()
                            if i == pedido.etapa { Chip(texto: "ahora", color: Tema.bronce) }
                        }
                    }
                }
                Button { store.seguir(pedido) } label: {
                    Label(store.siguiendo(pedido) ? "Quitar de la pantalla bloqueada" : "Seguir en la pantalla bloqueada",
                          systemImage: store.siguiendo(pedido) ? "lock.slash" : "lock.iphone")
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(.black)
                .disabled(pedido.entregado)
                Tarjeta(titulo: "Movimientos", icono: "clock") {
                    ForEach(pedido.eventos.reversed()) { e in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(F.dia(e.fecha)) \(e.hora) · \(e.lugar)").font(.caption.weight(.semibold)).foregroundStyle(Tema.bronce)
                            Text(e.evento).font(.subheadline)
                        }
                        .padding(.vertical, 2)
                    }
                    if pedido.eventos.isEmpty { Text("Sin movimientos todavía.").foregroundStyle(Tema.gris) }
                }
            }
            .padding(16)
        }
        .background(Tema.fondo)
        .navigationTitle("Pedido")
        .navigationBarTitleDisplayMode(.inline)
    }
}
