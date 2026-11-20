import Foundation
import SceneKit
import CoreGraphics

/// Arma la oficina 3D nativa a partir de lo que exporta la oficina web (oficina.json + oficina.bin + tex/*.png).
/// Corre igual en el iPhone y en la Mac (sin UIKit), así se puede revisar con fotos sin el simulador.
enum Oficina3D {
    struct Archivo: Decodable {
        struct Geo: Decodable { let id: String; let n: Int; let pos: Int; let nor: Int?; let uv: Int?; let idx: Int?; let ni: Int?; let grupos: [[Int]] }
        struct TexInfo: Decodable { let id: String; let `repeat`: [Double]; let offset: [Double]; let wrap: Bool }
        struct Mat: Decodable {
            let id: String; let tipo: String; let color: [Double]; let opacidad: Double; let transparente: Bool; let doble: Bool; let atras: Bool
            let rough: Double; let metal: Double; let emisivo: [Double]?; let emisivoI: Double; let mapa: String?; let mapaEmisivo: String?
            let escribeProf: Bool; let mapaInfo: TexInfo?
        }
        struct Nodo: Decodable { let g: String; let m: [String]; let x: [Float]; let som: Bool; let rec: Bool }
        struct Luz: Decodable { let tipo: String; let color: [Double]; let i: Double; let m: [Float]; let dist: Double?; let suelo: [Double]?; let objetivo: [Float]?; let sombra: Bool? }
        let geometrias: [Geo]; let materiales: [Mat]; let nodos: [Nodo]; let luces: [Luz]; let fondo: [Double]?
    }

    /// colores de three.js (lineales) a sRGB, como los muestra la oficina web
    static var gamma = 1.0
    /// calidad alta (Santi 18/11: "un poco más elevado el nivel de detalle"): reflejos del ambiente, sombras suaves,
    /// oclusión ambiental, desenfoque de profundidad suave, brillo en las luces y un tono cálido de cine
    static var alta = true
    static var brillo = 0.72
    /// Parte 6: las cajas de los muebles vistas desde arriba (x0, x1, z0, z1), para que Santi choque al caminar
    static var solidos: [SIMD4<Float>] = []

    /// caja (vista desde arriba) de una pieza: sin lo plano del piso, sin lo que cuelga arriba de la cabeza ni lo enorme
    static func caja(_ nodo: SCNNode) -> SIMD4<Float>? {
        guard let g = nodo.geometry else { return nil }
        let (lo, hi) = g.boundingBox
        var mn = SIMD3<Float>(repeating: .infinity), mx = SIMD3<Float>(repeating: -.infinity)
        for i in 0..<8 {
            let c = SCNVector3(i & 1 == 0 ? lo.x : hi.x, i & 2 == 0 ? lo.y : hi.y, i & 4 == 0 ? lo.z : hi.z)
            let w = nodo.convertPosition(c, to: nil)
            let v = SIMD3<Float>(Float(w.x), Float(w.y), Float(w.z)); mn = simd_min(mn, v); mx = simd_max(mx, v)
        }
        guard mx.y - mn.y > 0.05, mn.y < 1.9, mx.x - mn.x < 9 || mx.z - mn.z < 9 else { return nil }
        return SIMD4(mn.x, mx.x, mn.z, mx.z)
    }
    static func srgb(_ c: [Double], _ k: Double = 1) -> CGColor {
        func f(_ x: Double) -> CGFloat { CGFloat(pow(max(0, min(1, x * k)), 1 / gamma)) }
        return CGColor(srgbRed: f(c[0]), green: f(c[1]), blue: f(c[2]), alpha: 1)
    }

    static func matriz(_ e: [Float]) -> SCNMatrix4 {
        SCNMatrix4(m11: .init(e[0]), m12: .init(e[1]), m13: .init(e[2]), m14: .init(e[3]),
                   m21: .init(e[4]), m22: .init(e[5]), m23: .init(e[6]), m24: .init(e[7]),
                   m31: .init(e[8]), m32: .init(e[9]), m33: .init(e[10]), m34: .init(e[11]),
                   m41: .init(e[12]), m42: .init(e[13]), m43: .init(e[14]), m44: .init(e[15]))
    }

    /// Construye la escena. `carpeta` tiene oficina.json, oficina.bin y tex/.
    static func escena(carpeta: URL) throws -> SCNScene {
        let a = try JSONDecoder().decode(Archivo.self, from: Data(contentsOf: carpeta.appendingPathComponent("oficina.json")))
        let bin = try Data(contentsOf: carpeta.appendingPathComponent("oficina.bin"))
        let escena = SCNScene()

        // ---------- materiales ----------
        var mats: [String: SCNMaterial] = [:]
        // materiales iguales comparten el mismo objeto: así, al juntar la nave en pocas piezas, se dibujan juntos
        // (eran 400 materiales y solo 156 distintos)
        var iguales: [String: SCNMaterial] = [:]
        for m in a.materiales {
            let clave = "\(m.tipo)|\(m.color)|\(m.opacidad)|\(m.transparente)|\(m.doble)|\(m.atras)|\(m.rough)|\(m.metal)|\(m.emisivo ?? [])|\(m.emisivoI)|\(m.mapa ?? "")|\(m.mapaEmisivo ?? "")|\(m.escribeProf)|\(m.mapaInfo.map { "\($0.`repeat`)\($0.offset)\($0.wrap)" } ?? "")"
            if let ya = iguales[clave] { mats[m.id] = ya; continue }
            let s = SCNMaterial()
            let basico = m.tipo == "MeshBasicMaterial"
            s.lightingModel = basico ? .constant : .physicallyBased
            if let t = m.mapa {
                s.diffuse.contents = carpeta.appendingPathComponent("tex/\(t).png")
                if let i = m.mapaInfo {
                    s.diffuse.contentsTransform = SCNMatrix4MakeScale(.init(i.`repeat`[0]), .init(i.`repeat`[1]), 1)
                    if i.wrap { s.diffuse.wrapS = .repeat; s.diffuse.wrapT = .repeat }
                }
                if m.color.contains(where: { $0 < 0.99 }) { s.multiply.contents = srgb(m.color) }
            } else {
                s.diffuse.contents = srgb(m.color)
            }
            s.diffuse.mipFilter = .linear
            // sin esto las texturas finas (hojas de las plantas, tierra de las macetas) titilan al mover la cámara (Santi, 19/11)
            s.diffuse.maxAnisotropy = 8; s.emission.mipFilter = .linear; s.multiply.mipFilter = .linear
            if !basico {
                s.roughness.contents = NSNumber(value: m.rough)
                s.metalness.contents = NSNumber(value: m.metal)
                if let t = m.mapaEmisivo { s.emission.contents = carpeta.appendingPathComponent("tex/\(t).png") }
                else if let e = m.emisivo, e.contains(where: { $0 > 0.001 }) { s.emission.contents = srgb(e, m.emisivoI) }
            }
            if m.transparente || m.opacidad < 0.999 {
                s.transparency = CGFloat(m.opacidad)
                s.blendMode = .alpha
                s.transparencyMode = .aOne
                s.writesToDepthBuffer = m.escribeProf && m.opacidad > 0.95
            }
            s.isDoubleSided = m.doble
            if m.atras { s.cullMode = .front }
            mats[m.id] = s; iguales[clave] = s
        }

        // ---------- geometrías ----------
        func floats(_ off: Int, _ n: Int) -> [Float] {
            bin.withUnsafeBytes { r in Array(UnsafeBufferPointer(start: r.baseAddress!.advanced(by: off).assumingMemoryBound(to: Float.self), count: n)) }
        }
        func uints(_ off: Int, _ n: Int) -> [UInt32] {
            bin.withUnsafeBytes { r in Array(UnsafeBufferPointer(start: r.baseAddress!.advanced(by: off).assumingMemoryBound(to: UInt32.self), count: n)) }
        }
        var fuentes: [String: ([SCNGeometrySource], [UInt32], [[Int]])] = [:]
        for g in a.geometrias {
            var src: [SCNGeometrySource] = []
            let p = floats(g.pos, g.n * 3)
            src.append(SCNGeometrySource(vertices: stride(from: 0, to: p.count, by: 3).map { SCNVector3(p[$0], p[$0 + 1], p[$0 + 2]) }))
            if let o = g.nor {
                let q = floats(o, g.n * 3)
                src.append(SCNGeometrySource(normals: stride(from: 0, to: q.count, by: 3).map { SCNVector3(q[$0], q[$0 + 1], q[$0 + 2]) }))
            }
            if let o = g.uv {
                let u = floats(o, g.n * 2)
                src.append(SCNGeometrySource(textureCoordinates: stride(from: 0, to: u.count, by: 2).map { CGPoint(x: CGFloat(u[$0]), y: CGFloat(1 - u[$0 + 1])) }))
            }
            let idx: [UInt32] = g.idx.map { uints($0, g.ni ?? 0) } ?? (0..<UInt32(g.n)).map { $0 }
            fuentes[g.id] = (src, idx, g.grupos)
        }

        // ---------- piezas ----------
        let raiz = SCNNode(), vidrios = SCNNode()
        var cajas: [SIMD4<Float>] = []
        for n in a.nodos {
            guard let (src, idx, grupos) = fuentes[n.g] else { continue }
            var elementos: [SCNGeometryElement] = [], ms: [SCNMaterial] = []
            if grupos.isEmpty || n.m.count == 1 {
                elementos = [SCNGeometryElement(indices: idx, primitiveType: .triangles)]
                ms = [mats[n.m[0]] ?? SCNMaterial()]
            } else {
                for gr in grupos {
                    let ini = gr[0], cant = min(gr[1], idx.count - gr[0])
                    guard cant > 0 else { continue }
                    elementos.append(SCNGeometryElement(indices: Array(idx[ini..<ini + cant]), primitiveType: .triangles))
                    ms.append(mats[n.m[min(gr[2], n.m.count - 1)]] ?? SCNMaterial())
                }
            }
            let geo = SCNGeometry(sources: src, elements: elementos)
            geo.materials = ms
            let nodo = SCNNode(geometry: geo)
            nodo.transform = matriz(n.x)
            nodo.castsShadow = n.som
            if let c = caja(nodo) { cajas.append(c) }
            // lo transparente (vidrio, esmerilado) va aparte y se dibuja al final, para que se vea lo de atrás
            if ms.contains(where: { $0.transparency < 0.99 }) { nodo.renderingOrder = 100; nodo.castsShadow = false; vidrios.addChildNode(nodo) }
            else { raiz.addChildNode(nodo) }
        }
        // todo es fijo: se junta en pocas piezas para que el teléfono lo dibuje rápido
        let plano = raiz.flattenedClone()
        plano.name = "oficina"
        escena.rootNode.addChildNode(plano)
        vidrios.name = "vidrios"
        escena.rootNode.addChildNode(vidrios)

        // ---------- luces ----------
        for l in a.luces {
            let luz = SCNLight()
            let nodo = SCNNode()
            nodo.transform = matriz(l.m)
            switch l.tipo {
            case "HemisphereLight":
                luz.type = .ambient
                luz.color = srgb(zip(l.color, l.suelo ?? l.color).map { ($0 + $1) / 2 })
                luz.intensity = CGFloat(l.i * 900 * Oficina3D.brillo)
            case "DirectionalLight":
                luz.type = .directional
                luz.color = srgb(l.color)
                luz.intensity = CGFloat(l.i * 1300 * Oficina3D.brillo)
                if let o = l.objetivo { nodo.look(at: SCNVector3(o[0], o[1], o[2])) }
                if l.sombra == true {
                    luz.castsShadow = true
                    luz.shadowMode = .deferred
                    luz.shadowMapSize = CGSize(width: 2048, height: 2048)
                    luz.shadowSampleCount = 8
                    luz.shadowRadius = 3
                    luz.shadowColor = CGColor(gray: 0, alpha: 0.55)
                    luz.automaticallyAdjustsShadowProjection = true
                }
            default:
                luz.type = .omni
                luz.color = srgb(l.color)
                luz.intensity = CGFloat(l.i * 900 * Oficina3D.brillo)
                luz.attenuationStartDistance = 0
                luz.attenuationEndDistance = CGFloat(l.dist ?? 8)
                luz.attenuationFalloffExponent = 2
            }
            nodo.light = luz
            escena.rootNode.addChildNode(nodo)
        }
        Detalle3D.ponerPuestos(en: escena.rootNode)
        // los escritorios con detalle también chocan (las sillas no: se mueven)
        for (id, _, _) in Detalle3D.puestos {
            escena.rootNode.childNode(withName: "puesto-\(id)", recursively: false)?.enumerateHierarchy { n, _ in
                if let nm = n.name, nm.hasPrefix("silla") { return }
                var p = n.parent; while let q = p { if q.name?.hasPrefix("silla") == true { return }; p = q.parent }
                if let c = caja(n) { cajas.append(c) }
            }
        }
        // (19/11) sofá y sillones modernos, sillas de la sala de juntas y gym con más realismo (Muebles3D / Gym3D): los
        // viejos se sacaron de oficina.json. También chocan; las luces del gym quedan aparte y lo demás se junta en pocas piezas
        Relojes3D.poner(en: escena.rootNode)
        Avion3D.poner(en: escena.rootNode)
        let muebles = SCNNode(); escena.rootNode.addChildNode(muebles)
        Muebles3D.ponerTodo(en: muebles)
        var luces: [SCNNode] = []
        muebles.enumerateHierarchy { n, _ in
            if n.light != nil { luces.append(n) } else if let c = caja(n) { cajas.append(c) }
        }
        for l in luces { let t = l.worldTransform; l.removeFromParentNode(); l.transform = t; escena.rootNode.addChildNode(l) }
        // el gym va aparte, marcado para que sus 3 luces solo lo iluminen a él (y no a toda la nave)
        if let gym = muebles.childNode(withName: "gym", recursively: false) {
            gym.removeFromParentNode()
            let g = gym.flattenedClone(); g.name = "gym"; g.categoryBitMask = 1 | 2
            escena.rootNode.addChildNode(g)
        }
        let juntos = muebles.flattenedClone(); juntos.name = "muebles"
        muebles.removeFromParentNode(); escena.rootNode.addChildNode(juntos)
        solidos = cajas
        if alta { mejorar(escena, raiz: plano); mejorar(escena, raiz: vidrios, luces: false) }
        if let f = a.fondo { escena.background.contents = CGColor(srgbRed: CGFloat(f[0]), green: CGFloat(f[1]), blue: CGFloat(f[2]), alpha: 1) }

        // ---------- cámara: la misma vista general de la oficina web ----------
        let cam = SCNCamera()
        cam.fieldOfView = 38
        cam.zNear = 0.25; cam.zFar = 160   // (19/11) más precisión de profundidad: con 0,1 las piezas muy juntas titilaban
        cam.wantsHDR = true
        cam.exposureOffset = -0.25
        cam.wantsExposureAdaptation = false
        cam.bloomIntensity = 0.1; cam.bloomThreshold = 1.2
        cam.screenSpaceAmbientOcclusionIntensity = 0.6
        let ncam = SCNNode()
        ncam.name = "camara"
        ncam.camera = cam
        ncam.position = SCNVector3(23, 26, 33)
        ncam.look(at: SCNVector3(5, 0, 1.5))
        escena.rootNode.addChildNode(ncam)
        if alta {
            cam.screenSpaceAmbientOcclusionIntensity = 1.4
            cam.screenSpaceAmbientOcclusionRadius = 0.9
            cam.screenSpaceAmbientOcclusionNormalThreshold = 0.25
            cam.bloomIntensity = 0.22; cam.bloomThreshold = 1.0; cam.bloomBlurRadius = 8
            cam.contrast = 0.12; cam.saturation = 1.08
            cam.vignettingIntensity = 0.55; cam.vignettingPower = 0.8
            cam.wantsDepthOfField = false   // en el teléfono se mueve la cámara todo el tiempo: sin desenfoque
            cam.focusDistance = 38; cam.fStop = 4.5; cam.apertureBladeCount = 6; cam.focalBlurSampleCount = 14
            cam.colorGrading.contents = nil
            cam.exposureOffset = -0.15
        }
        return escena
    }

    /// Mapa de ambiente hecho en código (equirectangular): techo cálido con tiras de luz, paredes oscuras y piso de mármol.
    /// Le da reflejos reales al mármol, al bronce, al vidrio y a las pantallas.
    static func ambiente() -> CGImage? {
        let w = 1024, h = 512
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: [
            CGColor(srgbRed: 0.10, green: 0.10, blue: 0.11, alpha: 1), CGColor(srgbRed: 0.42, green: 0.37, blue: 0.31, alpha: 1),
            CGColor(srgbRed: 0.18, green: 0.18, blue: 0.19, alpha: 1), CGColor(srgbRed: 0.55, green: 0.52, blue: 0.48, alpha: 1)] as CFArray,
                              locations: [0, 0.42, 0.55, 1])!
        ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: h), options: [])
        // tiras de luz LED del techo y ventanas altas
        ctx.setFillColor(CGColor(srgbRed: 1, green: 0.95, blue: 0.86, alpha: 1))
        for i in 0..<9 { ctx.fill(CGRect(x: 40 + i * 110, y: h - 70, width: 70, height: 10)) }
        ctx.setFillColor(CGColor(srgbRed: 0.75, green: 0.82, blue: 0.95, alpha: 0.9))
        for i in 0..<6 { ctx.fill(CGRect(x: 60 + i * 160, y: h / 2 + 40, width: 110, height: 26)) }
        return ctx.makeImage()
    }

    static func mejorar(_ e: SCNScene, raiz: SCNNode, luces: Bool = true) {
        if luces, let amb = ambiente() { e.lightingEnvironment.contents = amb; e.lightingEnvironment.intensity = 0.9 }
        var hechos = Set<ObjectIdentifier>()   // un material compartido se mejora una sola vez
        raiz.enumerateHierarchy { n, _ in
            let mats = (n.geometry?.materials ?? []).filter { hechos.insert(ObjectIdentifier($0)).inserted }
            // vidrio de las salas: transparente de verdad (antes era un panel lechoso)
            for m in mats where m.lightingModel == .constant && m.transparency < 0.9 && m.transparency > 0.3 {
                m.transparency = 0.35   // franja esmerilada: más suave
            }
            for m in mats where m.lightingModel == .physicallyBased && m.transparency < 0.5 {
                // vidrio ahumado: casi invisible, con un leve tono (el físico en SceneKit se veía lechoso por los reflejos)
                m.lightingModel = .constant
                m.diffuse.contents = CGColor(srgbRed: 0.55, green: 0.62, blue: 0.68, alpha: 1)
                m.transparency = 0.07; m.isDoubleSided = false; m.transparencyMode = .singleLayer
            }
            for m in mats where m.lightingModel == .physicallyBased && m.transparency >= 0.5 {
                let r = (m.roughness.contents as? NSNumber)?.doubleValue ?? 0.7
                let met = (m.metalness.contents as? NSNumber)?.doubleValue ?? 0
                // superficies pulidas (mármol, bronce, cromo, vidrio): más brillo y una capa de laca
                if r < 0.35 || met > 0.5 {
                    m.roughness.contents = NSNumber(value: max(0.06, r * 0.7))
                    m.clearCoat.contents = NSNumber(value: met > 0.5 ? 0.2 : 0.6)
                    m.clearCoatRoughness.contents = NSNumber(value: 0.08)
                }
            }
        }
        for n in e.rootNode.childNodes where luces && n.light != nil {
            guard let l = n.light else { continue }
            if l.type == .directional && l.castsShadow {
                l.shadowMapSize = CGSize(width: 4096, height: 4096); l.shadowSampleCount = 16; l.shadowRadius = 5
                l.shadowColor = CGColor(gray: 0, alpha: 0.62)
            }
            if l.type == .omni { l.intensity *= 0.9; l.castsShadow = false }
            if l.type == .ambient { l.intensity *= 0.55 }   // el ambiente ya ilumina; menos luz plana = más volumen
        }
    }
}
