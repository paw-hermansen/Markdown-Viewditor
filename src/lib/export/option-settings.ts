/**
 * The link between an export-dialog option and the setting that remembers
 * its last value.
 *
 * This used to be two parallel `switch` statements in `+page.svelte` — one
 * to read a value into the dialog, one to persist what came back — over the
 * same option ids. Adding an option meant editing both, and a miss was
 * silent: HTML Bundle's frontmatter toggle was shown in the dialog but
 * neither read from nor written to settings, so it reset on every export
 * while HTML, PDF and ODT remembered theirs.
 *
 * Now one entry per option id. `option-settings.test.ts` asserts that every
 * option every registered exporter declares has an entry here, and that no
 * entry has gone stale.
 */
import type { Settings } from "$lib/types";
import { settingsState, updateSetting } from "$lib/stores/settings.svelte";
import {
  OPTION_ODT_INCLUDE_FRONTMATTER,
  OPTION_RASTERIZE_MATH,
  OPTION_RASTER_RESOLUTION,
  OPTION_RASTERIZE_SVG,
} from "./exporters/odt";
import { OPTION_ID as HTML_OPTION_ID } from "./exporters/html";
import { OPTION_ID as HTML_BUNDLE_OPTION_ID } from "./exporters/html-bundle";
import { PDF_OPTION_ID } from "./exporters/pdf";

export interface OptionSetting {
  /** The remembered value, or the option's declared default when unset. */
  get: () => unknown;
  /** Validate and remember a value chosen in the export dialog. */
  set: (value: unknown) => void;
}

type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

function booleanSetting(key: BooleanSettingKey): OptionSetting {
  return {
    get: () => settingsState[key],
    set: (value) => updateSetting(key, !!value),
  };
}

const RESOLUTION_VALUES = [1, 2, 3, 4] as const;

export const OPTION_SETTING: Record<string, OptionSetting> = {
  [OPTION_RASTERIZE_MATH]: booleanSetting("odtRasterizeMath"),
  [OPTION_RASTERIZE_SVG]: booleanSetting("odtRasterizeSvg"),
  [OPTION_RASTER_RESOLUTION]: {
    get: () => settingsState.odtRasterResolution,
    set: (value) => {
      // Only the documented multipliers; anything else keeps the old value
      // rather than persisting a resolution the rasterizer can't use.
      if (
        RESOLUTION_VALUES.includes(value as (typeof RESOLUTION_VALUES)[number])
      ) {
        updateSetting("odtRasterResolution", value as 1 | 2 | 3 | 4);
      }
    },
  },
  [OPTION_ODT_INCLUDE_FRONTMATTER]: booleanSetting("odtIncludeFrontmatter"),
  [HTML_OPTION_ID]: booleanSetting("htmlIncludeFrontmatter"),
  [HTML_BUNDLE_OPTION_ID]: booleanSetting("htmlBundleIncludeFrontmatter"),
  [PDF_OPTION_ID]: booleanSetting("pdfIncludeFrontmatter"),
};
