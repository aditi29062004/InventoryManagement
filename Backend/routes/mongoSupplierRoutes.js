
const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');
const {
    listSuppliers,
    createSupplier,
    getSupplierById,
    updateSupplier,
    deleteSupplier
} = require('../controllers/mongoSupplierController');

router.use(authenticateToken);

router.get('/', listSuppliers);
router.get('/:id', getSupplierById);
router.post('/', createSupplier);
router.patch('/:id', updateSupplier);
router.delete('/:id', deleteSupplier);

module.exports = router;
