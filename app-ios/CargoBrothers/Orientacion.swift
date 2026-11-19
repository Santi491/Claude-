import UIKit

/// La app va siempre vertical, salvo la oficina 3D, que también se puede ver con el iPhone echado (Santi, 19/11).
final class Orientacion: NSObject, UIApplicationDelegate {
    nonisolated(unsafe) static var permitidas: UIInterfaceOrientationMask = .portrait

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        Self.permitidas
    }

    @MainActor static func permitir(_ m: UIInterfaceOrientationMask) {
        permitidas = m
        for escena in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            for w in escena.windows {
                var vc = w.rootViewController
                while let c = vc { c.setNeedsUpdateOfSupportedInterfaceOrientations(); vc = c.presentedViewController }
            }
            if m == .portrait { escena.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait)) { _ in } }
        }
    }
}
