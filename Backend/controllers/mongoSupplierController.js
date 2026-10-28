
const mongoose = require('mongoose');
const { Supplier, Product, PurchaseOrder } = require('../models/mongo');

const ALLOWED_STATUSES = ['active', 'inactive', 'blocked'];

const ALLOWED_UPDATE_FIELDS = [
    'name',
    'contactPerson',
    'website',
    'taxId',
    'paymentTerms',
    'rating',
    'email',
    'phone',
    'address',
    'notes',
    'status'
];

function sendError(res, status, code, message) {
    return res.status(status).json({
        success: false,
        error: { code, message }
    });
}

function isValidObjectId(id) {
    return mongoose.isValidObjectId(id);
}

function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

function validateOptionalStringFields(input, fields) {
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

function validateEmail(email) {
    return typeof email === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

async function listSuppliers(req, res) {
    try {
        const rawPage = req.query.page ?? '1';
        const rawLimit = req.query.limit ?? '20';

        const isPositiveInteger = value =>
        typeof value === 'string' && /^[1-9]\d*$/.test(value);

        if (!isPositiveInteger(rawPage) || !isPositiveInteger(rawLimit)) {
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
            !Number.isInteger(page) || page < 1 ||
            !Number.isInteger(limit) || limit < 1 || limit > 100
        ) {
            return sendError(
                res,
                400,
                'INVALID_PAGINATION',
                'Page must be positive and limit must be between 1 and 100'
            );
        }

        const filter = { ownerId: req.user._id };

        if (typeof req.query.search === 'string' && req.query.search.trim()) {
            const search = req.query.search.trim().replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );

            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        if (typeof req.query.status === 'string') {
            if (!ALLOWED_STATUSES.includes(req.query.status)) {
                return sendError(
                    res,
                    400,
                    'INVALID_STATUS',
                    'Supplier status is invalid'
                );
            }

            filter.status = req.query.status;
        }

        const [suppliers, total] = await Promise.all([
            Supplier.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Supplier.countDocuments(filter)
        ]);

        return res.json({
            success: true,
            data: suppliers,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('MongoDB list suppliers error:', error.message);
        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to fetch suppliers'
        );
    }
}


async function createSupplier(req, res) {
    try {
        const input = pickAllowedFields(req.body || {});
        const invalidField = validateOptionalStringFields(input, [
    'email',
    'contactPerson',
    'website',
    'taxId',
    'paymentTerms',
    'phone',
    'address',
    'notes'
]);

if (invalidField) {
    return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        `${invalidField} must be a string or null`
    );
}
        if (typeof input.name !== 'string' || !input.name.trim()) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Supplier name is required'
            );
        }

        input.name = input.name.trim();

        if (input.name.length > 150) {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Supplier name cannot exceed 150 characters'
            );
        }

        if (input.email !== undefined) {
            input.email = normalizeOptionalString(input.email);

            if (input.email !== null && !validateEmail(input.email)) {
                return sendError(
                    res,
                    400,
                    'INVALID_EMAIL',
                    'Please provide a valid email address'
                );
            }
        }

        for (const field of [
            'contactPerson',
            'website',
            'taxId',
            'paymentTerms',
            'phone',
            'address',
            'notes'
        ]) {
            if (input[field] !== undefined) {
                input[field] = normalizeOptionalString(input[field]);
            }
        }

        if (
            input.status !== undefined &&
            !ALLOWED_STATUSES.includes(input.status)
        ) {
            return sendError(
                res,
                400,
                'INVALID_STATUS',
                'Supplier status is invalid'
            );
        }

        if (
            input.rating !== undefined &&
            input.rating !== null &&
            (
                typeof input.rating !== 'number' ||
                !Number.isFinite(input.rating) ||
                input.rating < 0 ||
                input.rating > 5
            )
        ) {
            return sendError(
                res,
                400,
                'INVALID_RATING',
                'Rating must be a number between 0 and 5'
            );
        }

        const supplier = await Supplier.create({
            ...input,
            ownerId: req.user._id
        });

        return res.status(201).json({
            success: true,
            data: supplier
        });
    } catch (error) {
        if (error.code === 11000) {
            return sendError(
                res,
                409,
                'DUPLICATE_SUPPLIER_IDENTIFIER',
                'A supplier with this email or tax ID already exists'
            );
        }

        if (error.name === 'ValidationError') {
            return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Supplier details are invalid'
            );
        }

        console.error('MongoDB create supplier error:', error.message);

        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to create supplier'
        );
    }
}


async function getSupplierById(req, res) {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return sendError(
                res,
                400,
                'INVALID_SUPPLIER_ID',
                'Supplier ID is invalid'
            );
        }

        const supplier = await Supplier.findOne({
            _id: id,
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

        return res.json({
            success: true,
            data: supplier
        });
    } catch (error) {
        console.error('MongoDB get supplier error:', error.message);

        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to fetch supplier'
        );
    }
}


async function updateSupplier(req, res) {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return sendError(
                res,
                400,
                'INVALID_SUPPLIER_ID',
                'Supplier ID is invalid'
            );
        }

        const input = pickAllowedFields(req.body || {});
        const invalidField = validateOptionalStringFields(input, [
            'email',
            'contactPerson',
            'website',
            'taxId',
            'paymentTerms',
            'phone',
            'address',
            'notes'
        ]);

if (invalidField) {
    return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        `${invalidField} must be a string or null`
    );
}

        if (Object.keys(input).length === 0) {
            return sendError(
                res,
                400,
                'NO_VALID_FIELDS',
                'Provide at least one supported field to update'
            );
        }

        if (input.name !== undefined) {
            if (typeof input.name !== 'string' || !input.name.trim()) {
                return sendError(
                    res,
                    400,
                    'VALIDATION_ERROR',
                    'Supplier name cannot be empty'
                );
            }

            input.name = input.name.trim();

            if (input.name.length > 150) {
                return sendError(
                    res,
                    400,
                    'VALIDATION_ERROR',
                    'Supplier name cannot exceed 150 characters'
                );
            }
        }

        if (input.email !== undefined) {
            input.email = normalizeOptionalString(input.email);

            if (input.email !== null && !validateEmail(input.email)) {
                return sendError(
                    res,
                    400,
                    'INVALID_EMAIL',
                    'Please provide a valid email address'
                );
            }
        }

        for (const field of [
            'contactPerson',
            'website',
            'taxId',
            'paymentTerms',
            'phone',
            'address',
            'notes'
        ]) {
            if (input[field] !== undefined) {
                input[field] = normalizeOptionalString(input[field]);
            }
        }

        if (
            input.status !== undefined &&
            !ALLOWED_STATUSES.includes(input.status)
        ) {
            return sendError(
                res,
                400,
                'INVALID_STATUS',
                'Supplier status is invalid'
            );
        }

        if (
            input.rating !== undefined &&
            input.rating !== null &&
            (
                typeof input.rating !== 'number' ||
                !Number.isFinite(input.rating) ||
                input.rating < 0 ||
                input.rating > 5
            )
        ) {
            return sendError(
                res,
                400,
                'INVALID_RATING',
                'Rating must be a number between 0 and 5'
            );
        }

        const supplier = await Supplier.findOneAndUpdate(
            { _id: id, ownerId: req.user._id },
            { $set: input },
            {
                new: true,
                runValidators: true
            }
        );

        if (!supplier) {
            return sendError(
                res,
                404,
                'SUPPLIER_NOT_FOUND',
                'Supplier not found'
            );
        }

        return res.json({
            success: true,
            data: supplier
        });
    } catch (error) {
        if (error.code === 11000) {
            return sendError(
                res,
                409,
                'DUPLICATE_SUPPLIER_IDENTIFIER',
                'A supplier with this email or tax ID already exists'
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
                'Supplier details are invalid'
            );
        }

        console.error('MongoDB update supplier error:', error.message);

        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to update supplier'
        );
    }
}


async function deleteSupplier(req, res) {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return sendError(
                res,
                400,
                'INVALID_SUPPLIER_ID',
                'Supplier ID is invalid'
            );
        }

        const filter = {
            _id: id,
            ownerId: req.user._id
        };

        const supplier = await Supplier.findOne(filter).lean();

        if (!supplier) {
            return sendError(
                res,
                404,
                'SUPPLIER_NOT_FOUND',
                'Supplier not found'
            );
        }

        const [productCount, purchaseOrderCount] = await Promise.all([
            Product.countDocuments({
                ownerId: req.user._id,
                supplierId: supplier._id
            }),
            PurchaseOrder.countDocuments({
                ownerId: req.user._id,
                supplierId: supplier._id
            })
        ]);

        if (productCount > 0 || purchaseOrderCount > 0) {
            return res.status(409).json({
                success: false,
                error: {
                    code: 'SUPPLIER_IN_USE',
                    message: 'Cannot delete a supplier referenced by inventory records',
                    details: {
                        productCount,
                        purchaseOrderCount
                    }
                }
            });
        }

        await Supplier.deleteOne(filter);

        return res.json({
            success: true,
            message: 'Supplier deleted successfully'
        });
    } catch (error) {
        console.error('MongoDB delete supplier error:', error.message);

        return sendError(
            res,
            500,
            'INTERNAL_ERROR',
            'Failed to delete supplier'
        );
    }
}

module.exports = {
    listSuppliers,
    createSupplier,
    getSupplierById,
    updateSupplier,
    deleteSupplier
};
