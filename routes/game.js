const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { isLoggedIn } = require('../middleware/authMiddleware');

router.get('/', gameController.getGamesIndexPage); // Halaman utama pilih game
router.get('/:gameSlug', gameController.getGameProductPage); // Halaman produk untuk game spesifik

router.get('/checkout/item', isLoggedIn, gameController.getGameCheckoutPage); // Ganti path agar lebih jelas
router.post('/order/item/process', isLoggedIn, gameController.processGameOrder); 
router.get('/order/:orderId/payment-game', isLoggedIn, gameController.getOrderPaymentGamePage); 
router.get('/order/:orderId/check-payment-and-process', isLoggedIn, gameController.checkGameOrderPaymentAndProcess);
router.get('/order/:orderId/status', isLoggedIn, gameController.getGameOrderStatusPage);

module.exports = router;