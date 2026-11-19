import SwiftUI
import UserNotifications
import AVFoundation
import MapKit

// Avisos de la app (Santi, 18/11): 7 tipos, cada uno con su sonido propio de Cargo Brothers (app-ios/sonidos-elegidos),
// el estándar del iPhone o uno que Santi elija desde Archivos; foto del agente o mapa; botones para actuar sin abrir la app;
// horas de silencio. Llegan cuando iOS despierta la app (sin la cuenta paga de Apple no son instantáneos).

enum TipoAviso: String, CaseIterable, Identifiable, Codable {
    case oferta, pedido, decision, mensaje, gerente, venta, ronda
    var id: String { rawValue }
    var nombre: String {
        ["oferta": "Oferta del cazador", "pedido": "El pedido llegó al almacén", "decision": "Decisión pendiente",
         "mensaje": "Mensaje del equipo", "gerente": "Recomendación del Gerente", "venta": "Venta o interesado", "ronda": "Ronda en vivo"][rawValue]!
    }
    var detalle: String {
        ["oferta": "eBay tiene un producto bajo nuestro tope", "pedido": "Llegó al almacén del courier en Miami (Santa Cruz y Cochabamba los cargas tú)",
         "decision": "El equipo espera tu OK", "mensaje": "Un agente o el Gerente te escribió", "gerente": "Sus 2 o 3 recomendaciones del día",
         "venta": "Alguien preguntó o compró en Marketplace", "ronda": "Empezó o terminó una ronda"][rawValue]!
    }
    var sonidoNuestro: String {
        ["oferta": "caja registradora", "pedido": "paquete", "decision": "campanita", "mensaje": "burbuja",
         "gerente": "acorde", "venta": "monedas", "ronda": "tic"][rawValue]!
    }
    var icono: String {
        ["oferta": "scope", "pedido": "shippingbox.fill", "decision": "checkmark.seal", "mensaje": "bubble.left.fill",
         "gerente": "lightbulb.fill", "venta": "banknote", "ronda": "dot.radiowaves.left.and.right"][rawValue]!
    }
    var porDefecto: Bool { self != .ronda }
    var archivo: String { "cb-\(rawValue).caf" }
    var categoria: String { "CB_" + rawValue.uppercased() }
}

struct AjusteAviso: Codable, Equatable {
    var activo: Bool
    var sonido: String = "nuestro"     // nuestro | estandar | propio | ninguno
    var propioNombre: String = ""
}

@MainActor
final class AjustesAvisos: ObservableObject {
    static let compartido = AjustesAvisos()
    @Published var tipos: [TipoAviso: AjusteAviso] { didSet { guardar() } }
    @Published var silencio: Bool { didSet { UserDefaults.standard.set(silencio, forKey: "av_silencio") } }
    @Published var desde: Int { didSet { UserDefaults.standard.set(desde, forKey: "av_desde") } }
    @Published var hasta: Int { didSet { UserDefaults.standard.set(hasta, forKey: "av_hasta") } }

    init() {
        let ud = UserDefaults.standard
        var t: [TipoAviso: AjusteAviso] = [:]
        if let d = ud.data(forKey: "av_tipos"), let x = try? JSONDecoder().decode([String: AjusteAviso].self, from: d) {
            for (k, v) in x { if let tp = TipoAviso(rawValue: k) { t[tp] = v } }
        }
        for tp in TipoAviso.allCases where t[tp] == nil { t[tp] = AjusteAviso(activo: tp.porDefecto) }
        tipos = t
        silencio = ud.object(forKey: "av_silencio") as? Bool ?? true
        desde = ud.object(forKey: "av_desde") as? Int ?? 22
        hasta = ud.object(forKey: "av_hasta") as? Int ?? 8
    }
    private func guardar() {
        let x = Dictionary(uniqueKeysWithValues: tipos.map { ($0.key.rawValue, $0.value) })
        if let d = try? JSONEncoder().encode(x) { UserDefaults.standard.set(d, forKey: "av_tipos") }
    }
    func ajuste(_ t: TipoAviso) -> AjusteAviso { tipos[t] ?? AjusteAviso(activo: t.porDefecto) }
    var enSilencio: Bool {
        guard silencio else { return false }
        let h = Int(F.bo("H")) ?? 12
        return desde > hasta ? (h >= desde || h < hasta) : (h >= desde && h < hasta)
    }

    static var carpetaSonidos: URL {
        let u = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Sounds")
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }

    /// Un audio de Archivos (mp3, m4a, wav…) pasa a .caf PCM en Library/Sounds, recortado a 29 s (iOS no acepta más).
    func importar(_ origen: URL, para t: TipoAviso) throws {
        let acceso = origen.startAccessingSecurityScopedResource()
        defer { if acceso { origen.stopAccessingSecurityScopedResource() } }
        let entrada = try AVAudioFile(forReading: origen)
        let formato = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: entrada.processingFormat.sampleRate,
                                    channels: entrada.processingFormat.channelCount, interleaved: true)!
        let destino = AjustesAvisos.carpetaSonidos.appendingPathComponent("propio-\(t.rawValue).caf")
        try? FileManager.default.removeItem(at: destino)
        let salida = try AVAudioFile(forWriting: destino, settings: formato.settings, commonFormat: .pcmFormatFloat32, interleaved: false)
        let maximo = AVAudioFramePosition(entrada.processingFormat.sampleRate * 29)
        let buf = AVAudioPCMBuffer(pcmFormat: entrada.processingFormat, frameCapacity: 8192)!
        var leidos: AVAudioFramePosition = 0
        while leidos < min(entrada.length, maximo) {
            try entrada.read(into: buf, frameCount: AVAudioFrameCount(min(8192, min(entrada.length, maximo) - leidos)))
            if buf.frameLength == 0 { break }
            try salida.write(from: buf)
            leidos += AVAudioFramePosition(buf.frameLength)
        }
        var a = ajuste(t); a.sonido = "propio"; a.propioNombre = origen.deletingPathExtension().lastPathComponent
        tipos[t] = a
    }

    func urlSonido(_ t: TipoAviso) -> URL? {
        switch ajuste(t).sonido {
        case "nuestro": return Bundle.main.url(forResource: "cb-\(t.rawValue)", withExtension: "caf")
        case "propio": return AjustesAvisos.carpetaSonidos.appendingPathComponent("propio-\(t.rawValue).caf")
        default: return nil
        }
    }

    func sonido(_ t: TipoAviso) -> UNNotificationSound? {
        if enSilencio { return nil }
        switch ajuste(t).sonido {
        case "nuestro": return UNNotificationSound(named: UNNotificationSoundName(t.archivo))
        case "propio": return UNNotificationSound(named: UNNotificationSoundName("propio-\(t.rawValue).caf"))
        case "estandar": return .default
        default: return nil
        }
    }
}

/// Para escuchar el sonido en Ajustes
@MainActor
final class Reproductor {
    static var actual: AVAudioPlayer?
    static func tocar(_ t: TipoAviso) {
        let aj = AjustesAvisos.compartido
        if aj.ajuste(t).sonido == "estandar" { AudioServicesPlaySystemSound(1007); return }
        guard let u = aj.urlSonido(t) else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        actual = try? AVAudioPlayer(contentsOf: u)
        actual?.play()
    }
}

// ---------- Armar y mandar avisos ----------
enum Avisador {
    static func registrarCategorias() {
        let c = UNUserNotificationCenter.current()
        let ver = UNNotificationAction(identifier: "VER", title: "Ver", options: [.foreground])
        c.setNotificationCategories([
            UNNotificationCategory(identifier: TipoAviso.oferta.categoria, actions: [
                UNNotificationAction(identifier: "EBAY", title: "Ver en eBay", options: [.foreground], icon: .init(systemImageName: "arrow.up.right.square")),
                UNNotificationAction(identifier: "CALCULAR", title: "¿Cuánto me sale?", options: [.foreground], icon: .init(systemImageName: "function"))], intentIdentifiers: []),
            UNNotificationCategory(identifier: TipoAviso.pedido.categoria, actions: [
                UNNotificationAction(identifier: "VER", title: "Ver el pedido", options: [.foreground], icon: .init(systemImageName: "map"))], intentIdentifiers: []),
            UNNotificationCategory(identifier: TipoAviso.decision.categoria, actions: [
                UNNotificationAction(identifier: "APROBAR", title: "Aprobar", options: [.authenticationRequired], icon: .init(systemImageName: "checkmark")),
                UNNotificationAction(identifier: "RECHAZAR", title: "Rechazar", options: [.authenticationRequired, .destructive], icon: .init(systemImageName: "xmark"))], intentIdentifiers: []),
            UNNotificationCategory(identifier: TipoAviso.mensaje.categoria, actions: [
                UNTextInputNotificationAction(identifier: "RESPONDER", title: "Responder", options: [.authenticationRequired],
                                              icon: .init(systemImageName: "arrowshape.turn.up.left"), textInputButtonTitle: "Enviar", textInputPlaceholder: "Tu respuesta")], intentIdentifiers: []),
            UNNotificationCategory(identifier: TipoAviso.gerente.categoria, actions: [ver], intentIdentifiers: []),
            UNNotificationCategory(identifier: TipoAviso.venta.categoria, actions: [
                UNNotificationAction(identifier: "VER", title: "Ver el anuncio", options: [.foreground])], intentIdentifiers: []),
            UNNotificationCategory(identifier: TipoAviso.ronda.categoria, actions: [], intentIdentifiers: [])])
    }

    /// la foto del agente (o cualquier imagen) como adjunto del aviso
    static func adjunto(_ img: UIImage?, _ id: String) -> UNNotificationAttachment? {
        guard let img, let png = img.pngData() else { return nil }
        let u = FileManager.default.temporaryDirectory.appendingPathComponent("\(id)-\(UUID().uuidString).png")
        guard (try? png.write(to: u)) != nil else { return nil }
        return try? UNNotificationAttachment(identifier: id, url: u)
    }

    static func foto(_ agente: String) -> UIImage? { UIImage(named: "foto-\(agente)") ?? UIImage(named: "Logo") }

    /// mapa con la ruta del pedido (para el aviso de llegada)
    static func mapa(_ p: Pedido) async -> UIImage? {
        let pts = p.eventos.compactMap { e -> CLLocationCoordinate2D? in
            guard let a = e.lat, let o = e.lon else { return nil }; return CLLocationCoordinate2D(latitude: a, longitude: o) }
        guard let ult = pts.last else { return nil }
        let opt = MKMapSnapshotter.Options()
        opt.region = MKCoordinateRegion(center: ult, span: MKCoordinateSpan(latitudeDelta: 8, longitudeDelta: 8))
        opt.size = CGSize(width: 600, height: 400)
        opt.traitCollection = UITraitCollection(userInterfaceStyle: .dark)
        guard let snap = try? await MKMapSnapshotter(options: opt).start() else { return nil }
        let r = UIGraphicsImageRenderer(size: opt.size)
        return r.image { ctx in
            snap.image.draw(at: .zero)
            let c = ctx.cgContext
            c.setStrokeColor(UIColor(Tema.bronce).cgColor); c.setLineWidth(5); c.setLineCap(.round)
            for (i, p) in pts.enumerated() { let q = snap.point(for: p); i == 0 ? c.move(to: q) : c.addLine(to: q) }
            c.strokePath()
            let q = snap.point(for: ult)
            c.setFillColor(UIColor(Tema.bronce).cgColor); c.fillEllipse(in: CGRect(x: q.x - 11, y: q.y - 11, width: 22, height: 22))
            c.setFillColor(UIColor.black.cgColor); c.fillEllipse(in: CGRect(x: q.x - 4, y: q.y - 4, width: 8, height: 8))
        }
    }

    @MainActor
    static func mandar(_ t: TipoAviso, titulo: String, sub: String = "", cuerpo: String, imagen: UIImage? = nil,
                       info: [String: String] = [:], en segundos: Double = 0.5, forzar: Bool = false) async {
        let aj = AjustesAvisos.compartido
        guard forzar || aj.ajuste(t).activo else { return }
        let c = UNMutableNotificationContent()
        c.title = titulo; c.subtitle = sub; c.body = cuerpo
        c.sound = aj.sonido(t)
        c.categoryIdentifier = t.categoria
        c.threadIdentifier = t.rawValue
        c.userInfo = info.merging(["tipo": t.rawValue]) { a, _ in a }
        c.interruptionLevel = aj.enSilencio ? .passive : .active
        c.relevanceScore = t == .oferta || t == .decision ? 0.9 : 0.5
        if let a = adjunto(imagen, t.rawValue) { c.attachments = [a] }
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: c,
                                        trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(segundos, 0.5), repeats: false))
        try? await UNUserNotificationCenter.current().add(req)
    }

    // ---------- Lo que dispara cada aviso: compara los datos nuevos con los últimos vistos ----------
    static func revisar(_ d: Datos, avisar: Bool) async {
        let ud = UserDefaults.standard
        let primera = ud.object(forKey: "nov_ofertas") == nil
        let ofertas = Set(d.cazador.topes.filter(\.bajo_tope).map(\.producto))
        let estados = Dictionary(uniqueKeysWithValues: d.pedidos.filter { !$0.esPrueba }.map { ($0.id, $0.estado) })
        let decidir = Set(d.decidir.map(\.id))
        let chat = Set((d.chat ?? []).filter { $0.para == "santi" }.map(\.id))
        let rec = d.recomendaciones_cuando ?? ""
        let pubs = Set((d.publicaciones ?? []).filter { ["vendida", "interesado", "mensaje"].contains($0.accion) || !$0.mensajes.isEmpty }.map(\.id))
        let o0 = Set(ud.stringArray(forKey: "nov_ofertas") ?? []), e0 = ud.dictionary(forKey: "nov_estados") as? [String: String] ?? [:]
        let d0 = Set(ud.stringArray(forKey: "nov_decidir") ?? []), c0 = Set(ud.stringArray(forKey: "nov_chat") ?? [])
        let r0 = ud.string(forKey: "nov_rec") ?? "", p0 = Set(ud.stringArray(forKey: "nov_pubs") ?? [])
        ud.set(Array(ofertas), forKey: "nov_ofertas"); ud.set(estados, forKey: "nov_estados"); ud.set(Array(decidir), forKey: "nov_decidir")
        ud.set(Array(chat), forKey: "nov_chat"); ud.set(rec, forKey: "nov_rec"); ud.set(Array(pubs), forKey: "nov_pubs")
        guard avisar, !primera else { return }

        for p in ofertas.subtracting(o0) {
            guard let t = d.cazador.topes.first(where: { $0.producto == p }) else { continue }
            await mandar(.oferta, titulo: "Oferta en eBay: \(p)", sub: "\(F.usd(t.hoy_usd)) · nuestro tope \(F.usd(t.tope_usd))",
                         cuerpo: margenTexto(d, p, t.hoy_usd), imagen: foto("ebay"), info: ["url": t.link, "producto": p])
        }
        var vistos = Set<String>()
        for p in d.pedidos where !p.esPrueba && e0[p.id] != nil && e0[p.id] != p.estado && p.estado == "en bodega del courier"
            && vistos.insert(p.producto + p.fecha_compra).inserted {
            let n = d.pedidos.filter { $0.producto == p.producto && $0.fecha_compra == p.fecha_compra && !$0.esPrueba }.reduce(0) { $0 + $1.cantidad }
            await mandar(.pedido, titulo: "Tus \(n) \(p.producto) llegaron al almacén", sub: "Courier en Miami",
                         cuerpo: "El paquete ya está en la bodega del courier. Desde ahí sale hacia Bolivia.", imagen: await mapa(p), info: ["pedido": p.id])
        }
        for x in d.decidir where decidir.subtracting(d0).contains(x.id) {
            await mandar(.decision, titulo: x.tipo == "necesidad" ? "El equipo necesita algo" : "El Gerente espera tu OK",
                         sub: Equipo.nombre(x.agente), cuerpo: x.titulo, imagen: foto("gerente"),
                         info: ["dtipo": x.tipo, "ref": x.ref, "titulo": x.titulo])
        }
        for m in (d.chat ?? []) where chat.subtracting(c0).contains(m.id) {
            await mandar(.mensaje, titulo: Equipo.nombre(m.de), sub: "te escribió", cuerpo: m.texto, imagen: foto(m.de), info: ["agente": m.de])
        }
        if !rec.isEmpty, rec != r0, let r = d.recomendaciones, !r.isEmpty {
            await mandar(.gerente, titulo: "El Gerente te recomienda \(r.count == 1 ? "una cosa" : "\(r.count) cosas")",
                         cuerpo: r.enumerated().map { "\($0.offset + 1). \($0.element.texto)" }.joined(separator: "\n"), imagen: foto("gerente"))
        }
        for x in (d.publicaciones ?? []) where pubs.subtracting(p0).contains(x.id) {
            await mandar(.venta, titulo: x.accion == "vendida" ? "¡Se vendió! \(x.producto)" : "Alguien preguntó por el \(x.producto)",
                         sub: x.precio_bs.isEmpty ? "" : "Bs \(x.precio_bs)", cuerpo: x.notas.isEmpty ? "Mira el anuncio en la app." : x.notas, imagen: foto("mkt"))
        }
    }

    static func margenTexto(_ d: Datos, _ p: String, _ usd: Double?) -> String {
        guard let u = usd, let k = d.constantes, let tc = d.dolar.usado, let v = d.vigilar?.first(where: { $0.producto == p }) else { return "Mira el margen en Precios." }
        let c = Calculo.hacer(usd: u, envio: 0, peso: v.peso_g, cant: 2, tc: tc, mediana: v.mediana_bs, k: k)
        guard let m = c.margen else { return "Puesto acá: \(F.bs(c.costoBs))." }
        return "Puesto acá \(F.bs(c.costoBs)), vendido a \(F.bs(c.ventaBs)) deja \(F.pct(m * 100)) (peor caso \(F.pct((c.peor ?? 0) * 100)))."
    }

    /// el foquito: aviso cuando empieza o termina una ronda
    static func ronda(antes: Vivo?, ahora: Vivo?) async {
        let a = antes?.enCurso ?? false, b = ahora?.enCurso ?? false
        guard a != b else { return }
        if b { await mandar(.ronda, titulo: "Empezó la ronda", sub: "PC de la casa · \(ahora?.ronda?.desde ?? "")", cuerpo: "Mira en vivo qué hace cada agente.") }
        else { await mandar(.ronda, titulo: "Terminó la ronda", sub: "a las \(ahora?.ronda?.hasta ?? "")", cuerpo: "Los datos de la app ya se están actualizando.") }
    }

    /// el botón "Probar" de Ajustes: un ejemplo de cada tipo con datos reales si los hay
    @MainActor
    static func ejemplo(_ t: TipoAviso, _ d: Datos?) async {
        switch t {
        case .oferta:
            let x = d?.cazador.topes.first(where: \.bajo_tope)
            await mandar(.oferta, titulo: "Oferta en eBay: \(x?.producto ?? "Ryzen 5 7600X")", sub: "\(F.usd(x?.hoy_usd ?? 139)) · nuestro tope \(F.usd(x?.tope_usd ?? 166))",
                         cuerpo: d.map { margenTexto($0, x?.producto ?? "", x?.hoy_usd) } ?? "Deja 27 %.", imagen: foto("ebay"), info: ["url": x?.link ?? "", "producto": x?.producto ?? ""], en: 3, forzar: true)
        case .pedido:
            let p = d?.pedidos.first { !$0.esPrueba }
            await mandar(.pedido, titulo: "Tus 4 \(p?.producto ?? "Ryzen 7 7700X") llegaron al almacén", sub: "Courier en Miami (ejemplo)",
                         cuerpo: "El paquete ya está en la bodega del courier. Desde ahí sale hacia Bolivia.", imagen: p != nil ? await mapa(p!) : nil, info: p.map { ["pedido": $0.id] } ?? [:], en: 3, forzar: true)
        case .decision:
            let x = d?.decidir.first
            await mandar(.decision, titulo: "El Gerente espera tu OK (ejemplo)", sub: Equipo.nombre(x?.agente ?? "gerente"),
                         cuerpo: x?.titulo ?? "Te propongo que WhatsApp pida la lista a las tiendas frías.", imagen: foto("gerente"), en: 3, forzar: true)
        case .mensaje:
            await mandar(.mensaje, titulo: "WhatsApp", sub: "te escribió (ejemplo)", cuerpo: "Punto Tecnológico nos pasó el 9600X a Bs 2.750. ¿Le pido también el 7600X?",
                         imagen: foto("wa"), info: ["agente": "wa", "ejemplo": "1"], en: 3, forzar: true)
        case .gerente:
            let r = d?.recomendaciones ?? []
            await mandar(.gerente, titulo: "El Gerente te recomienda \(max(r.count, 3)) cosas", cuerpo: r.isEmpty ? "1. Fija el precio del 7700X\n2. Revisa el reclamo a eBay\n3. Aprueba la idea 23" :
                            r.enumerated().map { "\($0.offset + 1). \($0.element.texto)" }.joined(separator: "\n"), imagen: foto("gerente"), en: 3, forzar: true)
        case .venta:
            await mandar(.venta, titulo: "Alguien preguntó por el Ryzen 7 7700X", sub: "Bs 3.300 · Marketplace (ejemplo)", cuerpo: "Preguntó si está sellado y si hace entrega en el centro.", imagen: foto("mkt"), en: 3, forzar: true)
        case .ronda:
            await mandar(.ronda, titulo: "Empezó la ronda (ejemplo)", sub: "PC de la casa · 16:05", cuerpo: "Mira en vivo qué hace cada agente.", en: 3, forzar: true)
        }
    }
}

// ---------- Botones de los avisos ----------
final class DelegadoAvisos: NSObject, UNUserNotificationCenterDelegate {
    static let compartido = DelegadoAvisos()

    // (19/11) con las versiones "async" iOS terminaba la respuesta fuera del hilo principal y la app se cerraba al tocar
    // un aviso: ahora todo corre en el hilo principal y se avisa a iOS al final, también ahí
    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification,
                                withCompletionHandler listo: @escaping (UNNotificationPresentationOptions) -> Void) {
        listo([.banner, .list, .sound])
    }

    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse,
                                withCompletionHandler listo: @escaping () -> Void) {
        // solo los datos de texto (un aviso puede traer otras cosas, como "aps")
        var info: [String: String] = [:]
        for (k, v) in r.notification.request.content.userInfo { if let k = k as? String, let v = v as? String { info[k] = v } }
        let accion = r.actionIdentifier
        let texto = (r as? UNTextInputNotificationResponse)?.userText
        Task { @MainActor in
            switch accion {
            case "EBAY":
                if let s = info["url"], let u = URL(string: s) { await UIApplication.shared.open(u) }
            case "APROBAR", "RECHAZAR":
                if let t = info["dtipo"], let ref = info["ref"] {
                    let d = Decision(tipo: t, ref: ref, agente: "", fecha: "", titulo: info["titulo"] ?? "", detalle: "", plazo: "")
                    await Store.compartido.decidirDirecto(d, accion: t == "necesidad" ? "resuelta" : (accion == "APROBAR" ? "aprobar" : "rechazar"))
                }
            case "RESPONDER":
                if let texto, let ag = info["agente"], info["ejemplo"] == nil { _ = await Store.compartido.escribir(a: ag, texto) }
            case UNNotificationDefaultActionIdentifier:
                // tocar el aviso: abre el lugar justo (el pedido, el producto, la decisión o el chat)
                Store.compartido.destino = Destino.de(info)
            default: break
            }
            listo()
        }
    }
}

// ---------- Ajustes → Notificaciones ----------
struct NotificacionesView: View {
    @EnvironmentObject var store: Store
    @StateObject private var aj = AjustesAvisos.compartido
    @State private var permiso = "…"
    @State private var importarPara: TipoAviso?
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                HStack { Text("Permiso de iOS"); Spacer(); Text(permiso).foregroundStyle(permiso == "activado" ? Tema.verde : Tema.ambar) }
                if permiso != "activado" {
                    Button("Activar avisos") { Novedades.pedirPermiso(); Task { await leerPermiso() } }
                    Button("Abrir los ajustes del iPhone") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }
                }
            } footer: {
                Text("Sin la cuenta paga de Apple, los avisos llegan cuando iOS despierta la app: pueden tardar unos minutos. Telegram sigue llegando al instante.")
            }
            ForEach(TipoAviso.allCases) { t in
                Section {
                    Toggle(isOn: Binding(get: { aj.ajuste(t).activo }, set: { var a = aj.ajuste(t); a.activo = $0; aj.tipos[t] = a })) {
                        Label { VStack(alignment: .leading, spacing: 2) { Text(t.nombre); Text(t.detalle).font(.caption).foregroundStyle(Tema.gris) } }
                            icon: { Image(systemName: t.icono).foregroundStyle(Tema.bronce) }
                    }
                    if aj.ajuste(t).activo {
                        Picker("Sonido", selection: Binding(get: { aj.ajuste(t).sonido }, set: { var a = aj.ajuste(t); a.sonido = $0; aj.tipos[t] = a })) {
                            Text("Nuestro · \(t.sonidoNuestro)").tag("nuestro")
                            Text("Estándar del iPhone").tag("estandar")
                            if !aj.ajuste(t).propioNombre.isEmpty { Text("Mío · \(aj.ajuste(t).propioNombre)").tag("propio") }
                            Text("Sin sonido").tag("ninguno")
                        }
                        HStack(spacing: 8) {
                            Button { Reproductor.tocar(t) } label: { Label("Oír", systemImage: "play.fill").lineLimit(1).frame(maxWidth: .infinity) }
                                .buttonStyle(.bordered)
                            Button { importarPara = t } label: { Label("Mío", systemImage: "folder").lineLimit(1).frame(maxWidth: .infinity) }
                                .buttonStyle(.bordered)
                            Button { Task { await Avisador.ejemplo(t, store.datos) } } label: { Label("Probar", systemImage: "bell.badge").lineLimit(1).frame(maxWidth: .infinity) }
                                .buttonStyle(.borderedProminent).tint(Tema.bronce).foregroundStyle(Tema.sobreAcento)
                        }
                        .font(.footnote.weight(.semibold)).controlSize(.small).labelStyle(.titleAndIcon)
                    }
                }
            }
            Section {
                Toggle("Horas de silencio", isOn: $aj.silencio)
                if aj.silencio {
                    Stepper("Desde las \(aj.desde):00", value: $aj.desde, in: 0...23)
                    Stepper("Hasta las \(aj.hasta):00", value: $aj.hasta, in: 0...23)
                }
            } footer: { Text("En ese horario los avisos llegan igual, pero sin sonar ni encender la pantalla.") }
            if let error { Text(error).foregroundStyle(Tema.rojo).font(.footnote) }
        }
        .navigationTitle("Notificaciones").navigationBarTitleDisplayMode(.inline)
        .task { await leerPermiso() }
        .fileImporter(isPresented: Binding(get: { importarPara != nil }, set: { if !$0 { importarPara = nil } }),
                      allowedContentTypes: [.audio]) { r in
            guard let t = importarPara, case .success(let u) = r else { return }
            do { try aj.importar(u, para: t); error = nil; Reproductor.tocar(t) }
            catch { self.error = "No pude usar ese archivo (\(error.localizedDescription)). Prueba con un mp3, m4a o wav." }
            importarPara = nil
        }
    }

    func leerPermiso() async {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        permiso = s.authorizationStatus == .authorized || s.authorizationStatus == .provisional ? "activado" : s.authorizationStatus == .denied ? "desactivado" : "sin pedir"
    }
}
