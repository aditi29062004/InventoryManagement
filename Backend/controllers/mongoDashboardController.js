
const { Product, Order } = require('../models/mongo');

function sendError(res, status, code, message) {
    return res.status(status).json({
        success: false,
        error: { code, message }
    });
}

async function getDashboardSummary(req, res) {
    try {
        const ownerId = req.user._id;

        const activeProductFilter = {
            ownerId,
            isActive: true,
            status: 'active'
        };

        const orderFilter = { ownerId };

        const [
            productMetrics,
            orderCounts,
            salesRevenue,
            recentOrders
        ] = await Promise.all([
            Product.aggregate([
                { $match: activeProductFilter },
                {
                    $group: {
                        _id: null,
                        activeCount: { $sum: 1 },
                        totalUnits: { $sum: '$stockQuantity' },
                        lowStockCount: {
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
                { $match: orderFilter },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),

            Order.aggregate([
                {
                    $match: {
                        ownerId,
                        status: { $ne: 'cancelled' }
                    }
                },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$total' }
                    }
                }
            ]),

            Order.find(orderFilter)
                .select(
                    'orderNumber customerName total status createdAt'
                )
                .sort({ createdAt: -1, _id: -1 })
                .limit(5)
                .lean()
        ]);

        const productSummary = productMetrics[0] || {
            activeCount: 0,
            totalUnits: 0,
            lowStockCount: 0,
            inventoryCostValue: 0,
            potentialRetailValue: 0
        };

        const countsByStatus = {
            pending: 0,
            completed: 0,
            cancelled: 0
        };

        for (const entry of orderCounts) {
            if (Object.hasOwn(countsByStatus, entry._id)) {
                countsByStatus[entry._id] = entry.count;
            }
        }

        const totalCount = Object.values(countsByStatus)
            .reduce((sum, count) => sum + count, 0);

        const revenue = salesRevenue[0]?.revenue ?? 0;

        return res.status(200).json({
            success: true,
            data: {
                products: productSummary,
                orders: {
                    ...countsByStatus,
                    totalCount,
                    salesRevenue: revenue
                },
                recentOrders
            }
        });
    } catch (error) {
        console.error(
            'MongoDB dashboard summary error:',
            error.message
        );

        return sendError(
            res,
            500,
            'DASHBOARD_SUMMARY_FAILED',
            'Failed to load dashboard summary'
        );
    }
}

module.exports = { getDashboardSummary };
