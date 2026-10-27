# Morphic Blocks

A TypeScript framework built on Google Blockly that renders one block model in
multiple developer-defined representations: icons, words, code, or anything
you design. Its main use is the gradual transition from block-based to
text-based programming.

This is the development repository. To use the framework in an app, see the
[package README](packages/morphic-blocks/README.md) and the
[documentation](https://docs.morphicblocks.com).

## Core Idea

Each block has named **elements**, its visual parts (a title, an icon, a code
template per language). A global `elementTypes` registry says what each
element name is: `text`, `code`, `image` or `custom`.

- **Modes** choose which elements the toolbox tiles show; one CSS file per
  mode styles them.
- **Views** (workspaces and codespaces, declared by name) each show one code
  element: blocks in Python, text in JavaScript, side by side.
- **Presets** switch the toolbox and the views together, e.g. from icons to
  code over a course.

The framework makes **no external requests**: Blockly's images and sounds load
from the embedding site.

## Use Cases

- Gradual block-to-text transition, the primary one
- Localization: the same blocks with labels in several languages
- Accessibility: high-contrast, large-text, or screen-reader modes
- Age-appropriate rendering: icons for young learners, text for older ones
- Comparing languages: one program in Python, Java and C++ side by side
- Expert and novice views of the same blocks
- Domain-specific visual languages: music, robotics, data science

## Repository

```text
morphic-blocks/
├── apps/
│   └── sandbox/            # Development app
├── packages/
│   ├── morphic-blocks/     # The framework (npm: morphic-blocks)
│   └── themes/             # Code view themes (npm: @morphicblocks/themes)
└── CLAUDE.md               # Architecture notes
```

## Development

```bash
bun install        # install
bun run dev        # start the sandbox
bun run build      # build the packages and the sandbox
bun run test       # run the tests
```

The sandbox is the development test bed: every feature can be tried there
before it ships. It uses the framework's source directly, so changes show up
without a build; the themes package and the media plugin are read from their
builds (`bun run build:package`).

The tests run with [Vitest](https://vitest.dev) in
[jsdom](https://github.com/jsdom/jsdom), since Blockly needs a DOM. They live
in each package's `test/` folder and check generated text, not rendering.

## Releases

Publishing to npm runs in CI (`.github/workflows/publish.yml`) when a GitHub
release is published. A release tagged `themes-v…` publishes the themes
package, any other the framework.

## Links

- **Website:** <https://morphicblocks.com>
- **Docs:** <https://docs.morphicblocks.com>
- **Playground:** <https://playground.morphicblocks.com>

## License

[Apache-2.0](LICENSE) © Gottfried Wilhelm Leibniz Universität Hannover. See
[NOTICE](NOTICE). The Morphic Blocks name and logo are trademarks.
