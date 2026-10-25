
require('dotenv').config();

const mongoose = require('mongoose');
const { connectMongoDB } = require('../config/mongodb');
const models = require('../models/mongo');

async function initializeIndexes() {
    try {
        await connectMongoDB();

        for (const [name, Model] of Object.entries(models)) {
            await Model.createIndexes();
            console.log(`Indexes created/verified: ${name}`);
        }

        console.log('All MongoDB model indexes initialized successfully.');
    } catch (error) {
        console.error('MongoDB index initialization failed:', error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

initializeIndexes();
