const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isGuest, isAuthenticated } = require('../middleware/authMiddleware');
const { check } = require('express-validator');

router.get('/register', isGuest, authController.getRegisterPage);
router.post('/register', isGuest, [
    check('username', 'Username minimal 3 karakter').isLength({ min: 3 }).trim().escape(),
    check('email', 'Masukkan email yang valid').isEmail().normalizeEmail(),
    check('password', 'Password minimal 8 karakter').isLength({ min: 8 })
], authController.postRegister);

router.get('/login', isGuest, authController.getLoginPage);
router.post('/login', isGuest, [
    check('email', 'Masukkan email yang valid').isEmail().normalizeEmail(),
    check('password', 'Password tidak boleh kosong').notEmpty()
], authController.postLogin);

router.get('/logout', isAuthenticated, authController.logout);

router.get('/verify-email/:token', authController.verifyEmail);

router.get('/forgot-password', isGuest, authController.getForgotPasswordPage);
router.post('/forgot-password', isGuest, [
    check('email', 'Masukkan email yang valid').isEmail().normalizeEmail()
], authController.postForgotPassword);

router.get('/reset-password/:token', isGuest, authController.getResetPasswordPage);
router.post('/reset-password/:token', isGuest, [
    check('password', 'Password baru minimal 8 karakter').isLength({ min: 8 }),
    check('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Konfirmasi password tidak cocok dengan password baru');
        }
        return true;
    })
], authController.postResetPassword);

module.exports = router;