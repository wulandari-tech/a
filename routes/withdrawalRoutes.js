const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.get('/withdraw', isAuthenticated, withdrawalController.getWithdrawPage);
router.post('/withdraw/request', isAuthenticated, withdrawalController.requestWithdrawal);

module.exports = router;