
const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');
const {
    getAnalyticsSummary
} = require('../controllers/mongoAnalyticsController');

router.get('/summary', authenticateToken, getAnalyticsSummary);

module.exports = router;
