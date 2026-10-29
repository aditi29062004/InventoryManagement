const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');

const {
    listPurchaseOrders,
    createPurchaseOrder,
    receivePurchaseOrder
} = require('../controllers/mongoPurchaseOrderController');

router.use(authenticateToken);

router.get('/', listPurchaseOrders);
router.post('/', createPurchaseOrder);
router.post('/:id/receive', receivePurchaseOrder);

module.exports = router;
