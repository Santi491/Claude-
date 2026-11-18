import Foundation
import SceneKit
import CoreGraphics

/// Muebles con más detalle para la oficina nativa (Santi 18/11: "un poco más elevado el nivel de detalle"):
/// bordes redondeados, materiales con laca, mármol pulido, bronce, cuero y una silla de verdad.
enum Detalle3D {
    static func pbr(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, rough: Double, metal: Double = 0, laca: Double = 0) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = CGColor(srgbRed: r, green: g, blue: b, alpha: 1)
        m.roughness.contents = NSNumber(value: rough)
        m.metalness.contents = NSNumber(value: metal)
        if laca > 0 { m.clearCoat.contents = NSNumber(value: laca); m.clearCoatRoughness.contents = NSNumber(value: 0.06) }
        return m
    }
    static var marmolNegro: SCNMaterial = {
        let m = pbr(0.06, 0.06, 0.065, rough: 0.12, laca: 0.8)
        // vetas: textura hecha en código
        let w = 512, h = 512
        if let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
            ctx.setFillColor(CGColor(srgbRed: 0.055, green: 0.055, blue: 0.06, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            var gen = SystemRandomNumberGenerator()
            for k in 0..<26 {
                ctx.setStrokeColor(CGColor(srgbRed: 0.55, green: 0.55, blue: 0.56, alpha: k % 5 == 0 ? 0.55 : 0.18))
                ctx.setLineWidth(k % 5 == 0 ? 1.6 : 0.7)
                var p = CGPoint(x: CGFloat.random(in: 0...CGFloat(w), using: &gen), y: 0)
                ctx.move(to: p)
                while p.y < CGFloat(h) {
                    p = CGPoint(x: p.x + CGFloat.random(in: -18...18, using: &gen), y: p.y + CGFloat.random(in: 10...30, using: &gen))
                    ctx.addLine(to: p)
                }
                ctx.strokePath()
            }
            m.diffuse.contents = ctx.makeImage()
        }
        return m
    }()
    static let grafito = pbr(0.13, 0.135, 0.14, rough: 0.45, metal: 0.3)
    static let bronce = pbr(0.79, 0.64, 0.36, rough: 0.22, metal: 1)
    static let cromo = pbr(0.85, 0.86, 0.88, rough: 0.12, metal: 1)
    static let cuero = pbr(0.05, 0.045, 0.04, rough: 0.38, laca: 0.35)
    static let plasticoNegro = pbr(0.04, 0.04, 0.045, rough: 0.5)
    static let gomaNegra = pbr(0.02, 0.02, 0.02, rough: 0.8)

    static func caja(_ w: CGFloat, _ h: CGFloat, _ l: CGFloat, r: CGFloat, _ m: SCNMaterial, _ x: Float, _ y: Float, _ z: Float, _ p: SCNNode) -> SCNNode {
        let g = SCNBox(width: w, height: h, length: l, chamferRadius: r); g.chamferSegmentCount = 4; g.materials = [m]
        let n = SCNNode(geometry: g); n.position = SCNVector3(x, y, z); p.addChildNode(n); return n
    }
    static func cil(_ r: CGFloat, _ h: CGFloat, _ m: SCNMaterial, _ x: Float, _ y: Float, _ z: Float, _ p: SCNNode) -> SCNNode {
        let g = SCNCylinder(radius: r, height: h); g.radialSegmentCount = 32; g.materials = [m]
        let n = SCNNode(geometry: g); n.position = SCNVector3(x, y, z); p.addChildNode(n); return n
    }
    static func capsula(_ r: CGFloat, _ h: CGFloat, _ m: SCNMaterial, _ p: SCNNode) -> SCNNode {
        let g = SCNCapsule(capRadius: r, height: h); g.radialSegmentCount = 24; g.materials = [m]
        let n = SCNNode(geometry: g); p.addChildNode(n); return n
    }

    /// Pantalla con un tablero de ejemplo (líneas y barras) que brilla
    static func pantalla(_ w: Int = 640, _ h: Int = 380, tono: CGColor = CGColor(srgbRed: 0.31, green: 0.82, blue: 0.91, alpha: 1)) -> CGImage? {
        guard let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        c.setFillColor(CGColor(srgbRed: 0.04, green: 0.05, blue: 0.07, alpha: 1)); c.fill(CGRect(x: 0, y: 0, width: w, height: h))
        c.setFillColor(CGColor(srgbRed: 0.79, green: 0.64, blue: 0.36, alpha: 1)); c.fill(CGRect(x: 24, y: h - 46, width: 120, height: 10))
        for i in 0..<7 {
            c.setFillColor(i % 3 == 0 ? CGColor(srgbRed: 0.36, green: 0.84, blue: 0.6, alpha: 1) : tono)
            c.fill(CGRect(x: 24 + i * 46, y: 40, width: 30, height: 40 + (i * 37 % 150)))
        }
        c.setStrokeColor(tono); c.setLineWidth(3)
        c.move(to: CGPoint(x: 380, y: 80))
        for i in 1...10 { c.addLine(to: CGPoint(x: 380 + i * 24, y: 80 + Int(70 + 50 * sin(Double(i) * 0.9)))) }
        c.strokePath()
        return c.makeImage()
    }

    /// Puesto de trabajo con detalle: escritorio de mármol negro con canto de bronce, monitor con brazo, teclado,
    /// mouse, lámpara y silla ejecutiva de cuero con base de 5 rueditas. Mira hacia -z (como los de la oficina).
    static func puesto() -> SCNNode {
        let p = SCNNode()
        // escritorio
        caja(1.8, 0.045, 0.8, r: 0.012, marmolNegro, 0, 0.745, 0, p)
        caja(1.8, 0.012, 0.01, r: 0.004, bronce, 0, 0.738, 0.401, p)
        for s: Float in [-1, 1] { caja(0.05, 0.72, 0.74, r: 0.012, grafito, s * 0.86, 0.36, 0, p) }
        caja(1.62, 0.32, 0.02, r: 0.008, grafito, 0, 0.5, -0.33, p)
        // monitor
        caja(0.25, 0.012, 0.18, r: 0.006, cromo, 0, 0.774, -0.2, p)
        cil(0.018, 0.32, cromo, 0, 0.93, -0.22, p)
        let mon = caja(0.66, 0.39, 0.025, r: 0.01, plasticoNegro, 0, 1.13, -0.2, p)
        let scr = SCNPlane(width: 0.63, height: 0.355)
        let sm = SCNMaterial(); sm.lightingModel = .constant; sm.diffuse.contents = pantalla(); sm.emission.contents = pantalla(); sm.emission.intensity = 0.9
        scr.materials = [sm]
        let sn = SCNNode(geometry: scr); sn.position = SCNVector3(0, 0, 0.0135); mon.addChildNode(sn)
        // teclado, teclas y mouse
        let tec = caja(0.44, 0.018, 0.14, r: 0.006, plasticoNegro, -0.05, 0.775, 0.12, p)
        let teclaG = SCNBox(width: 0.022, height: 0.008, length: 0.02, chamferRadius: 0.003); teclaG.materials = [pbr(0.12, 0.12, 0.13, rough: 0.6)]
        for f in 0..<5 { for k in 0..<17 {
            let t = SCNNode(geometry: teclaG); t.position = SCNVector3(-0.2 + Float(k) * 0.025, 0.012, -0.05 + Float(f) * 0.025); tec.addChildNode(t)
        } }
        let mouse = capsula(0.022, 0.1, plasticoNegro, p); mouse.position = SCNVector3(0.3, 0.775, 0.13); mouse.eulerAngles.x = .pi / 2; mouse.scale = SCNVector3(1.2, 1, 0.55)
        // lámpara de escritorio de bronce
        cil(0.07, 0.015, bronce, 0.72, 0.775, -0.25, p)
        let brazo = cil(0.008, 0.42, bronce, 0.72, 0.98, -0.25, p); brazo.eulerAngles.z = 0.18
        let cab = cil(0.06, 0.06, bronce, 0.66, 1.2, -0.22, p); cab.eulerAngles.z = 1.2
        let foco = SCNLight(); foco.type = .omni; foco.intensity = 40; foco.color = CGColor(srgbRed: 1, green: 0.85, blue: 0.62, alpha: 1)
        foco.attenuationEndDistance = 1.1; foco.attenuationFalloffExponent = 2
        let fl = SCNNode(); fl.light = foco; fl.position = SCNVector3(0.62, 1.12, -0.2); p.addChildNode(fl)
        // silla ejecutiva
        let silla = SCNNode(); silla.position = SCNVector3(0, 0, 0.62); p.addChildNode(silla)
        caja(0.54, 0.09, 0.52, r: 0.04, cuero, 0, 0.5, 0, silla)
        let resp = caja(0.52, 0.66, 0.08, r: 0.04, cuero, 0, 0.9, 0.25, silla); resp.eulerAngles.x = -0.12
        for f in 0..<3 { caja(0.46, 0.012, 0.012, r: 0.005, pbr(0.03, 0.03, 0.03, rough: 0.5), 0, Float(-0.18 + Double(f) * 0.18), -0.046, resp) }
        caja(0.36, 0.16, 0.09, r: 0.04, cuero, 0, 1.3, 0.29, silla)
        for s: Float in [-1, 1] {
            let ap = capsula(0.03, 0.34, cuero, silla); ap.position = SCNVector3(s * 0.3, 0.68, 0.0); ap.eulerAngles.x = .pi / 2
            cil(0.012, 0.16, cromo, s * 0.3, 0.6, 0.06, silla)
        }
        cil(0.03, 0.36, cromo, 0, 0.27, 0, silla)
        cil(0.05, 0.06, cromo, 0, 0.09, 0, silla)
        for k in 0..<5 {
            let pata = SCNNode(); pata.eulerAngles.y = .init(Double(k) * 2 * .pi / 5); silla.addChildNode(pata)
            let b = capsula(0.022, 0.34, cromo, pata); b.position = SCNVector3(0, 0.08, 0.16); b.eulerAngles.x = .pi / 2 - 0.1
            let rueda = SCNSphere(radius: 0.03); rueda.materials = [gomaNegra]
            let rn = SCNNode(geometry: rueda); rn.position = SCNVector3(0, 0.03, 0.31); pata.addChildNode(rn)
        }
        // aro de luz bajo el escritorio (LED cálido)
        let led = SCNBox(width: 1.6, height: 0.006, length: 0.01, chamferRadius: 0)
        let lm = SCNMaterial(); lm.lightingModel = .constant; lm.diffuse.contents = CGColor(srgbRed: 1, green: 0.82, blue: 0.55, alpha: 1); led.materials = [lm]
        let ln = SCNNode(geometry: led); ln.position = SCNVector3(0, 0.72, 0.38); p.addChildNode(ln)
        p.enumerateHierarchy { n, _ in n.castsShadow = true }
        return p
    }
}
