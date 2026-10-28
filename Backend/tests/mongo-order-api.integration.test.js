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
    Order,
    StockMovement
} = require('../models/mongo');

const mongoOrderRoutes = require('../routes/mongoOrderRoutes');

test('Mongo order API enforces authentication and safe stock transitions', async () => {
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

        const owner = await User.create({
            name: 'Phase 2.3 API Test Owner',
            email: `phase23-api-owner-${suffix}@example.com`,
            passwordHash: 'test-only-hash'
        });
        ownerIds.push(owner._id);

        const otherOwner = await User.create({
            name: 'Phase 2.3 API Other Owner',
            email: `phase23-api-other-${suffix}@example.com`,
            passwordHash: 'test-only-hash'
        });
        ownerIds.push(otherOwner._id);

        const product = await Product.create({
            ownerId: owner._id,
            name: 'Phase 2.3 API Test Product',
            sku: `P23API-${suffix.slice(0, 12)}`,
            price: 25,
            costPrice: 10,
            stockQuantity: 10
        });
        productIds.push(product._id);

        const app = express();
        app.use(express.json());
        app.use('/api/v1/orders', mongoOrderRoutes);

        server = await new Promise((resolve, reject) => {
            const listener = app.listen(0, '127.0.0.1', () => {
                resolve(listener);
            });
            listener.once('error', reject);
        });

        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}/api/v1/orders`;

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

        async function api(path = '', options = {}) {
            const response = await fetch(`${baseUrl}${path}`, {
                ...options,
                headers: {
                    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                    ...(options.headers || {})
                }
            });

            return {
                status: response.status,
                body: await response.json()
            };
        }

        // Requests without a valid Bearer token must be rejected.
        const unauthenticated = await api();
        assert.equal(unauthenticated.status, 401);

        const orderBody = {
            items: [{ productId: String(product._id), quantity: 2 }],
            customerName: 'API Integration Test'
        };
        const idempotencyKey = `p23-api-sale-${suffix}`;

        const created = await api('', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ownerToken}`,
                'Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify(orderBody)
        });

        assert.equal(created.status, 201);
        assert.equal(created.body.success, true);
        assert.equal(created.body.replayed, false);
        assert.equal(created.body.data.status, 'pending');

        const orderId = created.body.data._id;
        assert.ok(orderId);

        let savedProduct = await Product.findById(product._id);
        assert.equal(savedProduct.stockQuantity, 8);

        // Retrying with the same key must not deduct stock twice.
        const replay = await api('', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ownerToken}`,
                'Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify(orderBody)
        });

        assert.equal(replay.status, 200);
        assert.equal(replay.body.replayed, true);
        assert.equal(replay.body.data._id, orderId);

        savedProduct = await Product.findById(product._id);
        assert.equal(savedProduct.stockQuantity, 8);

        // The owner can retrieve the order; another user cannot.
        const retrieved = await api(`/${orderId}`, {
            headers: { Authorization: `Bearer ${ownerToken}` }
        });
        assert.equal(retrieved.status, 200);
        assert.equal(retrieved.body.data._id, orderId);

        const foreignRead = await api(`/${orderId}`, {
            headers: { Authorization: `Bearer ${otherToken}` }
        });
        assert.equal(foreignRead.status, 404);

        // Completing an order must not deduct stock again.
        const completed = await api(`/${orderId}/complete`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${ownerToken}` }
        });
        assert.equal(completed.status, 200);
        assert.equal(completed.body.data.status, 'completed');

        savedProduct = await Product.findById(product._id);
        assert.equal(savedProduct.stockQuantity, 8);

        // A second order checks cancellation and stock restoration.
        const secondCreated = await api('', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ownerToken}`,
                'Idempotency-Key': `p23-api-cancel-${suffix}`
            },
            body: JSON.stringify({
                items: [{ productId: String(product._id), quantity: 1 }]
            })
        });

        assert.equal(secondCreated.status, 201);
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            7
        );

        const secondOrderId = secondCreated.body.data._id;

        const cancelled = await api(`/${secondOrderId}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${ownerToken}` }
        });

        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.body.data.status, 'cancelled');
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            8
        );

        // Repeated cancellation must fail without restoring stock again.
        const repeatedCancel = await api(`/${secondOrderId}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${ownerToken}` }
        });

        assert.equal(repeatedCancel.status, 409);
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            8
        );

        const list = await api('', {
            headers: { Authorization: `Bearer ${ownerToken}` }
        });
        assert.equal(list.status, 200);
        assert.equal(list.body.pagination.total, 2);

        const movements = await StockMovement.find({
            ownerId: owner._id
        });
        assert.equal(movements.length, 3);

        console.log('Order API integration checks passed:', JSON.stringify({
            authenticationRequired: true,
            orderCreated: true,
            duplicateRequestDidNotRedeductStock: true,
            crossUserReadRejected: true,
            completionDidNotRedeductStock: true,
            cancellationRestoredStockOnce: true,
            stockMovementCount: movements.length
        }, null, 2));
    } finally {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }

        if (connected) {
            if (ownerIds.length) {
                await Order.deleteMany({
                    ownerId: { $in: ownerIds }
                }).catch(() => {});

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
