import SwiftUI
import WidgetKit

// ---------- Ajustes → Apariencia: modo (sistema, día, noche), color de acento y fondo ----------
struct AparienciaView: View {
    @AppStorage("tema_modo") private var modo = "sistema"
    @AppStorage("tema_acento") private var acento = "bronce"
    @AppStorage("tema_fondo") private var fondo = "grafito"

    var body: some View {
        Form {
            Section("Modo") {
                Picker("Modo", selection: $modo) {
                    Label("Como el iPhone", systemImage: "circle.lefthalf.filled").tag("sistema")
                    Label("Día", systemImage: "sun.max").tag("claro")
                    Label("Noche", systemImage: "moon").tag("oscuro")
                }
                .pickerStyle(.inline).labelsHidden()
            }
            Section {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 14) {
                    ForEach(Tema.acentos, id: \.0) { a in
                        Button { acento = a.0; WidgetCenter.shared.reloadAllTimelines() } label: {
                            VStack(spacing: 6) {
                                Circle().fill(Color(UIColor { $0.userInterfaceStyle == .light ? a.3 : a.2 })).frame(width: 40, height: 40)
                                    .overlay(Circle().stroke(Tema.texto, lineWidth: acento == a.0 ? 3 : 0).padding(-4))
                                Text(a.1).font(.caption2).foregroundStyle(Tema.texto)
                            }
                        }.buttonStyle(.plain)
                    }
                }.padding(.vertical, 6)
            } header: { Text("Color de acento") } footer: { Text("El de botones, etiquetas, gráficos y el foquito. El de la marca es Bronce.") }
            Section {
                Picker("Fondo en modo noche", selection: $fondo) {
                    ForEach(Tema.fondos, id: \.0) { f in Text(f.1).tag(f.0) }
                }
                .pickerStyle(.segmented)
            } header: { Text("Fondo de noche") } footer: { Text("En modo día el fondo es claro, con tarjetas blancas.") }
            Section("Así se ve") {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Ryzen 5 7600X").font(.headline)
                        Spacer()
                        Text("24,8 %").font(.title3.weight(.semibold)).foregroundStyle(Tema.verde)
                    }
                    Pasos(etapa: 4, total: 7, alto: 6)
                    HStack {
                        Chip(texto: "traer", color: Tema.verde)
                        Chip(texto: "nuevo", color: Tema.bronce)
                        Spacer()
                        Text("Botón").font(.subheadline.weight(.semibold)).padding(.horizontal, 14).padding(.vertical, 7)
                            .background(Tema.bronce, in: Capsule()).foregroundStyle(Tema.sobreAcento)
                    }
                }
                .padding(14).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 16))
                .listRowBackground(Tema.fondo)
            }
            Button("Volver a lo de siempre (bronce, grafito, como el iPhone)") { modo = "sistema"; acento = "bronce"; fondo = "grafito" }
        }
        .navigationTitle("Apariencia").navigationBarTitleDisplayMode(.inline)
    }
}

// ---------- Buscador general: productos, tiendas, clientes, agentes, decisiones, pedidos y documentos ----------
struct BuscadorView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    @State private var q = ""
    @FocusState private var foco: Bool

    func hay(_ s: String) -> Bool {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .contains(q.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).trimmingCharacters(in: .whitespaces))
    }

    var body: some View {
        List {
            if q.trimmingCharacters(in: .whitespaces).count < 2 {
                Section { Text("Escribe al menos 2 letras: un producto (7600X), una tienda (OverCity), un agente, una tarea o una fecha.").font(.footnote).foregroundStyle(Tema.gris) }
                    .listRowBackground(Tema.tarjeta)
            } else if let d = store.datos {
                let prods = d.productos.filter { hay($0.producto) }
                let tiendas = (d.tiendas ?? []).filter { hay($0.tienda) || hay($0.estado) }
                let agentes = Equipo.orden.filter { hay(Equipo.nombre($0)) }
                let decs = d.decidir.filter { hay($0.titulo) || hay($0.detalle) || hay($0.ref) }
                let decididas = (d.decididas ?? []).filter { hay($0.titulo) || hay($0.ref) }.prefix(10)
                let peds = d.pedidos.filter { hay($0.producto) || hay($0.estado) }
                let docs = (d.informes_nube ?? []).filter { hay(F.dia($0.fecha)) || hay($0.fecha) }
                let cats = (d.catalogos ?? []).filter { hay($0.tienda) || hay($0.descripcion) }.prefix(10)
                let notas = (d.libreta ?? []).filter { hay($0.resumen) }.prefix(10)
                let chat = (d.chat ?? []).filter { hay($0.texto) }.suffix(10)
                let total = prods.count + tiendas.count + agentes.count + decs.count + decididas.count + peds.count + docs.count + cats.count + notas.count + chat.count
                if total == 0 { Text("No encontré nada con «\(q)».").foregroundStyle(Tema.gris).listRowBackground(Tema.tarjeta) }
                if !prods.isEmpty { Section("Productos") { ForEach(prods) { p in
                    NavigationLink(value: p) { fila("cpu", p.producto + (p.condicion == "usado" ? " (usado)" : ""), "\(p.recomendacion) · margen \(F.pct(p.margen))") } } } }
                if !peds.isEmpty { Section("Pedidos") { ForEach(peds) { p in
                    NavigationLink(value: p) { fila("shippingbox", "\(p.cantidad) × \(p.producto)\(p.esPrueba ? " · prueba" : "")", p.estado) } } } }
                if !agentes.isEmpty { Section("Equipo") { ForEach(agentes, id: \.self) { a in
                    NavigationLink { AgenteView(agente: a) } label: { HStack(spacing: 10) { Avatar(agente: a, tam: 30); Text(Equipo.nombre(a)) } } } } }
                if !tiendas.isEmpty { Section("Tiendas (\(tiendas.count))") { ForEach(tiendas.prefix(15)) { t in
                    NavigationLink { TiendaDetalle(nombre: t.tienda) } label: { fila("storefront", t.tienda, t.estado + (t.con_precio > 0 ? " · \(t.con_precio) con precio" : "")) } } } }
                if !decs.isEmpty { Section("Por decidir") { ForEach(decs) { x in fila("checkmark.seal", x.titulo, "\(x.tipo) \(x.ref)") } } }
                if !decididas.isEmpty { Section("Ya decidido") { ForEach(Array(decididas)) { x in fila("checkmark.seal.fill", x.titulo, "\(x.estado) · \(F.dia(x.fecha))") } } }
                if !notas.isEmpty { Section("Libreta del Gerente") { ForEach(Array(notas)) { n in fila("book.closed", n.resumen, "\(n.tipo) · \(n.estado)") } } }
                if !chat.isEmpty { Section("Chat del equipo") { ForEach(Array(chat)) { m in
                    NavigationLink { ChatView(agente: m.de == "santi" || m.de == "gerente" ? m.para : m.de) } label: { fila("bubble.left", m.texto, "\(Equipo.nombre(m.de)) → \(Equipo.nombre(m.para)) · \(F.dia(m.fecha))") } } } }
                if !docs.isEmpty { Section("Informes") { ForEach(docs) { i in
                    NavigationLink { LectorMD(titulo: "Informe del \(F.dia(i.fecha))", ruta: i.ruta) } label: { fila("doc.text", "Informe del \(F.dia(i.fecha))", "revisión de la nube") } } } }
                if !cats.isEmpty { Section("Catálogos") { ForEach(Array(cats)) { c in
                    NavigationLink { CatalogoView(c: c) } label: { fila("doc.richtext", c.tienda, "\(F.dia(c.fecha)) · \(c.formato)") } } } }
            }
        }
        .scrollContentBackground(.hidden).background(Tema.fondo)
        .searchable(text: $q, placement: .navigationBarDrawer(displayMode: .always), prompt: "Buscar en todo")
        .navigationTitle("Buscar").navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Pedido.self) { PedidoDetalle(pedido: $0) }
        .navigationDestination(for: Producto.self) { ProductoDetalle(p: $0) }
        .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Cerrar") { cerrar() } } }
    }

    func fila(_ i: String, _ t: String, _ s: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: i).foregroundStyle(Tema.bronce).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) { Text(t).font(.subheadline).lineLimit(2); Text(s).font(.caption).foregroundStyle(Tema.gris).lineLimit(1) }
        }
        .listRowBackground(Tema.tarjeta)
    }
}
