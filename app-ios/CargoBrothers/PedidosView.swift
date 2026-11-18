import SwiftUI
import MapKit
import ActivityKit

// ---------- Mapa del recorrido (Apple Maps; siempre a nivel de ciudad, nunca una dirección) ----------
enum Ruta {
    static let santaCruz = CLLocationCoordinate2D(latitude: -17.78, longitude: -63.18)
    static let cochabamba = CLLocationCoordinate2D(latitude: -17.39, longitude: -66.16)

    /// lo recorrido (de los eventos con lugar) y lo que falta hasta Cochabamba, pasando por Santa Cruz
    static func tramos(_ p: Pedido) -> (hecho: [CLLocationCoordinate2D], falta: [CLLocationCoordinate2D]) {
        var hecho: [CLLocationCoordinate2D] = []
        for e in p.eventos {
            guard let la = e.lat, let lo = e.lon else { continue }
            let c = CLLocationCoordinate2D(latitude: la, longitude: lo)
            if let u = hecho.last, abs(u.latitude - la) < 0.01, abs(u.longitude - lo) < 0.01 { continue }
            hecho.append(c)
        }
        guard !p.entregado, p.etapa < 5, let ultimo = hecho.last else { return (hecho, []) }
        let pasoSC = hecho.contains { abs($0.latitude - santaCruz.latitude) < 0.3 && abs($0.longitude - santaCruz.longitude) < 0.3 }
        return (hecho, [ultimo] + (pasoSC ? [] : [santaCruz]) + [cochabamba])
    }
}

struct MapaRuta: View {
    var pedidos: [Pedido]
    var alto: CGFloat = 280
    @State private var completo = false
    var body: some View {
        mapa
            .frame(height: alto)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Tema.linea))
            .overlay(alignment: .topTrailing) {
                Button { completo = true } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right").font(.subheadline.weight(.semibold))
                        .padding(9).background(.ultraThinMaterial, in: Circle())
                }.padding(10)
            }
            .fullScreenCover(isPresented: $completo) {
                ZStack(alignment: .topTrailing) {
                    mapa.ignoresSafeArea()
                    Button { completo = false } label: {
                        Image(systemName: "xmark").font(.headline).padding(12).background(.ultraThinMaterial, in: Circle())
                    }.padding(.trailing, 16).padding(.top, 8)
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(pedidos) { p in Text("\(p.producto) · \(p.estado)").font(.caption.weight(.semibold)) }
                        HStack(spacing: 10) {
                            Label("recorrido", systemImage: "line.diagonal").foregroundStyle(Tema.bronce)
                            Label("lo que falta", systemImage: "ellipsis").foregroundStyle(Tema.bronce.opacity(0.7))
                        }.font(.caption2)
                    }
                    .padding(12).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading).padding(16).padding(.bottom, 10)
                }
                .preferredColorScheme(Tema.esquema)
            }
    }

    var mapa: some View {
        Map(initialPosition: .automatic, interactionModes: .all) {
            ForEach(pedidos) { p in
                let t = Ruta.tramos(p)
                if t.hecho.count > 1 { MapPolyline(coordinates: t.hecho).stroke(Tema.bronce, lineWidth: 4) }
                if t.falta.count > 1 {
                    MapPolyline(coordinates: t.falta).stroke(Tema.bronce.opacity(0.7), style: StrokeStyle(lineWidth: 3, dash: [7, 6]))
                }
                if let ini = t.hecho.first { Annotation("Origen", coordinate: ini) { punto(Tema.gris) } }
                if let ahora = t.hecho.last {
                    Annotation(p.producto, coordinate: ahora) {
                        ZStack {
                            Circle().fill(Tema.bronce.opacity(0.25)).frame(width: 34, height: 34)
                            Image(systemName: "shippingbox.fill").font(.caption).foregroundStyle(Tema.sobreAcento)
                                .frame(width: 24, height: 24).background(Tema.bronce, in: Circle())
                        }
                    }
                }
            }
            if pedidos.contains(where: { !$0.entregado }) {
                Annotation("Cochabamba", coordinate: Ruta.cochabamba) { punto(Tema.verde) }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
    }
    func punto(_ c: Color) -> some View { Circle().fill(c).frame(width: 12, height: 12).overlay(Circle().stroke(.black, lineWidth: 2)) }
}

struct PedidosView: View {
    @EnvironmentObject var store: Store
    @State private var filtro = ""
    @State private var seccion = 0
    var body: some View {
        Pantalla(titulo: ["Pedidos", "Anuncios", "Clientes", "Tiendas"][seccion], inline: true) {
            Picker("", selection: $seccion) { Text("Pedidos").tag(0); Text("Anuncios").tag(1); Text("Clientes").tag(2); Text("Tiendas").tag(3) }
                .pickerStyle(.segmented)
            if seccion == 1 { AnunciosView() }
            else if seccion == 2 { ClientesView() }
            else if seccion == 3 { TiendasView() }
            else if let d = store.datos {
                let reales = d.pedidos.filter { !$0.esPrueba }
                let productos = Array(Set(reales.map(\.producto))).sorted()
                let visibles = filtro == "__pruebas" ? d.pedidos.filter(\.esPrueba) : reales.filter { filtro.isEmpty || $0.producto == filtro }
                if d.pedidos.isEmpty { Text("Sin pedidos todavía.").foregroundStyle(Tema.gris) }
                else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            chip("Todos", "")
                            ForEach(productos, id: \.self) { chip($0, $0) }
                            if d.pedidos.contains(where: \.esPrueba) { chip("Pruebas", "__pruebas") }
                        }
                    }
                    let enCamino = visibles.filter { !$0.entregado }
                    MapaRuta(pedidos: unicos(enCamino.isEmpty ? visibles : enCamino)).id(filtro)
                }
                ForEach(visibles.filter { !$0.entregado } + visibles.filter(\.entregado)) { p in
                    NavigationLink(value: p) {
                        Tarjeta {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text("\(p.cantidad) × \(p.producto)").font(.headline)
                                        if p.esPrueba { Chip(texto: "PRUEBA", color: Tema.ambar) }
                                    }
                                    Text("Comprado el \(F.dia(p.fecha_compra))\(p.esPrueba ? " · no cuenta para el negocio" : "")").font(.caption).foregroundStyle(Tema.gris)
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

    /// un pedido por paquete (3 + 1 unidades del mismo envío dibujan una sola ruta)
    func unicos(_ l: [Pedido]) -> [Pedido] {
        var vistos = Set<String>()
        return l.filter { vistos.insert($0.producto + $0.fecha_compra + $0.estado).inserted }
    }

    func chip(_ t: String, _ v: String) -> some View {
        Button { withAnimation { filtro = v } } label: {
            Text(t).font(.subheadline.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                .background(filtro == v ? Tema.bronce : Tema.tarjeta, in: Capsule())
                .foregroundStyle(filtro == v ? Tema.sobreAcento : Tema.texto)
                .overlay(Capsule().stroke(Tema.linea))
        }
    }
}

struct PedidoDetalle: View {
    var pedido: Pedido
    @EnvironmentObject var store: Store
    @State private var hoja: Hoja?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Tarjeta {
                    Text("\(pedido.cantidad) × \(pedido.producto)").font(.title2.weight(.semibold))
                    if store.totalUnidades(pedido) > pedido.cantidad {
                        let otras = store.totalUnidades(pedido) - pedido.cantidad
                        Text("Va en el mismo paquete que \(otras == 1 ? "otra unidad" : "otras \(otras)"): \(store.totalUnidades(pedido)) en total.")
                            .font(.footnote).foregroundStyle(Tema.bronce)
                    }
                    Text("Comprado el \(F.dia(pedido.fecha_compra)) · actualizado \(F.dia(pedido.actualizado)) \(pedido.actualizado.suffix(5))")
                        .font(.caption).foregroundStyle(Tema.gris)
                }
                MapaRuta(pedidos: [pedido], alto: 240)
                if !pedido.entregado {
                    HStack(spacing: 10) {
                        Button { hoja = .etapa } label: { Label("Avisar cómo va", systemImage: "mappin.and.ellipse").frame(maxWidth: .infinity).padding(.vertical, 6) }
                            .buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(Tema.sobreAcento)
                        Button { store.seguir(pedido) } label: {
                            Label(store.siguiendo(pedido) ? "Quitar" : "Pantalla bloqueada", systemImage: store.siguiendo(pedido) ? "lock.slash" : "lock.iphone")
                                .frame(maxWidth: .infinity).padding(.vertical, 6)
                        }.buttonStyle(.bordered)
                    }
                }
                if pedido.etapa >= 5 {
                    Button { hoja = .prepararVenta } label: { Label("Preparar la venta", systemImage: "tag").frame(maxWidth: .infinity).padding(.vertical, 6) }
                        .buttonStyle(.bordered).tint(Tema.verde)
                }
                Tarjeta(titulo: "Etapas", icono: "map") {
                    ForEach(Array(pedido.etapas.enumerated()), id: \.offset) { i, e in
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().fill(i <= pedido.etapa ? Tema.bronce : Tema.suave).frame(width: 22, height: 22)
                                if i < pedido.etapa { Image(systemName: "checkmark").font(.caption2.weight(.bold)).foregroundStyle(Tema.sobreAcento) }
                                if i == pedido.etapa { Circle().fill(Tema.sobreAcento).frame(width: 8, height: 8) }
                            }
                            Text(e.prefix(1).uppercased() + e.dropFirst())
                                .font(i == pedido.etapa ? .headline : .subheadline)
                                .foregroundStyle(i <= pedido.etapa ? Tema.texto : Tema.gris)
                            Spacer()
                            if i == pedido.etapa { Chip(texto: "ahora", color: Tema.bronce) }
                        }
                    }
                }
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
        .sheet(item: $hoja) { h in
            NavigationStack {
                if h == .etapa { EtapaForm(pedidoInicial: pedido) } else { PrepararVentaView() }
            }
            .environmentObject(store).preferredColorScheme(Tema.esquema).tint(Tema.bronce)
        }
    }
}
