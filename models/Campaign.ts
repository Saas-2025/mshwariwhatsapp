import mongoose, { Document, Schema } from 'mongoose';

// History record for a bulk-send (broadcast) campaign.
export interface ICampaign extends Document {
    userId: string;
    sessionId: string;
    sessionName: string;
    type: 'text' | 'image' | 'audio' | 'video' | 'document';
    preview: string;     // first chars of the message / caption
    total: number;
    success: number;
    failed: number;
    status: 'completed' | 'stopped';
    createdAt?: string;
    updatedAt?: string;
}

const CampaignSchema = new Schema<ICampaign>({
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, default: '' },
    sessionName: { type: String, default: '' },
    type: { type: String, default: 'text' },
    preview: { type: String, default: '' },
    total: { type: Number, default: 0 },
    success: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    status: { type: String, enum: ['completed', 'stopped'], default: 'completed' }
}, { timestamps: true });

export const Campaign = mongoose.model<ICampaign>('Campaign', CampaignSchema);
