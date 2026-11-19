// Misma fórmula que compartido/precios.js (el servidor es quien manda; esto es solo la vista previa del formulario).
export const calcularPrecioVenta = (base, ganancia, iva) => Math.round(base * (1 + ganancia / 100) * (1 + iva / 100));
