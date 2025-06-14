const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { isLoggedIn } = require('../middleware/authMiddleware');

router.get('/store', storeController.getStoreIndexPage);
router.get('/store/category/:slug', storeController.getStoreCategoryPage);

router.get('/products', isLoggedIn, storeController.getProductListingPage);
router.get('/product/:id', isLoggedIn, storeController.getProductDetailPage);
router.get('/checkout/:productId', isLoggedIn, storeController.getCheckoutPage);
router.post('/order/process', isLoggedIn, storeController.processOrder);
router.get('/order/:orderId/payment', isLoggedIn, storeController.getOrderPaymentPage);
router.get('/order/:orderId/check-status', isLoggedIn, storeController.checkOrderStatus);
router.get('/order/:orderId/setup-ptero', isLoggedIn, storeController.getSetupPteroPage);
router.get('/order/:orderId/setup-vps', isLoggedIn, storeController.getSetupVpsPage);

module.exports = router;