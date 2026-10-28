const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
    createMongoOrder,
    OrderServiceError
} = require('../services/mongoOrderService');

const ownerId = new mongoose.Types.ObjectId().toString();
const productId = new mongoose.Types.ObjectId().toString();

async function expectServiceError(input, expectedCode) {
    await assert.rejects(
        createMongoOrder(input),
        error =>
            error instanceof OrderServiceError &&
            error.code === expectedCode
    );
}

test('rejects an invalid authenticated owner ID', async () => {
    await expectServiceError({
        ownerId: 'not-an-object-id',
        items: [{ productId, quantity: 1 }],
        idempotencyKey: 'test-key-1'
    }, 'INVALID_OWNER');
});

test('rejects a missing idempotency key', async () => {
    await expectServiceError({
        ownerId,
        items: [{ productId, quantity: 1 }]
    }, 'INVALID_IDEMPOTENCY_KEY');
});

test('rejects an empty idempotency key', async () => {
    await expectServiceError({
        ownerId,
        items: [{ productId, quantity: 1 }],
        idempotencyKey: '   '
    }, 'INVALID_IDEMPOTENCY_KEY');
});

test('rejects an idempotency key longer than 128 characters', async () => {
    await expectServiceError({
        ownerId,
        items: [{ productId, quantity: 1 }],
        idempotencyKey: 'k'.repeat(129)
    }, 'INVALID_IDEMPOTENCY_KEY');
});

test('rejects an order with no items', async () => {
    await expectServiceError({
        ownerId,
        items: [],
        idempotencyKey: 'test-key-2'
    }, 'INVALID_ORDER_ITEMS');
});

test('rejects an invalid product ID', async () => {
    await expectServiceError({
        ownerId,
        items: [{ productId: 'invalid-id', quantity: 1 }],
        idempotencyKey: 'test-key-3'
    }, 'INVALID_ORDER_ITEM');
});

test('rejects zero, negative, or fractional quantities', async () => {
    for (const quantity of [0, -1, 1.5]) {
        await expectServiceError({
            ownerId,
            items: [{ productId, quantity }],
            idempotencyKey: `quantity-${quantity}`
        }, 'INVALID_ORDER_ITEM');
    }
});

test('rejects duplicate products in the same order', async () => {
    await expectServiceError({
        ownerId,
        items: [
            { productId, quantity: 1 },
            { productId, quantity: 2 }
        ],
        idempotencyKey: 'test-key-4'
    }, 'DUPLICATE_PRODUCT');
});
