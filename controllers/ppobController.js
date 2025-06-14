const pusatPanelSmmService = require('../services/pusatPanelSmmService');
const jagoanPediaService = require('../services/jagoanPediaService');
const Order = require('../models/order');
const User = require('../models/user');
const { v4: uuidv4 } = require('uuid');
const { createDynamicOrkutQris, checkOrkutQrisPaymentStatus } = require('../services/orkutQrisService');
const { validationResult } = require('express-validator');

exports.getLayananIndexPage = async (req, res) => {
    try {
        res.render('layanan/index_new', {
            pageTitle: "Pilih Layanan Digital",
            activePage: 'layanan'
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Gagal memuat halaman layanan.');
        res.redirect('/');
    }
};


exports.getPpobJagoanPediaPage = async (req, res) => {
    try {
        const serviceData = await jagoanPediaService.getPpobServices();
        let categories = {};
        let operators = new Set();

        if (serviceData.success && serviceData.data && Array.isArray(serviceData.data)) {
            serviceData.data.forEach(service => {
                if (service.status && service.status.toLowerCase() === 'active') {
                    const categoryName = service.category || 'Lainnya';
                    if (!categories[categoryName]) {
                        categories[categoryName] = [];
                    }
                    categories[categoryName].push({
                        sid: service.id, 
                        operator: service.operator,
                        layanan: service.name,
                        harga: service.price, 
                        status: service.status,
                        tipe: service.category, 
                        catatan: service.note
                    });
                    if (service.operator) {
                        operators.add(service.operator);
                    }
                }
            });
        } else {
            req.flash('error_messages', serviceData.error || 'Gagal mengambil daftar layanan PPOB JagoanPedia.');
        }
        
        res.render('layanan/ppob_page_jagoanpedia', {
            pageTitle: "Layanan Pulsa & PPOB",
            categories: categories,
            operators: Array.from(operators).sort(),
            activePage: 'layanan'
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Terjadi kesalahan saat memuat layanan PPOB.');
        res.redirect('/layanan');
    }
};


exports.getSosmedPage = async (req, res) => {
    try {
        const serviceData = await pusatPanelSmmService.getServices();
        let categories = {};

        if (serviceData.status && serviceData.data) {
            serviceData.data.forEach(service => {
                const categoryName = service.category || 'Lainnya';
                if (!categories[categoryName]) {
                    categories[categoryName] = [];
                }
                categories[categoryName].push({
                    sid: service.id.toString(),
                    kategori: categoryName,
                    layanan: service.name,
                    catatan: service.note,
                    min: service.min,
                    max: service.max,
                    harga_per_1000: service.price 
                });
            });
        } else {
            req.flash('error_messages', (serviceData.data && serviceData.data.msg) || 'Gagal mengambil daftar layanan SMM.');
        }
        
        res.render('layanan/sosmed_page_pusatpanel', {
            pageTitle: `Layanan Sosial Media`,
            categories: categories,
            activePage: 'layanan'
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', `Terjadi kesalahan saat memuat layanan SMM.`);
        res.redirect('/layanan');
    }
};


exports.getLayananCheckoutPage = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_messages', errors.array().map(e => e.msg + ` (Nilai: ${e.value})`));
        return res.redirect('/layanan');
    }
    const { product_code, product_name, product_price, target_id, service_type, quantity_smm, original_price_per_k_smm, note, min_smm, max_smm, operator, zone_id } = req.query;

    let calculatedPrice = parseInt(product_price);
    let displayQuantity = 1;

    if (service_type === 'sosmed' && quantity_smm && original_price_per_k_smm) {
        const qty = parseInt(quantity_smm);
        const pricePerK = parseInt(original_price_per_k_smm);
        if (!isNaN(qty) && qty > 0 && !isNaN(pricePerK) && pricePerK > 0) {
            calculatedPrice = Math.round((pricePerK / 1000) * qty); 
            displayQuantity = qty;
        } else {
            req.flash('error_messages', 'Data harga atau jumlah SMM tidak valid untuk kalkulasi.');
            return res.redirect('back');
        }
    } else if (service_type === 'sosmed' && (!quantity_smm || !original_price_per_k_smm)){
         req.flash('error_messages', 'Data jumlah atau harga asli SMM tidak lengkap.');
         return res.redirect('back');
    }

    const product = {
        code: product_code,
        name: product_name,
        price: calculatedPrice, 
        originalPricePerK: service_type === 'sosmed' ? parseInt(original_price_per_k_smm || product_price) : null,
        targetId: target_id,
        serviceType: service_type, 
        quantity: displayQuantity,
        note: note || '',
        minSMM: min_smm || null,
        maxSMM: max_smm || null,
        operator: operator || null,
        zoneId: zone_id || null
    };

    res.render('layanan/checkout_new', {
        pageTitle: `Checkout: ${product.name}`,
        product,
        user: req.session.user,
        activePage: 'layanan'
    });
};

exports.processLayananOrder = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_messages', errors.array().map(e => e.msg));
        return res.redirect('back');
    }

    const { product_code, product_name, product_price, target_id, payment_method, service_type, quantity_smm, original_price_per_k_smm, zone_id } = req.body;
    const userId = req.session.user._id;
    const telegramBot = req.app.get('telegramBot');
    const ownerChatId = process.env.TELEGRAM_OWNER_ID;

    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_messages', 'User tidak ditemukan.');
            return res.redirect('/logout');
        }

        let orderQuantity = 1;
        let finalPrice = parseInt(product_price); 
        let pricePerItemSend = finalPrice;

        if (service_type === 'sosmed' && quantity_smm && original_price_per_k_smm) {
            orderQuantity = parseInt(quantity_smm);
            const pricePerK = parseInt(original_price_per_k_smm);
             if (isNaN(orderQuantity) || orderQuantity <= 0 || isNaN(pricePerK) || pricePerK <=0) {
                req.flash('error_messages', 'Jumlah atau harga per 1k untuk layanan SMM tidak valid.');
                return res.redirect('back');
            }
            finalPrice = Math.round((pricePerK / 1000) * orderQuantity);
            pricePerItemSend = pricePerK; 
        }


        const orderData = {
            user: userId,
            productNameSnapshot: product_name,
            productCodeSnapshot: product_code,
            productType: service_type, 
            quantity: orderQuantity,
            pricePerItem: pricePerItemSend,
            totalPrice: finalPrice,
            paymentMethodType: payment_method,
            status: 'pending_payment',
            reffId: `${service_type.toUpperCase()}-${uuidv4().split('-')[0].toUpperCase()}`,
            providerOrderDetails: { 
                target: target_id,
                zoneId: zone_id || null,
            }
        };

        if (payment_method === 'balance') {
            if (user.balance < finalPrice) {
                req.flash('error_messages', 'Saldo Anda tidak mencukupi.');
                return res.redirect('back');
            }
            user.balance -= finalPrice;
            orderData.status = 'processing_provider'; 
            orderData.paidAt = new Date();
        } else if (payment_method === 'orkut_qris' || payment_method === 'midtrans_gateway') {
            const feePercentage = payment_method === 'orkut_qris' ? parseFloat(process.env.ORKUT_QRIS_FEE_PERCENTAGE || 0.7) : 0;
            const fee = Math.round(finalPrice * (feePercentage / 100));
            const amountToPayGateway = finalPrice + (payment_method === 'orkut_qris' ? fee : 0);

            orderData.paymentGatewayDetails = {
                gateway: payment_method === 'orkut_qris' ? 'ORKUT_QRIS' : 'MIDTRANS',
                amountToPay: amountToPayGateway,
                fee: fee,
            };

            if (payment_method === 'orkut_qris') {
                const qrisData = await createDynamicOrkutQris(amountToPayGateway, `Order ${orderData.reffId} - ${product_name}`);
                if (qrisData.success) {
                    orderData.paymentGatewayDetails.orkutReffId = qrisData.orkutReffId;
                    orderData.paymentGatewayDetails.qrImageUrl = qrisData.qrImageUrl;
                    orderData.paymentGatewayDetails.expiredAt = qrisData.expiredAt;
                } else {
                    req.flash('error_messages', `Gagal membuat QRIS: ${qrisData.message}`);
                    return res.redirect('back');
                }
            }
        } else {
            req.flash('error_messages', 'Metode pembayaran tidak valid.');
            return res.redirect('back');
        }
        
        const newOrder = new Order(orderData);
        await newOrder.save();
        await user.save();
        
        if (req.session.user) req.session.user.balance = user.balance;
        req.session.save();

        if (telegramBot && ownerChatId) {
            const notifMessage = `📲 *ORDER LAYANAN BARU (${service_type.toUpperCase()})* 📲\n\nID: \`${newOrder.reffId}\`\nLayanan: *${product_name}*\nUser: *${user.username}*\nTarget: \`${target_id}${zone_id ? `(${zone_id})` : ''}\`\nJumlah: ${orderQuantity}\nTotal: Rp ${finalPrice.toLocaleString('id-ID')}\nMetode: ${payment_method}\nStatus: *${newOrder.status.replace(/_/g, ' ')}*`;
            try { await telegramBot.sendMessage(ownerChatId, notifMessage, { parse_mode: 'Markdown' }); } catch (tgError) {}
        }

        if (payment_method === 'midtrans_gateway') {
            return res.redirect(`/layanan/order/${newOrder._id}/midtrans-payment`);
        } else if (newOrder.status === 'pending_payment') {
            res.redirect(`/layanan/order/${newOrder._id}/payment`);
        } else if (newOrder.status === 'processing_provider') {
            res.redirect(`/layanan/order/${newOrder._id}/status?auto_process=true`);
        } else {
            res.redirect(`/layanan/order/${newOrder._id}/status`);
        }

    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Terjadi kesalahan saat memproses pesanan layanan.');
        res.redirect('back');
    }
};


exports.getLayananOrderMidtransPaymentPage = async (req, res) => {
    const { orderId } = req.params;
    if (!req.session.user || !req.session.user._id) {
        req.flash('error_messages', 'Sesi tidak valid.');
        return res.redirect('/login');
    }
    try {
        const order = await Order.findById(orderId).populate('user');
        if (!order || order.user._id.toString() !== req.session.user._id.toString() || order.paymentMethodType !== 'midtrans_gateway' || order.status !== 'pending_payment') {
            req.flash('error_messages', 'Order Midtrans tidak valid atau sudah diproses.');
            return res.redirect('/user/profile');
        }
        
        const clientKeyMidtrans = 'clientmidtrans';

        if (!clientKeyMidtrans) {
            req.flash('error_messages', 'Konfigurasi pembayaran Midtrans tidak lengkap di server.');
            return res.redirect(`/layanan/order/${order._id}/status`);
        }

        res.render('layanan/midtrans_order_payment_new', { 
            pageTitle: `Pembayaran Midtrans Order Layanan ${order.reffId}`,
            order,
            midtransClientKey: clientKeyMidtrans
        });
    } catch (error) {
        console.error("Error getting Midtrans Layanan order payment page:", error);
        req.flash('error_messages', 'Gagal memuat halaman pembayaran Midtrans.');
        res.redirect('/user/profile');
    }
};



exports.getLayananOrderPaymentPage = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order || order.user.toString() !== req.session.user._id.toString()) {
            req.flash('error_messages', 'Order tidak ditemukan.');
            return res.redirect('/user/profile');
        }
        if (order.status !== 'pending_payment') {
            return res.redirect(`/layanan/order/${order._id}/status`);
        }
        if (order.paymentMethodType === 'midtrans_gateway'){
             return res.redirect(`/layanan/order/${order._id}/midtrans-payment`);
        }
        if (!order.paymentGatewayDetails || !order.paymentGatewayDetails.qrImageUrl) {
            req.flash('error_messages', 'Detail pembayaran QRIS tidak tersedia.');
            return res.redirect(`/layanan/order/${order._id}/status`);
        }
         if (new Date() > new Date(order.paymentGatewayDetails.expiredAt)) {
            order.status = 'payment_failed';
            order.paymentGatewayDetails.statusMessage = 'Waktu pembayaran QRIS telah habis.';
            await order.save();
            req.flash('error_messages', 'Waktu pembayaran QRIS untuk order ini telah habis.');
            return res.redirect(`/layanan/order/${order._id}/status`);
        }

        res.render('layanan/order_payment_new', {
            pageTitle: `Pembayaran Order Layanan #${order.reffId}`,
            order,
            service: { 
                title: order.productNameSnapshot, 
                categorySlug: order.productType, 
                slug: order.productCodeSnapshot 
            }
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Gagal memuat halaman pembayaran.');
        res.redirect('/user/profile');
    }
};

exports.checkLayananPaymentAndProcessOrder = async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await Order.findById(orderId).populate('user', 'username');
        if (!order || order.user._id.toString() !== req.session.user._id.toString()) {
            return res.status(404).json({ success: false, message: "Order tidak ditemukan." });
        }

        if (order.status !== 'pending_payment') {
            return res.json({ success: true, status: order.status, message: `Status sudah ${order.status}.`});
        }
        if (order.paymentGatewayDetails && order.paymentGatewayDetails.expiredAt && new Date() > new Date(order.paymentGatewayDetails.expiredAt)) {
            order.status = 'payment_failed';
            await order.save();
            return res.json({ success: true, status: 'payment_failed', message: 'Waktu pembayaran habis.' });
        }

        let paymentConfirmed = false;
        if (order.paymentMethodType === 'orkut_qris' && order.paymentGatewayDetails.orkutReffId) {
            const paymentStatus = await checkOrkutQrisPaymentStatus(order.paymentGatewayDetails.orkutReffId, order.paymentGatewayDetails.amountToPay, order.lastCheckedPaymentAt);
            order.lastCheckedPaymentAt = new Date();
            if (paymentStatus.success && paymentStatus.isPaid) {
                paymentConfirmed = true;
                order.paymentGatewayDetails.statusMessage = "Pembayaran QRIS terkonfirmasi.";
                order.providerTransactionDetails = paymentStatus.transaction;
                order.paidAt = new Date();
            }
        } else if (order.paymentMethodType === 'midtrans_gateway') {
             return res.json({ success: false, status: 'pending_payment', message: 'Menunggu notifikasi dari Midtrans.' });
        }


        if (paymentConfirmed) {
            order.status = 'processing_provider';
            await order.save();
            
            const autoProcess = req.query.auto_process === 'true' || (req.body && req.body.auto_process === true);
            if(autoProcess){
                 await processOrderWithProvider(order, req.app.get('telegramBot'));
            }
            return res.json({ success: true, status: order.status, message: 'Pembayaran berhasil, pesanan akan diproses.', auto_process_triggered: autoProcess });
        } else {
            await order.save();
            return res.json({ success: false, status: 'pending_payment', message: 'Pembayaran masih pending.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Kesalahan server saat cek pembayaran.' });
    }
};

async function processOrderWithProvider(order, telegramBot) {
    if (!order || order.status !== 'processing_provider' || !order.providerOrderDetails) return;

    let providerResponse;
    let success = false;
    let providerMessage = 'Gagal memproses dengan provider.';
    let providerTrxId = null;

    try {
        const target = order.providerOrderDetails.target;
        const zone = order.providerOrderDetails.zoneId;
        const serviceCode = order.productCodeSnapshot;
        const quantity = order.quantity;

        if (order.productType.toLowerCase() === 'sosmed') {
            providerResponse = await pusatPanelSmmService.placeOrder(serviceCode, target, quantity);
        } else if (['prabayar', 'game', 'voucher', 'tokenlistrik', 'streaming'].includes(order.productType.toLowerCase())) {
            providerResponse = await jagoanPediaService.placePpobOrder(serviceCode, target);
        } else {
            order.status = 'failed';
            order.providerResponse = { message: `Tipe produk ${order.productType} tidak didukung untuk pemrosesan otomatis provider.` };
            await order.save();
            return;
        }

        if (providerResponse && (providerResponse.result === true || providerResponse.status === true) && providerResponse.data && (providerResponse.data.trxid || providerResponse.data.id)) {
            order.status = 'completed';
            providerMessage = providerResponse.message || (providerResponse.data && providerResponse.data.msg) || 'Pesanan berhasil diproses oleh provider.';
            providerTrxId = providerResponse.data.trxid || providerResponse.data.id;
            order.providerOrderDetails.providerOrderId = providerTrxId;
            if(providerResponse.data.note) order.providerOrderDetails.providerNote = providerResponse.data.note;
            if(providerResponse.data.status && typeof providerResponse.data.status === 'string' ) order.providerOrderDetails.providerStatus = providerResponse.data.status;
            success = true;
        } else if (providerResponse && (providerResponse.message || (providerResponse.data && providerResponse.data.msg) )) {
            order.status = 'failed';
            providerMessage = providerResponse.message || providerResponse.data.msg;
        } else {
            order.status = 'failed';
        }
        order.providerResponse = providerResponse;
        await order.save();
        
        const ownerChatId = process.env.TELEGRAM_OWNER_ID;
        if (telegramBot && ownerChatId) {
            const user = await User.findById(order.user).select('username').lean();
            const statusEmoji = success ? "✅" : "❌";
            const providerName = order.productType.toLowerCase() === 'sosmed' ? "PusatPanelSMM" : "JagoanPedia";
            const notifMessage = `${statusEmoji} *UPDATE ORDER (${providerName})* ${statusEmoji}\n\nID Internal: \`${order.reffId}\`\nID Provider: \`${providerTrxId || 'N/A'}\`\nLayanan: *${order.productNameSnapshot}*\nUser: *${user ? user.username : 'N/A'}*\nTarget: \`${target}\`\nStatus: *${order.status.toUpperCase()}*\nPesan Provider: ${providerMessage}`;
            try {
                await telegramBot.sendMessage(ownerChatId, notifMessage, { parse_mode: 'Markdown' });
            } catch (tgError) {}
        }


    } catch (error) {
        console.error(`Error processing order ${order._id} with Provider API:`, error);
        order.status = 'failed';
        order.providerResponse = { message: 'Kesalahan internal saat menghubungi provider API.' };
        await order.save();
    }
}


exports.getLayananOrderStatusPage = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId).populate('user', 'username');
        if (!order || order.user._id.toString() !== req.session.user._id.toString()) {
            req.flash('error_messages', 'Order tidak ditemukan.');
            return res.redirect('/user/profile');
        }
        
        if (order.status === 'processing_provider' && (req.query.auto_process === 'true' || order.paymentMethodType === 'balance')) {
            await processOrderWithProvider(order, req.app.get('telegramBot'));
            const updatedOrder = await Order.findById(req.params.orderId);
             res.render('layanan/order_status_new', {
                pageTitle: `Status Order Layanan #${updatedOrder.reffId}`,
                order: updatedOrder,
                service: { 
                    title: updatedOrder.productNameSnapshot, 
                    categorySlugForUrl: updatedOrder.productType, 
                    slugForUrl: updatedOrder.productCodeSnapshot 
                }
            });
            return;
        }


        res.render('layanan/order_status_new', {
            pageTitle: `Status Order Layanan #${order.reffId}`,
            order,
            service: { 
                title: order.productNameSnapshot, 
                categorySlugForUrl: order.productType, 
                slugForUrl: order.productCodeSnapshot
            }
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Gagal memuat status order.');
        res.redirect('/user/profile');
    }
};

exports.checkPascabayarBillApi = async (req, res) => {
    const { service_id, target_no } = req.body;
    if (!service_id || !target_no) {
        return res.status(400).json({ success: false, message: 'Parameter tidak lengkap.' });
    }
    try {
        const billData = {result: false, message: "API Cek Tagihan Pascabayar belum diimplementasikan dengan provider baru."};
        if (billData.result && billData.data) {
            res.json({ success: true, data: billData.data });
        } else {
            res.json({ success: false, message: billData.message || 'Gagal cek tagihan.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Kesalahan server saat cek tagihan.' });
    }
};