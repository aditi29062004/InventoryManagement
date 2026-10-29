
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const proxyquire = require('proxyquire');

const OWNER_ID = '507f1f77bcf86cd799439011';

function createTestApp(Product, Order, Supplier) {
    const controller = proxyquire(
        '../controllers/mongoAnalyticsController',
        {
            '../models/mongo': { Product, Order, Supplier }
        }
    );

    const app = express();

    app.get('/analytics/summary', (req, res, next) => {
        req.user = { _id: OWNER_ID };
        next();
    }, controller.getAnalyticsSummary);

    return app;
}

async function withServer(app, callback) {
    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        await callback(`http://127.0.0.1:${server.address().port}`);
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
}

test('analytics returns inventory, sales, product and category metrics scoped to owner', async () => {
    const productPipelines = [];
    const orderPipelines = [];
    let supplierFilter;

    const Product = {
        aggregate: async pipeline => {
            productPipelines.push(pipeline);

            if (pipeline.some(stage => stage.$group?._id?.$ifNull)) {
                return [{
                    category: 'Electronics',
                    productCount: 2,
                    totalUnits: 12,
                    inventoryCostValue: 600
                }];
            }

            return [{
                activeProducts: 2,
                totalUnits: 12,
                lowStockProducts: 1,
                inventoryCostValue: 600,
                potentialRetailValue: 900
            }];
        }
    };

    const Order = {
        aggregate: async pipeline => {
            orderPipelines.push(pipeline);

            if (pipeline.some(stage => stage.$unwind === '$items')) {
                return [{
                    productId: '507f1f77bcf86cd799439012',
                    productName: 'Keyboard',
                    sku: 'KEY-001',
                    unitsSold: 4,
                    revenue: 200
                }];
            }

            if (pipeline.some(stage => stage.$group?._id === null)) {
                return [{
                    totalOrders: 5,
                    pendingOrders: 1,
                    completedOrders: 3,
                    cancelledOrders: 1,
                    completedRevenue: 750,
                    averageOrderValue: 250
                }];
            }

            return [];
        }
    };

    const Supplier = {
        countDocuments: async filter => {
            supplierFilter = filter;
            return 2;
        }
    };

    const app = createTestApp(Product, Order, Supplier);

    await withServer(app, async baseUrl => {
        const response = await fetch(`${baseUrl}/analytics/summary`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.inventory.activeProducts, 2);
        assert.equal(body.data.inventory.totalUnits, 12);
        assert.equal(body.data.sales.completedRevenue, 750);
        assert.equal(body.data.sales.averageOrderValue, 250);
        assert.equal(body.data.supplierCount, 2);
        assert.equal(body.data.productPerformance[0].unitsSold, 4);
        assert.equal(body.data.categoryBreakdown[0].category, 'Electronics');
    });

    for (const pipeline of productPipelines) {
        const match = pipeline.find(stage => stage.$match);
        assert.equal(String(match.$match.ownerId), OWNER_ID);
        assert.equal(match.$match.status, 'active');
        assert.equal(match.$match.isActive, true);
    }

    for (const pipeline of orderPipelines) {
        const match = pipeline.find(stage => stage.$match);
        assert.equal(String(match.$match.ownerId), OWNER_ID);
    }

    assert.deepEqual(supplierFilter, {
        ownerId: OWNER_ID,
        isActive: true,
        status: 'active'
    });
});

test('analytics returns zero values when no inventory, orders or suppliers exist', async () => {
    const Product = {
        aggregate: async () => []
    };

    const Order = {
        aggregate: async () => []
    };

    const Supplier = {
        countDocuments: async () => 0
    };

    const app = createTestApp(Product, Order, Supplier);

    await withServer(app, async baseUrl => {
        const response = await fetch(`${baseUrl}/analytics/summary`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);

        assert.deepEqual(body.data.inventory, {
            activeProducts: 0,
            totalUnits: 0,
            lowStockProducts: 0,
            inventoryCostValue: 0,
            potentialRetailValue: 0
        });

        assert.deepEqual(body.data.sales, {
            totalOrders: 0,
            pendingOrders: 0,
            completedOrders: 0,
            cancelledOrders: 0,
            completedRevenue: 0,
            averageOrderValue: 0
        });

        assert.equal(body.data.supplierCount, 0);
        assert.deepEqual(body.data.productPerformance, []);
        assert.deepEqual(body.data.categoryBreakdown, []);
    });
});

test('analytics returns a safe error when a database query fails', async () => {
    const Product = {
        aggregate: async () => {
            throw new Error('Simulated database failure');
        }
    };

    const Order = {
        aggregate: async () => []
    };

    const Supplier = {
        countDocuments: async () => 0
    };

    const app = createTestApp(Product, Order, Supplier);

    await withServer(app, async baseUrl => {
        const response = await fetch(`${baseUrl}/analytics/summary`);
        const body = await response.json();

        assert.equal(response.status, 500);
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'ANALYTICS_SUMMARY_FAILED');
        assert.equal(
            body.error.message,
            'Failed to load analytics summary'
        );
    });
});