const mongoose = require('mongoose');
const { PurchaseOrder } = require('../models/mongo');

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
    createPurchaseOrder,
    receivePurchaseOrder
};
