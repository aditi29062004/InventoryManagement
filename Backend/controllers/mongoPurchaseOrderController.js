const mongoose = require('mongoose');
const { PurchaseOrder } = require('../models/mongo');
const ALLOWED_STATUSES = [
    'pending',
    'ordered',
    'partially_received',
    'received',
    'cancelled'
];

const {
    createMongoPurchaseOrder,
    receiveMongoPurchaseOrder,
    PurchaseOrderServiceError
} = require('../services/mongoPurchaseOrderService');

function sendError(res, status, code, message) {
    return res.status(status).json({
        success: false,
        error: { code, message }
    });
}

function handleError(res, error, operation) {
    if (error instanceof PurchaseOrderServiceError) {
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
            'DUPLICATE_PURCHASE_ORDER',
            'A purchase order with these identifiers already exists'
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
            'Purchase order details are invalid'
        );
    }

    console.error(`MongoDB purchase order ${operation} error:`, error.message);

    return sendError(
        res,
        500,
        'INTERNAL_ERROR',
        `Failed to ${operation} purchase order`
    );
}


async function listPurchaseOrders(req, res) {
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
                    'Status must be pending, ordered, partially_received, received, or cancelled'
                );
            }

            filter.status = req.query.status;
        }

        const [purchaseOrders, total] = await Promise.all([
            PurchaseOrder.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            PurchaseOrder.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: purchaseOrders,
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

async function createPurchaseOrder(req, res) {
    try {
        const {
            supplierId,
            items,
            purchaseOrderNumber
        } = req.body ?? {};

        if (
            purchaseOrderNumber !== undefined &&
            typeof purchaseOrderNumber !== 'string'
        ) {
            return sendError(
                res,
                400,
                'INVALID_PURCHASE_ORDER_NUMBER',
                'Purchase order number must be a string'
            );
        }

        const purchaseOrder = await createMongoPurchaseOrder({
            ownerId: req.user._id,
            supplierId,
            items,
            purchaseOrderNumber
        });

        return res.status(201).json({
            success: true,
            data: purchaseOrder
        });
    } catch (error) {
        return handleError(res, error, 'create');
    }
}

async function receivePurchaseOrder(req, res) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return sendError(
                res,
                400,
                'INVALID_PURCHASE_ORDER_ID',
                'Purchase order ID is invalid'
            );
        }

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

        const { items } = req.body ?? {};

        const result = await receiveMongoPurchaseOrder({
            ownerId: req.user._id,
            purchaseOrderId: req.params.id,
            receivedItems: items,
            idempotencyKey
        });

        return res.status(200).json({
            success: true,
            replayed: result.replayed,
            data: result.purchaseOrder
        });
    } catch (error) {
        return handleError(res, error, 'receive');
    }
}

module.exports = {
    listPurchaseOrders,
    createPurchaseOrder,
    receivePurchaseOrder
};
