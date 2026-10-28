
process.env.JWT_SECRET = 'test-only-jwt-secret-do-not-use-in-production';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { authenticateToken } = require('../middleware/authMiddleware');

test('protected route rejects requests without an authorization token', async () => {
    const app = express();

    app.get('/protected', authenticateToken, (req, res) => {
        res.status(200).json({ success: true });
    });

    const server = app.listen(0);

    try {
        await new Promise((resolve) => server.once('listening', resolve));

        const { port } = server.address();

        const response = await fetch(`http://127.0.0.1:${port}/protected`);

        assert.equal(response.status, 401);

        const body = await response.json();

        assert.equal(body.success, false);
        assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
});


test('protected route rejects an empty Bearer token', async () => {
    const app = express();

    app.get('/protected', authenticateToken, (req, res) => {
        res.status(200).json({ success: true });
    });

    const server = app.listen(0);

    try {
        await new Promise((resolve) => server.once('listening', resolve));
        const { port } = server.address();

        const response = await fetch(`http://127.0.0.1:${port}/protected`, {
            headers: { Authorization: 'Bearer ' }
        });

        assert.equal(response.status, 401);

        const body = await response.json();
        assert.equal(body.success, false);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});

test('protected route rejects a malformed JWT', async () => {
    const app = express();

    app.get('/protected', authenticateToken, (req, res) => {
        res.status(200).json({ success: true });
    });

    const server = app.listen(0);

    try {
        await new Promise((resolve) => server.once('listening', resolve));
        const { port } = server.address();

        const response = await fetch(`http://127.0.0.1:${port}/protected`, {
            headers: { Authorization: 'Bearer definitely-not-a-valid-jwt' }
        });

        assert.equal(response.status, 401);

        const body = await response.json();
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'INVALID_TOKEN');
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});
