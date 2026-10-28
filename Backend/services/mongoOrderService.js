
const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');

const {
    Order,
    Product,
    StockMovement
} = require('../models/mongo');

class OrderServiceError extends Error {
    constructor(statusCode, code, message) {
        super(message);
        this.name = 'OrderServiceError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validateOrderInput({ ownerId, items, idempotencyKey }) {
    if (!mongoose.isValidObjectId(ownerId)) {
        throw new OrderServiceError(
            401,
            'INVALID_OWNER',
            'Authenticated user is invalid'
        );
    }

    if (
        typeof idempotencyKey !== 'string' ||
        !idempotencyKey.trim() ||
        idempotencyKey.trim().length > 128
    ) {
        throw new OrderServiceError(
            400,
            'INVALID_IDEMPOTENCY_KEY',
            'A valid Idempotency-Key header is required'
        );
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new OrderServiceError(
            400,
            'INVALID_ORDER_ITEMS',
            'An order must contain at least one item'
        );
    }

    const seenProductIds = new Set();

    for (const item of items) {
        if (
            !item ||
            !mongoose.isValidObjectId(item.productId) ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1
        ) {
            throw new OrderServiceError(
                400,
                'INVALID_ORDER_ITEM',
                'Each item requires a valid productId and positive integer quantity'
            );
        }

        const productId = String(item.productId);

        if (seenProductIds.has(productId)) {
            throw new OrderServiceError(
                400,
                'DUPLICATE_PRODUCT',
                'Include each product only once in an order'
            );
        }

        seenProductIds.add(productId);
    }
}

async function createMongoOrder({
    ownerId,
    items,
    customerName = '',
    customerEmail = '',
    idempotencyKey
}) {
    const normalizedKey =
        typeof idempotencyKey === 'string'
            ? idempotencyKey.trim()
            : idempotencyKey;

    validateOrderInput({
        ownerId,
        items,
        idempotencyKey: normalizedKey
    });

    const normalizedOwnerId = new mongoose.Types.ObjectId(ownerId);

    // Return the original order when a client retries a completed request.
    const existingOrder = await Order.findOne({
        ownerId: normalizedOwnerId,
        idempotencyKey: normalizedKey
    });

    if (existingOrder) {
        return { order: existingOrder, replayed: true };
    }

    // Keep identifiers stable if MongoDB retries the transaction callback.
    const orderId = new mongoose.Types.ObjectId();
    const orderNumber = `ORD-${randomUUID()}`;

    const session = await mongoose.startSession();

    try {
        let createdOrder;

        await session.withTransaction(async () => {
            const orderItems = [];
            const movements = [];
            let subtotal = 0;

            for (const item of items) {
                const productId = new mongoose.Types.ObjectId(
                    item.productId
                );

                // Atomic conditional deduction: never allow stock below zero.
                const productBefore = await Product.findOneAndUpdate(
                    {
                        _id: productId,
                        ownerId: normalizedOwnerId,
                        isActive: true,
                        status: 'active',
                        stockQuantity: { $gte: item.quantity }
                    },
                    {
                        $inc: { stockQuantity: -item.quantity }
                    },
                    {
                        session,
                        returnDocument: 'before'
                    }
                );

                if (!productBefore) {
                    const ownedProduct = await Product.findOne({
                        _id: productId,
                        ownerId: normalizedOwnerId
                    }).session(session);

                    if (!ownedProduct) {
                        throw new OrderServiceError(
                            404,
                            'PRODUCT_NOT_FOUND',
                            'A product was not found in your inventory'
                        );
                    }

                    if (
                        !ownedProduct.isActive ||
                        ownedProduct.status !== 'active'
                    ) {
                        throw new OrderServiceError(
                            409,
                            'PRODUCT_UNAVAILABLE',
                            `Product "${ownedProduct.name}" is not available for sale`
                        );
                    }

                    throw new OrderServiceError(
                        409,
                        'INSUFFICIENT_STOCK',
                        `Insufficient stock for product "${ownedProduct.name}"`
                    );
                }

                const lineTotal = roundMoney(
                    productBefore.price * item.quantity
                );

                subtotal = roundMoney(subtotal + lineTotal);

                orderItems.push({
                    productId: productBefore._id,
                    productName: productBefore.name,
                    sku: productBefore.sku,
                    quantity: item.quantity,
                    unitPrice: productBefore.price,
                    lineTotal
                });

                movements.push({
                    ownerId: normalizedOwnerId,
                    productId: productBefore._id,
                    type: 'sale',
                    quantityChange: -item.quantity,
                    quantityBefore: productBefore.stockQuantity,
                    quantityAfter:
                        productBefore.stockQuantity - item.quantity,
                    referenceType: 'order',
                    referenceId: orderId,
                    idempotencyKey:
                        `order:${orderId}:product:${productBefore._id}:sale`
                });
            }

            await StockMovement.create(movements, { session });

            const [order] = await Order.create(
                [{
                    _id: orderId,
                    ownerId: normalizedOwnerId,
                    orderNumber,
                    idempotencyKey: normalizedKey,
                    customerName,
                    customerEmail,
                    items: orderItems,
                    subtotal,
                    total: subtotal,
                    status: 'pending',
                    stockCommitted: true
                }],
                { session }
            );

            createdOrder = order;
        });

        return { order: createdOrder, replayed: false };
    } catch (error) {
        // A concurrent retry may win the unique idempotency index race.
        if (error.code === 11000) {
            const existing = await Order.findOne({
                ownerId: normalizedOwnerId,
                idempotencyKey: normalizedKey
            });

            if (existing) {
                return { order: existing, replayed: true };
            }
        }

        throw error;
    } finally {
        await session.endSession();
    }
}


async function completeMongoOrder({ ownerId, orderId }) {
    if (!mongoose.isValidObjectId(ownerId)) {
        throw new OrderServiceError(401, 'INVALID_OWNER', 'Authenticated user is invalid');
    }

    if (!mongoose.isValidObjectId(orderId)) {
        throw new OrderServiceError(400, 'INVALID_ORDER_ID', 'Invalid order ID');
    }

    const normalizedOwnerId = new mongoose.Types.ObjectId(ownerId);
    const normalizedOrderId = new mongoose.Types.ObjectId(orderId);
    const session = await mongoose.startSession();

    try {
        let completedOrder;

        await session.withTransaction(async () => {
            completedOrder = await Order.findOneAndUpdate(
                {
                    _id: normalizedOrderId,
                    ownerId: normalizedOwnerId,
                    status: 'pending',
                    stockCommitted: true
                },
                { $set: { status: 'completed' } },
                { session, returnDocument: 'after', runValidators: true }
            );

            if (!completedOrder) {
                const existingOrder = await Order.findOne({
                    _id: normalizedOrderId,
                    ownerId: normalizedOwnerId
                }).session(session);

                if (!existingOrder) {
                    throw new OrderServiceError(404, 'ORDER_NOT_FOUND', 'Order not found');
                }

                throw new OrderServiceError(
                    409,
                    'INVALID_ORDER_TRANSITION',
                    `Cannot complete an order with status "${existingOrder.status}"`
                );
            }
        });

        return completedOrder;
    } finally {
        await session.endSession();
    }
}

async function cancelMongoOrder({ ownerId, orderId }) {
    if (!mongoose.isValidObjectId(ownerId)) {
        throw new OrderServiceError(401, 'INVALID_OWNER', 'Authenticated user is invalid');
    }

    if (!mongoose.isValidObjectId(orderId)) {
        throw new OrderServiceError(400, 'INVALID_ORDER_ID', 'Invalid order ID');
    }

    const normalizedOwnerId = new mongoose.Types.ObjectId(ownerId);
    const normalizedOrderId = new mongoose.Types.ObjectId(orderId);
    const session = await mongoose.startSession();

    try {
        let cancelledOrder;

        await session.withTransaction(async () => {
            const order = await Order.findOneAndUpdate(
                {
                    _id: normalizedOrderId,
                    ownerId: normalizedOwnerId,
                    status: 'pending',
                    stockCommitted: true
                },
                {
                    $set: {
                        status: 'cancelled',
                        stockCommitted: false
                    }
                },
                { session, returnDocument: 'before', runValidators: true }
            );

            if (!order) {
                const existingOrder = await Order.findOne({
                    _id: normalizedOrderId,
                    ownerId: normalizedOwnerId
                }).session(session);

                if (!existingOrder) {
                    throw new OrderServiceError(404, 'ORDER_NOT_FOUND', 'Order not found');
                }

                throw new OrderServiceError(
                    409,
                    'INVALID_ORDER_TRANSITION',
                    `Cannot cancel an order with status "${existingOrder.status}"`
                );
            }

            for (const item of order.items) {
                const productBefore = await Product.findOneAndUpdate(
                    {
                        _id: item.productId,
                        ownerId: normalizedOwnerId
                    },
                    { $inc: { stockQuantity: item.quantity } },
                    {
                        session,
                        returnDocument: 'before',
                        runValidators: true
                    }
                );

                if (!productBefore) {
                    throw new OrderServiceError(
                        409,
                        'ORDER_PRODUCT_MISSING',
                        'A product associated with this order no longer exists'
                    );
                }

                await StockMovement.create(
                    [{
                        ownerId: normalizedOwnerId,
                        productId: item.productId,
                        type: 'sale_cancelled',
                        quantityChange: item.quantity,
                        quantityBefore: productBefore.stockQuantity,
                        quantityAfter: productBefore.stockQuantity + item.quantity,
                        referenceType: 'order',
                        referenceId: order._id,
                        idempotencyKey: `order:${order._id}:product:${item.productId}:sale-cancelled`
                    }],
                    { session }
                );
            }

            cancelledOrder = await Order.findOne({
                _id: order._id,
                ownerId: normalizedOwnerId
            }).session(session);
        });

        return cancelledOrder;
    } finally {
        await session.endSession();
    }
}
module.exports = {
    createMongoOrder,
    completeMongoOrder,
    cancelMongoOrder,
    OrderServiceError
};
