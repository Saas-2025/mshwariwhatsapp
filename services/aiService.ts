import { IAIAgent } from '../models/AIAgent.js';
import { AIAgent } from '../models/index.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq decommissioned several models. Auto-map any stored deprecated model to a
// current one so existing AI agents keep replying without manual reconfiguration.
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const MODEL_MIGRATIONS: Record<string, string> = {
  'llama3-70b-8192': DEFAULT_MODEL,
  'llama3-8b-8192': DEFAULT_MODEL,
  'mixtral-8x7b-32768': DEFAULT_MODEL,
  'llama-3.1-70b-versatile': DEFAULT_MODEL,
  'llama-3.3-70b-versatile': DEFAULT_MODEL, // decommissioned by Groq → map to a current model
  'gemma2-9b-it': DEFAULT_MODEL,
};

function normalizeForMatch(s: string): string {
  return (s || '')
    .replace(/[أإآ]/g, 'ا').replace(/[ى]/g, 'ي').replace(/[ة]/g, 'ه')
    .replace(/[ً-ْ]/g, '')
    .toLowerCase();
}

// Build a context block from uploaded documents within a character budget.
// Small docs are included whole; for large docs we pick the paragraphs most
// relevant to the customer's message (lightweight keyword retrieval).
function buildDocsContext(documents: { name: string; content: string }[], userMessage: string, budget: number): string {
  if (!documents || documents.length === 0) return '';
  const whole = documents.map(d => `### ${d.name}\n${d.content}`).join('\n\n');
  if (whole.length <= budget) return whole;

  const words = Array.from(new Set(normalizeForMatch(userMessage).split(/\s+/).filter(w => w.length > 2)));
  const paras: { name: string; text: string; score: number }[] = [];
  for (const d of documents) {
    for (const p of d.content.split(/\n{2,}/)) {
      const text = p.trim();
      if (!text) continue;
      const np = normalizeForMatch(text);
      let score = 0;
      for (const w of words) if (np.includes(w)) score++;
      paras.push({ name: d.name, text, score });
    }
  }
  paras.sort((a, b) => b.score - a.score);
  let out = '';
  for (const p of paras) {
    if (out.length + p.text.length + p.name.length + 8 > budget) continue;
    out += `### ${p.name}\n${p.text}\n\n`;
  }
  return out.trim() || whole.slice(0, budget);
}

export async function getAIResponse(
  agent: IAIAgent,
  userMessage: string,
  history: { role: 'user' | 'assistant'; text: string }[] = []
): Promise<string | null> {
  if (!agent.isActive) {
    console.log('[AI] Agent is not active, skipping AI response');
    return null;
  }

  // Build the candidate Groq key pool: per-session keys (with failover) or the env key.
  const dbKeys = (agent.groqKeys || []).filter((k: any) => k && k.key).map((k: any) => ({ id: k.id, key: k.key }));
  const candidates = dbKeys.length > 0
    ? dbKeys
    : (process.env.GROQ_API_KEY ? [{ id: 'env', key: process.env.GROQ_API_KEY }] : []);
  if (candidates.length === 0) {
    console.error('[AI] No Groq API key configured (no per-session keys and no GROQ_API_KEY).');
    return null;
  }

  try {
    // Build system prompt with knowledge base context
    let systemContent = agent.systemPrompt || 'أنت مساعد ذكي ومفيد.';

    if (agent.name) systemContent += `\n\nاسمك: ${agent.name}`;
    if (agent.role) systemContent += `\nدورك: ${agent.role}`;
    if (agent.about) systemContent += `\nنبذة عن النشاط: ${agent.about}`;

    if (agent.knowledgeBase && agent.knowledgeBase.length > 0) {
      systemContent += '\n\n===== قاعدة المعرفة (مصدر الحقيقة) =====';
      agent.knowledgeBase.forEach((entry, i) => {
        systemContent += `\n${i + 1}) عن: ${entry.question}\n   المعلومة: ${entry.answer}`;
      });
      systemContent += '\n===== نهاية قاعدة المعرفة =====';

      systemContent += '\n\nتعليمات مهمة جداً:'
        + '\n- افهم *قصد* ومعنى رسالة العميل، ولا تشترط تطابق كلماته حرفياً مع ما في قاعدة المعرفة.'
        + '\n- إذا كان معنى سؤاله يطابق أو يقترب من أي معلومة بالأعلى (ولو بصياغة مختلفة أو لهجة عامية أو أخطاء إملائية)، فاعتمد على تلك المعلومة في ردك.'
        + '\n- إذا لم تُغطِّ قاعدة المعرفة سؤاله، فردّ بأدب حسب دورك بدون اختلاق أي معلومة أو سعر أو تفصيلة غير موجودة، ووجّهه للتواصل مع خدمة العملاء إن لزم.';
    } else {
      systemContent += '\n\nردّ حسب دورك بإيجاز، ولا تختلق معلومات أو أسعاراً غير مؤكدة.';
    }

    // Inject uploaded reference documents (txt/pdf/word/json/md)
    if (agent.documents && agent.documents.length > 0) {
      const docsCtx = buildDocsContext(agent.documents as any, userMessage, 12000);
      if (docsCtx) {
        systemContent += '\n\n===== مستندات مرجعية (اعتمد عليها للإجابة بدقة وتفصيل) =====\n'
          + docsCtx
          + '\n===== نهاية المستندات =====';
      }
    }

    systemContent += '\n\nردّ باللغة العربية (أو بلهجة العميل) ما لم يطلب لغة أخرى، بأسلوب ودّي ومختصر.';
    systemContent += '\nاكتب الرد مباشرةً بنص الإجابة فقط، ولا تبدأ ردك بكلمة "الإجابة" أو "الجواب" أو "ج:" أو "س:".';

    const requestBody = JSON.stringify({
      model: MODEL_MIGRATIONS[agent.aiModel] || agent.aiModel || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemContent },
        // Prior turns of THIS conversation give the model full context/memory
        ...history.filter(h => h.text).map(h => ({ role: h.role, content: h.text })),
        { role: 'user', content: userMessage }
      ],
      temperature: agent.temperature ?? 0.7,
      max_tokens: 1024
    });

    // Try each key in order; on rate-limit/quota (429) move to the NEXT key automatically.
    const statusUpdates: Record<string, { status: string; lastError: string }> = {};
    let reply: string | null = null;
    let usedKeyId = '';

    for (const cand of candidates) {
      let resp: Response | undefined;
      // Retry only pure 5xx on the same key; 429/auth errors move on immediately.
      for (let attempt = 0; attempt < 2; attempt++) {
        resp = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${cand.key}`, 'Content-Type': 'application/json' },
          body: requestBody
        });
        if (resp.ok || ![500, 502, 503].includes(resp.status)) break;
        await new Promise(r => setTimeout(r, 800));
      }

      if (resp && resp.ok) {
        const data: any = await resp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          reply = content.trim();
          usedKeyId = cand.id;
          statusUpdates[cand.id] = { status: 'ok', lastError: '' };
          break;
        }
        statusUpdates[cand.id] = { status: 'error', lastError: 'empty response' };
        continue;
      }

      const code = resp?.status;
      const errText = resp ? await resp.text().catch(() => '') : 'no response';
      if (code === 429) {
        statusUpdates[cand.id] = { status: 'exhausted', lastError: 'تجاوز الحد (429)' };
        console.warn(`[AI] Groq key "${cand.id}" hit its limit (429) — switching to the next key...`);
      } else if (code === 401 || code === 403) {
        statusUpdates[cand.id] = { status: 'invalid', lastError: `مفتاح غير صالح (${code})` };
        console.warn(`[AI] Groq key "${cand.id}" invalid (${code}) — switching to the next key...`);
      } else {
        statusUpdates[cand.id] = { status: 'error', lastError: `HTTP ${code}: ${errText.slice(0, 120)}` };
        console.warn(`[AI] Groq key "${cand.id}" error (${code}) — switching to the next key...`);
      }
    }

    // Persist per-key status + which key is currently working (for the dashboard)
    if (dbKeys.length > 0 && (agent as any)._id && Object.keys(statusUpdates).length > 0) {
      try {
        const updated = (agent.groqKeys || []).map((k: any) => statusUpdates[k.id]
          ? { ...k, status: statusUpdates[k.id].status, lastError: statusUpdates[k.id].lastError, lastUsedAt: new Date() }
          : k);
        await AIAgent.updateOne(
          { _id: (agent as any)._id },
          { $set: { groqKeys: updated, activeGroqKeyId: usedKeyId || (agent as any).activeGroqKeyId || '' } }
        );
      } catch (e) {
        console.error('[AI] Failed to persist Groq key status:', e);
      }
    }

    if (!reply) {
      console.error('[AI] All Groq keys failed (exhausted/invalid). No reply produced.');
      return null;
    }

    // Strip a leading "الإجابة:" / "ج:" the model may echo from the knowledge format.
    reply = reply.replace(/^\s*(?:الإجابة|الاجابة|الجواب|إجابة|اجابة|ج)\s*[:：.\-–]\s*/u, '').trim();
    return reply;
  } catch (error) {
    console.error('[AI] Error calling Groq API:', error);
    return null;
  }
}
