import Foundation
import SceneKit
import QuartzCore

/// Parte 5 (19/11): la vida de la oficina, igual que en la web (oficina3d.js): cuando un agente no tiene trabajo se levanta,
/// sale por el pasillo y va a un lugar libre (lounge, barra de café, gym, mapa, pasillo, recepción, paquetería); cada tanto
/// cambia de lugar; cuando le llega trabajo vuelve a su puesto. "Llamar a junta" los sienta a todos en la sala de reuniones.
@MainActor
final class Comportamiento {
    // ---------- el plano (mismas medidas que la oficina web) ----------
    static let PASILLO_X: Float = 8.6, FRENTE_Z: Float = -1.6, VELOCIDAD: Float = 1.3
    /// cuánto se corre hacia atrás el cuerpo al sentarse (la animación "sentarse" de Mixamo)
    static let RETRO: Float = 0.48

    struct Lugar {
        let zona: String, grupo: String, pts: [(Float, Float)], x: Float, z: Float, rot: Float, sentado: Bool, anims: [String], y: Float
        init(_ zona: String, _ grupo: String, _ pts: [(Float, Float)], _ x: Float, _ z: Float, _ rot: Float, sentado: Bool = false, _ anims: [String], y: Float = 0) {
            self.zona = zona; self.grupo = grupo; self.pts = pts; self.x = x; self.z = z; self.rot = rot; self.sentado = sentado; self.anims = anims; self.y = y
        }
    }
    static let F = FRENTE_Z
    static let LUGAR: [String: Lugar] = [
        "sofa1": .init("lounge", "sofa", [(11.45, F), (11.45, -6.97)], 11.6, -6.97, 0, sentado: true, ["cafe", "sentado", "reir_sentado"]),
        "sofa2": .init("lounge", "sofa", [(13.4, F), (13.4, -6.97)], 13.4, -6.97, 0, sentado: true, ["sentado", "reir_sentado", "cafe"]),
        "sofa3": .init("lounge", "sofa", [(13.05, F), (13.05, -6.97)], 12.5, -6.97, 0, sentado: true, ["sentado", "cafe", "reir_sentado"]),
        "sillon": .init("lounge", "sofa", [(11.45, F), (11.45, -6.2)], 10.906, -6.097, 2.342, sentado: true, ["sentado", "cafe"]),
        "rincon1": .init("lounge", "sofa", [(26.15, F)], 26.03, -5.6, .pi / 2, sentado: true, ["cafe", "sentado", "reir_sentado"]),
        "rincon2": .init("lounge", "sofa", [(27.1, F)], 27.17, -5.6, -.pi / 2, sentado: true, ["sentado", "reir_sentado", "cafe"]),
        "barra1": .init("lounge", "barra", [(22.7, F), (22.7, -8.3)], 22.7, -8.3, .pi, ["beber", "quieto", "celular", "hablar"]),
        "barra2": .init("lounge", "barra", [(23.7, F), (23.7, -8.3)], 23.7, -8.3, .pi, ["hablar", "beber", "quieto", "celular"]),
        "cinta": .init("gym", "gym", [(22.4, 12.6), (22.4, 10.9)], 22.4, 9.6, .pi, ["cinta"], y: 0.23),
        "pesas": .init("gym", "gym", [(20.7, 12.6)], 20.7, 8.4, 0, ["pesas", "estirarse", "pesas"]),
        "charla": .init("gym", "gym", [(18.2, 12.6)], 18.2, 10.4, 0.5, ["hablar", "estirarse"]),
        "mapa": .init("reuniones", "mapa", [(6.6, -3.2), (7.4, -3.8), (7.4, -8.9)], 5.5, -8.9, .pi, ["pensar", "quieto"]),
        "mapa2": .init("reuniones", "mapa", [(6.6, -3.2), (7.4, -3.8), (7.4, -9.0)], 4.1, -9.0, .pi, ["pensar", "hablar"]),
        "pasillo": .init("pasillo", "pasillo", [], 9.5, 5.0, -.pi / 2, ["celular", "estirarse", "quieto"]),
        "espera1": .init("recepcion", "recepcion", [(-3.2, 15.8), (-3.88, 15.8)], -3.88, 17.0, .pi / 2, sentado: true, ["sentado", "cafe", "reir_sentado"]),
        "espera2": .init("recepcion", "recepcion", [(-3.2, 15.8), (-2.52, 15.8)], -2.52, 17.0, -.pi / 2, sentado: true, ["cafe", "sentado", "reir_sentado"]),
        "paquete": .init("paqueteria", "paqueteria", [(17.5, -9.4), (17.5, -13.2)], 15.0, -13.2, .pi, ["pensar", "celular", "quieto"]),
    ]
    static let ENTRADA: [String: [(Float, Float)]] = [
        "lounge": [(PASILLO_X, F)], "gym": [(PASILLO_X, 12.6)], "reuniones": [(PASILLO_X, F), (6.6, F)],
        "paqueteria": [(PASILLO_X, F), (17.5, F)], "pasillo": [(PASILLO_X, 5.0)], "recepcion": [(PASILLO_X, 12.6), (-3.2, 12.6)]]
    static let GUSTO: [String: [String: Double]] = [
        "pedidos": ["sofa": 3, "paqueteria": 3], "wa": ["sofa": 2, "pasillo": 3, "recepcion": 2], "ana": ["mapa": 3, "sofa": 1],
        "ebay": ["barra": 3, "paqueteria": 2], "dem": ["barra": 2, "mapa": 2], "fin": ["gym": 3], "mkt": ["gym": 2, "pasillo": 2], "nube": ["gym": 2, "mapa": 2]]

    /// sala de reuniones: 9 sillas alrededor de la mesa (la cabecera del lado de la puerta queda para Santi)
    struct Silla { let x: Float, z: Float, rot: Float, pts: [(Float, Float)] }
    static let JUNTA: [Silla] = {
        let cx: Float = 3, cz: Float = -6.4, E: (Float, Float) = (6.6, -3.2), S: (Float, Float) = (6.6, -4.1), N: (Float, Float) = (7.6, -4.1)
        var j: [Silla] = []
        for dx: Float in [-1.8, -0.6, 0.6, 1.8] { j.append(Silla(x: cx + dx, z: cz + 0.95, rot: .pi, pts: [E, S, (cx + dx, -4.1)])) }
        for dx: Float in [-1.8, -0.6, 0.6, 1.8] { j.append(Silla(x: cx + dx, z: cz - 0.95, rot: 0, pts: [E, N, (7.6, -8.7), (cx + dx, -8.7)])) }
        j.append(Silla(x: cx - 2.8, z: cz, rot: .pi / 2, pts: [E, S, (cx - 4.0, -4.1), (cx - 4.0, cz)]))
        return j
    }()
    static let JENT: [(Float, Float)] = [(PASILLO_X, F), (6.6, F)]

    // ---------- cada agente ----------
    enum Paso { case ir(Float, Float), girar(Float), anim(String, bucle: Bool, espera: Double), raiz(Float, Float, Float), silla(Float), hacer(() -> Void) }
    final class Agente {
        let id: String, nodo: SCNNode, puesto: (Float, Float)
        var cola: [Paso] = [], paso: Paso?, t: Double = 0
        var donde = "puesto", spot: String?, sillaJ: Int?, anim = "", tLugar: Double = 0, tAnim: Double = 0, espera: Double = 0
        init(id: String, nodo: SCNNode, puesto: (Float, Float)) { self.id = id; self.nodo = nodo; self.puesto = puesto }
    }

    let escena: SCNScene
    let carpeta: URL
    var agentes: [String: Agente] = [:]
    var junta = false
    /// destino de cada uno ("puesto" | "lugar"), lo pone Vivo3D según el estado real
    var quiere: [String: String] = [:]
    /// la animación en el puesto (teclear si trabaja, etc.)
    var animPuesto: (String) -> String = { _ in "teclear" }
    /// parte 6: el lugar o la silla de la junta donde está sentado Santi (nadie más lo usa) y su paso por cuadro
    var reservado: String?
    /// los que tienen que aplaudir antes de levantarse (terminó la ronda)
    var aplausos = Set<String>()
    var sillaSanti: Int?
    weak var manejo: Manejo?
    private var link: CADisplayLink?
    private var ultimo: CFTimeInterval = 0

    init(escena: SCNScene, carpeta: URL) {
        self.escena = escena; self.carpeta = carpeta
        for (k, (id, x, z)) in Detalle3D.puestos.enumerated() {
            guard let n = escena.rootNode.childNode(withName: "persona-\(id)", recursively: false) else { continue }
            let a = Agente(id: id, nodo: n, puesto: (x, z))
            a.espera = Double(k) * 1.6 + Double.random(in: 0...3)   // no se levantan todos a la vez
            agentes[id] = a
        }
    }

    func empezar() {
        let l = CADisplayLink(target: Ticker(self), selector: #selector(Ticker.tic(_:)))
        l.preferredFrameRateRange = Calidad.actual.rango   // al mismo ritmo que la pantalla: a 120 fps se mueven a 120
        l.add(to: .main, forMode: .common)
        link = l
    }
    func parar() { link?.invalidate(); link = nil }

    final class Ticker: NSObject {
        weak var c: Comportamiento?
        init(_ c: Comportamiento) { self.c = c }
        @MainActor @objc func tic(_ l: CADisplayLink) { c?.paso(l.timestamp) }
    }

    // ---------- geometría del puesto ----------
    /// punto frente a la silla (de pie) y punto de la persona sentada
    func pie(_ a: Agente) -> (Float, Float) { (a.puesto.0, a.puesto.1 + 0.47) }
    func afuera(_ a: Agente) -> (Float, Float) { (a.puesto.0, a.puesto.1 + 1.55) }
    func caminoPuesto(_ a: Agente) -> [(Float, Float)] {
        let (x, z) = a.puesto
        return [afuera(a), (x + 2.1, z + 1.55), (x + 2.1, z + 2.6), (Self.PASILLO_X, z + 2.6)]
    }
    static func adelante(_ rot: Float) -> (Float, Float) { (sin(rot), cos(rot)) }

    // ---------- secuencias ----------
    func caminar(_ pts: [(Float, Float)]) -> [Paso] { pts.map { .ir($0.0, $0.1) } }

    /// sentarse en un asiento: llegar al frente, girar, animación de sentarse y quedarse sentado haciendo `anim`
    func sentarse(en p: (Float, Float), rot: Float, anim: String) -> [Paso] {
        let f = Self.adelante(rot)
        return [.ir(p.0, p.1), .girar(rot), .anim("sentarse", bucle: false, espera: 2.0),
                .raiz(p.0 - Self.RETRO * f.0, 0, p.1 - Self.RETRO * f.1), .anim(anim, bucle: true, espera: 0)]
    }
    /// pararse de un asiento cuyo frente es p
    func pararse(de p: (Float, Float)) -> [Paso] { [.raiz(p.0, 0, p.1), .anim("pararse", bucle: false, espera: 2.0)] }

    func levantarseDelPuesto(_ a: Agente) -> [Paso] {
        [.silla(0.55)] + pararse(de: pie(a)) + caminar(caminoPuesto(a))
    }
    func sentarseEnPuesto(_ a: Agente) -> [Paso] {
        caminar(caminoPuesto(a).reversed()) + [.silla(0.55)] + sentarse(en: pie(a), rot: .pi, anim: animPuesto(a.id)) + [.silla(0), .hacer { a.donde = "puesto" }]
    }
    func llegar(_ a: Agente, _ L: Lugar, _ k: String) -> [Paso] {
        let n = L.anims.randomElement() ?? "quieto"
        var s = caminar(L.pts)
        if L.sentado { s += sentarse(en: (L.x, L.z), rot: L.rot, anim: n) }
        else { s += [.ir(L.x, L.z), .girar(L.rot), .raiz(L.x, L.y, L.z), .anim(n, bucle: true, espera: 0)] }
        s.append(.hacer { [weak self] in a.donde = "lugar"; a.spot = k; a.tLugar = .random(in: 45...130); a.tAnim = .random(in: 8...18); self?.toque() })
        return s
    }
    func dejar(_ a: Agente, _ L: Lugar, conEntrada: Bool) -> [Paso] {
        var s: [Paso] = L.sentado ? pararse(de: (L.x, L.z)) : [.raiz(L.x, 0, L.z)]
        s += caminar(L.pts.reversed())
        if conEntrada { s += caminar((Self.ENTRADA[L.zona] ?? []).reversed()) }
        return s
    }

    func elegirLugar(_ id: String, evitar: String? = nil) -> String? {
        let ocupados = Set(agentes.values.compactMap(\.spot) + [reservado].compactMap { $0 })
        let cand = Self.LUGAR.keys.filter { !ocupados.contains($0) && $0 != evitar }
        guard !cand.isEmpty else { return nil }
        let g = Self.GUSTO[id] ?? [:]
        let pesos = cand.map { 1 + (g[Self.LUGAR[$0]!.grupo] ?? 0) }
        var r = Double.random(in: 0..<pesos.reduce(0, +))
        for (i, w) in pesos.enumerated() { r -= w; if r <= 0 { return cand[i] } }
        return cand.last
    }

    func irAlLugar(_ a: Agente) {
        guard let k = elegirLugar(a.id), let L = Self.LUGAR[k] else { return }
        a.spot = k; a.donde = "yendo"
        // al terminar la ronda, los que están en su puesto aplauden unos segundos antes de irse (como en la web)
        let aplauso: [Paso] = aplausos.remove(a.id) != nil ? [.anim("aplaudir", bucle: true, espera: .random(in: 3.5...5))] : []
        a.cola = aplauso + levantarseDelPuesto(a) + caminar(Self.ENTRADA[L.zona] ?? []) + llegar(a, L, k)
    }
    func cambiarDeLugar(_ a: Agente) {
        guard let actual = a.spot, let A = Self.LUGAR[actual], let k = elegirLugar(a.id, evitar: actual), let L = Self.LUGAR[k] else { a.tLugar = .random(in: 30...60); return }
        let misma = A.zona == L.zona
        a.spot = k; a.donde = "yendo"
        a.cola = dejar(a, A, conEntrada: !misma) + (misma ? [] : caminar(Self.ENTRADA[L.zona] ?? [])) + llegar(a, L, k)
    }
    func volverAlPuesto(_ a: Agente) {
        guard let s = a.spot, let L = Self.LUGAR[s] else { return }
        a.spot = nil; a.donde = "yendo"
        a.cola = dejar(a, L, conEntrada: true) + sentarseEnPuesto(a)
    }
    func irAJunta(_ a: Agente) {
        let usadas = Set(agentes.values.compactMap(\.sillaJ) + [sillaSanti].compactMap { $0 })
        guard let i = Self.JUNTA.indices.first(where: { !usadas.contains($0) }) else { return }
        let S = Self.JUNTA[i]
        var salida: [Paso] = []
        if a.donde == "puesto" { salida = levantarseDelPuesto(a) }
        else if let sp = a.spot, let L = Self.LUGAR[sp] { salida = dejar(a, L, conEntrada: true) }
        a.spot = nil; a.sillaJ = i; a.donde = "yendo"
        a.cola = salida + caminar(Self.JENT) + caminar(S.pts) + sentarse(en: (S.x, S.z), rot: S.rot, anim: "sentado") + [.hacer { a.donde = "junta"; a.tAnim = .random(in: 6...14) }]
    }
    func salirDeJunta(_ a: Agente) {
        guard let i = a.sillaJ else { return }
        let S = Self.JUNTA[i]; a.sillaJ = nil; a.donde = "yendo"
        a.cola = pararse(de: (S.x, S.z)) + caminar(S.pts.reversed()) + caminar(Self.JENT.reversed()) + sentarseEnPuesto(a)
    }

    private var tToque: Double = 0
    func toque() {}

    // ---------- cada cuadro ----------
    func paso(_ ahora: CFTimeInterval) {
        let dt = ultimo == 0 ? 1.0 / 30 : min(0.1, ahora - ultimo); ultimo = ahora
        for a in agentes.values {
            if a.espera > 0 { a.espera -= dt; continue }
            decidir(a, dt)
            avanzar(a, dt)
        }
        manejo?.paso(dt)
    }

    func destino(_ a: Agente) -> String {
        if junta && a.id != "gerente" { return "junta" }
        return quiere[a.id] ?? "puesto"
    }

    func decidir(_ a: Agente, _ dt: Double) {
        guard a.cola.isEmpty, a.paso == nil else { return }
        let d = destino(a)
        switch (a.donde, d) {
        case ("puesto", "lugar"): irAlLugar(a)
        case ("puesto", "junta"), ("lugar", "junta"): irAJunta(a)
        case ("junta", "puesto"), ("junta", "lugar"): salirDeJunta(a)
        case ("lugar", "puesto"): volverAlPuesto(a)
        case ("lugar", "lugar"):
            a.tLugar -= dt; a.tAnim -= dt
            if a.tLugar <= 0 { cambiarDeLugar(a) }
            else if a.tAnim <= 0, let s = a.spot, let L = Self.LUGAR[s] {
                a.tAnim = .random(in: 8...18)
                let n = L.anims.randomElement() ?? "quieto"
                if n != a.anim { reproducir(a, n, bucle: true) }
            }
        case ("puesto", "puesto"):
            let n = animPuesto(a.id)
            if n != a.anim { reproducir(a, n, bucle: true) }
        case ("junta", "junta"):
            a.tAnim -= dt
            if a.tAnim <= 0 { a.tAnim = .random(in: 6...14); reproducir(a, ["sentado", "reir_sentado", "sentado", "reunion", "aplaudir"].randomElement()!, bucle: true) }
        default: break
        }
    }

    func reproducir(_ a: Agente, _ n: String, bucle: Bool) {
        a.anim = n
        Personas3D.animar(a.nodo, n, carpeta: carpeta, desfase: .random(in: 0...5), bucle: bucle, fundido: 0.35)
    }

    func avanzar(_ a: Agente, _ dt: Double) {
        if a.paso == nil {
            guard !a.cola.isEmpty else { return }
            a.paso = a.cola.removeFirst(); a.t = 0
            if case .ir = a.paso!, a.anim != "caminar" { reproducir(a, "caminar", bucle: true) }
            if case .anim(let n, let b, _) = a.paso! { reproducir(a, n, bucle: b) }
        }
        a.t += dt
        let n = a.nodo
        switch a.paso! {
        case .ir(let x, let z):
            let dx = x - n.position.x, dz = z - n.position.z, d = (dx * dx + dz * dz).squareRoot(), v = Self.VELOCIDAD * Float(dt)
            if d <= v { n.position = SCNVector3(x, 0, z); a.paso = nil; return }
            n.position = SCNVector3(n.position.x + dx / d * v, 0, n.position.z + dz / d * v)
            girarHacia(n, atan2(dx, dz), Float(dt) * 8)
        case .girar(let r):
            girarHacia(n, r, Float(dt) * 9)
            if a.t > 0.6 { n.eulerAngles.y = .init(r); a.paso = nil }
        case .anim(_, _, let espera):
            if a.t >= espera { a.paso = nil }
        case .raiz(let x, let y, let z):
            n.position = SCNVector3(x, y, z); a.paso = nil
        case .silla(let dz):
            if let s = escena.rootNode.childNode(withName: "silla-\(a.id)", recursively: true) {
                SCNTransaction.begin(); SCNTransaction.animationDuration = 0.8
                s.position = SCNVector3(s.position.x, s.position.y, 0.62 + dz)
                SCNTransaction.commit()
            }
            a.paso = nil
        case .hacer(let f):
            f(); a.paso = nil
        }
    }

    func girarHacia(_ n: SCNNode, _ r: Float, _ k: Float) {
        var dr = r - Float(n.eulerAngles.y); dr = atan2(sin(dr), cos(dr))
        n.eulerAngles.y += .init(dr * min(1, k))
    }
}
