"use client";

import React from "react";

const className = `icon`;

const css = `
.${className} {
  transform-style: preserve-3d;
  perspective: 1000px;
}

.${className} .back {
  clip-path: circle(50% at center);
}

.${className}:not(:hover) {
  transform: none !important;
}

.${className}:hover .back {
  filter: drop-shadow(rgb(0, 0, 0) 1px 1px 1px);
}

.${className}:hover .middle {
  filter: drop-shadow(rgb(0, 0, 0) 1px 1px 1px);
  transform: translateZ(10px);
}

.${className}:hover .front {
  filter: drop-shadow(rgb(0, 0, 0) 1px 1px 1px);
  transform: translateZ(20px);
}
`;

let refCount = 0;
let mounted: HTMLStyleElement | null = null;

export function useStyles() {
  React.useLayoutEffect(() => {
    refCount += 1;
    if (refCount === 1) {
      mounted = document.createElement("style");
      mounted.textContent = css;

      const type = document.createAttribute("type");
      type.value = "text/css";
      mounted.attributes.setNamedItem(type);

      document.head.appendChild(mounted);
    }

    return () => {
      refCount -= 1;
      if (refCount === 0 && mounted) {
        document.head.removeChild(mounted);
        mounted = null;
      }
    };
  }, []);

  return {
    icon: className,
    iconBack: `${className} back`,
    iconMiddle: `${className} middle`,
    iconFront: `${className} front`,
  };
}
