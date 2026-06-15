import mongoose, { Document, Schema } from 'mongoose';

// A customer segment/category for a session (e.g. VIP, جملة, متابعة).
export interface ICustomerCategory extends Document {
    sessionId: string;
    userId: string;
    name: string;
    color: string;   // palette key (emerald, blue, amber, ...)
    order: number;
    createdAt?: string;
    updatedAt?: string;
}

const CustomerCategorySchema = new Schema<ICustomerCategory>({
    sessionId: { type: String, required: true, index: true },
    userId: { type: String, default: '' },
    name: { type: String, required: true },
    color: { type: String, default: 'emerald' },
    order: { type: Number, default: 0 }
}, { timestamps: true });

export const CustomerCategory = mongoose.model<ICustomerCategory>('CustomerCategory', CustomerCategorySchema);
