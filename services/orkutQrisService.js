const axios = require('axios');
const FormData = require('form-data');
const QRCode = require('qrcode');
const { Readable } = require('stream');

function convertCRC16(str) {
    let crc = 0xFFFF;
    const strlen = str.length;
    for (let c = 0; c < strlen; c++) {
        crc ^= str.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    let hex = crc & 0xFFFF;
    hex = ("000" + hex.toString(16).toUpperCase()).slice(-4);
    return hex;
}

function generateOrkutTransactionId(prefix = "QRIS") {
    const timestamp = Date.now().toString().slice(-5);
    const randomString = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}${timestamp}${randomString}`;
}

function generateOrkutExpirationTime(minutes = parseInt(process.env.ORKUT_QRIS_EXPIRY_MINUTES) || 15) {
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + minutes);
    return expirationTime;
}

async function bufferToStream(buffer) {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
}

async function uploadQrToCatbox(buffer) {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        const stream = await bufferToStream(buffer);
        form.append('fileToUpload', stream, {
            filename: `qr_orkut_${Date.now()}.png`,
            contentType: 'image/png'
        });
        const response = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: { ...form.getHeaders() },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 15000
        });
        if (!response.data || typeof response.data !== 'string' || !response.data.startsWith('http')) {
            console.error("Catbox upload failed, response:", response.data);
            throw new Error('Gagal mengunggah QR ke Catbox.');
        }
        return response.data;
    } catch (error) {
        console.error("Error uploading to Catbox:", error.message);
        throw error;
    }
}

async function createDynamicOrkutQris(originalAmount, transactionName = "Pembayaran") {
    try {
        const staticQrisBase = process.env.ORKUT_QRIS_STATIC_CODE;
        const feePercentage = parseFloat(process.env.ORKUT_QRIS_FEE_PERCENTAGE_FOR_DEPOSIT || process.env.ORKUT_QRIS_FEE_PERCENTAGE || 0.7);
        const feeIsByCustomer = process.env.ORKUT_QRIS_FEE_BY_CUSTOMER_DEPOSIT === 'true';

        if (!staticQrisBase) throw new Error('Kode QRIS statis dasar (ORKUT_QRIS_STATIC_CODE) diperlukan.');
        const parsedAmount = parseInt(originalAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Jumlah tidak valid.');
        
        let amountToChargeUser = parsedAmount;
        let calculatedFeeAmount = 0;
        
        if (feeIsByCustomer && feePercentage > 0) {
            calculatedFeeAmount = Math.ceil(parsedAmount * (feePercentage / 100));
            amountToChargeUser = parsedAmount + calculatedFeeAmount; 
        } else if (!feeIsByCustomer && feePercentage > 0) {
            calculatedFeeAmount = Math.ceil(parsedAmount * (feePercentage / 100));
        }


        let baseQrString = staticQrisBase;
        if (baseQrString.length > 12 && baseQrString.substring(6, 12) === "010211") {
             baseQrString = baseQrString.substring(0, 6) + "010212" + baseQrString.substring(12);
        }
        
        const countryCodeTag = "5802ID";
        const indexOfCountryCode = baseQrString.indexOf(countryCodeTag);
        if (indexOfCountryCode === -1) throw new Error("Format kode QRIS dasar tidak valid.");
        
        const part1 = baseQrString.substring(0, indexOfCountryCode);
        const part2 = baseQrString.substring(indexOfCountryCode);
        
        const amountStr = amountToChargeUser.toString();
        const amountLength = ("0" + amountStr.length).slice(-2);
        const transactionAmountField = "54" + amountLength + amountStr;
        
        const qrisStringToGenerateCRC = part1 + transactionAmountField + part2;
        const newCRC = convertCRC16(qrisStringToGenerateCRC);
        const finalQrisString = qrisStringToGenerateCRC + newCRC;
        
        const buffer = await QRCode.toBuffer(finalQrisString, {
            errorCorrectionLevel: 'M', type: 'png', margin: 2, width: 300,
            color: { dark: "#000000", light: "#FFFFFF" }
        });
        
        const imageUrl = await uploadQrToCatbox(buffer);
        
        const orkutReffId = generateOrkutTransactionId("ORD");
        const expirationTime = generateOrkutExpirationTime();

        return {
            success: true,
            orkutReffId: orkutReffId,
            amountToPayWithFee: amountToChargeUser, 
            originalAmount: parsedAmount,
            feeAmount: calculatedFeeAmount, 
            qrImageUrl: imageUrl,
            qrString: finalQrisString,
            expiredAt: expirationTime,
            paymentMethod: 'ORKUT_QRIS',
            message: 'QRIS berhasil dibuat.'
        };
    } catch (error) {
        console.error("Error creating Orkut QRIS:", error.message, error.stack);
        return { success: false, message: error.message || 'Gagal membuat QRIS Orkut.' };
    }
}

async function checkOrkutQrisPaymentStatus(orderReffId, amountExpected, lastCheckedTimestamp) {
    try {
        const merchantId = process.env.OKECONNECT_MERCHANT_ID; 
        const apiKey = process.env.OKECONNECT_API_KEY; 

        if (!merchantId || !apiKey) {
            console.error('OKECONNECT Merchant ID dan API Key diperlukan untuk cek status.');
            return { success: false, isPaid: false, message: 'Konfigurasi OkeConnect tidak lengkap.' };
        }
        
        const lookbackMinutes = 30; 
        const thirtyMinutesAgo = new Date(Date.now() - lookbackMinutes * 60 * 1000);
        const checkFromDate = lastCheckedTimestamp ? new Date(Math.max(lastCheckedTimestamp, thirtyMinutesAgo.getTime())) : thirtyMinutesAgo;
        const dateFromParam = checkFromDate.toISOString().split('T')[0];

        const apiUrl = `https://gateway.okeconnect.com/api/mutasi/qris/${merchantId}/${apiKey}?date_from=${dateFromParam}`;
        
        const response = await axios.get(apiUrl, { timeout: 15000 });

        if (response.data && response.data.status === 'success' && Array.isArray(response.data.data)) {
            const transactions = response.data.data;
            const searchReffIdPart = orderReffId.toUpperCase().slice(-8); // Mencocokkan bagian akhir reffId di note

            const matchedTx = transactions.find(tx => {
                const txAmount = parseInt(tx.amount);
                const noteIncludesReff = tx.note && tx.note.toUpperCase().includes(searchReffIdPart);
                return txAmount === amountExpected && noteIncludesReff;
            });

            if (matchedTx) {
                return { success: true, isPaid: true, transaction: matchedTx, message: 'Pembayaran ditemukan.' };
            } else {
                return { success: true, isPaid: false, raw_data: transactions, message: 'Pembayaran belum ditemukan dalam mutasi terbaru.' };
            }
        } else {
            return { success: false, isPaid: false, message: response.data.message || 'Gagal mengambil data mutasi dari OkeConnect.' };
        }
    } catch (error) {
        console.error('Error checking Orkut QRIS status (OkeConnect):', error.response ? error.response.data : error.message);
        return { success: false, isPaid: false, message: error.message || 'Gagal menghubungi OkeConnect.' };
    }
}


module.exports = {
    createDynamicOrkutQris,
    checkOrkutQrisPaymentStatus
};