import Foundation

/// La misma cuenta del Analista (analista.costo_completo + referencia de venta 5 % debajo de la mediana local).
struct Calculo {
    var costoBs: Double
    var courierUSD: Double
    var via: String
    var ventaBs: Double?
    var margen: Double?       // 0.19 = 19 %
    var peor: Double?
    var gananciaUnidad: Double? { ventaBs.map { $0 - costoBs } }

    static func courier(usd: Double, peso: Double, cant: Int, k: Constantes, x: Double = 1) -> (Double, String) {
        let kg = max(k.b_min_kg, ((peso * Double(cant) + k.caja_g) / 1000 / k.b_paso_kg - 1e-9).rounded(.up) * k.b_paso_kg)
        let b = kg * k.b_usd_kg / Double(cant)
        let a = k.a_usd + usd * k.a_tax
        return a < b ? (a * x, "Courier A") : (b * x, "Courier B (\(String(format: "%g", kg)) kg)")
    }

    static func venta(mediana: Double?, factor: Double = 1) -> Double? {
        guard let m = mediana else { return nil }
        return (m * factor * 0.95 / 10).rounded(.down) * 10
    }

    static func hacer(usd: Double, envio: Double, peso: Double, cant: Int, tc: Double, mediana: Double?, k: Constantes) -> Calculo {
        func costo(_ dx: Double, _ cx: Double) -> (Double, Double, String) {
            let (c, via) = courier(usd: usd, peso: peso, cant: cant, k: k, x: cx)
            return ((usd + envio + c) * tc * dx, c, via)
        }
        let (cb, cu, via) = costo(1, 1)
        let v = venta(mediana: mediana)
        let m = v.map { ($0 - cb) / $0 }
        let vp = venta(mediana: mediana, factor: 0.9)
        let p = vp.map { ($0 - costo(1.03, 1.2).0) / $0 }
        return Calculo(costoBs: cb, courierUSD: cu, via: via, ventaBs: v, margen: m, peor: p)
    }
}
