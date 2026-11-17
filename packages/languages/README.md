# @morphicblocks/languages

Languages for [Morphic Blocks](https://morphicblocks.com): how Python, JavaScript, Java, Go, Rust and C++ write the standard blocks of `@morphicblocks/blocks`, each with the settings of its code element (quotes, type names, empty slots, highlighting).

```bash
npm install @morphicblocks/blocks @morphicblocks/languages
```

```ts
import { define, standard } from "@morphicblocks/blocks";
import { java, python } from "@morphicblocks/languages";

const { definitions, behaviors } = define({ blocks: standard, languages: { python, java } }, own);
```

The key you give a language is the name of its code element. Your own `code` settings change single settings of a language, and an own language is an object of the same shape. See the [languages guide](https://docs.morphicblocks.com/packages/languages/) for more.
