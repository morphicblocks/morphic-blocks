import type { MorphicBlockSet } from "./types";

export interface ResolvedBlockSets {
  /** Each set's blocks, in the set's order (the toolbox's order when categories are off). */
  lists: Map<string, string[]>;
  errors: string[];
  warnings: string[];
}

/**
 * The blocks of every set in `blockSets`. A set is a list, or another set
 * (`extends`) with blocks added at the end and blocks removed.
 */
export function resolveBlockSets(
  blockSets: Record<string, MorphicBlockSet> = {},
  isBlock: (identifier: string) => boolean,
): ResolvedBlockSets {
  const lists = new Map<string, string[]>();
  const errors: string[] = [];
  const warnings: string[] = [];

  const checkBlocks = (name: string, blocks: string[]): void => {
    for (const block of blocks) {
      if (!isBlock(block)) errors.push(`Block set "${name}": "${block}" is no block in the definitions.`);
    }
  };

  const resolve = (name: string, chain: string[]): string[] => {
    const known = lists.get(name);
    if (known) return known;
    const set = blockSets[name]!;
    if (Array.isArray(set)) {
      checkBlocks(name, set);
      lists.set(name, set);
      return set;
    }
    let blocks: string[] = [];
    if (set.extends === name || chain.includes(set.extends)) {
      errors.push(`Block set "${name}": extends "${set.extends}", which extends it again (${[...chain, name, set.extends].join(" → ")}).`);
    } else if (!blockSets[set.extends]) {
      errors.push(`Block set "${name}": extends "${set.extends}", which is no block set.`);
    } else {
      blocks = resolve(set.extends, [...chain, name]);
    }
    const add = set.add ?? [];
    const remove = set.remove ?? [];
    checkBlocks(name, [...add, ...remove]);
    for (const block of remove) {
      if (!blocks.includes(block)) warnings.push(`Block set "${name}": removes "${block}", which "${set.extends}" does not have.`);
    }
    const list = [...blocks.filter((block) => !remove.includes(block)), ...add.filter((block) => !blocks.includes(block))];
    lists.set(name, list);
    return list;
  };

  for (const name of Object.keys(blockSets)) resolve(name, []);
  return { lists, errors, warnings };
}
