const User = require('../models/user');
const Product = require('../models/product');
const Order = require('../models/order');
const Deposit = require('../models/deposit');
const Withdrawal = require('../models/withdrawal');
const InformationBoardItem = require('../models/informationBoard');
const { checkOrkutQrisPaymentStatus } = require('../services/orkutQrisService');
const bcrypt = require('bcryptjs');

exports.getDashboardPage = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalProducts = await Product.countDocuments({ isActive: true });
        const totalOrders = await Order.countDocuments();
        const successfulDeposits = await Deposit.aggregate([
            { $match: { status: 'success' } },
            { $group: { _id: null, totalAmount: { $sum: '$getBalance' } } }
        ]);
        const totalSuccessfulDepositAmount = successfulDeposits.length > 0 ? successfulDeposits[0].totalAmount : 0;
        res.render('admin/dashboard', { pageTitle: 'Admin Dashboard', totalUsers, totalProducts, totalOrders, totalSuccessfulDepositAmount, activePage: 'dashboard' });
    } catch (error) {
        console.error("Error fetching admin dashboard data:", error);
        req.flash('adminError', 'Gagal memuat data dashboard.');
        res.render('admin/dashboard', { pageTitle: 'Admin Dashboard', totalUsers: 0, totalProducts: 0, totalOrders: 0, totalSuccessfulDepositAmount: 0, activePage: 'dashboard' });
    }
};

exports.getProductsPage = async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.render('admin/products', { pageTitle: 'Admin - Kelola Produk', products, activePage: 'produk' });
    } catch (error) {
        console.error("Error fetching products for admin:", error);
        req.flash('adminError', 'Gagal memuat daftar produk.');
        res.redirect('/admin/dashboard');
    }
};

exports.getAddProductPage = (req, res) => {
    res.render('admin/add_product', { pageTitle: 'Admin - Tambah Produk Baru', product: {}, errors: [], oldInput: {}, activePage: 'produk' });
};

exports.postAddProduct = async (req, res) => {
    const { name, description, price, resellerPrice, stock, category } = req.body;
    const pterodactylSpecsData = req.body.pterodactylSpecs;
    const digitalOceanVpsSpecsData = req.body.digitalOceanVpsSpecs;
    const appPremiumDetailsData = req.body.appPremiumDetails;

    let errors = [];
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Nama produk tidak boleh kosong.' });
    if (!description || description.trim() === '') errors.push({ param: 'description', msg: 'Deskripsi produk tidak boleh kosong.' });
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.push({ param: 'price', msg: 'Harga harus angka positif.' });
    if (resellerPrice && (isNaN(parseFloat(resellerPrice)) || parseFloat(resellerPrice) < 0)) errors.push({ param: 'resellerPrice', msg: 'Harga reseller harus angka positif jika diisi.' });
    if (stock === undefined || stock === null || isNaN(parseInt(stock))) errors.push({ param: 'stock', msg: 'Stok harus angka (atau -1 untuk tidak terbatas).' });
    if (!category || category.trim() === '') errors.push({ param: 'category', msg: 'Kategori wajib dipilih.' });

    if (category === 'pterodactyl_panel') {
        if (!pterodactylSpecsData || !pterodactylSpecsData.ram || isNaN(parseInt(pterodactylSpecsData.ram))) errors.push({ param: 'pteroRam', msg: 'RAM Pterodactyl harus angka.' });
        if (!pterodactylSpecsData || !pterodactylSpecsData.disk || isNaN(parseInt(pterodactylSpecsData.disk))) errors.push({ param: 'pteroDisk', msg: 'Disk Pterodactyl harus angka.' });
        if (!pterodactylSpecsData || !pterodactylSpecsData.cpu || isNaN(parseInt(pterodactylSpecsData.cpu))) errors.push({ param: 'pteroCpu', msg: 'CPU Pterodactyl harus angka.' });
    } else if (category === 'vps') {
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.region || digitalOceanVpsSpecsData.region.trim() === '') errors.push({ param: 'doRegion', msg: 'Region VPS tidak boleh kosong.' });
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.size || digitalOceanVpsSpecsData.size.trim() === '') errors.push({ param: 'doSize', msg: 'Ukuran VPS tidak boleh kosong.' });
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.osImage || digitalOceanVpsSpecsData.osImage.trim() === '') errors.push({ param: 'doOsImage', msg: 'Image OS VPS tidak boleh kosong.' });
    } else if (category === 'app_premium') {
        if (!appPremiumDetailsData || !appPremiumDetailsData.deliveryInstructions || appPremiumDetailsData.deliveryInstructions.trim() === '') {
            errors.push({ param: 'appDeliveryInstructions', msg: 'Instruksi pengiriman Aplikasi Premium wajib diisi.' });
        }
    }

    if (errors.length > 0) {
        return res.render('admin/add_product', { pageTitle: 'Admin - Tambah Produk Baru', product: {}, errors: errors, oldInput: req.body, activePage: 'produk' });
    }

    try {
        const newProductData = {
            name: name.trim(),
            description: description.trim(),
            price: parseFloat(price),
            resellerPrice: (resellerPrice && String(resellerPrice).trim() !== '' && !isNaN(parseFloat(resellerPrice))) ? parseFloat(resellerPrice) : undefined,
            stock: parseInt(stock),
            category,
            isActive: req.body.isActive === 'on',
            createdBy: req.user._id
        };

        if (category === 'pterodactyl_panel' && pterodactylSpecsData) {
            newProductData.pterodactylSpecs = { ram: parseInt(pterodactylSpecsData.ram), disk: parseInt(pterodactylSpecsData.disk), cpu: parseInt(pterodactylSpecsData.cpu) };
        } else if (category === 'vps' && digitalOceanVpsSpecsData) {
            newProductData.digitalOceanVpsSpecs = { region: digitalOceanVpsSpecsData.region.trim(), size: digitalOceanVpsSpecsData.size.trim(), osImage: digitalOceanVpsSpecsData.osImage.trim() };
        } else if (category === 'app_premium' && appPremiumDetailsData) {
            newProductData.appPremiumDetails = {
                vccInfo: appPremiumDetailsData.vccInfo ? appPremiumDetailsData.vccInfo.trim() : '',
                fileUrl: appPremiumDetailsData.fileUrl ? appPremiumDetailsData.fileUrl.trim() : '',
                deliveryInstructions: appPremiumDetailsData.deliveryInstructions.trim()
            };
            if (newProductData.appPremiumDetails.vccInfo && newProductData.stock !== -1) {
                const accountLines = newProductData.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
                newProductData.stock = accountLines.length;
            }
        }

        const product = new Product(newProductData);
        await product.save();
        req.flash('adminSuccess', 'Produk baru berhasil ditambahkan!');
        res.redirect('/admin/products');
    } catch (err) {
        console.error('Error saving product:', err);
        if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
            errors.push({ msg: `Nama produk '${name}' sudah ada. Silakan gunakan nama lain.` });
        } else if (err.name === 'ValidationError') {
            for (let field in err.errors) {
                errors.push({ param: field, msg: err.errors[field].message });
            }
        } else {
            errors.push({ msg: 'Terjadi kesalahan pada server saat menyimpan produk: ' + err.message });
        }
        return res.render('admin/add_product', { pageTitle: 'Admin - Tambah Produk Baru', product: {}, errors: errors, oldInput: req.body, activePage: 'produk' });
    }
};

exports.getEditProductPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            req.flash('adminError', 'Produk tidak ditemukan.');
            return res.redirect('/admin/products');
        }
        res.render('admin/edit_product', { pageTitle: `Admin - Edit Produk: ${product.name}`, product, errors: [], oldInput: product.toObject(), activePage: 'produk' });
    } catch (error) {
        console.error("Error fetching product for edit:", error);
        req.flash('adminError', 'Gagal memuat data produk untuk diedit.');
        res.redirect('/admin/products');
    }
};

exports.postEditProduct = async (req, res) => {
    const productId = req.params.id;
    const { name, description, price, resellerPrice, stock, category } = req.body;
    const pterodactylSpecsData = req.body.pterodactylSpecs;
    const digitalOceanVpsSpecsData = req.body.digitalOceanVpsSpecs;
    const appPremiumDetailsData = req.body.appPremiumDetails;

    let errors = [];
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Nama produk tidak boleh kosong.' });
    if (!description || description.trim() === '') errors.push({ param: 'description', msg: 'Deskripsi produk tidak boleh kosong.' });
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.push({ param: 'price', msg: 'Harga harus angka positif.' });
    if (resellerPrice && (isNaN(parseFloat(resellerPrice)) || parseFloat(resellerPrice) < 0)) errors.push({ param: 'resellerPrice', msg: 'Harga reseller harus angka positif jika diisi.' });
    if (stock === undefined || stock === null || isNaN(parseInt(stock))) errors.push({ param: 'stock', msg: 'Stok harus angka (atau -1 untuk tidak terbatas).' });
    if (!category || category.trim() === '') errors.push({ param: 'category', msg: 'Kategori wajib dipilih.' });

    if (category === 'pterodactyl_panel') {
        if (!pterodactylSpecsData || !pterodactylSpecsData.ram || isNaN(parseInt(pterodactylSpecsData.ram))) errors.push({ param: 'pteroRam', msg: 'RAM Pterodactyl harus angka.' });
        if (!pterodactylSpecsData || !pterodactylSpecsData.disk || isNaN(parseInt(pterodactylSpecsData.disk))) errors.push({ param: 'pteroDisk', msg: 'Disk Pterodactyl harus angka.' });
        if (!pterodactylSpecsData || !pterodactylSpecsData.cpu || isNaN(parseInt(pterodactylSpecsData.cpu))) errors.push({ param: 'pteroCpu', msg: 'CPU Pterodactyl harus angka.' });
    } else if (category === 'vps') {
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.region || digitalOceanVpsSpecsData.region.trim() === '') errors.push({ param: 'doRegion', msg: 'Region VPS tidak boleh kosong.' });
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.size || digitalOceanVpsSpecsData.size.trim() === '') errors.push({ param: 'doSize', msg: 'Ukuran VPS tidak boleh kosong.' });
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.osImage || digitalOceanVpsSpecsData.osImage.trim() === '') errors.push({ param: 'doOsImage', msg: 'Image OS VPS tidak boleh kosong.' });
    } else if (category === 'app_premium') {
        if (!appPremiumDetailsData || !appPremiumDetailsData.deliveryInstructions || appPremiumDetailsData.deliveryInstructions.trim() === '') {
            errors.push({ param: 'appDeliveryInstructions', msg: 'Instruksi pengiriman Aplikasi Premium wajib diisi.' });
        }
    }

    if (errors.length > 0) {
        const productToRender = await Product.findById(productId) || {};
        return res.render('admin/edit_product', { pageTitle: `Admin - Edit Produk: ${productToRender.name || 'Error'}`, product: productToRender, errors: errors, oldInput: req.body, activePage: 'produk' });
    }

    try {
        const productToUpdate = await Product.findById(productId);
        if (!productToUpdate) {
            req.flash('adminError', 'Produk tidak ditemukan untuk diedit.');
            return res.redirect('/admin/products');
        }

        productToUpdate.name = name.trim();
        productToUpdate.description = description.trim();
        productToUpdate.price = parseFloat(price);
        productToUpdate.resellerPrice = (resellerPrice && String(resellerPrice).trim() !== '' && !isNaN(parseFloat(resellerPrice))) ? parseFloat(resellerPrice) : undefined;
        productToUpdate.stock = parseInt(stock);
        productToUpdate.category = category;
        productToUpdate.isActive = req.body.isActive === 'on';
        productToUpdate.updatedAt = Date.now();

        productToUpdate.pterodactylSpecs = undefined;
        productToUpdate.digitalOceanVpsSpecs = undefined;
        productToUpdate.appPremiumDetails = undefined;

        if (category === 'pterodactyl_panel' && pterodactylSpecsData) {
            productToUpdate.pterodactylSpecs = { ram: parseInt(pterodactylSpecsData.ram), disk: parseInt(pterodactylSpecsData.disk), cpu: parseInt(pterodactylSpecsData.cpu) };
        } else if (category === 'vps' && digitalOceanVpsSpecsData) {
            productToUpdate.digitalOceanVpsSpecs = { region: digitalOceanVpsSpecsData.region.trim(), size: digitalOceanVpsSpecsData.size.trim(), osImage: digitalOceanVpsSpecsData.osImage.trim() };
        } else if (category === 'app_premium' && appPremiumDetailsData) {
            productToUpdate.appPremiumDetails = {
                vccInfo: appPremiumDetailsData.vccInfo ? appPremiumDetailsData.vccInfo.trim() : '',
                fileUrl: appPremiumDetailsData.fileUrl ? appPremiumDetailsData.fileUrl.trim() : '',
                deliveryInstructions: appPremiumDetailsData.deliveryInstructions.trim()
            };
            if (productToUpdate.appPremiumDetails.vccInfo && productToUpdate.stock !== -1) {
                const accountLines = productToUpdate.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
                productToUpdate.stock = accountLines.length;
            }
        }

        await productToUpdate.save();
        req.flash('adminSuccess', 'Produk berhasil diperbarui!');
        res.redirect('/admin/products');
    } catch (err) {
        console.error(`Error updating product ${productId}:`, err);
        if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
            errors.push({ msg: `Nama produk '${name}' sudah digunakan produk lain.` });
        } else if (err.name === 'ValidationError') {
            for (let field in err.errors) {
                errors.push({ param: field, msg: err.errors[field].message });
            }
        } else {
            errors.push({ msg: 'Terjadi kesalahan pada server saat mengupdate produk: ' + err.message });
        }
        const productToRender = await Product.findById(productId) || {};
        return res.render('admin/edit_product', { pageTitle: `Admin - Edit Produk: ${productToRender.name || 'Error'}`, product: productToRender, errors: errors, oldInput: req.body, activePage: 'produk' });
    }
};

exports.postDeleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        req.flash('adminSuccess', 'Produk berhasil dihapus.');
        res.redirect('/admin/products');
    } catch (error) {
        console.error("Error deleting product:", error);
        req.flash('adminError', 'Gagal menghapus produk.');
        res.redirect('/admin/products');
    }
};

exports.getOrdersPage = async (req, res) => {
    try {
        const orders = await Order.find().populate('user', 'username').populate('product', 'name').sort({ createdAt: -1 });
        res.render('admin/orders', { pageTitle: 'Admin - Kelola Pesanan', orders, activePage: 'pesanan' });
    } catch (error) {
        console.error("Error fetching orders for admin:", error);
        req.flash('adminError', 'Gagal memuat daftar pesanan.');
        res.redirect('/admin/dashboard');
    }
};

exports.checkOrkutStatus = async (req, res) => {
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

exports.getDepositsPage = async (req, res) => {
    try {
        const deposits = await Deposit.find().populate('user', 'username').sort({ createdAt: -1 });
        res.render('admin/deposits', { pageTitle: 'Admin - Kelola Deposit', deposits, activePage: 'deposit' });
    } catch (error) {
        console.error("Error fetching deposits for admin:", error);
        req.flash('adminError', 'Gagal memuat daftar deposit.');
        res.redirect('/admin/dashboard');
    }
};

exports.approveDepositManual = async (req, res) => {
    const { depositId } = req.params;
    const telegramBot = req.app.get('telegramBot');
    const ownerChatId = process.env.TELEGRAM_OWNER_ID;
    try {
        const deposit = await Deposit.findById(depositId).populate('user');
        if (!deposit) {
            req.flash('adminError', 'Deposit tidak ditemukan.');
            return res.redirect('/admin/deposits');
        }
        if (deposit.status === 'success' && deposit.balanceUpdated) {
            req.flash('adminInfo', 'Deposit ini sudah sukses dan saldo sudah diupdate.');
            return res.redirect('/admin/deposits');
        }
        if (deposit.status === 'failed' || deposit.status === 'expired') {
            req.flash('adminError', `Deposit ini sudah ${deposit.status} dan tidak bisa diapprove.`);
            return res.redirect('/admin/deposits');
        }
        const user = deposit.user;
        if (!user) {
            req.flash('adminError', 'Pengguna terkait deposit ini tidak ditemukan.');
            return res.redirect('/admin/deposits');
        }
        if (!deposit.balanceUpdated) {
            user.balance = (user.balance || 0) + deposit.getBalance;
            await user.save();
            deposit.balanceUpdated = true;
            if (req.session.user && req.session.user._id.toString() === user._id.toString()) {
                req.session.user.balance = user.balance;
                req.session.save();
            }
        }
        deposit.status = 'success';
        deposit.adminNotes = `Disetujui manual oleh ${req.session.user.username} pada ${new Date().toLocaleString('id-ID')}.`;
        await deposit.save();

        if (telegramBot && ownerChatId) {
            const notifMessage = `✅ *DEPOSIT DISETUJUI MANUAL* ✅\n\nAdmin: *${req.session.user.username}*\nPengguna: *${user.username}*\nJumlah Terima: *Rp ${deposit.getBalance.toLocaleString('id-ID')}*\nMetode: *${deposit.method}*\nRef ID: \`${deposit.reffId}\`\n\nSaldo pengguna telah diperbarui.`;
            try {
                await telegramBot.sendMessage(ownerChatId, notifMessage, { parse_mode: 'Markdown' });
            } catch (tgError) {
                console.error("Gagal kirim notif approve deposit ke Telegram:", tgError.message);
            }
        }

        req.flash('adminSuccess', `Deposit ${deposit.reffId} berhasil disetujui manual dan saldo pengguna ${user.username} telah diupdate.`);
        res.redirect('/admin/deposits');
    } catch (error) {
        console.error("Error approving deposit manually:", error);
        req.flash('adminError', 'Gagal menyetujui deposit secara manual: ' + error.message);
        res.redirect('/admin/deposits');
    }
};

exports.getUsersPage = async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.render('admin/users', { pageTitle: 'Admin - Kelola Pengguna', users, activePage: 'pengguna' });
    } catch (error) {
        console.error("Error fetching users for admin:", error);
        req.flash('adminError', 'Gagal memuat daftar pengguna.');
        res.redirect('/admin/dashboard');
    }
};

exports.getEditUserPage = async (req, res) => {
    try {
        const userToEdit = await User.findById(req.params.id);
        if (!userToEdit) {
            req.flash('adminError', 'Pengguna tidak ditemukan.');
            return res.redirect('/admin/users');
        }
        res.render('admin/edit_user', { pageTitle: `Admin - Edit Pengguna: ${userToEdit.username}`, userToEdit, activePage: 'pengguna' });
    } catch (error) {
        console.error("Error fetching user for edit:", error);
        req.flash('adminError', 'Gagal memuat data pengguna untuk diedit.');
        res.redirect('/admin/users');
    }
};

exports.postEditUser = async (req, res) => {
    const { username, email, balance, role, isReseller, isSeller, sellerApplicationStatus, new_password, confirm_new_password } = req.body;
    const userId = req.params.id;
    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('adminError', 'Pengguna tidak ditemukan.');
            return res.redirect('/admin/users');
        }
        if (username && username.trim() !== user.username) {
            const existingUsername = await User.findOne({ username: username.trim().toLowerCase(), _id: { $ne: userId } });
            if (existingUsername) {
                req.flash('adminError', 'Username tersebut sudah digunakan.');
                return res.redirect(`/admin/users/edit/${userId}`);
            }
            user.username = username.trim();
        }
        if (email && email.trim().toLowerCase() !== user.email) {
            const existingEmail = await User.findOne({ email: email.trim().toLowerCase(), _id: { $ne: userId } });
            if (existingEmail) {
                req.flash('adminError', 'Email tersebut sudah digunakan.');
                return res.redirect(`/admin/users/edit/${userId}`);
            }
            user.email = email.trim().toLowerCase();
        }
        if (balance !== undefined && !isNaN(parseFloat(balance))) user.balance = parseFloat(balance);
        if (role && ['user', 'admin', 'reseller'].includes(role)) user.role = role;
        
        user.isReseller = !!isReseller; 

        if (sellerApplicationStatus && ['none', 'pending', 'approved', 'rejected'].includes(sellerApplicationStatus)) {
            user.sellerApplicationStatus = sellerApplicationStatus;
            user.isSeller = (sellerApplicationStatus === 'approved');
        } else if (typeof isSeller !== 'undefined') {
             user.isSeller = !!isSeller;
             if(user.isSeller && user.sellerApplicationStatus !== 'approved'){
                 user.sellerApplicationStatus = 'approved';
             } else if (!user.isSeller && user.sellerApplicationStatus === 'approved'){
                 user.sellerApplicationStatus = 'none';
             }
        }


        if (new_password) {
            if (new_password.length < 8) {
                req.flash('adminError', 'Password baru minimal 8 karakter.');
                return res.redirect(`/admin/users/edit/${userId}`);
            }
            if (new_password !== confirm_new_password) {
                req.flash('adminError', 'Konfirmasi password baru tidak cocok.');
                return res.redirect(`/admin/users/edit/${userId}`);
            }
            user.password = await bcrypt.hash(new_password, 10);
        }
        await user.save();
        req.flash('adminSuccess', 'Data pengguna berhasil diperbarui.');
        res.redirect('/admin/users');
    } catch (error) {
        console.error("Error updating user by admin:", error);
        if (error.code === 11000) {
             req.flash('adminError', 'Username atau Email sudah digunakan oleh pengguna lain.');
        } else {
            req.flash('adminError', 'Gagal memperbarui data pengguna: ' + error.message);
        }
        res.redirect(`/admin/users/edit/${userId}`);
    }
};

exports.getInformationBoardPage = async (req, res) => {
    try {
        const items = await InformationBoardItem.find({}).populate('createdBy', 'username').sort({ createdAt: -1 });
        res.render('admin/manage_infoboard', { pageTitle: 'Admin - Kelola Papan Informasi', items, activePage: 'infoboard' });
    } catch (error) {
        console.error("Error getting information board page:", error);
        req.flash('adminError', 'Gagal memuat halaman papan informasi.');
        res.redirect('/admin/dashboard');
    }
};

exports.addInformationItem = async (req, res) => {
    try {
        const { title, content, type } = req.body;
        if (!title || !content) {
            req.flash('adminError', 'Judul dan Konten tidak boleh kosong.');
            return res.redirect('/admin/information-board');
        }
        const newItemData = {
            title, content, type: type || 'info', isActive: true,
            createdBy: req.session.user ? req.session.user._id : null
        };
        const newItem = new InformationBoardItem(newItemData);
        await newItem.save();
        const io = req.app.get('io');
        if (io && newItem.isActive) {
            const populatedItem = await InformationBoardItem.findById(newItem._id).populate('createdBy', 'username').lean();
            const infoForClient = {
                _id: populatedItem._id.toString(), title: populatedItem.title, content: populatedItem.content,
                type: populatedItem.type, createdBy: populatedItem.createdBy ? { username: populatedItem.createdBy.username } : {username: 'Sistem'},
                createdAt: populatedItem.createdAt
            };
            io.emit('newInfoBoardUpdate', infoForClient);
        }
        req.flash('adminSuccess', 'Item informasi baru berhasil ditambahkan.');
        res.redirect('/admin/information-board');
    } catch (error) {
        console.error("Error adding information item:", error);
        req.flash('adminError', 'Gagal menambahkan item informasi: ' + error.message);
        res.redirect('/admin/information-board');
    }
};

exports.deleteInformationItem = async (req, res) => {
    try {
        const itemId = req.params.id;
        const deletedItem = await InformationBoardItem.findByIdAndDelete(itemId);
        if (deletedItem) {
            const io = req.app.get('io');
            if (io) io.emit('infoBoardItemDeleted', { _id: itemId });
        }
        req.flash('adminSuccess', 'Item informasi berhasil dihapus.');
        res.redirect('/admin/information-board');
    } catch (error) {
        console.error("Error deleting information item:", error);
        req.flash('adminError', 'Gagal menghapus item informasi.');
        res.redirect('/admin/information-board');
    }
};

exports.toggleInformationItemStatus = async (req, res) => {
    try {
        const itemId = req.params.id;
        const item = await InformationBoardItem.findById(itemId).populate('createdBy', 'username');
        if (!item) {
            req.flash('adminError', 'Item informasi tidak ditemukan.');
            return res.redirect('/admin/information-board');
        }
        item.isActive = !item.isActive;
        await item.save();
        const io = req.app.get('io');
        if (io) {
            if (!item.isActive) {
                io.emit('infoBoardItemDeleted', { _id: item._id.toString() });
            } else {
                 const infoForClient = {
                    _id: item._id.toString(), title: item.title, content: item.content, type: item.type,
                    createdBy: item.createdBy ? { username: item.createdBy.username } : {username: 'Sistem'},
                    createdAt: item.createdAt
                };
                io.emit('newInfoBoardUpdate', infoForClient);
            }
        }
        req.flash('adminSuccess', `Status item informasi berhasil diubah menjadi ${item.isActive ? 'Aktif' : 'Nonaktif'}.`);
        res.redirect('/admin/information-board');
    } catch (error) {
        console.error("Error toggling information item status:", error);
        req.flash('adminError', 'Gagal mengubah status item informasi.');
        res.redirect('/admin/information-board');
    }
};


exports.getManageWithdrawalsPage = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find().populate('user', 'username').sort({ createdAt: -1 });
        res.render('admin/withdrawals_manage', {
            pageTitle: 'Admin - Kelola Penarikan Dana',
            withdrawals,
            activePage: 'penarikan'
        });
    } catch (error) {
        console.error("Error fetching withdrawals for admin:", error);
        req.flash('adminError', 'Gagal memuat data penarikan.');
        res.redirect('/admin/dashboard');
    }
};

exports.processWithdrawalAction = async (req, res) => {
    const { withdrawalId } = req.params;
    const { action } = req.query; 
    const { adminNotes, transactionId } = req.body;
    const telegramBot = req.app.get('telegramBot');
    const ownerChatId = process.env.TELEGRAM_OWNER_ID;

    try {
        const withdrawal = await Withdrawal.findById(withdrawalId).populate('user', 'username email telegramChatId');
        if (!withdrawal) {
            req.flash('adminError', 'Permintaan penarikan tidak ditemukan.');
            return res.redirect('/admin/withdrawals');
        }

        let newStatus = withdrawal.status;
        let successMessage = '';
        let userNotifMessage = '';
        let adminNotifSuffix = '';

        if (action === 'approve' && withdrawal.status === 'pending') {
            newStatus = 'approved';
            successMessage = `Penarikan untuk ${withdrawal.user.username} telah disetujui.`;
            userNotifMessage = `💸 Permintaan penarikan Anda sebesar Rp ${withdrawal.amount.toLocaleString('id-ID')} telah DISETUJUI dan akan segera diproses oleh tim kami.`;
            adminNotifSuffix = `Status diubah menjadi: *DISETUJUI*.`;
        } else if (action === 'reject' && withdrawal.status === 'pending') {
            newStatus = 'rejected';
            const userToRefund = await User.findById(withdrawal.user._id);
            if (userToRefund) {
                userToRefund.balance += withdrawal.amount;
                await userToRefund.save();
                successMessage = `Penarikan untuk ${withdrawal.user.username} telah DITOLAK. Saldo dikembalikan ke pengguna.`;
                userNotifMessage = `⚠️ Permintaan penarikan Anda sebesar Rp ${withdrawal.amount.toLocaleString('id-ID')} DITOLAK. ${adminNotes ? 'Alasan: ' + adminNotes : ''}. Saldo telah dikembalikan.`;
                adminNotifSuffix = `Status diubah menjadi: *DITOLAK*. Saldo dikembalikan.`;
            } else {
                successMessage = `Penarikan untuk ${withdrawal.user.username} DITOLAK, tetapi gagal mengembalikan saldo (user tidak ditemukan).`;
                userNotifMessage = `⚠️ Permintaan penarikan Anda sebesar Rp ${withdrawal.amount.toLocaleString('id-ID')} DITOLAK. ${adminNotes ? 'Alasan: ' + adminNotes : ''}. Hubungi admin untuk pengembalian saldo.`;
                adminNotifSuffix = `Status diubah menjadi: *DITOLAK*. GAGAL mengembalikan saldo (user tidak ditemukan).`;
            }
        } else if (action === 'complete' && withdrawal.status === 'approved') {
            newStatus = 'completed';
            successMessage = `Penarikan untuk ${withdrawal.user.username} telah ditandai SELESAI.`;
            userNotifMessage = `✅ Penarikan Anda sebesar Rp ${withdrawal.amount.toLocaleString('id-ID')} telah BERHASIL diproses dan dana telah dikirim. ${transactionId ? 'ID Transaksi: ' + transactionId : ''}`;
            adminNotifSuffix = `Status diubah menjadi: *SELESAI*. ${transactionId ? 'ID Transaksi Bank: `' + transactionId + '`' : ''}`;
        } else {
            req.flash('adminError', 'Aksi tidak valid atau status tidak memungkinkan.');
            return res.redirect('/admin/withdrawals');
        }

        withdrawal.status = newStatus;
        if (adminNotes) withdrawal.adminNotes = adminNotes;
        if (transactionId && newStatus === 'completed') withdrawal.transactionId = transactionId;
        await withdrawal.save();
        
        if (telegramBot && ownerChatId) {
            let adminNotifText = `ℹ️ *UPDATE STATUS PENARIKAN* ℹ️\n\n`;
            adminNotifText += `ID Penarikan: \`${withdrawal._id}\`\n`;
            adminNotifText += `Pengguna: *${withdrawal.user.username}*\n`;
            adminNotifText += `Jumlah: Rp ${withdrawal.amount.toLocaleString('id-ID')}\n`;
            adminNotifText += `Rekening: ${withdrawal.method} - ${withdrawal.accountNumber} (A/N: ${withdrawal.accountHolderName})\n`;
            adminNotifText += `${adminNotifSuffix}\n`;
            if (adminNotes) adminNotifText += `Catatan Admin: ${adminNotes}\n`;
            adminNotifText += `\nDiproses oleh: *${req.session.user.username}*`;
            try {
                await telegramBot.sendMessage(ownerChatId, adminNotifText, { parse_mode: 'Markdown' });
            } catch (tgError) {
                console.error(`Gagal kirim notif update withdrawal ke Admin Telegram:`, tgError.message);
            }
        }
        
        if (telegramBot && withdrawal.user.telegramChatId && userNotifMessage) {
            try {
                await telegramBot.sendMessage(withdrawal.user.telegramChatId, userNotifMessage, { parse_mode: 'HTML'});
            } catch (tgError) {
                console.error(`Gagal kirim notif status withdrawal ke user ${withdrawal.user.username} via Telegram:`, tgError.message);
            }
        }

        req.flash('adminSuccess', successMessage);
        res.redirect('/admin/withdrawals');

    } catch (error) {
        console.error(`Error processing withdrawal action ${action} for ${withdrawalId}:`, error);
        req.flash('adminError', `Gagal memproses aksi penarikan: ${error.message}`);
        res.redirect('/admin/withdrawals');
    }
};