# Prakiva reusable control-editor refactor

This is a focused structural refactor of the uploaded project snapshot. It does not intentionally change the editor UI, control policy behaviour, persistence keys, payload schema, or dashboard behaviour.

## What changed

The active workspace previously rendered `pages/InlineChannelEditor.tsx`. That file contained the UI for manual control, curve policies, threshold rules, and periodic pulse in one component.

It is now located under:

```text
components/
  control-editors/
    InlineChannelEditor.tsx   # policy dispatcher used by ControlEditorPage
    ManualControl.tsx         # reusable manual binary surface
    CurvePolicyEditor.tsx     # reusable analogue/binary curve surface
    ThresholdRules.tsx        # reusable sensor-threshold surface
    PeriodicPulse.tsx         # reusable periodic activation surface
    types.ts                  # shared component contract
    index.ts                  # public exports
```

`config/editor-registry.ts` now maps each `ControlPolicy` to the corresponding reusable component. `ControlEditorPage.tsx` imports the dispatcher from `components/control-editors`.

## Files to replace

- `pages/ControlEditorPage.tsx`
- `config/editor-registry.ts`

## Files to add

Copy the complete `components/control-editors/` folder into `src/components/`.

## Files to delete

These were standalone page implementations, not used by the current routed workspace. The active workspace was using `InlineChannelEditor`, and the old registry was the only remaining reference to the page implementations. The registry now points to the reusable components.

- `pages/InlineChannelEditor.tsx`
- `pages/ManualControl.tsx`
- `pages/ManualControl.css`
- `pages/PeriodicPulse.tsx`
- `pages/ThresholdRules.tsx`
- `pages/CurvePolicyEditor.tsx`

Delete these only after copying the new files and replacing the two existing files above.

## Validation

- TypeScript TS/TSX syntax transpilation: 33 files checked, zero syntax diagnostics.
- Relative import resolution: no missing relative imports.
- A full dependency-aware `tsc --noEmit` / application build was not run because the uploaded project snapshot does not contain `package.json`, lockfile, or TypeScript/build configuration.

## Scope deliberately excluded

No UI wording, styling, navigation, profile handling, local-storage key, or control payload changes are included. The separate UI text cleanup can be done after this refactor has been validated in the working app.
