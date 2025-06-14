const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const productController = require('../controllers/productController');
const orderController = require('../controllers/orderController');
const depositController = require('../controllers/depositController');
const informationBoardController = require('../controllers/informationBoardController');

router.get('/dashboard', adminController.getDashboardPage);

router.get('/products', productController.getProductsPageAdmin);
router.get('/products/add', productController.getAddProductPageAdmin);
router.post('/products/add', productController.postAddProductAdmin);
router.get('/products/edit/:id', productController.getEditProductPageAdmin);
router.post('/products/edit/:id', productController.postEditProductAdmin);
router.post('/products/delete/:id', productController.postDeleteProductAdmin);

router.get('/orders', orderController.getOrdersPageAdmin);
router.get('/orders/detail/:orderId', orderController.getOrderDetailPageAdmin);
router.get('/orders/check-orkut-status/:orderId', orderController.checkOrkutStatusAdmin);
router.post('/orders/update-status/:orderId', orderController.updateOrderStatusAdmin);

router.get('/deposits', depositController.getDepositsPageAdmin);
router.post('/deposits/approve/:depositId', depositController.approveDepositManualAdmin);

router.get('/users', adminController.getUsersPage);
router.get('/users/edit/:id', adminController.getEditUserPage);
router.post('/users/edit/:id', adminController.postEditUser);

router.get('/information-board', informationBoardController.getManageInformationBoardPage);
router.post('/information-board/add', informationBoardController.addInformationItem);
router.post('/information-board/delete/:id', informationBoardController.deleteInformationItem);
router.post('/information-board/toggle/:id', informationBoardController.toggleInformationItemStatus);

router.get('/withdrawals', adminController.getManageWithdrawalsPage);
router.post('/withdrawals/:withdrawalId/approve', (req, res, next) => { req.query.action = 'approve'; next(); }, adminController.processWithdrawalAction);
router.post('/withdrawals/:withdrawalId/reject', (req, res, next) => { req.query.action = 'reject'; next(); }, adminController.processWithdrawalAction);
router.post('/withdrawals/:withdrawalId/complete', (req, res, next) => { req.query.action = 'complete'; next(); }, adminController.processWithdrawalAction);

module.exports = router;