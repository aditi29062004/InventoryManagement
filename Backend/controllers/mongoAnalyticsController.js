
const { Product, Order, Supplier } = require('../models/mongo');

function sendError(res, status, code, message) {
    return res.status(status).json({
        success: false,
        error: { code, message }
    });
}

async function getAnalyticsSummary(req, res) {
    try {
        const ownerId = req.user._id;

        const activeProductFilter = {
            ownerId,
            isActive: true,
            status: 'active'
        };

        const [
            inventoryMetrics,
            orderMetrics,
            productPerformance,
            categoryBreakdown,
            supplierCount
        ] = await Promise.all([
            Product.aggregate([
                { $match: activeProductFilter },
                {
                    $group: {
                        _id: null,
                        activeProducts: { $sum: 1 },
                        totalUnits: { $sum: '$stockQuantity' },
                        lowStockProducts: {
                            $sum: {
                                $cond: [
                                    {
                                        $lte: [
                                            '$stockQuantity',
                                            '$reorderLevel'
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },
                        inventoryCostValue: {
                            $sum: {
                                $multiply: [
                                    '$stockQuantity',
                                    '$costPrice'
                                ]
                            }
                        },
                        potentialRetailValue: {
                            $sum: {
                                $multiply: [
                                    '$stockQuantity',
                                    '$price'
                                ]
                            }
                        }
                    }
                },
                { $project: { _id: 0 } }
            ]),

            Order.aggregate([
                { $match: { ownerId } },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        pendingOrders: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
                            }
                        },
                        completedOrders: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
                            }
                        },
                        cancelledOrders: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0]
                            }
                        },
                        completedRevenue: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$status', 'completed'] },
                                    '$total',
                                    0
                                ]
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        totalOrders: 1,
                        pendingOrders: 1,
                        completedOrders: 1,
                        cancelledOrders: 1,
                        completedRevenue: 1,
                        averageOrderValue: {
                            $cond: [
                                { $gt: ['$completedOrders', 0] },
                                { $divide: ['$completedRevenue', '$completedOrders'] },
                                0
                            ]
                        }
                    }
                }
            ]),

            Order.aggregate([
                { $match: { ownerId, status: 'completed' } },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.productId',
                        productName: { $first: '$items.productName' },
                        sku: { $first: '$items.sku' },
                        unitsSold: { $sum: '$items.quantity' },
                        revenue: { $sum: '$items.lineTotal' }
                    }
                },
                { $sort: { revenue: -1, unitsSold: -1 } },
                { $limit: 10 },
                {
                    $project: {
                        _id: 0,
                        productId: '$_id',
                        productName: 1,
                        sku: 1,
                        unitsSold: 1,
                        revenue: 1
                    }
                }
            ]),

            Product.aggregate([
                { $match: activeProductFilter },
                {
                    $group: {
                        _id: { $ifNull: ['$category', 'Uncategorized'] },
                        productCount: { $sum: 1 },
                        totalUnits: { $sum: '$stockQuantity' },
                        inventoryCostValue: {
                            $sum: {
                                $multiply: [
                                    '$stockQuantity',
                                    '$costPrice'
                                ]
                            }
                        }
                    }
                },
                { $sort: { inventoryCostValue: -1, _id: 1 } },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        productCount: 1,
                        totalUnits: 1,
                        inventoryCostValue: 1
                    }
                }
            ]),

            Supplier.countDocuments({
                ownerId,
                isActive: true,
                status: 'active'
            })
        ]);

        const inventory = inventoryMetrics[0] || {
            activeProducts: 0,
            totalUnits: 0,
            lowStockProducts: 0,
            inventoryCostValue: 0,
            potentialRetailValue: 0
        };

        const sales = orderMetrics[0] || {
            totalOrders: 0,
            pendingOrders: 0,
            completedOrders: 0,
            cancelledOrders: 0,
            completedRevenue: 0,
            averageOrderValue: 0
        };

        return res.status(200).json({
            success: true,
            data: {
                inventory,
                sales,
                supplierCount,
                productPerformance,
                categoryBreakdown
            }
        });
    } catch (error) {
        console.error(
            'MongoDB analytics summary error:',
            error.message
        );

        return sendError(
            res,
            500,
            'ANALYTICS_SUMMARY_FAILED',
            'Failed to load analytics summary'
        );
    }
}

module.exports = { getAnalyticsSummary };