const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const proxyquire = require('proxyquire');

const OWNER_ID = '507f1f77bcf86cd799439011';

class MockOrderServiceError extends Error {
    constructor(statusCode, code, message) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const ORDER_ID = '507f1f77bcf86cd799439012';

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

    app.get('/orders', controller.listOrders);
    app.get('/orders/:id', controller.getOrderById);
    app.post('/orders', controller.createOrder);
    app.post('/orders/:id/complete', controller.completeOrder);
    app.post('/orders/:id/cancel', controller.cancelOrder);

    return app;
}

function makeController({ Order = {}, service = {} } = {}) {
    return proxyquire('../controllers/mongoOrderController', {
        '../models/mongo': { Order },
        '../services/mongoOrderService': {
            createMongoOrder: service.createMongoOrder || (async () => {
                throw new Error('Unexpected createMongoOrder call');
            }),
            completeMongoOrder: service.completeMongoOrder || (async () => {
                throw new Error('Unexpected completeMongoOrder call');
            }),
            cancelMongoOrder: service.cancelMongoOrder || (async () => {
                throw new Error('Unexpected cancelMongoOrder call');
            }),
            OrderServiceError: MockOrderServiceError
        }
    });
}

test('invalid order ID returns 400 without querying MongoDB', async () => {
    let queryCalled = false;

    const controller = makeController({
        Order: {
            findOne: () => {
                queryCalled = true;
                throw new Error('Should not query with an invalid ID');
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(`${baseUrl}/orders/not-an-id`);
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'INVALID_ORDER_ID');
        assert.equal(queryCalled, false);
    });
});

test('getting another user’s order returns 404 and scopes query by owner', async () => {
    let queriedFilter;

    const controller = makeController({
        Order: {
            findOne: filter => {
                queriedFilter = filter;
                return { lean: async () => null };
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(`${baseUrl}/orders/${ORDER_ID}`);
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(body.error.code, 'ORDER_NOT_FOUND');
        assert.equal(String(queriedFilter.ownerId), OWNER_ID);
        assert.equal(String(queriedFilter._id), ORDER_ID);
    });
});

test('invalid pagination returns 400 without querying MongoDB', async () => {
    let queryCalled = false;

    const controller = makeController({
        Order: {
            find: () => {
                queryCalled = true;
                throw new Error('Should not query with invalid pagination');
            },
            countDocuments: async () => {
                queryCalled = true;
                return 0;
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(`${baseUrl}/orders?page=0&limit=20`);
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_PAGINATION');
        assert.equal(queryCalled, false);
    });
});

test('invalid status filter returns 400 without querying MongoDB', async () => {
    let queryCalled = false;

    const controller = makeController({
        Order: {
            find: () => {
                queryCalled = true;
                throw new Error('Should not query with invalid status');
            },
            countDocuments: async () => {
                queryCalled = true;
                return 0;
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(`${baseUrl}/orders?status=unknown`);
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_STATUS');
        assert.equal(queryCalled, false);
    });
});

test('creating an order passes the authenticated owner and idempotency key to the service', async () => {
    let serviceInput;

    const controller = makeController({
        service: {
            createMongoOrder: async input => {
                serviceInput = input;
                return {
                    replayed: false,
                    order: { _id: ORDER_ID, status: 'pending' }
                };
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(`${baseUrl}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': 'controller-test-key'
            },
            body: JSON.stringify({
                ownerId: '507f1f77bcf86cd799439099',
                items: [{ productId: ORDER_ID, quantity: 1 }]
            })
        });

        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.success, true);
        assert.equal(body.replayed, false);
        assert.equal(String(serviceInput.ownerId), OWNER_ID);
        assert.equal(serviceInput.idempotencyKey, 'controller-test-key');
        assert.equal(serviceInput.items.length, 1);
    });
});

test('missing idempotency key returns 400', async () => {
    let serviceCalled = false;

    const controller = makeController({
        service: {
            createMongoOrder: async () => {
                serviceCalled = true;
                throw new Error('Service should reject the missing key');
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(`${baseUrl}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: [{ productId: ORDER_ID, quantity: 1 }]
            })
        });

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_IDEMPOTENCY_KEY');
        assert.equal(serviceCalled, false);
    });
});

test('service transition errors are returned with their status and code', async () => {
    const controller = makeController({
        service: {
            cancelMongoOrder: async () => {
                throw new MockOrderServiceError(
                    409,
                    'INVALID_ORDER_TRANSITION',
                    'Cannot cancel a completed order'
                );
            }
        }
    });

    await withServer(makeApp(controller), async baseUrl => {
        const response = await fetch(`${baseUrl}/orders/${ORDER_ID}/cancel`, {
            method: 'POST'
        });
        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(body.error.code, 'INVALID_ORDER_TRANSITION');
    });
});
