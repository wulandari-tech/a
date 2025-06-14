const axios = require('axios');

const API_URL = process.env.PUSATPANELSMM_API_URL;
const API_KEY = process.env.PUSATPANELSMM_API_KEY;
const SECRET_KEY = process.env.PUSATPANELSMM_SECRET_KEY;

async function makePusatPanelRequest(payload) {
    if (!API_KEY || !SECRET_KEY) {
        console.error('PusatPanelSMM API Key atau Secret Key tidak diset.');
        return { status: false, data: { msg: 'Konfigurasi API Provider SMM tidak lengkap.' } };
    }
    try {
        const params = new URLSearchParams();
        params.append('api_key', API_KEY);
        params.append('secret_key', SECRET_KEY);
        
        for (const key in payload) {
            params.append(key, payload[key]);
        }

        const response = await axios.post(API_URL, params);
        return response.data;
    } catch (error) {
        console.error(`Error calling PusatPanelSMM API (action: ${payload.action}):`, error.response ? error.response.data : error.message);
        const msg = error.response && error.response.data && error.response.data.data && error.response.data.data.msg
                        ? error.response.data.data.msg
                        : (error.message || 'Gagal menghubungi provider SMM.');
        return { status: false, data: { msg: msg } };
    }
}

exports.checkProfile = async () => {
    return makePusatPanelRequest({ action: 'profile' });
};

exports.getServices = async () => {
    return makePusatPanelRequest({ action: 'services' });
};

exports.placeOrder = async (serviceId, targetData, quantity) => {
    const payload = {
        action: 'order',
        service: serviceId,
        data: targetData,
        quantity: quantity,
    };
    return makePusatPanelRequest(payload);
};

exports.checkOrderStatus = async (orderId) => {
    const payload = {
        action: 'status',
        id: orderId,
    };
    return makePusatPanelRequest(payload);
};