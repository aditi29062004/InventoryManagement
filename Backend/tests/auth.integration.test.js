
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const path = require('node:path');

require('dotenv').config({
    path: path.join(__dirname, '..', '.env')
});

const { connectMongoDB } = require('../config/mongodb');
const authRoutes = require('../routes/authRoutes');

test('authentication integration flow', async () => {
    assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be configured');
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be configured');

    await connectMongoDB();

    const app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRoutes);

    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const { port } = server.address();
        const baseUrl = `http://127.0.0.1:${port}/api/v1/auth`;

        // Register a uniquely named test account.
        const email =
            `auth-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
        const password = 'TestPassword123!';

        const registerResponse = await fetch(`${baseUrl}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Authentication Test User',
                email,
                password
            })
        });

        const registerBody = await registerResponse.json();

        assert.equal(registerResponse.status, 201);
        assert.equal(registerBody.success, true);
        assert.equal(registerBody.data.user.email, email);
        assert.ok(registerBody.data.accessToken);
        assert.equal(
            Object.hasOwn(registerBody.data.user, 'passwordHash'),
            false
        );

        // Log in using the same account.
        const loginResponse = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const loginBody = await loginResponse.json();

        assert.equal(loginResponse.status, 200);
        assert.equal(loginBody.success, true);
        assert.ok(loginBody.data.accessToken);

        // Verify the authenticated user's profile.
        const meResponse = await fetch(`${baseUrl}/me`, {
            headers: {
                Authorization: `Bearer ${loginBody.data.accessToken}`
            }
        });

        const meBody = await meResponse.json();

        assert.equal(meResponse.status, 200);
        assert.equal(meBody.success, true);
        assert.equal(meBody.data.user.email, email);

        // Incorrect passwords must not authenticate.
        const invalidLoginResponse = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password: 'WrongPassword123!'
            })
        });

        assert.equal(invalidLoginResponse.status, 401);
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close((error) => error ? reject(error) : resolve());
            });
        }

        await mongoose.disconnect();
    }
});
