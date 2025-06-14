const express = require('express');
const router = express.Router();
const pterodactylController = require('../controllers/pterodactylController');
const { isAuthenticated } = require('../middleware/authMiddleware');


router.post('/setup-account', isAuthenticated, pterodactylController.setupPterodactylAccount);

module.exports = router;