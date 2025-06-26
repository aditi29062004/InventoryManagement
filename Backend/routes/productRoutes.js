const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// GET /api/products/low-stock - Get low stock products
router.get('/alerts/low-stock', productController.getLowStockProducts);

// GET /api/products/analytics - Get product analytics
router.get('/analytics/data', productController.getProductAnalytics);

// GET /api/products - Get all products
router.get('/', productController.getAllProducts);

// GET /api/products/:id - Get single product
router.get('/:id', productController.getProductById);

// POST /api/products - Create new product
router.post('/', productController.createProduct);

// PUT /api/products/:id - Update product
router.put('/:id', productController.updateProduct);

// DELETE /api/products/:id - Delete product
router.delete('/:id', productController.deleteProduct);

// PUT /api/products/:id/stock - Adjust product stock
router.put('/:id/stock', productController.adjustStock);

module.exports = router;