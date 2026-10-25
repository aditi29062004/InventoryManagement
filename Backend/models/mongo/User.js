
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: [2, 'Name must contain at least 2 characters'],
            maxlength: [100, 'Name cannot exceed 100 characters']
        },

        email: {
            type: String,
            required: [true, 'Email is required'],
            lowercase: true,
            trim: true,
            maxlength: [254, 'Email cannot exceed 254 characters'],
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                'Please provide a valid email address'
            ]
        },

        passwordHash: {
            type: String,
            required: [true, 'Password hash is required'],
            select: false
        },

        role: {
            type: String,
            enum: ['user', 'admin'],
            default: 'user',
            required: true
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Email addresses must be unique across user accounts.
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
