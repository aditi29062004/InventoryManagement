const { PurchaseOrder, PurchaseOrderItem, Product, Supplier } = require('../models');
const { Op } = require('sequelize');

// Generate purchase order for low stock items
const generatePurchaseOrder = async (req, res) => {
    try {
        const { supplier_id, product_id, quantity } = req.body;

        // Validation
        if (!supplier_id || !product_id || !quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Supplier ID, Product ID, and quantity are required'
            });
        }

        // Check if product exists
        const product = await Product.findByPk(product_id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if supplier exists
        const supplier = await Supplier.findByPk(supplier_id);
        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: 'Supplier not found'
            });
        }

        // Create purchase order
        const purchaseOrder = await PurchaseOrder.create({
            supplier_id,
            status: 'pending',
            total: quantity * product.cost,
            order_date: new Date()
        });

        // Create purchase order item
        await PurchaseOrderItem.create({
            purchase_order_id: purchaseOrder.id,
            product_id,
            quantity,
            unit_price: product.cost
        });

        // Fetch complete purchase order
        const completePO = await PurchaseOrder.findByPk(purchaseOrder.id, {
            include: [
                {
                    model: PurchaseOrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'cost']
                        }
                    ]
                },
                {
                    model: Supplier,
                    as: 'supplier',
                    attributes: ['id', 'name', 'contact_person', 'email']
                }
            ]
        });

        res.status(201).json({
            success: true,
            message: 'Purchase order generated successfully',
            data: completePO
        });
    } catch (error) {
        console.error('Error generating purchase order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate purchase order',
            error: error.message
        });
    }
};

// Get all purchase orders
const getAllPurchaseOrders = async (req, res) => {
    try {
        const purchaseOrders = await PurchaseOrder.findAll({
            include: [
                {
                    model: PurchaseOrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'cost']
                        }
                    ]
                },
                {
                    model: Supplier,
                    as: 'supplier',
                    attributes: ['id', 'name', 'contact_person', 'email']
                }
            ],
            order: [['created_at', 'DESC']]
        });

        res.json({
            success: true,
            data: purchaseOrders
        });
    } catch (error) {
        console.error('Error fetching purchase orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch purchase orders',
            error: error.message
        });
    }
};

// Get purchase order by ID
const getPurchaseOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const purchaseOrder = await PurchaseOrder.findByPk(id, {
            include: [
                {
                    model: PurchaseOrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'cost']
                        }
                    ]
                },
                {
                    model: Supplier,
                    as: 'supplier',
                    attributes: ['id', 'name', 'contact_person', 'email', 'phone']
                }
            ]
        });

        if (!purchaseOrder) {
            return res.status(404).json({
                success: false,
                message: 'Purchase order not found'
            });
        }

        res.json({
            success: true,
            data: purchaseOrder
        });
    } catch (error) {
        console.error('Error fetching purchase order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch purchase order',
            error: error.message
        });
    }
};

// Create new purchase order
const createPurchaseOrder = async (req, res) => {
    const transaction = await require('../models').sequelize.transaction();
    
    try {
        const { supplier_id, items, notes } = req.body;

        // Validation
        if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Supplier ID and items are required'
            });
        }

        // Check if supplier exists
        const supplier = await Supplier.findByPk(supplier_id, { transaction });
        if (!supplier) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Supplier not found'
            });
        }

        // Validate items and calculate total
        let total = 0;
        const validatedItems = [];

        for (const item of items) {
            const { product_id, quantity, unit_price } = item;
            
            if (!product_id || !quantity || quantity <= 0 || !unit_price || unit_price <= 0) {
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

            validatedItems.push({
                product_id,
                quantity: parseInt(quantity),
                unit_price: parseFloat(unit_price)
            });

            total += quantity * parseFloat(unit_price);
        }

        // Create purchase order
        const purchaseOrder = await PurchaseOrder.create({
            supplier_id,
            status: 'pending',
            total,
            order_date: new Date(),
            notes
        }, { transaction });

        // Create purchase order items
        for (const item of validatedItems) {
            await PurchaseOrderItem.create({
                purchase_order_id: purchaseOrder.id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price
            }, { transaction });
        }

        await transaction.commit();

        // Fetch complete purchase order
        const completePO = await PurchaseOrder.findByPk(purchaseOrder.id, {
            include: [
                {
                    model: PurchaseOrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'cost']
                        }
                    ]
                },
                {
                    model: Supplier,
                    as: 'supplier',
                    attributes: ['id', 'name', 'contact_person', 'email']
                }
            ]
        });

        res.status(201).json({
            success: true,
            message: 'Purchase order created successfully',
            data: completePO
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error creating purchase order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create purchase order',
            error: error.message
        });
    }
};

// Update purchase order
const updatePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const purchaseOrder = await PurchaseOrder.findByPk(id);
        if (!purchaseOrder) {
            return res.status(404).json({
                success: false,
                message: 'Purchase order not found'
            });
        }

        if (purchaseOrder.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Can only update pending purchase orders'
            });
        }

        await purchaseOrder.update({ notes });

        res.json({
            success: true,
            message: 'Purchase order updated successfully',
            data: purchaseOrder
        });
    } catch (error) {
        console.error('Error updating purchase order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update purchase order',
            error: error.message
        });
    }
};

// Delete purchase order
const deletePurchaseOrder = async (req, res) => {
    const transaction = await require('../models').sequelize.transaction();
    
    try {
        const { id } = req.params;
        
        const purchaseOrder = await PurchaseOrder.findByPk(id, { transaction });
        if (!purchaseOrder) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Purchase order not found'
            });
        }

        if (purchaseOrder.status === 'received') {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Cannot delete received purchase orders'
            });
        }

        // Delete purchase order items first
        await PurchaseOrderItem.destroy({
            where: { purchase_order_id: id },
            transaction
        });

        // Delete purchase order
        await purchaseOrder.destroy({ transaction });

        await transaction.commit();

        res.json({
            success: true,
            message: 'Purchase order deleted successfully'
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting purchase order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete purchase order',
            error: error.message
        });
    }
};

// Update purchase order status
const updatePurchaseOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'approved', 'ordered', 'received', 'cancelled'];
        
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Valid status is required',
                validStatuses
            });
        }

        const purchaseOrder = await PurchaseOrder.findByPk(id);
        if (!purchaseOrder) {
            return res.status(404).json({
                success: false,
                message: 'Purchase order not found'
            });
        }

        await purchaseOrder.update({ status });

        res.json({
            success: true,
            message: `Purchase order ${status} successfully`,
            data: purchaseOrder
        });
    } catch (error) {
        console.error('Error updating purchase order status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update purchase order status',
            error: error.message
        });
    }
};

// Receive purchase order (update stock)
const receivePurchaseOrder = async (req, res) => {
    const transaction = await require('../models').sequelize.transaction();
    
    try {
        const { id } = req.params;
        const { received_items } = req.body;

        const purchaseOrder = await PurchaseOrder.findByPk(id, {
            include: [
                {
                    model: PurchaseOrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product'
                        }
                    ]
                }
            ],
            transaction
        });

        if (!purchaseOrder) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Purchase order not found'
            });
        }

        if (purchaseOrder.status === 'received') {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Purchase order already received'
            });
        }

        // Update stock for received items
        for (const item of purchaseOrder.items) {
            const receivedQty = received_items?.[item.product_id] || item.quantity;
            
            await item.product.update({
                stock: item.product.stock + receivedQty
            }, { transaction });
        }

        // Update purchase order status
        await purchaseOrder.update({
            status: 'received',
            received_date: new Date()
        }, { transaction });

        await transaction.commit();

        res.json({
            success: true,
            message: 'Purchase order received and stock updated successfully',
            data: purchaseOrder
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error receiving purchase order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to receive purchase order',
            error: error.message
        });
    }
};

// Cancel purchase order
const cancelPurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const purchaseOrder = await PurchaseOrder.findByPk(id);
        if (!purchaseOrder) {
            return res.status(404).json({
                success: false,
                message: 'Purchase order not found'
            });
        }

        if (purchaseOrder.status === 'received') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel received purchase orders'
            });
        }

        await purchaseOrder.update({ status: 'cancelled' });

        res.json({
            success: true,
            message: 'Purchase order cancelled successfully',
            data: purchaseOrder
        });
    } catch (error) {
        console.error('Error cancelling purchase order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel purchase order',
            error: error.message
        });
    }
};

module.exports = {
    generatePurchaseOrder,
    getAllPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    updatePurchaseOrderStatus,
    receivePurchaseOrder,
    cancelPurchaseOrder
};