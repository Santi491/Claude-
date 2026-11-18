import SwiftUI
import PDFKit

// ---------- Clientes potenciales (clientes-potenciales.csv) ----------
struct ClientesView: View {
    @EnvironmentObject var store: Store
    @State private var grupo = "AB"
    static let grupos: [(String, String, Color)] = [
        ("A", "Sin stock", Tema.verde), ("B", "Arman PCs", Tema.verde), ("C", "Revenden", Tema.ambar),
        ("E", "Por calificar", Tema.gris), ("D", "No apuntar", Tema.rojo), ("F", "Sin WhatsApp", Tema.gris)]

    var lista: [Cliente] {
        (store.datos?.clientes ?? []).filter { grupo.contains($0.letra) }
            .sorted { ($0.orden, prio($0.prioridad), $0.tienda) < ($1.orden, prio($1.prioridad), $1.tienda) }
    }
    func prio(_ p: String) -> Int { ["alta": 0, "media": 1, "baja": 2][p] ?? 3 }

    var body: some View {
        VStack(spacing: 14) {
            Tarjeta(titulo: "A quién ofrecer primero", icono: "person.2.badge.gearshape") {
                Text("Las tiendas ya calificadas por WhatsApp y Marketplace. Todavía no se le ofrece nada a nadie: cuando decidas vender a tiendas, empiezan por las A y B en este orden.")
                    .font(.footnote).foregroundStyle(Tema.gris)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        chip("A y B", "AB", Tema.verde)
                        ForEach(ClientesView.grupos, id: \.0) { g in chip("\(g.0) · \(g.1)", g.0, g.2) }
                    }
                }
            }
            if lista.isEmpty { Text("Nadie en este grupo.").foregroundStyle(Tema.gris) }
            ForEach(lista) { c in
                NavigationLink { TiendaDetalle(nombre: c.tienda) } label: { tarjeta(c) }.buttonStyle(.plain)
            }
        }
    }

    func cuenta(_ g: String) -> Int { (store.datos?.clientes ?? []).filter { g.contains($0.letra) }.count }

    func chip(_ t: String, _ v: String, _ c: Color) -> some View {
        Button { withAnimation { grupo = v } } label: {
            Text("\(t) (\(cuenta(v)))").font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6)
                .background(grupo == v ? c.opacity(0.9) : Tema.fondo, in: Capsule())
                .foregroundStyle(grupo == v ? .black : Tema.texto).overlay(Capsule().stroke(Tema.linea))
        }
    }

    func tarjeta(_ c: Cliente) -> some View {
        Tarjeta {
            HStack(alignment: .firstTextBaseline) {
                if c.orden < 999 { Text("\(c.orden)").font(.caption.weight(.bold)).frame(width: 24, height: 24).background(Tema.bronce, in: Circle()).foregroundStyle(.black) }
                Text(c.tienda).font(.headline)
                Spacer()
                Chip(texto: c.prioridad, color: c.prioridad == "alta" ? Tema.verde : c.prioridad == "media" ? Tema.ambar : Tema.gris)
            }
            Text(c.grupo).font(.caption.weight(.semibold)).foregroundStyle(Tema.bronce)
            if !c.por_que.isEmpty { Text(c.por_que).font(.footnote) }
            if !c.productos.isEmpty { Label(c.productos, systemImage: "cpu").font(.caption).foregroundStyle(Tema.gris) }
            if !c.proximo_paso.isEmpty { Text(c.proximo_paso.replacingOccurrences(of: #"Orden \d+ de \d+ para ofrecer( \([^)]*\))?( · )?"#, with: "", options: .regularExpression)).font(.caption).foregroundStyle(Tema.gris).lineLimit(3) }
        }
    }
}

// ---------- Nuestros anuncios en Marketplace (publicaciones.csv) ----------
struct AnunciosView: View {
    @EnvironmentObject var store: Store
    @State private var venta = false
    var body: some View {
        VStack(spacing: 14) {
            let pubs = store.datos?.publicaciones ?? []
            if pubs.isEmpty {
                Tarjeta(titulo: "Nuestros anuncios", icono: "megaphone") {
                    Text("Todavía no publicamos nada.").font(.headline)
                    Text("Marketplace publica cuando fijes el precio y dejes las fotos en la PC (Documents\\fotos-publicar). Después acá ves cada anuncio: precio, días en línea, clics, mensajes e interesados.")
                        .font(.footnote).foregroundStyle(Tema.gris)
                    Button { venta = true } label: { Label("Preparar la venta", systemImage: "tag").frame(maxWidth: .infinity).padding(.vertical, 4) }
                        .buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(.black)
                }
            } else {
                ForEach(Dictionary(grouping: pubs, by: \.producto).sorted { $0.key < $1.key }, id: \.key) { prod, l in
                    let ult = l.sorted { $0.fecha + $0.hora < $1.fecha + $1.hora }
                    let primera = ult.first { $0.accion == "publicada" }
                    Tarjeta(titulo: prod, icono: "megaphone") {
                        if let u = ult.last {
                            HStack {
                                Chip(texto: u.accion, color: u.accion == "vendida" ? Tema.verde : u.accion == "eliminada" || u.accion == "pausada" ? Tema.gris : Tema.bronce)
                                Spacer()
                                if !u.precio_bs.isEmpty { Text("Bs \(u.precio_bs)").font(.title3.weight(.semibold).monospacedDigit()) }
                            }
                            if !u.titulo.isEmpty { Text(u.titulo).font(.subheadline) }
                            HStack {
                                if let p = primera { dato(String(dias(desde: p.fecha)), "días en línea") }
                                dato(u.clics.isEmpty ? "—" : u.clics, "clics")
                                dato(u.mensajes.isEmpty ? "—" : u.mensajes, "mensajes")
                                dato(u.cantidad.isEmpty ? "—" : u.cantidad, "unidades")
                            }
                        }
                        Divider().overlay(Tema.linea)
                        ForEach(ult.reversed()) { x in
                            Text("\(F.dia(x.fecha)) \(x.hora) · \(x.accion)\(x.precio_bs.isEmpty ? "" : " a Bs \(x.precio_bs)")\(x.notas.isEmpty ? "" : ": \(x.notas)")")
                                .font(.caption).foregroundStyle(Tema.gris)
                        }
                    }
                }
            }
            competencia
        }
        .sheet(isPresented: $venta) { NavigationStack { PrepararVentaView() }.environmentObject(store).preferredColorScheme(.dark).tint(Tema.bronce) }
    }

    @ViewBuilder var competencia: some View {
        let prods = Set((store.datos?.finanzas_productos ?? []).map(\.producto))
        ForEach(Array(prods).sorted(), id: \.self) { p in
            let hace14 = F.bo("yyyy-MM-dd", Date().addingTimeInterval(-14 * 86400))
            let l = (store.datos?.locales?[p] ?? []).filter { $0.src == "mkt" && $0.fecha >= hace14 && !$0.estado.contains("otra ciudad") }
            if !l.isEmpty {
                Tarjeta(titulo: "La competencia: \(p) en Marketplace", icono: "eye") {
                    ForEach(l) { x in
                        HStack {
                            Text("\(F.dia(x.fecha)) · \(x.estado.replacingOccurrences(of: "no cuenta: ", with: ""))").font(.caption).foregroundStyle(Tema.gris).lineLimit(2)
                            Spacer()
                            if let u = URL(string: x.url), !x.url.isEmpty { Link(F.bs(x.bs), destination: u).font(.subheadline.monospacedDigit()) }
                            else { Text(F.bs(x.bs)).font(.subheadline.monospacedDigit()) }
                        }
                    }
                }
            }
        }
    }

    func dias(desde f: String) -> Int {
        let fm = DateFormatter(); fm.dateFormat = "yyyy-MM-dd"; fm.timeZone = TimeZone(identifier: "America/La_Paz")
        guard let d = fm.date(from: f) else { return 0 }
        return max(0, Calendar.current.dateComponents([.day], from: d, to: Date()).day ?? 0)
    }
    func dato(_ v: String, _ t: String) -> some View {
        VStack(alignment: .leading, spacing: 1) { Text(v).font(.headline.monospacedDigit()); Text(t).font(.caption2).foregroundStyle(Tema.gris) }
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// ---------- Tiendas (tiendas-cochabamba.csv, sin teléfonos ni direcciones) ----------
struct TiendasView: View {
    @EnvironmentObject var store: Store
    @State private var buscar = ""
    @State private var filtro = ""
    static let filtros: [(String, String)] = [("", "Todas"), ("respondió", "Respondieron"), ("sin stock", "Sin stock"),
                                              ("esperando", "Esperando"), ("consultada", "Consultadas"), ("sin whatsapp", "Sin WhatsApp"), ("no vende", "No venden")]
    var lista: [TiendaInfo] {
        (store.datos?.tiendas ?? []).filter { t in
            (filtro.isEmpty || t.estado.lowercased().contains(filtro) || (filtro == "sin whatsapp" && t.estado.contains("número")))
            && (buscar.isEmpty || t.tienda.localizedCaseInsensitiveContains(buscar))
        }.sorted { ($0.con_precio, $0.ultimo_mensaje) > ($1.con_precio, $1.ultimo_mensaje) }
    }
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(Tema.gris)
                TextField("Buscar tienda", text: $buscar).textInputAutocapitalization(.never)
            }.padding(10).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 12))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(TiendasView.filtros, id: \.0) { f in
                        Button { withAnimation { filtro = f.0 } } label: {
                            Text(f.1).font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6)
                                .background(filtro == f.0 ? Tema.bronce : Tema.tarjeta, in: Capsule()).foregroundStyle(filtro == f.0 ? .black : Tema.texto)
                        }
                    }
                }
            }
            Text("\(lista.count) tiendas · primero las que nos pasaron precio").font(.caption).foregroundStyle(Tema.gris).frame(maxWidth: .infinity, alignment: .leading)
            ForEach(lista) { t in
                NavigationLink { TiendaDetalle(nombre: t.tienda) } label: {
                    HStack(spacing: 12) {
                        Circle().fill(color(t.estado)).frame(width: 10, height: 10)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.tienda).font(.subheadline.weight(.semibold))
                            Text("\(t.estado)\(t.ultimo_mensaje.isEmpty ? "" : " · \(F.dia(t.ultimo_mensaje))")").font(.caption).foregroundStyle(Tema.gris)
                        }
                        Spacer()
                        if t.con_precio > 0 { Chip(texto: "\(t.con_precio) con precio", color: Tema.verde) }
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(Tema.gris)
                    }
                    .padding(12).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
                }.buttonStyle(.plain)
            }
        }
    }
    func color(_ e: String) -> Color {
        if e.hasPrefix("respondió") { return Tema.verde }
        if e.contains("sin stock") || e.contains("esperando") || e.contains("consultada") { return Tema.ambar }
        return Tema.gris
    }
}

struct TiendaDetalle: View {
    var nombre: String
    @EnvironmentObject var store: Store
    @State private var tarea = false
    var t: TiendaInfo? { store.datos?.tiendas?.first { $0.tienda == nombre } }
    var c: Cliente? { store.datos?.clientes?.first { $0.tienda == nombre } }
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Tarjeta {
                    Text(nombre).font(.title2.weight(.semibold))
                    if let t {
                        Text("\(t.id) · \(t.ciudad)").font(.caption).foregroundStyle(Tema.gris)
                        HStack { Chip(texto: t.estado, color: Tema.bronce); if !t.grupo.isEmpty { Chip(texto: t.grupo, color: Tema.verde) } }
                        HStack {
                            dato("\(t.enviados)", "mensajes nuestros"); dato("\(t.recibidos)", "respuestas"); dato("\(t.con_precio)", "con precio")
                        }
                        if !t.vende.isEmpty { Text("Vende: \(t.vende)").font(.caption).foregroundStyle(Tema.gris) }
                    }
                }
                if let c {
                    Tarjeta(titulo: "Como cliente", icono: "person.2") {
                        Text(c.grupo).font(.subheadline.weight(.semibold)).foregroundStyle(Tema.bronce)
                        if !c.por_que.isEmpty { Text(c.por_que).font(.footnote) }
                        if !c.productos.isEmpty { Label(c.productos, systemImage: "cpu").font(.caption) }
                        if !c.proximo_paso.isEmpty { Text(c.proximo_paso).font(.caption).foregroundStyle(Tema.gris) }
                    }
                }
                if let p = t?.precios, !p.isEmpty {
                    Tarjeta(titulo: "Precios que nos pasó", icono: "tag") {
                        ForEach(p) { x in
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(x.producto).font(.subheadline)
                                    Text("\(F.dia(x.fecha)) · \(x.estado)").font(.caption2).foregroundStyle(Tema.gris).lineLimit(1)
                                }
                                Spacer()
                                Text(F.bs(x.precio_bs)).monospacedDigit()
                            }
                        }
                    }
                }
                Button { tarea = true } label: { Label("Pedirle algo a WhatsApp sobre esta tienda", systemImage: "bubble.left").frame(maxWidth: .infinity).padding(.vertical, 4) }
                    .buttonStyle(.bordered)
                Text("Por privacidad la app no muestra teléfonos ni direcciones.").font(.caption2).foregroundStyle(Tema.gris)
            }.padding(16)
        }
        .background(Tema.fondo).navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $tarea) { NavigationStack { TareaForm(agenteInicial: "wa", tareaInicial: "\(nombre): ") }.environmentObject(store).preferredColorScheme(.dark).tint(Tema.bronce) }
    }
    func dato(_ v: String, _ t: String) -> some View {
        VStack(alignment: .leading, spacing: 1) { Text(v).font(.headline.monospacedDigit()); Text(t).font(.caption2).foregroundStyle(Tema.gris) }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

// ---------- Archivo: informes, catálogos y capturas para leer dentro de la app ----------
struct ArchivoView: View {
    @EnvironmentObject var store: Store
    @State private var cajon = 0
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(Array(["Informes", "Catálogos", "Capturas", "Gerente", "Movimientos"].enumerated()), id: \.offset) { i, t in
                            Button { withAnimation { cajon = i } } label: {
                                Text(t).font(.subheadline.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                                    .background(cajon == i ? Tema.bronce : Tema.tarjeta, in: Capsule()).foregroundStyle(cajon == i ? .black : Tema.texto)
                            }
                        }
                    }
                }
                switch cajon {
                case 0:
                    ForEach(store.datos?.informes_nube ?? []) { i in
                        NavigationLink { LectorMD(titulo: "Informe del \(F.dia(i.fecha))", ruta: i.ruta) } label: { fila("doc.text", "Informe diario del \(F.dia(i.fecha))", "revisión de la nube") }.buttonStyle(.plain)
                    }
                case 1:
                    ForEach(store.datos?.catalogos ?? []) { c in
                        NavigationLink { CatalogoView(c: c) } label: {
                            fila(c.formato == "PDF" ? "doc.richtext" : c.formato == "WEB" ? "globe" : "photo", "\(c.tienda) · \(c.formato)", "\(F.dia(c.fecha)) · \(c.canal) · \(c.precios.isEmpty ? "0" : c.precios) precios anotados")
                        }.buttonStyle(.plain)
                    }
                case 2:
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(store.datos?.capturas ?? []) { c in
                            NavigationLink { ImagenView(c: c) } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    AsyncImage(url: Fuente.raw(c.ruta)) { $0.resizable().scaledToFill() } placeholder: { Tema.tarjeta }
                                        .frame(height: 110).clipShape(RoundedRectangle(cornerRadius: 10))
                                    Text("\(Equipo.nombre(c.agente)) · \(F.dia(c.fecha)) \(c.hora)").font(.caption2).foregroundStyle(Tema.gris)
                                }
                            }.buttonStyle(.plain)
                        }
                    }
                case 4:
                    MovimientosView()
                default:
                    ForEach(store.datos?.informes ?? []) { i in
                        if let u = URL(string: i.url) { Link(destination: u) { fila("doc.text.fill", "Informe \(i.tipo) del Gerente", "\(F.dia(i.fecha)) · se abre en Google Docs") } .buttonStyle(.plain) }
                    }
                    ForEach((store.datos?.documentos ?? []).filter { $0.tipo == "Excel" }) { d in
                        if let u = URL(string: d.url) { Link(destination: u) { fila("tablecells", d.titulo, "\(F.dia(d.fecha)) · se abre en GitHub") }.buttonStyle(.plain) }
                    }
                }
            }.padding(16)
        }
        .background(Tema.fondo).navigationTitle("Archivo").navigationBarTitleDisplayMode(.inline)
    }
    func fila(_ i: String, _ t: String, _ s: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: i).font(.title3).foregroundStyle(Tema.bronce).frame(width: 30)
            VStack(alignment: .leading, spacing: 2) { Text(t).font(.subheadline.weight(.semibold)); Text(s).font(.caption).foregroundStyle(Tema.gris).lineLimit(1) }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Tema.gris)
        }.padding(12).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// Informe en Markdown leído desde GitHub y dibujado nativo (títulos, viñetas, tablas y negritas).
struct LectorMD: View {
    var titulo: String
    var ruta: String
    @State private var texto: String?
    @State private var error = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if let texto { ForEach(Array(bloques(texto).enumerated()), id: \.offset) { _, b in b } }
                else if error { Text("No se pudo cargar el informe.").foregroundStyle(Tema.gris) }
                else { ProgressView().frame(maxWidth: .infinity).padding(.top, 60) }
            }.padding(16)
        }
        .background(Tema.fondo).navigationTitle(titulo).navigationBarTitleDisplayMode(.inline)
        .task {
            guard let u = Fuente.raw(ruta), let (d, _) = try? await URLSession.shared.data(from: u), let s = String(data: d, encoding: .utf8) else { error = true; return }
            texto = s
        }
    }

    func md(_ s: String) -> Text {
        Text((try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s))
    }

    func bloques(_ t: String) -> [AnyView] {
        var out: [AnyView] = []
        var tabla: [[String]] = []
        func cerrarTabla() {
            guard !tabla.isEmpty else { return }
            let filas = tabla.filter { !$0.allSatisfy { $0.allSatisfy { "-: ".contains($0) } } }
            out.append(AnyView(ScrollView(.horizontal, showsIndicators: false) {
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                    ForEach(Array(filas.enumerated()), id: \.offset) { i, f in
                        GridRow { ForEach(Array(f.enumerated()), id: \.offset) { _, c in md(c).font(i == 0 ? .caption.weight(.bold) : .caption).foregroundStyle(i == 0 ? Tema.bronce : Tema.texto) } }
                        if i == 0 { Divider().overlay(Tema.linea) }
                    }
                }.padding(10).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 10))
            }))
            tabla = []
        }
        for l in t.components(separatedBy: "\n") {
            let s = l.trimmingCharacters(in: .whitespaces)
            if s.hasPrefix("|") {
                tabla.append(s.trimmingCharacters(in: CharacterSet(charactersIn: "|")).components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) })
                continue
            }
            cerrarTabla()
            if s.isEmpty { continue }
            if s.hasPrefix("### ") { out.append(AnyView(md(String(s.dropFirst(4))).font(.headline).padding(.top, 6))) }
            else if s.hasPrefix("## ") { out.append(AnyView(md(String(s.dropFirst(3))).font(.title3.weight(.semibold)).foregroundStyle(Tema.bronce).padding(.top, 10))) }
            else if s.hasPrefix("# ") { out.append(AnyView(md(String(s.dropFirst(2))).font(.title2.weight(.bold)))) }
            else if s.hasPrefix("- ") || s.hasPrefix("* ") {
                let sangria = l.prefix(while: { $0 == " " }).count
                out.append(AnyView(HStack(alignment: .top, spacing: 6) { Text("•").foregroundStyle(Tema.bronce); md(String(s.dropFirst(2))).font(.subheadline) }.padding(.leading, CGFloat(sangria) * 6)))
            }
            else if s.hasPrefix("---") { out.append(AnyView(Divider().overlay(Tema.linea))) }
            else { out.append(AnyView(md(s).font(.subheadline))) }
        }
        cerrarTabla()
        return out
    }
}

struct CatalogoView: View {
    var c: Catalogo
    var body: some View {
        VStack(spacing: 0) {
            Tarjeta {
                Text(c.tienda).font(.headline)
                Text("\(F.dia(c.fecha)) · \(c.canal) · \(c.productos.isEmpty ? "?" : c.productos) productos · \(c.precios.isEmpty ? "0" : c.precios) precios a nuestra lista").font(.caption).foregroundStyle(Tema.gris)
                Text(c.descripcion).font(.footnote).lineLimit(6)
            }.padding(12)
            if !c.ruta.isEmpty, let u = Fuente.raw(c.ruta) {
                if c.formato == "PDF" { VisorPDF(url: u) }
                else { ScrollView { AsyncImage(url: u) { $0.resizable().scaledToFit() } placeholder: { ProgressView() } } }
            } else {
                Text(c.formato == "WEB" ? "Era una página web: no hay archivo guardado." : "El archivo no está en el repo.").foregroundStyle(Tema.gris).padding()
                Spacer()
            }
        }
        .background(Tema.fondo).navigationBarTitleDisplayMode(.inline)
    }
}

struct VisorPDF: UIViewRepresentable {
    var url: URL
    func makeUIView(context: Context) -> PDFView {
        let v = PDFView(); v.autoScales = true; v.backgroundColor = .black
        Task { if let (d, _) = try? await URLSession.shared.data(from: url) { await MainActor.run { v.document = PDFDocument(data: d) } } }
        return v
    }
    func updateUIView(_ v: PDFView, context: Context) {}
}

struct ImagenView: View {
    var c: Captura
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                AsyncImage(url: Fuente.raw(c.ruta)) { $0.resizable().scaledToFit() } placeholder: { ProgressView().frame(maxWidth: .infinity, minHeight: 200) }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Text("\(Equipo.nombre(c.agente)) · \(F.dia(c.fecha)) \(c.hora)").font(.caption.weight(.semibold)).foregroundStyle(Tema.bronce)
                Text(c.descripcion).font(.subheadline)
            }.padding(16)
        }.background(Tema.fondo).navigationBarTitleDisplayMode(.inline)
    }
}
