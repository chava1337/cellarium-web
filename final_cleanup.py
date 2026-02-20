#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re

# Leer el archivo
with open('src/screens/GlobalWineCatalogScreen.tsx', 'rb') as f:
    content = f.read().decode('utf-8', errors='ignore')

# Dividir en líneas
lines = content.split('\n')

# Procesar líneas: eliminar TODAS las líneas vacías innecesarias
cleaned_lines = []
prev_empty = False
in_string = False
string_delimiter = None
in_jsx = False
jsx_depth = 0

for i, line in enumerate(lines):
    stripped = line.strip()
    original_line = line
    
    # Detectar strings (simplificado)
    if not in_string:
        # Buscar inicio de string
        if '`' in stripped and stripped.count('`') % 2 == 1:
            in_string = True
            string_delimiter = '`'
        elif ('"' in stripped and stripped.count('"') % 2 == 1) or ("'" in stripped and stripped.count("'") % 2 == 1):
            in_string = True
            string_delimiter = '"' if '"' in stripped else "'"
    else:
        # Buscar fin de string
        if string_delimiter in stripped:
            if stripped.count(string_delimiter) % 2 == 1:
                in_string = False
                string_delimiter = None
    
    # Si estamos dentro de un string, mantener la línea tal cual
    if in_string:
        cleaned_lines.append(original_line)
        prev_empty = False
        continue
    
    # Detectar JSX
    if '<' in stripped and not stripped.startswith('//'):
        in_jsx = True
        jsx_depth += stripped.count('<') - stripped.count('</') - stripped.count('/>')
    elif '>' in stripped and in_jsx:
        jsx_depth -= stripped.count('>')
        if jsx_depth <= 0:
            in_jsx = False
            jsx_depth = 0
    
    is_empty = len(stripped) == 0
    
    # Reglas para líneas vacías:
    # 1. Eliminar líneas vacías al inicio del archivo
    # 2. Eliminar líneas vacías al final del archivo
    # 3. Eliminar líneas vacías múltiples consecutivas (máximo 1)
    # 4. Mantener 1 línea vacía solo después de bloques importantes
    
    if is_empty:
        # Solo agregar si:
        # - No es la primera línea
        # - La anterior no era vacía
        # - La línea anterior termina con ';', '}', ')' o es un import/export/type/interface
        if len(cleaned_lines) > 0 and not prev_empty:
            prev_line = cleaned_lines[-1].strip() if cleaned_lines else ''
            # Solo mantener línea vacía después de bloques importantes
            if prev_line.endswith(';') or prev_line.endswith('}') or prev_line.endswith(')') or \
               prev_line.startswith('import ') or prev_line.startswith('export ') or \
               prev_line.startswith('//') or prev_line.startswith('/*') or \
               prev_line.startswith('type ') or prev_line.startswith('interface ') or \
               prev_line.startswith('const ') or prev_line.startswith('function ') or \
               prev_line.startswith('return ') or prev_line == '':
                # No agregar línea vacía si la anterior ya era importante
                if not (prev_line.endswith(';') or prev_line.endswith('}') or prev_line.endswith(')')):
                    cleaned_lines.append('')
            prev_empty = True
        else:
            prev_empty = True
    else:
        # Línea con contenido
        cleaned_lines.append(original_line)
        prev_empty = False

# Eliminar líneas vacías al inicio
while cleaned_lines and cleaned_lines[0].strip() == '':
    cleaned_lines.pop(0)

# Eliminar líneas vacías al final
while cleaned_lines and cleaned_lines[-1].strip() == '':
    cleaned_lines.pop()

# Unir líneas
cleaned_content = '\n'.join(cleaned_lines)

# Corregir caracteres corruptos
cleaned_content = cleaned_content.replace('', '•')
cleaned_content = cleaned_content.replace('requestáás', 'requests')
cleaned_content = cleaned_content.replace('Informacin', 'Información')
cleaned_content = cleaned_content.replace('tcnica', 'técnica')
cleaned_content = cleaned_content.replace('bsica', 'básica')

# Buscar dónde agregar los estilos faltantes (antes del cierre del StyleSheet)
# Buscar la línea con "});" que cierra el StyleSheet
if 'footerEndText:' in cleaned_content:
    # Agregar estilos faltantes antes del cierre
    styles_to_add = ''',
    sectionCard: {
        backgroundColor: '#f9f9f9',
        borderRadius: 12,
        padding: 12,
        marginVertical: 8,
    },
    sectionTitleCompact: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#8B0000',
        marginBottom: 8,
    },
    profileBarContainerCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 8,
    },
    profileLabelCompact: {
        width: 80,
        fontSize: 12,
        color: '#666',
        fontWeight: '500',
    },
    profileBarBackgroundCompact: {
        flex: 1,
        height: 6,
        backgroundColor: '#e0e0e0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    profileValueCompact: {
        width: 45,
        textAlign: 'right',
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
    },'''
    
    # Insertar antes del cierre del StyleSheet
    cleaned_content = cleaned_content.replace(
        'footerEndText: {',
        f'footerEndText: {styles_to_add}\n    footerEndText: {{'
    )
    
    # Corregir duplicado
    cleaned_content = cleaned_content.replace(
        f'{styles_to_add}\n    footerEndText: {{',
        f'{styles_to_add}\n    footerEndText: {{',
        1
    )

# Escribir el archivo limpio
with open('src/screens/GlobalWineCatalogScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(cleaned_content)

print(f"Archivo limpiado: {len(lines)} líneas -> {len(cleaned_lines)} líneas")
print(f"Reducción: {len(lines) - len(cleaned_lines)} líneas eliminadas")



