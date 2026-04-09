# Guía: Manejo de localStorage en Lumu

## Visión General
localStorage tiene un límite de ~5-10MB por dominio. Lumu implementa compresión y manejo de errores para evitar `QuotaExceededError`.

## Reglas Generales

### 1. Siempre Usar Prefijo `lumu_`
```javascript
// ✅ Correcto
localStorage.setItem('lumu_theme', 'dark');
localStorage.setItem('lumu_user_prefs', JSON.stringify(prefs));

// ❌ Incorrecto
localStorage.setItem('theme', 'dark'); // Sin prefijo
```

### 2. Limites Configurados
```javascript
const MAX_SNAPSHOTS = 20;              // Máximo snapshots guardados
const MAX_SNAPSHOT_SIZE_BYTES = 4000000; // ~4MB límite preventivo
const MAX_RESULTS_PER_SNAPSHOT = 10;   // Items por snapshot
```

## Patrones Reutilizables

### Pattern 1: Compresión de Objetos

```javascript
function compressProductForSnapshot(product) {
    if (!product || typeof product !== 'object') return null;
    
    return {
        titulo: String(product.titulo || product.title || '').slice(0, 200),
        precio: Number(product.precio || product.price || 0),
        tienda: String(product.tienda || product.store || '').slice(0, 100),
        urlMonetizada: String(product.urlMonetizada || product.url || '').slice(0, 500),
        urlOriginal: String(product.urlOriginal || '').slice(0, 500),
        imagen: String(product.imagen || '').slice(0, 500),
        // Solo campos esenciales
    };
}

// Uso
const compressed = data.results
    .map(compressProductForSnapshot)
    .filter(p => p !== null)
    .slice(0, 10);
```

### Pattern 2: Guardado con Manejo de Quota

```javascript
function saveWithQuotaProtection(key, data, maxItems = 20) {
    try {
        let storage = getStorageData(key); // { [id]: item }
        
        // Agregar nuevo item
        storage[data.id] = {
            ...data,
            savedAt: new Date().toISOString()
        };
        
        // Prune si excede cantidad
        const entries = Object.entries(storage);
        if (entries.length > maxItems) {
            entries.sort((a, b) => 
                new Date(a[1].savedAt) - new Date(b[1].savedAt)
            );
            storage = Object.fromEntries(entries.slice(-maxItems));
        }
        
        // Check size before saving
        const json = JSON.stringify(storage);
        if (json.length > MAX_SNAPSHOT_SIZE_BYTES) {
            // Prune agresivamente
            const aggressive = entries.slice(-Math.floor(maxItems / 2));
            storage = Object.fromEntries(aggressive);
        }
        
        localStorage.setItem(key, JSON.stringify(storage));
        
    } catch (err) {
        if (isQuotaError(err)) {
            console.warn('[Storage] Quota exceeded, pruning...');
            // Prune y reintentar una vez
            pruneOldest(key, 3);
            try {
                localStorage.setItem(key, JSON.stringify(getStorageData(key)));
            } catch (err2) {
                console.error('[Storage] Failed even after pruning');
                // Degradación graceful: continuar sin guardar
            }
        } else {
            console.error('[Storage] Error:', err);
        }
    }
}

function isQuotaError(err) {
    return err && (
        err.name === 'QuotaExceededError' ||
        err.code === 22 ||
        err.code === 1014 ||
        String(err.message || '').toLowerCase().includes('quota')
    );
}
```

### Pattern 3: Prune Automático

```javascript
function pruneOldestSnapshots(snapshots, maxCount = 20) {
    const entries = Object.entries(snapshots);
    if (entries.length <= maxCount) return snapshots;
    
    entries.sort((a, b) => {
        const dateA = new Date(a[1]?.savedAt || 0).getTime();
        const dateB = new Date(b[1]?.savedAt || 0).getTime();
        return dateA - dateB;
    });
    
    return Object.fromEntries(entries.slice(-maxCount));
}
```

### Pattern 4: Lectura Segura

```javascript
function getStorageData(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (err) {
        console.warn(`[Storage] Could not parse ${key}:`, err);
        return {};
    }
}

function getStorageArray(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (err) {
        console.warn(`[Storage] Could not parse ${key}:`, err);
        return [];
    }
}
```

## Debugging

### Verificar Uso de localStorage
```javascript
// Ver tamaño total usado
let totalSize = 0;
for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length * 2; // UTF-16 = 2 bytes por char
    }
}
console.log(`Total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

// Listar todas las keys
Object.keys(localStorage).filter(k => k.startsWith('lumu_'));
```

### Limpiar localStorage
```javascript
// Limpiar solo keys de Lumu
Object.keys(localStorage)
    .filter(k => k.startsWith('lumu_'))
    .forEach(k => localStorage.removeItem(k));

// O todo
localStorage.clear();
```

## Keys Permitidas

| Key | Tipo | Descripción |
|-----|------|-------------|
| `lumu_theme` | string | 'dark' o 'light' |
| `lumu_local_history` | array | Historial de búsquedas |
| `lumu_search_snapshots` | object | Snapshots comprimidos |
| `lumu_cookies` | string | 'accepted' o 'rejected' |
| `lumu_session_id` | string | ID de sesión actual |
| `lumu_onboarding_v3` | string | 'done' si completó onboarding |
| `lumu_tutorial_v2` | string | 'true' si vio tutorial |
| `lumu_*` | any | Otras con prefijo |

## Consideraciones Futuras

- **IndexedDB**: Para storage > 5MB, considerar migrar a IndexedDB
- **Compression**: Implementar LZ-string para compresión adicional
- **Chunking**: Dividir datos grandes en chunks si es necesario
