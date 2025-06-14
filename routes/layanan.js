const express = require('express');
const router = express.Router();
const ppobController = require('../controllers/ppobController');
const { isLoggedIn } = require('../middleware/authMiddleware');

router.get('/', ppobController.getPPOBIndexPage);
router.get('/:categoryForUrl/:slugForUrl', ppobController.getProductPageByCategoryAndSlug);

router.get('/checkout/item', isLoggedIn, ppobController.getCheckoutPage); 
router.post('/order/item/process', isLoggedIn, ppobController.processPPOBOrder); 
router.get('/order/:orderId/payment', isLoggedIn, ppobController.getOrderPaymentPPOBPage); 
router.get('/order/:orderId/check-payment-and-process', isLoggedIn, ppobController.checkPPOBOrderPaymentAndProcess);
router.get('/order/:orderId/status', isLoggedIn, ppobController.getPPOBOrderStatusPage);

module.exports = router;