// ============================================================================
// BlockDirection
//
// Declares per-block writing direction as the `dir` and `dirLocked`
// attributes, so right-to-left documents survive a round trip.
//
// Why this exists when Tiptap already has a TextDirection extension:
//
//   1. Core's TextDirection is added to every editor automatically, but with
//      `direction: undefined` its addGlobalAttributes() returns an empty
//      array — it declares no attributes at all. ProseMirror drops any
//      attribute its schema does not declare, so out of the box `dir="rtl"`
//      is silently discarded on load. Verified: loading `<p dir="rtl">…</p>`
//      and reading it back yields a paragraph with no dir, in both JSON and
//      HTML.
//   2. Core's version cannot be configured from the port side. Its only
//      option, `direction`, is not among the keys `coreExtensionOptions`
//      accepts (clipboardTextSerializer, tabindex, delete), and supplying a
//      second instance under the same name produces a duplicate-extension
//      warning.
//   3. Core's version has no `dirLocked`. Documents authored by Tiptap-based
//      web clients carry it, and it would be dropped for the same reason.
//
// So this extension takes a different name and different command names, and
// core's inert instance is left alone rather than fought with.
//
// Scope: declare, parse, render, and set the attributes. This deliberately
// does NOT infer direction from text content. `dirLocked` is carried through
// verbatim as the authoring client's signal that the direction was chosen
// explicitly and should not be re-detected; this engine has no auto-detection
// to suppress, so it is round-tripped rather than acted on.
// ============================================================================

import { Extension } from "@tiptap/core";

/**
 * A writing direction value, or null when the block inherits its parent's.
 *
 * `auto` is deliberately absent. HTML accepts it, but resolving it requires
 * measuring the text's first strong directional character, and a headless
 * engine that renders no pixels cannot hand a port anything useful for it.
 * An incoming `auto` is normalized to null — inherit — rather than being
 * carried as a value no renderer can act on.
 */
export type BlockDirectionValue = "ltr" | "rtl" | null;

export interface BlockDirectionOptions {
  /**
   * Node types that gain the `dir` and `dirLocked` attributes.
   *
   * Block-level types only: direction is a block property, and putting it on
   * inline nodes would emit attributes no renderer reads.
   */
  types: string[];

  /**
   * Direction applied to a node that carries none.
   *
   * Left as null by default so an absent attribute stays absent through a
   * round trip, instead of stamping an explicit direction onto every node of
   * a document that never had one. Set it to "rtl" for a right-to-left-first
   * document set.
   */
  defaultDirection: BlockDirectionValue;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockDirection: {
      /** Set the writing direction on every configured node in the selection. */
      setBlockDirection: (direction: BlockDirectionValue) => ReturnType;
      /** Clear direction and lock, letting the block inherit again. */
      unsetBlockDirection: () => ReturnType;
      /** Set or clear the `dirLocked` flag on the selection. */
      setBlockDirectionLocked: (locked: boolean) => ReturnType;
    };
  }
}

/** Attribute name as it appears in both HTML and the document JSON. */
const DIR_ATTR = "dir";

/**
 * `dirLocked` is not an HTML attribute, so it round-trips through HTML as a
 * data attribute. In JSON — the format this engine actually exchanges with
 * its ports — it is carried as the plain `dirLocked` key.
 */
const DIR_LOCKED_DATA_ATTR = "data-dir-locked";

/**
 * Normalize an untrusted `dir` value from parsed HTML or JSON.
 *
 * Anything outside ltr/rtl becomes null, so a malformed or `auto`-directed
 * document degrades to "inherit" rather than failing to load.
 */
function normalizeDirection(value: unknown): BlockDirectionValue {
  if (typeof value !== "string") return null;
  const lowered = value.toLowerCase();
  return lowered === "ltr" || lowered === "rtl" ? lowered : null;
}

export const BlockDirection = Extension.create<BlockDirectionOptions>({
  name: "blockDirection",

  addOptions() {
    return {
      types: [],
      defaultDirection: null,
    };
  },

  addGlobalAttributes() {
    if (this.options.types.length === 0) {
      return [];
    }

    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: this.options.defaultDirection,
            parseHTML: (element) =>
              normalizeDirection(element.getAttribute(DIR_ATTR)) ??
              this.options.defaultDirection,
            renderHTML: (attributes) => {
              const dir = normalizeDirection(attributes.dir);
              return dir ? { [DIR_ATTR]: dir } : {};
            },
          },

          dirLocked: {
            default: false,
            parseHTML: (element) =>
              element.getAttribute(DIR_LOCKED_DATA_ATTR) === "true",
            renderHTML: (attributes) =>
              attributes.dirLocked ? { [DIR_LOCKED_DATA_ATTR]: "true" } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBlockDirection:
        (direction) =>
        ({ commands }) => {
          const normalized = normalizeDirection(direction);
          /**
           * updateAttributes only affects node types present in the
           * selection, so this reports success when at least one applied.
           * Requiring every configured type to match would fail on every
           * ordinary selection, since a selection is rarely inside all of
           * them at once.
           */
          return this.options.types
            .map((type) => commands.updateAttributes(type, { dir: normalized }))
            .some(Boolean);
        },

      unsetBlockDirection:
        () =>
        ({ commands }) =>
          this.options.types
            .map((type) => commands.resetAttributes(type, ["dir", "dirLocked"]))
            .some(Boolean),

      setBlockDirectionLocked:
        (locked) =>
        ({ commands }) =>
          this.options.types
            .map((type) => commands.updateAttributes(type, { dirLocked: locked }))
            .some(Boolean),
    };
  },
});

export default BlockDirection;
