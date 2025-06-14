// routes/docs.js
const express = require('express');
const router = express.Router();
const docsController = require('../controllers/docsController');
const { isLoggedIn, isAdmin } = require('../middleware/authMiddleware'); 
router.get('/', docsController.getDocsPage);
module.exports = router;