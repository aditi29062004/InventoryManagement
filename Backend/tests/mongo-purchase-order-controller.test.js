
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const proxyquire = require('proxyquire');

const OWNER_ID = '507f1f77bcf86cd799439011';

async function withServer(app, run) {
    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
}

function makeApp(controller) {
    const app = express();
    app.use(express.json());

    app.use((req, res, next) => {
        req.user = { _id: OWNER_ID };
        next();
    });

    app.get('/purchase-orders', controller.listPurchaseOrders);
    return app;
}

function makeController({ PurchaseOrder = {} } = {}) {
    return proxyquire(
        '../controllers/mongoPurchaseOrderController',
        {
            '../models/mongo': { PurchaseOrder }
        }
    );
}

test('invalid pagination returns 400 without querying MongoDB', async () => {
    let queryCalled = false;

    const controller = makeController({
        PurchaseOrder: {
            find: () => {
                queryCalled = true;
                throw new Error('Query should not run');
            },
            countDocuments: async () => {
                queryCalled = true;
                return 0;
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(
            `${baseUrl}/purchase-orders?page=0&limit=20`
        );
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'INVALID_PAGINATION');
        assert.equal(queryCalled, false);
    });
});

test('invalid status returns 400 without querying MongoDB', async () => {
    let queryCalled = false;

    const controller = makeController({
        PurchaseOrder: {
            find: () => {
                queryCalled = true;
                throw new Error('Query should not run');
            },
            countDocuments: async () => {
                queryCalled = true;
                return 0;
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(
            `${baseUrl}/purchase-orders?status=unknown`
        );
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_STATUS');
        assert.equal(queryCalled, false);
    });
});

test('listing filters by owner and returns pagination metadata', async () => {
    let queriedFilter;
    let queriedSort;
    let queriedSkip;
    let queriedLimit;

    const expectedOrders = [
        { _id: 'order-1', status: 'pending' }
    ];

    const controller = makeController({
        PurchaseOrder: {
            find: filter => {
                queriedFilter = filter;

                return {
                    sort(value) {
                        queriedSort = value;
                        return this;
                    },
                    skip(value) {
                        queriedSkip = value;
                        return this;
                    },
                    limit(value) {
                        queriedLimit = value;
                        return this;
                    },
                    lean: async () => expectedOrders
                };
            },
            countDocuments: async filter => {
                assert.deepEqual(filter, queriedFilter);
                return 21;
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(
            `${baseUrl}/purchase-orders?page=2&limit=10&status=pending`
        );
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.deepEqual(body.data, expectedOrders);
        assert.deepEqual(body.pagination, {
            page: 2,
            limit: 10,
            total: 21,
            totalPages: 3
        });

        assert.equal(String(queriedFilter.ownerId), OWNER_ID);
        assert.equal(queriedFilter.status, 'pending');
        assert.deepEqual(queriedSort, { createdAt: -1, _id: -1 });
        assert.equal(queriedSkip, 10);
        assert.equal(queriedLimit, 10);
    });
});
