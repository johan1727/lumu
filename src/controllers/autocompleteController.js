const axios = require('axios');

exports.getSuggestions = async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) return res.json([]);
        
        // Utilizar la API pública de Google Autocomplete (formato firefox es el más simple de parsear)
        // hl=es (español), ds=sh (shopping focus if applicable, though standard web works well too)
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=es&q=${encodeURIComponent(query)}`;
        
        const response = await axios.get(url, { 
            timeout: 2500,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 LumuApp/1.0'
            }
        });
        
        // El formato de client=firefox devuelve: ["tu query", ["sugerencia 1", "sugerencia 2", ...]]
        if (Array.isArray(response.data) && response.data.length > 1) {
            const suggestions = response.data[1] || [];
            // Devolver las top 6 sugerencias
            return res.json(suggestions.slice(0, 6));
        }
        
        return res.json([]);
    } catch (err) {
        console.error('[Autocomplete] Error fetching suggestions:', err.message);
        return res.json([]);
    }
};
