import Foundation
import SceneKit
import CoreGraphics
import CoreText

/// Relojes de Cochabamba y Miami con la hora real (Santi, 19/11): en la oficina de Santi, sobre el logo de Cargo Brothers.
/// Antes estaban en la pared de la sala de operaciones y en la app marcaban siempre la hora de la exportación.
enum Relojes3D {
    static let lugares: [(String, String, Float)] = [("COCHABAMBA", "America/La_Paz", -9.75), ("MIAMI", "America/New_York", -8.25)]
    static let y: Float = 3.7, z: Float = -9.93, radio: CGFloat = 0.36

    static func poner(en raiz: SCNNode) {
        let grupo = SCNNode(); grupo.name = "relojes"; raiz.addChildNode(grupo)
        let bronce = Detalle3D.bronce, negro = Detalle3D.pbr(0.05, 0.05, 0.055, rough: 0.35, metal: 0.5)
        for (k, (nombre, tz, x)) in lugares.enumerated() {
            // caja: aro de bronce y fondo negro
            let aro = SCNTube(innerRadius: radio - 0.025, outerRadius: radio + 0.012, height: 0.05); aro.radialSegmentCount = 48; aro.materials = [bronce]
            let an = SCNNode(geometry: aro); an.position = SCNVector3(x, y, z); an.eulerAngles.x = .pi / 2; grupo.addChildNode(an)
            let fondo = SCNCylinder(radius: radio, height: 0.03); fondo.radialSegmentCount = 48; fondo.materials = [negro]
            let fn = SCNNode(geometry: fondo); fn.position = SCNVector3(x, y, z - 0.005); fn.eulerAngles.x = .pi / 2; grupo.addChildNode(fn)
            // esfera (se redibuja cada minuto)
            let cara = SCNPlane(width: radio * 2 - 0.05, height: radio * 2 - 0.05)
            let m = SCNMaterial(); m.lightingModel = .constant; m.isDoubleSided = false; cara.materials = [m]
            let cn = SCNNode(geometry: cara); cn.name = "reloj-\(k)"; cn.position = SCNVector3(x, y, z + 0.016); grupo.addChildNode(cn)
            // cartel con el nombre de la ciudad, debajo
            let cartel = SCNPlane(width: 0.9, height: 0.13)
            let cm = SCNMaterial(); cm.lightingModel = .constant; cm.diffuse.contents = texto(nombre); cm.transparencyMode = .aOne; cartel.materials = [cm]
            let ln = SCNNode(geometry: cartel); ln.position = SCNVector3(x, y - Float(radio) - 0.16, z + 0.01); grupo.addChildNode(ln)
            _ = tz
        }
        actualizar(grupo)
    }

    /// redibuja las agujas (lo llama la vista 3D cada tanto)
    static func actualizar(_ grupo: SCNNode, ahora: Date = Date()) {
        for (k, (_, tz, _)) in lugares.enumerated() {
            guard let n = grupo.childNode(withName: "reloj-\(k)", recursively: false) else { continue }
            var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: tz) ?? .current
            let c = cal.dateComponents([.hour, .minute], from: ahora)
            n.geometry?.firstMaterial?.diffuse.contents = esfera(c.hour ?? 0, c.minute ?? 0)
        }
    }

    static func esfera(_ hh: Int, _ mm: Int) -> CGImage? {
        let S = 256, cs = CGColorSpace(name: CGColorSpace.sRGB)!
        guard let g = CGContext(data: nil, width: S, height: S, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let c = CGPoint(x: 128, y: 128), R: CGFloat = 126
        g.setFillColor(CGColor(srgbRed: 0.93, green: 0.93, blue: 0.94, alpha: 1)); g.fillEllipse(in: CGRect(x: 2, y: 2, width: 252, height: 252))
        for k in 0..<60 {
            let a = CGFloat(k) * .pi / 30, larga = k % 5 == 0
            g.setStrokeColor(CGColor(srgbRed: 0.1, green: 0.1, blue: 0.11, alpha: larga ? 1 : 0.5)); g.setLineWidth(larga ? 6 : 2)
            g.move(to: CGPoint(x: c.x + sin(a) * (R - 10), y: c.y + cos(a) * (R - 10)))
            g.addLine(to: CGPoint(x: c.x + sin(a) * (R - (larga ? 30 : 18)), y: c.y + cos(a) * (R - (larga ? 30 : 18)))); g.strokePath()
        }
        func aguja(_ a: CGFloat, _ l: CGFloat, _ w: CGFloat, _ col: CGColor) {
            g.setStrokeColor(col); g.setLineWidth(w); g.setLineCap(.round)
            g.move(to: CGPoint(x: c.x - sin(a) * 14, y: c.y - cos(a) * 14)); g.addLine(to: CGPoint(x: c.x + sin(a) * l, y: c.y + cos(a) * l)); g.strokePath()
        }
        let negro = CGColor(srgbRed: 0.08, green: 0.08, blue: 0.09, alpha: 1)
        aguja((CGFloat(hh % 12) + CGFloat(mm) / 60) * .pi / 6, 62, 9, negro)
        aguja(CGFloat(mm) * .pi / 30, 96, 6, negro)
        g.setFillColor(CGColor(srgbRed: 0.79, green: 0.64, blue: 0.36, alpha: 1)); g.fillEllipse(in: CGRect(x: 120, y: 120, width: 16, height: 16))
        return g.makeImage()
    }

    static func texto(_ t: String) -> CGImage? {
        let W = 512, H = 74, cs = CGColorSpace(name: CGColorSpace.sRGB)!
        guard let g = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let fuente = CTFontCreateWithName("Helvetica-Bold" as CFString, 34, nil)
        let at = NSAttributedString(string: t, attributes: [kCTFontAttributeName as NSAttributedString.Key: fuente,
                                                            kCTForegroundColorAttributeName as NSAttributedString.Key: CGColor(srgbRed: 0.85, green: 0.75, blue: 0.55, alpha: 1),
                                                            kCTKernAttributeName as NSAttributedString.Key: 8])
        let linea = CTLineCreateWithAttributedString(at)
        let ancho = CTLineGetTypographicBounds(linea, nil, nil, nil)
        g.textPosition = CGPoint(x: (CGFloat(W) - CGFloat(ancho)) / 2, y: 22); CTLineDraw(linea, g)
        return g.makeImage()
    }
}

/// El avioncito del mapa de la ruta (Santi, 19/11: "no se mueve"): recorre la curva Miami → Cochabamba en 9 s, con un leve
/// vuelo hacia afuera a mitad de camino, como en la oficina web. Mismas medidas que el mapa de la web.
enum Avion3D {
    static let MP = (x: Float(4.9), y: Float(4.5), z: Float(-9.86), w: Float(5.8), h: Float(3.2)), MCW: Float = 2048, MCH: Float = 1134
    static func lonX(_ lon: Float) -> Float { 70 + (lon + 128) / 98 * (1024 - 140) }
    static func latY(_ lat: Float) -> Float { 50 + (52 - lat) / 94 * (MCH - 100) }
    static func aMuro(_ p: SIMD2<Float>) -> SIMD2<Float> { SIMD2(MP.x - MP.w / 2 + p.x / MCW * MP.w, MP.y + MP.h / 2 - p.y / MCH * MP.h) }
    static func curva(_ k: Float) -> SIMD2<Float> {
        let mia = SIMD2(lonX(-80.2), latY(25.8)), cbb = SIMD2(lonX(-66.16), latY(-17.39))
        let ctrl = SIMD2((mia.x + cbb.x) / 2 + 150, (mia.y + cbb.y) / 2 - 40), u = 1 - k
        return u * u * mia + 2 * u * k * ctrl + k * k * cbb
    }

    static func poner(en raiz: SCNNode) {
        let avion = SCNNode(); avion.name = "avion"; raiz.addChildNode(avion)
        let cuerpo = SCNNode(); avion.addChildNode(cuerpo)
        let blanco = Detalle3D.pbr(0.93, 0.94, 0.95, rough: 0.35)
        let fus = SCNCapsule(capRadius: 0.028, height: 0.34); fus.radialSegmentCount = 16; fus.materials = [blanco]
        let fn = SCNNode(geometry: fus); fn.eulerAngles.z = .pi / 2; cuerpo.addChildNode(fn)
        _ = Detalle3D.caja(0.08, 0.38, 0.01, r: 0.004, blanco, 0.01, 0, 0, cuerpo)        // alas
        _ = Detalle3D.caja(0.045, 0.14, 0.01, r: 0.003, blanco, -0.14, 0, 0, cuerpo)      // cola
        _ = Detalle3D.caja(0.05, 0.012, 0.07, r: 0.003, Detalle3D.bronce, -0.15, 0, 0.035, cuerpo)   // timón
        let dur: Double = 9
        avion.runAction(.repeatForever(.customAction(duration: dur) { n, t in
            let k = Float(t) / Float(dur), a = aMuro(curva(k)), b = aMuro(curva(min(1, k + 0.01)))
            n.position = SCNVector3(a.x, a.y, MP.z + 0.06 + sin(.pi * k) * 0.12)
            n.eulerAngles = SCNVector3(0, 0, atan2(b.y - a.y, b.x - a.x))
        }))
    }
}
