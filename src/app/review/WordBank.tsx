// Tapping a line back together.
//
// The bank is two rows: the line you are building, and the tiles left to build
// it from. A tile moves between them rather than being copied, so the pieces
// you have not used are always exactly the pieces still on offer — there is no
// state where the screen and the answer disagree.

export interface WordBankProps {
  /** Every tile offered, in their shuffled order. */
  tiles: string[]
  /** Indices into `tiles`, in the order they were placed. */
  placed: number[]
  /** Locked once the answer has been checked. */
  disabled: boolean
  onPlace: (index: number) => void
  onRemove: (position: number) => void
}

export function WordBank({ tiles, placed, disabled, onPlace, onRemove }: WordBankProps) {
  const used = new Set(placed)

  return (
    <div class="bank">
      <div class={`bank-line ${placed.length ? '' : 'empty'}`}>
        {placed.length === 0 ? (
          <span class="bank-placeholder">Tap the words in order</span>
        ) : (
          placed.map((tile, position) => (
            <button
              key={`${tile}-${position}`}
              type="button"
              class="tile placed"
              disabled={disabled}
              onClick={() => onRemove(position)}
              aria-label={`Remove ${tiles[tile]}`}
            >
              {tiles[tile]}
            </button>
          ))
        )}
      </div>

      <div class="bank-tiles">
        {tiles.map((tile, index) => (
          <button
            key={`${tile}-${index}`}
            type="button"
            // Kept in the layout rather than removed: tiles reflowing on every
            // tap makes the remaining ones a moving target.
            class={`tile ${used.has(index) ? 'spent' : ''}`}
            disabled={disabled || used.has(index)}
            onClick={() => onPlace(index)}
          >
            {tile}
          </button>
        ))}
      </div>
    </div>
  )
}
