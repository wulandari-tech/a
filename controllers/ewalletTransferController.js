const axios = require('axios');
const Order = require('../models/order');
const User = require('../models/user'); 
const { v4: uuidv4 } = require('uuid');
const { createOrkutQrisPayment } = require('../services/orkutService'); 

const FOREST_API_KEY = process.env.FOREST_API_KEY;
const FOREST_BASE_URL = 'https://forestapi.web.id/api/h2h';

exports.getTransferPage = async (req, res) => {
    try {
        res.render('layanan/transfer_ewallet', {
            pageTitle: 'Transfer Dana Bank & E-Wallet',
            methods: [], 
            activePage: 'layanan'
        });
    } catch (error) {
        console.error("Error rendering transfer page:", error);
        req.flash('error', 'Gagal memuat halaman transfer.');
        res.redirect('/layanan');
    }
};

exports.getTransferMethodsApi = async (req, res) => {
    try {
        const response = await axios.get(`${FOREST_BASE_URL}/transfer/methods?api_key=${FOREST_API_KEY}`);
        if (response.data && response.data.status === 'success') {
            const filteredMethods = response.data.data.filter(m => ['bank', 'ewallet'].includes(m.type));
            res.json({ success: true, data: filteredMethods });
        } else {
            res.status(500).json({ success: false, message: response.data.message || 'Gagal mengambil metode dari provider.' });
        }
    } catch (error) {
        console.error('Error fetching transfer methods from ForestAPI:', error.message);
        res.status(500).json({ success: false, message: 'Kesalahan server saat mengambil metode transfer.' });
    }
};

exports.validateAccountApi = async (req, res) => {
    const { bank_code, account_number } = req.body;
    if (!bank_code || !account_number) {
        return res.status(400).json({ success: false, message: 'Parameter tidak lengkap.' });
    }
    try {
        
        const validationUrl = `${FOREST_BASE_URL}/validate-account?api_key=${FOREST_API_KEY}&bank_code=${bank_code}&account_number=${account_number}`;
        const response = await axios.get(validationUrl);

        if (response.data && response.data.status === 'success') {
            res.json({ success: true, data: response.data.data });
        } else {
            res.json({ success: false, message: response.data.message || 'Validasi akun gagal.', data: response.data.data });
        }
    } catch (error) {
        console.error('Error validating account with ForestAPI:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: 'Kesalahan server saat validasi akun.' });
    }
};

exports.processTransfer = async (req, res) => {
    const { method, account_number, nominal, payment_method_store, beneficiary_name } = req.body;
    const userId = req.user._id;

    if (!method || !account_number || !nominal || !payment_method_store) {
        req.flash('error', 'Data transfer tidak lengkap.');
        return res.status(400).json({ success: false, message: 'Data transfer tidak lengkap.' });
    }

    const amount = parseFloat(nominal);
    if (isNaN(amount) || amount < 10000) { // Contoh validasi minimal
        req.flash('error', 'Jumlah transfer tidak valid atau kurang dari minimal.');
        return res.status(400).json({ success: false, message: 'Jumlah transfer tidak valid.' });
    }

    const reffId = `TRF-${uuidv4().split('-')[0].toUpperCase()}`;
    const productName = `Transfer ke ${beneficiary_name || method} (${account_number})`;
    let forestApiFee = 0; // Akan diupdate jika ForestAPI mengembalikan fee

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
        }
        
        // TODO: Dapatkan estimasi fee dari ForestAPI jika ada endpointnya
        // Untuk sekarang, anggap fee 0 atau ambil dari data validasi jika ada
        // forestApiFee = ... ;

        const totalPrice = amount + forestApiFee; // Harga akhir termasuk fee provider

        const orderData = {
            user: userId,
            productNameSnapshot: productName,
            productType: 'transfer_fund',
            originalPrice: amount,
            totalPrice: totalPrice, 
            paymentMethodType: payment_method_store,
            reffId: reffId,
            transferDetails: {
                bankCode: method,
                accountNumber: account_number,
                beneficiaryName: beneficiary_name,
                amount: amount,
                fee: forestApiFee,
            },
            status: 'pending_payment'
        };
        
        if (payment_method_store === 'balance') {
            if (user.balance < totalPrice) {
                return res.status(400).json({ success: false, message: 'Saldo tidak mencukupi.' });
            }
            user.balance -= totalPrice;
            await user.save();
            orderData.status = 'processing_transfer'; 
        }
        
        const newOrder = new Order(orderData);
        await newOrder.save();

        if (payment_method_store === 'orkut_qris') {
            const orkutAmount = totalPrice; // Amount yang akan ditagih ke Orkut
            const orkutPayment = await createOrkutQrisPayment(newOrder._id, orkutAmount, `Pembayaran ${productName}`);
            
            if (orkutPayment.success && orkutPayment.qrImageUrl) {
                newOrder.paymentGatewayDetails = {
                    gateway: 'ORKUT_QRIS',
                    transactionId: orkutPayment.orkutReffId,
                    qrImageUrl: orkutPayment.qrImageUrl,
                    amountToPay: orkutPayment.amountToPayWithFee,
                    fee: orkutPayment.feeAmount,
                    expiredAt: orkutPayment.expiredAt,
                    rawResponse: orkutPayment.rawResponse
                };
                await newOrder.save();
                return res.json({ success: true, redirectUrl: `/layanan/order/${newOrder._id}/payment` });
            } else {
                newOrder.status = 'payment_failed';
                newOrder.transferDetails.statusMessage = 'Gagal membuat QRIS: ' + orkutPayment.message;
                await newOrder.save();
                return res.status(500).json({ success: false, message: 'Gagal membuat pembayaran QRIS: ' + orkutPayment.message });
            }
        } else if (payment_method_store === 'balance') {
            // Langsung proses transfer ke ForestAPI karena sudah bayar saldo
            try {
                const forestResponse = await axios.post(`${FOREST_BASE_URL}/transfer/create`, {
                    api_key: FOREST_API_KEY,
                    reff_id: newOrder.reffId,
                    method: newOrder.transferDetails.bankCode,
                    account_number: newOrder.transferDetails.accountNumber,
                    nominal: newOrder.transferDetails.amount 
                });

                if (forestResponse.data && forestResponse.data.status === 'success') {
                    newOrder.status = 'completed'; // Atau 'processing' jika butuh konfirmasi async
                    newOrder.transferDetails.providerReffId = forestResponse.data.data.id_trx; // Sesuaikan dengan field response ForestAPI
                    newOrder.transferDetails.statusMessage = forestResponse.data.message;
                    newOrder.transferDetails.rawApiResponse = forestResponse.data;
                } else {
                    newOrder.status = 'transfer_failed';
                    newOrder.transferDetails.statusMessage = `ForestAPI: ${forestResponse.data.message || 'Gagal transfer'}`;
                    newOrder.transferDetails.rawApiResponse = forestResponse.data;
                    // Kembalikan saldo jika gagal dan menggunakan saldo
                    user.balance += totalPrice;
                    await user.save();
                }
                await newOrder.save();
                return res.json({ success: true, orderId: newOrder._id, message: newOrder.transferDetails.statusMessage });

            } catch (forestError) {
                console.error('ForestAPI transfer error:', forestError.response ? forestError.response.data : forestError.message);
                newOrder.status = 'transfer_failed';
                newOrder.transferDetails.statusMessage = 'Error saat menghubungi provider transfer.';
                await newOrder.save();
                 // Kembalikan saldo jika gagal dan menggunakan saldo
                user.balance += totalPrice;
                await user.save();
                return res.status(500).json({ success: false, message: 'Gagal memproses transfer ke provider.' });
            }
        }
    } catch (error) {
        console.error('Error processing transfer order:', error);
        res.status(500).json({ success: false, message: 'Kesalahan internal server.' });
    }
};