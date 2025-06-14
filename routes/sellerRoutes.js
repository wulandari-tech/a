const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController'); 
const { isAuthenticated, isSellerApproved } = require('../middleware/authMiddleware');


router.get('/dashboard', isAuthenticated, isSellerApproved, (req, res) => {
    res.render('seller/dashboard', { 
        pageTitle: 'Seller Dashboard',
        activePage: 'seller-dashboard'
    });
});

router.get('/products', isAuthenticated, isSellerApproved, productController.getSellerProductsPage);
router.get('/products/add', isAuthenticated, isSellerApproved, productController.getAddProductPageSeller);
router.post('/products/add', isAuthenticated, isSellerApproved, productController.postAddProductSeller);
router.get('/products/edit/:id', isAuthenticated, isSellerApproved, productController.getEditProductPageSeller);
router.post('/products/edit/:id', isAuthenticated, isSellerApproved, productController.postEditProductSeller);
router.post('/products/delete/:id', isAuthenticated, isSellerApproved, productController.postDeleteProductSeller);


module.exports = router;