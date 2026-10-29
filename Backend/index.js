const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// Import database connection
const { sequelize } = require('./config/database');

// Import routes
const productRoutes = require('./routes/productRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const mongoSupplierRoutes = require('./routes/mongoSupplierRoutes');
const mongoProductRoutes = require('./routes/mongoProductRoutes');
const mongoOrderRoutes = require('./routes/mongoOrderRoutes');
const mongoPurchaseOrderRoutes = require('./routes/mongoPurchaseOrderRoutes');
const orderRoutes = require('./routes/orderRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const mongoDashboardRoutes = require('./routes/mongoDashboardRoutes');
const mongoAnalyticsRoutes = require('./routes/mongoAnalyticsRoutes');

const authRoutes = require('./routes/authRoutes');
const { connectMongoDB } = require('./config/mongodb');

// Import models to initialize associations
require('./models');

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
    origin: process.env.NODE_ENV === 'production' ? 
        ['https://your-domain.com'] : 
        [
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

// Serve static files from the root directory (for frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
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
app.use('/api/suppliers', supplierRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/purchase-orders', purchaseRoutes);
app.use('/api/v1/dashboard', mongoDashboardRoutes);
app.use('/api/v1/analytics', mongoAnalyticsRoutes);
// Analytics endpoint
app.get('/api/analytics', async (req, res) => {
    try {
        const { Product, Order, OrderItem, Supplier } = require('./models');
        
        // Get total products
        const totalProducts = await Product.count();
        
        // Get low stock products
        const lowStockProducts = await Product.count({
            where: sequelize.where(
                sequelize.col('stock'),
                '<=',
                sequelize.col('min_stock')
            )
        });
        
        // Get total suppliers
        const totalSuppliers = await Supplier.count();
        
        // Get pending orders
        const pendingOrders = await Order.count({
            where: { status: 'pending' }
        });
        
        // Get completed orders
        const completedOrders = await Order.findAll({
            where: { status: 'completed' },
            include: [{
                model: OrderItem,
                include: [Product]
            }]
        });
        
        // Calculate revenue and analytics
        let totalRevenue = 0;
        let totalOrdersCount = completedOrders.length;
        
        completedOrders.forEach(order => {
            totalRevenue += parseFloat(order.total);
        });
        
        const avgOrderValue = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;
        
        // Calculate inventory value
        const products = await Product.findAll();
        const inventoryValue = products.reduce((sum, product) => {
            return sum + (product.stock * product.cost);
        }, 0);
        
        // Product performance analytics
        const productAnalytics = await Product.findAll({
            include: [{
                model: OrderItem,
                include: [{
                    model: Order,
                    where: { status: 'completed' },
                    required: false
                }],
                required: false
            }]
        });
        
        const productPerformance = productAnalytics.map(product => {
            const completedOrderItems = product.OrderItems.filter(item => 
                item.Order && item.Order.status === 'completed'
            );
            
            const unitsSold = completedOrderItems.reduce((sum, item) => sum + item.quantity, 0);
            const revenue = completedOrderItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            const profit = completedOrderItems.reduce((sum, item) => 
                sum + (item.quantity * (item.price - product.cost)), 0
            );
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
            
            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                unitsSold,
                revenue,
                profit,
                margin
            };
        }).sort((a, b) => b.revenue - a.revenue);
        
        res.json({
            dashboardStats: {
                totalProducts,
                lowStockProducts,
                totalSuppliers,
                pendingOrders,
                totalRevenue: totalRevenue.toFixed(2),
                totalOrdersCount,
                avgOrderValue: avgOrderValue.toFixed(2),
                inventoryValue: inventoryValue.toFixed(2)
            },
            productPerformance: productPerformance.slice(0, 10), // Top 10 products
            topProducts: productPerformance.slice(0, 5) // Top 5 for dashboard
        });
        
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch analytics data',
            message: error.message
        });
    }
});

// Get low stock alerts
app.get('/api/low-stock', async (req, res) => {
    try {
        const { Product, Supplier } = require('./models');
        
        const lowStockProducts = await Product.findAll({
            where: sequelize.where(
                sequelize.col('stock'),
                '<=',
                sequelize.col('min_stock')
            ),
            include: [{
                model: Supplier,
                required: false
            }],
            order: [['stock', 'ASC']]
        });
        
        res.json(lowStockProducts);
        
    } catch (error) {
        console.error('Low stock error:', error);
        res.status(500).json({
            error: 'Failed to fetch low stock products',
            message: error.message
        });
    }
});

// Get recent orders for dashboard
app.get('/api/recent-orders', async (req, res) => {
    try {
        const { Order, OrderItem, Product } = require('./models');
        
        const recentOrders = await Order.findAll({
            limit: 5,
            order: [['created_at', 'DESC']],
            include: [{
                model: OrderItem,
                include: [Product],
                required: false
            }]
        });
        
        res.json(recentOrders);
        
    } catch (error) {
        console.error('Recent orders error:', error);
        res.status(500).json({
            error: 'Failed to fetch recent orders',
            message: error.message
        });
    }
});

// Bulk operations endpoint
app.post('/api/bulk-operations', async (req, res) => {
    const { operation, data } = req.body;
    
    try {
        switch (operation) {
            case 'import-products':
                const { Product } = require('./models');
                const results = await Product.bulkCreate(data, {
                    validate: true,
                    ignoreDuplicates: true
                });
                res.json({
                    message: `Successfully imported ${results.length} products`,
                    imported: results.length
                });
                break;
                
            case 'update-stock':
                const { Product: ProductModel } = require('./models');
                const updatePromises = data.map(item => 
                    ProductModel.update(
                        { stock: item.stock },
                        { where: { id: item.id } }
                    )
                );
                await Promise.all(updatePromises);
                res.json({
                    message: `Successfully updated stock for ${data.length} products`
                });
                break;
                
            default:
                res.status(400).json({ error: 'Invalid bulk operation' });
        }
    } catch (error) {
        console.error('Bulk operation error:', error);
        res.status(500).json({
            error: 'Bulk operation failed',
            message: error.message
        });
    }
});

// Serve the main frontend file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Handle all other routes by serving the frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handling middleware
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    // Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
            error: 'Validation error',
            details: error.errors.map(err => ({
                field: err.path,
                message: err.message
            }))
        });
    }
    
    // Sequelize unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
            error: 'Duplicate entry',
            field: error.errors[0]?.path,
            message: 'This value already exists'
        });
    }
    
    // Foreign key constraint errors
    if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({
            error: 'Invalid reference',
            message: 'Referenced record does not exist'
        });
    }
    
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
        // Test existing SQLite database connection
        await sequelize.authenticate();
        console.log('SQLite database connection established successfully');

        // Connect MongoDB for authentication and new application data
        await connectMongoDB();
        console.log('MongoDB connection established successfully');

        // Sync existing SQLite models without destructive changes
        // Sync database models
        await sequelize.sync({ 
           force: false,
           alter: false
        });
        console.log('Database models synchronized');
        
        // Start the server
       const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Dashboard: http://localhost:${PORT}`);
            console.log(`API Base URL: http://localhost:${PORT}/api`);
            console.log(`Health Check: http://localhost:${PORT}/health`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
        
       // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.close(() => {
                console.log('HTTP server closed');
                sequelize.close().then(() => {
                    console.log('Database connection closed');
                    process.exit(0);
                });
            });
        });

        process.on('SIGINT', () => {
            console.log('SIGINT received, shutting down gracefully');
            server.close(() => {
                console.log('HTTP server closed');
                sequelize.close().then(() => {
                    console.log('Database connection closed');
                    process.exit(0);
                });
            });
        });

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

app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({
      status: 'OK',
      db: 'Connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      db: 'Disconnected',
      error: err.message
    });
  }
});


// Start the server only when this file is run directly.
if (require.main === module) {
    startServer();
}

module.exports = app;