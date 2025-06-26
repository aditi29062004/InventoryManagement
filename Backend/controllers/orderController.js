const { Order, OrderItem, Product, Supplier } = require('../models');
const { Op } = require('sequelize');

// Get all orders with their items and product details
const getAllOrders = async (req, res) => {
    try {
        const orders = await Order.findAll({
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'price']
                        }
                    ]
                }
            ],
            order: [['created_at', 'DESC']]
        });

        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
};

// Get single order by ID
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const order = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'price', 'category']
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
            error: error.message
        });
    }
};

// Create new order
const createOrder = async (req, res) => {
   const { sequelize } = require('../models');
   const transaction = await sequelize.transaction();

    
    try {
        const { customer_name, customer_email, items } = req.body;

        // Validation
        if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Customer name and items are required'
            });
        }

        // Validate and check stock for all items
        let totalAmount = 0;
        const validatedItems = [];

        for (const item of items) {
            const { product_id, quantity, price } = item;
            
            if (!product_id || !quantity || quantity <= 0 || !price || price <= 0) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Invalid item data provided'
                });
            }

            const product = await Product.findByPk(product_id, { transaction });
            if (!product) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: `Product with ID ${product_id} not found`
                });
            }

            if (product.stock < quantity) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${quantity}`
                });
            }

            validatedItems.push({
                product,
                product_id,
                quantity,
                price: parseFloat(price)
            });

            totalAmount += quantity * parseFloat(price);
        }

        // Create order
        const order = await Order.create({
            customer_name,
            customer_email,
            status: 'pending',
            total: totalAmount
        }, { transaction });

        // Create order items and update product stock
        for (const item of validatedItems) {
            await OrderItem.create({
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
                price: item.price
            }, { transaction });

            // Update product stock
            await item.product.update({
                stock: item.product.stock - item.quantity
            }, { transaction });
        }

        await transaction.commit();

        // Fetch the created order with items
        const createdOrder = await Order.findByPk(order.id, {
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'price']
                        }
                    ]
                }
            ]
        });

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: createdOrder
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error.message
        });
    }
};

// Update order status
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'];
        
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Valid status is required',
                validStatuses
            });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // If canceling order, restore stock
        if (status === 'cancelled' && order.status !== 'cancelled') {
            const transaction = await require('../models').sequelize.transaction();
            
            try {
                const orderItems = await OrderItem.findAll({
                    where: { order_id: id },
                    include: [{ model: Product, as: 'product' }],
                    transaction
                });

                // Restore stock for each item
                for (const item of orderItems) {
                    await item.product.update({
                        stock: item.product.stock + item.quantity
                    }, { transaction });
                }

                await order.update({ status }, { transaction });
                await transaction.commit();
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } else {
            await order.update({ status });
        }

        const updatedOrder = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'price']
                        }
                    ]
                }
            ]
        });

        res.json({
            success: true,
            message: `Order ${status} successfully`,
            data: updatedOrder
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status',
            error: error.message
        });
    }
};

// Delete order
const deleteOrder = async (req, res) => {
    const transaction = await require('../models').sequelize.transaction();
    
    try {
        const { id } = req.params;
        
        const order = await Order.findByPk(id, { transaction });
        if (!order) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // If order is not cancelled, restore stock before deletion
        if (order.status !== 'cancelled') {
            const orderItems = await OrderItem.findAll({
                where: { order_id: id },
                include: [{ model: Product, as: 'product' }],
                transaction
            });

            // Restore stock for each item
            for (const item of orderItems) {
                await item.product.update({
                    stock: item.product.stock + item.quantity
                }, { transaction });
            }
        }

        // Delete order items first (due to foreign key constraint)
        await OrderItem.destroy({
            where: { order_id: id },
            transaction
        });

        // Delete order
        await order.destroy({ transaction });

        await transaction.commit();

        res.json({
            success: true,
            message: 'Order deleted successfully'
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete order',
            error: error.message
        });
    }
};

// Get orders analytics/statistics
const getOrdersAnalytics = async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        
        let whereClause = {};
        
        if (startDate && endDate) {
            whereClause.created_at = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }
        
        if (status) {
            whereClause.status = status;
        }

        const orders = await Order.findAll({
            where: whereClause,
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'cost']
                        }
                    ]
                }
            ]
        });

        // Calculate analytics
        const totalOrders = orders.length;
        const completedOrders = orders.filter(o => o.status === 'completed');
        const totalRevenue = completedOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
        const averageOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

        // Product sales analytics
        const productSales = {};
        completedOrders.forEach(order => {
            order.items.forEach(item => {
                const productId = item.product_id;
                if (!productSales[productId]) {
                    productSales[productId] = {
                        product: item.product,
                        totalQuantity: 0,
                        totalRevenue: 0,
                        totalProfit: 0
                    };
                }
                
                const revenue = item.quantity * item.price;
                const profit = item.quantity * (item.price - item.product.cost);
                
                productSales[productId].totalQuantity += item.quantity;
                productSales[productId].totalRevenue += revenue;
                productSales[productId].totalProfit += profit;
            });
        });

        // Convert to array and sort by revenue
        const topProducts = Object.values(productSales)
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 10);

        // Order status distribution
        const statusDistribution = orders.reduce((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            return acc;
        }, {});

        res.json({
            success: true,
            data: {
                totalOrders,
                completedOrders: completedOrders.length,
                totalRevenue,
                averageOrderValue,
                topProducts,
                statusDistribution,
                recentOrders: orders.slice(0, 10)
            }
        });
    } catch (error) {
        console.error('Error fetching orders analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders analytics',
            error: error.message
        });
    }
};

// Get recent orders for dashboard
const getRecentOrders = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        const orders = await Order.findAll({
            limit,
            order: [['created_at', 'DESC']],
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku']
                        }
                    ]
                }
            ]
        });

        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching recent orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent orders',
            error: error.message
        });
    }
};
// Add these functions to your orderController.js file before the module.exports

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
    try {
        const totalOrders = await Order.count();
        const pendingOrders = await Order.count({ where: { status: 'pending' } });
        const completedOrders = await Order.count({ where: { status: 'completed' } });
        const cancelledOrders = await Order.count({ where: { status: 'cancelled' } });

        // Calculate total revenue from completed orders
        const completedOrdersWithTotal = await Order.findAll({
            where: { status: 'completed' },
            attributes: ['total']
        });
        const totalRevenue = completedOrdersWithTotal.reduce((sum, order) => sum + parseFloat(order.total), 0);

        // Get recent orders count (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const recentOrdersCount = await Order.count({
            where: {
                created_at: { [Op.gte]: sevenDaysAgo }
            }
        });

        res.json({
            success: true,
            data: {
                totalOrders,
                pendingOrders,
                completedOrders,
                cancelledOrders,
                totalRevenue: parseFloat(totalRevenue.toFixed(2)),
                recentOrdersCount,
                averageOrderValue: completedOrders > 0 ? parseFloat((totalRevenue / completedOrders).toFixed(2)) : 0
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
};

// Update order (general update function)
const updateOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { customer_name, customer_email, status } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const updateData = {};
        if (customer_name !== undefined) updateData.customer_name = customer_name;
        if (customer_email !== undefined) updateData.customer_email = customer_email;
        if (status !== undefined) {
            const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status provided',
                    validStatuses
                });
            }
            updateData.status = status;
        }

        await order.update(updateData);

        const updatedOrder = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'price']
                        }
                    ]
                }
            ]
        });

        res.json({
            success: true,
            message: 'Order updated successfully',
            data: updatedOrder
        });
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order',
            error: error.message
        });
    }
};

// Complete order
const completeOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Order is already completed'
            });
        }

        if (order.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Cannot complete a cancelled order'
            });
        }

        await order.update({ status: 'completed' });

        const completedOrder = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'price']
                        }
                    ]
                }
            ]
        });

        res.json({
            success: true,
            message: 'Order completed successfully',
            data: completedOrder
        });
    } catch (error) {
        console.error('Error completing order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete order',
            error: error.message
        });
    }
};

// Cancel order (restore stock)
const cancelOrder = async (req, res) => {
    const transaction = await require('../models').sequelize.transaction();
    
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const order = await Order.findByPk(id, { transaction });
        if (!order) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.status === 'cancelled') {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Order is already cancelled'
            });
        }

        if (order.status === 'completed') {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel a completed order'
            });
        }

        // Get order items to restore stock
        const orderItems = await OrderItem.findAll({
            where: { order_id: id },
            include: [{ model: Product, as: 'product' }],
            transaction
        });

        // Restore stock for each item
        for (const item of orderItems) {
            await item.product.update({
                stock: item.product.stock + item.quantity
            }, { transaction });
        }

        // Update order status
        const updateData = { status: 'cancelled' };
        if (reason) updateData.cancellation_reason = reason;
        
        await order.update(updateData, { transaction });
        await transaction.commit();

        const cancelledOrder = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'price']
                        }
                    ]
                }
            ]
        });

        res.json({
            success: true,
            message: 'Order cancelled successfully and stock restored',
            data: cancelledOrder
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error cancelling order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order',
            error: error.message
        });
    }
};
module.exports = {
    getAllOrders,
    getOrderById,
    createOrder,
    updateOrderStatus,
    deleteOrder,
    getOrdersAnalytics,
    getRecentOrders,
    getDashboardStats,
    updateOrder,
    completeOrder,
    cancelOrder
};