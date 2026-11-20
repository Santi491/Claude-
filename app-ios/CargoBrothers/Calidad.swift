import SceneKit
import UIKit

/// Calidad de la oficina 3D (Santi, 19/11): Alta a 120 fps (la pantalla ProMotion del 14 Pro Max), Equilibrada a 60 y
/// Batería a 30. Se elige en Ajustes → Oficina 3D y vale la próxima vez que se abre la oficina.
enum Calidad: String, CaseIterable, Identifiable {
    case alta, equilibrada, bateria
    var id: String { rawValue }

    static var actual: Calidad { Calidad(rawValue: UserDefaults.standard.string(forKey: "oficina_calidad") ?? "") ?? .equilibrada }

    var nombre: String { ["alta": "Alta · 120 fps", "equilibrada": "Equilibrada · 60 fps", "bateria": "Batería · 30 fps"][rawValue]! }
    var detalle: String {
        switch self {
        case .alta: return "Todos los efectos y lo más fluido que da la pantalla. Gasta más batería y calienta más."
        case .equilibrada: return "Sombras más livianas y sin el sombreado de los rincones. Casi no se nota la diferencia."
        case .bateria: return "Sin sombras ni brillos, a 30 cuadros. Para usarla un buen rato sin que se caliente."
        }
    }
    var fps: Int { self == .alta ? 120 : self == .equilibrada ? 60 : 30 }
    var rango: CAFrameRateRange { CAFrameRateRange(minimum: Float(min(30, fps)), maximum: Float(fps), preferred: Float(fps)) }

    @MainActor func aplicar(_ v: SCNView) {
        v.preferredFramesPerSecond = fps
        v.antialiasingMode = self == .alta ? .multisampling4X : .multisampling2X
        // (20/11) en el iPhone la oficina se dibujaba a 2796×1290 píxeles: en Equilibrada y Batería se dibuja a 2× (la
        // mitad de píxeles) y se ve casi igual; Alta queda a la resolución completa
        v.contentScaleFactor = self == .alta ? UIScreen.main.scale : min(2, UIScreen.main.scale)
        if let cam = v.pointOfView?.camera, self != .alta {
            cam.screenSpaceAmbientOcclusionIntensity = 0
            cam.bloomIntensity = self == .bateria ? 0 : 0.12; cam.vignettingIntensity = 0
            if self == .bateria { cam.bloomIntensity = 0; cam.vignettingIntensity = 0 }
        }
        guard let raiz = v.scene?.rootNode else { return }
        for n in raiz.childNodes {
            guard let l = n.light, l.type == .directional, l.castsShadow else { continue }
            switch self {
            case .alta: break
            case .equilibrada: l.shadowMapSize = CGSize(width: 2048, height: 2048); l.shadowSampleCount = 2; l.shadowRadius = 3
            case .bateria: l.castsShadow = false
            }
        }
    }
}
