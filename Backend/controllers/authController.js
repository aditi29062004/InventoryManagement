
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/mongo');

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '15m';

function createAccessToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }

    return jwt.sign(
        { sub: user._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

function publicUser(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
    };
}

async function register(req, res) {
    try {
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

        const { name, email, password } = req.body || {};

        if (
            typeof name !== 'string' ||
            typeof email !== 'string' ||
            typeof password !== 'string'
        ) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Name, email and password are required as strings' }
            });
        }

        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (normalizedName.length < 2 || normalizedName.length > 100) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Name must be between 2 and 100 characters' }
            });
        }

        if (
            normalizedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Please provide a valid email address' }
            });
        }

        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Password must be between 8 and 72 characters' }
            });
        }

        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: { code: 'EMAIL_ALREADY_EXISTS', message: 'An account with this email already exists' }
            });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            passwordHash
        });

        const accessToken = createAccessToken(user);

        return res.status(201).json({
            success: true,
            data: {
                user: publicUser(user),
                accessToken,
                tokenType: 'Bearer',
                expiresIn: TOKEN_EXPIRY
            }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                error: { code: 'EMAIL_ALREADY_EXISTS', message: 'An account with this email already exists' }
            });
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'The supplied account details are invalid' }
            });
        }

        console.error('Registration error:', error.message);

        return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Unable to register at this time' }
        });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body || {};

        if (
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' }
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({ email: normalizedEmail })
            .select('+passwordHash');

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
            });
        }

        const accessToken = createAccessToken(user);

        return res.status(200).json({
            success: true,
            data: {
                user: publicUser(user),
                accessToken,
                tokenType: 'Bearer',
                expiresIn: TOKEN_EXPIRY
            }
        });
    } catch (error) {
        console.error('Login error:', error.message);

        return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Unable to log in at this time' }
        });
    }
}

async function getMe(req, res) {
    return res.status(200).json({
        success: true,
        data: { user: publicUser(req.user) }
    });
}

module.exports = {
    register,
    login,
    getMe,
    createAccessToken,
    publicUser
};
