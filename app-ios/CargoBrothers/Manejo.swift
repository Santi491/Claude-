import SwiftUI
import SceneKit

/// Parte 6 (19/11): "Manejar a Santi", como en la oficina web. Santi está sentado en su escritorio; con el botón se para y
/// camina con el joystick, chocando con paredes, muebles y personas. La cámara lo sigue desde atrás (un dedo la gira,
/// pellizcar acerca). El botón de abajo hace lo que tiene cerca: ver la computadora de un agente, saludar, sentarse en
/// un sofá, en su silla o en la mesa de reuniones (la cabecera es suya), correr en la cinta o levantar pesas.
@MainActor
final class Manejo: ObservableObject {
    struct Opcion: Equatable { let texto: String; let activa: Bool; let clave: String }

    static let SANTI: (Float, Float) = (-9, -6.2)
    nonisolated static let SILLA: (Float, Float) = (-9, -7.1)
    /// la nave (x de -15 a 29, z de -10 a 19) y el cobertizo de paquetería detrás del muro del fondo
    static let XL: Float = -15, XR: Float = 29, ZB: Float = -10, ZF: Float = 19
    static let CABECERA = Comportamiento.Silla(x: 3 + 2.8, z: -6.4, rot: -.pi / 2, pts: [])

    @Published var manejando = false
    @Published var opcion: Opcion?
    /// el joystick: x a la derecha, y hacia abajo, de -1 a 1
    var joy = CGVector.zero
    /// cámara detrás de Santi
    var giro: Float = 0, alto: Float = 0.5, dist: Float = 5.4

    let escena: SCNScene, carpeta: URL, nodo: SCNNode
    weak var vida: Comportamiento?
    var camara: SCNNode? { escena.rootNode.childNode(withName: "camara", recursively: false) }
    var abrirAgente: (String) -> Void = { _ in }

    private var anim = ""
    /// lo que está haciendo (sentado, en la cinta…): dónde estaba antes y en qué fase va
    private struct Accion { var clave: String; var previo: SCNVector3; var asiento: (Float, Float, Float)?; var fase = ""; var t: Double = 0; var anim: String; var silla = false }
    private var accion: Accion?
    private var opciones: [String: () -> Void] = [:]
    private var saludo: (id: String, t: Double)?

    init?(escena: SCNScene, carpeta: URL) {
        guard let p = try? Personas3D.persona(Personas3D.modelos["santi"] ?? 1, carpeta: carpeta) else { return nil }
        self.escena = escena; self.carpeta = carpeta; self.nodo = p
        p.name = "persona-santi"
        escena.rootNode.addChildNode(p)
        sentarEnSuSilla()
    }

    func sentarEnSuSilla() {
        nodo.position = SCNVector3(Self.SILLA.0, 0, Self.SILLA.1); nodo.eulerAngles.y = 0
        poner("teclear")
    }

    private func poner(_ n: String, bucle: Bool = true) {
        guard n != anim || !bucle else { return }
        anim = n
        Personas3D.animar(nodo, n, carpeta: carpeta, desfase: 0, bucle: bucle, fundido: 0.3)
    }

    func manejar(_ on: Bool) {
        manejando = on
        accion = nil; opcion = nil
        vida?.reservado = nil
        if on {
            nodo.position = SCNVector3(Self.SANTI.0 + 2.8, 0, Self.SANTI.1 - 1.2); nodo.eulerAngles.y = .pi / 2
            poner("quieto")
            giro = .pi / 2 + .pi; alto = 0.5; dist = 5.4
        } else { sentarEnSuSilla() }
    }

    // ---------- cada cuadro (lo llama Comportamiento) ----------
    func paso(_ dt: Double) {
        if let s = saludo { if s.t - dt <= 0 { saludo = nil } else { saludo = (s.id, s.t - dt) } }
        guard manejando else { return }
        let fx = Float(joy.dx), fz = Float(joy.dy), mag = min(1, (fx * fx + fz * fz).squareRoot())
        if accion != nil {
            if mag > 0.3 { terminar() }
            avanzarAccion(dt)
        } else if mag > 0.12 {
            // adelante = hacia donde mira la cámara
            let cp = camara?.presentation.position ?? SCNVector3(0, 0, 0), p = nodo.position
            var ax = Float(p.x - cp.x), az = Float(p.z - cp.z); let n = max(0.001, (ax * ax + az * az).squareRoot()); ax /= n; az /= n
            let rx = -az, rz = ax
            var mx = rx * fx - ax * fz, mz = rz * fx - az * fz; let m = max(0.001, (mx * mx + mz * mz).squareRoot()); mx /= m; mz /= m
            let v = (mag > 0.9 ? 2.4 : 1.45 * max(0.5, mag)) * Float(dt)
            let otros = otrosPuntos()
            let x0 = Float(p.x), z0 = Float(p.z)
            let atascado = choca(x0, z0, otros)   // si quedó metido en algo, puede salir hacia cualquier lado
            var nx = x0, nz = z0
            if atascado || !choca(x0 + mx * v, z0, otros) { nx = x0 + mx * v }
            if atascado || !choca(nx, z0 + mz * v, otros) { nz = z0 + mz * v }
            nodo.position = SCNVector3(nx, 0, nz)
            var dr = atan2(mx, mz) - Float(nodo.eulerAngles.y); dr = atan2(sin(dr), cos(dr))
            nodo.eulerAngles.y += .init(dr * min(1, Float(dt) * 12))
            poner("caminar")
        } else { poner("quieto") }
        actualizarOpcion()
        seguir(dt)
    }

    private func otrosPuntos() -> [(Float, Float)] {
        (vida?.agentes.values.map { (Float($0.nodo.position.x), Float($0.nodo.position.z)) }) ?? []
    }

    func choca(_ x: Float, _ z: Float, _ otros: [(Float, Float)]) -> Bool {
        let r: Float = 0.25
        let enNave = x > Self.XL + r && x < Self.XR - r && z > Self.ZB + r && z < Self.ZF - r
        let enCobertizo = x > 12 + r && x < 23 - r && z > -17 + r && z < Self.ZB + 0.3
        if !enNave && !enCobertizo { return true }
        if Oficina3D.solidos.contains(where: { x > $0.x - r && x < $0.y + r && z > $0.z - r && z < $0.w + r }) { return true }
        return otros.contains { ($0.0 - x) * ($0.0 - x) + ($0.1 - z) * ($0.1 - z) < 0.55 * 0.55 }
    }

    /// la cámara va detrás, suave
    private func seguir(_ dt: Double) {
        guard let c = camara else { return }
        let p = nodo.position
        let obj = SCNVector3(Float(p.x) + sin(giro) * cos(alto) * dist, sin(alto) * dist + 0.3, Float(p.z) + cos(giro) * cos(alto) * dist)
        let k = Float(1 - exp(-dt * 5))
        c.position = SCNVector3(Float(c.position.x) + (Float(obj.x) - Float(c.position.x)) * k,
                                Float(c.position.y) + (Float(obj.y) - Float(c.position.y)) * k,
                                Float(c.position.z) + (Float(obj.z) - Float(c.position.z)) * k)
        c.look(at: SCNVector3(p.x, 1.2, p.z), up: SCNVector3(0, 1, 0), localFront: SCNVector3(0, 0, -1))
    }

    // ---------- qué hay cerca ----------
    private func actualizarOpcion() {
        var mejor: (d: Float, o: Opcion, f: () -> Void)?
        func add(_ d: Float, _ r: Float, _ txt: String, activa: Bool = true, extra: Float = 0, _ f: @escaping () -> Void) {
            guard d < r else { return }
            let k = d / r + extra
            if mejor == nil || k < mejor!.d { mejor = (k, Opcion(texto: txt, activa: activa, clave: txt), f) }
        }
        if let a = accion {
            let txt = a.asiento != nil || a.silla ? "Pararte" : "Dejar de " + (a.anim == "cinta" ? "correr" : "entrenar")
            publicar(Opcion(texto: txt, activa: true, clave: txt), terminar); return
        }
        let s = (Float(nodo.position.x), Float(nodo.position.z))
        let d: (Float, Float) -> Float = { x, z in ((s.0 - x) * (s.0 - x) + (s.1 - z) * (s.1 - z)).squareRoot() }
        let ocupados = Set(vida?.agentes.values.compactMap(\.spot) ?? [])
        let sillasJ = Set(vida?.agentes.values.compactMap(\.sillaJ) ?? [])
        for (id, x, z) in Detalle3D.puestos {
            add(d(x, z + 1.25), 1.5, "Ver la computadora de \(Equipo.nombre(id))") { [weak self] in self?.abrirAgente(id) }
            if let a = vida?.agentes[id], a.donde == "lugar", let L = a.spot.flatMap({ Comportamiento.LUGAR[$0] }), !L.sentado, a.spot != "cinta" {
                add(d(Float(a.nodo.position.x), Float(a.nodo.position.z)), 1.6, "Saludar a \(Equipo.nombre(id))", extra: 0.1) { [weak self] in self?.saludar(id) }
            }
        }
        add(d(Self.SILLA.0, Self.SILLA.1), 1.3, "Sentarte en tu silla", extra: -0.3) { [weak self] in self?.sentarEnTuSilla() }
        for (k, L) in Comportamiento.LUGAR {
            guard let txt = Self.TEXTO[k] else { continue }
            let c = Self.CENTRO[k] ?? (L.x, L.z), libre = !ocupados.contains(k)
            add(d(c.0, c.1), 1.4, libre ? txt : "\(txt): ocupado", activa: libre) { [weak self] in if libre { self?.usar(k, L) } }
        }
        for (k, (x, z, rot, cx, cz)) in Self.SANTI_SILLONES {
            add(d(cx, cz), 1.4, "Sentarte en el sillón") { [weak self] in self?.sentar(k, x, z, rot, "sentado") }
        }
        for (i, S) in Comportamiento.JUNTA.enumerated() {
            let f = Comportamiento.adelante(S.rot), libre = !sillasJ.contains(i)
            add(d(S.x - 0.45 * f.0, S.z - 0.45 * f.1), 1.0, libre ? "Sentarte a la mesa" : "Silla ocupada", activa: libre) { [weak self] in
                if libre { self?.sentar("junta\(i)", S.x, S.z, S.rot, "sentado") } }
        }
        let C = Self.CABECERA, fc = Comportamiento.adelante(C.rot)
        add(d(C.x - 0.45 * fc.0, C.z - 0.45 * fc.1), 1.0, "Sentarte a la cabecera") { [weak self] in self?.sentar("cabecera", C.x, C.z, C.rot, "sentado") }
        if let m = mejor { publicar(m.o, m.f) } else if opcion != nil { opcion = nil; opciones = [:] }
    }
    private func publicar(_ o: Opcion, _ f: @escaping () -> Void) {
        opciones = [o.clave: f]
        if opcion != o { opcion = o }
    }
    func usarOpcion() { if let o = opcion, o.activa { opciones[o.clave]?() } }

    static let TEXTO: [String: String] = ["sofa1": "Sentarte en el sofá", "sofa2": "Sentarte en el sofá", "sofa3": "Sentarte en el sofá",
        "sillon": "Sentarte en el sillón", "rincon1": "Sentarte en el sillón", "rincon2": "Sentarte en el sillón",
        "espera1": "Sentarte en el sillón", "espera2": "Sentarte en el sillón", "cinta": "Correr en la cinta", "pesas": "Levantar pesas"]
    /// centro de los asientos que no quedan justo detrás del punto de llegada (como cx/cz de la web)
    static let CENTRO: [String: (Float, Float)] = ["rincon1": (25.6, -5.6), "rincon2": (27.6, -5.6), "espera1": (-4.3, 17.0), "espera2": (-2.1, 17.0)]
    /// los dos sillones de la oficina de Santi (solo para él): x, z, giro, centro
    static let SANTI_SILLONES: [String: (Float, Float, Float, Float, Float)] = ["santi1": (-4.6, -8.28, 0, -4.6, -8.7), "santi2": (-4.6, -6.92, .pi, -4.6, -6.5)]

    // ---------- acciones ----------
    private func usar(_ k: String, _ L: Comportamiento.Lugar) {
        if L.sentado { sentar(k, L.x, L.z, L.rot, "sentado"); return }
        accion = Accion(clave: k, previo: nodo.position, anim: L.anims[0])
        vida?.reservado = k
        nodo.position = SCNVector3(L.x, L.y, L.z); nodo.eulerAngles.y = .init(L.rot)
        poner(L.anims[0])
    }
    private func sentar(_ k: String, _ x: Float, _ z: Float, _ rot: Float, _ n: String) {
        accion = Accion(clave: k, previo: nodo.position, asiento: (x, z, rot), fase: "sentandose", t: 2.0, anim: n)
        if Comportamiento.LUGAR[k] != nil { vida?.reservado = k }
        if k.hasPrefix("junta"), let i = Int(k.dropFirst(5)) { vida?.sillaSanti = i }
        nodo.position = SCNVector3(x, 0, z); nodo.eulerAngles.y = .init(rot)
        poner("sentarse", bucle: false)
    }
    private func sentarEnTuSilla() {
        accion = Accion(clave: "silla", previo: nodo.position, anim: "teclear", silla: true)
        sentarEnSuSilla()
    }
    private func avanzarAccion(_ dt: Double) {
        guard var a = accion else { return }
        a.t -= dt
        if a.fase == "sentandose", a.t <= 0, let s = a.asiento {
            let f = Comportamiento.adelante(s.2)
            nodo.position = SCNVector3(s.0 - Comportamiento.RETRO * f.0, 0, s.1 - Comportamiento.RETRO * f.1)
            a.fase = ""; poner(a.anim)
        } else if a.fase == "parandose", a.t <= 0 {
            accion = nil; vida?.reservado = nil; vida?.sillaSanti = nil; poner("quieto"); return
        }
        accion = a
    }
    private func terminar() {
        guard var a = accion, a.fase != "parandose" else { return }
        if let s = a.asiento {
            nodo.position = SCNVector3(s.0, 0, s.1)
            a.fase = "parandose"; a.t = 1.8; accion = a
            poner("pararse", bucle: false)
        } else {
            nodo.position = a.previo
            accion = nil; vida?.reservado = nil; poner("quieto")
        }
    }
    /// el agente se da vuelta hacia Santi, le habla y se abre su ficha
    private func saludar(_ id: String) {
        guard let a = vida?.agentes[id] else { return }
        let dx = Float(nodo.position.x - a.nodo.position.x), dz = Float(nodo.position.z - a.nodo.position.z)
        a.nodo.eulerAngles.y = .init(atan2(dx, dz))
        vida?.reproducir(a, "hablar", bucle: true)
        a.tAnim = 5
        nodo.eulerAngles.y = .init(atan2(-dx, -dz))
        saludo = (id, 5)
        abrirAgente(id)
    }
}

/// Joystick para el pulgar: arrastrar desde el centro; soltar lo frena
struct Joystick: View {
    var cambiar: (CGVector) -> Void
    @State private var punta = CGSize.zero
    let radio: CGFloat = 52
    var body: some View {
        ZStack {
            Circle().fill(.ultraThinMaterial).frame(width: radio * 2 + 24, height: radio * 2 + 24)
                .overlay(Circle().stroke(Color.white.opacity(0.18), lineWidth: 1))
            Circle().fill(Color.white.opacity(0.85)).frame(width: 46, height: 46)
                .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
                .offset(punta)
        }
        .contentShape(Circle())
        .gesture(DragGesture(minimumDistance: 0)
            .onChanged { g in
                var v = g.translation; let l = (v.width * v.width + v.height * v.height).squareRoot()
                if l > radio { v = CGSize(width: v.width / l * radio, height: v.height / l * radio) }
                punta = v; cambiar(CGVector(dx: v.width / radio, dy: v.height / radio))
            }
            .onEnded { _ in withAnimation(.spring(duration: 0.25)) { punta = .zero }; cambiar(.zero) })
        .accessibilityLabel("Joystick para caminar")
    }
}
