---
"@critical-path/core": patch
---

Support zod 4 (≥ 4.6.6, which fixes GHSA-mrhx-c7xc-m3w5) alongside zod 3: the `zod` dependency is now `^3.25.76 || ^4.6.6`, single-argument `z.record()` calls name their string keys, and the `clearable()` update-field type is derived from its implementation instead of zod 3's `ZodEffects`. Runtime behaviour on zod 3 is unchanged.
