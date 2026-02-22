import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GenerateRequestSchema } from "@/types";
import type { GenerateResponse } from "@/types";
import { AI_MODELS, HF_MODEL_IDS, getModelById } from "@/constants/models";
import { IMAGE_SIZES, AI_PROVIDER_ENDPOINTS } from "@/constants/config";
import type { AspectRatio } from "@/constants/config";
import {
  generateStorageKey,
  fetchAsBuffer,
  uploadToR2,
} from "@/services/storage/r2";
import { createGeneration } from "@/services/generation.service";
import { deductCredits, getUserByClerkId } from "@/services/user.service";


// ─── Helper: resolve image dimensions ─────────────────────────────

function getImageSize(aspectRatio: AspectRatio) {
  return IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES["1:1"];
}

// ─── Provider: Hugging Face Inference API ─────────────────────────

async function generateWithHuggingFace(
  prompt: string,
  modelId: string,
  aspectRatio: AspectRatio,
) {
  const hfModelId = HF_MODEL_IDS[modelId];
  if (!hfModelId) {
    throw new Error(`No HuggingFace model mapping for: ${modelId}`);
  }

  const { width, height } = getImageSize(aspectRatio);
  const endpoint = `${AI_PROVIDER_ENDPOINTS.HUGGINGFACE}/${hfModelId}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        width,
        height,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`HuggingFace API error (${response.status}): ${errorBody}`);
  }

  // HuggingFace returns raw image bytes — convert to base64 data URL
  const imageBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(imageBuffer).toString("base64");
  const contentType = response.headers.get("content-type") ?? "image/png";

  return `data:${contentType};base64,${base64}`;
}

// ─── Provider: SiliconFlow ────────────────────────────────────────

async function generateWithSiliconFlow(
  prompt: string,
  modelId: string,
  aspectRatio: AspectRatio,
) {
  const { width, height } = getImageSize(aspectRatio);

  const response = await fetch(AI_PROVIDER_ENDPOINTS.SILICONFLOW, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      image_size: `${width}x${height}`,
      num_inference_steps: 20,
      n: 1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`SiliconFlow API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const imageUrl: string | undefined =
    data?.images?.[0]?.url ?? data?.data?.[0]?.url;

  if (!imageUrl) {
    throw new Error("No image URL returned from SiliconFlow");
  }
  return imageUrl;
}

// ─── POST /api/generate ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const parseResult = GenerateRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(", "),
        },
        { status: 400 },
      );
    }

    const { prompt, modelId, aspectRatio } = parseResult.data;

    // 3. Resolve model cost and deduct credits before the AI call
    
    const modelOption = getModelById(modelId);
    const cost = modelOption?.cost ?? 1;

    const dbUser = await getUserByClerkId(clerkId);
    if (!dbUser) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    try {
      await deductCredits(clerkId, cost);
    } catch (err) {
      if (err instanceof Error && err.message === "INSUFFICIENT_CREDITS") {
        return NextResponse.json<GenerateResponse>(
          { success: false, error: "Insufficient credits" },
          { status: 402 },
        );
      }
      throw err;
    }

    // 4. Route to the appropriate AI provider
    let aiImageUrl: string;

    switch (modelId) {
      case AI_MODELS.SDXL:
      case AI_MODELS.ANIMAGINE_XL_4:
        aiImageUrl = await generateWithHuggingFace(
          prompt,
          modelId,
          aspectRatio as AspectRatio,
        );
        break;

      case AI_MODELS.STABLE_DIFFUSION_3_5_LARGE:
        return NextResponse.json<GenerateResponse>(
          {
            success: false,
            error: "Stable Diffusion 3.5 Large is not currently available",
          },
          { status: 400 },
        );

      default:
        return NextResponse.json<GenerateResponse>(
          { success: false, error: `Unsupported model: ${modelId}` },
          { status: 400 },
        );
    }

    // 5. Generate a unique R2 storage key
    const key = generateStorageKey("IMAGE");

    // 6. Normalize AI output (base64 data URL or https URL) to a Buffer
    const { buffer, mimeType } = await fetchAsBuffer(aiImageUrl);

    // 7. Upload to Cloudflare R2
    const permanentUrl = await uploadToR2({ data: buffer, key, mimeType });

    // 8. Resolve image dimensions and persist generation to the database
    const { width, height } = getImageSize(aspectRatio as AspectRatio);

    const generation = await createGeneration({
      url: permanentUrl,
      storageKey: key,
      mimeType,
      width,
      height,
      prompt,
      model: modelId,
      provider: modelOption?.provider ?? "Unknown",
      creditsCost: cost,
      userId: dbUser.id,
    });



    // 9. Return the persisted generation record
    return NextResponse.json<GenerateResponse>({
      success: true,
      data: { generation },
    });
  } catch (error) {
    console.error("[API /api/generate] Error:", error);

    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";

    return NextResponse.json<GenerateResponse>(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
