const mongoose = require('mongoose');
const { Order } = require('../models/mongo');

const {
    createMongoOrder,
    completeMongoOrder,
    cancelMongoOrder,
    OrderServiceError
} = require('../services/mongoOrderService');

const ALLOWED_STATUSES = ['pending', 'completed', 'cancelled'];

function sendError(res, status, code, message) {
    return res.status(status).json({
        success: false,
        error: { code, message }
    });
}

function handleError(res, error, operation) {
    if (error instanceof OrderServiceError) {
        return sendError(
            res,
            error.statusCode,
            error.code,
            error.message
        );
    }

    if (error.code === 11000) {
        return sendError(
            res,
            409,
            'DUPLICATE_ORDER',
            'An order with these identifiers already exists'
        );
    }

    if (
        error.name === 'ValidationError' ||
        error.name === 'CastError'
    ) {
        return sendError(
            res,
            400,
            'VALIDATION_ERROR',
            'Order details are invalid'
        );
    }

    console.error(`MongoDB ${operation} error:`, error.message);

    return sendError(
        res,
        500,
        'INTERNAL_ERROR',
        `Failed to ${operation} order`
    );
}

function isValidObjectId(id) {
    return mongoose.isValidObjectId(id);
}

async function listOrders(req, res) {
    try {
        const rawPage = req.query.page ?? '1';
        const rawLimit = req.query.limit ?? '20';
        const isPositiveInteger = value =>
            typeof value === 'string' && /^[1-9]\d*$/.test(value);

        if (
            !isPositiveInteger(rawPage) ||
            !isPositiveInteger(rawLimit)
        ) {
            return sendError(
                res,
                400,
                'INVALID_PAGINATION',
                'Page must be positive and limit must be between 1 and 100'
            );
        }

        const page = Number(rawPage);
        const limit = Number(rawLimit);

        if (
            !Number.isSafeInteger(page) ||
            !Number.isSafeInteger(limit) ||
            limit > 100 ||
            !Number.isSafeInteger((page - 1) * limit)
        ) {
            return sendError(
                res,
                400,
                'INVALID_PAGINATION',
                'Page must be positive and limit must be between 1 and 100'
            );
        }

        const filter = { ownerId: req.user._id };

        if (req.query.status !== undefined) {
            if (
                typeof req.query.status !== 'string' ||
                !ALLOWED_STATUSES.includes(req.query.status)
            ) {
                return sendError(
                    res,
                    400,
                    'INVALID_STATUS',
                    'Status must be pending, completed, or cancelled'
                );
            }

            filter.status = req.query.status;
        }

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: orders,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return handleError(res, error, 'list');
    }
}

async function getOrderById(req, res) {
    try {
        if (!isValidObjectId(req.params.id)) {
            return sendError(
                res,
                400,
                'INVALID_ORDER_ID',
                'Order ID is invalid'
            );
        }

        const order = await Order.findOne({
            _id: req.params.id,
            ownerId: req.user._id
        }).lean();

        if (!order) {
            return sendError(
                res,
                404,
                'ORDER_NOT_FOUND',
                'Order not found'
            );
        }

        return res.status(200).json({
            success: true,
            data: order
        });
    } catch (error) {
        return handleError(res, error, 'retrieve');
    }
}

async function createOrder(req, res) {
    try {
        const { items, customerName, customerEmail } = req.body ?? {};
        const idempotencyKey = req.get('Idempotency-Key');

        if (
            typeof idempotencyKey !== 'string' ||
            !idempotencyKey.trim() ||
            idempotencyKey.trim().length > 128
        ) {
            return sendError(
                res,
                400,
                'INVALID_IDEMPOTENCY_KEY',
                'A valid Idempotency-Key header is required'
            );
        }

        if (
            customerName !== undefined &&
            typeof customerName !== 'string'
        ) {
            return sendError(
                res,
                400,
                'INVALID_CUSTOMER_NAME',
                'Customer name must be a string'
            );
        }

        if (
            customerEmail !== undefined &&
            typeof customerEmail !== 'string'
        ) {
            return sendError(
                res,
                400,
                'INVALID_CUSTOMER_EMAIL',
                'Customer email must be a string'
            );
        }

        const result = await createMongoOrder({
            ownerId: req.user._id,
            items,
            customerName,
            customerEmail,
            idempotencyKey: idempotencyKey
        });

        return res.status(result.replayed ? 200 : 201).json({
            success: true,
            replayed: result.replayed,
            data: result.order
        });
    } catch (error) {
        return handleError(res, error, 'create');
    }
}

async function completeOrder(req, res) {
    try {
        const order = await completeMongoOrder({
            ownerId: req.user._id,
            orderId: req.params.id
        });

        return res.status(200).json({
            success: true,
            data: order
        });
    } catch (error) {
        return handleError(res, error, 'complete');
    }
}

async function cancelOrder(req, res) {
    try {
        const order = await cancelMongoOrder({
            ownerId: req.user._id,
            orderId: req.params.id
        });

        return res.status(200).json({
            success: true,
            data: order
        });
    } catch (error) {
        return handleError(res, error, 'cancel');
    }
}

module.exports = {
    listOrders,
    getOrderById,
    createOrder,
    completeOrder,
    cancelOrder
};
