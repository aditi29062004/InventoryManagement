const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
    createMongoPurchaseOrder,
    receiveMongoPurchaseOrder,
    PurchaseOrderServiceError
} = require('../services/mongoPurchaseOrderService');

const ownerId = new mongoose.Types.ObjectId().toString();
const supplierId = new mongoose.Types.ObjectId().toString();
const productId = new mongoose.Types.ObjectId().toString();
const purchaseOrderId = new mongoose.Types.ObjectId().toString();

async function expectServiceError(operation, expectedCode) {
    await assert.rejects(
        operation,
        error =>
            error instanceof PurchaseOrderServiceError &&
            error.code === expectedCode
    );
}

test('rejects an invalid authenticated owner ID', async () => {
    await expectServiceError(
        createMongoPurchaseOrder({
            ownerId: 'invalid-owner',
            supplierId,
            items: [{ productId, quantityOrdered: 1, unitCost: 10 }]
        }),
        'INVALID_OWNER'
    );
});

test('rejects a purchase order with no items', async () => {
    await expectServiceError(
        createMongoPurchaseOrder({
            ownerId,
            supplierId,
            items: []
        }),
        'INVALID_PURCHASE_ORDER_ITEMS'
    );
});

test('rejects an invalid supplier ID', async () => {
    await expectServiceError(
        createMongoPurchaseOrder({
            ownerId,
            supplierId: 'invalid-supplier',
            items: [{ productId, quantityOrdered: 1, unitCost: 10 }]
        }),
        'INVALID_SUPPLIER_ID'
    );
});

test('rejects invalid ordered quantities and costs', async () => {
    const invalidItems = [
        { productId, quantityOrdered: 0, unitCost: 10 },
        { productId, quantityOrdered: -1, unitCost: 10 },
        { productId, quantityOrdered: 1.5, unitCost: 10 },
        { productId, quantityOrdered: 1, unitCost: -1 },
        { productId, quantityOrdered: 1, unitCost: '10' },
        { productId, quantityOrdered: 1, unitCost: Infinity }
    ];

    for (const item of invalidItems) {
        await expectServiceError(
            createMongoPurchaseOrder({
                ownerId,
                supplierId,
                items: [item]
            }),
            'INVALID_PURCHASE_ORDER_ITEM'
        );
    }
});

test('rejects duplicate products in a purchase order', async () => {
    await expectServiceError(
        createMongoPurchaseOrder({
            ownerId,
            supplierId,
            items: [
                { productId, quantityOrdered: 1, unitCost: 10 },
                { productId, quantityOrdered: 2, unitCost: 12 }
            ]
        }),
        'DUPLICATE_PRODUCT'
    );
});

test('rejects an invalid receiving purchase-order ID', async () => {
    await expectServiceError(
        receiveMongoPurchaseOrder({
            ownerId,
            purchaseOrderId: 'invalid-order',
            receivedItems: [{ productId, quantity: 1 }],
            idempotencyKey: 'receipt-test-1'
        }),
        'INVALID_PURCHASE_ORDER_ID'
    );
});

test('rejects a missing receiving idempotency key', async () => {
    await expectServiceError(
        receiveMongoPurchaseOrder({
            ownerId,
            purchaseOrderId,
            receivedItems: [{ productId, quantity: 1 }]
        }),
        'INVALID_IDEMPOTENCY_KEY'
    );
});

test('rejects an empty receiving request', async () => {
    await expectServiceError(
        receiveMongoPurchaseOrder({
            ownerId,
            purchaseOrderId,
            receivedItems: [],
            idempotencyKey: 'receipt-test-2'
        }),
        'INVALID_RECEIPT_ITEMS'
    );
});

test('rejects invalid receiving quantities', async () => {
    for (const quantity of [0, -1, 1.5]) {
        await expectServiceError(
            receiveMongoPurchaseOrder({
                ownerId,
                purchaseOrderId,
                receivedItems: [{ productId, quantity }],
                idempotencyKey: `invalid-receipt-${quantity}`
            }),
            'INVALID_RECEIPT_ITEM'
        );
    }
});

test('rejects duplicate products in a single receipt', async () => {
    await expectServiceError(
        receiveMongoPurchaseOrder({
            ownerId,
            purchaseOrderId,
            receivedItems: [
                { productId, quantity: 1 },
                { productId, quantity: 2 }
            ],
            idempotencyKey: 'receipt-test-3'
        }),
        'DUPLICATE_RECEIPT_PRODUCT'
    );
});
