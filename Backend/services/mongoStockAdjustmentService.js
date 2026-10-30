
const mongoose = require('mongoose');

const { Product, StockMovement } = require('../models/mongo');

class StockAdjustmentServiceError extends Error {
    constructor(statusCode, code, message) {
        super(message);
        this.name = 'StockAdjustmentServiceError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

function validateInput({ ownerId, productId, stockQuantity, reason, idempotencyKey }) {
    if (!mongoose.isValidObjectId(ownerId)) {
        throw new StockAdjustmentServiceError(
            401, 'INVALID_OWNER', 'Authenticated user is invalid'
        );
    }

    if (!mongoose.isValidObjectId(productId)) {
        throw new StockAdjustmentServiceError(
            400, 'INVALID_PRODUCT_ID', 'Product ID is invalid'
        );
    }

    if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) {
        throw new StockAdjustmentServiceError(
            400, 'INVALID_STOCK_QUANTITY',
            'stockQuantity must be a non-negative safe integer'
        );
    }

    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 250) {
        throw new StockAdjustmentServiceError(
            400, 'INVALID_REASON', 'A reason of 1–250 characters is required'
        );
    }

    if (
        typeof idempotencyKey !== 'string' ||
        !idempotencyKey.trim() ||
        idempotencyKey.trim().length > 128
    ) {
        throw new StockAdjustmentServiceError(
            400, 'INVALID_IDEMPOTENCY_KEY',
            'A valid Idempotency-Key header is required'
        );
    }
}

async function adjustMongoStock({
    ownerId,
    productId,
    stockQuantity,
    reason,
    idempotencyKey
}) {
    const normalizedReason = typeof reason === 'string' ? reason.trim() : reason;
    const normalizedKey =
        typeof idempotencyKey === 'string' ? idempotencyKey.trim() : idempotencyKey;

    validateInput({
        ownerId, productId, stockQuantity,
        reason: normalizedReason, idempotencyKey: normalizedKey
    });

    const normalizedOwnerId = new mongoose.Types.ObjectId(ownerId);
    const normalizedProductId = new mongoose.Types.ObjectId(productId);

    // Namespace adjustment keys to avoid collisions with other stock workflows.
    const movementKey = `stock-adjustment:${normalizedKey}`;

    // A retry must return the original operation, not overwrite newer stock.
    const existingMovement = await StockMovement.findOne({
        ownerId: normalizedOwnerId,
        idempotencyKey: movementKey
    });

    if (existingMovement) {
        const matches =
            String(existingMovement.productId) === String(normalizedProductId) &&
            existingMovement.quantityAfter === stockQuantity &&
            existingMovement.reason === normalizedReason;

        if (!matches) {
            throw new StockAdjustmentServiceError(
                409, 'IDEMPOTENCY_KEY_REUSED',
                'This Idempotency-Key was already used for a different adjustment'
            );
        }

        return { movement: existingMovement, replayed: true };
    }

    const session = await mongoose.startSession();

    try {
        let result;

        await session.withTransaction(async () => {
            // Recheck inside the transaction in case another request won the race.
            const existing = await StockMovement.findOne({
                ownerId: normalizedOwnerId,
                idempotencyKey: movementKey
            }).session(session);

            if (existing) {
                const matches =
                    String(existing.productId) === String(normalizedProductId) &&
                    existing.quantityAfter === stockQuantity &&
                    existing.reason === normalizedReason;

                if (!matches) {
                    throw new StockAdjustmentServiceError(
                        409, 'IDEMPOTENCY_KEY_REUSED',
                        'This Idempotency-Key was already used for a different adjustment'
                    );
                }

                result = { movement: existing, replayed: true };
                return;
            }

            const product = await Product.findOne({
                _id: normalizedProductId,
                ownerId: normalizedOwnerId
            }).session(session);

            if (!product) {
                throw new StockAdjustmentServiceError(
                    404, 'PRODUCT_NOT_FOUND',
                    'Product not found in your inventory'
                );
            }

            const quantityBefore = product.stockQuantity;
            const quantityChange = stockQuantity - quantityBefore;

            if (quantityChange === 0) {
                throw new StockAdjustmentServiceError(
                    409, 'NO_STOCK_CHANGE',
                    'The requested stock quantity is already set'
                );
            }

            // Conditional update prevents silently overwriting a concurrent change.
            const updatedProduct = await Product.findOneAndUpdate(
                {
                    _id: normalizedProductId,
                    ownerId: normalizedOwnerId,
                    stockQuantity: quantityBefore
                },
                { $set: { stockQuantity } },
                { new: true, session, runValidators: true }
            );

            if (!updatedProduct) {
                throw new StockAdjustmentServiceError(
                    409, 'STOCK_CHANGED_CONCURRENTLY',
                    'Stock changed during this request; retry with a new Idempotency-Key'
                );
            }

            const [movement] = await StockMovement.create([{
                ownerId: normalizedOwnerId,
                productId: normalizedProductId,
                type: 'adjustment',
                reason: normalizedReason,
                quantityChange,
                quantityBefore,
                quantityAfter: stockQuantity,
                referenceType: 'adjustment',
                idempotencyKey: movementKey
            }], { session });

            result = { movement, replayed: false };
        });

        return result;
    } finally {
        await session.endSession();
    }
}

module.exports = {
    adjustMongoStock,
    StockAdjustmentServiceError
};
