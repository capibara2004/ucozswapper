import { randomInt } from "node:crypto";
import { z } from "zod";

const landingPresets = [
  "spotlight",
  "editorial",
  "spec-driven",
  "red_dark",
  "green_dark",
  "toxic",
  "midnight",
  "mindflower",
  "grapeleaf",
  "greentree",
  "colorspace",
  "graymoon"
];
const landingAccents = ["violet", "electric-blue", "emerald", "coral"];
const landingHeroLayouts = ["media-left", "media-right"];
const landingSliders = ["rail", "cards", "cinematic"];
const defaultNexusModel = "gemini-3.8-flash";

function getNexusConfig() {
  return {
    apiKey: process.env.NEXUS_API_KEY,
    baseUrl: (process.env.NEXUS_API_BASE_URL || "https://api.nexus-hub.tech/v1").replace(/\/$/, ""),
    defaultModel: process.env.NEXUS_MODEL || defaultNexusModel
  };
}

function randomItem(values) {
  return values[randomInt(values.length)];
}

export function createRandomLandingDesign() {
  const requestedPreset = String(process.env.LANDING_TEMPLATE_MODE || "").trim();
  const preset = landingPresets.includes(requestedPreset) ? requestedPreset : randomItem(landingPresets);
  const presetAccents = {
    red_dark: "coral",
    green_dark: "emerald",
    toxic: "emerald",
    midnight: "electric-blue",
    mindflower: "violet",
    grapeleaf: "violet",
    greentree: "emerald",
    colorspace: "electric-blue",
    graymoon: "electric-blue"
  };
  return {
    preset,
    accent: presetAccents[preset] || randomItem(landingAccents),
    heroLayout: randomItem(landingHeroLayouts),
    slider: randomItem(landingSliders)
  };
}

export const landingContentSchema = z.object({
  design: z.object({
    preset: z.enum([
      "spotlight",
      "editorial",
      "spec-driven",
      "red_dark",
      "green_dark",
      "toxic",
      "midnight",
      "mindflower",
      "grapeleaf",
      "greentree",
      "colorspace",
      "graymoon"
    ]),
    accent: z.enum(["violet", "electric-blue", "emerald", "coral"]),
    heroLayout: z.enum(["media-left", "media-right"]),
    slider: z.enum(["rail", "cards", "cinematic"])
  }),
  seo: z.object({
    title: z.string().min(1).max(70),
    description: z.string().min(1).max(180),
    slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
    keywords: z.array(z.string().min(1).max(48)).min(3).max(8)
  }),
  hero: z.object({
    eyebrow: z.string().min(1).max(60),
    headline: z.string().min(1).max(120),
    subheadline: z.string().min(1).max(240),
    image: z.string().url().nullable()
  }),
  benefits: z.array(z.string().min(1).max(180)).min(1).max(6),
  specifications: z.array(z.object({
    label: z.string().min(1).max(80),
    value: z.string().min(1).max(180)
  })).max(12),
  faq: z.array(z.object({
    question: z.string().min(1).max(140),
    answer: z.string().min(1).max(400)
  })).max(6),
  cta: z.object({
    text: z.string().min(1).max(60),
    url: z.string().url(),
    supportingText: z.string().min(1).max(120)
  }),
  warnings: z.array(z.string().max(240)).max(10).default([])
});

const modelLandingContentSchema = landingContentSchema.omit({ design: true });

const landingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["seo", "hero", "benefits", "specifications", "faq", "cta", "warnings"],
  properties: {
    seo: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "slug", "keywords"],
      properties: {
        title: { type: "string", maxLength: 70 },
        description: { type: "string", maxLength: 180 },
        slug: { type: "string", maxLength: 80, pattern: "^[a-z0-9-]+$" },
        keywords: { type: "array", items: { type: "string", maxLength: 48 }, minItems: 3, maxItems: 8 }
      }
    },
    hero: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "headline", "subheadline", "image"],
      properties: {
        eyebrow: { type: "string", maxLength: 60 },
        headline: { type: "string", maxLength: 120 },
        subheadline: { type: "string", maxLength: 240 },
        image: { type: ["string", "null"] }
      }
    },
    benefits: { type: "array", items: { type: "string", maxLength: 180 }, minItems: 1, maxItems: 6 },
    specifications: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: {
          label: { type: "string", maxLength: 80 },
          value: { type: "string", maxLength: 180 }
        }
      }
    },
    faq: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: {
          question: { type: "string", maxLength: 140 },
          answer: { type: "string", maxLength: 400 }
        }
      }
    },
    cta: {
      type: "object",
      additionalProperties: false,
      required: ["text", "url", "supportingText"],
      properties: {
        text: { type: "string", maxLength: 60 },
        url: { type: "string" },
        supportingText: { type: "string", maxLength: 120 }
      }
    },
    warnings: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 10 }
  }
};

function buildLandingPrompt(product) {
  const platformName = product.platform || "маркетплейса";
  return [
    `Спроектируй контент конверсионного одностраничного лендинга по подтверждённой карточке товара ${platformName}.`,
    "Пиши на русском языке и верни только JSON по заданной схеме.",
    "Цель: быстро объяснить ценность товара, удержать внимание и привести пользователя к честному CTA перехода на исходную карточку.",
    "Не выдумывай характеристики, цифры, скидки, доставку, гарантию, рейтинг, наличие и комплектацию.",
    "Используй только факты из product. Если факта нет — не добавляй его, а кратко укажи это в warnings.",
    "Сформулируй 3–6 конкретных выгод на языке покупателя, но без неподтверждённых обещаний и искусственного дефицита.",
    "Заголовок должен быть конкретным и сильным, подзаголовок — раскрывать кому и зачем подходит товар.",
    "Не возвращай CSS, HTML или инструкции дизайна: внешний шаблон, цвет, hero-композицию и слайдер случайно выбирает backend.",
    "SEO-текст должен естественно включать название, тип товара и ключевые характеристики без переспама. Верни 3–8 релевантных keywords.",
    "CTA сформулируй как ясное действие. supportingText должен снимать сомнение и честно сообщать, что покупка оформляется на маркетплейсе.",
    "CTA должен вести строго на product.productUrl, hero.image — на одно из product.images или null.",
    "SEO title — до 70 символов, description — до 180 символов, slug — латиница, цифры и дефисы.",
    `product=${JSON.stringify(product)}`
  ].join("\n");
}

function extractChatText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || item?.content || "").join("\n").trim();
  }
  return "";
}

export function getLlmRuntimeInfo() {
  const { apiKey, defaultModel } = getNexusConfig();
  return {
    configured: Boolean(apiKey),
    provider: "Nexus Hub",
    model: defaultModel,
    protocol: "chat/completions"
  };
}

export async function listNexusModels() {
  const { apiKey, baseUrl, defaultModel } = getNexusConfig();
  if (!apiKey) {
    return {
      defaultModel,
      models: [defaultModel],
      source: "fallback",
      warning: "NEXUS_API_KEY не настроен на backend."
    };
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000)
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 180)}`);
    }

    const payload = JSON.parse(body);
    const entries = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload)
          ? payload
          : [];
    const discovered = entries
      .map((entry) => typeof entry === "string" ? entry : entry?.id || entry?.name || entry?.model)
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const models = [...new Set([defaultModel, ...discovered])];
    if (models.length === 1 && discovered.length === 0) throw new Error("шлюз вернул пустой список моделей");

    return { defaultModel, models, source: "nexus" };
  } catch (error) {
    return {
      defaultModel,
      models: [defaultModel],
      source: "fallback",
      warning: `Не удалось получить список моделей Nexus: ${error.message}`
    };
  }
}

export async function generateLandingWithNexus(product, requestedModel) {
  const { apiKey, baseUrl, defaultModel } = getNexusConfig();
  if (!apiKey) throw new Error("NEXUS_API_KEY не настроен на backend.");

  const model = String(requestedModel || defaultModel).trim();
  const supportsStructuredOutput = !model.toLowerCase().includes("deepseek");
  const userPrompt = supportsStructuredOutput
    ? buildLandingPrompt(product)
    : `${buildLandingPrompt(product)}\njson_schema=${JSON.stringify(landingJsonSchema)}`;
  const requestPayload = {
    model,
    messages: [
      {
        role: "system",
        content: "Ты senior CRO-копирайтер и SEO-архитектор товарных лендингов. Создавай убедительную, кликабельную, но строго достоверную структуру только из ProductDTO. Не придумывай факты. Отвечай исключительно валидным JSON по переданной строгой схеме. Не используй Markdown и блоки кода."
      },
      { role: "user", content: userPrompt }
    ],
    max_tokens: supportsStructuredOutput ? 4096 : 8192
  };

  if (supportsStructuredOutput) {
    requestPayload.response_format = {
      type: "json_schema",
      json_schema: {
        name: "landing_content",
        strict: true,
        schema: landingJsonSchema
      }
    };
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(90_000)
  });

  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed?.error?.message || parsed?.message || body;
    } catch {
      // Keep the raw gateway response for a concise diagnostic below.
    }
    throw new Error(`Nexus Hub вернул HTTP ${response.status}: ${String(detail).replace(/\s+/g, " ").slice(0, 300)}`);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Nexus Hub вернул некорректный JSON-ответ шлюза.");
  }

  const modelText = extractChatText(payload);
  if (!modelText) throw new Error("Nexus Hub не вернул текст результата.");

  let rawContent;
  try {
    const normalizedModelText = modelText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    rawContent = JSON.parse(normalizedModelText);
  } catch {
    throw new Error(`${model} не вернул валидный JSON-контент лендинга.`);
  }

  if (rawContent?.hero) {
    rawContent.hero.image = product.images.includes(rawContent.hero.image)
      ? rawContent.hero.image
      : product.images[0] || null;
  }
  if (rawContent?.cta) {
    rawContent.cta.url = product.productUrl;
  }

  const validated = modelLandingContentSchema.safeParse(rawContent);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    throw new Error(`Ответ ${model} не прошёл схему LandingContent: ${issue?.path?.join(".") || "root"} — ${issue?.message || "validation error"}`);
  }

  const content = landingContentSchema.parse({
    design: createRandomLandingDesign(),
    ...validated.data
  });

  return {
    content,
    mode: "nexus",
    provider: "Nexus Hub",
    model: payload.model || model,
    requestId: payload.id || null,
    usage: payload.usage || null,
    warnings: content.warnings
  };
}
