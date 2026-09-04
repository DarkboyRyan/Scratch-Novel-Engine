/**
 * 文件主要作用：提供按资源名前缀搜索的 Blockly 资源下拉字段。
 * 包含实现：`AssetNameField`、`setAssetNameFieldCatalog`、`filterAssetOptionsByPrefix`。
 */

import * as Blockly from 'blockly';

import type { AssetDocument } from '../../../../shared/projectTypes';
import type { EditorLabels } from '../../../i18n/editorLocalization';

// Keep asset-backed blocks compact while retaining the complete display name
// in the dropdown option. Blockly applies the ellipsis only to rendered text.
export const ASSET_NAME_MAX_DISPLAY_LENGTH = 18;

export function limitAssetFieldDisplay(field: Blockly.Field): void {
  field.maxDisplayLength = ASSET_NAME_MAX_DISPLAY_LENGTH;
}

type AssetSearchLabels = {
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly noMatches: string;
};

export type SearchableAssetOption = {
  readonly label: string;
  readonly value: string;
};

let currentAssets: readonly AssetDocument[] = [];
let currentSearchLabels: AssetSearchLabels = {
  placeholder: 'Search resources',
  ariaLabel: 'Search imported resources',
  noMatches: 'No matching resources',
};
let nextAssetSearchListId = 1;

export function setAssetNameFieldCatalog(
  assets: readonly AssetDocument[],
  labels: EditorLabels,
): void {
  currentAssets = assets;
  currentSearchLabels = {
    // These existing labels stay neutral in both supported languages. Search
    // text is transient and only an exact resource option can be committed.
    placeholder: labels.resource.importedAssets,
    ariaLabel: labels.resource.importedAssets,
    noMatches: labels.resource.empty,
  };
}

export function filterAssetOptionsByPrefix(
  options: readonly SearchableAssetOption[],
  prefix: string,
): SearchableAssetOption[] {
  const normalizedPrefix = prefix.trim().normalize('NFKC').toLowerCase();
  return options.filter((option) =>
    option.label.normalize('NFKC').toLowerCase().startsWith(normalizedPrefix),
  );
}

export function ensureAssetNameField(
  block: Blockly.Block,
  fieldName: string,
  emptyLabel: string,
  assetType: AssetDocument['type'],
  selectedAssetId: string | null,
  selectedDisplayName = '',
  allowEmpty = true,
): AssetNameField | null {
  const existingField = block.getField(fieldName);
  if (existingField instanceof AssetNameField) {
    const preservedDisplayName = existingField.hasAssetType()
      ? selectedDisplayName || existingField.getText()
      : existingField.getText() || selectedDisplayName;
    // A block definition that survived Renderer HMR can still instantiate
    // this class through the legacy one-argument constructor. Upgrade that
    // field in place so its SVG/focus identity remains stable while it starts
    // reading the correctly typed catalog.
    existingField.setAssetType(assetType);
    existingField.setEmptyLabel(emptyLabel);
    existingField.setAssetValue(selectedAssetId, preservedDisplayName);
    return existingField;
  }
  if (existingField === null) {
    return null;
  }

  const input = existingField.getParentInput();
  const fieldIndex = input.fieldRow.indexOf(existingField);
  // A pre-dropdown text field can still contain the last real imported name.
  // Keep that useful HMR draft on its first conversion; future localization
  // passes operate on the typed AssetNameField branch above.
  const preservedDisplayName = existingField.getText() || selectedDisplayName;
  input.removeField(fieldName);
  const assetField = new AssetNameField(emptyLabel, assetType, allowEmpty);
  input.insertFieldAt(Math.max(0, fieldIndex), assetField, fieldName);
  assetField.setAssetValue(selectedAssetId, preservedDisplayName);
  return assetField;
}

function catalogOptions(
  assetType: AssetDocument['type'],
): Blockly.MenuOption[] {
  return currentAssets
    .filter((asset) => asset.type === assetType)
    .map((asset) => [asset.displayName, asset.id] as Blockly.MenuOption);
}

function searchableOptions(
  options: readonly Blockly.MenuOption[],
): SearchableAssetOption[] {
  return options.flatMap((option) => {
    if (option === Blockly.FieldDropdown.SEPARATOR) {
      return [];
    }
    const [label, value] = option;
    if (typeof label === 'string') {
      return [{ label, value }];
    }
    if (label instanceof HTMLElement) {
      return [{
        label: label.getAttribute('aria-label') ??
          label.title ??
          label.textContent ??
          value,
        value,
      }];
    }
    return [{ label: label.alt, value }];
  });
}

/**
 * Asset IDs are field values and imported names are labels only. This keeps a
 * stable identity when names are long or later become editable. The one-arg
 * constructor remains valid for stale/HMR block compatibility.
 */
export class AssetNameField extends Blockly.FieldDropdown {
  private assetType: AssetDocument['type'] | null;
  private emptyLabel: string;
  private readonly allowEmpty: boolean;
  private searchLabels: AssetSearchLabels;

  constructor(
    emptyLabel: string,
    assetType: AssetDocument['type'] | null = null,
    allowEmpty = true,
  ) {
    super([[emptyLabel, '']]);
    this.assetType = assetType;
    this.emptyLabel = emptyLabel;
    this.allowEmpty = allowEmpty;
    this.searchLabels = currentSearchLabels;
    limitAssetFieldDisplay(this);
    this.refreshOptions(null);
    this.setTooltip(() => this.getText());
  }

  setEmptyLabel(emptyLabel: string): void {
    const selectedAssetId = this.getAssetId();
    const selectedDisplayName = this.getText();
    this.emptyLabel = emptyLabel;
    this.searchLabels = currentSearchLabels;
    this.refreshOptions(selectedAssetId, selectedDisplayName);
  }

  setAssetType(assetType: AssetDocument['type']): void {
    this.assetType = assetType;
  }

  hasAssetType(): boolean {
    return this.assetType !== null;
  }

  setAssetValue(assetId: string | null, displayName = ''): void {
    this.refreshOptions(assetId, displayName);
  }

  getAssetId(): string | null {
    const value = String(this.getValue() ?? '');
    return value === '' ? null : value;
  }

  private refreshOptions(
    selectedAssetId: string | null,
    selectedDisplayName = '',
  ): void {
    const options = this.assetType === null
      ? []
      : catalogOptions(this.assetType);
    const selectedIsListed =
      selectedAssetId === null ||
      options.some((option) => option[1] === selectedAssetId);
    const nextOptions: Blockly.MenuOption[] = [
      [this.emptyLabel, ''],
      ...options,
      ...(!selectedIsListed && selectedAssetId !== null
        ? [[selectedDisplayName || selectedAssetId, selectedAssetId] as Blockly.MenuOption]
        : []),
    ];
    this.setOptions(() => nextOptions);
    this.setValue(selectedAssetId ?? '');
  }

  protected override showEditor_(): void {
    Blockly.DropDownDiv.hideWithoutAnimation();
    Blockly.DropDownDiv.clearContent();

    const shell = document.createElement('div');
    shell.className = 'vn-blockly-variable-search vn-blockly-asset-search';

    const search = document.createElement('input');
    search.className =
      'vn-blockly-variable-search-input vn-blockly-asset-search-input';
    search.type = 'search';
    search.role = 'searchbox';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.placeholder = this.searchLabels.placeholder;
    search.setAttribute('aria-label', this.searchLabels.ariaLabel);

    const optionList = document.createElement('div');
    optionList.className =
      'vn-blockly-variable-search-options vn-blockly-asset-search-options';
    optionList.id = `vn-blockly-asset-search-list-${nextAssetSearchListId}`;
    nextAssetSearchListId += 1;
    optionList.role = 'listbox';
    optionList.setAttribute('aria-label', this.searchLabels.ariaLabel);

    const empty = document.createElement('div');
    empty.className =
      'vn-blockly-variable-search-empty vn-blockly-asset-search-empty';
    empty.role = 'status';
    empty.setAttribute('aria-live', 'polite');
    empty.setAttribute('aria-atomic', 'true');
    empty.textContent = this.searchLabels.noMatches;
    empty.hidden = true;

    const optionButtons = searchableOptions(this.getOptions(false)).map(
      ({ label, value }) => {
        const button = document.createElement('button');
        button.className =
          'vn-blockly-variable-search-option vn-blockly-asset-search-option';
        button.type = 'button';
        button.role = 'option';
        button.dataset.assetId = value;
        button.dataset.assetName = label;
        button.textContent = label;
        button.title = label;
        button.disabled = value === '' && !this.allowEmpty;
        button.setAttribute(
          'aria-selected',
          String(value === String(this.getValue() ?? '')),
        );
        button.addEventListener('click', () => {
          if (button.disabled) {
            return;
          }
          this.setValue(value);
          Blockly.DropDownDiv.hideIfOwner(this);
        });
        optionList.append(button);
        return button;
      },
    );

    const visibleSelectableButtons = (): HTMLButtonElement[] =>
      optionButtons.filter((button) => !button.hidden && !button.disabled);

    const focusRelativeOption = (
      current: HTMLButtonElement,
      offset: number,
    ): void => {
      const visible = visibleSelectableButtons();
      const currentIndex = visible.indexOf(current);
      if (currentIndex < 0 || visible.length === 0) {
        return;
      }
      visible[
        (currentIndex + offset + visible.length) % visible.length
      ]?.focus();
    };

    const applyFilter = (): void => {
      const candidates = optionButtons
        .filter((button) => (button.dataset.assetId ?? '') !== '')
        .map((button) => ({
          label: button.dataset.assetName ?? '',
          value: button.dataset.assetId ?? '',
        }));
      const matchingIds = new Set(
        filterAssetOptionsByPrefix(candidates, search.value).map(
          (option) => option.value,
        ),
      );
      for (const button of optionButtons) {
        const value = button.dataset.assetId ?? '';
        const visible =
          (search.value === '' && value === '') ||
          (value !== '' && matchingIds.has(value));
        button.hidden = !visible;
        button.setAttribute('aria-hidden', String(!visible));
      }
      empty.hidden = optionButtons.some((button) => !button.hidden);
    };

    for (const button of optionButtons) {
      button.addEventListener('keydown', (event) => {
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault();
            focusRelativeOption(button, 1);
            break;
          case 'ArrowUp':
            event.preventDefault();
            focusRelativeOption(button, -1);
            break;
          case 'Home':
            event.preventDefault();
            visibleSelectableButtons()[0]?.focus();
            break;
          case 'End':
            event.preventDefault();
            visibleSelectableButtons().at(-1)?.focus();
            break;
          case 'Escape':
            event.preventDefault();
            Blockly.DropDownDiv.hideIfOwner(this);
            break;
        }
      });
    }

    search.addEventListener('input', applyFilter);
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        Blockly.DropDownDiv.hideIfOwner(this);
        return;
      }
      const visible = visibleSelectableButtons();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        visible[0]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        visible.at(-1)?.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        visible[0]?.click();
      }
    });

    shell.append(search, optionList, empty);
    Blockly.DropDownDiv.getContentDiv().append(shell);
    Blockly.DropDownDiv.setColour('#ffffff', '#cbd5e1');
    const clickTarget = this.getClickTarget_();
    clickTarget?.setAttribute('aria-expanded', 'true');
    clickTarget?.setAttribute('aria-controls', optionList.id);
    Blockly.DropDownDiv.showPositionedByField(this, () => {
      clickTarget?.setAttribute('aria-expanded', 'false');
      clickTarget?.removeAttribute('aria-controls');
    });
    queueMicrotask(() => {
      if (Blockly.DropDownDiv.getOwner() === this) {
        search.focus();
      }
    });
  }
}
