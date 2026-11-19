import SwiftUI
import Network
import UIKit

/// Cola de lo que Santi hace desde la app (19/11): cada acción se confirma al instante ("Guardado" con una vibración suave y
/// "Deshacer" por 5 segundos) y recién después se sube a GitHub. Así deshacer no borra filas de los CSV (regla del equipo).
/// Sin señal, la acción queda guardada en el teléfono y se sube sola cuando vuelve la conexión.
enum Op: Codable, Hashable {
    case compra(Compra), venta(Venta)
    case etapa(ids: [String], archivo: String, producto: String, etapa: String)
    case decision(Decision, accion: String)
    case chat(agente: String, texto: String)
    case tarea(agente: String, tarea: String, prioridad: String, fecha: String, obligatoria: Bool, motivo: String)
    case libreta(texto: String, tipo: String, vence: String)
    /// etapa del negocio fijada a mano: "1", "2", "3" o "auto"
    case etapaNegocio(String)
}

struct Pendiente: Codable, Identifiable, Hashable {
    var id = UUID()
    var op: Op
    var titulo: String
    var hoy: String, hora: String, sello: String
    /// espera (los 5 s de deshacer) · subiendo · sin señal
    var estado = "espera"
}

struct Toast: Equatable {
    enum Tipo { case ok, error, info }
    var texto: String
    var tipo: Tipo = .ok
    var deshacer: UUID?
    var id = UUID()
}

extension Store {
    static let segundosDeshacer: Double = 5

    func encolar(_ op: Op, titulo: String) {
        let p = Pendiente(op: op, titulo: titulo, hoy: hoy, hora: hora, sello: sello)
        cola.append(p); guardarCola()
        mostrar(Toast(texto: "Guardado: \(titulo)", tipo: .ok, deshacer: p.id))
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task { try? await Task.sleep(for: .seconds(Store.segundosDeshacer)); await subir(p.id) }
    }

    func deshacer(_ id: UUID) {
        guard let i = cola.firstIndex(where: { $0.id == id && $0.estado != "subiendo" }) else { return }
        let p = cola.remove(at: i); guardarCola()
        revertir(p.op)
        mostrar(Toast(texto: "Deshecho: \(p.titulo)", tipo: .info))
        UISelectionFeedbackGenerator().selectionChanged()
    }

    /// lo que la app ya mostró como hecho (decisión marcada, mensaje en el chat) vuelve atrás
    private func revertir(_ op: Op) {
        switch op {
        case .decision(let d, _): enviadas[d.id] = nil; UserDefaults.standard.set(enviadas, forKey: "enviadas")
        case .chat(_, let texto): if let k = enviadosChat.lastIndex(where: { $0.texto == texto }) { enviadosChat.remove(at: k) }
        case .etapaNegocio: etapaLocal = nil
        default: break
        }
    }

    func subir(_ id: UUID) async {
        guard let i = cola.firstIndex(where: { $0.id == id }), cola[i].estado != "subiendo" else { return }
        cola[i].estado = "subiendo"
        let p = cola[i]
        do {
            try await ejecutar(p.op, hoy: p.hoy, hora: p.hora, sello: p.sello)
            cola.removeAll { $0.id == id }; guardarCola()
            anotarAccion(p.titulo)
            Task { try? await Task.sleep(for: .seconds(8)); await refrescar() }
        } catch let e as URLError where [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost, .dataNotAllowed, .internationalRoamingOff].contains(e.code) {
            if let k = cola.firstIndex(where: { $0.id == id }) { cola[k].estado = "sin señal" }
            guardarCola()
            mostrar(Toast(texto: "Sin señal: quedó guardado en el teléfono y se sube solo cuando vuelva la conexión.", tipo: .info))
        } catch {
            cola.removeAll { $0.id == id }; guardarCola()
            revertir(p.op)
            mostrar(Toast(texto: "No se pudo guardar «\(p.titulo)»: \(error.localizedDescription)", tipo: .error))
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    /// al volver la conexión (o al abrir la app) se sube lo que quedó guardado sin señal
    func subirPendientes() async {
        let ids = cola.filter { $0.estado == "sin señal" || $0.estado == "subiendo" }.map(\.id)
        guard !ids.isEmpty, hayClave else { return }
        for id in ids { if let k = cola.firstIndex(where: { $0.id == id }) { cola[k].estado = "sin señal" }; await subir(id) }
        if cola.isEmpty { mostrar(Toast(texto: "Se subió lo que había quedado guardado sin señal.", tipo: .ok)) }
    }

    func mostrar(_ t: Toast) { toast = t }
    func guardarCola() { UserDefaults.standard.set(try? JSONEncoder().encode(cola), forKey: "cola") }
    static func leerCola() -> [Pendiente] {
        guard let d = UserDefaults.standard.data(forKey: "cola"), var c = try? JSONDecoder().decode([Pendiente].self, from: d) else { return [] }
        for k in c.indices where c[k].estado != "sin señal" { c[k].estado = "sin señal" }   // si la app se cerró en el medio
        return c
    }
}

/// vigila la conexión: al volver, sube lo pendiente y recarga los datos
final class Red {
    static let compartida = Red()
    private let monitor = NWPathMonitor()
    func empezar(_ store: Store) {
        monitor.pathUpdateHandler = { [weak store] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in
                guard let store, !store.enLinea || store.cola.contains(where: { $0.estado == "sin señal" }) else { return }
                await store.refrescar(); await store.subirPendientes()
            }
        }
        monitor.start(queue: DispatchQueue(label: "red"))
    }
}

/// la confirmación de abajo: corta, con "Deshacer" y una barrita que se vacía en 5 segundos
struct ToastVista: View {
    @EnvironmentObject var store: Store
    let t: Toast
    @State private var resta: CGFloat = 1
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: t.tipo == .ok ? "checkmark.circle.fill" : t.tipo == .error ? "exclamationmark.triangle.fill" : "info.circle.fill")
                .foregroundStyle(t.tipo == .ok ? Tema.verde : t.tipo == .error ? Tema.rojo : Tema.bronce)
            Text(t.texto).font(.footnote.weight(.medium)).lineLimit(3).foregroundStyle(Tema.texto)
            Spacer(minLength: 4)
            if let id = t.deshacer, store.cola.contains(where: { $0.id == id && $0.estado == "espera" }) {
                Button("Deshacer") { store.deshacer(id) }.font(.footnote.weight(.bold)).foregroundStyle(Tema.bronce)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay(alignment: .bottomLeading) {
            if t.deshacer != nil {
                GeometryReader { g in Capsule().fill(Tema.bronce.opacity(0.7)).frame(width: g.size.width * resta, height: 2.5) }
                    .frame(height: 2.5).padding(.horizontal, 14).padding(.bottom, 3)
            }
        }
        .shadow(color: .black.opacity(0.25), radius: 10, y: 4)
        .onAppear { withAnimation(.linear(duration: Store.segundosDeshacer)) { resta = 0 } }
        .onTapGesture { if t.deshacer == nil { store.toast = nil } }
    }
}

/// A dónde lleva un aviso al tocarlo (Santi, 19/11: "que los avisos me lleven al lugar justo")
enum Destino: Identifiable, Hashable {
    case pedido(String), producto(String), chat(String), decidir, equipo, hoy, pedidos
    var id: String { "\(self)" }
    /// la pestaña donde cae
    var pestana: Int {
        switch self { case .hoy: return 0; case .pedido, .pedidos: return 1; case .producto: return 2; case .decidir: return 3; case .chat, .equipo: return 4 }
    }
    static func de(_ info: [String: String]) -> Destino {
        switch info["tipo"] ?? "" {
        case "pedido": return info["pedido"].map { .pedido($0) } ?? .pedidos
        case "oferta": return info["producto"].map { .producto($0) } ?? .hoy
        case "decision": return .decidir
        case "mensaje": return info["agente"].map { .chat($0) } ?? .equipo
        case "ronda": return .equipo
        case "venta": return .pedidos
        default: return .hoy
        }
    }
}

/// la hoja que se abre encima de la pestaña: el pedido, el producto o el chat del aviso
struct HojaDestino: View {
    let destino: Destino
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var cerrar
    var body: some View {
        NavigationStack {
            Group {
                switch destino {
                case .pedido(let id):
                    if let p = store.datos?.pedidos.first(where: { $0.id == id }) { PedidoDetalle(pedido: p) }
                    else { Vacio(titulo: "No encontré ese pedido", texto: "Puede que los datos todavía no se hayan actualizado. Desliza hacia abajo en Pedidos para recargar.", icono: "shippingbox") }
                case .producto(let n):
                    if let p = store.datos?.productos.first(where: { $0.producto == n }) { ProductoDetalle(p: p) }
                    else { Vacio(titulo: n, texto: "Todavía no tengo los números de este producto.", icono: "cpu") }
                case .chat(let a): ChatView(agente: a)
                default: EmptyView()
                }
            }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Cerrar") { cerrar() } } }
        }
    }
}
