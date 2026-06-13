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
  userMessage: string
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
    if (agent.role) systemContent += `\nوظيفتك: ${agent.role}`;
    if (agent.about) systemContent += `\nعنك: ${agent.about}`;

    if (agent.knowledgeBase && agent.knowledgeBase.length > 0) {
      systemContent += '\n\n--- قواعد المعرفة (استخدمها للإجابة) ---';
      for (const entry of agent.knowledgeBase) {
        systemContent += `\n\nس: ${entry.question}\nج: ${entry.answer}`;
      }
      systemContent += '\n\n--- استخدم المعلومات أعلاه للإجابة على أسئلة المستخدم ---';
    }

    systemContent += '\n\nقم بالرد باللغة العربية دائماً ما لم يطلب المستخدم لغة أخرى.';

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
    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error('[AI] No response content from Groq API');
      return null;
    }

    return reply.trim();
  } catch (error) {
    console.error('[AI] Error calling Groq API:', error);
    return null;
  }
}
