import Foundation
import SceneKit
import CoreGraphics

/// Las personas de la oficina (parte 2, 18/11): los personajes de Mixamo con su esqueleto y las animaciones que la oficina
/// web ya preparó (grabadas hueso por hueso a 30 cuadros por segundo). Carpeta Personas: m0..m5.json + .bin.z + tex/.
enum Personas3D {
    struct Modelo: Decodable {
        struct Mat: Decodable { let color: [Double]; let rough: Double; let metal: Double; let mapa: String?; let transparente: Bool; let opacidad: Double }
        struct Malla: Decodable { let n: Int; let pos: Int; let nor: Int?; let uv: Int?; let si: Int; let sw: Int; let idx: Int?; let ni: Int
            let huesos: [Int]; let inversas: [[Float]]; let mat: Mat }
        struct Reposo: Decodable { let q: Int; let t: Int; let s: Int }
        struct Anim: Decodable { let dur: Double; let cuadros: Int; let giro: Double; let q: Int; let t: Int }
        let escala: Float; let nh: Int; let reposo: Reposo; let mallas: [Malla]; let anims: [String: Anim]; let fps: Double
    }

    final class Cargado {
        let m: Modelo; let bin: Data; let carpeta: URL
        var geos: [SCNGeometry?] = []
        init(m: Modelo, bin: Data, carpeta: URL) { self.m = m; self.bin = bin; self.carpeta = carpeta }
    }
    static var cache: [Int: Cargado] = [:]
    /// en la Mac (fotos de prueba) las animaciones siguen el tiempo de la escena; en el teléfono, el reloj real
    static var tiempoEscena = false
    /// los FBX de Mixamo ya traen la V como la espera SceneKit (los glTF venían al revés)
    static var invertirV = false
    static var dzSentado: Float = 0.95

    static func cargar(_ i: Int, carpeta: URL) throws -> Cargado {
        if let c = cache[i] { return c }
        let m = try JSONDecoder().decode(Modelo.self, from: Data(contentsOf: carpeta.appendingPathComponent("m\(i).json")))
        let z = try Data(contentsOf: carpeta.appendingPathComponent("m\(i).bin.z"))
        let bin = try (z as NSData).decompressed(using: .zlib) as Data
        let c = Cargado(m: m, bin: bin, carpeta: carpeta); cache[i] = c; return c
    }

    static func lee<T>(_ d: Data, _ off: Int, _ n: Int, _: T.Type) -> [T] {
        d.withUnsafeBytes { r in Array(UnsafeBufferPointer(start: r.baseAddress!.advanced(by: off).assumingMemoryBound(to: T.self), count: n)) }
    }

    static func m4(_ e: [Float]) -> SCNMatrix4 { Oficina3D.matriz(e) }

    static func material(_ c: Cargado, _ mt: Modelo.Mat) -> SCNMaterial {
        let s = SCNMaterial()
        s.lightingModel = .physicallyBased
        if let t = mt.mapa {
            let jpg = c.carpeta.appendingPathComponent("tex/\(t).jpg"), png = c.carpeta.appendingPathComponent("tex/\(t).png")
            s.diffuse.contents = FileManager.default.fileExists(atPath: jpg.path) ? jpg : png
        } else { s.diffuse.contents = Oficina3D.srgb(mt.color) }
        s.roughness.contents = NSNumber(value: max(0.45, mt.rough))
        s.metalness.contents = NSNumber(value: mt.metal)
        if mt.transparente || mt.opacidad < 1 { s.transparencyMode = .aOne; s.blendMode = .alpha; s.isDoubleSided = true }
        return s
    }

    /// Una persona nueva (cada agente tiene su propio esqueleto, aunque compartan modelo).
    static func persona(_ i: Int, carpeta: URL) throws -> SCNNode {
        let c = try cargar(i, carpeta: carpeta), m = c.m, bin = c.bin
        let raiz = SCNNode(); raiz.name = "persona"
        let modelo = SCNNode(); modelo.name = "modelo"; modelo.scale = SCNVector3(m.escala, m.escala, m.escala); raiz.addChildNode(modelo)
        // huesos "planos": cada uno cuelga del modelo con su posición ya calculada por la oficina web (centímetros de Mixamo)
        let rq = lee(bin, m.reposo.q, m.nh * 4, Float.self), rt = lee(bin, m.reposo.t, m.nh * 3, Float.self), rs = lee(bin, m.reposo.s, m.nh, Float.self)
        var huesos: [SCNNode] = []
        for k in 0..<m.nh {
            let n = SCNNode(); n.name = "h\(k)"
            n.position = SCNVector3(rt[k * 3], rt[k * 3 + 1], rt[k * 3 + 2])
            n.orientation = SCNQuaternion(rq[k * 4], rq[k * 4 + 1], rq[k * 4 + 2], rq[k * 4 + 3])
            n.scale = SCNVector3(rs[k], rs[k], rs[k])
            modelo.addChildNode(n); huesos.append(n)
        }
        if c.geos.isEmpty { c.geos = Array(repeating: nil, count: m.mallas.count) }
        for (k, ms) in m.mallas.enumerated() {
            var src: [SCNGeometrySource] = []
            let p = lee(bin, ms.pos, ms.n * 3, Float.self)
            src.append(SCNGeometrySource(vertices: stride(from: 0, to: p.count, by: 3).map { SCNVector3(p[$0], p[$0 + 1], p[$0 + 2]) }))
            if let o = ms.nor { let q = lee(bin, o, ms.n * 3, Float.self); src.append(SCNGeometrySource(normals: stride(from: 0, to: q.count, by: 3).map { SCNVector3(q[$0], q[$0 + 1], q[$0 + 2]) })) }
            if let o = ms.uv { let u = lee(bin, o, ms.n * 2, Float.self); src.append(SCNGeometrySource(textureCoordinates: stride(from: 0, to: u.count, by: 2).map { CGPoint(x: CGFloat(u[$0]), y: CGFloat(invertirV ? 1 - u[$0 + 1] : u[$0 + 1])) })) }
            let idx: [UInt32] = ms.idx.map { lee(bin, $0, ms.ni, UInt32.self) } ?? (0..<UInt32(ms.n)).map { $0 }
            let geo = SCNGeometry(sources: src, elements: [SCNGeometryElement(indices: idx, primitiveType: .triangles)])
            geo.materials = [material(c, ms.mat)]
            let pesos = SCNGeometrySource(data: bin.subdata(in: ms.sw..<(ms.sw + ms.n * 16)), semantic: .boneWeights, vectorCount: ms.n,
                                          usesFloatComponents: true, componentsPerVector: 4, bytesPerComponent: 4, dataOffset: 0, dataStride: 16)
            // los índices vienen sobre la lista total de huesos; el skinner usa solo los de esta malla
            let global = lee(bin, ms.si, ms.n * 4, UInt16.self)
            var aLocal: [Int: UInt16] = [:]; for (j, h) in ms.huesos.enumerated() { aLocal[h] = UInt16(j) }
            let loc = global.map { aLocal[Int($0)] ?? 0 }
            let indices = SCNGeometrySource(data: loc.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .boneIndices, vectorCount: ms.n,
                                            usesFloatComponents: false, componentsPerVector: 4, bytesPerComponent: 2, dataOffset: 0, dataStride: 8)
            let sk = SCNSkinner(baseGeometry: geo, bones: ms.huesos.map { huesos[$0] },
                                boneInverseBindTransforms: ms.inversas.map { NSValue(scnMatrix4: m4($0)) }, boneWeights: pesos, boneIndices: indices)
            sk.skeleton = modelo
            let nodo = SCNNode(geometry: geo); nodo.name = "malla\(k)"
            nodo.skinner = sk
            nodo.castsShadow = true
            modelo.addChildNode(nodo)
        }
        raiz.setValue(i, forKey: "modeloIdx")
        return raiz
    }

    /// Pone a la persona a hacer una animación (en bucle). Devuelve la duración.
    @discardableResult
    static func animar(_ raiz: SCNNode, _ nombre: String, carpeta: URL, desfase: Double = 0) -> Double {
        guard let i = raiz.value(forKey: "modeloIdx") as? Int, let c = try? cargar(i, carpeta: carpeta), let a = c.m.anims[nombre],
              let modelo = raiz.childNode(withName: "modelo", recursively: false) else { return 0 }
        modelo.eulerAngles.y = .init(a.giro)
        let H = c.m.nh, N = a.cuadros
        let q = lee(c.bin, a.q, N * H * 4, Int16.self), t = lee(c.bin, a.t, N * H * 3, Int16.self)
        let tiempos = (0..<N).map { NSNumber(value: Double($0) / Double(max(N - 1, 1))) }
        func anim(_ kp: String, _ vals: [NSValue]) -> SCNAnimation {
            let k = CAKeyframeAnimation(keyPath: kp)
            k.values = vals; k.keyTimes = tiempos; k.duration = a.dur; k.repeatCount = .infinity
            k.calculationMode = .linear; k.timeOffset = desfase.truncatingRemainder(dividingBy: max(a.dur, 0.01))
            k.usesSceneTimeBase = tiempoEscena
            return SCNAnimation(caAnimation: k)
        }
        for h in 0..<H {
            guard let n = modelo.childNode(withName: "h\(h)", recursively: false) else { continue }
            n.removeAllAnimations()
            n.addAnimation(anim("orientation", (0..<N).map { f in let b = (f * H + h) * 4
                return NSValue(scnVector4: SCNVector4(Float(q[b]) / 32767, Float(q[b + 1]) / 32767, Float(q[b + 2]) / 32767, Float(q[b + 3]) / 32767)) }), forKey: "q")
            n.addAnimation(anim("position", (0..<N).map { f in let b = (f * H + h) * 3
                return NSValue(scnVector3: SCNVector3(Float(t[b]) / 100, Float(t[b + 1]) / 100, Float(t[b + 2]) / 100)) }), forKey: "t")
        }
        return a.dur
    }

    /// Modelo de cada agente (MODELO de la oficina web) y dónde se sientan
    static let modelos: [String: Int] = ["gerente": 0, "santi": 1, "mkt": 1, "ana": 2, "ebay": 2, "fin": 3, "dem": 3, "wa": 4, "pedidos": 5, "nube": 5]

    /// Sienta a los 9 agentes en su puesto, tecleando (cada uno en un momento distinto de la animación).
    static func sentarEquipo(en raiz: SCNNode, carpeta: URL, animacion: (String) -> String = { _ in "teclear" }) {
        for (k, (id, x, z)) in Detalle3D.puestos.enumerated() {
            guard let i = modelos[id], let p = try? persona(i, carpeta: carpeta) else { continue }
            p.name = "persona-\(id)"
            p.position = SCNVector3(x, 0, z + Personas3D.dzSentado)   // en la silla, arrimado al escritorio
            p.eulerAngles.y = .pi
            raiz.addChildNode(p)
            animar(p, animacion(id), carpeta: carpeta, desfase: Double(k) * 0.77)
        }
    }
}
