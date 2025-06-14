const Deposit = require('../models/deposit');
const User = require('../models/user');
const { createDynamicOrkutQris, checkOrkutQrisPaymentStatus } = require('../services/orkutQrisService');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const FOREST_API_KEY = process.env.FOREST_API_KEY;
const FOREST_BASE_URL = 'https://forestapi.web.id/api/h2h';
const DEPOSIT_EXPIRY_HOURS = parseInt(process.env.DEPOSIT_EXPIRY_HOURS || '1');


exports.getDepositsPageAdmin = async (req, res) => {
    try {
        const deposits = await Deposit.find().populate('user', 'username').sort({ createdAt: -1 });
        res.render('admin/deposits', {
            pageTitle: 'Admin - Kelola Deposit',
            deposits,
            activePage: 'deposit'
        });
    } catch (error) {
        console.error("Error fetching deposits for admin:", error);
        req.flash('adminError', 'Gagal memuat daftar deposit.');
        res.redirect('/admin/dashboard');
    }
};

exports.approveDepositManualAdmin = async (req, res) => {
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
                req.session.save((err) => {
                    if (err) console.error("Error saving session after manual deposit approval:", err);
                });
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