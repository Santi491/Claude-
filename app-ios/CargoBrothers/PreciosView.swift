import SwiftUI

struct PreciosView: View {
    @EnvironmentObject var store: Store
    @State private var filtro = "traer"
    var body: some View {
        Pantalla(titulo: "Precios") {
            if let d = store.datos {
                Picker("Filtro", selection: $filtro) {
                    Text("Traer").tag("traer"); Text("Esperar").tag("esperar"); Text("Todos").tag("todos"); Text("Cazador").tag("cazador")
                }
                .pickerStyle(.segmented)
                if filtro == "cazador" {
                    ForEach(d.cazador.topes.filter { $0.tope_usd != nil }) { t in filaTope(t) }
                    Text("Sin tope: \(d.cazador.topes.filter { $0.tope_usd == nil }.map(\.producto).joined(separator: ", ")) (falta precio de Cochabamba).")
                        .font(.caption).foregroundStyle(Tema.gris)
                } else {
                    let lista = d.productos.filter { filtro == "todos" || $0.recomendacion == filtro }
                    if lista.isEmpty { Text("Nada en esta lista hoy.").foregroundStyle(Tema.gris) }
                    ForEach(lista) { p in NavigationLink(value: p) { fila(p) }.buttonStyle(.plain) }
                }
            }
        }
    }

    func fila(_ p: Producto) -> some View {
        Tarjeta {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(p.producto).font(.headline).lineLimit(2)
                    Text(p.condicion).font(.caption).foregroundStyle(Tema.gris)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(F.pct(p.margen)).font(.title3.monospacedDigit().weight(.semibold)).foregroundStyle(Tema.color(recomendacion: p.recomendacion))
                    Text("peor \(F.pct(p.peor))").font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
                }
            }
            HStack {
                Text("eBay \(F.usd(p.ebay_usd))"); Spacer(); Text("puesto \(F.bs(p.costo_bs))"); Spacer(); Text("acá \(F.bs(p.local_bs))")
            }
            .font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
        }
    }

    func filaTope(_ t: Tope) -> some View {
        Tarjeta {
            HStack {
                Text(t.producto).font(.subheadline.weight(.semibold)).lineLimit(1)
                Spacer()
                Chip(texto: t.bajo_tope ? "bajo el tope" : "arriba", color: t.bajo_tope ? Tema.verde : Tema.gris)
            }
            HStack {
                Text("hoy \(F.usd(t.hoy_usd))"); Spacer(); Text("tope \(F.usd(t.tope_usd))"); Spacer(); Text("Cbba \(F.bs(t.mediana_bs))")
            }
            .font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
            if t.bajo_tope, let u = URL(string: t.link) { Link("Ver en eBay", destination: u).font(.caption.weight(.semibold)) }
        }
    }
}

struct ProductoDetalle: View {
    var p: Producto
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Tarjeta {
                    Text(p.producto).font(.title2.weight(.semibold))
                    HStack { Chip(texto: p.recomendacion, color: Tema.color(recomendacion: p.recomendacion)); Chip(texto: p.condicion, color: Tema.gris) }
                    Text(p.por_que).font(.subheadline).foregroundStyle(Tema.gris)
                }
                Tarjeta(titulo: "Números", icono: "function") {
                    fila("eBay (con envío en EE.UU.)", F.usd(p.ebay_usd))
                    fila("Puesto en Cochabamba", F.bs(p.costo_bs))
                    fila("Mejor precio local", F.bs(p.local_bs))
                    fila("Precio sugerido de venta", F.bs(p.sugerido_bs))
                    Divider().overlay(Tema.linea)
                    fila("Margen", F.pct(p.margen), Tema.color(recomendacion: p.recomendacion))
                    fila("Peor caso", F.pct(p.peor))
                }
                if let u = URL(string: p.link), !p.link.isEmpty {
                    Link(destination: u) { Label("Ver el anuncio en eBay", systemImage: "arrow.up.right.square").frame(maxWidth: .infinity).padding(.vertical, 6) }
                        .buttonStyle(.bordered)
                }
                Text("Peor caso: dólar +3 %, courier +20 % y precio local −10 %. El margen es sobre el precio de venta.")
                    .font(.caption).foregroundStyle(Tema.gris)
            }
            .padding(16)
        }
        .background(Tema.fondo)
        .navigationBarTitleDisplayMode(.inline)
    }

    func fila(_ a: String, _ b: String, _ c: Color = Tema.texto) -> some View {
        HStack { Text(a).foregroundStyle(Tema.gris); Spacer(); Text(b).monospacedDigit().foregroundStyle(c) }.font(.subheadline)
    }
}
