import { z } from "zod";

const defaultNexusModel = "gemini-3.8-flash";

export const aiHtmlDocumentSchema = z.object({
  html: z.string().trim().min(1200).max(300_000)
});

function getNexusConfig() {
  return {
    apiKey: process.env.NEXUS_API_KEY,
    baseUrl: (process.env.NEXUS_API_BASE_URL || "https://api.nexus-hub.tech/v1").replace(/\/$/, ""),
    defaultModel: process.env.NEXUS_MODEL || defaultNexusModel
  };
}

function extractChatText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || item?.content || "").join("\n").trim();
  }
  return "";
}

function extractDeltaText(payload) {
  const delta = payload?.choices?.[0]?.delta?.content ?? payload?.delta?.content;
  if (typeof delta === "string") return delta;
  if (Array.isArray(delta)) {
    return delta.map((item) => item?.text || item?.content || "").join("");
  }
  return "";
}

async function readStreamingChatResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error("Nexus Hub вернул некорректный ответ вместо SSE-потока.");
    }
    return {
      text: extractChatText(payload),
      model: payload.model || null,
      requestId: payload.id || null,
      usage: payload.usage || null
    };
  }

  if (!response.body) throw new Error("Nexus Hub открыл SSE, но не вернул поток данных.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model = null;
  let requestId = null;
  let usage = null;

  function consumeEvent(event) {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") return;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (payload?.error) {
      throw new Error(payload.error.message || payload.error || "ошибка внутри SSE-потока");
    }

    const deltaText = extractDeltaText(payload);
    if (deltaText) text += deltaText;
    else if (!text) text = extractChatText(payload);
    model = payload.model || model;
    requestId = payload.id || requestId;
    usage = payload.usage || usage;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      consumeEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer.replace(/\r\n/g, "\n"));
  return { text: text.trim(), model, requestId, usage };
}

function stripHtmlFence(value) {
  return String(value || "")
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function buildAiHtmlPrompt(product, content) {
  return [
    "Создай уникальный production-ready одностраничный товарный лендинг как один полный HTML-документ.",
    "Верни только HTML от <!doctype html> до </html>, без Markdown, пояснений и блоков кода.",
    "Ты professional product designer, CRO-специалист и frontend-разработчик. Используй креативное мышление, но сохраняй ясную коммерческую структуру и сильный CTA.",
    "Собери современный all-in-one pattern: hero, преимущества, описание, характеристики, цена, фотогалерея, FAQ и финальный CTA. Таблицы, графики и другие UI/UX-элементы добавляй только тогда, когда для них есть реальные данные.",
    "Автоматически подбери цветовую гамму, типографику, композицию и визуальный ритм по контексту товара. Страница должна выглядеть самостоятельной, а не как карточка маркетплейса.",
    "Для визуального направления можешь вдохновляться сильными UI-концепциями с Pinterest, Dribbble и Envato, а также шаблонами Figma, Adobe и DeviantArt. Не копируй конкретную работу или бренд один в один: переосмысливай композицию и создавай оригинальный дизайн под этот товар.",
    "Разрешены адаптивные inline CSS и JavaScript для слайдеров, модальных окон, вкладок, accordion, анимаций, таблиц и графиков.",
    "Разрешены CDN только с cdn.jsdelivr.net, cdnjs.cloudflare.com, fonts.googleapis.com и fonts.gstatic.com. Можно использовать Swiper, Chart.js, GSAP и Lucide.",
    "Не используй eval, new Function, document.write, cookies, localStorage, sessionStorage, fetch, XMLHttpRequest, WebSocket, формы отправки данных и автоматические редиректы.",
    "Не создавай внешние ссылки, кроме точного product.productUrl и разрешённых CDN. Все CTA должны вести строго на product.productUrl.",
    "Используй изображения только из product.images. Не вставляй другие товарные изображения и не заменяй их заглушками.",
    "Не выдумывай характеристики, цифры, скидки, рейтинг, наличие, доставку, гарантию, сертификацию или комплектацию. Используй только product и validatedLandingContent.",
    "Обязательно сохрани точные product.title, product.productId, цену из product.priceWithoutWallet или product.price и ключевые факты из validatedLandingContent.",
    "Добавь корректные title, meta description, Open Graph, Twitter Card и JSON-LD Product на основе переданных данных.",
    "Интерфейс должен быть адаптивным на 320, 375, 768, 1024 и больших экранах, без горизонтального скролла.",
    "JavaScript должен работать внутри sandboxed iframe без доступа к родительскому окну.",
    "Сохраняй документ компактным: не более 60000 символов. Не вставляй base64, data URI, огромные SVG и длинные библиотеки прямо в HTML.",
    `product=${JSON.stringify(product)}`,
    `validatedLandingContent=${JSON.stringify(content)}`
  ].join("\n");
}

export async function generateAiHtmlWithNexus(product, content, requestedModel) {
  const { apiKey, baseUrl, defaultModel } = getNexusConfig();
  if (!apiKey) throw new Error("NEXUS_API_KEY не настроен на backend.");

  const model = String(requestedModel || defaultModel).trim();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Ты senior web designer и frontend-разработчик товарных лендингов. Генерируй только цельный HTML-документ, строго по фактам из переданных JSON. Разрешены CSS, JavaScript и перечисленные CDN. Не добавляй пояснения или Markdown."
        },
        { role: "user", content: buildAiHtmlPrompt(product, content) }
      ],
      max_tokens: 8_192,
      stream: true
    }),
    signal: AbortSignal.timeout(240_000)
  });

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed?.error?.message || parsed?.message || body;
    } catch {
      // Keep the gateway response for the concise diagnostic below.
    }
    throw new Error(`Nexus Hub вернул HTTP ${response.status} при генерации HTML: ${String(detail).replace(/\s+/g, " ").slice(0, 300)}`);
  }

  const streamed = await readStreamingChatResponse(response);
  if (!streamed.text) throw new Error("Nexus Hub завершил SSE-поток без HTML.");

  const result = aiHtmlDocumentSchema.safeParse({ html: stripHtmlFence(streamed.text) });
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`HTML от ${model} не прошёл Zod-контракт: ${issue?.message || "validation error"}`);
  }

  return {
    html: result.data.html,
    model: streamed.model || model,
    requestId: streamed.requestId,
    usage: streamed.usage
  };
}
