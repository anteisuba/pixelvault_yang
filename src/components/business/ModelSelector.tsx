"use client";

import { getAvailableModels } from "@/constants/models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ModelSelectorProps {
  /** Currently selected model ID */
  value: string;
  /** Callback when the selected model changes */
  onChange: (value: string) => void;
}

/**
 * Dropdown selector for choosing an AI image generation model.
 * Only displays models that are currently available.
 */
export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const availableModels = getAvailableModels();

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">AI Model</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center justify-between gap-3">
                <span>{model.label}</span>
                <span className="text-xs text-muted-foreground">
                  {model.cost} credits · {model.provider}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
