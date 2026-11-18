import SwiftUI
import ActivityKit
import LocalAuthentication
import WidgetKit

@main
struct CargoBrothersApp: App {
    @StateObject private var store = Store()
    var body: some Scene {
        WindowGroup {
            RaizView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .tint(Tema.bronce)
        }
    }
}

@MainActor
final class Store: ObservableObject {
    @Published var datos: Datos?
    @Published var enLinea = true
    @Published var cargando = false
    @Published var aviso: String?
    /// Decisiones mandadas desde esta app que todavía no se ven en los datos (la Raspberry las aplica y las sube).
    @Published var enviadas: [String: String] = (UserDefaults.standard.dictionary(forKey: "enviadas") as? [String: String]) ?? [:]

    init() { Task { await refrescar() } }

    func refrescar() async {
        cargando = true
        let (d, online) = await Fuente.cargar()
        if let d { datos = d }
        enLinea = online
        cargando = false
        if let d {
            // si la decisión ya no figura como pendiente, se limpia
            let pendientes = Set(d.decidir.map(\.id))
            enviadas = enviadas.filter { pendientes.contains($0.key) }
            UserDefaults.standard.set(enviadas, forKey: "enviadas")
            await actualizarActividades(d)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    // ---------- Decidir: va por Telegram al Gerente (bot de la Raspberry), con Face ID ----------
    var botUsuario: String { (Bundle.main.object(forInfoDictionaryKey: "BotUsuario") as? String) ?? "" }

    func decidir(_ d: Decision, accion: String) async {
        guard await confirmarIdentidad(motivo: "Confirmar: \(accion) \(d.tipo) \(d.ref)") else { return }
        let texto = "app: \(accion) \(d.tipo) \(d.ref)"
        UIPasteboard.general.string = texto
        var comp = URLComponents(string: "https://t.me/\(botUsuario)")!
        comp.queryItems = [URLQueryItem(name: "text", value: texto)]
        if !botUsuario.isEmpty, let url = comp.url {
            await UIApplication.shared.open(url)
            aviso = "Se abrió Telegram con el mensaje listo: toca Enviar. En unos minutos queda anotado."
        } else {
            aviso = "Copié \"\(texto)\". Pégalo en el chat del Gerente en Telegram."
        }
        enviadas[d.id] = accion
        UserDefaults.standard.set(enviadas, forKey: "enviadas")
    }

    private func confirmarIdentidad(motivo: String) async -> Bool {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { return true }   // sin código en el teléfono: sigue
        return (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: motivo)) ?? false
    }

    // ---------- Pedido en la pantalla bloqueada ----------
    func siguiendo(_ p: Pedido) -> Bool {
        Activity<PedidoAttributes>.activities.contains { $0.attributes.pedidoID == p.id }
    }

    func seguir(_ p: Pedido) {
        if let a = Activity<PedidoAttributes>.activities.first(where: { $0.attributes.pedidoID == p.id }) {
            Task { await a.end(nil, dismissalPolicy: .immediate); objectWillChange.send() }
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            aviso = "Activa las Actividades en vivo de Cargo Brothers en Ajustes."
            return
        }
        let attr = PedidoAttributes(pedidoID: p.id, producto: p.producto, cantidad: totalUnidades(p))
        let st = PedidoAttributes.ContentState(estado: p.estado, etapa: p.etapa, total: p.etapas.count, actualizado: p.actualizado)
        do {
            _ = try Activity.request(attributes: attr, content: .init(state: st, staleDate: nil))
            aviso = "Listo: el pedido queda en tu pantalla bloqueada."
        } catch {
            aviso = "No se pudo poner en la pantalla bloqueada (\(error.localizedDescription))."
        }
        objectWillChange.send()
    }

    /// Los pedidos con el mismo producto y estado son un solo paquete (por ejemplo 3 + 1 unidades).
    func totalUnidades(_ p: Pedido) -> Int {
        (datos?.pedidos ?? []).filter { $0.producto == p.producto && $0.estado == p.estado && $0.fecha_compra == p.fecha_compra }
            .reduce(0) { $0 + $1.cantidad }
    }

    private func actualizarActividades(_ d: Datos) async {
        for a in Activity<PedidoAttributes>.activities {
            guard let p = d.pedidos.first(where: { $0.id == a.attributes.pedidoID }) else { continue }
            let st = PedidoAttributes.ContentState(estado: p.estado, etapa: p.etapa, total: p.etapas.count, actualizado: p.actualizado)
            await a.update(.init(state: st, staleDate: nil))
            if p.entregado { await a.end(.init(state: st, staleDate: nil), dismissalPolicy: .after(.now + 3600 * 4)) }
        }
    }
}

struct RaizView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        TabView {
            HoyView().tabItem { Label("Hoy", systemImage: "house") }
            PedidosView().tabItem { Label("Pedidos", systemImage: "shippingbox") }
            PreciosView().tabItem { Label("Precios", systemImage: "chart.line.uptrend.xyaxis") }
            DecidirView().tabItem { Label("Decidir", systemImage: "checkmark.seal") }
                .badge(store.datos.map { $0.decidir.filter { store.enviadas[$0.id] == nil }.count } ?? 0)
            EquipoView().tabItem { Label("Equipo", systemImage: "person.3") }
        }
        .overlay(alignment: .bottom) {
            if let a = store.aviso {
                Text(a).font(.footnote.weight(.medium)).padding(.horizontal, 14).padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule()).padding(.bottom, 64).padding(.horizontal, 16)
                    .onTapGesture { store.aviso = nil }
                    .task(id: a) { try? await Task.sleep(for: .seconds(5)); if store.aviso == a { store.aviso = nil } }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.3), value: store.aviso)
    }
}
