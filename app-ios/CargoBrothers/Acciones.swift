import Foundation
import UIKit

// Todo lo que Santi hace desde la app va directo a los mismos CSV que usa el equipo, con una fila en actividad.csv.
// Cada acción revisa sus datos antes de guardar (no hay verificar.py en el medio).

struct Compra {
    var producto = ""
    var cantidad = 1
    var precioUSD = ""
    var envioUSD = ""        // vacío = no sé
    var courier = "Courier B"
    var tienda = "eBay"
    var fecha = Date()
    var tc = ""
    var prueba = false
    var nota = ""
}

struct Venta {
    var producto = ""
    var cantidad = 1
    var precioBs = ""
    var canal = "Marketplace"
    var cobrado = true
    var reservada = false
    var pedidoID = ""
    var nota = ""
}

enum Accion {
    static func num(_ s: String) -> Double? { Double(s.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)) }
    static func n(_ d: Double) -> String { d.rounded() == d ? String(Int(d)) : String(d) }
}

extension Store {
    var hayClave: Bool { Llavero.token?.isEmpty == false }
    private var sello: String { "App \(F.bo("dd/MM HH:mm"))" }
    private var hoy: String { F.bo("yyyy-MM-dd") }
    private var hora: String { F.bo("HH:mm") }

    /// Corre una acción y avisa cómo salió. Si falla, lo dice claro (y la app no da nada por hecho).
    func guardar(_ titulo: String, _ trabajo: @escaping () async throws -> Void) async -> Bool {
        guard hayClave else { aviso = "Primero pega la clave de GitHub en Ajustes (el engranaje de Hoy)."; return false }
        guardando = true
        defer { guardando = false }
        do {
            try await trabajo()
            aviso = "Guardado: \(titulo). El equipo lo ve en su próxima ronda."
            Task { try? await Task.sleep(for: .seconds(8)); await refrescar() }
            return true
        } catch {
            aviso = "No se pudo guardar (\(error.localizedDescription))."
            return false
        }
    }

    private func actividad(_ texto: String) async throws {
        try await GitHub.modificar("actividad.csv", mensaje: "App: \(texto.prefix(60))") { t in
            try CSV(t).agregar(["fecha": hoy, "hora": hora, "agente": "gerente", "texto": "App de iPhone (Santi): " + texto])
        }
    }

    // ---------- compra ----------
    func registrarCompra(_ c: Compra) async -> Bool {
        let archivo = c.prueba ? "pedidos-prueba.csv" : "pedidos.csv"
        let fecha = F.bo("yyyy-MM-dd", c.fecha)
        guard let precio = Accion.num(c.precioUSD), precio > 0, c.cantidad > 0, !c.producto.isEmpty else { aviso = "Falta el producto, la cantidad o el precio."; return false }
        let resumen = "\(c.cantidad) × \(c.producto) a USD \(Accion.n(precio)) c/u (\(c.courier), \(c.tienda)\(c.prueba ? ", prueba" : ""))"
        return await guardar("compra de \(c.cantidad) × \(c.producto)") { [self] in
            try await GitHub.modificar(archivo, mensaje: "App: compra \(resumen)") { t in
                let csv = try CSV(t)
                let pref = c.prueba ? "prueba-" : "real-"
                let usados = csv.registros.compactMap { r -> Int? in
                    let id = csv.dic(r)["id"] ?? ""; return id.hasPrefix(pref) ? Int(id.dropFirst(pref.count)) : nil }
                let id = pref + String((usados.max() ?? 0) + 1)
                var nota = "Registrado por Santi desde la app de iPhone (\(F.bo("dd/MM HH:mm")))."
                if Accion.num(c.envioUSD) == nil { nota += " Envío en EE.UU. sin dato (vacío, no 0)." }
                if !c.nota.isEmpty { nota += " " + c.nota }
                return csv.agregar(["id": id, "fecha_compra": fecha, "tienda": c.tienda, "producto": c.producto,
                                    "cantidad": String(c.cantidad), "precio_usd": Accion.n(precio),
                                    "envio_usd": Accion.num(c.envioUSD).map(Accion.n) ?? "", "courier": c.courier,
                                    "destino": "Cochabamba", "estado": "comprado", "actualizado": "\(hoy) \(hora)",
                                    "notas": nota, "tc": Accion.num(c.tc).map { String($0) } ?? ""])
            }
            try await actividad("compra registrada: \(resumen)")
        }
    }

    // ---------- venta ----------
    func registrarVenta(_ v: Venta) async -> Bool {
        guard let precio = Accion.num(v.precioBs), precio > 0, v.cantidad > 0, !v.producto.isEmpty else { aviso = "Falta el producto, la cantidad o el precio."; return false }
        let resumen = "\(v.cantidad) × \(v.producto) a Bs \(Accion.n(precio)) (\(v.canal))\(v.reservada ? ", reservada" : "")"
        return await guardar("venta de \(v.cantidad) × \(v.producto)") { [self] in
            try await GitHub.modificar("ventas.csv", mensaje: "App: venta \(resumen)") { t in
                try CSV(t).agregar(["fecha": hoy, "producto": v.producto, "cantidad": String(v.cantidad), "precio_bs": Accion.n(precio),
                                    "canal": v.canal, "pedido_id": v.pedidoID, "notas": ("desde la app. " + v.nota).trimmingCharacters(in: .whitespaces),
                                    "estado": v.reservada ? "reservada" : "vendida",
                                    "cobrado_bs": v.cobrado && !v.reservada ? Accion.n(precio * Double(v.cantidad)) : "0", "comision_bs": ""])
            }
            try await actividad("venta registrada: \(resumen)")
        }
    }

    // ---------- etapa del pedido ----------
    static let ciudades: [String: (String, Double, Double)] = [
        "en camino a Cochabamba": ("Santa Cruz", -17.78, -63.18),
        "en Cochabamba": ("Cochabamba", -17.39, -66.16),
        "entregado": ("Cochabamba", -17.39, -66.16)]

    func cambiarEtapa(_ p: Pedido, a etapa: String, todoElPaquete: Bool) async -> Bool {
        let ids = todoElPaquete
            ? (datos?.pedidos ?? []).filter { $0.producto == p.producto && $0.fecha_compra == p.fecha_compra && $0.estado == p.estado }.map(\.id)
            : [p.id]
        let archivo = p.id.hasPrefix("prueba") ? "pedidos-prueba.csv" : "pedidos.csv"
        let evento: String = ["en camino a Cochabamba": "Llegó a Santa Cruz (aviso de Santi en la app); sigue a Cochabamba",
                              "en Cochabamba": "Llegó a Cochabamba (aviso de Santi en la app)",
                              "entregado": "Santi lo recogió (aviso en la app)"][etapa] ?? "Etapa: \(etapa) (aviso de Santi en la app)"
        return await guardar("\(p.producto): \(etapa)") { [self] in
            try await GitHub.modificar(archivo, mensaje: "App: \(ids.joined(separator: ", ")) \(etapa)") { t in
                let (nuevo, n) = try CSV(t).cambiar(donde: { _, d in ids.contains(d["id"] ?? "") }) { d in
                    d["estado"] = etapa; d["actualizado"] = "\(self.hoy) \(self.hora)"
                    d["notas"] = (d["notas"] ?? "") + " \(F.bo("dd/MM HH:mm")) Santi avisó desde la app: \(etapa)."
                }
                guard n > 0 else { throw GitHubError.datos("no encontré el pedido en \(archivo)") }
                return nuevo
            }
            if let (lugar, lat, lon) = Store.ciudades[etapa] {
                try await GitHub.modificar("seguimiento.csv", mensaje: "App: seguimiento \(etapa)") { t in
                    var csv = try CSV(t)
                    for id in ids {
                        csv.texto = csv.agregar(["id": id, "fecha": self.hoy, "hora": self.hora, "lugar": lugar, "lat": String(lat), "lon": String(lon),
                                                 "evento": evento, "fuente": "Santi (app)"])
                    }
                    return csv.texto
                }
            }
            try await actividad("\(ids.joined(separator: " y ")) (\(p.producto)) pasa a '\(etapa)'")
        }
    }

    // ---------- decisiones ----------
    func decidirDirecto(_ d: Decision, accion: String) async {
        let ok = await guardar("\(accion) \(d.tipo) \(d.ref)") { [self] in
            switch d.tipo {
            case "plan":
                try await GitHub.modificar("plan.csv", mensaje: "App: \(accion) tarea \(d.ref)") { t in
                    let (n, c) = try CSV(t).cambiar(donde: { _, x in x["id"] == d.ref && x["estado"] == "propuesto" }) { x in
                        x["estado"] = accion == "aprobar" ? "aprobado" : "rechazado"; x["decision"] = self.sello }
                    guard c > 0 else { throw GitHubError.datos("la tarea \(d.ref) ya estaba decidida") }
                    return n
                }
            case "idea":
                guard let i = Int(d.ref) else { return }
                try await GitHub.modificar("ideas.csv", mensaje: "App: \(accion) idea \(d.ref)") { t in
                    let (n, c) = try CSV(t).cambiar(donde: { k, x in k == i - 1 && x["estado"] == "propuesta" }) { x in
                        x["estado"] = accion == "aprobar" ? "aprobada" : "rechazada"; x["decision"] = self.sello }
                    guard c > 0 else { throw GitHubError.datos("la idea \(d.ref) ya estaba decidida") }
                    return n
                }
            default:
                guard let i = Int(d.ref) else { return }
                try await GitHub.modificar("necesidades.csv", mensaje: "App: necesidad \(d.ref) resuelta") { t in
                    let (n, c) = try CSV(t).cambiar(donde: { k, x in k == i - 1 && x["estado"] == "abierta" }) { x in
                        x["estado"] = "resuelta"; x["resuelto"] = "\(self.hoy) (Santi, app)" }
                    guard c > 0 else { throw GitHubError.datos("la necesidad \(d.ref) ya estaba resuelta") }
                    return n
                }
            }
            try await actividad("\(d.tipo) \(d.ref): \(accion == "resuelta" ? "resuelta" : accion == "aprobar" ? "aprobada" : "rechazada")")
        }
        if ok { enviadas[d.id] = accion; UserDefaults.standard.set(enviadas, forKey: "enviadas") }
    }

    // ---------- chat con el equipo ----------
    func escribir(a agente: String, _ texto: String) async -> Bool {
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { return false }
        let ok = await guardar("mensaje a \(Equipo.nombre(agente))") { [self] in
            try await GitHub.modificar("chat.csv", mensaje: "App: mensaje de Santi a \(agente)") { t in
                let csv = try CSV(t)
                let pref = F.bo("yyyyMMdd") + "-"
                let n = csv.registros.compactMap { r -> Int? in let id = csv.dic(r)["id"] ?? ""; return id.hasPrefix(pref) ? Int(id.dropFirst(pref.count)) : nil }.max() ?? 0
                return csv.agregar(["id": pref + String(n + 1), "fecha": self.hoy, "hora": self.hora, "de": "santi", "para": agente,
                                    "texto": limpio, "ref": "", "estado": "nuevo", "respuesta_a": ""])
            }
        }
        if ok { enviadosChat.append(Mensaje(id: UUID().uuidString, fecha: hoy, hora: hora, de: "santi", para: agente, texto: limpio)) }
        return ok
    }

    // ---------- encargar una tarea ----------
    func encargar(agente: String, tarea: String, prioridad: String, para fecha: Date, obligatoria: Bool, motivo: String = "pedido de Santi desde la app") async -> Bool {
        let t0 = tarea.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t0.isEmpty else { return false }
        let fp = F.bo("yyyy-MM-dd", fecha)
        return await guardar("tarea para \(Equipo.nombre(agente))") { [self] in
            try await GitHub.modificar("plan.csv", mensaje: "App: tarea de Santi para \(agente)") { t in
                let csv = try CSV(t)
                let pref = self.hoy + "-"
                let n = csv.registros.compactMap { r -> Int? in let id = csv.dic(r)["id"] ?? ""; return id.hasPrefix(pref) ? Int(id.dropFirst(pref.count)) : nil }.max() ?? 0
                return csv.agregar(["id": pref + String(n + 1), "fecha_para": fp, "agente": agente, "tarea": t0, "motivo": motivo,
                                    "estado": "aprobado", "propuesto_por": "santi", "fecha_propuesta": self.hoy, "decision": self.sello,
                                    "prioridad": prioridad, "plazo": fp, "meta": "", "obligatoria": obligatoria ? "sí" : ""])
            }
            try await actividad("tarea para \(agente): \(t0.prefix(80))")
        }
    }

    // ---------- precio de venta ----------
    func fijarPrecio(producto: String, precio: Double, piso: Double?, unidades: Int) async -> Bool {
        let p = Accion.n(precio)
        let tarea = "Publicar los \(unidades) \(producto) en Marketplace a Bs \(p) c/u (precio fijado por Santi en la app\(piso.map { "; piso Bs \(Accion.n($0))" } ?? "")), con las fotos de Santi de la PC; avisarle cada interesado el mismo día"
        let ok = await encargar(agente: "mkt", tarea: tarea, prioridad: "alta", para: Date(), obligatoria: true, motivo: "Santi fijó el precio de venta desde la app")
        if ok { _ = await escribir(a: "gerente", "Fijé el precio del \(producto): Bs \(p) c/u\(piso.map { ", piso Bs \(Accion.n($0))" } ?? ""). Que Marketplace publique y el Analista lo vigile frente a la competencia.") }
        return ok
    }
}
