# Guía: Service Worker en Lumu

## Visión General
El Service Worker (SW) de Lumu implementa:
- **PWA**: App instalable en móviles/desktop
- **Offline support**: Página funciona sin internet
- **Cache-first**: Assets estáticos cacheados para velocidad
- **Auto-reload**: Actualización automática cuando hay nueva versión

## Estrategia de Cache

### Cache-First (Assets Estáticos)
```
1. Request llega → Busca en cache
2. Si está en cache → Devuelve inmediatamente + actualiza en background
3. Si no está → Fetch de red → Guarda en cache → Devuelve
```

### Network-First (HTML/Dinámico)
```
1. Request llega → Intenta fetch de red
2. Si red OK → Devuelve + actualiza cache
3. Si red FAIL → Busca en cache → Si no hay, devuelve offline page
```

## Implementación Actual

### Estructura de Archivos
```javascript
// sw.js - Service Worker principal
const CACHE_VERSION = new Date().toISOString().slice(0, 10); // Cambia diario
const CACHE_NAME = `lumu-${CACHE_VERSION}`;

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/images/icon-192.svg',
    // ... más assets
];
```

### Ciclo de Vida

#### 1. Install
```javascript
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting()) // Activar inmediatamente
    );
});
```

#### 2. Activate
```javascript
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key)) // Limpiar caches viejas
            )
        ).then(() => self.clients.claim())
    );
    
    // Notificar a todos los clientes que hay nueva versión
    self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
            client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION });
        });
    });
});
```

#### 3. Fetch
```javascript
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET
    if (request.method !== 'GET') return;
    
    // Skip APIs y externos
    if (url.pathname.startsWith('/api/') || 
        url.hostname.includes('google')) {
        return;
    }
    
    // Cache-first para assets estáticos
    if (url.pathname.match(/\.(css|js|png|svg)$/)) {
        event.respondWith(
            caches.match(request).then(cached => {
                // Stale-while-revalidate
                const fetchPromise = fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(request, clone));
                    }
                    return response;
                }).catch(() => cached);
                
                return cached || fetchPromise;
            })
        );
    }
});
```

## Auto-Reload de Versión Nueva

### En el SW (sw.js)
```javascript
// Al activar, notificar a todos los clientes
self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client => {
        client.postMessage({ 
            type: 'SW_ACTIVATED', 
            version: CACHE_VERSION 
        });
    });
});
```

### En el Frontend (app.js)
```javascript
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => {
            // Recargar cuando hay nuevo SW
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[SW] New version, reloading...');
                window.location.reload();
            });
            
            // También escuchar mensajes directos
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'SW_ACTIVATED') {
                    if (navigator.serviceWorker.controller) {
                        window.location.reload();
                    }
                }
            });
        });
}
```

## Cache Busting

### Estrategia Actual
1. **SW usa fecha**: `CACHE_VERSION = new Date().toISOString().slice(0, 10)`
   - Cambia cada día automáticamente
2. **Assets con query param**: `app.js?v=storage_quota_fix_v1`
   - Cambiar manualmente para fixes urgentes

### Cuándo Forzar Actualización
```javascript
// Opción 1: Cambiar versión en index.html (inmediato)
<script src="app.js?v=nueva_version_manual"></script>

// Opción 2: Esperar al día siguiente (SW cambia solo)
// CACHE_VERSION usa fecha, se actualiza automáticamente

// Opción 3: Invalidar desde DevTools
// Application → Service Workers → Unregister
```

## Debugging

### Verificar SW Registrado
```javascript
// En consola del navegador
navigator.serviceWorker.getRegistrations().then(regs => {
    console.log('SWs registrados:', regs);
});
```

### Ver Cache Actual
```javascript
// Listar caches
caches.keys().then(keys => console.log('Caches:', keys));

// Ver contenido de un cache
caches.open('lumu-2026-04-09').then(cache => {
    cache.keys().then(requests => {
        requests.forEach(r => console.log('Cached:', r.url));
    });
});
```

### Bypass Cache (Desarrollo)
```javascript
// En DevTools → Network → Check "Disable cache"
// O hard reload: Ctrl+Shift+R
```

### Limpiar Todo
```javascript
// Desregistrar SW
navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
});

// Limpiar caches
caches.keys().then(keys => {
    keys.forEach(key => caches.delete(key));
});
```

## Push Notifications

El SW también maneja push notifications:

```javascript
self.addEventListener('push', (event) => {
    const data = event.data.json();
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/images/icon-192.svg',
            badge: '/images/icon-192.svg',
            data: { url: data.url },
            vibrate: [200, 100, 200],
            actions: [
                { action: 'open', title: 'Ver ahora' },
                { action: 'dismiss', title: 'Descartar' }
            ]
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        clients.openWindow(url)
    );
});
```

## Problemas Comunes

### SW No Se Actualiza
**Causa**: Navegador mantiene SW viejo hasta cerrar todas las pestañas

**Solución**: Usar `skipWaiting()` + `clients.claim()` + auto-reload

### Cache Desactualizado
**Síntoma**: Cambios en código no se ven reflejados

**Solución**: 
1. Verificar `CACHE_VERSION` cambió
2. Verificar cache busting en URLs
3. Hard reload: `Ctrl+Shift+R`

### Quota Exceeded
**Síntoma**: SW no puede cachear nuevos assets

**Solución**: Limitar `STATIC_ASSETS` o implementar cache eviction

## Recursos

- MDN Service Worker API: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- Workbox (librería avanzada): https://developer.chrome.com/docs/workbox/
- PWA Checklist: https://web.dev/pwa-checklist/
