import mongoose, { Document, Schema } from 'mongoose';

export interface IPlan extends Document {
    name: string;
    priceMonthly: number;         // Egypt monthly
    priceYearly: number;          // Egypt yearly
    currency: string;             // Egypt currency
    priceMonthlySA: number;       // Saudi monthly
    priceYearlySA: number;        // Saudi yearly
    currencySA: string;           // Saudi currency
    maxSessions: number;          // 0 = unlimited
    maxConversations: number;     // monthly, 0 = unlimited
    maxCampaignMessages: number;  // monthly, 0 = unlimited
    maxScheduled: number;         // 0 = unlimited
    features: string[];
    popular: boolean;
    order: number;
    isActive: boolean;
    createdAt?: string;
}

const PlanSchema = new Schema<IPlan>({
    name: { type: String, required: true },
    priceMonthly: { type: Number, default: 0 },
    priceYearly: { type: Number, default: 0 },
    currency: { type: String, default: 'ج.م' },
    priceMonthlySA: { type: Number, default: 0 },
    priceYearlySA: { type: Number, default: 0 },
    currencySA: { type: String, default: 'ر.س' },
    maxSessions: { type: Number, default: 1 },
    maxConversations: { type: Number, default: 0 },
    maxCampaignMessages: { type: Number, default: 0 },
    maxScheduled: { type: Number, default: 0 },
    features: { type: [String], default: [] },
    popular: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const Plan = mongoose.model<IPlan>('Plan', PlanSchema);
