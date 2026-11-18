import SwiftUI
import Charts

/// Foto de perfil: el retrato de su persona 3D de la oficina (Fotos.xcassets, solo en la Mac, no va al repo);
/// si no está, la inicial con el color de la marca.
struct Avatar: View {
    var agente: String
    var tam: CGFloat = 40
    var body: some View {
        Group {
            if let img = UIImage(named: "foto-\(agente)") {
                Image(uiImage: img).resizable().scaledToFill()
                    .background(LinearGradient(colors: [Tema.bronce.opacity(0.35), Tema.tarjeta], startPoint: .top, endPoint: .bottom))
            } else {
                Text(String(Equipo.nombre(agente).prefix(1))).font(.system(size: tam * 0.42, weight: .semibold))
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(Tema.bronce.opacity(0.18)).foregroundStyle(Tema.bronce)
            }
        }
        .frame(width: tam, height: tam).clipShape(Circle())
        .overlay(Circle().stroke(Tema.bronce.opacity(0.5), lineWidth: 1))
    }
}

struct Salud14: View {
    var filas: [[String: String]]
    static let partes = [("nube", "Nube 7:52"), ("manana", "PC 10:30"), ("pc", "PC 16:00"), ("gerente", "Gerente 20:00")]
    static func color(_ e: String) -> Color {
        switch e { case "ok", "cubierta", "arreglado": return Tema.verde
        case "no toca", "pendiente", "en curso", "": return Tema.suave
        case "alerta": return Tema.ambar
        default: return Tema.rojo }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Salud14.partes, id: \.0) { k, n in
                HStack(spacing: 3) {
                    Text(n).font(.caption2).foregroundStyle(Tema.gris).frame(width: 78, alignment: .leading)
                    ForEach(filas.indices, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 3).fill(Salud14.color(filas[i][k] ?? "")).frame(height: 14)
                    }
                }
            }
            HStack {
                Text(F.dia(filas.first?["fecha"] ?? "")).font(.caption2).foregroundStyle(Tema.gris).padding(.leading, 81)
                Spacer()
                Text(F.dia(filas.last?["fecha"] ?? "")).font(.caption2).foregroundStyle(Tema.gris)
            }
        }
    }
}

struct EquipoView: View {
    @EnvironmentObject var store: Store
    @State private var oficina = false
    var body: some View {
        Pantalla(titulo: "Equipo") {
            if let d = store.datos {
                Button { oficina = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "building.2.crop.circle.fill").font(.system(size: 34)).foregroundStyle(Tema.bronce)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Entrar a la oficina").font(.headline).foregroundStyle(Tema.texto)
                            Text("La oficina 3D, en tu iPhone").font(.caption).foregroundStyle(Tema.gris)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Tema.gris)
                    }
                    .padding(14).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(Tema.bronce.opacity(0.4)))
                }.buttonStyle(.plain)
                LuzVivo()
                if store.vivo?.enCurso == true { EquipoEnVivo() }
                let hechos = d.objetivos.filter { $0.progreso >= 1 }.count
                Tarjeta(titulo: "Objetivos de la semana", icono: "target") {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(hechos) de \(d.objetivos.count)").font(.system(size: 30, weight: .semibold, design: .rounded))
                        Text("cumplidos").foregroundStyle(Tema.gris)
                    }
                    ProgressView(value: Double(hechos), total: Double(max(d.objetivos.count, 1))).tint(Tema.bronce)
                }
                if let s = d.salud14, !s.isEmpty {
                    Tarjeta(titulo: "Salud del equipo · 14 días", icono: "waveform.path.ecg") { Salud14(filas: s) }
                }
                ForEach(orden(d)) { a in
                    NavigationLink { AgenteView(agente: a.agente) } label: { tarjeta(a, d.objetivos.filter { $0.agente == a.agente }) }
                        .buttonStyle(.plain)
                }
            }
        }
        .fullScreenCover(isPresented: $oficina) { OficinaView().environmentObject(store) }
    }

    func orden(_ d: Datos) -> [Agente] {
        d.equipo.sorted { (Equipo.orden.firstIndex(of: $0.agente) ?? 99) < (Equipo.orden.firstIndex(of: $1.agente) ?? 99) }
    }

    func tarjeta(_ a: Agente, _ obs: [Objetivo]) -> some View {
        Tarjeta {
            HStack(alignment: .center, spacing: 12) {
                Avatar(agente: a.agente, tam: 50)
                VStack(alignment: .leading, spacing: 2) {
                    Text(a.nombre).font(.headline)
                    Text("\(a.acciones) acciones en 7 días").font(.caption).foregroundStyle(Tema.gris)
                }
                Spacer()
                MiniSerie(valores: a.serie).frame(width: 64, height: 26)
                Image(systemName: "chevron.right").foregroundStyle(Tema.gris)
            }
            if !a.ultima.isEmpty {
                Text(a.ultima).font(.footnote).foregroundStyle(Tema.gris).lineLimit(2)
            }
            ForEach(obs) { o in BarraObjetivo(o: o) }
        }
    }
}

struct BarraObjetivo: View {
    var o: Objetivo
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(o.objetivo).font(.caption).lineLimit(2)
                Spacer()
                Text(o.estado == "hecho" ? "hecho" : (o.avance.map { "\(Int($0))/\(o.meta)" } ?? "pendiente")).font(.caption.monospacedDigit()).foregroundStyle(Tema.gris)
            }
            ProgressView(value: o.progreso).tint(o.progreso >= 1 ? Tema.verde : (o.vencido ? Tema.rojo : Tema.ambar))
        }
    }
}

// ---------- La pantalla de cada agente ----------
struct AgenteView: View {
    var agente: String
    @EnvironmentObject var store: Store
    @State private var tarea = false

    var body: some View {
        ScrollView {
            if let d = store.datos {
                VStack(spacing: 14) {
                    VStack(spacing: 8) {
                        Avatar(agente: agente, tam: 96)
                        Text(Equipo.nombre(agente)).font(.title2.weight(.semibold))
                        if let a = d.equipo.first(where: { $0.agente == agente }) {
                            Text("\(a.acciones) acciones en 7 días · última \(F.dia(a.cuando)) \(a.cuando.suffix(5))").font(.caption).foregroundStyle(Tema.gris)
                        }
                        HStack {
                            NavigationLink { ChatView(agente: agente) } label: { Label("Escribirle", systemImage: "bubble.left.and.bubble.right").frame(maxWidth: .infinity).padding(.vertical, 4) }
                                .buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(Tema.sobreAcento)
                            Button { tarea = true } label: { Label("Encargar", systemImage: "checklist").frame(maxWidth: .infinity).padding(.vertical, 4) }
                                .buttonStyle(.bordered)
                        }
                    }
                    contenido(d)
                    let obs = d.objetivos.filter { $0.agente == agente }
                    if !obs.isEmpty { Tarjeta(titulo: "Sus objetivos", icono: "target") { ForEach(obs) { BarraObjetivo(o: $0) } } }
                    if let a = d.equipo.first(where: { $0.agente == agente }), !a.ultima.isEmpty {
                        Tarjeta(titulo: "Lo último que hizo", icono: "clock") { Text(a.ultima).font(.subheadline) }
                    }
                }.padding(16)
            }
        }
        .background(Tema.fondo).navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $tarea) {
            NavigationStack { TareaForm(agenteInicial: agente) }.environmentObject(store).preferredColorScheme(Tema.esquema).tint(Tema.bronce)
        }
    }

    @ViewBuilder func contenido(_ d: Datos) -> some View {
        switch agente {
        case "wa": whatsapp(d)
        case "ebay": ebay(d)
        case "ana": analista(d)
        case "dem": demanda(d)
        case "pedidos":
            MapaRuta(pedidos: d.pedidos.filter { !$0.entregado }.isEmpty ? d.pedidos : d.pedidos.filter { !$0.entregado })
        case "fin": NavigationLink { FinanzasView() } label: { Tarjeta(titulo: "Finanzas", icono: "banknote") {
            HStack { Text(F.bs(d.finanzas.invertido_bs)).font(.title3.weight(.semibold)); Text("invertido").foregroundStyle(Tema.gris); Spacer(); Image(systemName: "chevron.right") } } }.buttonStyle(.plain)
        case "gerente": gerente(d)
        case "nube": nube(d)
        default: EmptyView()
        }
    }

    func whatsapp(_ d: Datos) -> some View {
        let w = d.whatsapp
        return VStack(spacing: 14) {
            Tarjeta(titulo: "Contacto con tiendas", icono: "bubble.left") {
                HStack {
                    cifra("\(Int(w?.tiendas_total ?? 0))", "tiendas")
                    cifra("\(Int(w?.contactadas_7d ?? 0))", "contactadas 7 días")
                    cifra("\(Int(w?.respondieron_7d ?? 0))", "respondieron")
                    cifra(F.pct((w?.tasa_7d ?? 0) * 100), "respuesta")
                }
                if let s = w?.serie, !s.isEmpty {
                    Chart(s) { x in
                        BarMark(x: .value("día", F.dia(x.fecha)), y: .value("n", x.respuestas)).foregroundStyle(Tema.bronce.opacity(0.5))
                        BarMark(x: .value("día", F.dia(x.fecha)), y: .value("n", x.con_precio)).foregroundStyle(Tema.verde)
                    }
                    .chartXAxis(.hidden).frame(height: 110)
                    Text("Últimos \(s.count) días: del \(F.dia(s.first?.fecha ?? "")) al \(F.dia(s.last?.fecha ?? ""))").font(.caption2).foregroundStyle(Tema.gris)
                    HStack(spacing: 12) { Label("respuestas", systemImage: "square.fill").foregroundStyle(Tema.bronce.opacity(0.6)); Label("con precio", systemImage: "square.fill").foregroundStyle(Tema.verde) }.font(.caption2)
                }
            }
            Tarjeta(titulo: "Lista completa", icono: "list.bullet.rectangle") {
                let pedida = w?.lista_pedida ?? 0, faltan = w?.lista_faltan ?? 0
                Text("Pedida a \(pedida) tiendas · faltan \(faltan)").font(.headline)
                ProgressView(value: Double(pedida), total: Double(max(pedida + faltan, 1))).tint(Tema.bronce)
                if let s = w?.seguimiento, !s.isEmpty { Text("Seguimiento hoy: " + s.joined(separator: ", ")).font(.footnote).foregroundStyle(Tema.gris) }
                if let r = w?.responder, !r.isEmpty { Text("Para responder: " + r.joined(separator: ", ")).font(.footnote).foregroundStyle(Tema.ambar) }
            }
        }
    }

    func ebay(_ d: Datos) -> some View {
        Tarjeta(titulo: "Cazador de ofertas", icono: "scope") {
            ForEach(d.cazador.topes.filter { $0.tope_usd != nil }) { t in
                HStack {
                    Text(t.producto).font(.caption).lineLimit(1)
                    Spacer()
                    Text(F.usd(t.hoy_usd)).font(.caption.monospacedDigit()).foregroundStyle(t.bajo_tope ? Tema.verde : Tema.texto)
                    Text("/ \(F.usd(t.tope_usd))").font(.caption2.monospacedDigit()).foregroundStyle(Tema.gris)
                }
            }
            Text("El historial de precio de cada producto está en Precios → tocar un producto.").font(.caption).foregroundStyle(Tema.gris)
        }
    }

    func analista(_ d: Datos) -> some View {
        Tarjeta(titulo: "Qué conviene traer", icono: "function") {
            ForEach(d.productos.filter { $0.recomendacion == "traer" }) { p in
                HStack {
                    Text(p.producto + (p.condicion == "usado" ? " (usado)" : "")).font(.subheadline).lineLimit(1)
                    Spacer()
                    Text(F.pct(p.margen)).font(.subheadline.monospacedDigit().weight(.semibold)).foregroundStyle(Tema.verde)
                    Text("peor \(F.pct(p.peor))").font(.caption2.monospacedDigit()).foregroundStyle(Tema.gris)
                }
            }
        }
    }

    func demanda(_ d: Datos) -> some View {
        Tarjeta(titulo: "Qué se mueve en Marketplace", icono: "chart.bar") {
            let l = (d.demanda ?? []).sorted { ($0.anuncios ?? 0) > ($1.anuncios ?? 0) }.prefix(10)
            let tope = max(l.compactMap(\.anuncios).max() ?? 1, 1)
            Text("Anuncios activos en Cochabamba (promedio de los últimos días)").font(.caption).foregroundStyle(Tema.gris)
            ForEach(Array(l)) { x in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(x.producto.replacingOccurrences(of: "Corsair Vengeance RGB ", with: "")).font(.caption).lineLimit(1)
                        Spacer()
                        Text(F.num(x.anuncios, 1)).font(.caption.monospacedDigit().weight(.semibold))
                    }
                    GeometryReader { g in
                        Capsule().fill(Tema.bronce).frame(width: max(4, g.size.width * CGFloat((x.anuncios ?? 0) / tope)), height: 6)
                    }.frame(height: 6)
                }
            }
            ForEach(Array(l.prefix(5))) { x in
                Text("\(x.producto): \(x.lectura)\(x.precio_bs.map { " · último \(F.bs($0))" } ?? "")").font(.caption).foregroundStyle(Tema.gris)
            }
        }
    }

    func gerente(_ d: Datos) -> some View {
        VStack(spacing: 14) {
            if let r = d.recomendaciones, !r.isEmpty {
                Tarjeta(titulo: "Lo que te recomienda", icono: "lightbulb") { ForEach(r) { Text("• " + $0.texto).font(.subheadline) } }
            }
            LibretaView()
            Tarjeta(titulo: "Informes diarios", icono: "doc.text") {
                ForEach((d.informes ?? []).prefix(10)) { i in
                    if let u = URL(string: i.url) { Link(destination: u) { HStack { Text("Informe \(i.tipo) del \(F.dia(i.fecha))"); Spacer(); Image(systemName: "arrow.up.right.square") } }.font(.subheadline) }
                }
            }
        }
    }

    func nube(_ d: Datos) -> some View {
        Tarjeta(titulo: "Documentos", icono: "folder") {
            NavigationLink { ArchivoView() } label: { Label("Abrir el archivo: informes, catálogos y capturas", systemImage: "archivebox").font(.subheadline.weight(.semibold)) }
            ForEach((d.documentos ?? []).prefix(15)) { x in
                if let u = URL(string: x.url) {
                    Link(destination: u) {
                        HStack {
                            Chip(texto: x.tipo, color: Tema.bronce)
                            Text(x.titulo).font(.subheadline).lineLimit(1)
                            Spacer()
                            Text(F.dia(x.fecha)).font(.caption).foregroundStyle(Tema.gris)
                        }
                    }
                }
            }
        }
    }

    func cifra(_ v: String, _ t: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(v).font(.headline.monospacedDigit())
            Text(t).font(.caption2).foregroundStyle(Tema.gris).lineLimit(2)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

// ---------- Chat con un agente (chat.csv) ----------
struct ChatView: View {
    var agente: String
    @EnvironmentObject var store: Store
    @State private var texto = ""
    @FocusState private var foco: Bool

    var mensajes: [Mensaje] {
        let l = (store.datos?.chat ?? []).filter { ($0.de == agente && ($0.para == "santi" || $0.para == "gerente")) || ($0.para == agente && ($0.de == "santi" || $0.de == "gerente")) }
        return l + store.enviadosChat.filter { $0.para == agente }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { sv in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        if mensajes.isEmpty { Text("Todavía no hay mensajes con \(Equipo.nombre(agente)).").foregroundStyle(Tema.gris).padding(.top, 40) }
                        ForEach(mensajes) { m in globo(m).id(m.id) }
                    }.padding(12)
                }
                .onAppear { if let u = mensajes.last { sv.scrollTo(u.id, anchor: .bottom) } }
                .onChange(of: mensajes.count) { _, _ in if let u = mensajes.last { withAnimation { sv.scrollTo(u.id, anchor: .bottom) } } }
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Mensaje para \(Equipo.nombre(agente))", text: $texto, axis: .vertical).lineLimit(1...5)
                    .padding(10).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 18)).focused($foco)
                Button {
                    let t = texto; texto = ""
                    Task { if !(await store.escribir(a: agente, t)) { texto = t } }
                } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 32)) }
                    .disabled(texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(10).background(Tema.fondo)
        }
        .background(Tema.fondo)
        .navigationTitle(Equipo.nombre(agente)).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .principal) { HStack { Avatar(agente: agente, tam: 28); Text(Equipo.nombre(agente)).font(.headline) } } }
    }

    func globo(_ m: Mensaje) -> some View {
        let mio = m.de == "santi"
        return HStack(alignment: .bottom, spacing: 6) {
            if mio { Spacer(minLength: 40) } else { Avatar(agente: m.de, tam: 26) }
            VStack(alignment: .leading, spacing: 3) {
                if !mio && m.de != agente || (m.para != "santi" && !mio) {
                    Text("\(Equipo.nombre(m.de)) → \(Equipo.nombre(m.para))").font(.caption2.weight(.semibold)).foregroundStyle(Tema.bronce)
                }
                Text(m.texto).font(.subheadline)
                Text("\(F.dia(m.fecha)) \(m.hora)").font(.caption2).foregroundStyle(mio ? Tema.sobreAcento.opacity(0.6) : Tema.gris)
            }
            .padding(10)
            .background(mio ? Tema.bronce : Tema.tarjeta, in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(mio ? Tema.sobreAcento : Tema.texto)
            if !mio { Spacer(minLength: 40) }
        }
    }
}
