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
