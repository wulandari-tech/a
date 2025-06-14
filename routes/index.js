const express = require('express');
const router = express.Router();
const indexController = require('../controllers/indexController');
const { isLoggedIn } = require('../middleware/authMiddleware');

router.get('/', indexController.getLandingPage);
router.get('/informasi', indexController.getInformasiPage);
router.get('/chat', isLoggedIn, indexController.getChatPage);

module.exports = router;