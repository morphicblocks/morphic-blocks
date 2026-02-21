import type { MorphicBehaviorDefinition, MorphicBlockBehavior, MorphicCodeBehavior } from "./types";

export function getLifecycleBehavior(
  behavior: MorphicBehaviorDefinition | undefined
): MorphicBlockBehavior | undefined {
  if (!behavior || typeof behavior === "function") {
    return undefined;
  }
  return behavior;
}

export function getCodeBehavior(behavior: MorphicBehaviorDefinition | undefined): MorphicCodeBehavior | undefined {
  if (!behavior) {
    return undefined;
  }
  if (typeof behavior === "function") {
    return behavior;
  }
  return behavior.generate;
}

