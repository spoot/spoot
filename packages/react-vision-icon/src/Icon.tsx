"use client";

import React from "react";
import { Rx } from "@spoot/rx";
import { cn } from "@spoot/cn";
import { useStyles } from "./stylesHook";

interface Props {
  frontUrl: string;
  middleUrl: string;
  backUrl: string;
}

export const VisionOsIcon: React.FC<Props> = (props) => {
  const styles = useStyles();

  const containerRef = React.useRef<HTMLDivElement>(null);

  const layers = React.useMemo(
    () => [
      {
        name: "front",
        src: props.frontUrl,
        ref: React.createRef<HTMLDivElement>(),
      },
      {
        name: "middle",
        src: props.middleUrl,
        ref: React.createRef<HTMLDivElement>(),
      },
      {
        name: "back",
        src: props.backUrl,
        ref: React.createRef<HTMLDivElement>(),
      },
    ],
    [props.frontUrl, props.middleUrl, props.backUrl],
  );

  const transform$ = React.useMemo(
    () => new Rx.Subject<[HTMLDivElement, number, number]>(),
    [],
  );
  React.useEffect(() => {
    const sub = transform$
      .pipe(Rx.auditTime(0, Rx.animationFrameScheduler))
      .subscribe(([container, x, y]) => {
        const box = container.getBoundingClientRect();
        const calcX = -(y - box.y - box.height / 2) / 4;
        const calcY = (x - box.x - box.width / 2) / 4;

        container.style.transform = `rotateX(${calcX}deg) rotateY(${calcY}deg)`;
      });

    return () => {
      sub.unsubscribe();
    };
  }, [transform$]);

  const mouseMove = React.useCallback<React.MouseEventHandler<HTMLDivElement>>(
    (e) => {
      if (containerRef.current) {
        transform$.next([containerRef.current, e.clientX, e.clientY]);
      }
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      onMouseMove={mouseMove}
      className={cn("relative aspect-square w-full", styles.icon)}
    >
      {[...layers].reverse().map((layer) => (
        <div
          className={cn(
            "absolute h-full w-full",
            layer.name == "front"
              ? styles.iconFront
              : layer.name == "middle"
                ? styles.iconMiddle
                : styles.iconBack,
          )}
          key={`layer-${layer.name}`}
          ref={layer.ref}
          style={{
            background: `url(${layer.src}) no-repeat center/contain`,
          }}
        />
      ))}
    </div>
  );
};
