# @morphicblocks/blocks

Standard blocks for [Morphic Blocks](https://morphicblocks.com): about 40 common programming blocks (output, values, variables, math, text, logic, control, functions, lists, classes), each with its behavior. A language says how each is written; take ready ones from `@morphicblocks/languages` or write your own.

```bash
npm install @morphicblocks/blocks @morphicblocks/languages
```

```ts
import { MorphicBlocks } from "morphic-blocks";
import { define, standard } from "@morphicblocks/blocks";
import { java, python } from "@morphicblocks/languages";
import own from "./definitions.json";

const { definitions, behaviors } = define({ blocks: standard, languages: { python, java } }, own);
new MorphicBlocks(definitions, behaviors);
```

Your own definitions win: add elements to a standard block, change its template, or add blocks of your own. `pick(standard, ["print", "if"])` takes some of the blocks. See the [standard blocks guide](https://docs.morphicblocks.com/packages/standard-blocks/) for more.
