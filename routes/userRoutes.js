const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const withdrawalController = require('../controllers/withdrawalController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { check } = require('express-validator');


router.get('/profile', isAuthenticated, userController.getUserProfilePage);
router.get('/profile/edit', isAuthenticated, userController.getEditProfilePage);
router.post('/profile/edit', isAuthenticated, [
    check('username', 'Username minimal 3 karakter').optional({ checkFalsy: true }).isLength({ min: 3 }).trim().escape(),
    check('email', 'Masukkan email yang valid').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    check('new_password').custom((value, { req }) => {
        if (value && value.length < 8) {
            throw new Error('Password baru minimal 8 karakter jika diisi');
        }
        if (value && !req.body.current_password) {
            throw new Error('Password saat ini diperlukan untuk mengubah password');
        }
        if (value && value !== req.body.confirm_new_password) {
            throw new Error('Konfirmasi password baru tidak cocok');
        }
        return true;
    })
], userController.postEditProfile);

router.get('/deposit', isAuthenticated, userController.getDepositPage);
router.post('/deposit', isAuthenticated, [
    check('amount', 'Jumlah deposit minimal Rp 1.000').isInt({ min: 1000 }),
    check('method_code', 'Metode pembayaran wajib dipilih').notEmpty()
], userController.postDeposit);
router.get('/deposit/status/:depositId', isAuthenticated, userController.getDepositStatusPage);
router.get('/api/deposit/check-status/:depositId', isAuthenticated, userController.checkDepositStatusApi);
router.get('/deposit/midtrans-payment/:depositId', isAuthenticated, userController.getMidtransPaymentPage);


router.get('/become-seller', isAuthenticated, userController.getBecomeSellerPage);
router.post('/become-seller', isAuthenticated, userController.postBecomeSeller);

router.post('/generate-apikey', isAuthenticated, userController.generateApiKey);

router.post('/resend-verification', isAuthenticated, userController.resendVerificationEmail);


router.get('/withdraw', isAuthenticated, withdrawalController.getWithdrawPage);
router.post('/withdraw/request', isAuthenticated, [
    check('amount', 'Jumlah penarikan minimal Rp 30.000').isInt({ min: 30000 }),
    check('bankName', 'Nama Bank/E-Wallet tujuan tidak boleh kosong').trim().notEmpty().escape(),
    check('accountNumber', 'Nomor rekening/E-Wallet tidak boleh kosong').trim().notEmpty().isNumeric().withMessage('Nomor rekening hanya boleh angka'),
    check('accountHolderName', 'Nama pemilik rekening tidak boleh kosong').trim().notEmpty().escape()
], withdrawalController.requestWithdrawal);


module.exports = router;