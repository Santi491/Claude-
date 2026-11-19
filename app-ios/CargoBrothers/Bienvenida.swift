import SwiftUI
import UserNotifications

/// Pantalla de bienvenida (Santi la aprobó el 19/11): sale sola la primera vez que se abre la app. Tres pasos: qué es,
/// la clave de GitHub y los avisos. Para volver a verla: abrir la app con el argumento -bienvenida.
struct Bienvenida: View {
    @EnvironmentObject var store: Store
    var listo: () -> Void = {}
    @State private var paso = 0
    @State private var clave = ""
    @State private var probando = false
    @State private var resultado: String?

    var body: some View {
        ZStack {
            Tema.fondo.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    ForEach(0..<3) { k in Capsule().fill(k <= paso ? Tema.bronce : Tema.suave).frame(height: 4) }
                }.padding(.horizontal, 28).padding(.top, 14)
                TabView(selection: $paso) {
                    inicio.tag(0)
                    claveGitHub.tag(1)
                    avisos.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: paso)
            }
        }
    }

    func boton(_ t: String, lleno: Bool = true, _ a: @escaping () -> Void) -> some View {
        Button(action: a) {
            Text(t).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 15)
                .background(lleno ? Tema.bronce : Tema.bronce.opacity(0.14), in: RoundedRectangle(cornerRadius: 16))
                .foregroundStyle(lleno ? Tema.sobreAcento : Tema.bronce)
        }
    }

    var inicio: some View {
        VStack(spacing: 22) {
            Spacer()
            Image("Logo").resizable().renderingMode(.template).scaledToFit().frame(width: 120).foregroundStyle(Tema.texto)
            VStack(spacing: 8) {
                Text("Cargo Brothers").font(.largeTitle.weight(.bold))
                Text("Importación de componentes").font(.subheadline).foregroundStyle(Tema.bronce)
            }
            VStack(alignment: .leading, spacing: 16) {
                fila("sparkles", "El equipo trabaja por vos", "El Gerente y 8 agentes buscan precios, hablan con tiendas y siguen tus pedidos.")
                fila("checkmark.seal", "Vos decidís", "Aprobás, registrás compras y ventas, y le escribís a cada agente desde acá.")
                fila("building.2", "La oficina en tu bolsillo", "Mirá al equipo en vivo en la oficina 3D.")
            }
            .padding(.top, 10)
            Spacer()
            boton("Empezar") { paso = 1 }
        }
        .padding(28)
    }

    var claveGitHub: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Image(systemName: "key.horizontal.fill").font(.system(size: 40)).foregroundStyle(Tema.bronce)
            Text("Conectá la app con el equipo").font(.title.weight(.bold))
            Text("Con la clave de GitHub, lo que hacés en la app (compras, ventas, decisiones, mensajes) les llega a los agentes al instante. Sin la clave, igual podés mirar todo.")
                .foregroundStyle(Tema.gris)
            VStack(alignment: .leading, spacing: 8) {
                Text("1. GitHub → Settings → Developer settings").font(.footnote)
                Text("2. Fine-grained token: solo el repo Claude-").font(.footnote)
                Text("3. Permiso Contents: Read and write, 1 año").font(.footnote)
            }
            .foregroundStyle(Tema.gris).padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
            SecureField("Pegá la clave (github_pat_…)", text: $clave)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(14).background(Tema.tarjeta, in: RoundedRectangle(cornerRadius: 14))
            Label("Se guarda en el llavero del iPhone. Nunca sale del teléfono.", systemImage: "lock.fill")
                .font(.caption).foregroundStyle(Tema.verde)
            if let resultado { Text(resultado).font(.footnote) }
            Spacer()
            boton(probando ? "Probando…" : "Guardar y seguir") {
                Llavero.guardar(clave.trimmingCharacters(in: .whitespacesAndNewlines)); clave = ""
                Task { probando = true; resultado = await GitHub.probar(); probando = false; if resultado == nil { paso = 2 } }
            }.disabled(clave.count < 20 || probando)
            Button("Lo hago después") { paso = 2 }.font(.subheadline).frame(maxWidth: .infinity).foregroundStyle(Tema.gris)
        }
        .padding(28)
    }

    var avisos: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Image(systemName: "bell.badge.fill").font(.system(size: 40)).foregroundStyle(Tema.bronce)
            Text("Enterate de lo importante").font(.title.weight(.bold))
            Text("Te avisamos solo cuando vale la pena, cada uno con su sonido:").foregroundStyle(Tema.gris)
            VStack(alignment: .leading, spacing: 12) {
                fila("tag.fill", "Ofertas", "eBay tiene algo debajo de nuestro tope.")
                fila("shippingbox.fill", "Tu pedido", "Cuando llega a la bodega de Miami.")
                fila("checkmark.seal.fill", "Decisiones", "El equipo espera tu OK.")
                fila("bubble.left.fill", "Mensajes", "Un agente o el Gerente te escribió.")
            }
            Spacer()
            boton("Activar los avisos") {
                Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]); listo() }
            }
            Button("Ahora no") { listo() }.font(.subheadline).frame(maxWidth: .infinity).foregroundStyle(Tema.gris)
        }
        .padding(28)
    }

    func fila(_ icono: String, _ titulo: String, _ texto: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icono).font(.title3).foregroundStyle(Tema.bronce).frame(width: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(.subheadline.weight(.semibold))
                Text(texto).font(.footnote).foregroundStyle(Tema.gris)
            }
        }
    }
}
