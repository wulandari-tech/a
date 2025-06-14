const axios = require('axios');
const crypto = require('crypto');

const ORKUT_BASE_URL = process.env.ORKUT_BASE_URL || 'https://api.orkutpayment.com/api/v2';
const ORKUT_MERCHANT_ID = process.env.ORKUT_MERCHANT_ID;
const ORKUT_API_KEY = process.env.ORKUT_API_KEY;
const ORKUT_CALLBACK_URL = process.env.ORKUT_CALLBACK_URL || `${process.env.BASE_URL}/orkut/payment-callback`; // Sesuaikan BASE_URL
const ORKUT_QRIS_FEE_PERCENTAGE = parseFloat(process.env.ORKUT_QRIS_FEE_PERCENTAGE || 0.7);

function generateOrkutSignature(merchantReffId, amount) {
    const dataToSign = `${ORKUT_MERCHANT_ID}:${merchantReffId}:${amount}:${ORKUT_API_KEY}`;
    return crypto.createHash('md5').update(dataToSign).digest('hex');
}

exports.createOrkutQrisPayment = async (internalReffId, amount, productName) => {
    if (!ORKUT_MERCHANT_ID || !ORKUT_API_KEY) {
        console.error("Orkut credentials not configured.");
        return { success: false, message: "Konfigurasi Orkut tidak lengkap." };
    }

    const feeAmount = Math.ceil(amount * (ORKUT_QRIS_FEE_PERCENTAGE / 100));
    const amountToPayWithFee = amount + feeAmount;
    const merchantReffId = `QRIS-${internalReffId}-${Date.now()}`; 
    const signature = generateOrkutSignature(merchantReffId, amountToPayWithFee);

    const payload = {
        merchant_id: ORKUT_MERCHANT_ID,
        merchant_reff_id: merchantReffId,
        payment_method: 'QRISC',
        customer_name: 'Pelanggan ' + (process.env.STORE_NAME || 'Store'),
        customer_email: 'customer@example.com', 
        customer_phone: '081234567890', 
        amount: amountToPayWithFee,
        signature: signature,
        item_details: [{ name: productName, price: amount, quantity: 1 }],
        callback_url: ORKUT_CALLBACK_URL,
        return_url: `${process.env.BASE_URL}/user/profile`, 
        expired_time: 60 
    };

    try {
        const response = await axios.post(`${ORKUT_BASE_URL}/generate-qris`, payload);
        if (response.data && response.data.success && response.data.data && response.data.data.qr_string) {
            const expiryDate = new Date(Date.now() + (response.data.data.expired_in || 3600) * 1000);
            return {
                success: true,
                orkutReffId: merchantReffId, 
                qrImageUrl: response.data.data.qr_url || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(response.data.data.qr_string)}`,
                qrString: response.data.data.qr_string,
                amountToPayWithFee: amountToPayWithFee,
                feeAmount: feeAmount,
                expiredAt: expiryDate,
                rawResponse: response.data
            };
        } else {
            console.error("Orkut QRIS creation failed:", response.data);
            return { success: false, message: response.data.message || "Gagal membuat QRIS dari Orkut." };
        }
    } catch (error) {
        console.error("Error creating Orkut QRIS payment:", error.response ? error.response.data : error.message);
        return { success: false, message: "Kesalahan saat menghubungi Orkut Payment." };
    }
};

exports.checkOrkutPaymentStatusByReffId = async (merchantReffId, expectedAmount) => {
    if (!ORKUT_MERCHANT_ID || !ORKUT_API_KEY) {
        console.error("Orkut credentials not configured for status check.");
        return { success: false, message: "Konfigurasi Orkut tidak lengkap." };
    }
    
    const signature = crypto.createHash('md5').update(ORKUT_MERCHANT_ID + ORKUT_API_KEY + merchantReffId).digest('hex');
    
    try {
        const response = await axios.post(`${ORKUT_BASE_URL}/check-transaction`, {
            merchant_id: ORKUT_MERCHANT_ID,
            merchant_reff_id: merchantReffId,
            signature: signature
        });

        if (response.data && response.data.success && response.data.data) {
            const orkutData = response.data.data;
            let paymentStatus = 'UNPAID'; 
            let messageFromOrkut = orkutData.message || response.data.message || "Status tidak jelas.";

            if (orkutData.status && orkutData.status.toUpperCase() === 'PAID') {
                if (orkutData.amount && parseFloat(orkutData.amount) >= expectedAmount) {
                    paymentStatus = 'PAID';
                    messageFromOrkut = `Pembayaran sebesar Rp ${parseFloat(orkutData.amount).toLocaleString()} diterima.`;
                } else {
                    paymentStatus = 'PARTIAL';
                    messageFromOrkut = `Pembayaran diterima Rp ${parseFloat(orkutData.amount).toLocaleString()}, kurang dari Rp ${expectedAmount.toLocaleString()}.`;
                }
            } else if (orkutData.status && orkutData.status.toUpperCase() === 'EXPIRED') {
                paymentStatus = 'EXPIRED';
                messageFromOrkut = 'Transaksi sudah kadaluarsa.';
            } else if (orkutData.status && orkutData.status.toUpperCase() === 'FAILED') {
                 paymentStatus = 'FAILED';
                 messageFromOrkut = 'Transaksi gagal.';
            }


            return {
                success: true,
                status: paymentStatus, 
                messageFromOrkut: messageFromOrkut,
                raw_mutasi_data: orkutData, 
                found_match: paymentStatus === 'PAID', 
                matched_transaction: paymentStatus === 'PAID' ? orkutData : null
            };
        } else {
            console.warn("Orkut check status failed or unclear response:", response.data);
            return { success: false, message: response.data.message || "Gagal memeriksa status transaksi Orkut." };
        }
    } catch (error) {
        console.error("Error checking Orkut payment status:", error.response ? error.response.data : error.message);
        return { success: false, message: "Kesalahan saat menghubungi Orkut untuk cek status." };
    }
};


exports.handleOrkutCallback = (reqBody) => {
    const { merchant_id, merchant_reff_id, orkut_reff_id, amount, status, signature } = reqBody;
    
    if (!merchant_id || !merchant_reff_id || !orkut_reff_id || !amount || !status || !signature) {
        console.warn("Orkut Callback: Data tidak lengkap diterima.", reqBody);
        return { success: false, message: "Data callback tidak lengkap." };
    }

    if (merchant_id !== ORKUT_MERCHANT_ID) {
        console.warn("Orkut Callback: Merchant ID tidak cocok.");
        return { success: false, message: "Merchant ID tidak valid." };
    }
    
    const expectedSignature = crypto.createHash('md5').update(ORKUT_MERCHANT_ID + ORKUT_API_KEY + merchant_reff_id).digest('hex');
    
    if (signature !== expectedSignature) {
        console.warn("Orkut Callback: Signature tidak valid.");
        return { success: false, message: "Signature callback tidak valid." };
    }

    return {
        success: true,
        merchantReffId: merchant_reff_id,
        orkutReffId: orkut_reff_id,
        amount: parseFloat(amount),
        status: status.toUpperCase(), 
        rawData: reqBody
    };
};