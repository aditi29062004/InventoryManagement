const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

// POST /api/purchase-orders/generate - Generate PO for low stock item
router.post('/generate', purchaseController.generatePurchaseOrder);

// GET /api/purchase-orders - Get all purchase orders
router.get('/', purchaseController.getAllPurchaseOrders);

// GET /api/purchase-orders/:id - Get single purchase order with items
router.get('/:id', purchaseController.getPurchaseOrderById);

// POST /api/purchase-orders - Create new purchase order
router.post('/', purchaseController.createPurchaseOrder);

// PUT /api/purchase-orders/:id - Update purchase order
router.put('/:id', purchaseController.updatePurchaseOrder);

// DELETE /api/purchase-orders/:id - Delete purchase order
router.delete('/:id', purchaseController.deletePurchaseOrder);

// PUT /api/purchase-orders/:id/status - Update purchase order status
router.put('/:id/status', purchaseController.updatePurchaseOrderStatus);

// PUT /api/purchase-orders/:id/receive - Receive purchase order (update stock)
router.put('/:id/receive', purchaseController.receivePurchaseOrder);

// PUT /api/purchase-orders/:id/cancel - Cancel purchase order
router.put('/:id/cancel', purchaseController.cancelPurchaseOrder);

module.exports = router;