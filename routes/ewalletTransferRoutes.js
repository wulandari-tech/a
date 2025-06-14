const express = require('express');
const router = express.Router();
const ewalletTransferController = require('../controllers/ewalletTransferController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.get('/bank-ewallet', isAuthenticated, ewalletTransferController.getTransferPage);
router.get('/transfer-methods', isAuthenticated, ewalletTransferController.getTransferMethodsApi);
router.post('/validate-account', isAuthenticated, ewalletTransferController.validateAccountApi);
router.post('/process', isAuthenticated, ewalletTransferController.processTransfer);

module.exports = router;