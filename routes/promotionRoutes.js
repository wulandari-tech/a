const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotionController');

router.get('/promotions', promotionController.getPromotionsPage);

module.exports = router;