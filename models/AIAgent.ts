import mongoose, { Schema, Document } from 'mongoose';

export interface IKnowledgeEntry {
  id: string;
  question: string;
  answer: string;
}

export interface IAIAgent extends Document {
  userId: string;
  name: string;
  role: string;
  about: string;
  welcomeMessage: string;
  systemPrompt: string;
  temperature: number;
  aiModel: string;
  isActive: boolean;
  fallbackToAI: boolean;
  knowledgeBase: IKnowledgeEntry[];
  updatedAt?: Date;
}

const KnowledgeEntrySchema = new Schema({
  id: { type: String, required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true }
}, { _id: false });

const AIAgentSchema = new Schema<IAIAgent>({
  userId: { type: String, required: true, unique: true },
  name: { type: String, default: 'AI Assistant' },
  role: { type: String, default: 'مساعد ذكي' },
  about: { type: String, default: 'أنا مساعد ذكي أرد على استفسارات العملاء.' },
  welcomeMessage: { type: String, default: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  systemPrompt: { type: String, default: 'أنت مساعد ذكي ومفيد. أجب على أسئلة المستخدمين بلطف واحترافية.' },
  temperature: { type: Number, default: 0.7 },
  aiModel: { type: String, default: 'llama-3.3-70b-versatile' },
  isActive: { type: Boolean, default: false },
  fallbackToAI: { type: Boolean, default: false },
  knowledgeBase: { type: [KnowledgeEntrySchema], default: [] }
}, { timestamps: true });

export const AIAgent = mongoose.model<IAIAgent>('AIAgent', AIAgentSchema);
