# @spoot/react-vision-icon

Animated Apple Vision Pro-style icon component for React. Icons respond to hover/focus with a reactive highlight effect powered by RxJS mouse tracking.

## Install

```sh
npm install @spoot/react-vision-icon
```

Requires `react` as a peer dependency.

## Usage

```tsx
import { Icon } from "@spoot/react-vision-icon";

export function MyButton() {
  return (
    <button>
      <Icon src="/icons/star.png" size={48} />
      Favorite
    </button>
  );
}
```

The icon automatically tracks the cursor position within its bounds and applies a radial highlight to simulate the lighting from visionOS app icons.

## Development

```sh
pnpm typecheck   # type-check
pnpm build:lib   # compile to dist/
```
