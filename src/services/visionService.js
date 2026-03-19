const fetchWithTimeout = require('../utils/fetchWithTimeout');

exports.identifyProduct = async (imageBase64) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY no está configurado en .env");
    }

    // Gemini 2.5 Flash soporta imágenes — use header instead of query param to avoid key in logs
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

    const payload = {
        contents: [{
            parts: [
                { text: "Identifica el producto comercial principal en esta imagen y prioriza el artículo que una persona realmente compraría, no accesorios secundarios ni el fondo. Devuelve un objeto JSON con: 'productName' (nombre comercial claro y específico), 'brand' (marca si es visible o altamente probable), y 'searchQuery' (una búsqueda de compra en español, muy precisa, orientada a Google Shopping). La searchQuery debe incluir marca, modelo, variante, capacidad, tamaño, color o edición solo si se ven claramente. Si no estás seguro de un atributo, no lo inventes. Evita términos genéricos como oferta, barato o mejor precio. Si la imagen parece mostrar un accesorio para otro producto, describe exactamente el accesorio. Si muestra el producto principal, evita confundirlo con funda, case, protector, cable u otros accesorios." },
                {
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: imageBase64 // Base64 string without data:image/jpeg;base64, prefix
                    }
                }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    productName: { type: "STRING" },
                    brand: { type: "STRING" },
                    searchQuery: { type: "STRING" }
                },
                required: ["productName", "searchQuery"]
            }
        }
    };

    try {
        const response = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(payload)
        }, 25000);

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Fallo en Gemini Vision: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        const textResult = data.candidates[0].content.parts[0].text;
        return JSON.parse(textResult);

    } catch (error) {
        console.error('Error en visionService:', error);
        throw error;
    }
};
