const express = require('express');
const router = express.Router();
const ppobController = require('../controllers/ppobController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { check, query } = require('express-validator');


router.get('/layanan', ppobController.getLayananIndexPage);


router.get('/layanan/ppob', isAuthenticated, ppobController.getPpobJagoanPediaPage);
router.get('/layanan/sosmed', isAuthenticated, ppobController.getSosmedPage);


router.get('/layanan/checkout', isAuthenticated, [
    query('product_code', 'Kode layanan tidak valid').notEmpty().escape(),
    query('product_name', 'Nama layanan tidak valid').notEmpty().escape(),
    query('product_price', 'Harga layanan tidak valid').isInt({ gt: 0 }),
    query('target_id', 'Target tidak boleh kosong').notEmpty().escape(),
    query('service_type', 'Tipe layanan tidak valid').notEmpty().escape(),
    query('quantity_smm').optional().isInt({ gt: 0 }).withMessage('Jumlah SMM harus angka positif'),
    query('original_price_per_k_smm').optional().isInt({ gt:0 }).withMessage('Harga asli SMM tidak valid'),
    query('min_smm').optional().isInt({min:1}).withMessage("Minimal order SMM tidak valid"),
    query('max_smm').optional().isInt({min:1}).withMessage("Maksimal order SMM tidak valid"),
    query('note').optional().escape(),
    query('operator').optional().escape(),
    query('zone_id').optional().escape()
], ppobController.getLayananCheckoutPage);


router.post('/layanan/order/process', isAuthenticated, [
    check('product_code', 'Kode layanan diperlukan').notEmpty().escape(),
    check('product_name', 'Nama layanan diperlukan').notEmpty().escape(),
    check('product_price', 'Harga layanan diperlukan').isInt({ gt: 0 }),
    check('target_id', 'Target diperlukan').notEmpty().escape(),
    check('service_type', 'Tipe layanan diperlukan').notEmpty().escape(),
    check('payment_method', 'Metode pembayaran diperlukan').notEmpty().isIn(['balance', 'orkut_qris', 'midtrans_gateway']),
    check('quantity_smm', 'Jumlah SMM harus angka positif').optional().isInt({min: 1}),
    check('original_price_per_k_smm', 'Harga asli SMM tidak valid').optional().isInt({ gt:0 })
], ppobController.processLayananOrder);


router.get('/layanan/order/:orderId/payment', isAuthenticated, ppobController.getLayananOrderPaymentPage);
router.get('/layanan/order/:orderId/midtrans-payment', isAuthenticated, ppobController.getLayananOrderMidtransPaymentPage);
router.get('/layanan/order/:orderId/status', isAuthenticated, ppobController.getLayananOrderStatusPage);
router.get('/layanan/order/:orderId/check-payment-and-process', isAuthenticated, ppobController.checkLayananPaymentAndProcessOrder);

module.exports = router;