const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.get('/products', storeController.getStoreIndexPage);
router.get('/product/:id', storeController.getProductDetailPage);

router.get('/checkout/:productId', isAuthenticated, storeController.getCheckoutPage); 
router.post('/order/process', isAuthenticated, storeController.processOrder);
router.get('/order/:orderId/payment', isAuthenticated, storeController.getOrderPaymentPage);
router.get('/order/:orderId/check-status', isAuthenticated, storeController.checkOrderStatusAndProcess);

router.get('/order/:orderId/setup-ptero', isAuthenticated, storeController.getSetupPteroPage);
router.get('/order/:orderId/setup-vps', isAuthenticated, storeController.getSetupVpsPage);

module.exports = router;