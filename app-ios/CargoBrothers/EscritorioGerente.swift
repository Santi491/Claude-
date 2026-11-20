import SwiftUI

/// (Santi, 20/11: "me encanta cómo quedó") la computadora del Gerente como en la oficina web, un escritorio tipo Windows (íconos, widgets,
/// barra de tareas con Inicio, buscador, apps abiertas y reloj; ventanas que se mueven, minimizan, maximizan y cierran),
/// pero nativo y con la terminación de Apple: vidrio esmerilado, íconos SF, sombras suaves y animaciones con resorte.
struct EscritorioGerente: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var apagar

    struct AppDef: Identifiable { let id: String; let nombre: String; let icono: String; let color: Color }
    static let apps: [AppDef] = [
        .init(id: "chat", nombre: "Chat del equipo", icono: "bubble.left.and.bubble.right.fill", color: Color(red: 0.31, green: 0.78, blue: 0.9)),
        .init(id: "decidir", nombre: "Tareas y metas", icono: "checkmark.circle.fill", color: Color(red: 0.95, green: 0.65, blue: 0.25)),
        .init(id: "propuestas", nombre: "Propuestas", icono: "star.fill", color: Color(red: 0.66, green: 0.55, blue: 0.95)),
        .init(id: "libreta", nombre: "Libreta", icono: "book.closed.fill", color: Color(red: 0.86, green: 0.72, blue: 0.4)),
        .init(id: "objetivos", nombre: "Objetivos", icono: "target", color: Color(red: 0.79, green: 0.64, blue: 0.36)),
        .init(id: "salud", nombre: "Salud del equipo", icono: "heart.fill", color: Color(red: 0.93, green: 0.45, blue: 0.45)),
        .init(id: "panel", nombre: "Panel de datos", icono: "chart.bar.xaxis", color: Color(red: 0.42, green: 0.62, blue: 0.95)),
        .init(id: "oport", nombre: "Oportunidades", icono: "dollarsign.circle.fill", color: Color(red: 0.36, green: 0.77, blue: 0.56)),
        .init(id: "equipo", nombre: "Equipo", icono: "person.3.fill", color: Color(red: 0.6, green: 0.62, blue: 0.66)),
    ]

    struct Ventana: Identifiable, Equatable { let id: String; var pos: CGPoint; var tam: CGSize; var min = false; var max = false; var z: Double }
    @State private var ventanas: [Ventana] = []
    @State private var inicio = false
    @State private var buscar = ""
    @State private var zTope: Double = 1
    @GestureState private var arrastre: (String, CGSize)? = nil
    @State private var area = CGSize(width: 874, height: 402)

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .topLeading) {
                fondo
                iconos.padding(.top, 14).padding(.leading, g.size.width > g.size.height ? 62 : 14)   // la isla de la cámara
                widgets.frame(width: min(300, g.size.width * 0.32)).frame(maxWidth: .infinity, alignment: .topTrailing).padding(.top, 14).padding(.trailing, g.size.width > g.size.height ? 64 : 14)
                ForEach(ventanas.filter { !$0.min }.sorted { $0.z < $1.z }) { v in ventana(v, area: g.size) }
                if inicio { menuInicio.padding(.bottom, 64).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom).transition(.move(edge: .bottom).combined(with: .opacity)) }
                barra.frame(maxHeight: .infinity, alignment: .bottom)
            }
            .onAppear { area = g.size }
            .onChange(of: g.size) { _, t in area = t; acomodar() }
            .animation(.spring(duration: 0.32, bounce: 0.18), value: ventanas)
            .animation(.spring(duration: 0.3), value: inicio)
        }
        .ignoresSafeArea()
        .onAppear {
            // la computadora se usa con el teléfono echado
            for e in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) { e.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight)) { _ in } }
            if ProcessInfo.processInfo.arguments.contains("-demo-ventana") { DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { abrir("oport"); abrir("salud") } }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
    }

    // ---------- fondo con el logo ----------
    var fondo: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.07, green: 0.075, blue: 0.09), Color(red: 0.12, green: 0.1, blue: 0.08)], startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [Color(red: 0.79, green: 0.64, blue: 0.36).opacity(0.22), .clear], center: .center, startRadius: 10, endRadius: 420)
            VStack(spacing: 14) {
                Image("Logo").resizable().renderingMode(.template).scaledToFit().frame(width: 150).foregroundStyle(Color(red: 0.79, green: 0.64, blue: 0.36).opacity(0.55))
                Text("CARGO BROTHERS").font(.system(size: 15, weight: .semibold)).tracking(8).foregroundStyle(.white.opacity(0.35))
            }
        }
        .onTapGesture { inicio = false }
    }

    // ---------- íconos del escritorio, en columnas ----------
    var iconos: some View {
        LazyHGrid(rows: Array(repeating: GridItem(.fixed(92), spacing: 4), count: 3), alignment: .top, spacing: 10) {
            ForEach(Self.apps) { a in
                Button { abrir(a.id) } label: {
                    VStack(spacing: 6) {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: a.icono).font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
                                .frame(width: 50, height: 50)
                                .background(LinearGradient(colors: [a.color, a.color.opacity(0.7)], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                                .shadow(color: a.color.opacity(0.35), radius: 6, y: 3)
                            if let n = insignia(a.id), n > 0 {
                                Text("\(n)").font(.caption2.weight(.bold)).foregroundStyle(.white).padding(.horizontal, 5).frame(minWidth: 18, minHeight: 18)
                                    .background(Color.red, in: Capsule()).offset(x: 6, y: -6)
                            }
                        }
                        Text(a.nombre).font(.system(size: 11, weight: .medium)).foregroundStyle(.white).multilineTextAlignment(.center).lineLimit(2)
                            .shadow(color: .black.opacity(0.6), radius: 2)
                    }
                    .frame(width: 84)
                }
                .buttonStyle(.plain)
            }
        }
    }
    func insignia(_ id: String) -> Int? {
        guard let d = store.datos else { return nil }
        switch id {
        case "decidir": return d.decidir.filter { $0.tipo == "plan" && store.enviadas[$0.id] == nil }.count
        case "propuestas": return d.decidir.filter { $0.tipo != "plan" && store.enviadas[$0.id] == nil }.count
        case "chat": return (d.chat ?? []).filter { $0.para == "santi" && $0.fecha == F.bo("yyyy-MM-dd") }.count
        case "libreta": return (d.libreta ?? []).filter { $0.estado == "abierta" && !$0.vence.isEmpty && $0.vence <= F.bo("yyyy-MM-dd") }.count
        case "objetivos": return d.objetivos.filter(\.vencido).count
        default: return nil
        }
    }

    // ---------- widgets a la derecha ----------
    var widgets: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                if let d = store.datos {
                    widget("Metas de hoy", "flag.fill") {
                        let o = d.objetivos.filter { !$0.cumplido }.prefix(3)
                        if o.isEmpty { Text("Todo cumplido.").foregroundStyle(.secondary) }
                        ForEach(Array(o)) { x in Text("• \(Equipo.nombre(x.agente)): \(x.objetivo)").lineLimit(2) }
                    }
                    widget("Últimos mensajes", "bubble.left.fill") {
                        ForEach(Array((d.chat ?? []).suffix(3).reversed())) { m in
                            Text("\(Text(Equipo.nombre(m.de)).bold()) → \(Equipo.nombre(m.para)): \(m.texto)").lineLimit(2)
                        }
                    }
                    widget("Libreta del Gerente", "book.closed.fill") {
                        let l = (d.libreta ?? []).filter { $0.estado == "abierta" }.prefix(3)
                        if l.isEmpty { Text("Sin notas abiertas.").foregroundStyle(.secondary) }
                        ForEach(Array(l)) { n in Text("• \(n.resumen)").lineLimit(2) }
                    }
                    widget("Cola de tareas", "list.bullet.rectangle.fill") {
                        Text("\(d.decidir.filter { store.enviadas[$0.id] == nil }.count) esperan tu OK · \(d.objetivos.filter(\.vencido).count) objetivos vencidos")
                    }
                    widget("Datos al día", "clock.arrow.circlepath") { Text("Datos al \(F.dia(d.generado)) · \(d.generado.suffix(5))") }
                }
            }
            .padding(.bottom, 70)
        }
    }
    func widget<C: View>(_ t: String, _ ic: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(t.uppercased(), systemImage: ic).font(.system(size: 10, weight: .bold)).tracking(1).foregroundStyle(Color(red: 0.86, green: 0.72, blue: 0.4))
            VStack(alignment: .leading, spacing: 4) { c() }.font(.system(size: 12)).foregroundStyle(.white.opacity(0.9))
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(.white.opacity(0.08)))
    }

    // ---------- ventanas ----------
    func ventana(_ v: Ventana, area: CGSize) -> some View {
        let a = Self.apps.first { $0.id == v.id }!
        let barraAlto: CGFloat = 54
        let tam = v.max ? CGSize(width: area.width, height: area.height - barraAlto) : v.tam
        let desp = arrastre?.0 == v.id ? arrastre!.1 : .zero
        let pos = v.max ? CGPoint(x: area.width / 2, y: (area.height - barraAlto) / 2) : CGPoint(x: v.pos.x + desp.width, y: v.pos.y + desp.height)
        return VStack(spacing: 0) {
            // barra de título: se arrastra; doble toque maximiza
            HStack(spacing: 8) {
                Image(systemName: a.icono).font(.system(size: 12, weight: .bold)).foregroundStyle(.white).frame(width: 22, height: 22).background(a.color, in: RoundedRectangle(cornerRadius: 6))
                Text(a.nombre).font(.system(size: 13, weight: .semibold))
                Spacer()
                boton("minus") { cambiar(v.id) { $0.min = true } }
                boton(v.max ? "arrow.down.right.and.arrow.up.left" : "square") { cambiar(v.id) { $0.max.toggle() } }
                boton("xmark", rojo: true) { ventanas.removeAll { $0.id == v.id } }
            }
            .padding(.leading, 12).padding(.trailing, 6).frame(height: 40)
            .background(.thinMaterial)
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { cambiar(v.id) { $0.max.toggle() } }
            .gesture(DragGesture().updating($arrastre) { val, st, _ in st = (v.id, val.translation) }
                .onEnded { val in cambiar(v.id) { $0.pos.x += val.translation.width; $0.pos.y += val.translation.height; $0.max = false }; acomodar() })
            contenido(v.id)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Tema.fondo)
        }
        .frame(width: tam.width, height: tam.height)
        .clipShape(RoundedRectangle(cornerRadius: v.max ? 0 : 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: v.max ? 0 : 14, style: .continuous).stroke(.white.opacity(0.12)))
        .shadow(color: .black.opacity(0.5), radius: 24, y: 12)
        .position(pos)
        .onTapGesture { alFrente(v.id) }
        .transition(.scale(scale: 0.88).combined(with: .opacity))
    }
    /// lo que muestra cada app (las mismas de la oficina web, cada una con lo suyo)
    @ViewBuilder func contenido(_ id: String) -> some View {
        switch id {
        case "decidir": AppDecisiones(tipos: ["plan"], vacioTitulo: "Sin tareas por aprobar")
        case "propuestas": AppDecisiones(tipos: ["idea", "necesidad"], vacioTitulo: "Sin propuestas")
        case "panel": AppPanel()
        case "oport": AppOportunidades()
        case "salud": AppSalud()
        default: AppGerente(app: id)
        }
    }

    func boton(_ ic: String, rojo: Bool = false, _ a: @escaping () -> Void) -> some View {
        Button(action: a) {
            Image(systemName: ic).font(.system(size: 11, weight: .bold)).frame(width: 34, height: 28)
                .foregroundStyle(.white.opacity(0.85))
                .background(rojo ? Color.red.opacity(0.0) : .clear, in: RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
    }
    func cambiar(_ id: String, _ f: (inout Ventana) -> Void) {
        guard let i = ventanas.firstIndex(where: { $0.id == id }) else { return }
        f(&ventanas[i]); zTope += 1; ventanas[i].z = zTope
    }
    func alFrente(_ id: String) { cambiar(id) { _ in } }
    func abrir(_ id: String) {
        inicio = false
        if let i = ventanas.firstIndex(where: { $0.id == id }) { ventanas[i].min = false; alFrente(id); return }
        // ventana centrada en el espacio libre (entre los íconos y la barra), un poco escalonada si ya hay otras
        let n = CGFloat(ventanas.count % 5), libreAlto = area.height - 54
        let iconosAncho: CGFloat = area.width > area.height ? 350 : 0   // a la derecha de los íconos
        let tam = CGSize(width: min(640, max(320, area.width - iconosAncho - 90)), height: min(libreAlto - 30, max(260, libreAlto * 0.86)))
        zTope += 1
        ventanas.append(Ventana(id: id, pos: CGPoint(x: iconosAncho + (area.width - iconosAncho - 60) / 2 + n * 26, y: libreAlto / 2 + n * 16), tam: tam, z: zTope))
        acomodar()
    }
    /// que ninguna ventana quede afuera de la pantalla (al abrirla o al girar el teléfono)
    func acomodar() {
        let libreAlto = area.height - 54, isla: CGFloat = area.width > area.height ? 62 : 10   // la isla de la cámara al costado
        for i in ventanas.indices {
            var v = ventanas[i]
            v.tam.width = min(v.tam.width, area.width - 2 * isla); v.tam.height = min(v.tam.height, libreAlto - 12)
            v.pos.x = min(max(v.pos.x, v.tam.width / 2 + isla), area.width - v.tam.width / 2 - isla)
            v.pos.y = min(max(v.pos.y, v.tam.height / 2 + 6), libreAlto - v.tam.height / 2 - 6)
            if v != ventanas[i] { ventanas[i] = v }
        }
    }

    // ---------- barra de tareas ----------
    var barra: some View {
        HStack(spacing: 10) {
            Spacer(minLength: 0)
            Button { inicio.toggle() } label: {
                Image("Logo").resizable().renderingMode(.template).scaledToFit().frame(width: 24, height: 24)
                    .foregroundStyle(Color(red: 0.86, green: 0.72, blue: 0.4)).frame(width: 40, height: 40)
                    .background(inicio ? Color.white.opacity(0.14) : .clear, in: RoundedRectangle(cornerRadius: 9))
            }.buttonStyle(.plain)
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").font(.system(size: 12)).foregroundStyle(.secondary)
                TextField("Buscar", text: $buscar, onEditingChanged: { if $0 { inicio = true } }).font(.system(size: 13)).frame(width: 130)
            }
            .padding(.horizontal, 12).frame(height: 34).background(.white.opacity(0.08), in: Capsule())
            ForEach(["chat", "decidir", "objetivos", "libreta"], id: \.self) { id in
                let a = Self.apps.first { $0.id == id }!, abierta = ventanas.contains { $0.id == id }
                Button {
                    if let v = ventanas.first(where: { $0.id == id }) {
                        if v.min { cambiar(id) { $0.min = false } } else if v.z == zTope { cambiar(id) { $0.min = true } } else { alFrente(id) }
                    } else { abrir(id) }
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: a.icono).font(.system(size: 16, weight: .semibold)).foregroundStyle(.white).frame(width: 34, height: 30)
                            .background(LinearGradient(colors: [a.color, a.color.opacity(0.7)], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 8))
                        Capsule().fill(abierta ? Color.white.opacity(0.85) : .clear).frame(width: abierta ? 14 : 0, height: 3)
                    }
                    .frame(width: 44, height: 46)
                }.buttonStyle(.plain)
            }
            Spacer(minLength: 0)
            HStack(spacing: 12) {
                Image(systemName: "wifi").font(.system(size: 13))
                TimelineView(.periodic(from: .now, by: 30)) { _ in
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(F.bo("HH:mm")).font(.system(size: 12, weight: .semibold).monospacedDigit())
                        Text(F.bo("dd/MM/yyyy")).font(.system(size: 10).monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                Button { apagar() } label: { Image(systemName: "power").font(.system(size: 14, weight: .semibold)).frame(width: 34, height: 34) }.buttonStyle(.plain)
            }
            .padding(.trailing, 16)
        }
        .frame(height: 54)
        .background(.regularMaterial)
        .overlay(alignment: .top) { Rectangle().fill(.white.opacity(0.08)).frame(height: 1) }
    }

    // ---------- menú Inicio ----------
    var menuInicio: some View {
        let lista = Self.apps.filter { buscar.isEmpty || $0.nombre.localizedCaseInsensitiveContains(buscar) }
        return VStack(alignment: .leading, spacing: 12) {
            Text("APLICACIONES").font(.system(size: 10, weight: .bold)).tracking(1.2).foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 8) {
                ForEach(lista) { a in
                    Button { abrir(a.id) } label: {
                        VStack(spacing: 6) {
                            Image(systemName: a.icono).font(.system(size: 18, weight: .semibold)).foregroundStyle(.white).frame(width: 40, height: 40)
                                .background(a.color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            Text(a.nombre).font(.system(size: 11, weight: .medium)).lineLimit(2).multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                    }.buttonStyle(.plain)
                }
            }
            Divider().overlay(.white.opacity(0.1))
            HStack {
                Avatar(agente: "gerente", tam: 26)
                Text("Gerente").font(.system(size: 12, weight: .semibold))
                Spacer()
                Button { apagar() } label: { Label("Apagar", systemImage: "power").font(.system(size: 12, weight: .semibold)) }.buttonStyle(.bordered)
            }
        }
        .padding(16).frame(width: 380)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.white.opacity(0.1)))
        .shadow(color: .black.opacity(0.5), radius: 30, y: 12)
    }
}
