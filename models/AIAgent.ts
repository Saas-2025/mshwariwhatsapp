import mongoose, { Schema, Document } from 'mongoose';

export interface IKnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  audio?: string;      // base64 voice note (optional) — sent when the question matches
  audioMime?: string;
  media?: string;      // base64 (data URL) or direct URL of an image/video/document
  mediaType?: 'image' | 'video' | 'document';
  fileName?: string;
}

export interface IKnowledgeDocument {
  id: string;
  name: string;
  content: string;
  chars?: number;
}

export interface IGroqKey {
  id: string;
  key: string;
  label?: string;
  status?: 'untested' | 'ok' | 'exhausted' | 'invalid' | 'error';
  lastError?: string;
  lastUsedAt?: Date;
}

export interface IAIAgent extends Document {
  userId: string;
  sessionId?: string | null; // null = legacy/global agent; otherwise per-session
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
  documents: IKnowledgeDocument[];
  groqKeys: IGroqKey[];
  activeGroqKeyId?: string;
  updatedAt?: Date;
}

const KnowledgeEntrySchema = new Schema({
  id: { type: String, required: true },
  question: { type: String, required: true },
  answer: { type: String, default: '' },
  audio: { type: String },      // base64 voice note (optional)
  audioMime: { type: String },
  media: { type: String },      // base64 data URL or direct URL of an attachment
  mediaType: { type: String },  // image | video | document
  fileName: { type: String }
}, { _id: false });

const KnowledgeDocumentSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  content: { type: String, required: true },
  chars: { type: Number, default: 0 }
}, { _id: false });

const GroqKeySchema = new Schema({
  id: { type: String, required: true },
  key: { type: String, required: true },
  label: { type: String, default: '' },
  status: { type: String, default: 'untested' }, // untested | ok | exhausted | invalid | error
  lastError: { type: String, default: '' },
  lastUsedAt: { type: Date }
}, { _id: false });

const AIAgentSchema = new Schema<IAIAgent>({
  userId: { type: String, required: true },
  sessionId: { type: String, default: null },
  name: { type: String, default: 'AI Assistant' },
  role: { type: String, default: 'مساعد ذكي' },
  about: { type: String, default: 'أنا مساعد ذكي أرد على استفسارات العملاء.' },
  welcomeMessage: { type: String, default: 'مرحباً! كيف يمكنني مساعدتك اليوم؟' },
  systemPrompt: { type: String, default: 'أنت مساعد ذكي ومفيد. أجب على أسئلة المستخدمين بلطف واحترافية.' },
  temperature: { type: Number, default: 0.7 },
  aiModel: { type: String, default: 'llama-3.3-70b-versatile' },
  isActive: { type: Boolean, default: false },
  fallbackToAI: { type: Boolean, default: false },
  knowledgeBase: { type: [KnowledgeEntrySchema], default: [] },
  documents: { type: [KnowledgeDocumentSchema], default: [] },
  groqKeys: { type: [GroqKeySchema], default: [] },
  activeGroqKeyId: { type: String, default: '' }
}, { timestamps: true });

// One agent per (user, session). sessionId=null is the legacy/global agent.
AIAgentSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

export const AIAgent = mongoose.model<IAIAgent>('AIAgent', AIAgentSchema);
