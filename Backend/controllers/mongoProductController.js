
const mongoose = require('mongoose');

const {
    Product,
    Supplier,
    Order,
    PurchaseOrder,
    StockMovement
} = require('../models/mongo');

const ALLOWED_STATUSES = [
    'active',
    'inactive',
    'discontinued'
];

const ALLOWED_UPDATE_FIELDS = [
    'name',
    'sku',
    'barcode',
    'description',
    'category',
    'price',
    'costPrice',
    'stockQuantity',
    'reorderLevel',
    'supplierId',
    'imageUrl',
    'status',
    'isActive'
];

function sendError(res, status, code, message, details) {
    const error = { code, message };

    if (details !== undefined) {
        error.details = details;
    }

    return res.status(status).json({
        success: false,
        error
    });
}

function isValidObjectId(id) {
    return mongoose.isValidObjectId(id);
}

function pickAllowedFields(body) {
    const result = {};

    for (const field of ALLOWED_UPDATE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
            result[field] = body[field];
        }
    }

    return result;
}

function validateStringFields(input, fields) {
    for (const field of fields) {
        if (
            input[field] !== undefined &&
            input[field] !== null &&
            typeof input[field] !== 'string'
        ) {
            return field;
        }
    }

    return null;
}

function validateNonNegativeNumberFields(input, fields) {
    for (const field of fields) {
        const value = input[field];

        if (value === undefined || value === null) {
            continue;
        }

        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0
        ) {
            return field;
        }
    }

    return null;
}

function validateIntegerFields(input, fields) {
    for (const field of fields) {
        const value = input[field];

        if (value === undefined || value === null) {
            continue;
        }

        if (!Number.isInteger(value) || value < 0) {
            return field;
        }
    }

    return null;
}

function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}


async function listProducts(req, res) {
    try {
        const rawPage = req.query.page ?? '1';
        const rawLimit = req.query.limit ?? '20';

        const isPositiveInteger = value =>
            typeof value === 'string' && /^[1-9]\d*$/.test(value);

        if (
            !isPositiveInteger(rawPage) ||
            !isPositiveInteger(rawLimit)
        ) {
            return sendError(
                res,
                400,
                'INVALID_PAGINATION',
                'Page must be positive and limit must be between 1 and 100'
            );
        }

        const page = Number(rawPage);
        const limit = Number(rawLimit);

        if (
            !Number.isSafeInteger(page) ||
            !Number.isSafeInteger(limit) ||
            limit > 100 ||
            !Number.isSafeInteger((page - 1) * limit)
        ) {
            return sendError(
                res,
                400,
                'INVALID_PAGINATION',
                'Page must be positive and limit must be between 1 and 100'
            );
        }

        const filter = {
            ownerId: req.user._id,
            status: 'active'
        };

        if (typeof req.query.search === 'string' && req.query.search.trim()) {
            const search = req.query.search.trim().replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );

            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } },
                { barcode: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } }
            ];
        }

        if (req.query.status !== undefined) {
            if (
                typeof req.query.status !== 'string' ||
                !ALLOWED_STATUSES.includes(req.query.status)
            ) {
                return sendError(
                    res,
                    400,
                    'INVALID_STATUS',
                    'Product status is invalid'
                );
            }

            filter.status = req.query.status;
        }

        if (req.query.category !== undefined) {
            if (
                typeof req.query.category !== 'string' ||
                !req.query.category.trim()
            ) {
                return sendError(
                    res,
                    400,
                    'INVALID_CATEGORY',
                    'Category must be a non-empty string'
                );
            }

            filter.category = req.query.category.trim();
        }

        if (req.query.supplierId !== undefined) {
            if (!isValidObjectId(req.query.supplierId)) {
                return sendError(
                    res,
                    400,
                    'INVALID_SUPPLIER_ID',
                    'Supplier ID is invalid'
                );
            }

            filter.supplierId = req.query.supplierId;
        }

        if (req.query.lowStock === 'true') {
            filter.$expr = {
                $lte: ['$stockQuantity', '$reorderLevel']
            };
        } else if (req.query.lowStock !== undefined &&
                   req.query.lowStock !== 'false') {
            return sendError(
                res,
                400,
                'INVALID_LOW_STOCK_FILTER',
                'lowStock must be true or false'
            );
        }

        const [products, total] = await Promise.all([
            Product.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Product.countDocuments(filter)
        ]);

        return res.json({
            success: true,
            data: products,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('MongoDB list products error:', error.message);

        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to fetch products'
        );
    }
}


async function getProductById(req, res) {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return sendError(
                res,
                400,
                'INVALID_PRODUCT_ID',
                'Product ID is invalid'
            );
        }

        const product = await Product.findOne({
            _id: id,
            ownerId: req.user._id
        }).lean();

        if (!product) {
            return sendError(
                res,
                404,
                'PRODUCT_NOT_FOUND',
                'Product not found'
            );
        }

        return res.json({
            success: true,
            data: product
        });
    } catch (error) {
        console.error(
            'MongoDB get product error:',
            error.message
        );

        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to fetch product'
        );
    }
}


async function updateProduct(req, res) {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return sendError(
                res,
                400,
                'INVALID_PRODUCT_ID',
                'Product ID is invalid'
            );
        }

        const input = pickAllowedFields(req.body || {});

        // Stock changes must use the stock-movement workflow.
        if (Object.prototype.hasOwnProperty.call(input, 'stockQuantity')) {
            return sendError(
                res,
                400,
                'STOCK_UPDATE_NOT_ALLOWED',
                'Use the stock adjustment workflow to change stock quantity'
            );
        }

        if (Object.keys(input).length === 0) {
            return sendError(
                res,
                400,
                'EMPTY_UPDATE',
                'Provide at least one supported field to update'
            );
        }

        const invalidStringField = validateStringFields(input, [
            'name',
            'sku',
            'barcode',
            'description',
            'category',
            'imageUrl'
        ]);

        if (invalidStringField) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                `${invalidStringField} must be a string`
            );
        }

        if (input.name !== undefined) {
            input.name = input.name.trim();

            if (!input.name || input.name.length > 150) {
                return sendError(
                    res,
                    400,
                    'VALIDATION_ERROR',
                    'Product name must contain 1–150 characters'
                );
            }
        }

        if (input.sku !== undefined) {
            input.sku = input.sku.trim().toUpperCase();

            if (!input.sku || input.sku.length > 64) {
                return sendError(
                    res,
                    400,
                    'VALIDATION_ERROR',
                    'SKU must contain 1–64 characters'
                );
            }
        }

        if (input.barcode !== undefined) {
            input.barcode = normalizeOptionalString(input.barcode);

            if (input.barcode !== null && input.barcode.length > 64) {
                return sendError(
                    res,
                    400,
                    'VALIDATION_ERROR',
                    'Barcode cannot exceed 64 characters'
                );
            }
        }

        if (
            input.description !== undefined &&
            input.description.length > 2000
        ) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Description cannot exceed 2000 characters'
            );
        }

        if (
            input.category !== undefined &&
            input.category.length > 100
        ) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Category cannot exceed 100 characters'
            );
        }

        if (
            input.imageUrl !== undefined &&
            input.imageUrl.length > 2048
        ) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Image URL cannot exceed 2048 characters'
            );
        }

        const invalidNumberField = validateNonNegativeNumberFields(
            input,
            ['price', 'costPrice']
        );

        if (invalidNumberField) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                `${invalidNumberField} must be a non-negative number`
            );
        }

        const invalidIntegerField = validateIntegerFields(
            input,
            ['reorderLevel']
        );

        if (invalidIntegerField) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Reorder level must be a non-negative integer'
            );
        }

        if (
            input.status !== undefined &&
            !ALLOWED_STATUSES.includes(input.status)
        ) {
            return sendError(
                res,
                400,
                'INVALID_STATUS',
                'Product status is invalid'
            );
        }

        // Keep the legacy isActive flag aligned with status.
        delete input.isActive;

        if (input.status !== undefined) {
            input.isActive = input.status === 'active';
        }

        if (
            input.supplierId !== undefined &&
            input.supplierId !== null &&
            input.supplierId !== ''
        ) {
            if (!isValidObjectId(input.supplierId)) {
                return sendError(
                    res,
                    400,
                    'INVALID_SUPPLIER_ID',
                    'Supplier ID is invalid'
                );
            }

            const supplier = await Supplier.findOne({
                _id: input.supplierId,
                ownerId: req.user._id
            }).lean();

            if (!supplier) {
                return sendError(
                    res,
                    404,
                    'SUPPLIER_NOT_FOUND',
                    'Supplier not found'
                );
            }
        } else if (input.supplierId !== undefined) {
            input.supplierId = null;
        }

        const updatedProduct = await Product.findOneAndUpdate(
            {
                _id: id,
                ownerId: req.user._id
            },
            { $set: input },
            {
                new: true,
                runValidators: true
            }
        );

        if (!updatedProduct) {
            return sendError(
                res,
                404,
                'PRODUCT_NOT_FOUND',
                'Product not found'
            );
        }

        return res.json({
            success: true,
            data: updatedProduct
        });
    } catch (error) {
        if (error.code === 11000) {
            return sendError(
                res,
                409,
                'DUPLICATE_PRODUCT_IDENTIFIER',
                'A product with this SKU or barcode already exists'
            );
        }

        if (
            error.name === 'ValidationError' ||
            error.name === 'CastError'
        ) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Product details are invalid'
            );
        }

        console.error('MongoDB update product error:', error.message);

        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to update product'
        );
    }
}


async function deleteProduct(req, res) {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return sendError(
                res,
                400,
                'INVALID_PRODUCT_ID',
                'Product ID is invalid'
            );
        }

        const product = await Product.findOneAndUpdate(
            {
                _id: id,
                ownerId: req.user._id
            },
            {
                $set: {
                    status: 'inactive',
                    isActive: false
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!product) {
            return sendError(
                res,
                404,
                'PRODUCT_NOT_FOUND',
                'Product not found'
            );
        }

        return res.json({
            success: true,
            message: 'Product deactivated successfully',
            data: product
        });
    } catch (error) {
        console.error('MongoDB delete product error:', error.message);

        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to deactivate product'
        );
    }
}

async function createProduct(req, res) {
    let createdProduct = null;

    try {
        const input = pickAllowedFields(req.body || {});

        const invalidStringField = validateStringFields(input, [
            'name',
            'sku',
            'barcode',
            'description',
            'category',
            'imageUrl'
        ]);

        if (invalidStringField) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                `${invalidStringField} must be a string`
            );
        }

        if (typeof input.name !== 'string' || !input.name.trim()) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'Product name is required'
            );
        }

        if (input.name.trim().length > 150) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'Product name cannot exceed 150 characters'
            );
        }

        if (typeof input.sku !== 'string' || !input.sku.trim()) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'SKU is required'
            );
        }

        input.name = input.name.trim();
        input.sku = input.sku.trim().toUpperCase();

        if (input.sku.length > 64) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'SKU cannot exceed 64 characters'
            );
        }

        if (input.barcode !== undefined) {
            input.barcode = normalizeOptionalString(input.barcode);

            if (input.barcode !== null && input.barcode.length > 64) {
                return sendError(
                    res, 400, 'VALIDATION_ERROR',
                    'Barcode cannot exceed 64 characters'
                );
            }
        }

        if (input.description !== undefined &&
            input.description.length > 2000) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'Description cannot exceed 2000 characters'
            );
        }

        if (input.category !== undefined &&
            input.category.length > 100) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'Category cannot exceed 100 characters'
            );
        }

        if (input.imageUrl !== undefined &&
            input.imageUrl.length > 2048) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'Image URL cannot exceed 2048 characters'
            );
        }

        const missingNumericFields = ['price', 'costPrice'].filter(
            field => !Object.prototype.hasOwnProperty.call(input, field)
        );

        if (missingNumericFields.length > 0) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'Price and cost price are required'
            );
        }

        const invalidNumberField = validateNonNegativeNumberFields(
            input,
            ['price', 'costPrice']
        );

        if (invalidNumberField) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                `${invalidNumberField} must be a non-negative number`
            );
        }

        if (input.stockQuantity === undefined) {
            input.stockQuantity = 0;
        }

        if (input.reorderLevel === undefined) {
            input.reorderLevel = 10;
        }

        const invalidIntegerField = validateIntegerFields(
            input,
            ['stockQuantity', 'reorderLevel']
        );

        if (invalidIntegerField) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                `${invalidIntegerField} must be a non-negative integer`
            );
        }

        if (
            input.status !== undefined &&
            !ALLOWED_STATUSES.includes(input.status)
        ) {
            return sendError(
                res, 400, 'INVALID_STATUS',
                'Product status is invalid'
            );
        }

        // Do not let clients independently set the legacy isActive flag.
        delete input.isActive;
        input.isActive = (input.status || 'active') === 'active';

        if (input.supplierId !== undefined &&
            input.supplierId !== null &&
            input.supplierId !== '') {
            if (!isValidObjectId(input.supplierId)) {
                return sendError(
                    res, 400, 'INVALID_SUPPLIER_ID',
                    'Supplier ID is invalid'
                );
            }

            const supplier = await Supplier.findOne({
                _id: input.supplierId,
                ownerId: req.user._id
            }).lean();

            if (!supplier) {
                return sendError(
                    res, 404, 'SUPPLIER_NOT_FOUND',
                    'Supplier not found'
                );
            }
        } else if (input.supplierId !== undefined) {
            input.supplierId = null;
        }

        createdProduct = await Product.create({
            ...input,
            ownerId: req.user._id
        });

        if (createdProduct.stockQuantity > 0) {
            await StockMovement.create({
                ownerId: req.user._id,
                productId: createdProduct._id,
                type: 'opening_balance',
                quantityChange: createdProduct.stockQuantity,
                quantityBefore: 0,
                quantityAfter: createdProduct.stockQuantity,
                referenceType: 'adjustment',
                referenceId: null,
                idempotencyKey: `opening:${createdProduct._id}`
            });
        }

        return res.status(201).json({
            success: true,
            data: createdProduct
        });
    } catch (error) {
        if (createdProduct) {
            try {
                await Product.deleteOne({
                    _id: createdProduct._id,
                    ownerId: req.user._id
                });
            } catch (rollbackError) {
                console.error(
                    'Product creation rollback failed:',
                    rollbackError.message
                );
            }
        }

        if (error.code === 11000) {
            return sendError(
                res, 409, 'DUPLICATE_PRODUCT_IDENTIFIER',
                'A product with this SKU or barcode already exists'
            );
        }

        if (
            error.name === 'ValidationError' ||
            error.name === 'CastError'
        ) {
            return sendError(
                res, 400, 'VALIDATION_ERROR',
                'Product details are invalid'
            );
        }

        console.error('MongoDB create product error:', error.message);

        return sendError(
            res, 500, 'INTERNAL_ERROR',
            'Failed to create product'
        );
    }
}

module.exports = {
    sendError,
    isValidObjectId,
    pickAllowedFields,
    validateStringFields,
    validateNonNegativeNumberFields,
    validateIntegerFields,
    normalizeOptionalString,
    ALLOWED_STATUSES,
    ALLOWED_UPDATE_FIELDS,
    listProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    createProduct
};
