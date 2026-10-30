const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');

const {
    listProducts,
    createProduct,
    getProductById,
    updateProduct,
    deleteProduct,
    adjustProductStock
} = require('../controllers/mongoProductController');

router.use(authenticateToken);

router.get('/', listProducts);
router.get('/:id', getProductById);
router.post('/', createProduct);
router.patch('/:id/stock', adjustProductStock);
router.patch('/:id', updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
