import SwiftUI
import ActivityKit
import LocalAuthentication
import WidgetKit
import BackgroundTasks
import UserNotifications

let TAREA_FONDO = "com.cargobrothers.oficina.refresh"

@main
struct CargoBrothersApp: App {
    @StateObject private var store = Store.compartido
    @UIApplicationDelegateAdaptor(Orientacion.self) private var orientacion
    @Environment(\.scenePhase) private var fase
    @AppStorage("tema_modo") private var modo = "sistema"
    @AppStorage("tema_acento") private var acento = "bronce"
    @AppStorage("tema_fondo") private var fondo = "grafito"
    @AppStorage("tema_acento_hex") private var hexA = "#C9A45C"
    @AppStorage("tema_fondo_hex") private var hexF = "#0E0E10"

    init() {
        UNUserNotificationCenter.current().delegate = DelegadoAvisos.compartido
        Avisador.registrarCategorias()
        // avisos en segundo plano sin la cuenta paga de Apple: iOS despierta la app cada tanto y ella compara los datos
        BGTaskScheduler.shared.register(forTaskWithIdentifier: TAREA_FONDO, using: nil) { tarea in
            Novedades.programar()
            let t = Task {
                let (d, ok) = await Fuente.cargar(token: Llavero.token)
                if ok, let d { await Avisador.revisar(d, avisar: true) }
                let v = await Fuente.vivo(token: Llavero.token)
                let antes = UserDefaults.standard.data(forKey: "nov_vivo").flatMap { try? JSONDecoder().decode(Vivo.self, from: $0) }
                if let v { await Avisador.ronda(antes: antes, ahora: v); UserDefaults.standard.set(try? JSONEncoder().encode(v), forKey: "nov_vivo") }
                tarea.setTaskCompleted(success: ok)
            }
            tarea.expirationHandler = { t.cancel() }
        }
    }

    var body: some Scene {
        WindowGroup {
            RaizView()
                .environmentObject(store)
                .preferredColorScheme(Tema.esquema)
                .tint(Tema.bronce)
                .id("\(modo)-\(acento)-\(fondo)-\(hexA)-\(hexF)")   // al cambiar la apariencia, la app se vuelve a dibujar con los colores nuevos
        }
        .onChange(of: fase) { _, f in
            if f == .background { Novedades.programar(); store.bloquearSiCorresponde(); store.pararReloj() }
            if f == .active { Task { await store.refrescar() }; store.empezarReloj() }
        }
    }
}

@MainActor
final class Store: ObservableObject {
    static let compartido = Store()
    @Published var datos: Datos?
    @Published var enLinea = true
    @Published var cargando = false
    @Published var guardando = false
    @Published var aviso: String?
    @Published var bloqueada = UserDefaults.standard.object(forKey: "bloqueo") as? Bool ?? true
    @Published var enviadosChat: [Mensaje] = []
    @Published var vivo: Vivo?
    /// lo que Santi hizo y todavía no se subió (Cola.swift) y la confirmación de abajo
    @Published var cola: [Pendiente] = Store.leerCola()
    @Published var toast: Toast?
    /// a dónde llevó el último aviso tocado (lo abre RaizView)
    @Published var destino: Destino?
    /// la etapa que Santi acaba de elegir, hasta que lleguen los datos nuevos ("1"…"3" o "auto")
    @Published var etapaLocal: String?
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
                if let v, self.vivo != nil { await Avisador.ronda(antes: self.vivo, ahora: v) }
                if let v { self.vivo = v; UserDefaults.standard.set(try? JSONEncoder().encode(v), forKey: "nov_vivo") }
                if antes && !(v?.enCurso ?? false) { await self.refrescar() }   // terminó la ronda: datos nuevos
                try? await Task.sleep(for: .seconds((self.vivo?.enCurso ?? false) ? 30 : 120))
            }
        }
    }
    func pararReloj() { reloj?.cancel() }
    /// Decisiones guardadas desde esta app que todavía no se ven en los datos.
    @Published var enviadas: [String: String] = (UserDefaults.standard.dictionary(forKey: "enviadas") as? [String: String]) ?? [:]

    init() {
        // lo último que se cargó se muestra al instante (sin pantalla en blanco) mientras llega lo nuevo
        if let d = try? Data(contentsOf: Fuente.cache), let x = try? JSONDecoder().decode(Datos.self, from: d) { datos = x }
        Task { await refrescar(); await subirPendientes() }
        empezarReloj()
        Red.compartida.empezar(self)
    }

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
            await Avisador.revisar(d, avisar: false)
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

}

struct RaizView: View {
    @EnvironmentObject var store: Store
    @State private var pestana = 0
    @State private var hoja: Destino?
    // la bienvenida sale una sola vez, la primera vez que se abre la app (Santi la aprobó el 19/11)
    @AppStorage("bienvenida_vista") private var bienvenidaVista = false
    @State private var verBienvenida = ProcessInfo.processInfo.arguments.contains("-bienvenida")
    var body: some View {
        TabView(selection: $pestana) {
            HoyView().tabItem { Label("Hoy", systemImage: "house") }.tag(0)
            PedidosView().tabItem { Label("Pedidos", systemImage: "shippingbox") }.tag(1)
            PreciosView().tabItem { Label("Precios", systemImage: "chart.line.uptrend.xyaxis") }.tag(2)
            DecidirView().tabItem { Label("Decidir", systemImage: "checkmark.seal") }.tag(3)
                .badge(store.datos.map { $0.decidir.filter { store.enviadas[$0.id] == nil }.count } ?? 0)
            EquipoView().tabItem { Label("Equipo", systemImage: "person.3") }.tag(4)
        }
        // aviso tocado: la pestaña que corresponde y, si es un pedido, un producto o un chat, se abre directo
        .onReceive(store.$destino) { d in   // también si el aviso llegó antes de que se dibujara la pantalla
            guard let d else { return }
            pestana = d.pestana
            switch d { case .pedido, .producto, .chat: hoja = d; default: break }
            store.destino = nil
        }
        .sheet(item: $hoja) { HojaDestino(destino: $0).environmentObject(store) }
        .overlay(alignment: .bottom) {
            if let t = store.toast {
                ToastVista(t: t).id(t.id).padding(.bottom, 70).padding(.horizontal, 16)
                    .task(id: t.id) { try? await Task.sleep(for: .seconds(t.deshacer != nil ? Store.segundosDeshacer + 0.4 : 5)); if store.toast?.id == t.id { store.toast = nil } }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onChange(of: store.aviso) { _, a in if let a { store.mostrar(Toast(texto: a, tipo: a.hasPrefix("No ") || a.hasPrefix("Falta") ? .error : .info)); store.aviso = nil } }
        .overlay { if store.bloqueada { Bloqueo() } }
        .overlay { if verBienvenida || !bienvenidaVista { Bienvenida { withAnimation { verBienvenida = false; bienvenidaVista = true } }.environmentObject(store).transition(.opacity) } }
        .animation(.spring(duration: 0.35), value: store.toast)
        .environment(\.locale, Locale(identifier: "es_BO"))   // fechas de los gráficos en castellano
        .onAppear { Novedades.pedirPermiso() }
    }
}

struct Bloqueo: View {
    @EnvironmentObject var store: Store
    var body: some View {
        ZStack {
            Tema.fondo.ignoresSafeArea()
            VStack(spacing: 22) {
                Image("Logo").resizable().renderingMode(.template).scaledToFit().foregroundStyle(Tema.texto).frame(width: 120)
                Text("Cargo Brothers").font(.title2.weight(.semibold))
                Button { Task { await store.desbloquear() } } label: { Label("Abrir con Face ID", systemImage: "faceid").padding(.horizontal, 10) }
                    .buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(Tema.sobreAcento)
            }
        }
        .task { await store.desbloquear() }
    }
}
