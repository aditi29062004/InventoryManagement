const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');

const {
    Product,
    Supplier,
    PurchaseOrder,
    StockMovement
} = require('../models/mongo');

class PurchaseOrderServiceError extends Error {
    constructor(statusCode, code, message) {
        super(message);
        this.name = 'PurchaseOrderServiceError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

function validateOwnerId(ownerId) {
    if (!mongoose.isValidObjectId(ownerId)) {
        throw new PurchaseOrderServiceError(
            401,
            'INVALID_OWNER',
            'Authenticated user is invalid'
        );
    }
}

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validatePurchaseOrderItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new PurchaseOrderServiceError(
            400,
            'INVALID_PURCHASE_ORDER_ITEMS',
            'A purchase order must contain at least one item'
        );
    }

    const seenProductIds = new Set();

    for (const item of items) {
        if (
            !item ||
            !mongoose.isValidObjectId(item.productId) ||
            !Number.isInteger(item.quantityOrdered) ||
            item.quantityOrdered < 1 ||
            typeof item.unitCost !== 'number' ||
            !Number.isFinite(item.unitCost) ||
            item.unitCost < 0
        ) {
            throw new PurchaseOrderServiceError(
                400,
                'INVALID_PURCHASE_ORDER_ITEM',
                'Each item requires a valid productId, positive integer quantityOrdered, and non-negative unitCost'
            );
        }

        const productId = String(item.productId);

        if (seenProductIds.has(productId)) {
            throw new PurchaseOrderServiceError(
                400,
                'DUPLICATE_PRODUCT',
                'Include each product only once in a purchase order'
            );
        }

        seenProductIds.add(productId);
    }
}

async function createMongoPurchaseOrder({
    ownerId,
    supplierId,
    items,
    purchaseOrderNumber
}) {
    validateOwnerId(ownerId);
    validatePurchaseOrderItems(items);

    if (!mongoose.isValidObjectId(supplierId)) {
        throw new PurchaseOrderServiceError(
            400,
            'INVALID_SUPPLIER_ID',
            'A valid supplierId is required'
        );
    }

    const normalizedOwnerId = new mongoose.Types.ObjectId(ownerId);
    const normalizedSupplierId = new mongoose.Types.ObjectId(supplierId);

    const normalizedNumber =
        typeof purchaseOrderNumber === 'string'
            ? purchaseOrderNumber.trim()
            : '';

    if (normalizedNumber.length > 100) {
        throw new PurchaseOrderServiceError(
            400,
            'INVALID_PURCHASE_ORDER_NUMBER',
            'Purchase order number cannot exceed 100 characters'
        );
    }

    const session = await mongoose.startSession();

    try {
        let createdPurchaseOrder;

        await session.withTransaction(async () => {
            const supplier = await Supplier.findOne({
                _id: normalizedSupplierId,
                ownerId: normalizedOwnerId,
                isActive: true,
                status: 'active'
            }).session(session);

            if (!supplier) {
                const ownedSupplier = await Supplier.findOne({
                    _id: normalizedSupplierId,
                    ownerId: normalizedOwnerId
                }).session(session);

                if (!ownedSupplier) {
                    throw new PurchaseOrderServiceError(
                        404,
                        'SUPPLIER_NOT_FOUND',
                        'Supplier not found in your inventory'
                    );
                }

                throw new PurchaseOrderServiceError(
                    409,
                    'SUPPLIER_UNAVAILABLE',
                    'This supplier is not active'
                );
            }

            const orderItems = [];
            let subtotal = 0;

            for (const item of items) {
                const product = await Product.findOne({
                    _id: new mongoose.Types.ObjectId(item.productId),
                    ownerId: normalizedOwnerId
                }).session(session);

                if (!product) {
                    throw new PurchaseOrderServiceError(
                        404,
                        'PRODUCT_NOT_FOUND',
                        'A product was not found in your inventory'
                    );
                }

                const lineTotal = roundMoney(
                    item.unitCost * item.quantityOrdered
                );

                subtotal = roundMoney(subtotal + lineTotal);

                orderItems.push({
                    productId: product._id,
                    productName: product.name,
                    quantityOrdered: item.quantityOrdered,
                    quantityReceived: 0,
                    unitCost: item.unitCost,
                    lineTotal
                });
            }

            const [purchaseOrder] = await PurchaseOrder.create(
                [{
                    ownerId: normalizedOwnerId,
                    purchaseOrderNumber:
                        normalizedNumber || `PO-${randomUUID()}`,
                    supplierId: normalizedSupplierId,
                    items: orderItems,
                    subtotal,
                    status: 'pending'
                }],
                { session }
            );

            createdPurchaseOrder = purchaseOrder;
        });

        return createdPurchaseOrder;
    } catch (error) {
        if (error.code === 11000) {
            throw new PurchaseOrderServiceError(
                409,
                'DUPLICATE_PURCHASE_ORDER_NUMBER',
                'This purchase order number already exists in your inventory'
            );
        }

        throw error;
    } finally {
        await session.endSession();
    }
}

async function receiveMongoPurchaseOrder({
    ownerId,
    purchaseOrderId,
    receivedItems,
    idempotencyKey
}) {
    validateOwnerId(ownerId);

    if (!mongoose.isValidObjectId(purchaseOrderId)) {
        throw new PurchaseOrderServiceError(
            400,
            'INVALID_PURCHASE_ORDER_ID',
            'Invalid purchase order ID'
        );
    }

    if (
        typeof idempotencyKey !== 'string' ||
        !idempotencyKey.trim() ||
        idempotencyKey.trim().length > 128
    ) {
        throw new PurchaseOrderServiceError(
            400,
            'INVALID_IDEMPOTENCY_KEY',
            'A valid Idempotency-Key header is required'
        );
    }

    if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
        throw new PurchaseOrderServiceError(
            400,
            'INVALID_RECEIPT_ITEMS',
            'At least one received item is required'
        );
    }

    const normalizedItems = [];
    const seenProductIds = new Set();

    for (const item of receivedItems) {
        if (
            !item ||
            !mongoose.isValidObjectId(item.productId) ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1
        ) {
            throw new PurchaseOrderServiceError(
                400,
                'INVALID_RECEIPT_ITEM',
                'Each received item requires a valid productId and positive integer quantity'
            );
        }

        const productId = String(item.productId);

        if (seenProductIds.has(productId)) {
            throw new PurchaseOrderServiceError(
                400,
                'DUPLICATE_RECEIPT_PRODUCT',
                'Include each product only once per receipt'
            );
        }

        seenProductIds.add(productId);
        normalizedItems.push({ productId, quantity: item.quantity });
    }

    normalizedItems.sort((a, b) => a.productId.localeCompare(b.productId));

    const normalizedKey = idempotencyKey.trim();
    const normalizedOwnerId = new mongoose.Types.ObjectId(ownerId);
    const normalizedPurchaseOrderId =
        new mongoose.Types.ObjectId(purchaseOrderId);
    const session = await mongoose.startSession();

    try {
        let result;

        await session.withTransaction(async () => {
            const purchaseOrder = await PurchaseOrder.findOne({
                _id: normalizedPurchaseOrderId,
                ownerId: normalizedOwnerId
            }).session(session);

            if (!purchaseOrder) {
                throw new PurchaseOrderServiceError(
                    404,
                    'PURCHASE_ORDER_NOT_FOUND',
                    'Purchase order not found'
                );
            }

            const existingReceipt = purchaseOrder.receipts.find(
                receipt => receipt.idempotencyKey === normalizedKey
            );

            if (existingReceipt) {
                const priorItems = existingReceipt.items
                    .map(item => ({
                        productId: String(item.productId),
                        quantity: item.quantity
                    }))
                    .sort((a, b) => a.productId.localeCompare(b.productId));

                if (JSON.stringify(priorItems) !== JSON.stringify(normalizedItems)) {
                    throw new PurchaseOrderServiceError(
                        409,
                        'IDEMPOTENCY_KEY_REUSED',
                        'This idempotency key was already used with different receipt quantities'
                    );
                }

                result = { purchaseOrder, replayed: true };
                return;
            }

            if (
                !['pending', 'ordered', 'partially_received'].includes(
                    purchaseOrder.status
                )
            ) {
                throw new PurchaseOrderServiceError(
                    409,
                    'INVALID_PURCHASE_ORDER_TRANSITION',
                    `Cannot receive a purchase order with status "${purchaseOrder.status}"`
                );
            }

            const receiptPlan = [];

            for (const receivedItem of normalizedItems) {
                const orderItem = purchaseOrder.items.find(
                    item => String(item.productId) === receivedItem.productId
                );

                if (!orderItem) {
                    throw new PurchaseOrderServiceError(
                        400,
                        'PRODUCT_NOT_IN_PURCHASE_ORDER',
                        'A received product is not listed on this purchase order'
                    );
                }

                const remaining =
                    orderItem.quantityOrdered - orderItem.quantityReceived;

                if (receivedItem.quantity > remaining) {
                    throw new PurchaseOrderServiceError(
                        409,
                        'OVER_RECEIVING',
                        `Received quantity exceeds the remaining quantity for "${orderItem.productName}"`
                    );
                }

                const productBefore = await Product.findOneAndUpdate(
                    {
                        _id: new mongoose.Types.ObjectId(receivedItem.productId),
                        ownerId: normalizedOwnerId
                    },
                    {
                        $inc: { stockQuantity: receivedItem.quantity }
                    },
                    {
                        session,
                        returnDocument: 'before',
                        runValidators: true
                    }
                );

                if (!productBefore) {
                    throw new PurchaseOrderServiceError(
                        409,
                        'PURCHASE_ORDER_PRODUCT_MISSING',
                        'A product associated with this purchase order no longer exists'
                    );
                }

                receiptPlan.push({
                    productId: productBefore._id,
                    quantity: receivedItem.quantity,
                    quantityBefore: productBefore.stockQuantity,
                    quantityAfter:
                        productBefore.stockQuantity + receivedItem.quantity
                });

                orderItem.quantityReceived += receivedItem.quantity;
            }

            const allReceived = purchaseOrder.items.every(
                item => item.quantityReceived === item.quantityOrdered
            );

            purchaseOrder.status = allReceived
                ? 'received'
                : 'partially_received';

            purchaseOrder.receipts.push({
                idempotencyKey: normalizedKey,
                items: normalizedItems.map(item => ({
                    productId: new mongoose.Types.ObjectId(item.productId),
                    quantity: item.quantity
                })),
                receivedAt: new Date()
            });

            await purchaseOrder.save({ session });

            const movements = receiptPlan.map(item => ({
                ownerId: normalizedOwnerId,
                productId: item.productId,
                type: 'purchase_received',
                quantityChange: item.quantity,
                quantityBefore: item.quantityBefore,
                quantityAfter: item.quantityAfter,
                referenceType: 'purchaseOrder',
                referenceId: purchaseOrder._id,
                idempotencyKey:
                    `purchase-receipt:${purchaseOrder._id}:${normalizedKey}:${item.productId}`
            }));

            await StockMovement.create(movements, { session });

            result = { purchaseOrder, replayed: false };
        });

        return result;
    } finally {
        await session.endSession();
    }
}

module.exports = {
    createMongoPurchaseOrder,
    receiveMongoPurchaseOrder,
    PurchaseOrderServiceError
};
