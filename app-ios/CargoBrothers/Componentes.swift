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
    var inline = false
    @EnvironmentObject var store: Store
    init(titulo: String, inline: Bool = false, @ViewBuilder contenido: () -> C, @ViewBuilder barra: () -> B) {
        self.titulo = titulo; self.inline = inline; self.contenido = contenido(); self.barra = barra()
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if !store.enLinea, let d = store.datos {
                        Label("Sin conexión · datos de \(F.dia(d.generado)) \(d.generado.suffix(5))", systemImage: "wifi.slash")
                            .font(.footnote.weight(.medium)).foregroundStyle(Tema.ambar).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    let esperando = store.cola.filter { $0.estado == "sin señal" }.count
                    if esperando > 0 {
                        Label(esperando == 1 ? "1 cosa guardada en el teléfono: se sube sola al volver la señal" : "\(esperando) cosas guardadas en el teléfono: se suben solas al volver la señal",
                              systemImage: "tray.and.arrow.up").font(.footnote).foregroundStyle(Tema.gris).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if store.datos == nil {
                        if store.cargando { Esqueleto() }
                        else {
                            Vacio(titulo: "No se pudieron cargar los datos", texto: "Puede ser la conexión o GitHub. Los datos aparecen apenas se puedan leer.",
                                  icono: "icloud.slash", boton: "Reintentar") { Task { await store.refrescar() } }
                                .padding(.top, 60)
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
            .navigationBarTitleDisplayMode(inline ? .inline : .large)
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
    init(titulo: String, inline: Bool = false, @ViewBuilder contenido: () -> C) { self.init(titulo: titulo, inline: inline, contenido: contenido, barra: { EmptyView() }) }
}


/// Mientras carga: la forma de las tarjetas en gris, con un brillo que pasa (en vez de una ruedita en una pantalla vacía)
struct Esqueleto: View {
    @State private var fase: CGFloat = -1
    var body: some View {
        VStack(spacing: 14) {
            ForEach(0..<4, id: \.self) { k in
                VStack(alignment: .leading, spacing: 10) {
                    RoundedRectangle(cornerRadius: 6).frame(width: 120, height: 12)
                    RoundedRectangle(cornerRadius: 7).frame(height: k == 0 ? 26 : 18)
                    RoundedRectangle(cornerRadius: 6).frame(width: k % 2 == 0 ? 220 : 160, height: 12)
                }
                .foregroundStyle(Tema.suave)
                .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                .background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 18))
            }
        }
        .overlay {
            GeometryReader { g in
                LinearGradient(colors: [.clear, Tema.texto.opacity(0.06), .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: g.size.width * 0.6).offset(x: fase * g.size.width * 1.4)
            }.allowsHitTesting(false).clipped()
        }
        .onAppear { withAnimation(.linear(duration: 1.3).repeatForever(autoreverses: false)) { fase = 1 } }
        .accessibilityLabel("Cargando")
    }
}

/// Pantalla vacía o con error: qué pasa, por qué y qué hacer (nunca una pantalla en blanco)
struct Vacio: View {
    var titulo: String
    var texto: String
    var icono: String
    var boton: String? = nil
    var accion: (() -> Void)? = nil
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icono).font(.system(size: 34, weight: .light)).foregroundStyle(Tema.gris)
            Text(titulo).font(.headline).foregroundStyle(Tema.texto).multilineTextAlignment(.center)
            Text(texto).font(.subheadline).foregroundStyle(Tema.gris).multilineTextAlignment(.center)
            if let boton, let accion {
                Button(boton, action: accion).font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 18).padding(.vertical, 9).background(Tema.bronce.opacity(0.15), in: Capsule()).foregroundStyle(Tema.bronce)
                    .padding(.top, 4)
            }
        }
        .padding(24).frame(maxWidth: .infinity)
    }
}
