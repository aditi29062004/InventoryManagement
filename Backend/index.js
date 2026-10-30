const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const mongoose = require('mongoose');
require('dotenv').config();

// Import routes
const mongoSupplierRoutes = require('./routes/mongoSupplierRoutes');
const mongoProductRoutes = require('./routes/mongoProductRoutes');
const mongoOrderRoutes = require('./routes/mongoOrderRoutes');
const mongoPurchaseOrderRoutes = require('./routes/mongoPurchaseOrderRoutes');
const mongoDashboardRoutes = require('./routes/mongoDashboardRoutes');
const mongoAnalyticsRoutes = require('./routes/mongoAnalyticsRoutes');

const authRoutes = require('./routes/authRoutes');
const { connectMongoDB } = require('./config/mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined'));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
        : [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5500',
            'http://localhost:5173',
            'http://127.0.0.1:5173'
        ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Idempotency-Key']
}));


// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', async (req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;

    return res.status(mongoConnected ? 200 : 503).json({
        status: mongoConnected ? 'OK' : 'ERROR',
        db: {
            mongodb: mongoConnected ? 'Connected' : 'Disconnected'
        },
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/suppliers', mongoSupplierRoutes);
app.use('/api/v1/products', mongoProductRoutes);
app.use('/api/v1/orders', mongoOrderRoutes);
app.use('/api/v1/purchase-orders', mongoPurchaseOrderRoutes);
app.use('/api/v1/dashboard', mongoDashboardRoutes);
app.use('/api/v1/analytics', mongoAnalyticsRoutes);

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Global error handling middleware
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    // Default error response
    res.status(error.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 
            'Internal server error' : error.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
});

// Database connection and server startup
async function startServer() {
    try {
        // Connect MongoDB for authentication and new application data
        await connectMongoDB();
        console.log('MongoDB connection established successfully');
        
        // Start the server
       const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Dashboard: http://localhost:${PORT}`);
            console.log(`API Base URL: http://localhost:${PORT}/api/v1`);
            console.log(`Health Check: http://localhost:${PORT}/health`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
        
        // Graceful shutdown
        let isShuttingDown = false;

        const shutdown = (signal) => {
            if (isShuttingDown) {
                return;
            }

            isShuttingDown = true;
            console.log(`${signal} received, shutting down gracefully`);

            server.close(async (serverError) => {
                if (serverError) {
                    console.error('Error closing HTTP server:', serverError);
                    process.exitCode = 1;
                } else {
                    console.log('HTTP server closed');
                }

                try {
                    await mongoose.disconnect();
                    console.log('MongoDB connection closed');
                } catch (error) {
                    console.error('Error closing database connections:', error);
                    process.exitCode = 1;
                }
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        } catch (error) {
            console.error('Unable to start server:', error);
            process.exit(1);
        }
}

    /// Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });

// Start the server only when this file is run directly.
if (require.main === module) {
    startServer();
}

module.exports = app;