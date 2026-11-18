import SwiftUI
import Charts

struct Tarjeta<C: View>: View {
    var titulo: String? = nil
    var icono: String? = nil
    @ViewBuilder var contenido: C
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let titulo {
                HStack(spacing: 6) {
                    if let icono { Image(systemName: icono).foregroundStyle(Tema.bronce) }
                    Text(titulo.uppercased()).font(.caption.weight(.semibold)).tracking(1.2).foregroundStyle(Tema.gris)
                }
            }
            contenido
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Tema.linea))
    }
}

struct Pantalla<C: View, B: View>: View {
    var titulo: String
    var contenido: C
    var barra: B
    @EnvironmentObject var store: Store
    init(titulo: String, @ViewBuilder contenido: () -> C, @ViewBuilder barra: () -> B) {
        self.titulo = titulo; self.contenido = contenido(); self.barra = barra()
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if !store.enLinea, store.datos != nil {
                        Label("Sin conexión: mostrando lo último que se cargó", systemImage: "wifi.slash")
                            .font(.footnote).foregroundStyle(Tema.ambar).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if store.datos == nil {
                        if store.cargando { ProgressView().padding(.top, 80) }
                        else {
                            ContentUnavailableView("No se pudieron cargar los datos", systemImage: "icloud.slash",
                                                   description: Text("Revisa la conexión y desliza hacia abajo para reintentar."))
                        }
                    } else {
                        contenido
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .background(Tema.fondo)
            .scrollContentBackground(.hidden)
            .refreshable { await store.refrescar() }
            .navigationDestination(for: Pedido.self) { PedidoDetalle(pedido: $0) }
            .navigationDestination(for: Producto.self) { ProductoDetalle(p: $0) }
            .navigationTitle(titulo)
            .toolbar { ToolbarItemGroup(placement: .topBarTrailing) { barra } }
            .toolbarBackground(Tema.fondo, for: .navigationBar)
        }
    }
}

struct Chip: View {
    var texto: String
    var color: Color
    var body: some View {
        Text(texto).font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.16), in: Capsule()).foregroundStyle(color)
    }
}

struct MiniSerie: View {
    var valores: [Int]
    var body: some View {
        Chart(Array(valores.enumerated()), id: \.offset) { i, v in
            BarMark(x: .value("día", i), y: .value("acciones", v)).foregroundStyle(Tema.bronce.opacity(0.85)).cornerRadius(2)
        }
        .chartXAxis(.hidden).chartYAxis(.hidden)
    }
}

extension Pantalla where B == EmptyView {
    init(titulo: String, @ViewBuilder contenido: () -> C) { self.init(titulo: titulo, contenido: contenido, barra: { EmptyView() }) }
}
