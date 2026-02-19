/**
 * AI Model definitions and configuration
 */

/** Supported AI model identifiers */
export enum AI_MODELS {
  SDXL = "sdxl",
  ANIMAGINE_XL_4 = "animagine-xl-4.0",
  STABLE_DIFFUSION_3_5_LARGE = "stable-diffusion-3.5-large",
}

/** Hugging Face model repository IDs */
export const HF_MODEL_IDS: Record<string, string> = {
  [AI_MODELS.SDXL]: "stabilityai/stable-diffusion-xl-base-1.0",
  [AI_MODELS.ANIMAGINE_XL_4]: "cagliostrolab/animagine-xl-4.0",
};

/** Model option configuration */
export interface ModelOption {
  /** Unique model identifier (matches AI_MODELS enum) */
  id: AI_MODELS;
  /** Display label */
  label: string;
  /** Credit cost per generation */
  cost: number;
  /** AI provider name */
  provider: string;
  /** Short description of the model */
  description: string;
  /** Whether the model is currently available for use */
  available: boolean;
}

/** All model options with their configuration */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: AI_MODELS.SDXL,
    label: "Stable Diffusion XL",
    cost: 1,
    provider: "HuggingFace",
    description: "High-resolution image generation with excellent detail",
    available: true,
  },
  {
    id: AI_MODELS.ANIMAGINE_XL_4,
    label: "Animagine XL 4.0",
    cost: 1,
    provider: "HuggingFace",
    description: "High-quality anime-style image generation",
    available: true,
  },
  {
    id: AI_MODELS.STABLE_DIFFUSION_3_5_LARGE,
    label: "Stable Diffusion 3.5 Large",
    cost: 1,
    provider: "SiliconFlow",
    description: "Open-source model with strong artistic capabilities",
    available: false,
  },
];

/** Get only the currently available models */
export const getAvailableModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter((model) => model.available);

/** Get a model option by its ID */
export const getModelById = (id: AI_MODELS): ModelOption | undefined =>
  MODEL_OPTIONS.find((model) => model.id === id);
