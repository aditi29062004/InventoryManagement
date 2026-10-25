
const mongoose = require('mongoose');

const connectMongoDB = async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error(
            'MONGODB_URI is missing. Check your Backend/.env file.'
        );
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000
        });

        console.log(
            `MongoDB connected successfully: ${mongoose.connection.name}`
        );
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        throw error;
    }
};

module.exports = { connectMongoDB };
