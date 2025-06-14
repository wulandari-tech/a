const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const { createDynamicOrkutQris, checkOrkutQrisPaymentStatus } = require('../services/orkutQrisService');
const { v4: uuidv4 } = require('uuid');
const { getActiveInformationItems } = require('./informationBoardController');

exports.getStoreIndexPage = async (req, res) => {
    try {
        const informationItems = await getActiveInformationItems();
        const searchTerm = req.query.search || '';
        const categoryFilter = req.query.category || 'all';
        let query = { isActive: true };

        if (searchTerm) {
            query.name = { $regex: searchTerm, $options: 'i' };
        }
        if (categoryFilter !== 'all') {
            query.category = categoryFilter;
        }

        const products = await Product.find(query).sort({ createdAt: -1 });
        const categories = await Product.distinct('category', { isActive: true });

        res.render('store/index', {
            pageTitle: 'Home',
            products,
            categories,
            currentSearch: searchTerm,
            currentCategory: categoryFilter,
            informationItems,
            activePage: 'produk'
        });
    } catch (error) {
        console.error("Error fetching store index page:", error);
        req.flash('error_messages', 'Gagal memuat halaman toko.');
        res.render('store/index', { pageTitle: 'Home', products: [], categories: [], currentSearch: '', currentCategory: 'all', informationItems: [], activePage: 'produk' });
    }
};

exports.getProductDetailPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product || !product.isActive) {
            req.flash('error_messages', 'Produk tidak ditemukan atau tidak aktif.');
            return res.redirect('/products');
        }
        res.render('store/product_detail', {
            pageTitle: product.name,
            product,
            activePage: 'produk'
        });
    } catch (error) {
        console.error("Error fetching product detail:", error);
        req.flash('error_messages', 'Gagal memuat detail produk.');
        res.redirect('/products');
    }
};

exports.getCheckoutPage = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            req.flash('error_messages', 'Anda harus login untuk checkout.');
            return res.redirect(`/login?returnTo=/checkout/${req.params.productId}${req.query.quantity ? '?quantity=' + req.query.quantity : ''}`);
        }

        const product = await Product.findById(req.params.productId);
        const quantity = parseInt(req.query.quantity) || 1;

        if (!product || !product.isActive) {
            req.flash('error_messages', 'Produk tidak ditemukan atau tidak aktif.');
            return res.redirect('/products');
        }

        let maxStock = product.stock === -1 ? Infinity : product.stock;
        if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
            const availableAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line.length > 0).length;
            maxStock = availableAccounts;
        }

        if (quantity > maxStock && maxStock !== Infinity) {
             req.flash('error_messages', `Stok produk tidak mencukupi untuk jumlah ${quantity}. Maksimal: ${maxStock}`);
             return res.redirect(`/product/${product._id}`);
        }
        if (maxStock === 0 && product.stock !==-1) {
             req.flash('error_messages', 'Stok produk ini habis.');
             return res.redirect(`/product/${product._id}`);
        }


        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.flash('error_messages', 'Data pengguna tidak ditemukan.');
            if(req.session) req.session.destroy(() => {});
            return res.redirect('/login');
        }

        res.render('store/checkout', {
            pageTitle: `Checkout: ${product.name}`,
            product,
            user,
            quantity: quantity,
            activePage: 'produk'
        });
    } catch (error) {
        console.error("Error getting checkout page:", error);
        req.flash('error_messages', 'Gagal memuat halaman checkout.');
        res.redirect('/products');
    }
};

exports.processOrder = async (req, res) => {
    const { productId, payment_method, quantity: quantityStr } = req.body;
    const quantity = parseInt(quantityStr) || 1;

    if (!req.session.user || !req.session.user._id) {
        req.flash('error_messages', 'Sesi Anda tidak valid. Silakan login kembali.');
        return res.redirect('/login');
    }
    const userId = req.session.user._id;

    if (!productId || !payment_method) {
        req.flash('error_messages', 'Produk atau metode pembayaran tidak valid.');
        return res.redirect('back');
    }

    try {
        const product = await Product.findById(productId);
        const user = await User.findById(userId);

        if (!product || !product.isActive) {
            req.flash('error_messages', 'Produk tidak tersedia.');
            return res.redirect('/products');
        }
        if (!user) {
            req.flash('error_messages', 'Pengguna tidak ditemukan.');
            return res.redirect('/login');
        }

        let effectivePrice = product.price;
        if (user.isReseller && product.resellerPrice && product.resellerPrice < product.price) {
            effectivePrice = product.resellerPrice;
        }
        const totalPrice = effectivePrice * quantity;

        let maxStock = product.stock === -1 ? Infinity : product.stock;
        let availableAppAccounts = 0;
        if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
            availableAppAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line.length > 0).length;
            maxStock = availableAppAccounts;
        }

        if (quantity > maxStock && maxStock !== Infinity) {
             req.flash('error_messages', `Stok produk tidak mencukupi untuk jumlah ${quantity}. Maksimal: ${maxStock}`);
             return res.redirect(`/checkout/${productId}?quantity=${quantity}`);
        }
         if (maxStock === 0 && product.stock !== -1) {
             req.flash('error_messages', 'Stok produk ini habis.');
            return res.redirect(`/product/${product._id}`);
        }


        const orderData = {
            user: userId,
            product: productId,
            productNameSnapshot: product.name,
            productType: 'physical_virtual',
            originalPrice: product.price,
            quantity: quantity,
            totalPrice: totalPrice,
            paymentMethodType: payment_method,
            status: 'pending_payment',
            reffId: `ORD-${uuidv4().split('-')[0].toUpperCase()}`,
        };

        if (product.category === 'pterodactyl_panel' && product.pterodactylSpecs) {
            orderData.pterodactylOrderDetails = { panelDomain: process.env.PTERODACTYL_DOMAIN || 'http://localhost:8080' };
        } else if (product.category === 'vps' && product.digitalOceanVpsSpecs) {
            orderData.digitalOceanVpsOrderDetails = { osImage: product.digitalOceanVpsSpecs.osImage };
        } else if (product.category === 'app_premium' && product.appPremiumDetails) {
            orderData.notesForUser = product.appPremiumDetails.deliveryInstructions || "Detail produk akan dikirimkan/diproses setelah pembayaran.";
        }

        const newOrder = new Order(orderData);

        if (payment_method === 'balance') {
            if (user.balance < totalPrice) {
                req.flash('error_messages', 'Saldo tidak mencukupi.');
                return res.redirect(`/checkout/${productId}?quantity=${quantity}`);
            }
            user.balance -= totalPrice;

            if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
                const allAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                const deliveredItems = allAccounts.slice(0, quantity);
                newOrder.appPremiumDelivery = { deliveredItems: deliveredItems, deliveredAt: new Date() };
                const remainingAccounts = allAccounts.slice(quantity);
                product.appPremiumDetails.vccInfo = remainingAccounts.join('\n');
                product.stock = remainingAccounts.length;
                newOrder.status = 'completed';
            } else if (product.stock !== -1) {
                product.stock -= quantity;
            }

            if (newOrder.status !== 'completed') { // Jika belum completed oleh app_premium
                if (product.category === 'pterodactyl_panel') {
                    newOrder.status = 'processing_pterodactyl';
                } else if (product.category === 'vps') {
                    newOrder.status = 'processing_vps';
                } else {
                    newOrder.status = 'completed';
                }
            }
            newOrder.paymentGatewayDetails = { gateway: 'BALANCE', statusMessage: 'Pembayaran berhasil dengan saldo akun.', amountToPay: totalPrice, feeAmount: 0 };

        } else if (payment_method === 'orkut_qris') {
            if (!process.env.ORKUT_QRIS_STATIC_CODE || !process.env.OKECONNECT_MERCHANT_ID || !process.env.OKECONNECT_API_KEY) {
                req.flash('error_messages', 'Metode pembayaran QRIS saat ini tidak tersedia karena konfigurasi tidak lengkap.');
                return res.redirect(`/checkout/${productId}?quantity=${quantity}`);
            }
            const qrisDescription = `Order ${newOrder.reffId} ${product.name.substring(0,20)} (x${quantity})`;
            const qrisData = await createDynamicOrkutQris(totalPrice, qrisDescription);

            if (qrisData && qrisData.success && qrisData.qrImageUrl && typeof qrisData.amountToPayWithFee === 'number') {
                newOrder.paymentGatewayDetails = {
                    gateway: 'ORKUT_QRIS',
                    transactionId: qrisData.orkutReffId,
                    orkutReffId: qrisData.orkutReffId,
                    qrImageUrl: qrisData.qrImageUrl,
                    amountToPay: qrisData.amountToPayWithFee,
                    feeAmount: qrisData.feeAmount || 0,
                    expiredAt: qrisData.expiredAt ? new Date(qrisData.expiredAt) : new Date(Date.now() + (parseInt(process.env.ORKUT_QRIS_EXPIRY_MINUTES || 15) * 60000)),
                    rawResponse: qrisData,
                    statusMessage: 'Menunggu pembayaran QRIS.'
                };
                newOrder.status = 'pending_payment';
            } else {
                req.flash('error_messages', `Gagal membuat pembayaran QRIS: ${qrisData ? qrisData.message : 'Error tidak diketahui dari Orkut Service.'}`);
                return res.redirect(`/checkout/${productId}?quantity=${quantity}`);
            }
        } else {
            req.flash('error_messages', 'Metode pembayaran tidak valid.');
            return res.redirect(`/checkout/${productId}?quantity=${quantity}`);
        }

        await newOrder.save();
        if (payment_method === 'balance') {
            await user.save();
            await product.save();
            req.session.user.balance = user.balance;
            req.session.save(err => {
                if(err) console.error("Session save error after balance payment:", err);
            });
        }

        if (newOrder.status === 'pending_payment') {
            return res.redirect(`/order/${newOrder._id}/payment`);
        } else if (newOrder.status === 'processing_pterodactyl') {
            return res.redirect(`/order/${newOrder._id}/setup-ptero`);
        } else if (newOrder.status === 'processing_vps') {
            return res.redirect(`/order/${newOrder._id}/setup-vps`);
        } else {
            return res.render('store/buy_confirmation', {
                pageTitle: 'Pembelian Berhasil',
                product: product,
                order: newOrder,
                message: newOrder.notesForUser || 'Pembayaran Anda telah berhasil dan pesanan sedang diproses.',
                activePage: 'produk'
            });
        }

    } catch (error) {
        console.error("Error processing order:", error);
        req.flash('error_messages', 'Terjadi kesalahan saat memproses pesanan: ' + error.message);
        res.redirect(`/checkout/${productId || ''}${quantity > 1 ? '?quantity='+quantity : ''}`);
    }
};

exports.getOrderPaymentPage = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            req.flash('error_messages', 'Anda harus login untuk melihat halaman ini.');
            return res.redirect('/login');
        }
        const order = await Order.findById(req.params.orderId)
            .populate('product', 'name category appPremiumDetails')
            .populate('user', 'username');

        if (!order || order.user._id.toString() !== req.session.user._id.toString()) {
            req.flash('error_messages', 'Order tidak ditemukan atau bukan milik Anda.');
            return res.redirect('/user/profile');
        }

        if (order.status !== 'pending_payment') {
            req.flash('info_messages', `Status order ini adalah ${order.status.replace(/_/g, ' ')}.`);
            if(order.productType && (order.productType.startsWith('game_') || order.productType === 'ppob_generic')){
                return res.redirect(`/layanan/order/${order._id}/status`);
            }
            // Jika sudah selesai atau gagal, bisa redirect ke profil atau halaman konfirmasi jika ada
             if (order.status === 'completed' || order.status === 'processing_pterodactyl' || order.status === 'processing_vps' || order.status.includes('failed')) {
                 return res.render('store/buy_confirmation', { // Atau halaman status order yang lebih generik
                    pageTitle: 'Status Pesanan',
                    product: order.product,
                    order: order,
                    message: `Status pesanan Anda: ${order.status.replace(/_/g, ' ')}. ${order.notesForUser || ''}`,
                    activePage: 'profil'
                });
            }
            return res.redirect('/user/profile');
        }
        
        if (!order.paymentGatewayDetails || !order.paymentGatewayDetails.qrImageUrl || typeof order.paymentGatewayDetails.amountToPay !== 'number') {
            req.flash('error_messages', 'Detail pembayaran QRIS tidak lengkap atau tidak valid untuk order ini.');
            return res.redirect('/user/profile');
        }

        res.render('store/order_payment', {
            pageTitle: `Pembayaran Order ${order.reffId}`,
            order,
            activePage: 'profil'
        });
    } catch (error) {
        console.error("Error getting order payment page:", error);
        req.flash('error_messages', 'Gagal memuat halaman pembayaran.');
        res.redirect('/user/profile');
    }
};

exports.checkOrderStatusAndProcess = async (req, res) => {
    const { orderId } = req.params;
    if (!req.session.user || !req.session.user._id) {
        return res.status(401).json({ success: false, message: 'Sesi tidak valid.' });
    }

    try {
        const order = await Order.findById(orderId).populate('product').populate('user');
        if (!order || order.user._id.toString() !== req.session.user._id.toString()) {
            return res.status(404).json({ success: false, message: 'Order tidak ditemukan.' });
        }

        if (order.status !== 'pending_payment') {
            return res.json({
                success: true,
                status: order.status,
                message: `Status order sudah: ${order.status.replace(/_/g, ' ')}.`,
                productCategory: order.product ? order.product.category : null,
                appPremiumDetails: (order.appPremiumDelivery && order.appPremiumDelivery.deliveredItems) ? { vccInfo: order.appPremiumDelivery.deliveredItems.join('\n'), deliveryInstructions: order.product.appPremiumDetails?.deliveryInstructions, fileUrl: order.product.appPremiumDetails?.fileUrl } : null
            });
        }
        
        if (!order.paymentGatewayDetails || !order.paymentGatewayDetails.expiredAt) {
             return res.status(400).json({ success: false, message: 'Detail pembayaran tidak lengkap untuk pengecekan.' });
        }

        if (new Date() > new Date(order.paymentGatewayDetails.expiredAt)) {
             order.status = 'payment_failed';
             order.paymentGatewayDetails.statusMessage = 'Waktu pembayaran telah habis.';
             await order.save();
             return res.json({ success: true, status: order.status, message: 'Waktu pembayaran order telah habis.'});
        }

        if (order.paymentMethodType === 'orkut_qris' && order.paymentGatewayDetails && order.paymentGatewayDetails.orkutReffId) { // Gunakan orkutReffId
             if (!process.env.OKECONNECT_MERCHANT_ID || !process.env.OKECONNECT_API_KEY) {
                return res.status(500).json({ success: false, message: 'Konfigurasi Orkut (OkeConnect) tidak lengkap untuk cek status.' });
            }
            const paymentStatus = await checkOrkutQrisPaymentStatus(order.paymentGatewayDetails.orkutReffId, order.paymentGatewayDetails.amountToPay, order.lastCheckedPaymentAt);
            order.lastCheckedPaymentAt = new Date();

            if (paymentStatus.success && paymentStatus.isPaid) {
                order.paymentGatewayDetails.statusMessage = 'Pembayaran QRIS terkonfirmasi.';
                order.paymentGatewayDetails.rawResponse = order.paymentGatewayDetails.rawResponse ? { ...order.paymentGatewayDetails.rawResponse, okeConnectCheckSelf: paymentStatus } : { okeConnectCheckSelf: paymentStatus };
                order.providerTransactionDetails = paymentStatus.transaction;

                const product = await Product.findById(order.product._id); // Re-fetch product to ensure fresh data
                if (!product) {
                     order.status = 'payment_failed';
                     order.paymentGatewayDetails.statusMessage = 'Produk terkait order tidak ditemukan. Hubungi admin.';
                     await order.save();
                     return res.json({ success: true, status: order.status, message: 'Produk tidak ditemukan. Hubungi admin.' });
                }

                let appPremiumDataForModal = null;
                const quantityToDeduct = order.quantity || 1;

                if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
                    const allAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                    if (allAccounts.length >= quantityToDeduct) {
                        const deliveredItems = allAccounts.slice(0, quantityToDeduct);
                        order.appPremiumDelivery = { deliveredItems: deliveredItems, deliveredAt: new Date() };
                        const remainingAccounts = allAccounts.slice(quantityToDeduct);
                        product.appPremiumDetails.vccInfo = remainingAccounts.join('\n');
                        product.stock = remainingAccounts.length;
                        await product.save();
                        order.status = 'completed';
                        appPremiumDataForModal = { vccInfo: deliveredItems.join('\n'), deliveryInstructions: product.appPremiumDetails.deliveryInstructions, fileUrl: product.appPremiumDetails.fileUrl };
                    } else {
                        order.status = 'payment_failed';
                        order.paymentGatewayDetails.statusMessage = `Stok akun premium tidak mencukupi (${allAccounts.length} tersedia, ${quantityToDeduct} diminta). Hubungi admin untuk refund.`;
                        // Tidak mengurangi stok produk jika gagal
                    }
                } else if (product.stock !== -1) {
                    if (product.stock >= quantityToDeduct) {
                        product.stock -= quantityToDeduct;
                        await product.save();
                    } else {
                        order.status = 'payment_failed';
                        order.paymentGatewayDetails.statusMessage = 'Pembayaran berhasil tetapi stok produk habis. Hubungi admin untuk refund.';
                        await order.save();
                        return res.json({ success: true, status: order.status, message: 'Pembayaran berhasil tapi stok produk habis. Hubungi admin.' });
                    }
                }

                if (order.status !== 'completed' && order.status !== 'payment_failed') { // Jika belum di-set oleh app_premium
                    if (product.category === 'pterodactyl_panel') {
                        order.status = 'processing_pterodactyl';
                    } else if (product.category === 'vps') {
                        order.status = 'processing_vps';
                    } else {
                        order.status = 'completed';
                    }
                }
                await order.save();
                return res.json({
                    success: true,
                    status: order.status,
                    message: 'Pembayaran berhasil dikonfirmasi!',
                    productCategory: product.category,
                    appPremiumDetails: appPremiumDataForModal
                });
            } else {
                await order.save();
                return res.json({ success: true, status: 'pending_payment', message: paymentStatus.message || 'Pembayaran masih pending atau gagal diverifikasi.' });
            }
        } else {
            return res.json({ success: false, status: order.status, message: 'Metode pembayaran tidak memerlukan pengecekan manual saat ini.' });
        }
    } catch (error) {
        console.error(`Error checking/processing order status ${orderId}:`, error);
        res.status(500).json({ success: false, message: 'Kesalahan server saat memeriksa status order.' });
    }
};

exports.getSetupPteroPage = async(req, res) => {
    try {
        if (!req.session.user) return res.redirect('/login');
        const order = await Order.findById(req.params.orderId).populate('product');
        if (!order || order.user.toString() !== req.session.user._id.toString() || !order.product || order.product.category !== 'pterodactyl_panel' || order.status !== 'processing_pterodactyl') {
            req.flash('error_messages', 'Akses tidak valid atau order tidak siap untuk setup Pterodactyl.');
            return res.redirect('/user/profile');
        }
        res.render('store/buy_confirmation_ptero', {
            pageTitle: 'Setup Akun Pterodactyl',
            order,
            product: order.product,
            activePage: 'produk'
        });
    } catch (error) {
        console.error("Error getting Pterodactyl setup page:", error);
        req.flash('error_messages', 'Gagal memuat halaman setup.');
        res.redirect('/user/profile');
    }
};

exports.getSetupVpsPage = async(req, res) => {
     try {
        if (!req.session.user) return res.redirect('/login');
        const order = await Order.findById(req.params.orderId).populate('product');
         if (!order || order.user.toString() !== req.session.user._id.toString() || !order.product || order.product.category !== 'vps' || order.status !== 'processing_vps') {
            req.flash('error_messages', 'Akses tidak valid atau order tidak siap untuk setup VPS.');
            return res.redirect('/user/profile');
        }
        res.render('store/buy_confirmation_vps', {
            pageTitle: 'Setup VPS DigitalOcean',
            order,
            product: order.product,
            activePage: 'produk'
        });
    } catch (error) {
        console.error("Error getting VPS setup page:", error);
        req.flash('error_messages', 'Gagal memuat halaman setup VPS.');
        res.redirect('/user/profile');
    }
};