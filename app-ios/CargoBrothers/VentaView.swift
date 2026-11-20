import SwiftUI
import Charts

/// Para fijar el precio de venta en un par de minutos: costo real, lo que sugiere el Analista, la competencia y
/// cuánto queda a cada precio. "Fijar precio" le encarga a Marketplace publicar (con las fotos de Santi de la PC).
struct PrepararVentaView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var cerrar
    @State private var producto = ""
    @State private var precio = ""
    @State private var piso = ""
    @State private var confirmar = false

    var fin: FinProducto? { store.datos?.finanzas_productos?.first { $0.producto == producto } }
    var ana: Producto? { store.datos?.productos.first { $0.producto == producto && $0.condicion == "nuevo" } }
    var costo: Double? { fin?.costo_unitario_bs ?? ana?.costo_bs }
    var unidades: Int { Int((fin?.comprado ?? 0) - (fin?.vendido ?? 0)) }
    var competencia: [Local] {
        let hace14 = F.bo("yyyy-MM-dd", Date().addingTimeInterval(-14 * 86400))
        return (store.datos?.locales?[producto] ?? [])
            .filter { $0.bs != nil && !$0.estado.contains("otra ciudad") && ($0.cuenta || ($0.src == "mkt" && $0.fecha >= hace14)) }
            .sorted { ($0.bs ?? 0) < ($1.bs ?? 0) }
    }
    var precios: [Double] {
        guard let c = costo else { return [] }
        let base = (c / 50).rounded(.up) * 50
        return stride(from: base, through: base + 1500, by: 100).map { $0 }
    }

    var body: some View {
        Form {
            Section("Producto") {
                Picker("Producto", selection: $producto) {
                    ForEach(store.datos?.finanzas_productos ?? []) { Text($0.producto).tag($0.producto) }
                    ForEach((store.datos?.vigilar ?? []).filter { v in !(store.datos?.finanzas_productos ?? []).contains { $0.producto == v.producto } }) { Text($0.producto).tag($0.producto) }
                }
                if let c = costo { fila("Nuestro costo por unidad", F.bs(c)) }
                if unidades > 0 { fila("Unidades para vender", "\(unidades)") }
            }
            if let a = ana {
                Section("Lo que dice el Analista") {
                    fila("Precio sugerido", F.bs(a.sugerido_bs))
                    fila("Mejor precio en Cochabamba", F.bs(a.local_bs))
                    Text(a.por_que).font(.footnote).foregroundStyle(Tema.gris)
                }
            }
            if let d = store.datos, piezas(d, producto) != nil {
                Section { TarjetaCosto(d: d, producto: producto) }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            }
            Section("La competencia") {
                if competencia.isEmpty { Text("Sin precios de la competencia todavía.").foregroundStyle(Tema.gris) }
                ForEach(competencia.prefix(8)) { l in
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(l.src == "mkt" ? "Marketplace" : l.vendedor.replacingOccurrences(of: " (WhatsApp)", with: "")).font(.subheadline)
                            Text("\(F.dia(l.fecha)) · \(l.estado.replacingOccurrences(of: "no cuenta: ", with: ""))").font(.caption2).foregroundStyle(Tema.gris).lineLimit(1)
                        }
                        Spacer()
                        Text(F.bs(l.bs)).monospacedDigit().foregroundStyle(l.cuenta ? Tema.texto : Tema.gris)
                    }
                }
            }
            if let c = costo, !precios.isEmpty {
                Section {
                    Chart(precios, id: \.self) { p in
                        BarMark(x: .value("Precio", Int(p)), y: .value("Margen", (p - c) / p * 100))
                            .foregroundStyle((p - c) / p >= 0.15 ? Tema.verde : (p - c) / p >= 0.05 ? Tema.ambar : Tema.rojo)
                    }
                    .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) }
                    .frame(height: 150)
                    ForEach(precios.prefix(10), id: \.self) { p in
                        Button { precio = Accion.n(p) } label: {
                            HStack {
                                Text(F.bs(p)).monospacedDigit()
                                Spacer()
                                Text(F.pct((p - c) / p * 100)).monospacedDigit().foregroundStyle((p - c) / p >= 0.15 ? Tema.verde : Tema.ambar)
                                Text("\(F.bs(p - c)) c/u · \(F.bs((p - c) * Double(max(unidades, 1)))) total").font(.caption).foregroundStyle(Tema.gris).monospacedDigit()
                            }
                        }.tint(Tema.texto)
                    }
                } header: { Text("Cuánto queda a cada precio") } footer: { Text("Toca un precio para elegirlo.") }
            }
            Section {
                LabeledContent("Precio de venta c/u (Bs)") { TextField("0", text: $precio).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                LabeledContent("Piso (lo mínimo que aceptas)") { TextField("opcional", text: $piso).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                Button { confirmar = true } label: { Label("Fijar precio y que Marketplace publique", systemImage: "tag.fill") }
                    .disabled(Accion.num(precio) == nil)
            } header: { Text("Tu decisión") } footer: {
                Text("Marketplace publica con tu cuenta y las fotos que dejes en Documents\\fotos-publicar de la PC, y te pasa cada interesado. Tú cierras precio, entrega y pago.")
            }
        }
        .navigationTitle("Preparar la venta").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Cerrar") { cerrar() } } }
        .onAppear {
            if producto.isEmpty { producto = store.datos?.finanzas_productos?.first?.producto ?? store.datos?.vigilar?.first?.producto ?? "" }
            if precio.isEmpty, let s = ana?.sugerido_bs { precio = Accion.n(s) }
        }
        .alert("¿Fijar el precio?", isPresented: $confirmar) {
            Button("Fijar") { Task { if await store.fijarPrecio(producto: producto, precio: Accion.num(precio) ?? 0, piso: Accion.num(piso), unidades: max(unidades, 1)) { cerrar() } } }
            Button("Cancelar", role: .cancel) { }
        } message: { Text("\(producto) a Bs \(precio) c/u. Queda como tarea de Marketplace para la próxima ronda y el Gerente se entera.") }
    }

    func fila(_ a: String, _ b: String) -> some View { HStack { Text(a); Spacer(); Text(b).foregroundStyle(Tema.gris).monospacedDigit() } }
}
