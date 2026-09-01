/**
 * 文件主要作用：提供可按变量名前缀筛选的 Blockly 下拉字段。
 * 包含实现：`SearchableVariableDropdown`、`filterVariableNamesByPrefix`。
 */

import * as Blockly from 'blockly';

export interface VariableSearchLabels {
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly noMatches: string;
}

export function filterVariableNamesByPrefix(
  variableNames: readonly string[],
  prefix: string,
): string[] {
  const normalizedPrefix = prefix.toLowerCase();
  return variableNames.filter((variableName) =>
    variableName.toLowerCase().startsWith(normalizedPrefix),
  );
}

type SearchableOption = {
  readonly label: string;
  readonly value: string;
};

let nextVariableSearchListId = 1;

function searchableOptions(
  options: readonly Blockly.MenuOption[],
): SearchableOption[] {
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
 * Blockly's built-in dropdown has no text search. This field keeps the normal
 * FieldDropdown value contract while rendering a small, local search surface.
 * Search text never becomes a project value; only an exact option can be
 * selected.
 */
export class SearchableVariableDropdown extends Blockly.FieldDropdown {
  private searchLabels: VariableSearchLabels;

  constructor(
    menuGenerator: Blockly.MenuGenerator,
    searchLabels: VariableSearchLabels,
  ) {
    super(menuGenerator);
    this.searchLabels = searchLabels;
  }

  setSearchLabels(searchLabels: VariableSearchLabels): void {
    this.searchLabels = searchLabels;
  }

  protected override showEditor_(): void {
    Blockly.DropDownDiv.hideWithoutAnimation();
    Blockly.DropDownDiv.clearContent();

    const shell = document.createElement('div');
    shell.className = 'vn-blockly-variable-search';

    const search = document.createElement('input');
    search.className = 'vn-blockly-variable-search-input';
    search.type = 'search';
    search.role = 'searchbox';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.placeholder = this.searchLabels.placeholder;
    search.setAttribute('aria-label', this.searchLabels.ariaLabel);

    const optionList = document.createElement('div');
    optionList.className = 'vn-blockly-variable-search-options';
    optionList.id = `vn-blockly-variable-search-list-${nextVariableSearchListId}`;
    nextVariableSearchListId += 1;
    optionList.role = 'listbox';
    optionList.setAttribute('aria-label', this.searchLabels.ariaLabel);

    const empty = document.createElement('div');
    empty.className = 'vn-blockly-variable-search-empty';
    empty.role = 'status';
    empty.setAttribute('aria-live', 'polite');
    empty.setAttribute('aria-atomic', 'true');
    empty.textContent = this.searchLabels.noMatches;
    empty.hidden = true;

    const optionButtons = searchableOptions(this.getOptions(false)).map(
      ({ label, value }) => {
        const button = document.createElement('button');
        button.className = 'vn-blockly-variable-search-option';
        button.type = 'button';
        button.role = 'option';
        button.dataset.variableName = value;
        button.textContent = label;
        button.title = label;
        button.disabled = value === '';
        button.setAttribute(
          'aria-selected',
          String(value !== '' && value === String(this.getValue() ?? '')),
        );
        button.addEventListener('click', () => {
          if (value === '') {
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
      optionButtons.filter(
        (button) => !button.hidden && !button.disabled,
      );

    const focusRelativeOption = (
      current: HTMLButtonElement,
      offset: number,
    ): void => {
      const visible = visibleSelectableButtons();
      const currentIndex = visible.indexOf(current);
      if (currentIndex < 0 || visible.length === 0) {
        return;
      }
      const nextIndex =
        (currentIndex + offset + visible.length) % visible.length;
      visible[nextIndex]?.focus();
    };

    const applyFilter = (): void => {
      const matchingValues = new Set(
        filterVariableNamesByPrefix(
          optionButtons
            .map((button) => button.dataset.variableName ?? '')
            .filter((value) => value !== ''),
          search.value,
        ),
      );
      for (const button of optionButtons) {
        const value = button.dataset.variableName ?? '';
        const visible = search.value === '' && value === '' ||
          value !== '' && matchingValues.has(value);
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
