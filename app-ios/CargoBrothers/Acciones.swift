import Foundation
import UIKit

// Todo lo que Santi hace desde la app va directo a los mismos CSV que usa el equipo, con una fila en actividad.csv.
// Cada acción revisa sus datos antes de guardar (no hay verificar.py en el medio).

struct Compra: Codable, Hashable {
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

struct Venta: Codable, Hashable {
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
    var sello: String { "App \(F.bo("dd/MM HH:mm"))" }
    var hoy: String { F.bo("yyyy-MM-dd") }
    var hora: String { F.bo("HH:mm") }

    /// Pone una acción en la cola (Cola.swift): se confirma al instante con "Deshacer" por 5 segundos y después se sube;
    /// sin señal queda guardada en el teléfono y se sube sola al volver. `trabajo` es la acción en sí (ver `ejecutar`).
    func guardar(_ titulo: String, _ op: Op) -> Bool {
        guard hayClave else { aviso = "Primero pega la clave de GitHub en Ajustes (el engranaje de Hoy)."; return false }
        encolar(op, titulo: titulo)
        return true
    }

    /// La fila en actividad.csv es solo la nota de lo que ya se guardó: si GitHub la rechaza (una ronda escribió al
    /// mismo tiempo, 23/11), lo hecho NO se da por fallado; la nota queda en el teléfono y se sube sola después.
    func actividad(_ texto: String, _ hoy: String, _ hora: String) async throws {
        let fila = ["fecha": hoy, "hora": hora, "agente": "gerente", "texto": "App de iPhone (Santi): " + texto]
        do {
            try await GitHub.modificar("actividad.csv", mensaje: "App: \(texto.prefix(60))") { t in try CSV(t).agregar(fila) }
        } catch {
            var p = UserDefaults.standard.array(forKey: "notas_pendientes") as? [[String: String]] ?? []
            p.append(fila); UserDefaults.standard.set(p, forKey: "notas_pendientes")
        }
    }
    /// sube las notas de actividad que quedaron pendientes (se llama al abrir la app, al volver la señal y después de cada acción)
    func subirNotasPendientes() async {
        let p = UserDefaults.standard.array(forKey: "notas_pendientes") as? [[String: String]] ?? []
        guard !p.isEmpty, hayClave else { return }
        do {
            try await GitHub.modificar("actividad.csv", mensaje: "App: \(p.count) nota\(p.count == 1 ? "" : "s") pendiente\(p.count == 1 ? "" : "s")") { t in
                var s = t; for f in p { s = try CSV(s).agregar(f) }; return s
            }
            UserDefaults.standard.removeObject(forKey: "notas_pendientes")
        } catch { }
    }

    // ---------- lo que Santi puede hacer (validan y van a la cola) ----------
    func registrarCompra(_ c: Compra) async -> Bool {
        guard let precio = Accion.num(c.precioUSD), precio > 0, c.cantidad > 0, !c.producto.isEmpty else { aviso = "Falta el producto, la cantidad o el precio."; return false }
        return guardar("compra de \(c.cantidad) × \(c.producto) a USD \(Accion.n(precio))", .compra(c))
    }
    func registrarVenta(_ v: Venta) async -> Bool {
        guard let precio = Accion.num(v.precioBs), precio > 0, v.cantidad > 0, !v.producto.isEmpty else { aviso = "Falta el producto, la cantidad o el precio."; return false }
        return guardar("venta de \(v.cantidad) × \(v.producto) a Bs \(Accion.n(precio))", .venta(v))
    }

    static let ciudades: [String: (String, Double, Double)] = [
        "en camino a Cochabamba": ("Santa Cruz", -17.78, -63.18),
        "en Cochabamba": ("Cochabamba", -17.39, -66.16),
        "entregado": ("Cochabamba", -17.39, -66.16)]

    func cambiarEtapa(_ p: Pedido, a etapa: String, todoElPaquete: Bool) async -> Bool {
        let ids = todoElPaquete
            ? (datos?.pedidos ?? []).filter { $0.producto == p.producto && $0.fecha_compra == p.fecha_compra && $0.estado == p.estado }.map(\.id)
            : [p.id]
        let archivo = p.id.hasPrefix("prueba") ? "pedidos-prueba.csv" : "pedidos.csv"
        return guardar("\(p.producto): \(etapa)", .etapa(ids: ids, archivo: archivo, producto: p.producto, etapa: etapa))
    }

    func decidirDirecto(_ d: Decision, accion: String) async {
        let txt = accion == "resuelta" ? "resuelta" : accion == "aprobar" ? "aprobada" : "rechazada"
        if guardar("\(d.tipo == "plan" ? "tarea" : d.tipo) \(d.ref) \(txt)", .decision(d, accion: accion)) {
            enviadas[d.id] = accion; UserDefaults.standard.set(enviadas, forKey: "enviadas")
        }
    }

    func escribir(a agente: String, _ texto: String) async -> Bool {
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { return false }
        let ok = guardar("mensaje a \(Equipo.nombre(agente))", .chat(agente: agente, texto: limpio))
        if ok { enviadosChat.append(Mensaje(id: UUID().uuidString, fecha: hoy, hora: hora, de: "santi", para: agente, texto: limpio)) }
        return ok
    }

    func encargar(agente: String, tarea: String, prioridad: String, para fecha: Date, obligatoria: Bool, motivo: String = "pedido de Santi desde la app") async -> Bool {
        let t0 = tarea.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t0.isEmpty else { return false }
        return guardar("tarea para \(Equipo.nombre(agente))", .tarea(agente: agente, tarea: t0, prioridad: prioridad, fecha: F.bo("yyyy-MM-dd", fecha), obligatoria: obligatoria, motivo: motivo))
    }

    func anotarLibreta(_ texto: String, tipo: String, vence: Date?) async -> Bool {
        let t0 = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t0.isEmpty else { return false }
        return guardar("nota en la libreta del Gerente", .libreta(texto: t0, tipo: tipo, vence: vence.map { F.bo("yyyy-MM-dd", $0) } ?? ""))
    }

    func fijarPrecio(producto: String, precio: Double, piso: Double?, unidades: Int) async -> Bool {
        let p = Accion.n(precio)
        let tarea = "Publicar los \(unidades) \(producto) en Marketplace a Bs \(p) c/u (precio fijado por Santi en la app\(piso.map { "; piso Bs \(Accion.n($0))" } ?? "")), con las fotos de Santi de la PC; avisarle cada interesado el mismo día"
        let ok = await encargar(agente: "mkt", tarea: tarea, prioridad: "alta", para: Date(), obligatoria: true, motivo: "Santi fijó el precio de venta desde la app")
        if ok { _ = await escribir(a: "gerente", "Fijé el precio del \(producto): Bs \(p) c/u\(piso.map { ", piso Bs \(Accion.n($0))" } ?? ""). Que Marketplace publique y el Analista lo vigile frente a la competencia.") }
        return ok
    }

    /// Santi fija la etapa del negocio (o la vuelve a automática): etapa.csv manda sobre la regla (objetivos.py)
    func fijarEtapa(_ valor: String) async -> Bool {
        let n = Int(valor).flatMap { Etapa.nombres[$0] }
        let ok = guardar(n.map { "etapa \(valor) · \($0)" } ?? "etapa automática", .etapaNegocio(valor))
        if ok { etapaLocal = valor }
        return ok
    }

    // ---------- lo que de verdad se escribe en GitHub (lo corre la cola, con la fecha y hora de cuando Santi lo hizo) ----------
    func ejecutar(_ op: Op, hoy: String, hora: String, sello: String) async throws {
        switch op {
        case .compra(let c):
            let archivo = c.prueba ? "pedidos-prueba.csv" : "pedidos.csv"
            let fecha = F.bo("yyyy-MM-dd", c.fecha)
            let precio = Accion.num(c.precioUSD) ?? 0
            let resumen = "\(c.cantidad) × \(c.producto) a USD \(Accion.n(precio)) c/u (\(c.courier), \(c.tienda)\(c.prueba ? ", prueba" : ""))"
            try await GitHub.modificar(archivo, mensaje: "App: compra \(resumen)") { t in
                let csv = try CSV(t)
                let pref = c.prueba ? "prueba-" : "real-"
                let usados = csv.registros.compactMap { r -> Int? in
                    let id = csv.dic(r)["id"] ?? ""; return id.hasPrefix(pref) ? Int(id.dropFirst(pref.count)) : nil }
                let id = pref + String((usados.max() ?? 0) + 1)
                var nota = "Registrado por Santi desde la app de iPhone (\(sello.replacingOccurrences(of: "App ", with: "")))."
                if Accion.num(c.envioUSD) == nil { nota += " Envío en EE.UU. sin dato (vacío, no 0)." }
                if !c.nota.isEmpty { nota += " " + c.nota }
                return csv.agregar(["id": id, "fecha_compra": fecha, "tienda": c.tienda, "producto": c.producto,
                                    "cantidad": String(c.cantidad), "precio_usd": Accion.n(precio),
                                    "envio_usd": Accion.num(c.envioUSD).map(Accion.n) ?? "", "courier": c.courier,
                                    "destino": "Cochabamba", "estado": "comprado", "actualizado": "\(hoy) \(hora)",
                                    "notas": nota, "tc": Accion.num(c.tc).map { String($0) } ?? ""])
            }
            try await actividad("compra registrada: \(resumen)", hoy, hora)
        case .venta(let v):
            let precio = Accion.num(v.precioBs) ?? 0
            let resumen = "\(v.cantidad) × \(v.producto) a Bs \(Accion.n(precio)) (\(v.canal))\(v.reservada ? ", reservada" : "")"
            try await GitHub.modificar("ventas.csv", mensaje: "App: venta \(resumen)") { t in
                try CSV(t).agregar(["fecha": hoy, "producto": v.producto, "cantidad": String(v.cantidad), "precio_bs": Accion.n(precio),
                                    "canal": v.canal, "pedido_id": v.pedidoID, "notas": ("desde la app. " + v.nota).trimmingCharacters(in: .whitespaces),
                                    "estado": v.reservada ? "reservada" : "vendida",
                                    "cobrado_bs": v.cobrado && !v.reservada ? Accion.n(precio * Double(v.cantidad)) : "0", "comision_bs": ""])
            }
            try await actividad("venta registrada: \(resumen)", hoy, hora)
        case .etapa(let ids, let archivo, let producto, let etapa):
            let evento: String = ["en camino a Cochabamba": "Llegó a Santa Cruz (aviso de Santi en la app); sigue a Cochabamba",
                                  "en Cochabamba": "Llegó a Cochabamba (aviso de Santi en la app)",
                                  "entregado": "Santi lo recogió (aviso en la app)"][etapa] ?? "Etapa: \(etapa) (aviso de Santi en la app)"
            try await GitHub.modificar(archivo, mensaje: "App: \(ids.joined(separator: ", ")) \(etapa)") { t in
                let (nuevo, n) = try CSV(t).cambiar(donde: { _, d in ids.contains(d["id"] ?? "") }) { d in
                    d["estado"] = etapa; d["actualizado"] = "\(hoy) \(hora)"
                    d["notas"] = (d["notas"] ?? "") + " \(sello.replacingOccurrences(of: "App ", with: "")) Santi avisó desde la app: \(etapa)."
                }
                guard n > 0 else { throw GitHubError.datos("no encontré el pedido en \(archivo)") }
                return nuevo
            }
            if let (lugar, lat, lon) = Store.ciudades[etapa] {
                try await GitHub.modificar("seguimiento.csv", mensaje: "App: seguimiento \(etapa)") { t in
                    var csv = try CSV(t)
                    for id in ids {
                        csv.texto = csv.agregar(["id": id, "fecha": hoy, "hora": hora, "lugar": lugar, "lat": String(lat), "lon": String(lon),
                                                 "evento": evento, "fuente": "Santi (app)"])
                    }
                    return csv.texto
                }
            }
            try await actividad("\(ids.joined(separator: " y ")) (\(producto)) pasa a '\(etapa)'", hoy, hora)
        case .decision(let d, let accion):
            switch d.tipo {
            case "plan":
                try await GitHub.modificar("plan.csv", mensaje: "App: \(accion) tarea \(d.ref)") { t in
                    let (n, c) = try CSV(t).cambiar(donde: { _, x in x["id"] == d.ref && x["estado"] == "propuesto" }) { x in
                        x["estado"] = accion == "aprobar" ? "aprobado" : "rechazado"; x["decision"] = sello }
                    guard c > 0 else { throw GitHubError.datos("la tarea \(d.ref) ya estaba decidida") }
                    return n
                }
            case "idea":
                guard let i = Int(d.ref) else { return }
                try await GitHub.modificar("ideas.csv", mensaje: "App: \(accion) idea \(d.ref)") { t in
                    let (n, c) = try CSV(t).cambiar(donde: { k, x in k == i - 1 && x["estado"] == "propuesta" }) { x in
                        x["estado"] = accion == "aprobar" ? "aprobada" : "rechazada"; x["decision"] = sello }
                    guard c > 0 else { throw GitHubError.datos("la idea \(d.ref) ya estaba decidida") }
                    return n
                }
            default:
                guard let i = Int(d.ref) else { return }
                try await GitHub.modificar("necesidades.csv", mensaje: "App: necesidad \(d.ref) resuelta") { t in
                    let (n, c) = try CSV(t).cambiar(donde: { k, x in k == i - 1 && x["estado"] == "abierta" }) { x in
                        x["estado"] = "resuelta"; x["resuelto"] = "\(hoy) (Santi, app)" }
                    guard c > 0 else { throw GitHubError.datos("la necesidad \(d.ref) ya estaba resuelta") }
                    return n
                }
            }
            try await actividad("\(d.tipo) \(d.ref): \(accion == "resuelta" ? "resuelta" : accion == "aprobar" ? "aprobada" : "rechazada")", hoy, hora)
        case .chat(let agente, let texto):
            try await GitHub.modificar("chat.csv", mensaje: "App: mensaje de Santi a \(agente)") { t in
                let csv = try CSV(t)
                let pref = hoy.replacingOccurrences(of: "-", with: "") + "-"
                let n = csv.registros.compactMap { r -> Int? in let id = csv.dic(r)["id"] ?? ""; return id.hasPrefix(pref) ? Int(id.dropFirst(pref.count)) : nil }.max() ?? 0
                return csv.agregar(["id": pref + String(n + 1), "fecha": hoy, "hora": hora, "de": "santi", "para": agente,
                                    "texto": texto, "ref": "", "estado": "nuevo", "respuesta_a": ""])
            }
        case .tarea(let agente, let t0, let prioridad, let fp, let obligatoria, let motivo):
            try await GitHub.modificar("plan.csv", mensaje: "App: tarea de Santi para \(agente)") { t in
                let csv = try CSV(t)
                let pref = hoy + "-"
                let n = csv.registros.compactMap { r -> Int? in let id = csv.dic(r)["id"] ?? ""; return id.hasPrefix(pref) ? Int(id.dropFirst(pref.count)) : nil }.max() ?? 0
                return csv.agregar(["id": pref + String(n + 1), "fecha_para": fp, "agente": agente, "tarea": t0, "motivo": motivo,
                                    "estado": "aprobado", "propuesto_por": "santi", "fecha_propuesta": hoy, "decision": sello,
                                    "prioridad": prioridad, "plazo": fp, "meta": "", "obligatoria": obligatoria ? "sí" : ""])
            }
            try await actividad("tarea para \(agente): \(t0.prefix(80))", hoy, hora)
        case .etapaNegocio(let valor):
            let nombre = Int(valor).flatMap { Etapa.nombres[$0] }
            let txt = nombre.map { "etapa \(valor) (\($0))" } ?? "etapa automática"
            try await GitHub.modificar("etapa.csv", mensaje: "App: Santi fija la \(txt)") { t in
                try CSV(t).agregar(["fecha": hoy, "hora": hora, "etapa": valor, "quien": "santi", "nota": "desde la app de iPhone"])
            }
            try await actividad("fijó la \(txt) del negocio", hoy, hora)
            try await GitHub.modificar("chat.csv", mensaje: "App: aviso de etapa al Gerente") { t in
                let csv = try CSV(t)
                let pref = hoy.replacingOccurrences(of: "-", with: "") + "-"
                let k = csv.registros.compactMap { r -> Int? in let id = csv.dic(r)["id"] ?? ""; return id.hasPrefix(pref) ? Int(id.dropFirst(pref.count)) : nil }.max() ?? 0
                let texto = nombre.map { "Pasé el negocio a la etapa \(valor) (\($0)) desde la app. Ajustá el foco del equipo a esa etapa." }
                    ?? "Volví la etapa a automática desde la app (la decide la regla de los pedidos)."
                return csv.agregar(["id": pref + String(k + 1), "fecha": hoy, "hora": hora, "de": "santi", "para": "gerente",
                                    "texto": texto, "ref": "", "estado": "nuevo", "respuesta_a": ""])
            }
        case .libreta(let t0, let tipo, let vence):
            try await GitHub.modificar("memoria-gerente.csv", mensaje: "App: Santi anota en la libreta del Gerente") { t in
                let csv = try CSV(t)
                let n = csv.registros.compactMap { Int(csv.dic($0)["id"] ?? "") }.max() ?? 0
                return csv.agregar(["id": String(n + 1), "fecha": hoy, "hora": hora, "fuente": "santi", "tipo": tipo,
                                    "resumen": t0, "vence": vence, "estado": "abierta", "cerrado": ""])
            }
            try await actividad("nota en la libreta del Gerente (\(tipo))", hoy, hora)
        }
    }
}
