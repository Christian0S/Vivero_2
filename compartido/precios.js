// Precio de venta = costo × (1 + ganancia %) × (1 + IVA %), al peso. Es la misma fórmula que traían los datos originales.
// public/js/precios.js tiene la misma función para la vista previa del formulario; una prueba comprueba que nunca se separen.
const calcularPrecioVenta = (base, ganancia, iva) => Math.round(base * (1 + ganancia / 100) * (1 + iva / 100));
module.exports = { calcularPrecioVenta };
