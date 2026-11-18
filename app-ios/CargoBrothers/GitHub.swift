import Foundation
import Security
import CryptoKit

// La app guarda directo en el repo (Santi, 18/11: opción 2). La clave es un token "fine-grained" que crea Santi en GitHub,
// limitado a este repo y a Contents (leer y escribir). Vive en el llavero del iPhone; nunca en el repo ni en el código.
enum Llavero {
    private static let servicio = "com.cargobrothers.oficina.github"

    static var token: String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func guardar(_ t: String) {
        borrar()
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio,
                                kSecValueData as String: Data(t.utf8),
                                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(q as CFDictionary, nil)
    }

    static func borrar() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio] as CFDictionary)
    }
}

enum GitHubError: LocalizedError {
    case sinClave, http(Int, String), datos(String)
    var errorDescription: String? {
        switch self {
        case .sinClave: return "Falta la clave de GitHub (Ajustes)."
        case .http(401, _), .http(403, _): return "GitHub no aceptó la clave: puede haber vencido o no tener permiso de escritura."
        case .http(let c, let m): return "GitHub respondió \(c): \(m)"
        case .datos(let m): return m
        }
    }
}

enum GitHub {
    static let repo = "Santi491/Claude-"
    static let rama = "claude/agente-independiente-s3uc8z"

    private static func url(_ ruta: String) -> URL {
        let r = ruta.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ruta
        return URL(string: "https://api.github.com/repos/\(repo)/contents/\(r)?ref=\(rama.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!)")!
    }

    private static func pedido(_ u: URL, _ metodo: String = "GET", raw: Bool = false) throws -> URLRequest {
        guard let t = Llavero.token, !t.isEmpty else { throw GitHubError.sinClave }
        var r = URLRequest(url: u, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        r.httpMethod = metodo
        r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        r.setValue(raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", forHTTPHeaderField: "Accept")
        r.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        return r
    }

    /// sha de git del contenido (sirve para el PUT aunque el archivo pase de 1 MB)
    static func shaGit(_ d: Data) -> String {
        var h = Insecure.SHA1()
        h.update(data: Data("blob \(d.count)\0".utf8))
        h.update(data: d)
        return h.finalize().map { String(format: "%02x", $0) }.joined()
    }

    static func leer(_ ruta: String) async throws -> (String, String) {
        let (d, resp) = try await URLSession.shared.data(for: try pedido(url(ruta), raw: true))
        let c = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard c == 200 else { throw GitHubError.http(c, String(data: d, encoding: .utf8)?.prefix(120).description ?? "") }
        guard let s = String(data: d, encoding: .utf8) else { throw GitHubError.datos("\(ruta) no es texto") }
        return (s, shaGit(d))
    }

    static func escribir(_ ruta: String, _ texto: String, sha: String, mensaje: String) async throws {
        var r = try pedido(url(ruta).deletingQuery(), "PUT")
        let cuerpo: [String: Any] = ["message": mensaje, "content": Data(texto.utf8).base64EncodedString(), "sha": sha, "branch": rama]
        r.httpBody = try JSONSerialization.data(withJSONObject: cuerpo)
        let (d, resp) = try await URLSession.shared.data(for: r)
        let c = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(c) else { throw GitHubError.http(c, String(data: d, encoding: .utf8)?.prefix(160).description ?? "") }
    }

    /// Lee, cambia y guarda. Si alguien (una ronda) lo cambió en el medio, lo vuelve a leer y reintenta.
    static func modificar(_ ruta: String, mensaje: String, _ cambio: (String) throws -> String) async throws {
        for intento in 0..<4 {
            let (txt, sha) = try await leer(ruta)
            let nuevo = try cambio(txt)
            if nuevo == txt { return }
            do { try await escribir(ruta, nuevo, sha: sha, mensaje: mensaje); return }
            catch GitHubError.http(let c, _) where (c == 409 || c == 422) && intento < 3 {
                try await Task.sleep(for: .seconds(1.5)); continue
            }
        }
    }

    /// Prueba la clave: lee un archivo chico.
    static func probar() async -> String? {
        do { _ = try await leer("vigilar.csv"); return nil } catch { return error.localizedDescription }
    }
}

private extension URL {
    func deletingQuery() -> URL {
        var c = URLComponents(url: self, resolvingAgainstBaseURL: false)!
        c.query = nil
        return c.url!
    }
}

// ---------- CSV como lo escribe Python (csv, QUOTE_MINIMAL, fin de línea \n) ----------
struct CSV {
    struct Registro { var campos: [String]; var rango: Range<String.Index> }
    var texto: String
    var encabezado: [String]
    var registros: [Registro]

    init(_ t: String) throws {
        texto = t
        var regs: [Registro] = []
        var i = t.startIndex, inicio = t.startIndex, campo = "", campos: [String] = [], comillas = false
        func cerrar(_ fin: String.Index) {
            campos.append(campo); campo = ""
            if !(campos.count == 1 && campos[0].isEmpty) { regs.append(Registro(campos: campos, rango: inicio..<fin)) }
            campos = []
        }
        while i < t.endIndex {
            let ch = t[i]
            if comillas {
                if ch == "\"" {
                    let sig = t.index(after: i)
                    if sig < t.endIndex, t[sig] == "\"" { campo.append("\""); i = sig } else { comillas = false }
                } else { campo.append(ch) }
            } else if ch == "\"" { comillas = true }
            else if ch == "," { campos.append(campo); campo = "" }
            else if ch == "\n" || ch == "\r\n" { cerrar(i); inicio = t.index(after: i) }
            else if ch == "\r" { }
            else { campo.append(ch) }
            i = t.index(after: i)
        }
        if !campo.isEmpty || !campos.isEmpty { cerrar(t.endIndex) }
        guard let h = regs.first else { throw GitHubError.datos("CSV vacío") }
        encabezado = h.campos.map { $0.replacingOccurrences(of: "\u{FEFF}", with: "") }
        registros = Array(regs.dropFirst())
    }

    static func campo(_ s: String) -> String {
        s.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" }) ? "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : s
    }

    func linea(_ valores: [String: String]) -> String {
        encabezado.map { CSV.campo(valores[$0] ?? "") }.joined(separator: ",")
    }

    func dic(_ r: Registro) -> [String: String] {
        Dictionary(uniqueKeysWithValues: encabezado.enumerated().map { ($0.element, $0.offset < r.campos.count ? r.campos[$0.offset] : "") })
    }

    /// agrega una fila al final, sin tocar el resto del archivo
    func agregar(_ valores: [String: String]) -> String {
        var t = texto
        if !t.hasSuffix("\n") { t += "\n" }
        return t + linea(valores) + "\n"
    }

    /// cambia solo las filas que cumplen la condición; el resto del archivo queda igual, byte por byte
    func cambiar(donde: (Int, [String: String]) -> Bool, _ f: (inout [String: String]) -> Void) -> (String, Int) {
        var out = "", n = 0, prev = texto.startIndex
        for (i, r) in registros.enumerated() {
            var d = dic(r)
            guard donde(i, d) else { continue }
            f(&d); n += 1
            out += texto[prev..<r.rango.lowerBound]
            out += linea(d)
            prev = r.rango.upperBound
        }
        out += texto[prev...]
        return (out, n)
    }
}
