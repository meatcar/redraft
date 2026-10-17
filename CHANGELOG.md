# Changelog

All notable changes to Redraft. Generated from [Conventional Commits](https://www.conventionalcommits.org) by [git-cliff](https://git-cliff.org).

## [0.2.0](https://github.com/meatcar/redraft/compare/v0.1.0...v0.2.0) - 2026-10-17

### 🚀 Features

- *(web)* Mobile layout with settings popover ([f8b261c](https://github.com/meatcar/redraft/commit/f8b261c1cc09005181e889abd2400244938781b1))
- *(web)* Complete bare custom endpoints into URLs ([86486dc](https://github.com/meatcar/redraft/commit/86486dc2dea290be5373c9f1281e917a5e87a362))
- *(web)* Group models by vendor in collapsible sections ([fa829c1](https://github.com/meatcar/redraft/commit/fa829c10af9b42e4ac228b0a928c57a9e0ea8087))

### 🚜 Refactor

- *(web)* Switch shadcn primitives from Radix to Base UI ([31e6603](https://github.com/meatcar/redraft/commit/31e6603e195c0b3ba195f49d71d229237b664217))

### 📚 Documentation

- Rewrite the README for visitors, with a screenshot ([9e668bb](https://github.com/meatcar/redraft/commit/9e668bb45117c811c0264402abf79e216f530bf5))
- Use a static license badge ([0e440d2](https://github.com/meatcar/redraft/commit/0e440d20945d3b079d04709a50d85b633aefabd4))
- *(agents)* Revisit README and topics after significant changes ([97fad82](https://github.com/meatcar/redraft/commit/97fad82d448633c193d816b37523b3e15dc61584))

### ⚙️ Maintenance

- Serve every release on GitHub Pages ([a2d6529](https://github.com/meatcar/redraft/commit/a2d652971725dc06e870d224d32cbf4560c0744d))
- Point shadcn at the base-vega registry ([de80bc0](https://github.com/meatcar/redraft/commit/de80bc0a607ef9cc980ffad533a29af278284448))

## [0.1.0](https://github.com/meatcar/redraft/commits/v0.1.0) - 2026-10-16

### 🚀 Features

- Selection rewrite UI with context-folder retrieval ([c033d2f](https://github.com/meatcar/redraft/commit/c033d2f57fd919480d2b341c154cc7cbe6b3b96d))
- Discover models from the endpoint with a UI-supplied key ([cfbd68f](https://github.com/meatcar/redraft/commit/cfbd68f2b2765324de9fc593d949c602452173d7))
- Suggest only when the selection is released ([a73b2ec](https://github.com/meatcar/redraft/commit/a73b2ec6d73e12d358f7972083fc530bc7f9fc25))
- Contentless SQLite FTS5 context index synced from disk ([afefd98](https://github.com/meatcar/redraft/commit/afefd9849f4cfd505ec3ec12bbacd8033685ef03))
- Suggest on Ctrl/Cmd+Space or the panel button instead of on selection ([0761cb7](https://github.com/meatcar/redraft/commit/0761cb7c7a6e832c4ef2a248fceeaca41bc9b9e8))
- *(suggest)* Send only selection and steering; expose document tools ([166f82d](https://github.com/meatcar/redraft/commit/166f82d5b755cee25ec8d7839c76846f9be0b690))
- *(editor)* Optional vim mode toggle ([60bd008](https://github.com/meatcar/redraft/commit/60bd008f3111f4cc60a0f05ae9eb0a7b9eeca759))
- [**breaking**] Run suggestions and the context index in the browser ([dd4bede](https://github.com/meatcar/redraft/commit/dd4bede48d6a5b6f4b471ebae1b1d9ec079f919e))
- *(settings)* Choose OpenAI, OpenRouter, or a custom endpoint, with a key per endpoint ([f77d8eb](https://github.com/meatcar/redraft/commit/f77d8eba10ee19ed1cf46c5c6163361c30bfa911))

### 🐛 Bug Fixes

- *(editor)* Keep selection highlight inside the text column ([19411a6](https://github.com/meatcar/redraft/commit/19411a6ff2f928240748bbbce1427a469049797e))
- *(shortcuts)* Suggest on Ctrl+Space only; Cmd+Space belongs to Spotlight ([5aad84b](https://github.com/meatcar/redraft/commit/5aad84b9d8ccefea07ede5a9eef983070242847c))
- *(editor)* Mark the suggestion target with an underline, not a fill ([76466f0](https://github.com/meatcar/redraft/commit/76466f01b5c8c6dd5bb55e13bd753a5f91a28419))

### 📚 Documentation

- Describe architecture, config, and checks ([85c82f3](https://github.com/meatcar/redraft/commit/85c82f38fda02c6687974bae11f50afccdbd62d7))

### ⚙️ Maintenance

- Init from meatcar/nix-templates flake-modules and sandbox ([56166fd](https://github.com/meatcar/redraft/commit/56166fdc9b3d2497062633319e94d9a559e40107))
- License under Apache-2.0 ([4bd20d2](https://github.com/meatcar/redraft/commit/4bd20d205cd8660a05fc06783a84270dd6b65703))
- *(sandbox)* Configure orb setup, devshell, and web service ([0de0660](https://github.com/meatcar/redraft/commit/0de06607a11226a4af4818af778ad00a47fd2286))
- *(editor)* Quarter-em margin around full-line selections ([e37d5a4](https://github.com/meatcar/redraft/commit/e37d5a4c139f9aebe9fcf6cadb3026f6f7cbba3b))
- Ship a single attested HTML file on tagged releases ([9baa3e7](https://github.com/meatcar/redraft/commit/9baa3e79f2d092ae26e2492dfe421fa2fb9d39a6))

