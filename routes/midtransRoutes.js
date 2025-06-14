const express = require('express');
const router = express.Router();
const midtransController = require('../controllers/midtransController');
const { isAuthenticated } = require('../middleware/authMiddleware');


router.post('/create-transaction/deposit/:depositId', isAuthenticated, midtransController.createDepositTransaction);
router.post('/create-transaction/order/:orderId', isAuthenticated, midtransController.createOrderTransaction);


router.post('/notification', midtransController.handleNotification);

module.exports = router;