require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');
const { randomUUID } = require('node:crypto');

const {
    User,
    Product,
    StockMovement
} = require('../models/mongo');

const mongoProductRoutes =
    require('../routes/mongoProductRoutes');

test('Mongo stock adjustment API updates stock safely and records audit movements', async () => {
    assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be configured');
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be configured');

    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/inventory_management_phase23_test';

    const ownerIds = [];
    const productIds = [];

    let connected = false;
    let server;

    try {
        await mongoose.connect(uri.toString(), {
            serverSelectionTimeoutMS: 10000
        });

        connected = true;

        const suffix = randomUUID();

        // Create two independent test users.
        const owner = await User.create({
            name: 'Stock Adjustment Test Owner',
            email: `stock-adjustment-${suffix}@example.com`,
            passwordHash: 'test-only-hash'
        });
        ownerIds.push(owner._id);

        const otherOwner = await User.create({
            name: 'Stock Adjustment Other Owner',
            email: `stock-adjustment-other-${suffix}@example.com`,
            passwordHash: 'test-only-hash'
        });
        ownerIds.push(otherOwner._id);

        // Create one product for each user.
        const product = await Product.create({
            ownerId: owner._id,
            name: 'Stock Adjustment Test Product',
            sku: `SA-${suffix.slice(0, 12)}`,
            price: 100,
            costPrice: 50,
            stockQuantity: 5
        });
        productIds.push(product._id);

        const foreignProduct = await Product.create({
            ownerId: otherOwner._id,
            name: 'Foreign Stock Adjustment Product',
            sku: `SAF-${suffix.slice(0, 12)}`,
            price: 100,
            costPrice: 50,
            stockQuantity: 8
        });
        productIds.push(foreignProduct._id);

        // Mount the actual authenticated product routes.
        const app = express();
        app.use(express.json());
        app.use('/api/v1/products', mongoProductRoutes);

        server = await new Promise((resolve, reject) => {
            const listener = app.listen(0, '127.0.0.1', () => {
                resolve(listener);
            });

            listener.once('error', reject);
        });

        const address = server.address();
        const baseUrl =
            `http://127.0.0.1:${address.port}/api/v1/products`;

        // Generate real authentication tokens.
        const ownerToken = jwt.sign(
            { sub: String(owner._id) },
            process.env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '5m' }
        );

        const otherToken = jwt.sign(
            { sub: String(otherOwner._id) },
            process.env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '5m' }
        );

        // Reusable HTTP helper.
        async function api(productId, options = {}) {
            const response = await fetch(
                `${baseUrl}/${productId}/stock`,
                {
                    ...options,
                    headers: {
                        ...(options.body
                            ? { 'Content-Type': 'application/json' }
                            : {}),
                        ...(options.headers || {})
                    }
                }
            );

            return {
                status: response.status,
                body: await response.json()
            };
        }

        // 1. Unauthenticated requests must be rejected.
const unauthenticated = await api(String(product._id), {
    method: 'PATCH',
    headers: {
        'Idempotency-Key': `stock-unauth-${suffix}`
    },
    body: JSON.stringify({
        stockQuantity: 10,
        reason: 'Physical stock count'
    })
});

assert.equal(unauthenticated.status, 401);

    // 2. A valid adjustment must update stock and create an audit movement.
    const adjustmentKey = `stock-adjust-${suffix}`;

    const adjusted = await api(String(product._id), {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${ownerToken}`,
            'Idempotency-Key': adjustmentKey
        },
        body: JSON.stringify({
            stockQuantity: 10,
            reason: 'Physical stock count'
        })
    });

    let updatedProduct;
    let movements;
    // 3. Identical retry must not adjust stock or create another movement.
    const retry = await api(String(product._id), {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${ownerToken}`,
            'Idempotency-Key': adjustmentKey
        },
        body: JSON.stringify({
            stockQuantity: 10,
            reason: 'Physical stock count'
        })
    });

    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);

    updatedProduct = await Product.findById(product._id);
    assert.equal(updatedProduct.stockQuantity, 10);

    movements = await StockMovement.find({
        ownerId: owner._id,
        productId: product._id,
        type: 'adjustment'
    });
    assert.equal(movements.length, 1);

    // 4. Reusing the key for a different adjustment must return 409.
    const conflictingRetry = await api(String(product._id), {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${ownerToken}`,
            'Idempotency-Key': adjustmentKey
        },
        body: JSON.stringify({
            stockQuantity: 15,
            reason: 'Different stock count'
        })
    });

    assert.equal(conflictingRetry.status, 409);
    assert.equal(
        conflictingRetry.body.error.code,
        'IDEMPOTENCY_KEY_REUSED'
    );

    // 5. Another user must not adjust the owner's product.
    const foreignAccess = await api(String(product._id), {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${otherToken}`,
            'Idempotency-Key': `foreign-adjust-${suffix}`
        },
        body: JSON.stringify({
            stockQuantity: 20,
            reason: 'Foreign adjustment attempt'
        })
    });

    assert.equal(foreignAccess.status, 404);
    updatedProduct = await Product.findById(product._id);
    assert.equal(updatedProduct.stockQuantity, 10);

    assert.equal(adjusted.status, 200);
    assert.equal(adjusted.body.success, true);
    assert.equal(adjusted.body.replayed, false);

    assert.equal(adjusted.body.data.type, 'adjustment');
    assert.equal(adjusted.body.data.quantityBefore, 5);
    assert.equal(adjusted.body.data.quantityChange, 5);
    assert.equal(adjusted.body.data.quantityAfter, 10);
    assert.equal(adjusted.body.data.reason, 'Physical stock count');

    // Verify the actual persisted product.
    updatedProduct = await Product.findById(product._id);

    assert.equal(updatedProduct.stockQuantity, 10);

    // Verify the persisted audit movement.
    movements = await StockMovement.find({
        ownerId: owner._id,
        productId: product._id,
        type: 'adjustment'
    });

    assert.equal(movements.length, 1);
    assert.equal(movements[0].quantityChange, 5);
    assert.equal(movements[0].quantityBefore, 5);
    assert.equal(movements[0].quantityAfter, 10);

    } finally {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }

        if (connected) {
            if (ownerIds.length) {
                await StockMovement.deleteMany({
                    ownerId: { $in: ownerIds }
                }).catch(() => {});
            }

            if (productIds.length) {
                await Product.deleteMany({
                    _id: { $in: productIds }
                }).catch(() => {});
            }

            if (ownerIds.length) {
                await User.deleteMany({
                    _id: { $in: ownerIds }
                }).catch(() => {});
            }
        }

        await mongoose.disconnect().catch(() => {});
    }
});