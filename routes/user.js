const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isLoggedIn } = require('../middleware/authMiddleware');

router.get('/profile', isLoggedIn, userController.getProfilePage);
router.get('/profile/edit', isLoggedIn, userController.getEditProfilePage);
router.post('/profile/edit', isLoggedIn, userController.updateProfile);

router.get('/deposit', isLoggedIn, userController.getDepositPage);
router.post('/deposit', isLoggedIn, userController.createDeposit);
router.get('/deposit/status/:depositId', isLoggedIn, userController.getDepositStatusPage);
router.get('/deposit/check-status-api/:forestApiReffId', isLoggedIn, userController.checkDepositStatusApi);

module.exports = router;