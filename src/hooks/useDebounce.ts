import { useState, useEffect } from 'react';

/**
 * Hook personalizado para debounce de valores
 * Retorna el valor después de que el usuario deje de cambiar el valor por el delay especificado
 * 
 * @param value - Valor a debounce
 * @param delay - Tiempo de espera en milisegundos (default: 500ms)
 * @returns Valor debounced
 * 
 * @example
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedSearchQuery = useDebounce(searchQuery, 400);
 * 
 * // searchQuery cambia inmediatamente (UI responsiva)
 * // debouncedSearchQuery cambia 400ms después de que el usuario deje de escribir
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Crear timer que actualizará el valor debounced después del delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Limpiar timer si el valor cambia antes de que se complete el delay
    // Esto cancela la actualización anterior
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]); // Solo re-ejecutar si value o delay cambian

  return debouncedValue;
}






















