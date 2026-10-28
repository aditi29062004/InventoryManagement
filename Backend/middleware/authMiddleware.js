
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('../models/mongo');

async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'A valid Bearer token is required'
                }
            });
        }

        const token = authHeader.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Access token is missing'
                }
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured');

            return res.status(500).json({
                success: false,
                error: {
                    code: 'SERVER_CONFIGURATION_ERROR',
                    message: 'Authentication is not configured'
                }
            });
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256']
        });

        if (
            typeof payload.sub !== 'string' ||
            !mongoose.isValidObjectId(payload.sub)
        ) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Access token is invalid'
                }
            });
        }

        const user = await User.findById(payload.sub);

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'The associated account is unavailable'
                }
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (
            error.name === 'TokenExpiredError' ||
            error.name === 'JsonWebTokenError' ||
            error.name === 'NotBeforeError'
        ) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Access token is invalid or expired'
                }
            });
        }

        console.error('Authentication middleware error:', error.message);

        return res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to authenticate request'
            }
        });
    }
}

module.exports = { authenticateToken };
