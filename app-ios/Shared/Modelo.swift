import Foundation
import SwiftUI
import UIKit
#if canImport(ActivityKit)
import ActivityKit
#endif

// Datos que arma app_datos.py en el repo (app/datos-app.json). Salen del mismo filtro de privacidad que la oficina.
enum Fuente {
    static let repo = "Santi491/Claude-"
    static let rama = "claude/agente-independiente-s3uc8z"
    /// los datos los arma GitHub al minuto de cada cambio y los deja en la rama app-datos (.github/workflows/datos-app.yml)
    static let url = URL(string: "https://raw.githubusercontent.com/\(repo)/app-datos/datos-app.json")!
    static let urlRespaldo = URL(string: "https://raw.githubusercontent.com/\(repo)/\(rama)/app/datos-app.json")!
    static var cache: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("datos-app.json")
    }
    static func raw(_ ruta: String) -> URL? {
        URL(string: "https://raw.githubusercontent.com/\(repo)/\(rama)/" + (ruta.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ruta))
    }

    /// Con la clave de GitHub lee por la API (siempre lo último); sin clave, por raw (GitHub lo guarda hasta 5 minutos).
    static func bajar(_ ruta: String, rama r: String, token: String?) async -> Data? {
        if let token, !token.isEmpty, var c = URLComponents(string: "https://api.github.com/repos/\(repo)/contents/\(ruta)") {
            c.queryItems = [URLQueryItem(name: "ref", value: r)]
            var q = URLRequest(url: c.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
            q.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            q.setValue("application/vnd.github.raw+json", forHTTPHeaderField: "Accept")
            if let (d, resp) = try? await URLSession.shared.data(for: q), (resp as? HTTPURLResponse)?.statusCode == 200 { return d }
        }
        guard let u = URL(string: "https://raw.githubusercontent.com/\(repo)/\(r)/\(ruta)") else { return nil }
        let q = URLRequest(url: u, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        if let (d, resp) = try? await URLSession.shared.data(for: q), (resp as? HTTPURLResponse)?.statusCode == 200 { return d }
        return nil
    }

    /// Baja los datos (rama app-datos; si todavía no existe, los de la rama del equipo); sin internet, la última copia.
    static func cargar(token: String? = nil) async -> (Datos?, Bool) {
        for (ruta, r) in [("datos-app.json", "app-datos"), ("app/datos-app.json", rama)] {
            if let data = await bajar(ruta, rama: r, token: token), let d = try? JSONDecoder().decode(Datos.self, from: data) {
                try? data.write(to: cache)
                return (d, true)
            }
        }
        if let data = try? Data(contentsOf: cache), let d = try? JSONDecoder().decode(Datos.self, from: data) { return (d, false) }
        return (nil, false)
    }

    static func vivo(token: String?) async -> Vivo? {
        guard let d = await bajar("vivo.json", rama: rama, token: token) else { return nil }
        return try? JSONDecoder().decode(Vivo.self, from: d)
    }
}

/// vivo.json: la ronda en curso y qué hace cada agente (lo escribe vivo.py desde la ronda)
struct Vivo: Codable {
    struct Ronda: Codable { var activa: Bool?; var quien: String?; var desde: String?; var hasta: String?; var fecha: String? }
    struct Ag: Codable, Hashable { var estado: String; var texto: String; var hora: String }
    var ronda: Ronda?
    var agentes: [String: Ag]?
    var actualizado: String?
    /// activa y de hoy (una ronda que quedó "activa" de ayer no cuenta)
    var enCurso: Bool { (ronda?.activa ?? false) && (ronda?.fecha ?? "") == F.bo("yyyy-MM-dd") }
}

struct Datos: Codable {
    var generado: String
    var etapa: Etapa
    var dolar: Dolar
    var pedidos: [Pedido]
    var finanzas: Finanzas
    var productos: [Producto]
    var cazador: Cazador
    var decidir: [Decision]
    var equipo: [Agente]
    var objetivos: [Objetivo]
    var salud: [Salud]
    var alertas: [String]
    // pantallas de cada agente, calculadora y venta (18/11); opcionales para leer datos viejos
    var vigilar: [Vigilado]?
    var historial: [String: [Hist]]?
    var locales: [String: [Local]]?
    var whatsapp: WhatsApp?
    var demanda: [Demanda]?
    var documentos: [Documento]?
    var informes: [Informe]?
    var memoria: [Nota]?
    var chat: [Mensaje]?
    var salud14: [[String: String]]?
    var finanzas_productos: [FinProducto]?
    var recomendaciones: [Recomendacion]?
    var recomendaciones_cuando: String?
    var constantes: Constantes?
    var clientes: [Cliente]?
    var publicaciones: [Publicacion]?
    var tiendas: [TiendaInfo]?
    var informes_nube: [InformeNube]?
    var catalogos: [Catalogo]?
    var capturas: [Captura]?
    var decididas: [Decidida]?
    var libreta: [NotaLibreta]?
    var movimientos: [Movimiento]?
    var tabla: [FilaTabla]?
    var sincronizacion: Sinc?
}

struct Decidida: Codable, Identifiable, Hashable { var tipo: String; var ref: String; var agente: String; var titulo: String; var estado: String; var decision: String; var fecha: String; var id: String { tipo + ref } }
struct NotaLibreta: Codable, Identifiable, Hashable { var id: String; var fecha: String; var tipo: String; var fuente: String; var resumen: String; var vence: String; var estado: String; var cerrado: String }
struct Movimiento: Codable, Hashable { var fecha: String; var tipo: String; var producto: String; var concepto: String; var detalle: String; var valor: Double?; var antes: Double?; var moneda: String }
struct FilaTabla: Codable, Identifiable, Hashable { var producto: String; var cat: String; var peso_g: Double; var nuevo_usd: Double?; var usado_usd: Double?; var mkt_bs: Double?; var tienda_bs: Double?; var nuevo_link: String; var usado_link: String; var id: String { producto } }
struct Sinc: Codable { var ultima_ronda: String; var ultima_ronda_quien: String; var oficina_publicada: String; var armado_por: String; var armado: String }

struct Cliente: Codable, Identifiable, Hashable { var tienda: String; var grupo: String; var prioridad: String; var por_que: String; var productos: String
    var precio_ref_bs: Double?; var proximo_paso: String; var actualizado: String; var id: String { tienda }
    var letra: String { String(grupo.prefix(1)) }
    var orden: Int { if let r = proximo_paso.range(of: #"Orden (\d+)"#, options: .regularExpression) { return Int(proximo_paso[r].dropFirst(6)) ?? 999 }; return 999 } }
struct Publicacion: Codable, Identifiable, Hashable { var fecha: String; var hora: String; var producto: String; var accion: String; var precio_bs: String
    var cantidad: String; var titulo: String; var clics: String; var mensajes: String; var notas: String; var id: String { fecha + hora + producto + accion } }
struct PrecioTienda: Codable, Identifiable, Hashable { var fecha: String; var producto: String; var precio_bs: Double?; var estado: String; var id: String { fecha + producto + String(precio_bs ?? 0) } }
struct TiendaInfo: Codable, Identifiable, Hashable { var id: String; var tienda: String; var ciudad: String; var estado: String; var vende: String; var ultima: String
    var enviados: Int; var recibidos: Int; var con_precio: Int; var ultimo_mensaje: String; var grupo: String; var precios: [PrecioTienda] }
struct InformeNube: Codable, Identifiable, Hashable { var fecha: String; var ruta: String; var id: String { ruta } }
struct Catalogo: Codable, Identifiable, Hashable { var fecha: String; var tienda: String; var canal: String; var formato: String; var descripcion: String
    var productos: String; var precios: String; var ruta: String; var id: String { fecha + tienda + formato + descripcion.prefix(20) } }
struct Captura: Codable, Identifiable, Hashable { var fecha: String; var hora: String; var agente: String; var descripcion: String; var ruta: String; var id: String { ruta } }

struct Vigilado: Codable, Identifiable, Hashable { var producto: String; var cat: String; var peso_g: Double; var mediana_bs: Double?; var tope_usd: Double?; var id: String { producto } }
struct Hist: Codable, Identifiable, Hashable { var fecha: String; var nuevo: Double?; var usado: Double?; var mkt: Double?; var tienda: Double?; var id: String { fecha } }
struct Local: Codable, Identifiable, Hashable { var bs: Double?; var src: String; var vendedor: String; var estado: String; var fecha: String; var url: String; var cuenta: Bool; var id: String { vendedor + fecha + String(bs ?? 0) } }
struct SerieWA: Codable, Identifiable, Hashable { var fecha: String; var nuevos: Double; var respuestas: Double; var con_precio: Double; var id: String { fecha } }
struct WhatsApp: Codable { var tiendas_total: Double?; var contactadas_7d: Double?; var respondieron_7d: Double?; var tasa_7d: Double?
    var lista_pedida: Int?; var lista_faltan: Int?; var seguimiento: [String]; var responder: [String]; var frias: Int?; var respondieron: Int?; var serie: [SerieWA] }
struct Demanda: Codable, Identifiable, Hashable { var producto: String; var anuncios: Double?; var nuevos: Double?; var desaparecidos: Double?; var precio_bs: Double?; var tendencia: Double?; var lectura: String; var puntaje: Double?; var id: String { producto } }
struct Documento: Codable, Identifiable, Hashable { var titulo: String; var tipo: String; var fecha: String; var url: String; var carpeta: String; var id: String { url } }
struct Informe: Codable, Identifiable, Hashable { var fecha: String; var tipo: String; var url: String; var id: String { url } }
struct Nota: Codable, Identifiable, Hashable { var id: String; var tipo: String; var resumen: String; var vence: String; var fecha: String }
struct Mensaje: Codable, Identifiable, Hashable { var id: String; var fecha: String; var hora: String; var de: String; var para: String; var texto: String }
struct FinProducto: Codable, Identifiable, Hashable { var producto: String; var comprado: Double?; var en_camino: Double?; var en_stock: Double?; var vendido: Double?; var costo_unitario_bs: Double?; var ganancia_bs: Double?; var id: String { producto } }
struct Recomendacion: Codable, Identifiable, Hashable { var texto: String; var por_que: String; var accion: String; var id: String { texto } }
struct Constantes: Codable { var b_usd_kg: Double; var b_min_kg: Double; var b_paso_kg: Double; var caja_g: Double; var a_usd: Double; var a_tax: Double }

struct Etapa: Codable {
    var numero: Int?; var nombre: String
    /// la que da la regla automática y la que fijó Santi a mano (nil = automática)
    var auto: Int?; var fijada: Int?
    static let nombres = [1: "Búsqueda de productos", 2: "Producto en camino", 3: "Vendiendo"]
    static let detalle = [1: "No hay pedido en camino ni producto por vender: precios, tiendas nuevas, catálogos y proponer el próximo pedido.",
                          2: "Hay un pedido comprado que todavía no llegó: seguir el envío, cerrar el precio y dejar la venta preparada.",
                          3: "El producto está en Cochabamba: publicar, ofrecer y vender todo en 7 días como mucho, y medir."]
}
struct Punto: Codable, Identifiable { var fecha: String; var valor: Double?; var oficial: Double?; var paralelo: Double?; var id: String { fecha } }
struct Dolar: Codable { var usado: Double?; var oficial: Double?; var paralelo: Double?; var fecha: String; var serie: [Punto] }

struct Evento: Codable, Identifiable, Hashable {
    var fecha: String; var hora: String; var lugar: String; var evento: String
    var lat: Double?; var lon: Double?
    var id: String { fecha + hora + evento }
}

struct Pedido: Codable, Identifiable, Hashable {
    var id: String
    var producto: String
    var cantidad: Int
    var estado: String
    var etapa: Int
    var etapas: [String]
    var fecha_compra: String
    var actualizado: String
    var eventos: [Evento]
    var tienda: String?
    var courier: String?
    var prueba: Bool?
    var esPrueba: Bool { prueba ?? id.hasPrefix("prueba") }
    var entregado: Bool { etapa >= etapas.count - 1 }
}

struct Finanzas: Codable {
    var invertido_bs: Double?; var unidades_compradas: Int?; var unidades_en_camino: Int?
    var unidades_en_stock: Int?; var unidades_vendidas: Int?; var ventas_bs: Double?; var ganancia_bs: Double?
}

struct Producto: Codable, Identifiable, Hashable {
    var producto: String; var condicion: String
    var ebay_usd: Double?; var costo_bs: Double?; var local_bs: Double?; var sugerido_bs: Double?
    var margen: Double?; var peor: Double?
    var recomendacion: String; var por_que: String; var link: String
    var id: String { producto + condicion }
}

struct Tope: Codable, Identifiable, Hashable {
    var producto: String; var tope_usd: Double?; var mediana_bs: Double?; var hoy_usd: Double?; var link: String; var bajo_tope: Bool
    var id: String { producto }
}
struct Cazador: Codable { var meta: Double?; var topes: [Tope] }

struct Decision: Codable, Identifiable, Hashable {
    var tipo: String; var ref: String; var agente: String; var fecha: String
    var titulo: String; var detalle: String; var plazo: String
    var fecha_para: String?
    var id: String { tipo + ref }
    var vencida: Bool { tipo == "plan" && !(fecha_para ?? "").isEmpty && (fecha_para ?? "") < F.bo("yyyy-MM-dd") && (plazo.isEmpty || plazo < F.bo("yyyy-MM-dd")) }
}

struct Agente: Codable, Identifiable, Hashable {
    var agente: String; var nombre: String; var acciones: Int; var serie: [Int]; var ultima: String; var cuando: String
    var id: String { agente }
}

struct Objetivo: Codable, Identifiable, Hashable {
    var id: String; var agente: String; var nombre: String; var objetivo: String; var meta: String
    var avance: Double?; var hasta: String; var cumplido: Bool; var vencido: Bool; var estado: String
    var progreso: Double {
        if cumplido || estado == "hecho" { return 1 }
        if let a = avance, let m = Double(meta), m > 0 { return min(a / m, 1) }
        return 0
    }
}

struct Salud: Codable, Identifiable, Hashable {
    var parte: String; var nombre: String; var estado: String; var hora: String
    var id: String { parte }
}

// ---------- Marca: grafito, mármol negro y bronce, como la oficina ----------
/// Colores de la app: cambian solos entre claro y oscuro (UIColor dinámico) y el acento lo elige Santi (Ajustes → Apariencia).
enum Tema {
    static func dyn(_ oscuro: UIColor, _ claro: UIColor) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .light ? claro : oscuro })
    }
    static func rgb(_ r: Double, _ g: Double, _ b: Double) -> UIColor { UIColor(red: r, green: g, blue: b, alpha: 1) }

    /// acentos para elegir: nombre, color en oscuro, color en claro
    static let acentos: [(String, String, UIColor, UIColor)] = [
        ("bronce", "Bronce", rgb(0.79, 0.64, 0.36), rgb(0.62, 0.47, 0.20)),
        ("oro", "Oro", rgb(0.93, 0.76, 0.32), rgb(0.72, 0.55, 0.10)),
        ("cobre", "Cobre", rgb(0.85, 0.50, 0.32), rgb(0.70, 0.36, 0.18)),
        ("esmeralda", "Esmeralda", rgb(0.30, 0.78, 0.58), rgb(0.10, 0.55, 0.38)),
        ("zafiro", "Zafiro", rgb(0.42, 0.62, 0.95), rgb(0.18, 0.40, 0.80)),
        ("amatista", "Amatista", rgb(0.70, 0.55, 0.95), rgb(0.48, 0.32, 0.78)),
        ("rubi", "Rubí", rgb(0.92, 0.40, 0.48), rgb(0.75, 0.20, 0.30)),
        ("plata", "Plata", rgb(0.78, 0.80, 0.84), rgb(0.40, 0.42, 0.46)),
    ]
    /// fondos para elegir en oscuro: grafito (el de siempre), negro puro o azul noche
    static let fondos: [(String, String, UIColor, UIColor)] = [
        ("grafito", "Grafito", rgb(0.055, 0.055, 0.06), rgb(0.105, 0.105, 0.115)),
        ("negro", "Negro", rgb(0, 0, 0), rgb(0.085, 0.085, 0.09)),
        ("noche", "Azul noche", rgb(0.04, 0.06, 0.10), rgb(0.08, 0.11, 0.17)),
    ]
    static var acentoID: String { UserDefaults.standard.string(forKey: "tema_acento") ?? "bronce" }
    static var fondoID: String { UserDefaults.standard.string(forKey: "tema_fondo") ?? "grafito" }
    private static var acento: (UIColor, UIColor) { colAcento(acentoID, UserDefaults.standard.string(forKey: "tema_acento_hex")) }
    private static var base: (UIColor, UIColor) { colFondo(fondoID, UserDefaults.standard.string(forKey: "tema_fondo_hex")) }

    // ---------- colores propios (Santi, 19/11): cualquier color o un código #RRGGBB ----------
    static func hex(_ s: String?) -> UIColor? {
        guard var t = s?.trimmingCharacters(in: .whitespaces).uppercased() else { return nil }
        if t.hasPrefix("#") { t.removeFirst() }
        guard t.count == 6, let v = UInt32(t, radix: 16) else { return nil }
        return rgb(Double((v >> 16) & 255) / 255, Double((v >> 8) & 255) / 255, Double(v & 255) / 255)
    }
    static func hex(de c: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X", Int((max(0, min(1, r)) * 255).rounded()), Int((max(0, min(1, g)) * 255).rounded()), Int((max(0, min(1, b)) * 255).rounded()))
    }
    /// el mismo color un poco más claro (k > 0) u oscuro (k < 0)
    static func mezclar(_ c: UIColor, _ k: CGFloat) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        let f: (CGFloat) -> CGFloat = { k > 0 ? $0 + (1 - $0) * k : $0 * (1 + k) }
        return UIColor(red: f(r), green: f(g), blue: f(b), alpha: 1)
    }
    /// acento (oscuro, claro): uno de la lista o el propio (en modo día, un poco más oscuro para que se lea)
    static func colAcento(_ id: String, _ hx: String?) -> (UIColor, UIColor) {
        if id == "propio", let c = hex(hx) { return (c, mezclar(c, -0.22)) }
        let a = acentos.first { $0.0 == id } ?? acentos[0]; return (a.2, a.3)
    }
    /// fondo de noche (fondo, tarjeta): uno de la lista o el propio (las tarjetas, un poco más claras)
    static func colFondo(_ id: String, _ hx: String?) -> (UIColor, UIColor) {
        if id == "propio", let c = hex(hx) { return (c, mezclar(c, 0.06)) }
        let f = fondos.first { $0.0 == id } ?? fondos[0]; return (f.2, f.3)
    }

    static var fondo: Color { dyn(base.0, rgb(0.955, 0.95, 0.94)) }
    static var tarjeta: Color { dyn(base.1, rgb(1, 1, 1)) }
    static var linea: Color { dyn(UIColor.white.withAlphaComponent(0.08), UIColor.black.withAlphaComponent(0.08)) }
    static var bronce: Color { dyn(acento.0, acento.1) }
    static var texto: Color { dyn(rgb(0.93, 0.93, 0.94), rgb(0.10, 0.10, 0.11)) }
    static var gris: Color { dyn(rgb(0.6, 0.61, 0.64), rgb(0.42, 0.43, 0.46)) }
    static var verde: Color { dyn(rgb(0.36, 0.77, 0.56), rgb(0.10, 0.55, 0.32)) }
    static var ambar: Color { dyn(rgb(0.95, 0.65, 0.25), rgb(0.75, 0.45, 0.02)) }
    static var rojo: Color { dyn(rgb(0.93, 0.45, 0.45), rgb(0.75, 0.18, 0.20)) }
    /// texto encima del color de acento (botones llenos)
    static var sobreAcento: Color { dyn(.black, .white) }
    /// relleno suave (barras vacías, círculos apagados)
    static var suave: Color { dyn(UIColor.white.withAlphaComponent(0.12), UIColor.black.withAlphaComponent(0.08)) }

    /// modo elegido: sistema, claro u oscuro
    static var esquema: ColorScheme? {
        switch UserDefaults.standard.string(forKey: "tema_modo") ?? "sistema" { case "claro": return .light; case "oscuro": return .dark; default: return nil }
    }

    static func color(recomendacion r: String) -> Color {
        switch r { case "traer": return verde; case "esperar": return ambar; case "no traer": return rojo; default: return gris }
    }
}

enum Equipo {
    static let nombres = ["gerente": "Gerente", "wa": "WhatsApp", "mkt": "Marketplace", "ebay": "Rastreador eBay", "ana": "Analista",
                          "pedidos": "Pedidos", "fin": "Finanzas", "dem": "Analista de demanda", "nube": "Informe diario",
                          "local": "Oficina", "santi": "Santi"]
    static let orden = ["gerente", "wa", "mkt", "ebay", "ana", "pedidos", "fin", "dem", "nube"]
    static func nombre(_ a: String) -> String { nombres[a] ?? a }
}

enum F {
    static func bs(_ v: Double?) -> String {
        guard let v else { return "—" }
        let f = NumberFormatter(); f.numberStyle = .decimal; f.locale = Locale(identifier: "es_BO"); f.maximumFractionDigits = 0
        return "Bs " + (f.string(from: NSNumber(value: v)) ?? "\(Int(v))")
    }
    static func usd(_ v: Double?) -> String {
        guard let v else { return "—" }
        return "USD " + String(format: v.rounded() == v ? "%.0f" : "%.2f", v).replacingOccurrences(of: ".", with: ",")
    }
    static func pct(_ v: Double?) -> String {
        guard let v else { return "—" }
        return String(format: "%.1f %%", v).replacingOccurrences(of: ".", with: ",")
    }
    static func num(_ v: Double?, _ dec: Int = 2) -> String {
        guard let v else { return "—" }
        return String(format: "%.\(dec)f", v).replacingOccurrences(of: ".", with: ",")
    }
    static var ahoraBO: Date { Date() }
    static func bo(_ formato: String, _ d: Date = Date()) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "es_BO"); f.timeZone = TimeZone(identifier: "America/La_Paz"); f.dateFormat = formato
        return f.string(from: d)
    }
    /// "2026-11-18" -> "18/11"
    static func dia(_ s: String) -> String {
        let p = s.prefix(10).split(separator: "-")
        return p.count == 3 ? "\(p[2])/\(p[1])" : s
    }
}

/// Barra de etapas del pedido: un tramo por etapa, en bronce lo recorrido.
struct Pasos: View {
    var etapa: Int
    var total: Int
    var alto: CGFloat = 6
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<max(total, 1), id: \.self) { i in
                Capsule().fill(i <= etapa ? Tema.bronce : Tema.suave).frame(height: alto)
            }
        }
    }
}

// ---------- Pedido en la pantalla bloqueada (Live Activity) ----------
#if canImport(ActivityKit)
struct PedidoAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var estado: String
        var etapa: Int
        var total: Int
        var actualizado: String
    }
    var pedidoID: String
    var producto: String
    var cantidad: Int
}
#endif
