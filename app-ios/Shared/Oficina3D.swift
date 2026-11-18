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
    static var brillo = 0.72
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
        for m in a.materiales {
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
            mats[m.id] = s
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
        let raiz = SCNNode()
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
            raiz.addChildNode(nodo)
        }
        // todo es fijo: se junta en pocas piezas para que el teléfono lo dibuje rápido
        let plano = raiz.flattenedClone()
        plano.name = "oficina"
        escena.rootNode.addChildNode(plano)

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
        if let f = a.fondo { escena.background.contents = CGColor(srgbRed: CGFloat(f[0]), green: CGFloat(f[1]), blue: CGFloat(f[2]), alpha: 1) }

        // ---------- cámara: la misma vista general de la oficina web ----------
        let cam = SCNCamera()
        cam.fieldOfView = 38
        cam.zNear = 0.1; cam.zFar = 220
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
        return escena
    }
}
