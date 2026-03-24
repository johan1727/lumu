# QA Checklist de Lumu

Este checklist sirve para validar regresión, smoke tests y rutas críticas antes de deploy o después de cambios sensibles.

## 1. Smoke test mínimo

### Home y búsqueda
- Abrir `/`
- Confirmar que carga sin errores visuales
- Buscar un producto real
- Verificar que hay resultados o mensaje claro de cero resultados
- Verificar que el contador de resultados coincide con los productos visibles

### Autocomplete
- Escribir una búsqueda parcial
- Confirmar que aparecen sugerencias
- Confirmar que no revienta con inputs raros o muy cortos

### Búsqueda por imagen
- Subir imagen válida
- Confirmar que responde
- Probar payload inválido
- Confirmar error controlado

### Signup / login
- Abrir modal de auth
- Crear cuenta o iniciar sesión
- Confirmar que el perfil se muestra correctamente
- Confirmar que no hay errores de sesión en consola

### Signup bonus
- Usuario nuevo inicia sesión
- Reclamar bono de bienvenida
- Confirmar respuesta exitosa una sola vez
- Reintentar y confirmar que ya no vuelve a dar bono

### Reward bonus
- Usuario autenticado reclama búsquedas extra
- Confirmar que funciona
- Reintentar dentro de 1 hora y confirmar bloqueo
- Confirmar que usuario anónimo no puede reclamar

### Price alerts
- Crear alerta válida
- Listar alertas
- Eliminar alerta propia
- Confirmar que no se puede eliminar alerta ajena
- Confirmar paywall al pasar límite free

### Pricing
- Abrir `/precios.html`
- Confirmar que VIP muestra `$39 MXN/mes`
- Confirmar que B2B muestra `$199 MXN/mes`
- Confirmar CTAs correctos

### Stripe
- Simular flujo de checkout
- Confirmar webhook válido
- Confirmar que no duplica compras por idempotencia
- Confirmar actualización de plan en usuario

## 2. Rutas críticas

### Públicas
- `GET /`
- `GET /buscar`
- `GET /precio-hoy/:slug`
- `GET /comparativas/:slug`
- `POST /api/buscar`
- `POST /api/vision`
- `GET /api/autocomplete`
- `GET /api/price-history`
- `POST /api/track`
- `GET /api/config`

### Autenticadas
- `POST /api/bulk-search`
- `POST /api/memory`
- `POST /api/feedback`
- `GET /api/price-alerts`
- `POST /api/price-alerts`
- `DELETE /api/price-alerts/:id`
- `POST /api/push-subscribe`
- `POST /api/claim-reward`
- `POST /api/signup-bonus`
- `GET /api/me/coins`

### Admin
- `GET /api/admin/analytics`
- `GET /api/admin/business-stats`
- `GET /api/admin/llm-logs`
- `GET /api/admin/scraper-health`
- dropship admin routes

## 3. Casos de regresión

### Seguridad
- Confirmar que `claim-reward` requiere auth
- Confirmar que `signup-bonus` solo aplica a cuenta reciente
- Confirmar que `img-proxy` bloquea localhost/IP privada
- Confirmar que `price-alerts` valida payload con schema
- Confirmar que endpoints expuestos tienen burst rate limit

### Paywall y límites
- Usuario free llega al límite y recibe `402`
- Usuario VIP tiene límite correcto
- Usuario B2B tiene límite correcto
- Bonus searches reducen consumo visible

### SEO
- `sitemap.xml` responde `200`
- No hay URLs duplicadas obvias
- páginas `/precio-hoy/*` y `/comparativas/*` renderizan
- metadata principal existe

### Analytics
- `search`, `click`, `pricing_view`, `checkout_click`, `purchase` se registran
- `admin/business-stats` responde
- `admin/analytics` responde

## 4. Edge cases

- búsqueda vacía
- búsqueda muy larga
- caracteres raros / emojis
- cero resultados
- Supabase caído
- Stripe webhook inválido
- request sin auth donde debería requerirse
- request con origin no permitido en producción

## 5. Criterio de salida

No subir cambios si pasa cualquiera de estos:
- login roto
- búsqueda rota
- pricing roto
- bonus/paywall inconsistente
- error `500` en rutas críticas
- métricas/admin caídos sin razón conocida

## 6. Recomendación operativa

Antes de cada deploy:
- correr smoke manual básico
- revisar consola del navegador
- revisar logs backend
- revisar rutas admin
- revisar sitemap y pricing

Después del deploy:
- probar búsqueda real
- probar login
- probar bonus
- revisar `admin/business-stats`
- revisar alertas en Sentry si aplica
