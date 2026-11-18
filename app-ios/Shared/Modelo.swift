import Foundation
import SwiftUI
#if canImport(ActivityKit)
import ActivityKit
#endif

// Datos que arma app_datos.py en el repo (app/datos-app.json). Salen del mismo filtro de privacidad que la oficina.
enum Fuente {
    static let url = URL(string: "https://raw.githubusercontent.com/Santi491/Claude-/claude/agente-independiente-s3uc8z/app/datos-app.json")!
    static var cache: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("datos-app.json")
    }

    /// Baja los datos de GitHub; si no hay internet, usa la última copia guardada.
    static func cargar() async -> (Datos?, Bool) {
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        if let (data, resp) = try? await URLSession.shared.data(for: req),
           (resp as? HTTPURLResponse)?.statusCode == 200,
           let d = try? JSONDecoder().decode(Datos.self, from: data) {
            try? data.write(to: cache)
            return (d, true)
        }
        if let data = try? Data(contentsOf: cache), let d = try? JSONDecoder().decode(Datos.self, from: data) {
            return (d, false)
        }
        return (nil, false)
    }
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
}

struct Etapa: Codable { var numero: Int?; var nombre: String }
struct Punto: Codable, Identifiable { var fecha: String; var valor: Double?; var id: String { fecha } }
struct Dolar: Codable { var usado: Double?; var oficial: Double?; var paralelo: Double?; var fecha: String; var serie: [Punto] }

struct Evento: Codable, Identifiable, Hashable {
    var fecha: String; var hora: String; var lugar: String; var evento: String
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
    var id: String { tipo + ref }
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
enum Tema {
    static let fondo = Color(red: 0.055, green: 0.055, blue: 0.06)
    static let tarjeta = Color(red: 0.105, green: 0.105, blue: 0.115)
    static let linea = Color.white.opacity(0.08)
    static let bronce = Color(red: 0.79, green: 0.64, blue: 0.36)
    static let texto = Color(red: 0.93, green: 0.93, blue: 0.94)
    static let gris = Color(red: 0.6, green: 0.61, blue: 0.64)
    static let verde = Color(red: 0.36, green: 0.77, blue: 0.56)
    static let ambar = Color(red: 0.95, green: 0.65, blue: 0.25)
    static let rojo = Color(red: 0.93, green: 0.45, blue: 0.45)

    static func color(recomendacion r: String) -> Color {
        switch r { case "traer": return verde; case "esperar": return ambar; case "no traer": return rojo; default: return gris }
    }
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
                Capsule().fill(i <= etapa ? Tema.bronce : Color.white.opacity(0.12)).frame(height: alto)
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
