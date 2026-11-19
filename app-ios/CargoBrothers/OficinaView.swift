import SwiftUI
import SceneKit

/// La oficina 3D nativa: la nave y los muebles exportados de la oficina web (parte 1), el equipo con sus personajes (parte 2),
/// y las etiquetas redondas con foto que se tocan para abrir la ficha de cada agente (parte 3, 19/11).
/// Lo que viene: en vivo (4), zonas (5), manejar a Santi (6).
struct OficinaView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    @State private var escena: SCNScene?
    @State private var error: String?
    @State private var vista = 0
    @StateObject private var marcas = Marcas()
    @State private var elegido: String?
    @State private var vida: Comportamiento?
    @State private var junta = false
    @State private var santi: Manejo?
    @State private var manejando = false

    var body: some View {
        ZStack(alignment: .top) {
            Color(red: 0.07, green: 0.078, blue: 0.09).ignoresSafeArea()
            if let escena {
                VistaSCN(escena: escena, vista: vista, marcas: marcas, enfocar: manejando ? nil : elegido, manejo: santi, manejando: manejando) { elegido = $0 }.ignoresSafeArea()
                Etiquetas(marcas: marcas) { elegido = $0 }.environmentObject(store).ignoresSafeArea()
            }
            else if let error { Text(error).foregroundStyle(.white).padding() }
            else { ProgressView("Armando la oficina…").tint(.white).foregroundStyle(.white) }
            HStack(spacing: 8) {
                Button { cerrar() } label: { Image(systemName: "xmark").font(.headline).padding(11) }
                    .background(.ultraThinMaterial, in: Circle())
                LuzVivo(soloPunto: true).environmentObject(store)
                Spacer()
                if let santi { BotonManejar(manejo: santi) { on in elegido = nil; santi.manejar(on); manejando = on } }
                if vida != nil {
                    Button { junta.toggle(); vida?.junta = junta } label: {
                        Image(systemName: junta ? "person.3.fill" : "person.3").font(.subheadline.weight(.semibold)).padding(10)
                            .foregroundStyle(junta ? Color(red: 0.79, green: 0.64, blue: 0.36) : .white)
                    }
                    .background(.ultraThinMaterial, in: Circle())
                    .accessibilityLabel(junta ? "Terminar junta" : "Llamar a junta")
                }
                Button { elegido = nil; if manejando { santi?.manejar(false); manejando = false }; vista += 1 } label: { Label("Vista general", systemImage: "scope").font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 9) }
                    .background(.ultraThinMaterial, in: Capsule())
            }
            .padding(.horizontal, 14).padding(.top, 6)
            if let santi { ControlesSanti(manejo: santi) }
        }
        .preferredColorScheme(.dark)
        .onAppear { Orientacion.permitir(.allButUpsideDown) }
        .onDisappear { vida?.parar(); Vivo3D.vida = nil; santi?.manejar(false); Orientacion.permitir(.portrait) }
        .onChange(of: store.vivo?.actualizado) { _, _ in if let escena { Vivo3D.aplicar(escena, store) } }
        .onChange(of: store.datos?.generado) { _, _ in if let escena { Vivo3D.aplicar(escena, store) } }
        .sheet(item: Binding(get: { elegido.map { Elegido(id: $0) } }, set: { elegido = $0?.id })) { e in
            FichaAgente(agente: e.id).environmentObject(store)
                .presentationDetents([.height(330), .large])
                .presentationBackgroundInteraction(.enabled(upThrough: .height(330)))
                .presentationCornerRadius(28)
        }
        .task {
            guard escena == nil, let u = Bundle.main.url(forResource: "Oficina3D", withExtension: nil) else {
                if escena == nil { error = "No encontré el modelo de la oficina." }; return
            }
            let pers = Bundle.main.url(forResource: "Personas", withExtension: nil)
            let e = await Task.detached(priority: .userInitiated) { () -> SCNScene? in
                guard let e = try? Oficina3D.escena(carpeta: u) else { return nil }
                // las personas (solo en la Mac de Santi: son de Mixamo y no van al repo)
                if let pers { Personas3D.sentarEquipo(en: e.rootNode, carpeta: pers) }
                return e
            }.value
            if let e {
                escena = e
                if let pers {
                    let c = Comportamiento(escena: e, carpeta: pers)
                    c.animPuesto = { id in Vivo3D.animacion(id, store) }
                    vida = c; Vivo3D.vida = c
                    if let m = Manejo(escena: e, carpeta: pers) {
                        m.vida = c; c.manejo = m
                        m.abrirAgente = { id in elegido = id }
                        santi = m
                    }
                    c.empezar()
                }
                Vivo3D.aplicar(e, store)
            } else { error = "No pude armar la oficina." }
        }
    }
}

struct Elegido: Identifiable { let id: String }

/// Dónde cae en pantalla la cabeza de cada agente (lo actualiza la vista 3D unas 20 veces por segundo)
final class Marcas: ObservableObject {
    struct Marca: Equatable { var punto: CGPoint; var visible: Bool; var distancia: Float }
    @Published var puntos: [String: Marca] = [:]
}

/// Etiquetas redondas con foto, como en la idea que eligió Santi: foto, punto de estado y qué hace
struct Etiquetas: View {
    @ObservedObject var marcas: Marcas
    @EnvironmentObject var store: Store
    var tocar: (String) -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity).allowsHitTesting(false)
            ForEach(orden, id: \.self) { id in
                if let m = marcas.puntos[id], m.visible {
                    Button { tocar(id) } label: { etiqueta(id, distancia: apretados.contains(id) ? 99 : m.distancia).fixedSize().contentShape(Capsule()) }
                        .buttonStyle(.plain)
                        .position(x: m.punto.x, y: m.punto.y - 18)
                }
            }
        }
    }

    /// los más lejanos se dibujan primero (los cercanos quedan encima)
    var orden: [String] { marcas.puntos.keys.sorted { (marcas.puntos[$0]?.distancia ?? 0) > (marcas.puntos[$1]?.distancia ?? 0) } }

    /// los que tienen a otro al lado (en la junta, en el sofá) muestran solo la foto, para que no se tapen los nombres
    var apretados: Set<String> {
        let v = marcas.puntos.filter(\.value.visible)
        return Set(v.keys.filter { a in v.contains { b in b.key != a && abs(b.value.punto.x - v[a]!.punto.x) < 150 && abs(b.value.punto.y - v[a]!.punto.y) < 40 } })
    }

    /// de lejos solo la foto con su punto de estado; más cerca, el nombre; bien cerca, también lo que hace
    @ViewBuilder func etiqueta(_ id: String, distancia: Float) -> some View {
        let e = EstadoAgente.de(id, store)
        let bronce = Color(red: 0.79, green: 0.64, blue: 0.36)
        if distancia > 22 {
            Avatar(agente: id, tam: 26)
                .overlay(alignment: .bottomTrailing) { Circle().fill(e.color).frame(width: 9, height: 9).overlay(Circle().stroke(.black, lineWidth: 1.5)) }
                .shadow(color: .black.opacity(0.5), radius: 3, y: 1)
        } else {
            HStack(spacing: 6) {
                Avatar(agente: id, tam: 28)
                Circle().fill(e.color).frame(width: 7, height: 7)
                Text(Equipo.nombre(id)).font(.system(size: 11.5, weight: .semibold))
                if distancia < 12, !e.texto.isEmpty {
                    Text("· " + e.texto).font(.system(size: 11)).foregroundStyle(.white.opacity(0.65)).lineLimit(1).frame(maxWidth: 130, alignment: .leading)
                }
            }
            .foregroundStyle(.white)
            .padding(.leading, 3).padding(.trailing, 10).padding(.vertical, 3)
            .background(Color.black.opacity(0.78), in: Capsule())
            .overlay(Capsule().stroke(bronce.opacity(0.55), lineWidth: 1))
            .shadow(color: .black.opacity(0.4), radius: 4, y: 2)
        }
    }
}

/// Estado de un agente: en vivo si hay ronda; si no, según su última acción (como la oficina web)
struct EstadoAgente {
    var color: Color; var texto: String; var nombreEstado: String
    @MainActor static func de(_ id: String, _ store: Store) -> EstadoAgente {
        if id == "santi" { return EstadoAgente(color: Color(red: 0.95, green: 0.65, blue: 0.25), texto: "el jefe", nombreEstado: "jefe") }
        let rojo = Color(red: 0.93, green: 0.45, blue: 0.45), ambar = Color(red: 0.95, green: 0.65, blue: 0.25), verde = Color(red: 0.36, green: 0.77, blue: 0.56)
        if store.vivo?.enCurso == true, let a = store.vivo?.agentes?[id] {
            let c = a.estado == "trabajando" ? rojo : a.estado == "esperando" ? ambar : verde
            return EstadoAgente(color: c, texto: a.texto, nombreEstado: a.estado)
        }
        let ag = store.datos?.equipo.first { $0.agente == id }
        if let ag, ag.cuando.hasPrefix(F.bo("yyyy-MM-dd")) { return EstadoAgente(color: verde, texto: "trabajó hoy", nombreEstado: "sin trabajo ahora") }
        return EstadoAgente(color: verde, texto: "en espera", nombreEstado: "en espera")
    }
}

/// La ficha que sube al tocar un agente: foto, qué hace, sus números y los mismos botones de Equipo
struct FichaAgente: View {
    var agente: String
    @EnvironmentObject var store: Store
    @State private var tarea = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    let e = EstadoAgente.de(agente, store)
                    HStack(spacing: 14) {
                        Avatar(agente: agente, tam: 70)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(Equipo.nombre(agente)).font(.title2.weight(.semibold))
                            Label(e.nombreEstado, systemImage: "circle.fill").font(.subheadline.weight(.semibold)).foregroundStyle(e.color).imageScale(.small)
                        }
                    }
                    if let a = store.datos?.equipo.first(where: { $0.agente == agente }) {
                        Text(store.vivo?.enCurso == true ? (store.vivo?.agentes?[agente]?.texto ?? a.ultima) : a.ultima)
                            .font(.subheadline).foregroundStyle(Tema.gris).lineLimit(3)
                    }
                    HStack(spacing: 10) { ForEach(cifras, id: \.1) { v, t in cifra(v, t) } }
                    HStack(spacing: 8) {
                        NavigationLink { AgenteView(agente: agente) } label: { boton("Su pantalla", lleno: true) }
                        NavigationLink { ChatView(agente: agente) } label: { boton("Escribirle") }
                        Button { tarea = true } label: { boton("Encargar") }
                    }
                }
                .padding(20)
            }
            .background(Tema.fondo)
            .toolbar(.hidden, for: .navigationBar)
        }
        .sheet(isPresented: $tarea) { NavigationStack { TareaForm(agenteInicial: agente) }.environmentObject(store) }
    }

    /// tres números de su trabajo (los mismos que la pantalla de Equipo)
    var cifras: [(String, String)] {
        guard let d = store.datos else { return [] }
        let ag = d.equipo.first { $0.agente == agente }
        var c: [(String, String)] = [("\(ag?.acciones ?? 0)", "acciones en 7 días")]
        switch agente {
        case "wa":
            let w = d.whatsapp
            c += [("\(w?.lista_pedida ?? 0)/\((w?.lista_pedida ?? 0) + (w?.lista_faltan ?? 0))", "lista completa"),
                  (F.pct((w?.tasa_7d ?? 0) * 100), "respuesta 7 días")]
        case "ebay": c += [("\(d.cazador.topes.filter(\.bajo_tope).count)", "bajo el tope hoy"), (F.num(d.dolar.usado), "dólar USDT")]
        case "ana": c += [("\(d.productos.filter { $0.recomendacion == "traer" }.count)", "para traer"), (F.pct(d.productos.first?.margen), "mejor margen")]
        case "pedidos": c += [("\(d.pedidos.filter { !$0.entregado && !$0.esPrueba }.count)", "pedidos en camino"), (d.pedidos.first { !$0.esPrueba }?.estado ?? "—", "estado")]
        case "fin": c += [(F.bs(d.finanzas.invertido_bs), "invertido"), ("\(d.finanzas.unidades_vendidas ?? 0)", "vendidas")]
        case "gerente": c += [("\(d.decidir.count)", "por decidir"), ("\((d.libreta ?? []).filter { $0.estado == "abierta" }.count)", "notas abiertas")]
        default:
            let obs = d.objetivos.filter { $0.agente == agente }
            c += [("\(obs.filter { $0.progreso >= 1 }.count)/\(obs.count)", "objetivos")]
        }
        return c
    }

    func cifra(_ v: String, _ t: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(v).font(.headline.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.6)
            Text(t).font(.caption2).foregroundStyle(Tema.gris).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 12))
    }

    func boton(_ t: String, lleno: Bool = false) -> some View {
        Text(t).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 11)
            .background(lleno ? Tema.bronce : Tema.bronce.opacity(0.15), in: RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(lleno ? Tema.sobreAcento : Tema.bronce)
    }
}

/// SCNView con cámara tipo juego de estrategia (Santi, 19/11: "como el Clash of Clans"): un dedo arrastra el piso (con
/// inercia), pellizcar acerca hacia los dedos, dos dedos giran. La inclinación cambia sola con el zoom: de lejos se ve desde
/// arriba y de cerca más de costado. Manejando a Santi, un dedo gira alrededor de él y pellizcar acerca. Tocar a una persona la elige.
struct VistaSCN: UIViewRepresentable {
    let escena: SCNScene
    var vista: Int
    var marcas: Marcas
    var enfocar: String?
    var manejo: Manejo?
    var manejando: Bool
    var elegir: (String) -> Void

    static let objetivo = SCNVector3(-1, 0, 4)

    func makeUIView(context: Context) -> SCNView {
        let v = SCNView()
        v.scene = escena
        v.backgroundColor = .clear
        v.pointOfView = escena.rootNode.childNode(withName: "camara", recursively: false)
        v.allowsCameraControl = false
        v.showsStatistics = UserDefaults.standard.bool(forKey: "oficina_fps")
        v.delegate = context.coordinator
        v.isPlaying = true
        if let cam = v.pointOfView?.camera { cam.projectionDirection = .horizontal; cam.fieldOfView = 62 }
        Calidad.actual.aplicar(v)
        let co = context.coordinator
        co.vista = v; co.marcas = marcas; co.elegir = elegir
        let pan = UIPanGestureRecognizer(target: co, action: #selector(Coord.arrastrar(_:))); pan.maximumNumberOfTouches = 1
        let pel = UIPinchGestureRecognizer(target: co, action: #selector(Coord.pellizcar(_:)))
        let rot = UIRotationGestureRecognizer(target: co, action: #selector(Coord.rotar(_:)))
        let toque = UITapGestureRecognizer(target: co, action: #selector(Coord.tocar(_:)))
        let doble = UITapGestureRecognizer(target: co, action: #selector(Coord.dobleToque(_:))); doble.numberOfTapsRequired = 2
        toque.require(toFail: doble)
        for g in [pan, pel, rot, toque, doble] as [UIGestureRecognizer] { g.delegate = co; v.addGestureRecognizer(g) }
        co.inicio()
        return v
    }

    func updateUIView(_ v: SCNView, context: Context) {
        let co = context.coordinator
        co.marcas = marcas; co.elegir = elegir; co.manejo = manejo
        if v.bounds.size.width > 0 { co.tamano = v.bounds.size }
        if manejando != co.manejando {
            co.manejando = manejando
            if !manejando { co.leerCamara(); co.irAInicio() }
        }
        if vista != co.ultima { co.ultima = vista; co.irAInicio() }
        // al elegir un agente, la cámara vuela hasta él
        if let id = enfocar, id != co.enfocado,
           let n = escena.rootNode.childNode(withName: "persona-\(id)", recursively: false) ?? escena.rootNode.childNode(withName: "puesto-\(id)", recursively: false) {
            co.enfocado = id
            co.volar(a: SIMD2(Float(n.position.x), Float(n.position.z) + 0.6), dist: 7.5)
        }
        if enfocar == nil { co.enfocado = nil }
    }

    func makeCoordinator() -> Coord { Coord() }

    final class Coord: NSObject, SCNSceneRendererDelegate, UIGestureRecognizerDelegate {
        var ultima = 0; var enfocado: String?; var manejando = false
        weak var vista: SCNView?
        var marcas: Marcas?
        var elegir: ((String) -> Void)?
        weak var manejo: Manejo?

        // ---------- la cámara: mira a un punto del piso desde una distancia y un giro ----------
        var obj = SIMD2<Float>(-1, 4), dist: Float = 29, giro: Float = 0.53
        var objD = SIMD2<Float>(-1, 4), distD: Float = 29, giroD: Float = 0.53
        var vel = SIMD2<Float>(0, 0)
        private var link: CADisplayLink?, ultimoT: CFTimeInterval = 0
        static let DMIN: Float = 4.5, DMAX: Float = 46
        @MainActor var apaisado: Bool { guard let b = vista?.bounds, b.width > 0 else { return false }; return b.width > b.height }
        private var eraApaisado: Bool?
        func inclinacion(_ d: Float) -> Float { 0.55 + (min(max(d, Self.DMIN), Self.DMAX) - Self.DMIN) / (Self.DMAX - Self.DMIN) * 0.55 }

        @MainActor func inicio() {
            irAInicio(); obj = objD; dist = distD; giro = giroD; aplicar()
            let l = CADisplayLink(target: self, selector: #selector(tic(_:))); l.preferredFrameRateRange = Calidad.actual.rango
            l.add(to: .main, forMode: .common); link = l
        }
        @MainActor func irAInicio() { objD = SIMD2(-1, 4); distD = apaisado ? 30 : 29; giroD = 0.53; vel = .zero }
        @MainActor func volar(a p: SIMD2<Float>, dist d: Float) { objD = p; distD = d; vel = .zero }
        func limitar(_ p: SIMD2<Float>) -> SIMD2<Float> { SIMD2(min(30, max(-16, p.x)), min(20, max(-17, p.y))) }

        @MainActor @objc func tic(_ l: CADisplayLink) {
            guard vista?.window != nil else { if vista == nil { l.invalidate() }; return }
            let dt = Float(ultimoT == 0 ? 1.0 / 60 : min(0.05, l.timestamp - ultimoT)); ultimoT = l.timestamp
            guard !manejando else { return }
            if simd_length(vel) > 0.01 { objD = limitar(objD + vel * dt); vel *= exp(-dt * 3.2) } else { vel = .zero }
            let k = 1 - exp(-dt * 9)
            obj += (objD - obj) * k; dist += (distD - dist) * k
            var dg = giroD - giro; dg = atan2(sin(dg), cos(dg)); giro += dg * k
            aplicar()
        }
        @MainActor func aplicar() {
            guard let c = vista?.pointOfView else { return }
            // vertical: el ángulo se mide a lo ancho; echado, a lo alto (si no, se ve todo muy de cerca)
            let ap = apaisado
            if ap != eraApaisado, let cam = c.camera {
                if eraApaisado != nil { distD = ap ? 30 : 29 }
                eraApaisado = ap
                cam.projectionDirection = ap ? .vertical : .horizontal
                cam.fieldOfView = ap ? 50 : 62
            }
            let inc = inclinacion(dist)
            c.position = SCNVector3(obj.x + sin(giro) * cos(inc) * dist, sin(inc) * dist, obj.y + cos(giro) * cos(inc) * dist)
            c.look(at: SCNVector3(obj.x, 0, obj.y), up: SCNVector3(0, 1, 0), localFront: SCNVector3(0, 0, -1))
        }
        /// al dejar de manejar: arranca desde donde quedó la cámara detrás de Santi, sin saltos
        @MainActor func leerCamara() {
            guard let c = vista?.pointOfView, let p = suelo(CGPoint(x: tamano.width / 2, y: tamano.height / 2)) else { return }
            let cp = SIMD3<Float>(Float(c.position.x), Float(c.position.y), Float(c.position.z))
            obj = p; dist = min(Self.DMAX, max(Self.DMIN, simd_length(cp - SIMD3(p.x, 0, p.y)))); giro = atan2(cp.x - p.x, cp.z - p.y)
            objD = obj; distD = dist; giroD = giro
        }
        /// el punto del piso que está debajo de un punto de la pantalla
        @MainActor func suelo(_ s: CGPoint) -> SIMD2<Float>? {
            guard let v = vista else { return nil }
            let a = v.unprojectPoint(SCNVector3(Float(s.x), Float(s.y), 0)), b = v.unprojectPoint(SCNVector3(Float(s.x), Float(s.y), 1))
            let dy = Float(b.y - a.y); guard dy < -0.0001 else { return nil }
            let t = -Float(a.y) / dy
            return SIMD2(Float(a.x) + Float(b.x - a.x) * t, Float(a.z) + Float(b.z - a.z) * t)
        }

        // ---------- gestos ----------
        private var ultimoDedo: CGPoint = .zero, distInicial: Float = 29, giroInicial: Float = 0
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool {
            (g is UIPinchGestureRecognizer && o is UIRotationGestureRecognizer) || (g is UIRotationGestureRecognizer && o is UIPinchGestureRecognizer)
        }
        @MainActor @objc func arrastrar(_ g: UIPanGestureRecognizer) {
            guard let v = vista else { return }
            if manejando, let m = manejo {   // alrededor de Santi
                let d = g.translation(in: v); g.setTranslation(.zero, in: v)
                m.giro -= Float(d.x) * 0.008
                m.alto = min(1.25, max(0.08, m.alto + Float(d.y) * 0.005))
                return
            }
            let p = g.location(in: v)
            switch g.state {
            case .began: ultimoDedo = p; vel = .zero; objD = obj; distD = dist; giroD = giro
            case .changed:
                // el piso que tocaste queda debajo del dedo
                if let a = suelo(ultimoDedo), let b = suelo(p) { obj = limitar(obj + (a - b)); objD = obj; aplicar() }
                ultimoDedo = p
            case .ended, .cancelled:
                let vp = g.velocity(in: v), c = CGPoint(x: p.x, y: p.y)
                if let a = suelo(c), let b = suelo(CGPoint(x: c.x + vp.x * 0.1, y: c.y + vp.y * 0.1)) { vel = (a - b) * 10 * 0.55 }
                let lim: Float = 40; if simd_length(vel) > lim { vel = simd_normalize(vel) * lim }
            default: break
            }
        }
        @MainActor @objc func pellizcar(_ g: UIPinchGestureRecognizer) {
            if manejando, let m = manejo {
                if g.state == .began { distInicial = m.dist }
                m.dist = min(14, max(2.5, distInicial / Float(g.scale))); return
            }
            guard let v = vista else { return }
            switch g.state {
            case .began: distInicial = dist; vel = .zero
            case .changed:
                // acerca hacia los dedos: el punto entre los dedos se queda quieto en la pantalla
                let c = g.location(in: v), antes = suelo(c)
                dist = min(Self.DMAX, max(Self.DMIN, distInicial / Float(g.scale))); distD = dist; aplicar()
                if let a = antes, let b = suelo(c) { obj = limitar(obj + (a - b)); objD = obj; aplicar() }
            default: break
            }
        }
        @MainActor @objc func rotar(_ g: UIRotationGestureRecognizer) {
            if manejando, let m = manejo { m.giro -= Float(g.rotation); g.rotation = 0; return }
            guard let v = vista else { return }
            let c = g.location(in: v), antes = suelo(c)
            giro -= Float(g.rotation); g.rotation = 0; giroD = giro; aplicar()
            if let a = antes, let b = suelo(c) { obj = limitar(obj + (a - b)); objD = obj; aplicar() }
        }
        /// doble toque: acerca ahí (o se aleja si ya está cerca)
        @MainActor @objc func dobleToque(_ g: UITapGestureRecognizer) {
            guard !manejando, let v = vista, let p = suelo(g.location(in: v)) else { return }
            volar(a: limitar(p), dist: dist > 12 ? 9 : 24)
        }

        private var ultimoCalculo: TimeInterval = 0
        /// tamaño de la pantalla (se guarda desde el hilo principal; leerlo desde el de dibujo con sync trababa todo)
        var tamano = CGSize(width: 400, height: 870)

        /// unas 20 veces por segundo: dónde cae en pantalla la cabeza de cada agente
        func renderer(_ r: SCNSceneRenderer, updateAtTime t: TimeInterval) {
            guard t - ultimoCalculo > 0.05, let cam = r.pointOfView, let marcas else { return }
            ultimoCalculo = t
            var out: [String: Marcas.Marca] = [:]
            let tam = tamano
            for (id, x, z) in Detalle3D.puestos + [("santi", Manejo.SILLA.0, Manejo.SILLA.1)] {
                let base = r.scene?.rootNode.childNode(withName: "persona-\(id)", recursively: false)
                let cabeza = base.map { SCNVector3($0.position.x, 1.55, $0.position.z) } ?? SCNVector3(x, 1.5, z + 0.9)
                let p = r.projectPoint(cabeza)
                let cp = cam.presentation.position
                let d = SCNVector3(cabeza.x - cp.x, cabeza.y - cp.y, cabeza.z - cp.z)
                let dist = sqrt(d.x * d.x + d.y * d.y + d.z * d.z)
                let visible = p.z > 0 && p.z < 1 && p.x > -40 && p.y > 40 && Double(p.x) < Double(tam.width) + 40 && Double(p.y) < Double(tam.height) - 20
                out[id] = .init(punto: CGPoint(x: CGFloat(p.x), y: CGFloat(p.y)), visible: visible, distancia: Float(dist))
            }
            DispatchQueue.main.async { if marcas.puntos != out { marcas.puntos = out } }
        }

        /// tocar el cuerpo de un agente o su escritorio lo elige
        @MainActor @objc func tocar(_ g: UITapGestureRecognizer) {
            guard let v = vista else { return }
            let hits = v.hitTest(g.location(in: v), options: [.searchMode: SCNHitTestSearchMode.all.rawValue, .ignoreHiddenNodes: true])
            for h in hits {
                var n: SCNNode? = h.node
                while let x = n {
                    if let nm = x.name, nm != "persona-santi", nm.hasPrefix("persona-") || nm.hasPrefix("puesto-") {
                        elegir?(String(nm.split(separator: "-", maxSplits: 1)[1])); return
                    }
                    n = x.parent
                }
            }
        }
    }
}

/// Parte 4 (19/11): cada agente hace lo que de verdad está haciendo y su monitor muestra sus datos.
@MainActor
enum Vivo3D {
    static var actual: [String: String] = [:]
    static weak var vida: Comportamiento?

    /// ¿está en su puesto o anda libre? (como la oficina web: el Gerente siempre en su puesto; en ronda, todos a trabajar)
    static func destino(_ id: String, _ store: Store) -> String {
        if id == "gerente" || store.vivo?.enCurso == true { return "puesto" }
        return "lugar"
    }

    /// qué animación toca: teclear si trabaja; si espera o no tiene trabajo, relajado en la silla (a veces café o risa)
    static func animacion(_ id: String, _ store: Store) -> String {
        if store.vivo?.enCurso == true {
            switch store.vivo?.agentes?[id]?.estado {
            case "trabajando": return "teclear"
            case "esperando": return "sentado"
            default: return "reir_sentado"
            }
        }
        return id == "gerente" ? "teclear" : "sentado"   // el Gerente siempre está en su puesto, como en la oficina web
    }

    static func aplicar(_ e: SCNScene, _ store: Store) {
        let pers = Bundle.main.url(forResource: "Personas", withExtension: nil)
        for (k, (id, _, _)) in Detalle3D.puestos.enumerated() {
            if let v = vida { v.quiere[id] = destino(id, store) }
            else if let pers, let p = e.rootNode.childNode(withName: "persona-\(id)", recursively: false) {
                let a = animacion(id, store)
                if actual[id] != a { Personas3D.animar(p, a, carpeta: pers, desfase: Double(k) * 0.77); actual[id] = a }
            }
            // monitor con sus datos
            if let scr = e.rootNode.childNode(withName: "pantalla-\(id)-0", recursively: true), let img = pantalla(id, store) {
                scr.geometry?.firstMaterial?.diffuse.contents = img
                scr.geometry?.firstMaterial?.emission.contents = img
            }
        }
    }

    /// la pantalla del puesto: nombre, estado, lo último que hizo y sus acciones de la semana
    static func pantalla(_ id: String, _ store: Store) -> UIImage? {
        let est = EstadoAgente.de(id, store)
        let ag = store.datos?.equipo.first { $0.agente == id }
        let tam = CGSize(width: 640, height: 360)
        return UIGraphicsImageRenderer(size: tam).image { c in
            UIColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 1).setFill(); c.fill(CGRect(origin: .zero, size: tam))
            let bronce = UIColor(red: 0.79, green: 0.64, blue: 0.36, alpha: 1)
            bronce.setFill(); c.fill(CGRect(x: 0, y: 0, width: tam.width, height: 6))
            (Equipo.nombre(id).uppercased() as NSString).draw(at: CGPoint(x: 28, y: 26), withAttributes: [.font: UIFont.systemFont(ofSize: 30, weight: .bold), .foregroundColor: UIColor.white])
            UIColor(est.color).setFill(); c.cgContext.fillEllipse(in: CGRect(x: 30, y: 80, width: 16, height: 16))
            (est.nombreEstado as NSString).draw(at: CGPoint(x: 56, y: 74), withAttributes: [.font: UIFont.systemFont(ofSize: 22, weight: .semibold), .foregroundColor: UIColor(est.color)])
            let texto = (store.vivo?.enCurso == true ? store.vivo?.agentes?[id]?.texto : nil) ?? ag?.ultima ?? ""
            (texto as NSString).draw(in: CGRect(x: 28, y: 116, width: tam.width - 56, height: 120),
                                     withAttributes: [.font: UIFont.systemFont(ofSize: 20), .foregroundColor: UIColor(white: 0.75, alpha: 1)])
            // barras: acciones de los últimos 7 días
            let serie = ag?.serie ?? []
            let maxV = CGFloat(max(serie.max() ?? 1, 1))
            for (i, v) in serie.enumerated() {
                let h = CGFloat(v) / maxV * 80
                (i == serie.count - 1 ? bronce : UIColor(red: 0.31, green: 0.82, blue: 0.91, alpha: 1)).setFill()
                c.fill(CGRect(x: 28 + CGFloat(i) * 46, y: 330 - h, width: 32, height: max(h, 3)))
            }
            ("\(ag?.acciones ?? 0) acciones en 7 días" as NSString).draw(at: CGPoint(x: 370, y: 300), withAttributes: [.font: UIFont.systemFont(ofSize: 18, weight: .medium), .foregroundColor: bronce])
        }
    }
}

/// Botón "Manejar a Santi" de la barra de arriba
struct BotonManejar: View {
    @ObservedObject var manejo: Manejo
    var cambiar: (Bool) -> Void
    var body: some View {
        Button { cambiar(!manejo.manejando) } label: {
            Image(systemName: manejo.manejando ? "figure.walk.circle.fill" : "figure.walk").font(.subheadline.weight(.semibold)).padding(10)
                .foregroundStyle(manejo.manejando ? Color(red: 0.79, green: 0.64, blue: 0.36) : .white)
        }
        .background(.ultraThinMaterial, in: Circle())
        .accessibilityLabel(manejo.manejando ? "Dejar de manejar a Santi" : "Manejar a Santi")
    }
}

/// Joystick abajo a la izquierda y el botón de lo que hay cerca, abajo al centro
struct ControlesSanti: View {
    @ObservedObject var manejo: Manejo
    var body: some View {
        if manejo.manejando {
            VStack {
                Spacer()
                if let o = manejo.opcion {
                    Button { manejo.usarOpcion() } label: {
                        Text(o.texto).font(.subheadline.weight(.semibold)).lineLimit(1)
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .background(o.activa ? Color(red: 0.95, green: 0.65, blue: 0.25) : Color.gray.opacity(0.5), in: Capsule())
                            .foregroundStyle(Color(red: 0.06, green: 0.06, blue: 0.06))
                            .shadow(color: .black.opacity(0.45), radius: 8, y: 4)
                    }
                    .disabled(!o.activa)
                    .padding(.bottom, 8)
                    .transition(.opacity)
                }
                HStack(alignment: .bottom) {
                    Joystick { manejo.joy = $0 }
                    Spacer()
                    Button { manejo.corriendo.toggle() } label: {
                        VStack(spacing: 3) {
                            Image(systemName: "figure.run").font(.title2.weight(.semibold))
                            Text(manejo.corriendo ? "Corriendo" : "Correr").font(.caption2.weight(.semibold))
                        }
                        .frame(width: 84, height: 84)
                        .foregroundStyle(manejo.corriendo ? Color(red: 0.06, green: 0.06, blue: 0.06) : .white)
                        .background(manejo.corriendo ? AnyShapeStyle(Color(red: 0.95, green: 0.65, blue: 0.25)) : AnyShapeStyle(.ultraThinMaterial), in: Circle())
                        .overlay(Circle().stroke(Color.white.opacity(0.18), lineWidth: 1))
                    }
                    .sensoryFeedback(.selection, trigger: manejo.corriendo)
                    .accessibilityLabel(manejo.corriendo ? "Dejar de correr" : "Correr")
                    .padding(.bottom, 16)
                }
                .padding(.horizontal, 24).padding(.bottom, 30)
            }
        }
    }
}
