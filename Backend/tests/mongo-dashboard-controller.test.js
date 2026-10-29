
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const proxyquire = require('proxyquire');

const OWNER_ID = '507f1f77bcf86cd799439011';

function createTestApp(Product, Order) {
    const controller = proxyquire(
        '../controllers/mongoDashboardController',
        {
            '../models/mongo': { Product, Order }
        }
    );

    const app = express();

    app.get('/dashboard/summary', (req, res, next) => {
        req.user = { _id: OWNER_ID };
        next();
    }, controller.getDashboardSummary);

    return app;
}

async function withServer(app, callback) {
    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        await callback(
            `http://127.0.0.1:${server.address().port}`
        );
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
}

test('dashboard returns calculated metrics and scopes queries to the owner', async () => {
    let productPipeline;
    const orderPipelines = [];

    const Product = {
        aggregate: async pipeline => {
            productPipeline = pipeline;

            return [{
                activeCount: 3,
                totalUnits: 18,
                lowStockCount: 1,
                inventoryCostValue: 450,
                potentialRetailValue: 700
            }];
        }
    };

    const Order = {
        aggregate: async pipeline => {
            orderPipelines.push(pipeline);

            if (pipeline.some(stage => stage.$group?._id === '$status')) {
                return [
                    { _id: 'pending', count: 2 },
                    { _id: 'completed', count: 3 },
                    { _id: 'cancelled', count: 1 }
                ];
            }

            return [{ revenue: 1250 }];
        },

        find: filter => {
            assert.equal(String(filter.ownerId), OWNER_ID);

            return {
                select: () => ({
                    sort: () => ({
                        limit: () => ({
                            lean: async () => [{
                                orderNumber: 'ORD-001',
                                total: 250,
                                status: 'completed'
                            }]
                        })
                    })
                })
            };
        }
    };

    const app = createTestApp(Product, Order);

    await withServer(app, async baseUrl => {
        const response = await fetch(`${baseUrl}/dashboard/summary`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);

        assert.deepEqual(body.data.products, {
            activeCount: 3,
            totalUnits: 18,
            lowStockCount: 1,
            inventoryCostValue: 450,
            potentialRetailValue: 700
        });

        assert.deepEqual(body.data.orders, {
            pending: 2,
            completed: 3,
            cancelled: 1,
            totalCount: 6,
            salesRevenue: 1250
        });

        assert.equal(body.data.recentOrders.length, 1);
    });

    const productMatch = productPipeline.find(stage => stage.$match);
    assert.equal(String(productMatch.$match.ownerId), OWNER_ID);
    assert.equal(productMatch.$match.status, 'active');
    assert.equal(productMatch.$match.isActive, true);

    assert.equal(orderPipelines.length, 2);

    for (const pipeline of orderPipelines) {
        const match = pipeline.find(stage => stage.$match);
        assert.equal(String(match.$match.ownerId), OWNER_ID);
    }

    const revenueMatch = orderPipelines
        .map(pipeline => pipeline.find(stage => stage.$match)?.$match)
        .find(match => match.status?.$ne === 'cancelled');

    assert.ok(revenueMatch);
});

test('dashboard returns zeros when no products or orders exist', async () => {
    const Product = {
        aggregate: async () => []
    };

    const Order = {
        aggregate: async () => [],
        find: filter => {
            assert.equal(String(filter.ownerId), OWNER_ID);

            return {
                select: () => ({
                    sort: () => ({
                        limit: () => ({
                            lean: async () => []
                        })
                    })
                })
            };
        }
    };

    const app = createTestApp(Product, Order);

    await withServer(app, async baseUrl => {
        const response = await fetch(`${baseUrl}/dashboard/summary`);
        const body = await response.json();

        assert.equal(response.status, 200);

        assert.deepEqual(body.data.products, {
            activeCount: 0,
            totalUnits: 0,
            lowStockCount: 0,
            inventoryCostValue: 0,
            potentialRetailValue: 0
        });

        assert.deepEqual(body.data.orders, {
            pending: 0,
            completed: 0,
            cancelled: 0,
            totalCount: 0,
            salesRevenue: 0
        });

        assert.deepEqual(body.data.recentOrders, []);
    });
});

test('dashboard returns a safe error when a database query fails', async () => {
    const Product = {
        aggregate: async () => {
            throw new Error('Simulated database failure');
        }
    };

    const Order = {
        aggregate: async () => [],
        find: filter => {
            assert.equal(String(filter.ownerId), OWNER_ID);

            return {
                select: () => ({
                    sort: () => ({
                        limit: () => ({
                            lean: async () => []
                        })
                    })
                })
            };
        }
    };

    const app = createTestApp(Product, Order);

    await withServer(app, async baseUrl => {
        const response = await fetch(`${baseUrl}/dashboard/summary`);
        const body = await response.json();

        assert.equal(response.status, 500);
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'DASHBOARD_SUMMARY_FAILED');
        assert.equal(body.error.message, 'Failed to load dashboard summary');
    });
});
