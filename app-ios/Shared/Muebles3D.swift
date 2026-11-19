import Foundation
import SceneKit
import CoreGraphics

/// Sillones y sofá del lounge con más calidad (Santi, 19/11: "que se vean de más calidad, siguen pareciendo de juguete"):
/// almohadones con forma mullida de verdad (superelipsoides: inflados al centro y redondeados en todos los bordes), cuero con
/// grano y arrugas (mapa de relieve hecho en código), tela tejida en la base, ribetes en los bordes, botones de capitoné y
/// patas de bronce. Misma forma y medidas que los de la oficina web (asiento a ~0,42 m, donde se sientan las animaciones).
enum Muebles3D {
    typealias D = Detalle3D

    // ---------- geometría: caja mullida ----------
    /// Caja tapizada: bordes redondeados de radio r en toda la pieza (puntos repartidos parejo, sin costuras) y las caras
    /// de arriba y de adelante un poco infladas (`infla`, en metros), como un almohadón relleno.
    static func mullido(_ w: CGFloat, _ h: CGFloat, _ l: CGFloat, r: CGFloat = 0.04, infla: CGFloat = 0.012, seg: Int = 14) -> SCNGeometry {
        let hw = SIMD3<Float>(Float(w), Float(h), Float(l)) / 2, rr = min(Float(r), hw.min() * 0.95), inf = Float(infla)
        var pos: [SCNVector3] = [], nor: [SCNVector3] = [], uv: [CGPoint] = [], idx: [UInt32] = [], ps: [SIMD3<Float>] = []
        // las 6 caras del cubo [-1,1]: eje normal, eje u, eje v
        let caras: [(Int, Float, Int, Int)] = [(1, 1, 0, 2), (1, -1, 2, 0), (0, 1, 2, 1), (0, -1, 1, 2), (2, 1, 1, 0), (2, -1, 0, 1)]
        func punto(_ c: SIMD3<Float>) -> SIMD3<Float> {
            let q = c * hw, dentro = simd_clamp(q, -(hw - rr), hw - rr)
            var d = q - dentro; let L = simd_length(d)
            d = L > 1e-6 ? d / L : SIMD3(0, 1, 0)
            var p = dentro + d * rr
            // inflado: arriba (y+) y adelante (z+ y z-) se abomban hacia afuera, más al centro
            let u = c.x, v = c.z, t = c.y
            if c.y > 0.999 { p.y += inf * (1 - u * u) * (1 - v * v) }
            if abs(c.z) > 0.999 { p.z += (c.z > 0 ? 1 : -1) * inf * 0.6 * (1 - u * u) * (1 - t * t) }
            return p
        }
        for (ax, sg, au, av) in caras {
            let base = UInt32(pos.count), n1 = seg + 1
            var malla = [SIMD3<Float>](repeating: .zero, count: n1 * n1)
            for i in 0...seg { for j in 0...seg {
                // repartido con más puntos cerca de los bordes (donde se redondea)
                func f(_ k: Int) -> Float { let x = Float(k) / Float(seg) * 2 - 1; return x * (1.5 - 0.5 * x * x) }
                var c = SIMD3<Float>(repeating: 0); c[ax] = sg; c[au] = f(i); c[av] = f(j)
                malla[i * n1 + j] = punto(c)
            } }
            for i in 0...seg { for j in 0...seg {
                let p = malla[i * n1 + j]
                let pu = malla[min(i + 1, seg) * n1 + j] - malla[max(i - 1, 0) * n1 + j]
                let pv = malla[i * n1 + min(j + 1, seg)] - malla[i * n1 + max(j - 1, 0)]
                var n = simd_normalize(simd_cross(pu, pv))
                var hacia = SIMD3<Float>(repeating: 0); hacia[ax] = sg
                if simd_dot(n, hacia) < 0 { n = -n }
                pos.append(SCNVector3(p.x, p.y, p.z)); nor.append(SCNVector3(n.x, n.y, n.z)); ps.append(p)
                uv.append(CGPoint(x: CGFloat(p[au] * 2.4), y: CGFloat(p[av] * 2.4)))
            } }
            for i in 0..<seg { for j in 0..<seg {
                let k = base + UInt32(i * n1 + j), k2 = k + UInt32(n1)
                // el orden de los triángulos sigue a la normal de la cara
                let a = ps[Int(k)], b = ps[Int(k2)], c = ps[Int(k + 1)]
                let cr = simd_cross(b - a, c - a)
                var hacia = SIMD3<Float>(repeating: 0); hacia[ax] = sg
                if simd_dot(cr, hacia) >= 0 { idx += [k, k2, k + 1, k + 1, k2, k2 + 1] } else { idx += [k, k + 1, k2, k + 1, k2 + 1, k2] }
            } }
        }
        return SCNGeometry(sources: [SCNGeometrySource(vertices: pos), SCNGeometrySource(normals: nor), SCNGeometrySource(textureCoordinates: uv)],
                           elements: [SCNGeometryElement(indices: idx, primitiveType: .triangles)])
    }
    @discardableResult
    static func pieza(_ g: SCNGeometry, _ m: SCNMaterial, _ x: Float, _ y: Float, _ z: Float, _ p: SCNNode) -> SCNNode {
        g.materials = [m]; let n = SCNNode(geometry: g); n.position = SCNVector3(x, y, z); n.castsShadow = true; p.addChildNode(n); return n
    }
    /// ribete: un tubo fino que recorre el contorno de un almohadón (a la altura y del borde)
    static func ribete(_ w: Float, _ l: Float, _ y: Float, _ m: SCNMaterial, _ p: SCNNode, r: CGFloat = 0.009) {
        for (x, z, largo, girado) in [(0, l / 2, w, false), (0, -l / 2, w, false), (w / 2, 0, l, true), (-w / 2, 0, l, true)] as [(Float, Float, Float, Bool)] {
            let t = SCNCapsule(capRadius: r, height: CGFloat(largo) - 0.05); t.radialSegmentCount = 10; t.materials = [m]
            let n = SCNNode(geometry: t); n.position = SCNVector3(x, y, z)
            n.eulerAngles = girado ? SCNVector3(Float.pi / 2, 0, 0) : SCNVector3(0, 0, Float.pi / 2)
            p.addChildNode(n)
        }
    }

    // ---------- materiales con relieve (texturas hechas en código) ----------
    /// alto de un "papel" de ruido: granitos + arrugas suaves; de ahí sale el mapa de normales
    static func relieve(_ tam: Int, grano: Int, arrugas: Int, tejido: Bool, semilla: UInt64) -> (CGImage?, CGImage?) {
        var r = semilla
        func rnd() -> Float { r = r &* 6364136223846793005 &+ 1442695040888963407; return Float(r >> 40) / Float(1 << 24) }
        var hgt = [Float](repeating: 0, count: tam * tam)
        if tejido {
            for y in 0..<tam { for x in 0..<tam {
                let a = sin(Float(x) * 0.9) * 0.5 + 0.5, b = sin(Float(y) * 0.9) * 0.5 + 0.5
                hgt[y * tam + x] = ((x / 4 + y / 4) % 2 == 0 ? a : b) * 0.6 + rnd() * 0.25
            } }
        } else {
            for _ in 0..<grano {   // poros del cuero
                let cx = Int(rnd() * Float(tam)), cy = Int(rnd() * Float(tam)), rr = 1 + Int(rnd() * 2.5)
                for dy in -rr...rr { for dx in -rr...rr where dx * dx + dy * dy <= rr * rr {
                    let i = ((cy + dy + tam) % tam) * tam + (cx + dx + tam) % tam; hgt[i] -= 0.35
                } }
            }
            for _ in 0..<arrugas {   // arrugas largas y suaves
                var x = rnd() * Float(tam), y = rnd() * Float(tam), ang = rnd() * 6.28
                for _ in 0..<Int(30 + rnd() * 60) {
                    for d in -2...2 { let i = ((Int(y) + d + tam) % tam) * tam + (Int(x) + tam) % tam; hgt[i] -= 0.5 * (1 - Float(abs(d)) / 3) }
                    x += cos(ang) * 1.5; y += sin(ang) * 1.5; ang += (rnd() - 0.5) * 0.3
                }
            }
        }
        // suavizado (dos pasadas de caja)
        for _ in 0..<2 {
            var o = hgt
            for y in 0..<tam { for x in 0..<tam {
                var s: Float = 0
                for dy in -1...1 { for dx in -1...1 { s += hgt[((y + dy + tam) % tam) * tam + (x + dx + tam) % tam] } }
                o[y * tam + x] = s / 9
            } }
            hgt = o
        }
        // normales y rugosidad
        var nb = [UInt8](repeating: 255, count: tam * tam * 4), rb = [UInt8](repeating: 255, count: tam * tam * 4)
        let k: Float = tejido ? 2.2 : 3.2
        for y in 0..<tam { for x in 0..<tam {
            let hx = hgt[y * tam + (x + 1) % tam] - hgt[y * tam + (x - 1 + tam) % tam]
            let hy = hgt[((y + 1) % tam) * tam + x] - hgt[((y - 1 + tam) % tam) * tam + x]
            var n = SIMD3<Float>(-hx * k, -hy * k, 1); n = simd_normalize(n)
            let i = (y * tam + x) * 4
            nb[i] = UInt8((n.x * 0.5 + 0.5) * 255); nb[i + 1] = UInt8((n.y * 0.5 + 0.5) * 255); nb[i + 2] = UInt8((n.z * 0.5 + 0.5) * 255)
            let rv = UInt8(max(0, min(255, 150 - hgt[y * tam + x] * 120)))
            rb[i] = rv; rb[i + 1] = rv; rb[i + 2] = rv
        } }
        func img(_ b: [UInt8]) -> CGImage? {
            let cs = CGColorSpaceCreateDeviceRGB()
            return b.withUnsafeBytes { p in
                CGContext(data: UnsafeMutableRawPointer(mutating: p.baseAddress!), width: tam, height: tam, bitsPerComponent: 8, bytesPerRow: tam * 4,
                          space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)?.makeImage()
            }
        }
        return (img(nb), img(rb))
    }
    static func material(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, tejido: Bool, escala: Float, brillo: Double) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = CGColor(srgbRed: r, green: g, blue: b, alpha: 1)
        let (n, rg) = relieve(256, grano: tejido ? 0 : 900, arrugas: tejido ? 0 : 5, tejido: tejido, semilla: tejido ? 7 : 3)
        m.normal.contents = n; m.normal.intensity = tejido ? 0.5 : 0.35
        m.roughness.contents = rg; m.roughness.intensity = CGFloat(1 - brillo)
        for p in [m.normal, m.roughness] {
            p.wrapS = .repeat; p.wrapT = .repeat; p.mipFilter = .linear; p.maxAnisotropy = 8
            p.contentsTransform = SCNMatrix4MakeScale(.init(escala), .init(escala), 1)
        }
        m.metalness.contents = NSNumber(value: 0)
        if !tejido { m.clearCoat.contents = NSNumber(value: 0.12); m.clearCoatRoughness.contents = NSNumber(value: 0.35) }
        return m
    }
    static let cognac = material(0.27, 0.12, 0.05, tejido: false, escala: 2.5, brillo: 0.45)
    static let cognacOscuro = material(0.17, 0.07, 0.03, tejido: false, escala: 2.5, brillo: 0.4)
    static let tela = material(0.24, 0.255, 0.275, tejido: true, escala: 6, brillo: 0.05)
    static let costura = D.pbr(0.10, 0.05, 0.025, rough: 0.6)

    /// pata cónica de bronce cepillado
    static func pata(_ x: Float, _ z: Float, _ alto: CGFloat, _ p: SCNNode) {
        let g = SCNCone(topRadius: 0.024, bottomRadius: 0.013, height: alto); g.radialSegmentCount = 20; g.materials = [D.bronce]
        let n = SCNNode(geometry: g); n.position = SCNVector3(x, Float(alto) / 2, z); p.addChildNode(n)
    }

    /// tubo recto entre dos puntos (patas, marcos, barras)
    @discardableResult
    static func tubo(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ r: CGFloat, _ m: SCNMaterial, _ p: SCNNode, lados: Int = 18) -> SCNNode {
        let d = b - a, L = simd_length(d)
        let g = SCNCylinder(radius: r, height: CGFloat(L)); g.radialSegmentCount = lados; g.materials = [m]
        let n = SCNNode(geometry: g); n.simdPosition = (a + b) / 2
        n.simdOrientation = simd_quatf(from: SIMD3(0, 1, 0), to: simd_normalize(d)); n.castsShadow = true
        p.addChildNode(n); return n
    }
    static let metalNegro = D.pbr(0.035, 0.035, 0.04, rough: 0.35, metal: 0.8)

    // ---------- sillón moderno de cuero (Santi 19/11: "moderno, no antiguo"): el asiento mira hacia -z; 0,9 × 0,85 m ----------
    /// líneas rectas y finas: brazos delgados, respaldo bajo, almohadones mullidos y patas finas de metal negro con punta de bronce
    static func sillon(ancho: CGFloat = 0.9, fondo: CGFloat = 0.85) -> SCNNode {
        let s = SCNNode(), a = Float(ancho), f = Float(fondo)
        // base que "flota" sobre las patas
        pieza(mullido(ancho, 0.14, fondo, r: 0.025, infla: 0.002), cognac, 0, 0.2, 0, s)
        // brazos finos y rectos
        for sx: Float in [-1, 1] { pieza(mullido(0.07, 0.36, fondo, r: 0.025, infla: 0.002), cognac, sx * (a / 2 - 0.035), 0.37, 0, s) }
        // respaldo recto, bajo
        pieza(mullido(ancho - 0.14, 0.42, 0.1, r: 0.03, infla: 0.003), cognac, 0, 0.48, f / 2 - 0.05, s)
        // almohadones: asiento y respaldo, mullidos
        pieza(mullido(ancho - 0.16, 0.13, fondo - 0.14, r: 0.04, infla: 0.016), cognac, 0, 0.335, -0.06, s)
        let resp = pieza(mullido(ancho - 0.18, 0.34, 0.14, r: 0.045, infla: 0.014), cognac, 0, 0.58, f / 2 - 0.15, s); resp.eulerAngles.x = 0.12
        // patas finas, un poco abiertas
        for sx: Float in [-1, 1] { for sz: Float in [-1, 1] {
            let arriba = SIMD3<Float>(sx * (a / 2 - 0.06), 0.13, sz * (f / 2 - 0.06)), abajo = SIMD3<Float>(sx * (a / 2 - 0.03), 0.012, sz * (f / 2 - 0.03))
            tubo(arriba, abajo, 0.011, metalNegro, s, lados: 12)
            let punta = SCNCylinder(radius: 0.012, height: 0.012); punta.materials = [D.bronce]
            let n = SCNNode(geometry: punta); n.simdPosition = abajo - SIMD3(0, 0.006, 0); s.addChildNode(n)
        } }
        return s
    }

    // ---------- sofá seccional moderno (frente hacia +z): base de tela, 3 asientos de cuero, cojines y chaise a la derecha ----------
    static func sofa() -> SCNNode {
        let s = SCNNode()
        pieza(mullido(3.2, 0.2, 0.95, r: 0.025, infla: 0.002), tela, 0, 0.2, 0, s)
        pieza(mullido(3.2, 0.62, 0.16, r: 0.03, infla: 0.003), tela, 0, 0.53, -0.4, s)
        pieza(mullido(0.12, 0.42, 0.95, r: 0.03, infla: 0.002), tela, -1.54, 0.39, 0, s)
        for x: Float in [-0.9, 0, 0.9] {
            pieza(mullido(0.86, 0.14, 0.76, r: 0.04, infla: 0.016), cognac, x, 0.37, 0.07, s)
            let r = pieza(mullido(0.84, 0.42, 0.16, r: 0.045, infla: 0.014), cognac, x, 0.67, -0.25, s); r.eulerAngles.x = -0.12
        }
        for (k, (x, c)) in [(Float(-1.15), (0.54, 0.43, 0.24)), (1.12, (0.91, 0.87, 0.82)), (0.75, (0.18, 0.35, 0.24))].enumerated() {
            let m = material(CGFloat(c.0), CGFloat(c.1), CGFloat(c.2), tejido: true, escala: 4, brillo: 0.05)
            let n = pieza(mullido(0.4, 0.4, 0.12, r: 0.07, infla: 0.03), m, x, 0.62, -0.1, s)
            n.eulerAngles = SCNVector3(-0.22, k == 0 ? 0.2 : -0.15, k == 0 ? -0.06 : 0.08)
        }
        // chaise
        pieza(mullido(0.95, 0.2, 1.4, r: 0.025, infla: 0.002), tela, 2.07, 0.2, 0.7, s)
        pieza(mullido(0.86, 0.14, 1.32, r: 0.04, infla: 0.016), cognac, 2.07, 0.37, 0.72, s)
        pieza(mullido(0.12, 0.42, 1.4, r: 0.03, infla: 0.002), tela, 2.6, 0.39, 0.7, s)
        // patas finas de metal negro
        for (x, z) in [(Float(-1.55), Float(-0.42)), (-1.55, 0.42), (0, -0.42), (1.55, -0.42), (2.6, -0.42), (2.6, 1.35), (1.6, 1.35), (1.55, 0.42)] {
            tubo(SIMD3(x, 0.11, z), SIMD3(x, 0, z), 0.012, metalNegro, s, lados: 12)
        }
        s.enumerateHierarchy { n, _ in n.castsShadow = true }
        return s
    }

    // ---------- silla de la sala de juntas: ejecutiva moderna, cuero cognac y base de aluminio (frente hacia -z) ----------
    /// asiento a 0,47 m como las del web; respaldo alto con curva, apoyabrazos finos y base de 5 rayos con ruedas
    static func sillaJunta() -> SCNNode {
        let s = SCNNode()
        let alu = D.cromo
        // asiento mullido y su bandeja
        pieza(mullido(0.52, 0.035, 0.5, r: 0.015, infla: 0), metalNegro, 0, 0.43, 0, s)
        pieza(mullido(0.54, 0.09, 0.52, r: 0.04, infla: 0.015), cognac, 0, 0.49, -0.01, s)
        // respaldo alto: dos piezas (lumbar y alta) con una costura entre medio, apenas curvas hacia adelante
        let r = SCNNode(); r.position = SCNVector3(0, 0.55, 0.25); r.eulerAngles.x = 0.12; s.addChildNode(r)
        pieza(mullido(0.5, 0.36, 0.09, r: 0.04, infla: 0.012), cognac, 0, 0.2, 0, r)
        let alto = pieza(mullido(0.48, 0.42, 0.08, r: 0.04, infla: 0.01), cognac, 0, 0.6, 0.015, r); alto.eulerAngles.x = 0.06
        pieza(mullido(0.52, 0.8, 0.03, r: 0.012, infla: 0), metalNegro, 0, 0.4, 0.06, r)   // carcasa de atrás
        // apoyabrazos: un arco de aluminio con apoyo de cuero
        for sx: Float in [-1, 1] {
            let x = sx * 0.3
            tubo(SIMD3(x, 0.45, 0.12), SIMD3(x, 0.68, 0.05), 0.012, alu, s, lados: 12)
            tubo(SIMD3(x, 0.45, -0.12), SIMD3(x, 0.66, -0.12), 0.012, alu, s, lados: 12)
            pieza(mullido(0.06, 0.035, 0.32, r: 0.015, infla: 0.002), cognac, x, 0.69, -0.04, s)
        }
        // columna de gas y base de 5 rayos con ruedas
        tubo(SIMD3(0, 0.42, 0), SIMD3(0, 0.1, 0), 0.025, alu, s)
        tubo(SIMD3(0, 0.25, 0), SIMD3(0, 0.1, 0), 0.034, metalNegro, s)
        for k in 0..<5 {
            let a = Float(k) * 2 * .pi / 5, d = SIMD3<Float>(sin(a), 0, cos(a))
            tubo(SIMD3(0, 0.1, 0), d * 0.3 + SIMD3(0, 0.07, 0), 0.016, alu, s, lados: 10)
            let rueda = SCNCylinder(radius: 0.028, height: 0.025); rueda.radialSegmentCount = 16; rueda.materials = [metalNegro]
            let n = SCNNode(geometry: rueda); n.simdPosition = d * 0.3 + SIMD3(0, 0.028, 0); n.eulerAngles = SCNVector3(0, -a, Float.pi / 2); s.addChildNode(n)
        }
        s.enumerateHierarchy { n, _ in n.castsShadow = true }
        return s
    }
}

extension Muebles3D {
    /// pone el sofá, los 5 sillones, las 10 sillas de la sala de juntas y el gym nuevos, en los mismos lugares que la web
    static func ponerTodo(en r: SCNNode) {
        let sf = sofa(); sf.position = SCNVector3(12.5, 0, -7.6); r.addChildNode(sf)
        let pi = Float.pi
        let lugares: [(Float, Float, Float, CGFloat, CGFloat)] = [(10.6, -5.8, -0.8, 0.9, 0.85), (25.6, -5.6, -pi / 2, 0.9, 0.85),
                                                                 (27.6, -5.6, pi / 2, 0.9, 0.85), (-4.3, 17.0, -pi / 2, 0.85, 0.8), (-2.1, 17.0, pi / 2, 0.85, 0.8)]
        for (x, z, rot, an, fo) in lugares {
            let s = sillon(ancho: an, fondo: fo); s.position = SCNVector3(x, 0, z); s.eulerAngles = SCNVector3(0, rot, 0); r.addChildNode(s)
        }
        let cx: Float = 3, cz: Float = -6.4
        var sillas: [(Float, Float, Float)] = []
        for d: Float in [-1.8, -0.6, 0.6, 1.8] { sillas.append((cx + d, cz - 1.4, pi)); sillas.append((cx + d, cz + 1.4, 0)) }
        sillas.append((cx - 3.25, cz, -pi / 2)); sillas.append((cx + 3.25, cz, pi / 2))
        for (x, z, rot) in sillas { let s = sillaJunta(); s.position = SCNVector3(x, 0, z); s.eulerAngles = SCNVector3(0, rot, 0); r.addChildNode(s) }
        r.addChildNode(Gym3D.gym())
    }
}
