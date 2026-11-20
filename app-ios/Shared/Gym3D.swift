import Foundation
import SceneKit
import CoreGraphics

/// Gym con realismo (Santi, 19/11: "se ve súper de juguete"): mismas máquinas y lugares que la oficina web (el grupo del
/// gym está en x 21, z 9), pero con piso de goma en baldosas, tubos de acero de verdad, discos con buje, mancuernas
/// hexagonales, cinta con cubierta de motor y consola, bici con volante, saco de cuero y bancos tapizados.
/// Los agentes siguen usando la cinta (sobre la banda a 0,23 m) y la zona de pesas como antes.
enum Gym3D {
    typealias M = Muebles3D
    typealias D = Detalle3D
    static let origen = SIMD3<Float>(21, 0, 9)

    static let negroMate = D.pbr(0.025, 0.025, 0.028, rough: 0.65, metal: 0.1)
    static let acero = D.pbr(0.62, 0.63, 0.66, rough: 0.25, metal: 1)
    static let goma = D.pbr(0.025, 0.025, 0.027, rough: 0.92)
    static let gomaPiso = D.pbr(0.05, 0.052, 0.055, rough: 0.9)   // liso: la textura fina hacía ondas que se movían con la cámara
    static let madera = D.pbr(0.36, 0.23, 0.13, rough: 0.6, laca: 0.15)
    static let tapizado = M.material(0.04, 0.035, 0.032, tejido: false, escala: 3, brillo: 0.4)
    static let consola = D.pbr(0.06, 0.065, 0.07, rough: 0.3, metal: 0.4)
    static let pantalla: SCNMaterial = { let m = SCNMaterial(); m.lightingModel = .constant
        m.diffuse.contents = CGColor(srgbRed: 0.12, green: 0.42, blue: 0.68, alpha: 1); m.emission.contents = m.diffuse.contents; return m }()

    static func caja(_ w: CGFloat, _ h: CGFloat, _ l: CGFloat, r: CGFloat = 0.008, _ m: SCNMaterial, _ x: Float, _ y: Float, _ z: Float, _ p: SCNNode) -> SCNNode {
        let n = D.caja(w, h, l, r: r, m, x, y, z, p); n.castsShadow = true; return n
    }
    @discardableResult
    static func tubo(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ r: CGFloat, _ m: SCNMaterial, _ p: SCNNode, lados: Int = 16) -> SCNNode { M.tubo(a, b, r, m, p, lados: lados) }
    /// disco de goma con buje de acero, de canto sobre el eje x
    static func disco(_ r: CGFloat, _ grosor: CGFloat, _ x: Float, _ y: Float, _ z: Float, _ p: SCNNode) {
        let g = SCNCylinder(radius: r, height: grosor); g.radialSegmentCount = 36; g.materials = [goma]
        let n = SCNNode(geometry: g); n.position = SCNVector3(x, y, z); n.eulerAngles.z = .pi / 2; n.castsShadow = true; p.addChildNode(n)
        let b = SCNCylinder(radius: 0.03, height: grosor + 0.006); b.radialSegmentCount = 20; b.materials = [acero]
        let bn = SCNNode(geometry: b); bn.position = n.position; bn.eulerAngles.z = .pi / 2; p.addChildNode(bn)
        let aro = SCNTube(innerRadius: r * 0.78, outerRadius: r * 0.8, height: grosor + 0.004); aro.radialSegmentCount = 36; aro.materials = [negroMate]
        let an = SCNNode(geometry: aro); an.position = n.position; an.eulerAngles.z = .pi / 2; p.addChildNode(an)
    }
    /// mancuerna hexagonal (cabezas de 6 lados, mango cromado), a lo largo del eje z
    static func mancuerna(_ r: CGFloat, _ x: Float, _ y: Float, _ z: Float, _ p: SCNNode) {
        tubo(SIMD3(x, y, z - 0.13), SIMD3(x, y, z + 0.13), 0.016, acero, p, lados: 12)
        for dz: Float in [-0.135, 0.135] {
            let g = SCNCylinder(radius: r, height: 0.07); g.radialSegmentCount = 6; g.materials = [goma]
            let n = SCNNode(geometry: g); n.position = SCNVector3(x, y, z + dz); n.eulerAngles.x = .pi / 2; n.castsShadow = true; p.addChildNode(n)
        }
    }

    /// el gym completo, ya ubicado en la nave
    static func gym() -> SCNNode {
        let g = SCNNode(); g.simdPosition = origen; g.name = "gym"
        // piso: baldosas de goma de 1 m con juntas finas
        let piso = SCNBox(width: 12.6, height: 0.03, length: 4.0, chamferRadius: 0.005); piso.materials = [gomaPiso]
        let pn = SCNNode(geometry: piso); pn.position = SCNVector3(0, 0.015, 0); g.addChildNode(pn)
        for k in -6...6 { let j = caja(0.006, 0.002, 4.0, r: 0, D.pbr(0.02, 0.02, 0.02, rough: 1), Float(k), 0.031, 0, g); j.castsShadow = false }
        for k in -1...1 { let j = caja(12.6, 0.002, 0.006, r: 0, D.pbr(0.02, 0.02, 0.02, rough: 1), 0, 0.031, Float(k), g); j.castsShadow = false }
        // borde de luz cálida (como la web)
        let led = SCNMaterial(); led.lightingModel = .constant; led.diffuse.contents = CGColor(srgbRed: 1, green: 0.78, blue: 0.45, alpha: 1)
        for (x, z, w, d) in [(Float(0), Float(-2.0), CGFloat(12.6), CGFloat(0.03)), (0, 2.0, 12.6, 0.03), (-6.3, 0, 0.03, 4.0), (6.3, 0, 0.03, 4.0)] {
            let e = caja(w, 0.01, d, r: 0, led, x, 0.035, z, g); e.castsShadow = false
        }

        // ---------- jaula de sentadillas (power rack) sobre plataforma, con barra cargada ----------
        let rx: Float = -4.9
        _ = caja(2.4, 0.05, 2.4, r: 0.006, madera, rx, 0.055, -0.3, g)
        for dx: Float in [-0.6, 0.6] { _ = caja(0.6, 0.012, 2.3, r: 0.003, goma, rx + dx, 0.084, -0.3, g) }   // gomas de la plataforma
        for (dx, dz) in [(Float(-0.65), Float(-1.0)), (0.65, -1.0), (-0.65, 0.3), (0.65, 0.3)] {
            let poste = caja(0.075, 2.35, 0.075, r: 0.006, negroMate, rx + dx, 1.255, dz, g)
            // agujeros a lo largo del poste
            for k in 0..<20 { let h = caja(0.012, 0.025, 0.08, r: 0.004, D.pbr(0.005, 0.005, 0.005, rough: 1), 0, -0.9 + Float(k) * 0.09, 0, poste); h.castsShadow = false
                h.position.x = dx < 0 ? 0.034 : -0.034 }
        }
        for dz: Float in [-1.0, 0.3] { _ = caja(1.38, 0.075, 0.075, r: 0.006, negroMate, rx, 2.39, dz, g) }
        for dx: Float in [-0.65, 0.65] { _ = caja(0.075, 0.075, 1.38, r: 0.006, negroMate, rx + dx, 2.39, -0.35, g) }
        tubo(SIMD3(rx - 0.65, 2.25, -1.0), SIMD3(rx + 0.65, 2.25, -1.0), 0.016, acero, g)   // barra de dominadas
        // ganchos (J-hooks) y barra olímpica con discos
        for dx: Float in [-0.65, 0.65] { _ = caja(0.05, 0.1, 0.07, r: 0.006, acero, rx + dx, 1.3, 0.38, g) }
        tubo(SIMD3(rx - 1.1, 1.35, 0.33), SIMD3(rx + 1.1, 1.35, 0.33), 0.014, acero, g)
        for sx: Float in [-1, 1] {
            tubo(SIMD3(rx + sx * 0.78, 1.35, 0.33), SIMD3(rx + sx * 1.1, 1.35, 0.33), 0.025, acero, g)
            disco(0.225, 0.06, rx + sx * 0.85, 1.35, 0.33, g); disco(0.225, 0.06, rx + sx * 0.92, 1.35, 0.33, g); disco(0.16, 0.04, rx + sx * 0.98, 1.35, 0.33, g)
        }
        // banco plano: tapizado mullido y estructura de acero en T
        let bz: Float = 1.3
        M.pieza(M.mullido(0.3, 0.09, 1.15, r: 0.035, infla: 0.01), tapizado, rx, 0.45, bz, g)
        _ = caja(0.08, 0.04, 1.0, r: 0.006, negroMate, rx, 0.385, bz, g)
        for dz: Float in [-0.45, 0.45] {
            tubo(SIMD3(rx, 0.38, bz + dz), SIMD3(rx, 0.04, bz + dz), 0.025, negroMate, g)
            _ = caja(0.42, 0.04, 0.06, r: 0.01, negroMate, rx, 0.05, bz + dz, g)
        }

        // ---------- árbol de discos ----------
        let tx: Float = -3.0
        let pie = SCNCylinder(radius: 0.3, height: 0.04); pie.radialSegmentCount = 30; pie.materials = [negroMate]
        let pien = SCNNode(geometry: pie); pien.position = SCNVector3(tx, 0.05, -1.3); g.addChildNode(pien)
        tubo(SIMD3(tx, 0.05, -1.3), SIMD3(tx, 1.15, -1.3), 0.03, negroMate, g)
        for (y, r) in [(Float(0.35), CGFloat(0.225)), (0.65, 0.2), (0.95, 0.15)] {
            for sx: Float in [-1, 1] { tubo(SIMD3(tx, y, -1.3), SIMD3(tx + sx * 0.26, y, -1.3), 0.014, acero, g); disco(r, 0.05, tx + sx * 0.18, y, -1.3, g) }
        }

        // ---------- rack de mancuernas (2 bandejas inclinadas) con 10 pares hexagonales ----------
        let dx0: Float = -1.2
        for (y, z) in [(Float(0.5), Float(-1.5)), (0.88, -1.62)] {
            let bandeja = caja(2.6, 0.03, 0.42, r: 0.006, negroMate, dx0, y, z, g); bandeja.eulerAngles.x = -0.18
        }
        for e: Float in [-1.25, 1.25] {
            tubo(SIMD3(dx0 + e, 0.03, -1.35), SIMD3(dx0 + e, 0.9, -1.75), 0.03, negroMate, g)
            _ = caja(0.06, 0.03, 0.6, r: 0.008, negroMate, dx0 + e, 0.046, -1.55, g)
        }
        for row in 0..<2 { for k in 0..<5 {
            let x = dx0 - 1.0 + Float(k) * 0.5, y = 0.58 + Float(row) * 0.38, r = CGFloat(0.05 + Double(k) * 0.01 + Double(row) * 0.008)
            mancuerna(r, x - 0.1, y, -1.5 - Float(row) * 0.12, g); mancuerna(r, x + 0.1, y, -1.5 - Float(row) * 0.12, g)
        } }
        // banco ajustable inclinado: riel en el piso, asiento plano y respaldo inclinado unidos por la bisagra
        let bx: Float = -1.2
        tubo(SIMD3(bx, 0.05, -0.45), SIMD3(bx, 0.05, 0.75), 0.035, negroMate, g)
        _ = caja(0.5, 0.05, 0.08, r: 0.015, negroMate, bx, 0.056, -0.45, g); _ = caja(0.5, 0.05, 0.08, r: 0.015, negroMate, bx, 0.056, 0.75, g)
        tubo(SIMD3(bx, 0.05, 0.38), SIMD3(bx, 0.4, 0.38), 0.03, negroMate, g)                      // columna del asiento
        M.pieza(M.mullido(0.3, 0.08, 0.42, r: 0.035, infla: 0.012), tapizado, bx, 0.45, 0.42, g)
        let resp = SCNNode(); resp.position = SCNVector3(bx, 0.45, 0.2); resp.eulerAngles.x = -0.55; g.addChildNode(resp)
        M.pieza(M.mullido(0.3, 0.08, 0.95, r: 0.035, infla: 0.012), tapizado, 0, 0, -0.48, resp)
        _ = caja(0.08, 0.04, 0.85, r: 0.01, negroMate, 0, -0.06, -0.45, resp)
        tubo(SIMD3(bx, 0.05, -0.2), SIMD3(bx, 0.62, -0.25), 0.025, negroMate, g)                    // soporte trasero del respaldo
        // toalla doblada y botellas sobre el banco plano
        M.pieza(M.mullido(0.26, 0.05, 0.36, r: 0.02, infla: 0.008), M.material(0.86, 0.84, 0.8, tejido: true, escala: 10, brillo: 0.02), rx, 0.52, bz + 0.35, g)
        for (k, c) in [(Float(0), (0.16, 0.18, 0.2)), (1, (0.79, 0.64, 0.36))].enumerated() {
            let bot = SCNCylinder(radius: 0.035, height: 0.22); bot.radialSegmentCount = 18
            bot.materials = [D.pbr(CGFloat(c.1.0), CGFloat(c.1.1), CGFloat(c.1.2), rough: 0.3, metal: 0.6)]
            let n = SCNNode(geometry: bot); n.position = SCNVector3(rx + 0.45 + Float(k) * 0.12, 0.14, bz + 0.6); n.castsShadow = true; g.addChildNode(n)
        }

        // pesas rusas: cuerpo, base plana y asa
        for (i, r) in [CGFloat(0.12), 0.14, 0.16].enumerated() {
            let x = 0.5 + Float(i) * 0.45
            let esf = SCNSphere(radius: r); esf.segmentCount = 28; esf.materials = [negroMate]
            let en = SCNNode(geometry: esf); en.position = SCNVector3(x, Float(r) * 0.92, -1.6); en.castsShadow = true; g.addChildNode(en)
            let asa = SCNTorus(ringRadius: r * 0.62, pipeRadius: r * 0.13); asa.ringSegmentCount = 28; asa.materials = [negroMate]
            let an = SCNNode(geometry: asa); an.position = SCNVector3(x, Float(r) * 1.75, -1.6); an.eulerAngles.x = .pi / 2; g.addChildNode(an)
        }

        // ---------- cinta de correr (la banda queda a 0,23 m, donde corren los agentes) ----------
        let tm = SCNNode(); tm.position = SCNVector3(1.4, 0, 0.6); g.addChildNode(tm)
        M.pieza(M.mullido(0.86, 0.17, 1.95, r: 0.05, infla: 0), consola, 0, 0.12, 0.05, tm)
        _ = caja(0.6, 0.012, 1.7, r: 0.004, goma, 0, 0.215, 0.12, tm)                                   // banda
        for sx: Float in [-1, 1] { _ = caja(0.11, 0.025, 1.75, r: 0.01, D.pbr(0.2, 0.2, 0.21, rough: 0.6), sx * 0.36, 0.215, 0.1, tm) }   // pisaderas
        M.pieza(M.mullido(0.86, 0.22, 0.32, r: 0.08, infla: 0), consola, 0, 0.2, -0.88, tm)            // cubierta del motor
        for sx: Float in [-1, 1] {
            tubo(SIMD3(sx * 0.38, 0.3, -0.85), SIMD3(sx * 0.33, 1.25, -1.0), 0.03, consola, tm)       // parantes
            tubo(SIMD3(sx * 0.33, 1.05, -0.95), SIMD3(sx * 0.33, 1.05, -0.45), 0.018, acero, tm)       // pasamanos
        }
        let con = M.pieza(M.mullido(0.72, 0.32, 0.1, r: 0.04, infla: 0), consola, 0, 1.33, -1.0, tm); con.eulerAngles.x = -0.4
        let scr = SCNPlane(width: 0.38, height: 0.2); scr.materials = [pantalla]
        let sn = SCNNode(geometry: scr); sn.position = SCNVector3(0, 0.02, 0.052); con.addChildNode(sn)

        // ---------- bicicleta fija ----------
        let bk = SCNNode(); bk.position = SCNVector3(2.9, 0, 0.6); g.addChildNode(bk)
        for z: Float in [-0.5, 0.5] { tubo(SIMD3(-0.3, 0.04, z), SIMD3(0.3, 0.04, z), 0.03, negroMate, bk) }
        tubo(SIMD3(0, 0.05, -0.5), SIMD3(0, 0.05, 0.5), 0.03, negroMate, bk)
        let vol = SCNCylinder(radius: 0.25, height: 0.06); vol.radialSegmentCount = 40; vol.materials = [acero]
        let vn = SCNNode(geometry: vol); vn.position = SCNVector3(0, 0.42, -0.38); vn.eulerAngles.z = .pi / 2; vn.castsShadow = true; bk.addChildNode(vn)
        M.pieza(M.mullido(0.09, 0.42, 0.42, r: 0.04, infla: 0), negroMate, 0, 0.42, -0.22, bk)            // tapa del volante
        tubo(SIMD3(0, 0.05, -0.1), SIMD3(0, 0.92, 0.25), 0.032, negroMate, bk)                         // tubo del asiento
        M.pieza(M.mullido(0.2, 0.06, 0.28, r: 0.03, infla: 0.01), tapizado, 0, 0.96, 0.3, bk)
        tubo(SIMD3(0, 0.3, -0.3), SIMD3(0, 1.1, -0.5), 0.03, negroMate, bk)                            // manubrio
        tubo(SIMD3(-0.22, 1.12, -0.5), SIMD3(0.22, 1.12, -0.5), 0.016, acero, bk)
        let bc = M.pieza(M.mullido(0.2, 0.13, 0.05, r: 0.02, infla: 0), consola, 0, 1.2, -0.55, bk); bc.eulerAngles.x = -0.5
        for sx: Float in [-1, 1] { tubo(SIMD3(sx * 0.05, 0.42, -0.38), SIMD3(sx * 0.13, 0.3, -0.25), 0.012, acero, bk) }   // bielas

        // ---------- saco de boxeo en su pórtico ----------
        let sx: Float = 4.9
        for d: Float in [-0.8, 0.8] { _ = caja(0.08, 3.0, 0.08, r: 0.006, negroMate, sx + d, 1.5, -0.6, g); _ = caja(0.5, 0.03, 0.5, r: 0.006, negroMate, sx + d, 0.046, -0.6, g) }
        _ = caja(1.7, 0.08, 0.08, r: 0.006, negroMate, sx, 3.0, -0.6, g)
        tubo(SIMD3(sx, 2.96, -0.6), SIMD3(sx, 2.5, -0.6), 0.005, acero, g, lados: 6)
        let saco = SCNCapsule(capRadius: 0.24, height: 1.25); saco.radialSegmentCount = 32; saco.materials = [M.cognacOscuro]
        let san = SCNNode(geometry: saco); san.position = SCNVector3(sx, 1.85, -0.6); san.castsShadow = true; g.addChildNode(san)
        let ar = SCNTube(innerRadius: 0.238, outerRadius: 0.25, height: 0.04); ar.radialSegmentCount = 32; ar.materials = [D.bronce]
        let arn = SCNNode(geometry: ar); arn.position = SCNVector3(sx, 2.35, -0.6); g.addChildNode(arn)

        // ---------- colchoneta, balones medicinales y botella ----------
        M.pieza(M.mullido(0.62, 0.02, 1.75, r: 0.01, infla: 0), M.material(0.21, 0.13, 0.08, tejido: true, escala: 6, brillo: 0.05), 3.9, 0.045, 1.2, g)
        for (x, z, r) in [(Float(5.6), Float(1.2), CGFloat(0.16)), (5.6, 1.6, 0.14)] {
            let b = SCNSphere(radius: r); b.segmentCount = 28; b.materials = [M.material(0.17, 0.18, 0.2, tejido: true, escala: 8, brillo: 0.05)]
            let n = SCNNode(geometry: b); n.position = SCNVector3(x, Float(r) + 0.03, z); n.castsShadow = true; g.addChildNode(n)
        }
        // ---------- espejo de pared detrás del rack de mancuernas, con marco negro ----------
        let espejo = D.pbr(0.92, 0.94, 0.96, rough: 0.03, metal: 1)
        _ = caja(6.2, 2.1, 0.03, r: 0.004, espejo, -0.6, 1.25, -1.97, g)
        _ = caja(6.3, 0.05, 0.05, r: 0.006, negroMate, -0.6, 2.32, -1.97, g); _ = caja(6.3, 0.05, 0.05, r: 0.006, negroMate, -0.6, 0.18, -1.97, g)
        for x: Float in [-3.73, 2.53] { _ = caja(0.05, 2.2, 0.05, r: 0.006, negroMate, x, 1.25, -1.97, g) }

        // ---------- luces cálidas colgadas (Santi 19/11: el gym no tenía luz propia y se veía apagado) ----------
        for x: Float in [-4.2, 0, 4.2] {
            let l = SCNLight(); l.type = .omni; l.intensity = 280; l.color = CGColor(srgbRed: 1, green: 0.86, blue: 0.68, alpha: 1)
            l.attenuationStartDistance = 0; l.attenuationEndDistance = 7; l.attenuationFalloffExponent = 2
            let n = SCNNode(); n.light = l; n.position = SCNVector3(x, 2.9, 0); g.addChildNode(n)
            // la lámpara: barra lineal de bronce con su difusor
            tubo(SIMD3(x, 3.1, 0), SIMD3(x, 4.2, 0), 0.006, negroMate, g, lados: 6)
            _ = caja(1.6, 0.05, 0.12, r: 0.01, D.bronce, x, 3.08, 0, g)
            let dif = SCNMaterial(); dif.lightingModel = .constant; dif.diffuse.contents = CGColor(srgbRed: 1, green: 0.88, blue: 0.7, alpha: 1)
            let d = caja(1.5, 0.01, 0.07, r: 0, dif, x, 3.05, 0, g); d.castsShadow = false
        }
        return g
    }
}

/// Barra de café con realismo (Santi, 19/11: "se ve de juguete"): mostrador de mármol cálido con canto de bronce y cubierta
/// de mármol negro, máquina de espresso de acero con dos grupos, portafiltros, manómetro y vaporizador, molinillo,
/// tazas con platito, repisa de nogal con luz y frascos, y 3 banquetas tapizadas con apoyapiés de bronce. Mismo lugar.
enum Cafe3D {
    typealias M = Muebles3D
    typealias D = Detalle3D
    static let x: Float = 23.2, z: Float = -9.55
    static let acero = D.pbr(0.78, 0.79, 0.81, rough: 0.18, metal: 1)
    static let marmolCalido = D.pbr(0.86, 0.83, 0.78, rough: 0.18, laca: 0.6)
    static let nogal = D.pbr(0.33, 0.2, 0.11, rough: 0.5, laca: 0.25)
    static let ceramica = D.pbr(0.95, 0.95, 0.94, rough: 0.25, laca: 0.4)
    static let negro = D.pbr(0.03, 0.03, 0.035, rough: 0.4, metal: 0.2)

    static func caja(_ w: CGFloat, _ h: CGFloat, _ l: CGFloat, r: CGFloat = 0.01, _ m: SCNMaterial, _ px: Float, _ py: Float, _ pz: Float, _ p: SCNNode) -> SCNNode {
        let n = D.caja(w, h, l, r: r, m, px, py, pz, p); n.castsShadow = true; return n
    }
    static func cil(_ r: CGFloat, _ h: CGFloat, _ m: SCNMaterial, _ px: Float, _ py: Float, _ pz: Float, _ p: SCNNode, lados: Int = 32) -> SCNNode {
        let g = SCNCylinder(radius: r, height: h); g.radialSegmentCount = lados; g.materials = [m]
        let n = SCNNode(geometry: g); n.position = SCNVector3(px, py, pz); n.castsShadow = true; p.addChildNode(n); return n
    }
    /// taza con su platito y café adentro
    static func taza(_ px: Float, _ py: Float, _ pz: Float, _ p: SCNNode) {
        _ = cil(0.065, 0.008, ceramica, px, py + 0.004, pz, p)
        let t = SCNTube(innerRadius: 0.034, outerRadius: 0.04, height: 0.06); t.radialSegmentCount = 24; t.materials = [ceramica]
        let tn = SCNNode(geometry: t); tn.position = SCNVector3(px, py + 0.04, pz); p.addChildNode(tn)
        _ = cil(0.036, 0.004, ceramica, px, py + 0.012, pz, p)
        _ = cil(0.034, 0.002, D.pbr(0.18, 0.09, 0.04, rough: 0.2, laca: 0.6), px, py + 0.06, pz, p, lados: 20)
        let asa = SCNTorus(ringRadius: 0.016, pipeRadius: 0.004); asa.materials = [ceramica]
        let an = SCNNode(geometry: asa); an.position = SCNVector3(px + 0.045, py + 0.04, pz); an.eulerAngles.x = .pi / 2; p.addChildNode(an)
    }

    static func barra() -> SCNNode {
        let b = SCNNode(); b.name = "cafe"
        // mostrador
        M.pieza(M.mullido(3.6, 0.96, 0.62, r: 0.02, infla: 0), marmolCalido, x, 0.5, z, b)
        for k in 0..<12 { _ = caja(0.012, 0.8, 0.01, r: 0.003, D.pbr(0.7, 0.66, 0.6, rough: 0.3), x - 1.65 + Float(k) * 0.3, 0.5, z + 0.312, b) }   // ranuras verticales
        _ = caja(3.66, 0.035, 0.7, r: 0.006, D.bronce, x, 0.82, z, b)
        let tapa = caja(3.72, 0.05, 0.74, r: 0.012, D.marmolNegro, x, 1.03, z, b); _ = tapa
        _ = caja(3.5, 0.06, 0.04, r: 0.01, negro, x, 0.03, z + 0.29, b)   // zócalo
        let top: Float = 1.055
        // máquina de espresso: cuerpo de acero, panel negro, dos grupos con portafiltros, bandeja, manómetro y vaporizador
        let mx = x - 1.05, mz = z - 0.08
        M.pieza(M.mullido(0.68, 0.42, 0.46, r: 0.04, infla: 0), acero, mx, top + 0.25, mz, b)
        M.pieza(M.mullido(0.6, 0.12, 0.02, r: 0.01, infla: 0), negro, mx, top + 0.39, mz + 0.235, b)
        for gx: Float in [-0.15, 0.15] {
            _ = cil(0.045, 0.06, acero, mx + gx, top + 0.27, mz + 0.24, b)
            _ = cil(0.04, 0.03, negro, mx + gx, top + 0.225, mz + 0.25, b)
            Muebles3D.tubo(SIMD3(mx + gx, top + 0.225, mz + 0.27), SIMD3(mx + gx, top + 0.2, mz + 0.42), 0.012, negro, b, lados: 10)   // mango
            taza(mx + gx, top + 0.05, mz + 0.25, b)
        }
        _ = caja(0.6, 0.02, 0.16, r: 0.004, negro, mx, top + 0.045, mz + 0.27, b)          // bandeja de goteo
        let man = cil(0.035, 0.012, ceramica, mx, top + 0.39, mz + 0.248, b); man.eulerAngles.x = .pi / 2   // manómetro
        Muebles3D.tubo(SIMD3(mx + 0.3, top + 0.35, mz + 0.2), SIMD3(mx + 0.36, top + 0.12, mz + 0.3), 0.008, acero, b, lados: 8)   // vaporizador
        for k in 0..<4 { taza(mx - 0.22 + Float(k) * 0.14, top + 0.465, mz - 0.08, b) }     // tazas calentándose arriba
        // molinillo: base negra, cuerpo de acero y tolva con granos
        let gx = x - 0.45
        _ = caja(0.16, 0.24, 0.2, r: 0.03, negro, gx, top + 0.12, z - 0.1, b)
        _ = cil(0.06, 0.06, acero, gx, top + 0.27, z - 0.1, b)
        let tol = SCNCone(topRadius: 0.075, bottomRadius: 0.045, height: 0.16); tol.radialSegmentCount = 24
        let vidrio = D.pbr(0.25, 0.15, 0.08, rough: 0.1, laca: 0.9); tol.materials = [vidrio]
        let tn = SCNNode(geometry: tol); tn.position = SCNVector3(gx, top + 0.38, z - 0.1); b.addChildNode(tn)
        // tazas listas para servir y azucarera
        for k in 0..<3 { taza(x - 0.1 + Float(k) * 0.16, top, z + 0.12, b) }
        _ = cil(0.04, 0.09, ceramica, x + 0.45, top + 0.045, z + 0.05, b); _ = cil(0.042, 0.012, acero, x + 0.45, top + 0.096, z + 0.05, b)
        // repisa de nogal con luz cálida y frascos
        _ = caja(3.2, 0.045, 0.3, r: 0.006, nogal, x, 1.95, -9.84, b)
        let luz = SCNMaterial(); luz.lightingModel = .constant; luz.diffuse.contents = CGColor(srgbRed: 1, green: 0.85, blue: 0.6, alpha: 1)
        let l = caja(3.1, 0.008, 0.02, r: 0, luz, x, 1.924, -9.72, b); l.castsShadow = false
        for k in 0..<7 {
            let fx = x - 1.3 + Float(k) * 0.43, alto = CGFloat(0.16 + Double(k % 3) * 0.04)
            let f = SCNCylinder(radius: 0.055, height: alto); f.radialSegmentCount = 20; f.materials = [vidrio]
            let fn = SCNNode(geometry: f); fn.position = SCNVector3(fx, 1.972 + Float(alto) / 2, -9.84); b.addChildNode(fn)
            _ = cil(0.057, 0.02, nogal, fx, 1.972 + Float(alto) + 0.01, -9.84, b)
        }
        // banquetas: asiento tapizado redondeado, pie de bronce, apoyapiés y base
        for d: Float in [-1, 0, 1] {
            let sx = x + d, sz = z + 0.75
            _ = cil(0.18, 0.06, M.cognac, sx, 0.79, sz, b, lados: 40)
            let borde = SCNTorus(ringRadius: 0.18, pipeRadius: 0.032); borde.ringSegmentCount = 40; borde.materials = [M.cognac]
            let bn = SCNNode(geometry: borde); bn.position = SCNVector3(sx, 0.79, sz); b.addChildNode(bn)
            _ = cil(0.17, 0.02, M.cognacOscuro, sx, 0.826, sz, b, lados: 40)
            Muebles3D.tubo(SIMD3(sx, 0.76, sz), SIMD3(sx, 0.02, sz), 0.022, D.bronce, b)
            let apo = SCNTorus(ringRadius: 0.17, pipeRadius: 0.012); apo.ringSegmentCount = 36; apo.materials = [D.bronce]
            let an = SCNNode(geometry: apo); an.position = SCNVector3(sx, 0.3, sz); b.addChildNode(an)
            for k in 0..<4 { let a = Float(k) * .pi / 2; Muebles3D.tubo(SIMD3(sx, 0.3, sz), SIMD3(sx + 0.17 * sin(a), 0.3, sz + 0.17 * cos(a)), 0.008, D.bronce, b, lados: 8) }
            _ = cil(0.2, 0.025, D.bronce, sx, 0.0125, sz, b, lados: 40)
        }
        b.enumerateHierarchy { n, _ in n.castsShadow = true }
        return b
    }
}
