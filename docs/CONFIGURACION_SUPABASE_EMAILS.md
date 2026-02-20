# 📧 Configuración de Supabase para Emails Ficticios

## ❌ Problema

Supabase rechaza emails con dominio `.local` porque no es un TLD (Top Level Domain) válido según estándares de email.

Error: `Email address "chava123_9b2bf581@cellarium.local" is invalid`

## ✅ Solución Implementada

Se cambió el dominio de `.local` a `.com`:
- **Antes**: `username_ownerid@cellarium.local`
- **Ahora**: `username_ownerid@cellarium-staff.com`

## 🔧 ¿Necesitas Configurar Algo en Supabase?

**NO es necesario configurar nada en Supabase** para usar dominios `.com`. Supabase acepta cualquier dominio válido según estándares de email (`.com`, `.org`, `.net`, `.app`, etc.).

## ⚠️ Notas Importantes

1. **No se enviarán emails reales**: Estos emails ficticios nunca recibirán correos porque el dominio `cellarium-staff.com` no existe realmente.

2. **Confirmación automática**: Los usuarios staff tienen su email confirmado automáticamente en la Edge Function, por lo que no necesitan confirmación por email.

3. **Formato del email**: 
   - Formato: `{username}_{ownerIdShort}@cellarium-staff.com`
   - Ejemplo: `chava123_9b2bf581@cellarium-staff.com`
   - El `ownerIdShort` son los primeros 8 caracteres del UUID del owner (sin guiones)

## 🔍 Verificación

Si el error persiste después de cambiar a `.com`, verifica:

1. **Que el código esté actualizado**: Asegúrate de que la app esté usando la versión más reciente con `@cellarium-staff.com`

2. **Que no haya caché**: Reinicia la app completamente para asegurar que se cargue el código nuevo

3. **Logs**: Revisa los logs para confirmar que el email generado es `@cellarium-staff.com` y no `@cellarium.local`

## 📝 Alternativas si `.com` no funciona

Si por alguna razón Supabase aún rechaza el dominio, puedes usar:

1. **Dominio real pero no verificado**: `@cellarium-staff.internal` (pero esto también puede fallar)
2. **Usar un dominio de prueba**: `@example.com` o `@test.com` (estándares de prueba)
3. **Configurar dominio personalizado en Supabase**: Requiere configuración avanzada en Supabase Dashboard

La opción más segura es usar `@cellarium-staff.com` que es un dominio válido según estándares de email.


