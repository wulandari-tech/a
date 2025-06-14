const User = require('../models/user');
const Order = require('../models/order');
const Deposit = require('../models/deposit');
const Withdrawal = require('../models/withdrawal');
const bcrypt = require('bcryptjs');
const { createDynamicOrkutQris, checkOrkutQrisPaymentStatus } = require('../services/orkutQrisService');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator');

const FOREST_API_KEY = process.env.FOREST_API_KEY;
const FOREST_BASE_URL = 'https://forestapi.web.id/api/h2h';
const DEPOSIT_EXPIRY_HOURS = parseInt(process.env.DEPOSIT_EXPIRY_HOURS || '1');

async function sendVerificationEmail(user, req) {
    const token = crypto.randomBytes(20).toString('hex');
    user.verificationToken = token;
    user.verificationTokenExpires = Date.now() + 3600000;
    await user.save();

    const verificationUrl = `${req.protocol}://${req.get('host')}/verify-email/${token}`;

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || 587),
        secure: (process.env.SMTP_PORT === '465'),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: `"${process.env.STORE_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
        to: user.email,
        subject: `Verifikasi Email Akun ${process.env.STORE_NAME}`,
        html: `<p>Halo ${user.username},</p>
               <p>Terima kasih telah mendaftar di ${process.env.STORE_NAME}. Silakan klik link berikut untuk memverifikasi alamat email Anda:</p>
               <p><a href="${verificationUrl}">${verificationUrl}</a></p>
               <p>Jika Anda tidak mendaftar, abaikan email ini.</p>
               <p>Link ini akan kadaluarsa dalam 1 jam.</p>
               <p>Salam,<br>Tim ${process.env.STORE_NAME}</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error mengirim email verifikasi:', error);
        throw new Error('Gagal mengirim email verifikasi.');
    }
}

exports.resendVerificationEmail = async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.flash('error_messages', 'User tidak ditemukan.');
            return res.redirect('/login');
        }
        if (user.isVerified) {
            req.flash('info_messages', 'Email Anda sudah terverifikasi.');
            return res.redirect('/user/profile');
        }
        await sendVerificationEmail(user, req);
        req.flash('success_messages', 'Email verifikasi baru telah dikirim. Silakan cek inbox atau spam Anda.');
        res.redirect('/user/profile');
    } catch (error) {
        console.error('Error resending verification email:', error);
        req.flash('error_messages', 'Gagal mengirim ulang email verifikasi.');
        res.redirect('/user/profile');
    }
};


exports.getUserProfilePage = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            req.flash('error_messages', 'Sesi tidak valid atau pengguna tidak ditemukan.');
            return res.redirect('/login');
        }
        const userId = req.session.user._id;
        const userProfile = await User.findById(userId);
        if (!userProfile) {
            req.flash('error_messages', 'Profil pengguna tidak ditemukan.');
            if (req.session) req.session.destroy(() => {});
            return res.redirect('/login');
        }
        const orders = await Order.find({ user: userId }).sort({ createdAt: -1 }).limit(20).populate('product', 'name');
        const deposits = await Deposit.find({ user: userId }).sort({ createdAt: -1 }).limit(10);
        const withdrawals = await Withdrawal.find({ user: userId }).sort({ createdAt: -1 }).limit(10);
        res.render('user/profile', {
            pageTitle: 'Profil Saya', user: userProfile, orders, deposits, withdrawals, activePage: 'profil'
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        req.flash('error_messages', 'Gagal memuat halaman profil.');
        res.redirect('/');
    }
};

exports.getEditProfilePage = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            req.flash('error_messages', 'Anda harus login untuk mengakses halaman ini.');
            return res.redirect('/login');
        }
        const userToEdit = await User.findById(req.session.user._id);
        if (!userToEdit) {
            req.flash('error_messages', 'Pengguna tidak ditemukan.');
            return res.redirect('/user/profile');
        }
        res.render('user/edit_profile', { pageTitle: 'Edit Profil', userToEdit, activePage: 'profil' });
    } catch (error) {
        console.error('Error rendering edit profile page:', error);
        req.flash('error_messages', 'Gagal memuat halaman edit profil.');
        res.redirect('/user/profile');
    }
};

exports.postEditProfile = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_messages', errors.array().map(err => err.msg));
        return res.redirect('/user/profile/edit');
    }

    const { username, email, current_password, new_password, confirm_new_password } = req.body;
    if (!req.session.user || !req.session.user._id) {
        req.flash('error_messages', 'Sesi tidak valid.');
        return res.redirect('/login');
    }
    const userId = req.session.user._id;
    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_messages', 'Pengguna tidak ditemukan.');
            return res.redirect('/login');
        }
        let emailChanged = false;
        if (username && username !== user.username) {
            const existingUsername = await User.findOne({ username: username.toLowerCase(), _id: { $ne: userId } });
            if (existingUsername) {
                req.flash('error_messages', 'Username tersebut sudah digunakan.');
                return res.redirect('/user/profile/edit');
            }
            user.username = username;
        }
        if (email && email.toLowerCase() !== user.email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
            if (existingEmail) {
                req.flash('error_messages', 'Email tersebut sudah digunakan.');
                return res.redirect('/user/profile/edit');
            }
            user.email = email.toLowerCase();
            user.isVerified = false;
            emailChanged = true;
        }
        if (current_password && new_password) {
            const isMatch = await user.comparePassword(current_password);
            if (!isMatch) {
                req.flash('error_messages', 'Password saat ini salah.');
                return res.redirect('/user/profile/edit');
            }
            user.password = new_password;
        }
        await user.save();
        if (emailChanged) {
            await sendVerificationEmail(user, req);
            req.flash('info_messages', 'Email berhasil diubah. Silakan cek email baru Anda untuk verifikasi.');
        }
        req.session.user = { 
            _id: user._id, 
            username: user.username, 
            email: user.email, 
            role: user.role, 
            balance: user.balance, 
            isVerified: user.isVerified, 
            isReseller: user.isReseller, 
            isSeller: user.isSeller,
            sellerApplicationStatus: user.sellerApplicationStatus
        };
        req.session.save((err) => {
            if (err) {
                console.error("Error saving session after profile update:", err);
                req.flash('error_messages', 'Gagal menyimpan sesi, silakan login ulang.');
                return res.redirect('/login');
            }
            req.flash('success_messages', 'Profil berhasil diperbarui.');
            res.redirect('/user/profile');
        });
    } catch (error) {
        console.error("Error updating profile:", error);
        if (error.code === 11000) req.flash('error_messages', 'Username atau Email sudah digunakan.');
        else req.flash('error_messages', 'Gagal memperbarui profil.');
        res.redirect('/user/profile/edit');
    }
};

exports.getDepositPage = async (req, res) => {
    if (!req.session.user || !req.session.user._id) {
        req.flash('error_messages', 'Anda harus login untuk melakukan deposit.');
        return res.redirect('/login?returnTo=/user/deposit');
    }
    try {
        let paymentMethods = [];
        let orkutConfigured = false;

        if (process.env.ORKUT_QRIS_STATIC_CODE && process.env.OKECONNECT_MERCHANT_ID && process.env.OKECONNECT_API_KEY) {
            orkutConfigured = true;
            paymentMethods.push({
                metode: 'orkut_qris_dynamic',
                name: 'QRIS Dinamis (Rekomendasi Cepat)',
                type: 'QRIS',
                minimum: parseInt(process.env.ORKUT_QRIS_MIN_DEPOSIT || 1000),
                maximum: parseInt(process.env.ORKUT_QRIS_MAX_DEPOSIT || 10000000),
                percentage_fee: parseFloat(process.env.ORKUT_QRIS_FEE_PERCENTAGE_FOR_DEPOSIT || process.env.ORKUT_QRIS_FEE_PERCENTAGE || 0.7),
                fee_by_customer: process.env.ORKUT_QRIS_FEE_BY_CUSTOMER_DEPOSIT === 'true',
                logo_image_url: '/images/qris_logo.png',
                status: 'active',
                source: 'orkut_dynamic'
            });
        }

        if (FOREST_API_KEY) {
            try {
                const response = await axios.get(`${FOREST_BASE_URL}/deposit/methods?api_key=${FOREST_API_KEY}`, { timeout: 7000 });
                if (response.data && response.data.status === 'success' && Array.isArray(response.data.data)) {
                    const forestMethods = response.data.data
                        .filter(pm => pm.status === 'active')
                        .map(pm => ({ ...pm, source: 'forestapi' }));
                    paymentMethods = paymentMethods.concat(forestMethods);
                } else {
                }
            } catch (apiError) {
                 if (paymentMethods.length === 0) { 
                    req.flash('error_messages', 'Gagal memuat metode pembayaran dari provider. Silakan coba lagi nanti atau hubungi admin.');
                 } else if (orkutConfigured) {
                    req.flash('info_messages', 'Gagal memuat beberapa metode pembayaran dari provider. Metode QRIS tetap tersedia.');
                 }
            }
        } else {
        }
        
        paymentMethods.sort((a, b) => {
            if (a.source === 'orkut_dynamic' && b.source !== 'orkut_dynamic') return -1;
            if (b.source === 'orkut_dynamic' && a.source !== 'orkut_dynamic') return 1;
            return a.name.localeCompare(b.name);
        });

        if (paymentMethods.length === 0 && (!req.session.flash || (!req.session.flash.error_messages && !req.session.flash.info_messages))) {
             req.flash('error_messages', 'Tidak ada metode pembayaran yang aktif saat ini. Silakan hubungi admin.');
        }
        
        res.render('user/deposit', {
            pageTitle: 'Deposit Saldo',
            paymentMethods, 
            activePage: 'deposit'
        });
    } catch (error) {
        console.error("Error rendering deposit page:", error);
        req.flash('error_messages', 'Gagal memuat halaman deposit.');
        res.redirect('/user/profile');
    }
};

exports.postDeposit = async (req, res) => {
    const errorsValidation = validationResult(req);
    if (!errorsValidation.isEmpty()) {
        req.flash('error_messages', errorsValidation.array().map(err => err.msg));
        return res.redirect('/user/deposit');
    }

    const { amount, method_code } = req.body; 
    if (!req.session.user || !req.session.user._id) {
        req.flash('error_messages', 'Sesi tidak valid.');
        return res.redirect('/login');
    }
    const userId = req.session.user._id;
    const depositAmount = parseInt(amount);
    
    const telegramBot = req.app.get('telegramBot');
    const ownerChatId = process.env.TELEGRAM_OWNER_ID;

    try {
        let selectedMethodDetail = null;
        let paymentGatewayName = '';

        if (method_code === 'orkut_qris_dynamic' && process.env.ORKUT_QRIS_STATIC_CODE && process.env.OKECONNECT_MERCHANT_ID && process.env.OKECONNECT_API_KEY) {
            selectedMethodDetail = {
                metode: 'orkut_qris_dynamic',
                name: 'QRIS Dinamis (Rekomendasi Cepat)',
                minimum: parseInt(process.env.ORKUT_QRIS_MIN_DEPOSIT || 1000),
                maximum: parseInt(process.env.ORKUT_QRIS_MAX_DEPOSIT || 10000000),
                percentage_fee: parseFloat(process.env.ORKUT_QRIS_FEE_PERCENTAGE_FOR_DEPOSIT || process.env.ORKUT_QRIS_FEE_PERCENTAGE || 0.7),
                fee_by_customer: process.env.ORKUT_QRIS_FEE_BY_CUSTOMER_DEPOSIT === 'true',
                source: 'orkut_dynamic'
            };
            paymentGatewayName = 'ORKUT_QRIS_DYNAMIC';
        } else if (method_code === 'midtrans_gateway') {
            selectedMethodDetail = {
                metode: 'midtrans_gateway',
                name: 'Midtrans (VA, E-Wallet, CC, etc.)',
                minimum: 10000,
                maximum: 50000000,
                percentage_fee: 0,
                flat_fee: 0,
                fee_by_customer: true,
                source: 'midtrans'
            };
            paymentGatewayName = 'MIDTRANS';
        } else if (FOREST_API_KEY) {
            const methodsResponse = await axios.get(`${FOREST_BASE_URL}/deposit/methods?api_key=${FOREST_API_KEY}`);
            if (methodsResponse.data && methodsResponse.data.status === 'success' && Array.isArray(methodsResponse.data.data)) {
                selectedMethodDetail = methodsResponse.data.data.find(pm => pm.metode === method_code && pm.status === 'active');
                if (selectedMethodDetail) selectedMethodDetail.source = 'forestapi';
            }
            if (selectedMethodDetail) paymentGatewayName = 'FORESTAPI';
        }

        if (!selectedMethodDetail) {
            req.flash('error_messages', 'Metode pembayaran tidak valid atau tidak aktif.');
            return res.redirect('/user/deposit');
        }
        
        if (depositAmount < parseInt(selectedMethodDetail.minimum) || depositAmount > parseInt(selectedMethodDetail.maximum)) {
            req.flash('error_messages', `Jumlah deposit untuk ${selectedMethodDetail.name} harus antara Rp ${parseInt(selectedMethodDetail.minimum).toLocaleString('id-ID')} dan Rp ${parseInt(selectedMethodDetail.maximum).toLocaleString('id-ID')}.`);
            return res.redirect('/user/deposit');
        }

        const internalReffId = `DEP-${uuidv4().split('-')[0].toUpperCase()}`; 
        
        let feeAmount = 0;
        let amountToPay = depositAmount;
        let balanceToReceive = depositAmount;

        if (selectedMethodDetail.source === 'orkut_dynamic') {
            const feePercentage = selectedMethodDetail.percentage_fee / 100;
            const calculatedFee = depositAmount * feePercentage;
            feeAmount = calculatedFee;
            if (selectedMethodDetail.fee_by_customer) {
                amountToPay = depositAmount + calculatedFee;
            } else {
                balanceToReceive = depositAmount - calculatedFee;
            }
        } else if (selectedMethodDetail.source === 'forestapi') {
            const feePercentage = (parseFloat(selectedMethodDetail.percentage_fee) || 0) / 100;
            const feeFlat = parseFloat(selectedMethodDetail.flat_fee) || 0;
            const calculatedFee = (depositAmount * feePercentage) + feeFlat;
            feeAmount = calculatedFee;
            if (selectedMethodDetail.fee_by_customer) {
                amountToPay = depositAmount + calculatedFee;
            } else {
                balanceToReceive = depositAmount - calculatedFee;
            }
        } else if (selectedMethodDetail.source === 'midtrans') {
            feeAmount = 0; 
        }
        
        amountToPay = Math.round(amountToPay);
        balanceToReceive = Math.round(balanceToReceive);
        feeAmount = Math.round(feeAmount);


        let qrImageUrl = null;
        let providerTransactionId = internalReffId;
        let expiredAt = new Date(Date.now() + (60 * 60 * 1000 * DEPOSIT_EXPIRY_HOURS));
        let paymentUrl = null;


        if (paymentGatewayName === 'ORKUT_QRIS_DYNAMIC') {
            const qrisData = await createDynamicOrkutQris(amountToPay, `Deposit ${internalReffId}`);
            if (qrisData.success) {
                qrImageUrl = qrisData.qrImageUrl;
                providerTransactionId = qrisData.orkutReffId || internalReffId; 
                expiredAt = qrisData.expiredAt || expiredAt;
            } else {
                req.flash('error_messages', `Gagal membuat QRIS: ${qrisData.message}`);
                return res.redirect('/user/deposit');
            }
        } else if (paymentGatewayName === 'FORESTAPI') {
            const depositUrl = `${FOREST_BASE_URL}/deposit/create?api_key=${FOREST_API_KEY}&reff_id=${internalReffId}&metode=${method_code}&nominal=${depositAmount}`;
            const forestResponse = await axios.get(depositUrl);
            if (forestResponse.data && forestResponse.data.status === 'success' && forestResponse.data.data) {
                const forestData = forestResponse.data.data;
                qrImageUrl = forestData.qr_code || forestData.checkout_url || null;
                providerTransactionId = forestData.id_trx || internalReffId;
                
                if (forestData.total_bayar) amountToPay = Math.round(parseFloat(forestData.total_bayar));
                if (forestData.get_balance) balanceToReceive = Math.round(parseFloat(forestData.get_balance));
                if (forestData.fee) feeAmount = Math.round(parseFloat(forestData.fee));

                if (forestData.expired) {
                    expiredAt = new Date(parseInt(forestData.expired) * 1000);
                }
            } else {
                req.flash('error_messages', `Gagal membuat deposit ke provider: ${forestResponse.data.message || 'Error tidak diketahui'}`);
                return res.redirect('/user/deposit');
            }
        } else if (paymentGatewayName === 'MIDTRANS') {
             providerTransactionId = 'MT-' + internalReffId;
        }

        const newDeposit = new Deposit({
            user: userId,
            reffId: internalReffId,
            providerTransactionId: providerTransactionId,
            method: selectedMethodDetail.name,
            methodCode: method_code,
            paymentGateway: paymentGatewayName,
            amount: depositAmount, 
            fee: feeAmount, 
            getBalance: balanceToReceive,
            totalPaid: amountToPay,
            status: 'pending',
            qrImageUrl: qrImageUrl,
            paymentUrl: paymentUrl,
            expiredAt: expiredAt,
            balanceUpdated: false,
            lastCheckedAt: null 
        });
        await newDeposit.save();

        if (paymentGatewayName === 'MIDTRANS') {
            return res.redirect(`/user/deposit/midtrans-payment/${newDeposit._id}`);
        }
        
        res.redirect(`/user/deposit/status/${newDeposit._id}`);

    } catch (error) {
        console.error("Error creating deposit:", error);
        if (error.name === 'ValidationError') {
            let errorMessages = [];
            for (let field in error.errors) {
                errorMessages.push(error.errors[field].message);
            }
            req.flash('error_messages', errorMessages.join(', '));
        } else if (error.response && error.response.data && error.response.data.message) {
             req.flash('error_messages', `Gagal memproses deposit: ${error.response.data.message}`);
        }
        else {
            req.flash('error_messages', 'Terjadi kesalahan saat memproses permintaan deposit.');
        }
        res.redirect('/user/deposit');
    }
};

exports.getMidtransPaymentPage = async (req, res) => {
     const { depositId } = req.params;
    if (!req.session.user || !req.session.user._id) {
        req.flash('error_messages', 'Sesi tidak valid.');
        return res.redirect('/login');
    }
    try {
        const deposit = await Deposit.findOne({ _id: depositId, user: req.session.user._id, paymentGateway: 'MIDTRANS', status: 'pending' });
        if (!deposit) {
            req.flash('error_messages', 'Deposit Midtrans tidak ditemukan atau sudah diproses.');
            return res.redirect('/user/deposit');
        }
        
        const clientKeyMidtrans = 'Mid-client-IoIOg2RqJNZgKpY6';

        if (!clientKeyMidtrans) {
            console.error("CRITICAL: Midtrans Client Key tidak terkonfigurasi di backend untuk view!");
            req.flash('error_messages', 'Konfigurasi pembayaran Midtrans tidak lengkap di server.');
            return res.redirect('/user/deposit/status/' + deposit._id);
        }

        res.render('user/midtrans_payment', {
            pageTitle: `Pembayaran Midtrans ${deposit.reffId}`,
            deposit,
            midtransClientKey: clientKeyMidtrans 
        });
    } catch (error) {
        console.error("Error getting Midtrans payment page:", error);
        req.flash('error_messages', 'Gagal memuat halaman pembayaran Midtrans.');
        res.redirect('/user/deposit');
    }
};


exports.getDepositStatusPage = async (req, res) => {
    if (!req.session.user || !req.session.user._id) {
        req.flash('error_messages', 'Anda harus login untuk melihat status deposit.');
        return res.redirect('/login');
    }
    try {
        const deposit = await Deposit.findOne({ _id: req.params.depositId, user: req.session.user._id });
        if (!deposit) {
            req.flash('error_messages', 'Data deposit tidak ditemukan.');
            return res.redirect('/user/profile');
        }
        res.render('user/deposit_status', {
            pageTitle: `Status Deposit ${deposit.reffId}`,
            deposit,
            activePage: 'deposit'
        });
    } catch (error) {
        console.error("Error fetching deposit status:", error);
        req.flash('error_messages', 'Gagal memuat status deposit.');
        res.redirect('/user/profile');
    }
};

exports.checkDepositStatusApi = async (req, res) => {
    const { depositId } = req.params;
    const telegramBot = req.app.get('telegramBot');
    const ownerChatId = process.env.TELEGRAM_OWNER_ID;

    if (!req.session.user || !req.session.user._id) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    try {
        const deposit = await Deposit.findOne({ _id: depositId, user: req.session.user._id }).populate('user', 'username');
        if (!deposit) {
            return res.status(404).json({ success: false, message: 'Deposit tidak ditemukan.' });
        }

        if (deposit.status === 'success' || deposit.status === 'failed' || deposit.status === 'expired') {
            return res.json({ success: true, status: deposit.status, message: `Status deposit sudah final: ${deposit.status}.` });
        }

        if (new Date() > new Date(deposit.expiredAt)) {
            if (deposit.status === 'pending') {
                deposit.status = 'expired';
                await deposit.save();
            }
            return res.json({ success: true, status: deposit.status, message: 'Waktu pembayaran deposit telah habis.' });
        }

        let paymentConfirmed = false;
        let statusMessage = 'Status pembayaran masih pending.';
        const lastCheckedTimestamp = deposit.lastCheckedAt ? new Date(deposit.lastCheckedAt).getTime() : null;

        if (deposit.paymentGateway === 'ORKUT_QRIS_DYNAMIC') {
            const orkutStatus = await checkOrkutQrisPaymentStatus(deposit.providerTransactionId, deposit.totalPaid, lastCheckedTimestamp);
            if (orkutStatus.success && orkutStatus.isPaid) {
                paymentConfirmed = true;
                statusMessage = 'Pembayaran QRIS terkonfirmasi via OkeConnect.';
                deposit.providerTransactionDetails = orkutStatus.transaction;
            } else if (!orkutStatus.success) {
                statusMessage = `Gagal cek status OkeConnect: ${orkutStatus.message}`;
            }
        } else if (deposit.paymentGateway === 'FORESTAPI' && deposit.methodCode) {
            try {
                const checkUrl = `${FOREST_BASE_URL}/deposit/status?api_key=${FOREST_API_KEY}&reff_id=${deposit.reffId}`;
                const forestStatusResponse = await axios.get(checkUrl, { timeout: 7000 });
                if (forestStatusResponse.data && forestStatusResponse.data.status === 'success') {
                    const forestData = forestStatusResponse.data.data;
                    if (forestData.status && forestData.status.toLowerCase() === 'success') {
                        paymentConfirmed = true;
                        statusMessage = 'Pembayaran ForestAPI terkonfirmasi.';
                    } else if (forestData.status && ['failed', 'error', 'expired'].includes(forestData.status.toLowerCase())) {
                        deposit.status = forestData.status.toLowerCase();
                        statusMessage = `Status dari ForestAPI: ${forestData.status}.`;
                    } else {
                        statusMessage = `Status ForestAPI: ${forestData.status || 'Pending'}.`;
                    }
                } else {
                    statusMessage = `Gagal cek status ForestAPI: ${forestStatusResponse.data.message || 'Error'}`;
                }
            } catch (forestCheckError) {
                console.error("Error checking ForestAPI deposit status:", forestCheckError.message);
                statusMessage = 'Gagal menghubungi provider untuk cek status.';
            }
        } else if (deposit.paymentGateway === 'MIDTRANS') {
        }
        
        deposit.lastCheckedAt = new Date();

        if (paymentConfirmed && !deposit.balanceUpdated) {
            const user = await User.findById(deposit.user);
            if (user) {
                user.balance = (user.balance || 0) + deposit.getBalance;
                await user.save();
                deposit.status = 'success';
                deposit.balanceUpdated = true;
                statusMessage = 'Deposit berhasil dan saldo telah ditambahkan.';

                if (req.session.user && req.session.user._id.toString() === user._id.toString()) {
                    req.session.user.balance = user.balance; 
                    req.session.save((err) => {
                        if (err) console.error("Error saving session after balance update:", err);
                    });
                }
                
                if (telegramBot && ownerChatId) {
                    const notifMessage = `💰 *DEPOSIT SUKSES* 💰\n\nPengguna: *${user.username}*\nJumlah Terima: *Rp ${deposit.getBalance.toLocaleString('id-ID')}*\nMetode: *${deposit.method}*\nRef ID: \`${deposit.reffId}\`\n\nSaldo pengguna telah diperbarui.`;
                    try {
                        await telegramBot.sendMessage(ownerChatId, notifMessage, { parse_mode: 'Markdown' });
                    } catch (tgError) {
                        console.error("Gagal kirim notif deposit ke Telegram:", tgError.message);
                    }
                }

            } else {
                deposit.status = 'failed'; 
                statusMessage = 'Pembayaran terkonfirmasi tapi user tidak ditemukan untuk update saldo.';
            }
        }
        
        await deposit.save();
        res.json({ 
            success: true, 
            status: deposit.status, 
            message: statusMessage, 
            balanceUpdated: deposit.balanceUpdated,
            qrImageUrl: deposit.qrImageUrl, 
            expiredAt: deposit.expiredAt 
        });

    } catch (error) {
        console.error(`Error checking deposit status for ${depositId}:`, error);
        res.status(500).json({ success: false, message: 'Kesalahan server saat memeriksa status deposit.' });
    }
};

exports.getBecomeSellerPage = (req, res) => {
    res.render('user/become_seller', {
        pageTitle: 'Jadi Seller',
        currentUser: req.session.user
    });
};

exports.postBecomeSeller = async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.flash('error_messages', 'User tidak ditemukan.');
            return res.redirect('/login');
        }
        if (user.isSeller || user.sellerApplicationStatus === 'pending' || user.sellerApplicationStatus === 'approved') {
            req.flash('info_messages', 'Anda sudah menjadi seller atau aplikasi Anda sedang diproses/disetujui.');
            return res.redirect('/user/profile');
        }

        if (user.isVerified) {
            user.sellerApplicationStatus = 'approved';
            user.isSeller = true;
            req.flash('success_messages', 'Selamat! Akun Anda telah disetujui menjadi Seller karena email Anda sudah terverifikasi.');
        } else {
            user.sellerApplicationStatus = 'pending';
            req.flash('success_messages', 'Permintaan Anda untuk menjadi seller telah dikirim. Admin akan meninjaunya. Verifikasi email Anda akan mempercepat proses.');
        }
        
        await user.save();

        req.session.user.sellerApplicationStatus = user.sellerApplicationStatus;
        req.session.user.isSeller = user.isSeller;
        req.session.save();
        
        const telegramBot = req.app.get('telegramBot');
        const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_OWNER_ID;
        if (telegramBot && adminChatId) {
            let messageToAdmin = `📣 *APLIKASI SELLER* 📣\n\nPengguna: *${user.username}* (Email: ${user.email})\n`;
            if (user.isSeller) {
                messageToAdmin += `Status: *OTOMATIS DISETUJUI* (Email Terverifikasi)\n`;
            } else {
                messageToAdmin += `Status: *PENDING REVIEW*\n`;
            }
            messageToAdmin += `\nSilakan cek panel admin jika perlu.`;
             try {
                await telegramBot.sendMessage(adminChatId, messageToAdmin, { parse_mode: 'Markdown' });
            } catch (tgError) {
                console.error("Gagal kirim notif aplikasi seller ke Telegram:", tgError.message);
            }
        }

        res.redirect('/user/profile');
    } catch (error) {
        console.error('Error applying to become seller:', error);
        req.flash('error_messages', 'Gagal mengirim permintaan menjadi seller.');
        res.redirect('/user/become-seller');
    }
};

exports.generateApiKey = async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.flash('error_messages', 'User tidak ditemukan.');
            return res.redirect('/login');
        }
        if (!user.isSeller && user.role !== 'admin') {
            req.flash('error_messages', 'Hanya seller atau admin yang dapat membuat API Key.');
            return res.redirect('/user/profile');
        }
        
        const newApiKey = crypto.randomBytes(24).toString('hex');
        user.apiKey = newApiKey;
        await user.save();
        
        req.flash('success_messages', 'API Key baru berhasil dibuat.');
        res.redirect('/user/profile');
    } catch (error) {
        console.error('Error generating API Key:', error);
        req.flash('error_messages', 'Gagal membuat API Key.');
        res.redirect('/user/profile');
    }
};