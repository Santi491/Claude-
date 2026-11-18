import SwiftUI
import ActivityKit
import LocalAuthentication
import WidgetKit
import BackgroundTasks
import UserNotifications

let TAREA_FONDO = "com.cargobrothers.oficina.refresh"

@main
struct CargoBrothersApp: App {
    @StateObject private var store = Store()
    @Environment(\.scenePhase) private var fase

    init() {
        // avisos en segundo plano sin la cuenta paga de Apple: iOS despierta la app cada tanto y ella compara los datos
        BGTaskScheduler.shared.register(forTaskWithIdentifier: TAREA_FONDO, using: nil) { tarea in
            Novedades.programar()
            let t = Task {
                let (d, ok) = await Fuente.cargar(token: Llavero.token)
                if ok, let d { await Novedades.revisar(d, avisar: true) }
                tarea.setTaskCompleted(success: ok)
            }
            tarea.expirationHandler = { t.cancel() }
        }
    }

    var body: some Scene {
        WindowGroup {
            RaizView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .tint(Tema.bronce)
        }
        .onChange(of: fase) { _, f in
            if f == .background { Novedades.programar(); store.bloquearSiCorresponde(); store.pararReloj() }
            if f == .active { Task { await store.refrescar() }; store.empezarReloj() }
        }
    }
}

@MainActor
final class Store: ObservableObject {
    @Published var datos: Datos?
    @Published var enLinea = true
    @Published var cargando = false
    @Published var guardando = false
    @Published var aviso: String?
    @Published var bloqueada = UserDefaults.standard.object(forKey: "bloqueo") as? Bool ?? true
    @Published var enviadosChat: [Mensaje] = []
    @Published var vivo: Vivo?
    /// lo que se guardó desde este iPhone (para la pantalla de Sincronización): texto y fecha-hora de Bolivia
    @Published var acciones: [[String: String]] = (UserDefaults.standard.array(forKey: "acciones") as? [[String: String]]) ?? []
    private var reloj: Task<Void, Never>?

    func anotarAccion(_ t: String) {
        acciones.insert(["texto": t, "cuando": F.bo("yyyy-MM-dd HH:mm")], at: 0)
        acciones = Array(acciones.prefix(40))
        UserDefaults.standard.set(acciones, forKey: "acciones")
    }

    /// mira si hay ronda en curso: cada 30 s mientras hay una (para el foquito rojo), cada 2 min si no
    func empezarReloj() {
        reloj?.cancel()
        reloj = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let v = await Fuente.vivo(token: Llavero.token)
                let antes = self.vivo?.enCurso ?? false
                if let v { self.vivo = v }
                if antes && !(v?.enCurso ?? false) { await self.refrescar() }   // terminó la ronda: datos nuevos
                try? await Task.sleep(for: .seconds((self.vivo?.enCurso ?? false) ? 30 : 120))
            }
        }
    }
    func pararReloj() { reloj?.cancel() }
    /// Decisiones guardadas desde esta app que todavía no se ven en los datos.
    @Published var enviadas: [String: String] = (UserDefaults.standard.dictionary(forKey: "enviadas") as? [String: String]) ?? [:]

    init() { Task { await refrescar() }; empezarReloj() }

    func refrescar() async {
        cargando = true
        async let v = Fuente.vivo(token: Llavero.token)
        let (d, online) = await Fuente.cargar(token: Llavero.token)
        if let v = await v { vivo = v }
        if let d { datos = d }
        enLinea = online
        cargando = false
        if let d {
            let pendientes = Set(d.decidir.map(\.id))
            enviadas = enviadas.filter { pendientes.contains($0.key) }
            UserDefaults.standard.set(enviadas, forKey: "enviadas")
            let ids = Set((d.chat ?? []).map { $0.de + $0.texto })
            enviadosChat.removeAll { ids.contains($0.de + $0.texto) }
            await actualizarActividades(d)
            await Novedades.revisar(d, avisar: false)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    // ---------- Face ID al abrir ----------
    func bloquearSiCorresponde() { if UserDefaults.standard.object(forKey: "bloqueo") as? Bool ?? true { bloqueada = true } }

    func desbloquear() async {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { bloqueada = false; return }
        if (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Abrir Cargo Brothers")) == true { bloqueada = false }
    }

    // ---------- Decidir: directo a GitHub; sin clave, por Telegram ----------
    var botUsuario: String { (Bundle.main.object(forInfoDictionaryKey: "BotUsuario") as? String) ?? "" }

    func decidir(_ d: Decision, accion: String) async {
        guard await confirmarIdentidad(motivo: "Confirmar: \(accion) \(d.tipo) \(d.ref)") else { return }
        if hayClave { await decidirDirecto(d, accion: accion); return }
        let texto = "app: \(accion) \(d.tipo) \(d.ref)"
        UIPasteboard.general.string = texto
        var comp = URLComponents(string: "https://t.me/\(botUsuario)")!
        comp.queryItems = [URLQueryItem(name: "text", value: texto)]
        if !botUsuario.isEmpty, let url = comp.url {
            await UIApplication.shared.open(url)
            aviso = "Sin clave de GitHub: se abrió Telegram con el mensaje listo. Toca Enviar."
        } else {
            aviso = "Copié \"\(texto)\". Pégalo en el chat del Gerente en Telegram."
        }
        enviadas[d.id] = accion
        UserDefaults.standard.set(enviadas, forKey: "enviadas")
    }

    func confirmarIdentidad(motivo: String) async -> Bool {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { return true }
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

    /// Los pedidos con el mismo producto, fecha y estado son un solo paquete (por ejemplo 3 + 1 unidades).
    func totalUnidades(_ p: Pedido) -> Int {
        (datos?.pedidos ?? []).filter { $0.producto == p.producto && $0.estado == p.estado && $0.fecha_compra == p.fecha_compra && $0.esPrueba == p.esPrueba }
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

// ---------- Avisos: compara los datos nuevos con los últimos vistos ----------
enum Novedades {
    static func programar() {
        let r = BGAppRefreshTaskRequest(identifier: TAREA_FONDO)
        r.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(r)
    }

    static func pedirPermiso() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    static func revisar(_ d: Datos, avisar: Bool) async {
        let ud = UserDefaults.standard
        let primera = ud.object(forKey: "nov_ofertas") == nil
        let ofertas = Set(d.cazador.topes.filter(\.bajo_tope).map(\.producto))
        let estados = Dictionary(uniqueKeysWithValues: d.pedidos.filter { !$0.esPrueba }.map { ($0.id, $0.estado) })
        let decidir = Set(d.decidir.map(\.id))
        let chat = Set((d.chat ?? []).filter { $0.para == "santi" }.map(\.id))
        defer {
            ud.set(Array(ofertas), forKey: "nov_ofertas"); ud.set(estados, forKey: "nov_estados")
            ud.set(Array(decidir), forKey: "nov_decidir"); ud.set(Array(chat), forKey: "nov_chat")
        }
        guard avisar, !primera else { return }
        var msgs: [(String, String)] = []
        let o0 = Set(ud.stringArray(forKey: "nov_ofertas") ?? [])
        for p in ofertas.subtracting(o0) {
            if let t = d.cazador.topes.first(where: { $0.producto == p }) {
                msgs.append(("Oferta en eBay: \(p)", "\(F.usd(t.hoy_usd)), bajo nuestro tope de \(F.usd(t.tope_usd)). Mira el margen en Precios."))
            }
        }
        let e0 = ud.dictionary(forKey: "nov_estados") as? [String: String] ?? [:]
        var vistos = Set<String>()
        for p in d.pedidos where !p.esPrueba && e0[p.id] != nil && e0[p.id] != p.estado && !vistos.contains(p.producto + p.estado) {
            vistos.insert(p.producto + p.estado)
            msgs.append(("Pedido: \(p.producto)", "Ahora está: \(p.estado)."))
        }
        let nd = decidir.subtracting(Set(ud.stringArray(forKey: "nov_decidir") ?? [])).count
        if nd > 0 { msgs.append(("El equipo espera tu decisión", nd == 1 ? "Hay una cosa nueva por decidir." : "Hay \(nd) cosas nuevas por decidir.")) }
        let nc = chat.subtracting(Set(ud.stringArray(forKey: "nov_chat") ?? [])).count
        if nc > 0 { msgs.append(("Mensajes del equipo", nc == 1 ? "Tienes un mensaje nuevo." : "Tienes \(nc) mensajes nuevos.")) }
        for (t, b) in msgs.prefix(4) {
            let c = UNMutableNotificationContent(); c.title = t; c.body = b; c.sound = .default
            try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
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
                    .task(id: a) { try? await Task.sleep(for: .seconds(6)); if store.aviso == a { store.aviso = nil } }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay { if store.guardando { ProgressView("Guardando…").padding(20).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14)) } }
        .overlay { if store.bloqueada { Bloqueo() } }
        .animation(.spring(duration: 0.3), value: store.aviso)
        .onAppear { Novedades.pedirPermiso() }
    }
}

struct Bloqueo: View {
    @EnvironmentObject var store: Store
    var body: some View {
        ZStack {
            Tema.fondo.ignoresSafeArea()
            VStack(spacing: 22) {
                Image("Logo").resizable().scaledToFit().frame(width: 120)
                Text("Cargo Brothers").font(.title2.weight(.semibold))
                Button { Task { await store.desbloquear() } } label: { Label("Abrir con Face ID", systemImage: "faceid").padding(.horizontal, 10) }
                    .buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(.black)
            }
        }
        .task { await store.desbloquear() }
    }
}
