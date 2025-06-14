const axios = require('axios');

const API_URL = process.env.JAGOANPEDIA_API_URL;
const API_KEY = process.env.JAGOANPEDIA_API_KEY;

async function makeJagoanPediaRequest(payload) {
    if (!API_KEY) {
        console.error('JagoanPedia API Key tidak diset.');
        return { success: false, error: 'Konfigurasi API Provider PPOB tidak lengkap.' };
    }
    try {
        const params = new URLSearchParams();
        params.append('key', API_KEY);
        
        for (const key in payload) {
            params.append(key, payload[key]);
        }

        const response = await axios.post(API_URL, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded' 
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error calling JagoanPedia API (action: ${payload.action}):`, error.response ? error.response.data : error.message);
        const errorMsg = error.response && error.response.data && error.response.data.error
                        ? error.response.data.error
                        : (error.message || 'Gagal menghubungi provider PPOB.');
        return { success: false, error: errorMsg };
    }
}

exports.getPpobServices = async () => {
    return makeJagoanPediaRequest({ action: 'services' });
};

exports.placePpobOrder = async (serviceId, target) => {
    const payload = {
        action: 'order',
        service: serviceId,
        target: target,
    };
    return makeJagoanPediaRequest(payload);
};

exports.checkPpobOrderStatus = async (orderId) => {
    const payload = {
        action: 'status',
        id: orderId,
    };
    return makeJagoanPediaRequest(payload);
};