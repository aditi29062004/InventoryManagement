const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');

const {
    listOrders,
    getOrderById,
    createOrder,
    completeOrder,
    cancelOrder
} = require('../controllers/mongoOrderController');

router.use(authenticateToken);

router.get('/', listOrders);
router.get('/:id', getOrderById);
router.post('/', createOrder);
router.post('/:id/complete', completeOrder);
router.post('/:id/cancel', cancelOrder);

module.exports = router;
