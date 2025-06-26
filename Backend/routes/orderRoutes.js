const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');


// GET /api/orders/stats/dashboard - Get dashboard stats
router.get('/stats/dashboard', orderController.getDashboardStats);

// GET /api/orders/recent/list - Get recent orders for dashboard
router.get('/recent/list', orderController.getRecentOrders);

// GET /api/orders - Get all orders with pagination
router.get('/', orderController.getAllOrders);

// GET /api/orders/:id - Get single order with items
router.get('/:id', orderController.getOrderById);

// POST /api/orders - Create new order
router.post('/', orderController.createOrder);

// PUT /api/orders/:id - Update order
router.put('/:id', orderController.updateOrder);

// DELETE /api/orders/:id - Delete order
router.delete('/:id', orderController.deleteOrder);

// PUT /api/orders/:id/status - Update order status
router.put('/:id/status', orderController.updateOrderStatus);

// PUT /api/orders/:id/complete - Complete order
router.put('/:id/complete', orderController.completeOrder);

// PUT /api/orders/:id/cancel - Cancel order (restore stock)
router.put('/:id/cancel', orderController.cancelOrder);


module.exports = router;