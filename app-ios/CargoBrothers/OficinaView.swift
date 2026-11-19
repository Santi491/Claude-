import SwiftUI
import SceneKit

/// La oficina 3D nativa (parte 1, 18/11): la nave y los muebles exportados de la oficina web, con gestos del iPhone.
/// Partes que vienen: personas (2), etiquetas redondas con foto y tocar agentes (3), en vivo (4), zonas (5), Santi (6).
struct OficinaView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    @State private var escena: SCNScene?
    @State private var error: String?
    @State private var vista = 0

    var body: some View {
        ZStack(alignment: .top) {
            Color(red: 0.07, green: 0.078, blue: 0.09).ignoresSafeArea()
            if let escena { VistaSCN(escena: escena, vista: vista).ignoresSafeArea() }
            else if let error { Text(error).foregroundStyle(.white).padding() }
            else { ProgressView("Armando la oficina…").tint(.white).foregroundStyle(.white) }
            HStack(spacing: 8) {
                Button { cerrar() } label: { Image(systemName: "xmark").font(.headline).padding(11) }
                    .background(.ultraThinMaterial, in: Circle())
                LuzVivo().environmentObject(store).frame(maxWidth: 260)
                Spacer()
                Button { vista += 1 } label: { Label("Vista general", systemImage: "scope").font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 9) }
                    .background(.ultraThinMaterial, in: Capsule())
            }
            .padding(.horizontal, 14).padding(.top, 6)
        }
        .preferredColorScheme(.dark)
        .task {
            guard escena == nil, let u = Bundle.main.url(forResource: "Oficina3D", withExtension: nil) else {
                if escena == nil { error = "No encontré el modelo de la oficina." }; return
            }
            let pers = Bundle.main.url(forResource: "Personas", withExtension: nil)
            let e = await Task.detached(priority: .userInitiated) { () -> SCNScene? in
                guard let e = try? Oficina3D.escena(carpeta: u) else { return nil }
                // las personas (solo en la Mac de Santi: son de Mixamo y no van al repo)
                if let pers { Personas3D.sentarEquipo(en: e.rootNode, carpeta: pers) }
                return e
            }.value
            if let e { escena = e } else { error = "No pude armar la oficina." }
        }
    }
}

/// SCNView con controles tipo oficina web: arrastrar gira, dos dedos mueven, pellizcar acerca.
struct VistaSCN: UIViewRepresentable {
    let escena: SCNScene
    var vista: Int

    func makeUIView(context: Context) -> SCNView {
        let v = SCNView()
        v.scene = escena
        v.backgroundColor = .clear
        v.antialiasingMode = .multisampling4X
        v.preferredFramesPerSecond = 60
        v.pointOfView = escena.rootNode.childNode(withName: "camara", recursively: false)
        v.allowsCameraControl = true
        let c = v.defaultCameraController
        c.interactionMode = .orbitTurntable
        c.target = SCNVector3(5, 0, 1.5)
        c.inertiaEnabled = true
        c.maximumVerticalAngle = 80
        c.minimumVerticalAngle = 8
        // con el celular vertical, la cámara abre el ángulo a lo ancho y se aleja para que entre toda la nave
        if let p = v.pointOfView, let cam = p.camera {
            cam.projectionDirection = .horizontal
            cam.fieldOfView = 62
            let t = SCNVector3(-1, 0, 4)
            p.position = SCNVector3(t.x + 10, 21, t.z + 17)
            p.look(at: t)
            v.defaultCameraController.target = t
        }
        context.coordinator.inicio = v.pointOfView?.transform
        return v
    }

    func updateUIView(_ v: SCNView, context: Context) {
        guard vista != context.coordinator.ultima, let t = context.coordinator.inicio, let p = v.pointOfView else { return }
        context.coordinator.ultima = vista
        SCNTransaction.begin(); SCNTransaction.animationDuration = 0.8
        p.transform = t
        v.defaultCameraController.target = SCNVector3(-1, 0, 4)
        SCNTransaction.commit()
    }

    func makeCoordinator() -> Coord { Coord() }
    final class Coord { var inicio: SCNMatrix4?; var ultima = 0 }
}
