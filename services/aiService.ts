import { IAIAgent } from '../models/AIAgent.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq decommissioned several models. Auto-map any stored deprecated model to a
// current one so existing AI agents keep replying without manual reconfiguration.
const MODEL_MIGRATIONS: Record<string, string> = {
  'llama3-70b-8192': 'llama-3.3-70b-versatile',
  'llama3-8b-8192': 'llama-3.1-8b-instant',
  'mixtral-8x7b-32768': 'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile': 'llama-3.3-70b-versatile',
  'gemma2-9b-it': 'llama-3.1-8b-instant',
};

export async function getAIResponse(
  agent: IAIAgent,
  userMessage: string,
  history: { role: 'user' | 'assistant'; text: string }[] = []
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[AI] GROQ_API_KEY is not set in environment');
    return null;
  }

  if (!agent.isActive) {
    console.log('[AI] Agent is not active, skipping AI response');
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

    systemContent += '\n\nردّ باللغة العربية (أو بلهجة العميل) ما لم يطلب لغة أخرى، بأسلوب ودّي ومختصر.';
    systemContent += '\nاكتب الرد مباشرةً بنص الإجابة فقط، ولا تبدأ ردك بكلمة "الإجابة" أو "الجواب" أو "ج:" أو "س:".';

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL_MIGRATIONS[agent.aiModel] || agent.aiModel || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemContent },
          // Prior turns of THIS conversation give the model full context/memory
          ...history.filter(h => h.text).map(h => ({ role: h.role, content: h.text })),
          { role: 'user', content: userMessage }
        ],
        temperature: agent.temperature ?? 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI] Groq API error (${response.status}): ${errorText}`);
      return null;
    }

    const data: any = await response.json();
    let reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error('[AI] No response content from Groq API');
      return null;
    }

    reply = reply.trim();
    // Strip a leading "الإجابة:" / "الجواب:" / "ج:" the model may echo from the
    // knowledge-base "س:/ج:" format, so the customer only sees the answer text.
    reply = reply.replace(/^\s*(?:الإجابة|الاجابة|الجواب|إجابة|اجابة|ج)\s*[:：.\-–]\s*/u, '').trim();

    return reply;
  } catch (error) {
    console.error('[AI] Error calling Groq API:', error);
    return null;
  }
}
