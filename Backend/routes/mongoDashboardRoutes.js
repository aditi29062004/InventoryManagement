
const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');
const {
    getDashboardSummary
} = require('../controllers/mongoDashboardController');

router.get('/summary', authenticateToken, getDashboardSummary);

module.exports = router;