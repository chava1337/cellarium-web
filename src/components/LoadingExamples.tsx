import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import CellariumLoader from './CellariumLoader';

/**
 * Componente de ejemplo mostrando diferentes usos del CellariumLoader
 * Este archivo puede ser eliminado después de implementar en todas las pantallas
 */

export default function LoadingExamples() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ejemplos de CellariumLoader</Text>
      
      {/* Ejemplo 1: Loader básico */}
      <View style={styles.example}>
        <Text style={styles.exampleTitle}>Básico</Text>
        <CellariumLoader />
      </View>

      {/* Ejemplo 2: Con etiqueta personalizada */}
      <View style={styles.example}>
        <Text style={styles.exampleTitle}>Con etiqueta personalizada</Text>
        <CellariumLoader 
          label="Abriendo la bodega…"
          size={150}
        />
      </View>

      {/* Ejemplo 3: Más pequeño para botones */}
      <View style={styles.example}>
        <Text style={styles.exampleTitle}>Tamaño pequeño</Text>
        <CellariumLoader 
          size={80}
          label="Guardando..."
        />
      </View>

      {/* Ejemplo 4: Velocidad personalizada */}
      <View style={styles.example}>
        <Text style={styles.exampleTitle}>Velocidad lenta</Text>
        <CellariumLoader 
          size={120}
          label="Procesando..."
          speed={0.5}
        />
      </View>

      {/* Ejemplo 5: Sin bucle */}
      <View style={styles.example}>
        <Text style={styles.exampleTitle}>Sin bucle (una sola vez)</Text>
        <CellariumLoader 
          size={100}
          label="Completando..."
          loop={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
  },
  example: {
    alignItems: 'center',
    marginBottom: 40,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  exampleTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
    color: '#666',
  },
});


















































