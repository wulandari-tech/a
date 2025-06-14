const Withdrawal = require('../models/withdrawal');
const User = require('../models/user');
const { validationResult } = require('express-validator');


exports.getWithdrawPage = async (req, res) => {
    try {
        const currentUser = await User.findById(req.session.user._id);
        res.render('user/withdraw_request', {
            pageTitle: 'Permintaan Penarikan Dana',
            currentUser
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Gagal memuat halaman penarikan.');
        res.redirect('/user/dashboard');
    }
};

exports.requestWithdrawal = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_messages', errors.array().map(e => e.msg));
        return res.redirect('/user/withdraw');
    }

    try {
        const { amount, bankName, accountNumber, accountHolderName } = req.body;
        const userId = req.session.user._id;
        const user = await User.findById(userId);

        if (!user) {
            req.flash('error_messages', 'User tidak ditemukan.');
            return res.redirect('/logout');
        }

        if (!user.isVerified) {
            req.flash('error_messages', 'Akun Anda belum terverifikasi. Silakan verifikasi email Anda terlebih dahulu.');
            return res.redirect('/user/withdraw');
        }

        const withdrawalAmount = parseFloat(amount);
        if (isNaN(withdrawalAmount) || withdrawalAmount < 30000) {
            req.flash('error_messages', 'Jumlah penarikan minimal adalah Rp 30.000.');
            return res.redirect('/user/withdraw');
        }

        if (user.balance < withdrawalAmount) {
            req.flash('error_messages', 'Saldo Anda tidak mencukupi untuk melakukan penarikan ini.');
            return res.redirect('/user/withdraw');
        }

        const withdrawalFee = parseFloat(process.env.WITHDRAWAL_FEE_FLAT || 5000);
        const amountAfterFee = withdrawalAmount - withdrawalFee;

        if (amountAfterFee <= 0) {
            req.flash('error_messages', 'Jumlah penarikan setelah dipotong biaya admin tidak valid.');
            return res.redirect('/user/withdraw');
        }
        
        user.balance -= withdrawalAmount;
        await user.save();

        const newWithdrawal = new Withdrawal({
            user: userId,
            amount: withdrawalAmount,
            method: bankName,
            accountNumber,
            accountHolderName,
            status: 'pending',
            fee: withdrawalFee,
            amountAfterFee: amountAfterFee
        });
        await newWithdrawal.save();
        
        req.flash('success_messages', 'Permintaan penarikan dana Anda berhasil dikirim dan akan segera diproses.');
        res.redirect('/user/profile');
    } catch (error) {
        console.error('Error requesting withdrawal:', error);
        req.flash('error_messages', 'Terjadi kesalahan saat memproses permintaan penarikan.');
        res.redirect('/user/withdraw');
    }
};