const Order = require('../models/order');
const Product = require('../models/product');
const User = require('../models/user');
const Deposit = require('../models/deposit');
const { v4: uuidv4 } = require('uuid');
const { createDynamicOrkutQris, checkOrkutQrisPaymentStatus } = require('../services/orkutQrisService');

const { processPterodactylSetup } = require('./pterodactylController');
const { processDigitalOceanVpsSetup } = require('./digitalOceanController');
const { processGameTopUpOrder, checkGameTopUpOrderStatus } = require('./ppobController');


exports.getCheckoutPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId);
        if (!product || !product.isActive) {
            req.flash('error_messages', 'Produk tidak ditemukan atau tidak aktif.');
            return res.redirect('/products');
        }
        let quantity = parseInt(req.query.quantity) || 1;
        if (quantity < 1) quantity = 1;

        let currentStock = product.stock;
        if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
            const vccLines = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
            currentStock = vccLines.length;
        }

        if (product.stock !== -1 && currentStock < quantity) {
            req.flash('error_messages', `Stok produk tidak mencukupi (tersisa ${currentStock}). Silakan kurangi jumlah pembelian.`);
            return res.redirect(`/product/${product._id}`);
        }
        
        res.render('store/checkout', {
            pageTitle: `Checkout: ${product.name}`,
            product,
            user: req.session.user,
            quantity: quantity,
            activePage: 'produk'
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Gagal memuat halaman checkout.');
        res.redirect('/products');
    }
};

exports.processOrder = async (req, res) => {
    const { productId, quantity, payment_method } = req.body;
    const userId = req.session.user._id;
    const telegramBot = req.app.get('telegramBot');
    const ownerChatId = process.env.TELEGRAM_OWNER_ID;
    const snap = req.app.get('midtransSnap');

    try {
        const product = await Product.findById(productId);
        const user = await User.findById(userId);

        if (!product || !product.isActive) {
            req.flash('error_messages', 'Produk tidak valid atau tidak aktif lagi.');
            return res.redirect('/products');
        }
        if (!user) {
            req.flash('error_messages', 'User tidak ditemukan.');
            return res.redirect('/logout');
        }

        const orderQuantity = parseInt(quantity) || 1;
        let currentStock = product.stock;
        let accountsToDeliver = [];

        if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
            const allAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
            currentStock = allAccounts.length;
            if (currentStock < orderQuantity) {
                req.flash('error_messages', `Stok produk premium tidak mencukupi (tersisa ${currentStock}).`);
                return res.redirect(`/product/${product._id}`);
            }
            accountsToDeliver = allAccounts.slice(0, orderQuantity);
        } else if (product.stock !== -1 && product.stock < orderQuantity) {
            req.flash('error_messages', `Stok produk tidak mencukupi (tersisa ${product.stock}).`);
            return res.redirect(`/product/${product._id}`);
        }

        let finalPrice = product.price;
        if (user.isReseller && product.resellerPrice && product.resellerPrice < product.price) {
            finalPrice = product.resellerPrice;
        }
        const totalPrice = finalPrice * orderQuantity;

        const orderData = {
            user: userId,
            product: productId,
            productNameSnapshot: product.name,
            productType: 'physical_virtual',
            quantity: orderQuantity,
            pricePerItem: finalPrice,
            totalPrice: totalPrice,
            paymentMethodType: payment_method,
            status: 'pending_payment',
            reffId: `ORD-${uuidv4().split('-')[0].toUpperCase()}`
        };

        if (payment_method === 'balance') {
            if (user.balance < totalPrice) {
                req.flash('error_messages', 'Saldo Anda tidak mencukupi untuk pembayaran ini.');
                return res.redirect(`/checkout/${productId}?quantity=${orderQuantity}`);
            }
            user.balance -= totalPrice;
            
            if (product.category === 'app_premium') {
                orderData.status = 'completed';
                orderData.appPremiumDelivery = { deliveredItems: accountsToDeliver };
                if (product.stock !== -1) {
                    const remainingAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line).slice(orderQuantity);
                    product.appPremiumDetails.vccInfo = remainingAccounts.join('\n');
                    product.stock = remainingAccounts.length;
                }
            } else if (product.category === 'pterodactyl_panel') {
                orderData.status = 'processing_pterodactyl';
            } else if (product.category === 'vps') {
                orderData.status = 'processing_vps';
            } else {
                orderData.status = 'completed';
                 if (product.stock !== -1) {
                    product.stock -= orderQuantity;
                }
            }
            orderData.paidAt = new Date();
        } else if (payment_method === 'orkut_qris') {
            const orkutAmount = totalPrice;
            const orkutFeePercent = parseFloat(process.env.ORKUT_QRIS_FEE_PERCENTAGE || 0.7);
            const orkutFee = Math.round(orkutAmount * (orkutFeePercent / 100));
            const amountToPayOrkut = orkutAmount + orkutFee;

            const qrisData = await createDynamicOrkutQris(amountToPayOrkut, `Order ${orderData.reffId} - ${product.name}`);
            if (qrisData.success) {
                orderData.paymentGatewayDetails = {
                    gateway: 'ORKUT_QRIS',
                    orkutReffId: qrisData.orkutReffId,
                    qrImageUrl: qrisData.qrImageUrl,
                    amountToPay: amountToPayOrkut,
                    fee: orkutFee,
                    expiredAt: qrisData.expiredAt
                };
            } else {
                req.flash('error_messages', `Gagal membuat QRIS untuk pembayaran: ${qrisData.message}`);
                return res.redirect(`/checkout/${productId}?quantity=${orderQuantity}`);
            }
        } else if (payment_method === 'midtrans_gateway') {
            orderData.paymentGatewayDetails = {
                gateway: 'MIDTRANS',
                amountToPay: totalPrice,
                fee: 0
            };
        } else {
            req.flash('error_messages', 'Metode pembayaran tidak valid.');
            return res.redirect(`/checkout/${productId}?quantity=${orderQuantity}`);
        }
        
        const newOrder = new Order(orderData);
        await newOrder.save();
        await user.save(); 
        if (product.stock !== -1 || product.category === 'app_premium') {
            await product.save();
        }
        
        if (telegramBot && ownerChatId) {
            const notifMessage = `📦 *PESANAN BARU DITERIMA* 📦\n\nID: \`${newOrder.reffId}\`\nProduk: *${product.name}* (x${orderQuantity})\nUser: *${user.username}*\nTotal: Rp ${totalPrice.toLocaleString('id-ID')}\nMetode: ${payment_method}\nStatus: *${newOrder.status.replace(/_/g, ' ')}*`;
            try {
                await telegramBot.sendMessage(ownerChatId, notifMessage, { parse_mode: 'Markdown' });
            } catch (tgError) {
            }
        }

        if (payment_method === 'midtrans_gateway') {
             return res.redirect(`/order/${newOrder._id}/midtrans-payment`);
        } else if (newOrder.status === 'pending_payment') {
            res.redirect(`/order/${newOrder._id}/payment`);
        } else {
            res.redirect(`/order/${newOrder._id}/confirmation`);
        }

    } catch (error) {
        console.error("Error processing order:", error);
        req.flash('error_messages', 'Terjadi kesalahan saat memproses pesanan.');
        res.redirect(`/checkout/${productId}?quantity=${quantity || 1}`);
    }
};

exports.getOrderMidtransPaymentPage = async (req, res) => {
    const { orderId } = req.params;
    if (!req.session.user || !req.session.user._id) {
        req.flash('error_messages', 'Sesi tidak valid.');
        return res.redirect('/login');
    }
    try {
        const order = await Order.findById(orderId).populate('user').populate('product');
        if (!order || order.user._id.toString() !== req.session.user._id.toString() || order.paymentMethodType !== 'midtrans_gateway' || order.status !== 'pending_payment') {
            req.flash('error_messages', 'Order Midtrans tidak valid atau sudah diproses.');
            return res.redirect('/user/profile');
        }
        
        const clientKeyMidtrans = 'Mid-client-IoIOg2RqJNZgKpY6';

        if (!clientKeyMidtrans) {
            req.flash('error_messages', 'Konfigurasi pembayaran Midtrans tidak lengkap di server.');
            return res.redirect(`/order/${order._id}/confirmation`);
        }

        res.render('store/midtrans_order_payment', {
            pageTitle: `Pembayaran Midtrans Order ${order.reffId}`,
            order,
            midtransClientKey: clientKeyMidtrans
        });
    } catch (error) {
        console.error("Error getting Midtrans order payment page:", error);
        req.flash('error_messages', 'Gagal memuat halaman pembayaran Midtrans.');
        res.redirect('/user/profile');
    }
};


exports.getOrderPaymentPage = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId).populate('product');
        if (!order || order.user.toString() !== req.session.user._id.toString()) {
            req.flash('error_messages', 'Order tidak ditemukan atau bukan milik Anda.');
            return res.redirect('/user/profile');
        }
        if (order.status !== 'pending_payment') {
            req.flash('info_messages', `Status order ini sudah ${order.status.replace(/_/g, ' ')}.`);
            return res.redirect(`/order/${order._id}/confirmation`);
        }
        if (!order.paymentGatewayDetails || !order.paymentGatewayDetails.qrImageUrl) {
             req.flash('error_messages', 'Detail pembayaran QRIS tidak tersedia untuk order ini.');
            return res.redirect(`/order/${order._id}/confirmation`);
        }
        if (new Date() > new Date(order.paymentGatewayDetails.expiredAt)) {
            order.status = 'payment_failed';
            order.paymentGatewayDetails.statusMessage = 'Waktu pembayaran QRIS telah habis.';
            await order.save();
            req.flash('error_messages', 'Waktu pembayaran QRIS untuk order ini telah habis.');
            return res.redirect(`/order/${order._id}/confirmation`);
        }

        res.render('store/order_payment', {
            pageTitle: `Pembayaran Order #${order.reffId}`,
            order,
            product: order.product
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Gagal memuat halaman pembayaran order.');
        res.redirect('/user/profile');
    }
};

exports.checkOrderStatusApi = async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await Order.findById(orderId).populate('product').populate('user', 'username');
        if (!order || order.user._id.toString() !== req.session.user._id.toString()) {
            return res.status(404).json({ success: false, message: "Order tidak ditemukan." });
        }

        if (order.status !== 'pending_payment') {
            return res.json({ success: true, status: order.status, message: `Status order sudah ${order.status.replace(/_/g, ' ')}.` });
        }
        
        if (order.paymentGatewayDetails && order.paymentGatewayDetails.expiredAt && new Date() > new Date(order.paymentGatewayDetails.expiredAt)) {
            order.status = 'payment_failed';
            order.paymentGatewayDetails.statusMessage = 'Waktu pembayaran QRIS telah habis (User Check).';
            await order.save();
            return res.json({ success: true, status: order.status, message: 'Waktu pembayaran QRIS telah habis.' });
        }

        let paymentConfirmed = false;
        let apiMessage = "Pembayaran masih pending.";

        if (order.paymentMethodType === 'orkut_qris' && order.paymentGatewayDetails.orkutReffId) {
            const paymentStatus = await checkOrkutQrisPaymentStatus(order.paymentGatewayDetails.orkutReffId, order.paymentGatewayDetails.amountToPay, order.lastCheckedPaymentAt);
            order.lastCheckedPaymentAt = new Date();
            
            if (paymentStatus.success && paymentStatus.isPaid) {
                paymentConfirmed = true;
                apiMessage = "Pembayaran QRIS berhasil dikonfirmasi.";
                order.paymentGatewayDetails.statusMessage = apiMessage;
                order.providerTransactionDetails = paymentStatus.transaction;
                order.paidAt = new Date();
            } else if (!paymentStatus.success) {
                 apiMessage = `Gagal cek status Orkut: ${paymentStatus.message}`;
            }
        } else if (order.paymentMethodType === 'midtrans_gateway') {
        }
        
        let productCategory = order.product ? order.product.category : null;
        let appPremiumDetailsFromProduct = null;

        if (paymentConfirmed) {
            const product = await Product.findById(order.product._id);
            if (!product) {
                 order.status = 'payment_failed';
                 order.paymentGatewayDetails.statusMessage += ' Produk tidak ditemukan setelah pembayaran.';
                 await order.save();
                 return res.json({ success: false, status: order.status, message: 'Produk tidak ditemukan setelah pembayaran. Hubungi admin.' });
            }
            productCategory = product.category;
            appPremiumDetailsFromProduct = product.appPremiumDetails;

            if (order.productType === 'physical_virtual') {
                const quantityToDeduct = order.quantity || 1;
                 let stockAvailable = true;
                 let accountsToDeliverForOrder = [];

                if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
                     const allAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                     if (allAccounts.length < quantityToDeduct) {
                         stockAvailable = false;
                     } else {
                        accountsToDeliverForOrder = allAccounts.slice(0, quantityToDeduct);
                     }
                } else if (product.stock !== -1 && product.stock < quantityToDeduct) {
                    stockAvailable = false;
                }

                if (!stockAvailable) {
                    order.status = 'payment_failed';
                    order.paymentGatewayDetails.statusMessage += ' Stok produk habis setelah pembayaran. Refund diperlukan.';
                    await order.save();
                    return res.json({ success: false, status: order.status, message: "Pembayaran berhasil tapi stok produk habis. Hubungi admin untuk refund." });
                }

                if (product.category === 'pterodactyl_panel') order.status = 'processing_pterodactyl';
                else if (product.category === 'vps') order.status = 'processing_vps';
                else if (product.category === 'app_premium') {
                    order.status = 'completed';
                    order.appPremiumDelivery = { deliveredItems: accountsToDeliverForOrder };
                     if (product.stock !== -1) {
                        const remainingAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line).slice(quantityToDeduct);
                        product.appPremiumDetails.vccInfo = remainingAccounts.join('\n');
                        product.stock = remainingAccounts.length;
                        await product.save();
                    }
                } else {
                     order.status = 'completed';
                     if (product.stock !== -1) {
                        product.stock -= quantityToDeduct;
                        await product.save();
                    }
                }
            } else {
                order.status = 'completed';
            }
        }
        
        await order.save();
        
        const responsePayload = {
            success: true,
            status: order.status,
            message: apiMessage,
            productCategory: productCategory
        };

        if (order.status === 'completed' && productCategory === 'app_premium' && appPremiumDetailsFromProduct) {
            responsePayload.appPremiumDetails = {
                vccInfo: order.appPremiumDelivery && order.appPremiumDelivery.deliveredItems ? order.appPremiumDelivery.deliveredItems.join('\n') : '',
                fileUrl: appPremiumDetailsFromProduct.fileUrl,
                deliveryInstructions: appPremiumDetailsFromProduct.deliveryInstructions
            };
        }
        
        res.json(responsePayload);

    } catch (error) {
        console.error("Error checking order status API:", error);
        res.status(500).json({ success: false, message: "Kesalahan server saat memeriksa status." });
    }
};

exports.getOrderConfirmationPage = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId).populate('product').populate('user');
        if (!order || order.user._id.toString() !== req.session.user._id.toString()) {
            req.flash('error_messages', 'Order tidak ditemukan atau bukan milik Anda.');
            return res.redirect('/user/profile');
        }
        
        let message = `Status pesanan Anda: ${order.status.replace(/_/g, ' ')}.`;
        if (order.status === 'completed') message = 'Pembelian Anda berhasil!';
        if (order.status.includes('processing')) message = 'Pembayaran diterima, pesanan Anda sedang diproses!';
        if (order.status.includes('failed')) message = 'Maaf, terjadi masalah dengan pesanan Anda.';
        if (order.paymentGatewayDetails && order.paymentGatewayDetails.statusMessage && order.status.includes('failed')){
            message += ` ${order.paymentGatewayDetails.statusMessage}`;
        }


        if(order.status === 'processing_pterodactyl'){
            return res.render('store/buy_confirmation_ptero', { pageTitle: 'Setup Akun Panel', order, product: order.product });
        } else if (order.status === 'processing_vps'){
            return res.render('store/buy_confirmation_vps', { pageTitle: 'Setup VPS', order, product: order.product });
        }


        res.render('store/buy_confirmation', {
            pageTitle: 'Konfirmasi Pesanan',
            order,
            product: order.product,
            message
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Gagal memuat halaman konfirmasi order.');
        res.redirect('/user/profile');
    }
};


exports.getOrdersPageAdmin = async (req, res) => {
    try {
        const orders = await Order.find().populate('user', 'username').populate('product', 'name').sort({ createdAt: -1 });
        res.render('admin/orders', { pageTitle: 'Admin - Kelola Pesanan', orders, activePage: 'pesanan' });
    } catch (error) {
        req.flash('adminError', 'Gagal memuat daftar pesanan.');
        res.redirect('/admin/dashboard');
    }
};

exports.getOrderDetailPageAdmin = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('user', 'username email balance')
            .populate('product');
        if (!order) {
            req.flash('adminError', 'Order tidak ditemukan.');
            return res.redirect('/admin/orders');
        }
        res.render('admin/order_detail', {
            pageTitle: `Admin - Detail Order ${order.reffId}`,
            order,
            activePage: 'pesanan'
        });
    } catch (error) {
        req.flash('adminError', 'Gagal memuat detail pesanan.');
        res.redirect('/admin/orders');
    }
};

exports.checkOrkutStatusAdmin = async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await Order.findById(orderId).populate('user', 'username').populate('product', 'name category');
        if (!order) {
            return res.status(404).json({ success: false, message: "Order tidak ditemukan." });
        }
        if (order.paymentMethodType !== 'orkut_qris' || !order.paymentGatewayDetails || !(order.paymentGatewayDetails.orkutReffId)) {
            return res.status(400).json({ success: false, message: "Order ini tidak menggunakan Orkut QRIS atau detail pembayaran tidak lengkap.", order_status_after_check: order.status });
        }
        if (order.status !== 'pending_payment') {
             return res.json({ success: true, message: `Status order sudah ${order.status.replace(/_/g, ' ')}. Tidak perlu dicek lagi.`, order_status_after_check: order.status });
        }
        if (!process.env.OKECONNECT_MERCHANT_ID || !process.env.OKECONNECT_API_KEY) {
             return res.status(500).json({ success: false, message: "Konfigurasi Orkut tidak lengkap di sisi server untuk cek status.", order_status_after_check: order.status });
        }
        const paymentStatus = await checkOrkutQrisPaymentStatus(order.paymentGatewayDetails.orkutReffId, order.paymentGatewayDetails.amountToPay, order.lastCheckedPaymentAt);
        order.lastCheckedPaymentAt = new Date();

        if (paymentStatus.success && paymentStatus.isPaid) {
            order.paymentGatewayDetails.statusMessage = 'Pembayaran QRIS dikonfirmasi (Admin Check).';
            order.paymentGatewayDetails.rawResponse = order.paymentGatewayDetails.rawResponse ? { ...order.paymentGatewayDetails.rawResponse, okeConnectCheck: paymentStatus } : { okeConnectCheck: paymentStatus };
            order.providerTransactionDetails = paymentStatus.transaction;
            order.paidAt = new Date();
            const product = await Product.findById(order.product);
            if (order.productType === 'physical_virtual' && product) {
                const quantityToDeduct = order.quantity || 1;
                let stockAvailable = true;
                if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
                     const allAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                     if (allAccounts.length < quantityToDeduct) stockAvailable = false;
                } else if (product.stock !== -1 && product.stock < quantityToDeduct) {
                    stockAvailable = false;
                }
                if (!stockAvailable) {
                    order.status = 'payment_failed';
                    order.paymentGatewayDetails.statusMessage += ' Stok produk habis setelah pembayaran. Refund diperlukan.';
                    await order.save();
                     return res.json({ success: true, message: "Pembayaran berhasil tapi stok produk habis. Refund diperlukan.", order_status_after_check: order.status });
                }
                if (product.category === 'pterodactyl_panel') order.status = 'processing_pterodactyl';
                else if (product.category === 'vps') order.status = 'processing_vps';
                else if (product.category === 'app_premium') order.status = 'paid_with_gateway';
                else order.status = 'completed';
            } else {
                order.status = 'completed';
            }
            await order.save();
            return res.json({ success: true, message: "Pembayaran berhasil dikonfirmasi oleh admin.", order_status_after_check: order.status, found_match: true, matched_transaction: paymentStatus.transaction });
        } else {
            await order.save();
            return res.json({ success: true, message: paymentStatus.message || "Pembayaran masih pending atau tidak ditemukan.", order_status_after_check: order.status, found_match: false, raw_mutasi_data: paymentStatus.raw_data });
        }
    } catch (error) {
        console.error("Error in admin checkOrkutStatus:", error);
        res.status(500).json({ success: false, message: "Kesalahan server saat memeriksa status Orkut." });
    }
};

exports.updateOrderStatusAdmin = async (req, res) => {
    const { orderId } = req.params;
    const { newStatus, adminNotes } = req.body;
    try {
        const order = await Order.findById(orderId);
        if (!order) {
            req.flash('adminError', 'Order tidak ditemukan.');
            return res.redirect('/admin/orders');
        }
        order.status = newStatus;
        if (adminNotes) {
            order.adminNotes = order.adminNotes ? `${order.adminNotes}\nAdmin (${req.session.user.username}): ${adminNotes}` : `Admin (${req.session.user.username}): ${adminNotes}`;
        }
        await order.save();
        req.flash('adminSuccess', `Status order ${order.reffId} berhasil diubah menjadi ${newStatus}.`);
        res.redirect(`/admin/orders/detail/${orderId}`);
    } catch (error) {
        console.error("Error updating order status by admin:", error);
        req.flash('adminError', 'Gagal mengubah status order.');
        res.redirect(`/admin/orders/detail/${orderId}`);
    }
};